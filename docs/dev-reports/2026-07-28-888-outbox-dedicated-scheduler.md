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

## 적대검증 R1 결함 fix (2026-07-28)

최초 구현이 놓친 도달 가능한 결함 2건을 실기동으로 잡아 고쳤다. 둘 다
`PartnerOrderTaskSchedulerConfiguration.java`(같은 파일) 안에서 발생했고, 새 테스트 2개를
RED-first로 추가했다(`PartnerOrderTaskSchedulerConfigurationExecutorCoexistenceTest`·
`PartnerOrderTaskSchedulerConfigurationThreadNameTest`, 둘 다 Spring 컨텍스트/Docker 없이 도는
plain JUnit 단위 테스트). 기존 7개 테스트(`TaskSchedulerPoolSizeIT` 3·`TaskSchedulerIsolationIT`
3·`TaskSchedulerLocalProfileIT` 1)는 삭제·약화 없이 그대로 유지했고, `pool.size` 값(5/1)도
변경하지 않았다.

### 결함1 — `applicationTaskExecutor` 자동구성 back-off

**원인**: `taskScheduler`/`outboxTaskScheduler`는 둘 다 `ThreadPoolTaskScheduler`라 `Executor`도
구현한다. Boot 3.3의 `TaskExecutionAutoConfiguration`(`TaskExecutorConfigurations.TaskExecutorConfiguration`)은
클래스 레벨 `@ConditionalOnMissingBean(Executor.class)`라, 이 설정 클래스가 등록되는 순간
`applicationTaskExecutor`(`taskExecutor` alias 포함)가 조용히 사라진다. slip-service의
`PartnerProductPriceMemoryAsyncConfig`(`services/slip-service/.../price/config/PartnerProductPriceMemoryAsyncConfig.java:46-83`)가
동일한 함정을 이미 겪었고 해당 처방(Boot 등가 분기 명시 복원)이 전례로 남아 있었다.

**RED** — production 코드를 건드리기 전에
`PartnerOrderTaskSchedulerConfigurationExecutorCoexistenceTest`를 추가하고 실행한 실제 원문:

```text
.\gradlew :services:partner-order-service:test --tests "*PartnerOrderTaskSchedulerConfigurationExecutorCoexistenceTest*" --tests "*PartnerOrderTaskSchedulerConfigurationThreadNameTest*" --rerun-tasks --no-build-cache
...
PartnerOrderTaskSchedulerConfigurationExecutorCoexistenceTest > 스케줄러_bean_등록이_Boot_기본_applicationTaskExecutor_자동구성을_back_off_시키면_안_된다() FAILED
    java.lang.AssertionError at PartnerOrderTaskSchedulerConfigurationExecutorCoexistenceTest.java:47
PartnerOrderTaskSchedulerConfigurationExecutorCoexistenceTest > 복원된_applicationTaskExecutor는_형제_스케줄링_풀과_별개_인스턴스여야_한다() FAILED
    org.springframework.beans.factory.NoSuchBeanDefinitionException at PartnerOrderTaskSchedulerConfigurationExecutorCoexistenceTest.java:59
...
6 tests completed, 4 failed
BUILD FAILED in 23s
```

JUnit XML 실제 값: `PartnerOrderTaskSchedulerConfigurationExecutorCoexistenceTest tests="3"
skipped="0" failures="2" errors="0"`. 실패 상세(원문): `Expecting: <Started application
[...]> to have bean named: <"applicationTaskExecutor"> but found no such bean`.

**GREEN** — fix 적용 후 같은 명령 재실행: `PartnerOrderTaskSchedulerConfigurationExecutorCoexistenceTest
tests="3" skipped="0" failures="0" errors="0"`.

**수단**: slip-service 전례를 그대로 이식 — `@ConditionalOnThreading(Threading.PLATFORM)` +
`@Lazy` + `ThreadPoolTaskExecutorBuilder` 로 `applicationTaskExecutor`/`taskExecutor` alias를,
`@ConditionalOnThreading(Threading.VIRTUAL)` + `SimpleAsyncTaskExecutorBuilder`로 virtual-thread
분기를 명시 복원했다. 둘 다 Boot 3.3.5 자신의 분기와 동등하다(`ThreadPoolTaskExecutorBuilder`/
`SimpleAsyncTaskExecutorBuilder`는 `TaskExecutorConfiguration`의 back-off 대상이 아닌 별도 nested
config에서 항상 제공되므로 주입이 끊기지 않는다).

