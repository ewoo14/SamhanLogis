# #888 outbox 전용 TaskScheduler 분리

작성일: 2026-07-28  
범위: `services/partner-order-service`  
연관 Issue: #888

## 결론

`spring.task.scheduling.pool.size=5` 값은 유지하고, outbox만 별도
`ThreadPoolTaskScheduler`인 `outboxTaskScheduler`를 사용하도록 분리했다. 기본
`taskScheduler`는 기존 형제 스케줄러용 pool 5로 명시 구성했다. `BootstrapCacheRefreshScheduler`에는
`bootstrap_cache_refresh_duration` Timer를 추가했다.

Flyway migration, 다른 형제 scheduler 로직, `shared:realtime-abstraction` 코드는 변경하지 않았다.

## RED-first 실행 증적

### RED — 구현 전 5-sibling 재현

5개 형제 작업을 현재 기본 scheduler에 동시에 걸고, 같은 scheduler에 즉시 outbox tick을 예약하는
테스트를 먼저 추가했다. production 소스는 아직 수정하지 않은 상태에서 다음 명령을 실행했다.

```text
.\gradlew :services:partner-order-service:test --tests "*TaskScheduler*" --rerun-tasks --no-build-cache
OpenJDK 64-Bit Server VM warning: Sharing is only supported for boot loader classes because bootstrap classpath has been appended

2 tests completed, 1 failed

FAILURE: Build failed with an exception.

* What went wrong:
Execution failed for task ':services:partner-order-service:test'.
> There were failing tests. See the report at: file:///C:/dev/Samhan-Public/.claude/worktrees/888-sched/services/partner-order-service/build/reports/tests/test/index.html

BUILD FAILED in 59s
```

같은 실행이 생성한 JUnit XML의 실제 값은 다음과 같다(추정치가 아니라 실행 산출물).

```text
TEST-com.samhanair.logis.partnerorder.config.TaskSchedulerPoolSizeIT.xml:
tests="2" skipped="0" failures="1" errors="0"

failure message:
[outbox tick을 흉내낸 작업이 시간 내에 실행되지 않았다]
Expecting value to be true but was false
```

즉 Docker/Testcontainers가 skip한 false-RED가 아니라, 기존 pool 5가 5개 형제 작업으로 모두
점유된 뒤 tick이 `SIBLING_HOLD_MILLIS + 3000`ms 안에도 시작하지 못한 실제 RED였다.

### GREEN — 전용 scheduler 구현 직후 같은 테스트

다음 최소 구현을 적용했다.

- `PartnerOrderTaskSchedulerConfiguration`에 `taskScheduler`(property pool 5)와
  `outboxTaskScheduler`(pool 1)를 명명 bean으로 등록
- outbox `@Scheduled`에 `scheduler = "outboxTaskScheduler"` 지정
- 기존 cron expression 및 `@Profile("!local")` 유지

그 뒤 동일 명령을 다시 실행했고 실제 출력은 다음과 같다.

```text
.\gradlew :services:partner-order-service:test --tests "*TaskScheduler*" --rerun-tasks --no-build-cache
> Task :services:partner-order-service:test

BUILD SUCCESSFUL in 41s
15 actionable tasks: 15 executed
OpenJDK 64-Bit Server VM warning: Sharing is only supported for boot loader classes because bootstrap classpath has been appended
```

이 시점에는 기존 1-sibling과 신규 5-sibling이 함께 실행됐다. 이후 역방향 테스트를 추가해 같은
명령을 재실행했고, outbox 장기 점유가 형제 pool을 막지 않는 별도 검증도 GREEN임을 확인했다.

직접 `CRON_DISABLED` queue 검증까지 추가한 최종 targeted 재실행의 실제 원문은 다음과 같다.

```text
.\gradlew :services:partner-order-service:test --tests "*TaskScheduler*" --rerun-tasks --no-build-cache
> Task :services:partner-order-service:test

BUILD SUCCESSFUL in 46s
15 actionable tasks: 15 executed
OpenJDK 64-Bit Server VM warning: Sharing is only supported for boot loader classes because bootstrap classpath has been appended
```

최종 targeted 실행(기존 3개 + 신규 `TaskSchedulerIsolationIT` 3개 + `TaskSchedulerLocalProfileIT`
1개)의 JUnit XML 값은 `TaskSchedulerPoolSizeIT tests=3`, `TaskSchedulerIsolationIT tests=3`,
`TaskSchedulerLocalProfileIT tests=1`, 각 클래스 모두 `skipped=0 failures=0 errors=0`이었다.

## 불변식 검증

