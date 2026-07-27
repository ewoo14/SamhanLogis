# #888 — outbox 전용 TaskScheduler 분리 (기획)

> 작성 2026-07-28 · OPUS 기획 · 근거 SHA `5d433d8e2`
> 연관 Issue: #888 · 선행 #876(머지 완료) · #863

---

## 1. 문제 — 산술로 여유가 0이다

partner-order-service 의 `spring.task.scheduling.pool.size` 는 **5** 입니다
(`services/partner-order-service/src/main/resources/application.yml:63-66` — 소스 트리 전역에서 이 설정은 **이 1곳뿐**).

그런데 이 서비스 클래스패스의 `@Scheduled` 는 **6개**이고, outbox 를 제외한 **형제가 정확히 5개**입니다.

| # | 스케줄러 | 어노테이션 원문 | 출처 |
|---|---|---|---|
| 1 | `SlipPublishOutboxScheduler.retryPending` | `@Scheduled(cron = "${samhan.outbox.cron:0 */5 * * * *}")` | 자체 `scheduler/…:75` |
| 2 | `BootstrapCacheRefreshScheduler.refreshBootstrapCache` | `@Scheduled(fixedDelayString = "#{${app.bootstrap.cache-refresh-minutes:10} * 60000}")` | 자체 `config/…:31` |
| 3 | `DraftCleanupScheduler.cleanupExpired` | `@Scheduled(cron = "${samhan.draft.cleanup-cron:0 0 3 * * *}")` | 자체 `scheduler/…:24` |
| 4 | `PartnerOrderEditRequestService.expirePending` | `@Scheduled(fixedRate = 3_600_000L)` | 자체 `editrequest/service/…:249` |
| 5 | `InMemoryRealtimeBroker.heartbeat` | `@Scheduled(fixedRate = 30_000L)` | `shared:realtime-abstraction` `broker/…:152` |
| 6 | `PresenceService.scheduledPruneExpired` | `@Scheduled(fixedRateString = "${samhan.realtime.presence.prune-ms:30000}")` | `shared:realtime-abstraction` `presence/…:171` |

**⟹ 형제 5 vs pool 5 = 여유 0.** 형제 5개가 동시에 점유하면 outbox tick 은 **보장된 빈 스레드 없이 대기**합니다.

5·6번은 `RealtimeAutoConfiguration`(`@ConditionalOnClass(SseEmitter)`, **property 게이트 없음**)으로 자동 활성화되고,
`PartnerOrderRealtimeBroker`(`realtime/…:25`)가 `InMemoryRealtimeBroker` 를 **상속만 하고 `heartbeat()` 를 재정의하지 않아** 상속된 `@Scheduled` 가 그대로 등록됩니다.

### 왜 지금까지 안 잡혔는가

`TaskSchedulerPoolSizeIT`(`src/test/java/…/config/TaskSchedulerPoolSizeIT.java`)가 **형제 1개 점유만** 재현합니다. PR #876 라운드에서 **의도적으로 좁힌 범위**이고, 그 한계가 IT Javadoc(`:43-47`)에 이렇게 적혀 있습니다:

> "outbox 를 제외한 형제는 6-1=5개로 `pool.size`(5)와 정확히 같다 — 형제 5개가 동시에 점유하는 최악의 경우까지는 재현하지 않는다(본 IT 는 형제 1개만 점유시키고, 나머지 4개 슬롯은 항상 여유가 있는 상태로 측정한다)."

`application.yml:62` 주석도 같은 것을 예고합니다: `# 설정으로 방어되지 않는다(측정 + outbox 전용 TaskScheduler 분리 검토는 후속 이슈로 분리).`

---

## 2. 🚨 PM 결정 — 선행 조건을 뒤집는다

이슈 #888 은 할 일을 **①운영 실소요 측정 → ②측정 결과에 따라 구조 변경 검토** 순으로 적었습니다. **이 순서를 따르지 않습니다.**

**근거 — 측정은 결정을 바꾸지 못합니다.** 이슈 자신이 전용 TaskScheduler 를 *"형제 수·점유시간과 **무관하게** 성립하는 유일한 구조적 해법"* 이라고 규정합니다. 즉:

- `BootstrapCacheRefreshScheduler` 가 **느리면** → 분리해야 합니다.
- **빠르면** → 형제가 5개인 사실과 여유 0인 산술은 그대로이므로, 여전히 분리해야 합니다.

어느 쪽이든 결론이 같은 측정은 **선행 조건이 아니라 관측 항목**입니다. 게다가 운영 환경이 없어(Phase 11 미이식) 그 측정은 **지금 수행 자체가 불가능**하고, 테스트 환경 수치는 이슈가 이미 *"자격증명 부재로 전 호출 즉시 실패, 200ms — 실 네트워크 왕복과 무관해 근거로 쓸 수 없다"* 고 기각했습니다.

⟹ **구조 변경을 먼저 하고, 계측은 관측 목적으로 함께 넣습니다.** 측정을 기다리느라 결함을 방치하지 않습니다.

---

## 3. 불변식 (구현 수단은 지정하지 않는다)

> 🚨 아래는 **만족해야 할 성질**입니다. 어떤 메커니즘으로 달성할지는 구현자가 정합니다.
> PM 이 수단을 지시하면 그 수단이 낳은 결함까지 PM 이 떠안습니다.

- **I-1** — 형제 스케줄러 **5개가 전부 동시에 점유**된 상태에서도 outbox tick 은 **보장된 실행 스레드**를 얻는다. 형제 수가 늘어나도 이 성질이 유지된다(형제 6개·7개가 돼도 outbox 는 굶지 않는다).
- **I-2** — outbox tick 이 오래 걸려도 **형제 5개의 주기가 밀리지 않는다**(역방향 격리). 반대 방향만 막고 끝내지 않는다.
- **I-3** — 기존 동작 보존: cron 표현식·`samhan.outbox.cron` 오버라이드·`@Profile("!local")` 의미가 그대로다. **local 프로파일에서 컨텍스트가 뜬다.**
- **I-4** — `AbstractPostgresIT` 가 `samhan.outbox.cron = "-"`(`CRON_DISABLED`)로 outbox 를 끄는 이유(`:73-77` 주석 — 캐시된 다수 `@SpringBootTest` 컨텍스트가 정각에 동시 claim 해 hard gate 를 false-RED 로 만듦)가 **여전히 성립한다.** 전용 스케줄러가 이 비활성화를 우회하지 않는다.
- **I-5** — `BootstrapCacheRefreshScheduler.refreshBootstrapCache()` 의 **소요 시간이 관측 가능**해진다. 운영 이식 후 별도 코드 변경 없이 실소요를 읽을 수 있다.

### 확인된 사실 (선택지 판단용 — 지시가 아님)

- Spring Boot **3.3.5**(`build.gradle:17`) ⟹ Spring Framework **6.1.14**(Gradle 캐시 실측). `@Scheduled(scheduler = "…")` 속성은 **6.1+ 에 존재**하므로 버전상 사용 가능합니다. ⚠️ 다만 정찰은 **어노테이션 클래스를 직접 열어 속성 존재를 확인하지 않았습니다** — 쓰기로 정했다면 **컴파일과 런타임으로 실증**하세요.
- `SchedulingConfigurer` · `ScheduledAnnotationBeanPostProcessor` · main 소스의 `TaskScheduler`/`ThreadPoolTaskScheduler` bean — **전 서비스 전례 0건**.
- 다만 *"전용 풀 bean 을 명명해 분리"* 자체는 전례가 있습니다: `services/slip-service/…/price/config/PartnerProductPriceMemoryAsyncConfig.java:33-34` 의 `@Bean(name = "priceMemoryExecutor")` (Executor 축).
- 이 서비스의 유일한 Micrometer 계측 클래스 = `…/observability/OutboxObservabilityMetrics.java` (`Gauge.builder(...).register(meterRegistry)` 3개). **Timer 전례는 0건.**

---

## 4. 🚨 RED-first 요구

**결함을 재현하는 실패 테스트를 먼저 쓰고, RED 원문을 제출한 뒤 고칩니다.**

현재 `TaskSchedulerPoolSizeIT` 의 1-sibling 패턴을 **5-sibling** 으로 확장하면, 이슈가 예고한 대로 **현재 코드에서 RED 가 나야 합니다**:

> ⚠️ "현재 `pool.size=5` 상태에서 5-sibling 완전 점유를 재현하면 **RED 가 날 가능성이 높습니다** — 이 이슈에서 해결책과 **함께** 다뤄야 합니다. 테스트만 먼저 강화하면 값 재논의가 뒤따릅니다."

⟹ 요구 순서:
1. 5-sibling 점유 테스트를 쓰고 **현재 코드에서 RED 임을 실행 원문으로 제출**한다. (RED 가 **안 나오면** 전제가 틀린 것이므로 즉시 보고하고 멈춘다 — 통과하도록 테스트를 조정하지 않는다.)
2. 그 다음 I-1~I-5 를 만족시킨다.
3. 같은 테스트가 GREEN 이 되는 원문을 제출한다.
4. **역방향(I-2)도 별도 테스트**로 세운다 — outbox 가 오래 점유해도 형제가 굶지 않는지.

기존 1-sibling 테스트는 **삭제하지 말고 유지**하세요(회귀 울타리).

---

## 5. 범위

### 포함
- outbox 스케줄링 격리 (I-1·I-2)
- `BootstrapCacheRefreshScheduler` 소요 시간 계측 (I-5)
- 5-sibling / 역방향 IT (RED-first)
- `application.yml:41-62` 의 예고 주석 갱신 — **`pool.size` 값과 형제 산술 서술이 변경 후 사실과 일치**해야 합니다
- `.github/workflows/ci.yml` 신규 IT hard gate 등재
- 문서 동기화 (dev-report · DECISIONS · 해당 README)

### 제외
- `pool.size` **값 조정으로 때우기** — 형제가 늘면 다시 깨지므로 해법이 아닙니다
- 다른 5개 스케줄러의 로직 변경
- `shared:realtime-abstraction` 의 `@Scheduled` 제거·조건화 — 타 서비스 파급
- 운영 환경 실측 (환경 부재)

---

## 6. CI 게이트 (실측 근거)

`ci.yml:81-83` 의 `accounting+partner` matrix 가 `:services:partner-order-service:test` 를 **모듈 전체**로 돌립니다(`--tests` allowlist **없음**) ⟹ 신규 테스트 클래스는 자동 실행됩니다.

**그러나 그것만으로는 부족합니다.** `AbstractPostgresIT` 는 Docker 미가용 시 **skip** 되므로(`:26` `@ExtendWith(DockerAvailableCondition.class)`), 미실행 채로 green 이 가능합니다. 이 저장소는 그래서 IT 별 hard gate 스텝을 따로 둡니다 — `ci.yml:218-233`(`TaskSchedulerPoolSizeIT`) · `:201-216`(`SlipPublishOutboxProcessorIT`)가 그 형태이고, 조건이 `tests>=N && failures=0 && errors=0 && **skipped=0**` 입니다.

⟹ **신규 IT 도 같은 형태로 등재**하고, 기존 `TaskSchedulerPoolSizeIT` 게이트의 `tests>=1` 하한을 **실제 테스트 수에 맞춰 올리세요**(테스트가 조용히 사라지면 걸리도록).

---

## 7. 금지

- 🚫 **git 상태 변경 금지** — 파일만 만들고 고칩니다. commit·push·branch·stash 전부 PM 이 대행합니다.
- 🚫 **새 이슈 등록 금지.**
- 🚫 **적용된 Flyway 마이그레이션 수정 금지** (이 슬라이스는 마이그레이션이 필요 없어야 합니다 — 필요하다고 판단되면 먼저 보고하세요).
- 🚫 **가짜 데이터·합성 출력 금지.** 실행하지 않은 것을 실행한 것처럼 인용하지 마세요. 🚨 **인용한 "원문"은 리뷰어가 같은 명령으로 재현합니다** — 계측판에서 얻은 출력을 커밋본의 출력인 것처럼 적으면 증거 무결성 위반으로 잡힙니다(직전 PR 에서 실제 발생).
- 🚫 `pool.size` 를 5 → 6 이상으로 올려 통과시키는 회피 금지 (§5 제외 항목).