**버린 대안**:
- `taskScheduler`/`outboxTaskScheduler`를 `TaskScheduler` 인터페이스 반환 타입으로 선언해 Boot
  조건 매칭을 피하는 안 — 이 두 bean은 실제로 `Executor`로도 계속 존재해야 하는지가 불명확해지고
  (`ThreadPoolTaskScheduler` 고유 API(`getScheduledThreadPoolExecutor()`)를 쓰는 기존 7개 테스트가
  캐스팅에 의존), slip-service에 이미 검증된 "명시 복원" 패턴이 있는데 새 패턴을 도입할 이유가
  없었다.
- `@Primary` 제거/재배치로 우회하는 안 — `@Async`의 실행기 탐색은 `@Primary`가 아니라 `TaskExecutor`
  타입 유일성→이름("taskExecutor") 순으로 동작해(Spring `AsyncExecutionAspectSupport.getDefaultExecutor`),
  `@Primary` 조정은애초에 이 결함의 원인이 아니라 손대지 않았다.

**G-2 회귀 가드**: `복원된_applicationTaskExecutor는_형제_스케줄링_풀과_별개_인스턴스여야_한다()`가
복원된 executor가 `taskScheduler`/`outboxTaskScheduler`와 다른 인스턴스임을 고정한다 — 향후
`@Async`가 켜져도 형제 풀(5)이나 outbox 풀(1) 위에서 돌지 않는다.

### 결함2 — 스케줄러 스레드 이름이 로그 15자 필드에서 잘림

**원인**: Boot 기본 콘솔 로그 패턴의 스레드 필드는 `%15.15t`(최소/최대 폭 15). Logback 규정상
초과분은 문자열 **앞부분**에서 제거된다. 기존 접두어 `partner-order-scheduling-`·
`partner-order-outbox-`는 번호가 붙으면 각각 26자·22자가 되어 `er-scheduling-4`·
`-order-outbox-1`처럼 잘리고, 두 풀을 구분하려던 `partner-order-` 부분 자체가 사라진다.

**환원 근거**: "로그로 봤을 때 읽기 쉬운가"는 문자열을 실제로 렌더링하지 않는 한 직접 assert하기
어렵다. 대신 **Boot 기본 패턴이 단 한 글자도 자르지 않는 길이(15자 이하)로 스레드 이름 전체가
들어온다**는, truncate 발동 자체를 원천 차단하는 더 강한 성질로 환원했다 — 이름이 15자 이하이면
"초과분만 제거"라는 truncate 규칙이 아예 발동하지 않으므로, "잘려도 식별 가능"보다 엄격한
상위호환 조건이다(이 조건을 만족하면 "잘려도 식별 가능"은 공허하게 참이 된다 —애초에 안
잘리므로). 스레드 이름은 하드코드 리터럴이 아니라 `ThreadPoolTaskScheduler`가 실제 pool worker를
만들 때 호출하는 `ThreadFactory` 구현(`newThread`)으로 직접 읽어, 두 풀의 접두어가 바뀌면 테스트도
그 값을 따라간다.

**RED** — 같은 실행(위 결합 명령)의 실제 결과:

```text
PartnerOrderTaskSchedulerConfigurationThreadNameTest > outbox_풀_스레드_이름은_로그_필드_15자_이하여서_한_글자도_잘리면_안_된다() FAILED
    java.lang.AssertionError: [스레드 이름 'partner-order-outbox-1'(22자)가 Boot 기본 로그 패턴 %15.15t 필드(15자)를 넘으면 ...]
    Expecting actual: 22 to be less than or equal to: 15
PartnerOrderTaskSchedulerConfigurationThreadNameTest > 형제_풀_스레드_이름은_로그_필드_15자_이하여서_한_글자도_잘리면_안_된다() FAILED
    java.lang.AssertionError: [스레드 이름 'partner-order-scheduling-1'(26자)가 Boot 기본 로그 패턴 %15.15t 필드(15자)를 넘으면 ...]
    Expecting actual: 26 to be less than or equal to: 15
```