| 불변식 | 검증 방법 |
|---|---|
| I-1 | `TaskSchedulerPoolSizeIT.형제_스케줄러_5개가_전부_점유해도_outbox_tick은_750ms_이내_실행돼야_한다` — 형제 5개를 기본 pool에 고정하고 outbox 전용 pool에서 tick 실행 |
| I-2 | `TaskSchedulerPoolSizeIT.outbox_tick이_오래_점유돼도_형제_scheduler_tick은_750ms_이내_실행돼야_한다` — outbox pool을 붙잡고 기본 pool tick 지연 측정 |
| I-3 | cron 문자열·`samhan.outbox.cron` override·`@Profile("!local")` 보존. `TaskSchedulerLocalProfileIT`가 local 컨텍스트 기동 및 `SlipPublishOutboxScheduler` 컴포넌트 비활성화를 실제 확인 |
| I-4 | `AbstractPostgresIT`의 `samhan.outbox.cron=-`를 유지. `TaskSchedulerIsolationIT`가 disabled 상태에서 scheduled task가 형제 5개만 등록되고 전용 outbox executor queue가 비어 있는지 확인 |
| I-5 | `BootstrapCacheRefreshSchedulerObservabilityTest`가 실제 `SimpleMeterRegistry`의 Timer count와 total time을 확인 |

## 수단 선택 및 실증

Spring Framework 6.1.14에서 `@Scheduled(scheduler = "...")` 속성을 사용할 수 있다는 명세의 확인
자료만으로 결론 내리지 않고, 실제 코드에 적용해 `compileJava`, `compileTestJava`, Spring
application context 기동, 두 pool의 runtime 지연 테스트까지 실행했다. `TaskSchedulerIsolationIT`는
두 bean의 실제 identity와 core pool size(5/1), outbox method annotation의 scheduler 값을
확인한다.

선택한 수단은 명시적 named `ThreadPoolTaskScheduler` 두 개다. Spring의 기본 scheduler lookup
규칙을 보존하기 위해 형제 풀 이름은 `taskScheduler`로 유지하고, outbox만 annotation에서 전용
이름을 선택한다. 이 방식은 형제 5개가 늘어나도 outbox pool의 실행 가능성을 산술적으로 보장하며,
반대 방향도 풀 경계로 보장한다.

버린 대안:

- `pool.size`를 6 이상으로 올리는 안: 형제 수가 다시 늘면 여유가 사라지고 명세의 금지 사항이므로
  선택하지 않았다.
- `SchedulingConfigurer` 또는 `ScheduledAnnotationBeanPostProcessor`를 전역 커스터마이즈하는 안:
  이 저장소에 전례가 없고 모든 scheduled task의 등록 경로를 건드려 범위가 커진다. 이번 요구는
  outbox 한 메서드의 명시 scheduler 선택으로 충분하다.
- shared realtime scheduler를 제거·조건화하는 안: 다른 서비스에 파급되고 명세의 제외 범위다.
- 운영 소요 측정을 먼저 하고 구조 변경을 미루는 안: 측정값과 무관하게 형제 5/pool 5의 여유 0은
  변하지 않는다는 PM 결정에 따라 구조 변경과 관측을 함께 적용했다.

## 관측 이름

Micrometer Timer 이름은 `bootstrap_cache_refresh_duration`이다. Prometheus registry는 Timer를
`bootstrap_cache_refresh_duration_seconds_count`, `_sum`, `_max` 등 `_seconds` 시계열로 노출한다.
Timer는 성공과 예외를 포함한 `refreshBootstrapCache()` 전체 try/catch/finally 실행 시간을 기록한다.

## CI 및 문서

- `.github/workflows/ci.yml`: 기존 `TaskSchedulerPoolSizeIT` 하한을 실제 3개로 올렸고,
  `TaskSchedulerIsolationIT`(3개), `TaskSchedulerLocalProfileIT`(1개) hard gate를 추가했다.
  모든 gate는 `failures=0 errors=0 skipped=0`도 요구한다.
- `services/partner-order-service/src/main/resources/application.yml`: 기존 pool 5와 형제 산술,
  전용 pool, Timer 관측 사실에 맞게 주석을 갱신했다.
- `migration/decisions/DECISIONS.md`, root README, service README를 동기화했다.

## 최종 전체 테스트

사용자가 지정한 전체 테스트 명령도 실행했다.

```text
.\gradlew :services:partner-order-service:test
> Task :services:partner-order-service:test

BUILD SUCCESSFUL in 3m 2s
15 actionable tasks: 1 executed, 14 up-to-date
OpenJDK 64-Bit Server VM warning: Sharing is only supported for boot loader classes because bootstrap classpath has been appended
```

실행 후 `build/test-results/test/TEST-*.xml` 75개를 합산한 실제 값은 다음과 같다.

```text
tests=463 skipped=0 failures=0 errors=0
```

Docker/Testcontainers IT는 skip되지 않았다. 다만 전체 테스트 JVM 종료 시 Testcontainers PostgreSQL
종료와 Micrometer CloudWatch flush 순서가 겹쳐 Hikari connection-refused/fail-loud 로그가 발생했고,
CloudWatch enabled 테스트의 mock `CloudWatchAsyncClient.putMetricData()`가 `null`을 반환해
`NullPointerException` WARN stack trace도 출력됐다. Gradle 테스트 판정은 실패 0/에러 0이었고, 본
슬라이스의 scheduler 테스트와 무관한 기존 테스트 종료 경고이므로 조용한 출력으로 포장하지 않는다.