JUnit XML 실제 값: `PartnerOrderTaskSchedulerConfigurationThreadNameTest tests="3" skipped="0"
failures="2" errors="0"`(3번째 테스트 — 두 풀의 이름이 서로 다른지만 보는 것 — 는 fix 전에도
이미 통과했다; 두 구 접두어가 서로 다른 문자열이었기 때문이다. 이는 "서로 다르다"만으로는 이
결함을 못 잡는다는 뜻이라 "15자 이하" 쪽을 주된 성질로 택했다).

**GREEN** — fix(접두어 단축) 후 같은 명령 재실행: `PartnerOrderTaskSchedulerConfigurationThreadNameTest
tests="3" skipped="0" failures="0" errors="0"`.

**수단**: 접두어를 `scheduling-`(11자)·`outbox-`(7자)로 단축했다. 로그 라인에는 이미 서비스명이
별도 필드로 표기되므로(`[partner-order-service] [...스레드...]`) 스레드 이름 자체가
`partner-order`를 반복할 필요가 없고, 두 자리 스레드 번호(최대 99)가 붙어도 15자를 넘지 않는다.

**버린 대안**:
- `logging.pattern.console`을 오버라이드해 스레드 필드 폭을 넓히는 안 — 이 저장소 어디에도 로깅
  패턴 커스터마이즈 전례가 없고(전 서비스 grep 0건), HTTP 워커 스레드(`http-nio-*-exec-N`) 등 이
  서비스의 다른 모든 로그 라인 폭에도 영향을 줘 변경 범위가 이 결함보다 훨씬 커진다. 우리가 직접
  고르는 문자열을 줄이는 쪽이 로컬하고 가역적이다.
- 두 자리 이상 스레드 번호까지 감안하지 않고 그대로 두는 안(`partner-sched-`처럼 14자 접두어) —
  15자 경계에 딱 걸쳐 안전 여유가 1자리 숫자로 한정되므로, 여유를 더 준 현재 접두어를 택했다.

### 실기동 검증(actuator/prometheus + 실 로그 + JVM 스레드 덤프)

공유 dev docker-compose 스택(`samhan-postgres` 등)과 그 안의 `samhan-partner-order-service`
컨테이너는 다른 세션이 쓰고 있을 수 있어 건드리지 않았다. 대신 완전히 격리된 throwaway
Postgres 컨테이너(`verify-888-pg`, 포트 15432, DB `partner_order_db_verify888`, 검증 종료 후
`docker rm -f`로 제거)를 새로 띄우고, fix가 반영된 jar(`bootJar`로 재빌드)를 별도 포트(18088)로
기동해 확인한 뒤 프로세스를 종료했다. 공유 데이터에는 어떤 것도 쓰지 않았다.

`GET /actuator/prometheus` 실제 값(fix 반영 브랜치):

```text
executor_pool_core_threads{application="partner-order-service",name="applicationTaskExecutor"} 8.0
executor_pool_core_threads{application="partner-order-service",name="outboxTaskScheduler"} 1.0
executor_pool_core_threads{application="partner-order-service",name="taskScheduler"} 5.0
```

결함 보고가 인용한 fix 전 브랜치 수치(`applicationTaskExecutor`/`taskExecutor` 소실, `taskScheduler`=5,
`outboxTaskScheduler`=1만 존재)와 대조하면 `applicationTaskExecutor`(main 당시와 동일한 8 코어)가
정확히 복원됐고 나머지 두 풀 크기는 그대로임을 확인했다.

실제 부팅 로그(fix 반영 브랜치, 결함2 대조):

```text
2026-07-28T03:55:33.275+09:00  INFO 46544 --- [partner-order-service] [   scheduling-4] c.s.l.p.c.BootstrapCacheRefreshScheduler : [BootstrapCacheRefreshScheduler] bootstrap cache refresh 시작
```

fix 전 원문의 `[er-scheduling-4]`(앞부분 잘림)와 달리 `[   scheduling-4]`로 15자 필드 안에 온전히
표시된다(main 당시의 `[   scheduling-N]` 형태와 동일한 폭·정렬).

`samhan.outbox.cron`을 검증 목적으로 `*/5 * * * * *`(5초 주기)로 오버라이드해 outbox tick이 반복
실행되도록 한 뒤, 실행 중인 JVM에 `jstack`으로 스레드 덤프를 떠 실제 스레드 이름을 확인했다(이
throwaway DB에는 outbox 대상 행이 없어 tick 자체는 로그를 남기지 않는다 — `retryPending()`은
claim 대상이 0건이면 무출력이다. 대신 스레드 자체의 실존은 스레드 덤프로 확인했다):

```text
"scheduling-1" #54 prio=5 ... waiting on condition
"outbox-1" #55 prio=5 cpu=46.88ms ... waiting on condition
"scheduling-2" #56 prio=5 cpu=109.38ms ... waiting on condition
"scheduling-3" #57 prio=5 ... waiting on condition
"scheduling-4" #58 prio=5 ... waiting on condition
"scheduling-5" #59 prio=5 ... runnable
```

5개 형제 스레드(`scheduling-1`~`5`)와 outbox 전용 스레드(`outbox-1`)가 실제로 존재하고, `outbox-1`의
`cpu=46.88ms`는 5초 주기 tick이 실제로 반복 실행됐음을 보여준다(0건 claim이라 로그는 없지만
스레드는 유휴가 아니라 주기적으로 깨어나 CPU를 소모했다). `applicationTaskExecutor` 스레드는
스레드 덤프에 없다 — `@Lazy`이고 이 검증 세션에서 `@Async` 호출을 하나도 만들지 않았으므로
기대한 대로다(빈 자체는 위 prometheus 값으로 이미 존재가 확인됐다).

검증 후 `taskkill /PID <jvm-pid> /F`로 프로세스를 종료하고 `docker rm -f verify-888-pg`로
컨테이너를 제거했다. `docker ps`로 재확인해 흔적이 남지 않았음을 확인했다.

### 회귀 확인

기존 7개 테스트(`TaskSchedulerPoolSizeIT`·`TaskSchedulerIsolationIT`·`TaskSchedulerLocalProfileIT`)와
`BootstrapCacheRefreshScheduler` 관련 테스트 2개를 fix 후 재실행한 실제 값:

```text
TaskSchedulerPoolSizeIT tests="3" skipped="0" failures="0" errors="0"
TaskSchedulerIsolationIT tests="3" skipped="0" failures="0" errors="0"
TaskSchedulerLocalProfileIT tests="1" skipped="0" failures="0" errors="0"
BootstrapCacheRefreshSchedulerObservabilityTest tests="1" skipped="0" failures="0" errors="0"
BootstrapCacheRefreshSchedulerTest tests="1" skipped="0" failures="0" errors="0"
```

`:services:partner-order-service:test --rerun-tasks --no-build-cache` 전체 재실행 후
`build/test-results/test/TEST-*.xml` 77개(fix 전 75개보다 2개 많음 — 신규 테스트 클래스 2개)를
합산한 실제 값:

```text
tests=469 skipped=0 failures=0 errors=0
```

fix 전 기록값(463)과의 차이(+6)는 정확히 이번에 추가한 두 테스트 클래스(각 3개 테스트)와
일치한다 — 그 외 기존 테스트에 대한 부수 효과가 없었다.

### 변경 파일

- `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/config/PartnerOrderTaskSchedulerConfiguration.java` —
  스레드 이름 접두어 단축 + `applicationTaskExecutor`/`taskExecutor`(platform·virtual 분기) 명시 복원.
- `services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/config/PartnerOrderTaskSchedulerConfigurationExecutorCoexistenceTest.java`(신규) —
  결함1 RED-first 회귀 테스트.
- `services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/config/PartnerOrderTaskSchedulerConfigurationThreadNameTest.java`(신규) —
  결함2 RED-first 회귀 테스트.
- 본 문서 — 이 절.

`application.yml`(`pool.size` 값 미변경) · `.github/workflows/ci.yml`은 건드리지 않았다. 새 테스트
2개는 `AbstractPostgresIT`/Testcontainers를 쓰지 않는 plain JUnit 단위 테스트라 Docker 미가용
시에도 스킵되지 않으므로(스킵 가능한 것은 IT 클래스뿐), 기존 hard gate 컨벤션(`ci.yml`의
`skipped=0` 게이트는 Docker-skip 위험이 있는 IT 전용)에 새 항목을 추가할 필요가 없었다 —
`:services:partner-order-service:test` 모듈 전체 실행에 자동 포함되고 실패 시 그대로 CI red가 된다.
