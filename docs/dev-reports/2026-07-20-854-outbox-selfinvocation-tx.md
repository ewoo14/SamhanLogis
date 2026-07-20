# #854 — Outbox self-invocation @Transactional 우회 fix + R1 하드닝 (2026-07-20, PR #854)

## 문제 (pre-existing 실버그 + R1 적대검증)
`SlipPublishOutboxScheduler.retryPending()`(`@Scheduled`·트랜잭션 없음)이 `this.processOne(row)` **self-invocation** 으로 `processOne` 의 `@Transactional` 프록시를 우회 → processOne 이 트랜잭션 없이 실행, 상태 전이(`markProcessing/Committed/Retry/Failed`)가 미영속 → 성공 시 order.slipPublished 유실·재시도 시 attemptCount/nextAttemptAt 미갱신으로 **무한 즉시 재-pick storm**. CODEX LUNA 구현이 processor 를 별 빈 추출 + per-row `@Transactional` + 명시 save + 비관 락(D-854-03)으로 1차 해소. 본 문서는 그 위에 **OPUS R1 5-agent 적대검증** 발견을 개발책임자 결정(옵션 B: 비관 락 유지·하드닝)대로 fix 한 배치다.

## Fix (R1)
대상: `scheduler/SlipPublishOutboxProcessor`·`client/SlipServiceClient`·IT `it/SlipPublishOutboxProcessorIT`·`.github/workflows/ci.yml`.

### F-1 processOne 재구성 (parse storm 갭 + try-scope 원자성)
- **parsePayload 를 try 안으로** 이동(구: markProcessing 뒤·try 밖). 파싱 실패가 예외 전파→tx 롤백→`nextAttemptAt≤now` 잔류로 즉시 재-pick 되던 storm 을 제거 — 이제 파싱 실패도 `handleRetry`(백오프→max-retry 후 FAILED)로 종결.
- **try = payload 파싱 + slip 발행만** 감싸고, **markCommitted + outbox 명시 save + order/history 영속은 catch 밖**(발행 성공 확정 후)에 배치. 발행 성공 후 DB 오류는 잡지 않고 전파 → **tx 롤백 → 다음 cron 이 동일 idempotency-key 로 replay**(실발행됐는데 PENDING 회귀·attemptCount 인플레 방지). BusinessException 은 RuntimeException 하위라 단일 `catch (RuntimeException)` 로 통합(발행/파싱 실패 → handleRetry 후 return).

### F-2 F1 락 재검 강화 (재시도 double-fire 차단)
- findWithLockById 후 pre-check 를 `status != PENDING` **또는 `nextAttemptAt.isAfter(now)`** 면 반환하도록 강화(now 는 메서드 진입 시 1회 계산). 다중 인스턴스에서 다른 worker 가 `markRetry`→PENDING(미래 nextAttemptAt)으로 되돌린 row 를, 뒤늦게 락을 획득한 worker 가 즉시 재발행하는 double-fire 를 차단.

### F-3 무한 HTTP 대기 방지 (락·커넥션 점유 상한)
- `SlipServiceClient` 생성자: `SimpleClientHttpRequestFactory` 로 **connect 2s / read 5s** 명시. 같은 서비스 `DcConfigClient`/`NotificationClient` 의 timeout 패턴 parity, 단 `builder.clone()`(DcConfigClient 방식)으로 싱글턴 `loadBalancedRestClientBuilder` 변이(ProductClient/InventoryClient 등으로 timeout 전파)를 차단. read 5s 는 `resilience4j.timelimiter.slipServiceClient(5s)` 와 정렬한 상한.
- `processOne` `@Transactional(timeout = 20)` — connect 2s + read 5s HTTP 상한 + DB 쓰기 시간을 감안, 비관 락을 잡은 채 지연되는 최대 시간을 제한.

### F-4 detailJson 안전 직렬화
- `handleRetry` FAILED detailJson·성공 detailJson **2곳**의 수동 문자열 조립(+`safeJson`)을 주입된 `objectMapper.writeValueAsString(Map.of(...))` 로 교체. 제어문자·따옴표를 안전 이스케이프하고 **slipNo 미이스케이프도 동시 해소**. writeValueAsString 검사예외는 최소 fallback(`"{}"`·warn 로그) 처리. `safeJson` 제거.

### F-5 재시도 관측성
- `handleRetry` 비영구 재시도(markRetry) 후 `log.warn("Outbox retry: orderId=..., attempt=..., nextAttemptAt=..., error=...")` 추가.

### F-6 CI skipped=0 hard gate (DevOps HIGH)
- `.github/workflows/ci.yml` 에 `#850` 패턴 복제하여 **`#854 SlipPublishOutboxProcessorIT skipped=0 hard gate`** 추가(`accounting+partner` 그룹·report `services/partner-order-service/build/test-results/test/TEST-...SlipPublishOutboxProcessorIT.xml` 존재 + skipped=0 검증). Docker 미가용 skip 으로 IT 가 false-green 되는 것을 차단.

## IT 강화 (genuine — 구현 되돌리면 RED)
- **A. tx-경계 genuine 가드(QA HIGH-1)** `publish_runsInsideActiveTransaction`: @MockBean `publishFromPartnerOrder` 스텁이 호출 시점 `TransactionSynchronizationManager.isActualTransactionActive()` 를 캡처 → **true 단언**. 기존 ①②③은 명시 save 가 tx 없이도 각자 영속하므로 processOne `@Transactional` 삭제해도 GREEN 이었으나, 이 테스트는 삭제 시 발행 시점 tx 부재(false)로 **결정적 RED**.
- **B. 동시성 barrier(QA MED-2)** `concurrentProcessing_barrierOnLockWaitPublishesExactlyOnce`: worker1 발행 진입(락 보유·mock park) 확인 후 worker2 투입 → **`pg_locks WHERE NOT granted` 를 폴링**해 worker2 가 FOR UPDATE 락 대기에 진입한 것을 결정적으로 확인한 뒤 releaseFirstPublish. 폴링은 **Testcontainers 컨테이너 직결 JDBC 커넥션**(DriverManager)으로 수행 — HikariCP `maximum-pool-size=3`(worker1·worker2 가 2개 점유) 환경에서 풀 마지막 커넥션 경합/고갈을 피하기 위한 결정. 비관 락 제거 시 worker2 가 대기 없이 PENDING 을 읽어 이중발행 → `worker2Blocked=false` + `publishCalls=2` 로 **결정적 RED**. (구 테스트의 "worker2 락 도달 미확인 후 즉시 release" 레이스 제거.)
- **C. parsePayload 파싱실패(storm 갭)** `malformedPayload_goesThroughRetryNotStorm`: 불량 JSON 시드 → retryPending → 재조회 **status=PENDING·attemptCount=2·nextAttemptAt 미래**(handleRetry 경유) 단언. 파싱이 try 밖(구조 원복)이면 예외 전파→tx 롤백→attemptCount 1·과거 nextAttemptAt(즉시 재pick)로 RED.
- **D. max-retry 경계·백오프(QA MED-4)** `nearMaxRetryBoundary_retriesWithTenMinuteBackoff`: firstAttemptedAt = now−maxRetryHours+5분 → **PENDING(retry, FAILED 아님)** + 첫 재시도 nextAttemptAt ≈ now+10분(±2s) 단언(백오프 = min(60, 5·2^min(1,4))=10).
- **E. F1 재시도 double-fire** `futureNextAttempt_isSkippedByLockRecheck`: nextAttemptAt 미래 PENDING row 를 processor 직접 호출 → 락 재검서 스킵(발행/전이 없음) 단언. F-2 가드 제거 시 발행되어 RED.

## 검증
- `./gradlew :services:partner-order-service:compileJava :services:partner-order-service:compileTestJava` — **BUILD SUCCESSFUL**(main+test 컴파일 통과).
- 전체 test(실 Postgres IT 포함)는 **PM 직렬 genuine**(`--rerun-tasks`·skipped=0·ci #854 게이트)로 실행 — 본 구현자는 결과를 지어내지 않는다.

## Dormant 관찰 — outbox producer 부재
`SlipPublishOutbox.queue(...)` 는 **엔티티 자체 팩토리 + IT 시드만 참조**하며, 프로덕션에 PENDING outbox row 를 INSERT 하는 producer 경로가 **현재 없다**(confirm 자동발행이 슬라이스 D1 에서 폐지). 스케줄러/프로세서는 레거시 PENDING_RETRY 주문·후속 재도입 대비로 유지 중. 따라서:
- 본 fix 는 **미래 재활성 / 레거시 row 대비 correctness 하드닝**이며 현재 라이브 트래픽에는 material 영향이 없다(#853 fail-closed 발행이 이 잠재 결함을 노출).
- GUI 없는 백엔드 스케줄러 + producer dormant 특성상 데스크톱 FE 에 `slipPublishStatus` 노출 면이 **없음**(grep 0). 라이브 QA 는 **실 Docker 스택에 outbox row 를 수동 시드**(합성 producer 위장 안 함·dormant 정직 표기)해 스케줄러 상태전이를 **실 DB + 로그로 실측**한다(IT 대체 아님).

## 라이브 QA (실 Docker·수동 시드) — `docs/qa/854-liveqa-outbox-transition.png`
실 스택(samhan-partner-order-service #854 재배포 15:41:29 · outbox cron 20s QA override · 실 Postgres partner_order_db). BEFORE: outbox 0행(dormant)·대상 주문 2건 PENDING_RETRY.
- **시나리오 A (재시도 회계 + parse storm fix)**: 불량 JSON payload 시드(attempt 1) → 스케줄러 1 tick → outbox `PENDING·attempt 1→2·nextAttemptAt=now+10분(백오프)·last_error=파싱실패` 영속 + `WARN Outbox retry: attempt=2, nextAttemptAt=15:53:20`. **storm 미발생**: attempt_count 가 2 cron틱(~50s) 내내 2 유지(재-pick 안 됨). ⟹ 파싱실패가 try 밖이면 tx 롤백→attempt 1 고정·과거 nextAttemptAt→매 20초 재처리인데, fix 로 handleRetry 경유·영속·정지 확인.
- **시나리오 C (FAILED_PERMANENT 영속 + 주문 전이)**: firstAttemptedAt=now−25h 시드 → 스케줄러 1 tick → outbox `PENDING→FAILED` + 주문 P-2026-0010 `PENDING_RETRY→FAILED_PERMANENT` 실 DB 영속 + `ERROR Outbox FAILED_PERMANENT: attempts=5`. ⟹ self-invocation tx 우회 fix 전이면 미영속(주문 잔류·무한재시도)인데 둘 다 영속 확인.
- **정리**: QA 시드 outbox 2행 삭제 + 주문 P-2026-0010 원복(PENDING_RETRY) 완료([[feedback_qa_live_shared_data_readonly]]).

## 교훈
- **명시 save 는 tx 경계 부재를 가린다**: 각 `repository.save()` 가 자기 tx 로 영속하면 상태 단언 IT 가 `@Transactional` 삭제를 못 잡는다(HIGH-1) → 발행 시점 tx 활성 여부를 직접 캡처하는 genuine 가드 필요.
- **동시성 IT 는 락 대기 진입을 관측해 결정화**: latch 만으로는 worker2 가 FOR UPDATE 에 도달했는지 알 수 없다 → `pg_locks` 폴링으로 barrier 를 세우면 락 제거가 결정적 RED. 공유 풀(size=3) 경합을 피하려 폴링은 컨테이너 직결 커넥션 사용.
- **발행 성공과 상태 영속의 원자성**: 발행 후 DB 오류를 handleRetry 로 흡수하면 실발행된 건이 PENDING 으로 회귀·attemptCount 인플레 → 롤백 후 idempotency-key replay 에 맡기는 것이 at-least-once 계약과 정합.

---

# R2 (CODEX SOL 적대검증 → 개발책임자 3건 fix → LUNA 구현) — claim/lease 정석 전환

CODEX SOL R2(BLOCKING0·HIGH0·MED6·LOW2·머지 보류) 발견 중 설계·스코프 3건을 개발책임자가 "지금 fix" 결정 → CODEX LUNA 구현.

## D-854-05 비관락 → FOR UPDATE SKIP LOCKED claim/lease 정석 전환
R2 동시성 MED2(멀티인스턴스 convoy·@Transactional(timeout=20)이 동기 HTTP 미중단 lock-across-IO) 해소.
- **원자 claim**(`SlipPublishOutboxRepositoryImpl`): 네이티브 `UPDATE ... SET status='PROCESSING', last_attempted_at=now() WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED LIMIT :batch) RETURNING *`. worker별 disjoint claim + `PROCESSING`·`last_attempted_at < now()-lease` stale reclaim(별도 reaper 불필요). `last_attempted_at`을 lease 마커 재사용(신규 컬럼 무).
- **HTTP는 DB 락/tx 밖**(`SlipPublishOutboxProcessor` 무tx) → `SlipPublishOutboxResultWriter`가 결과별 짧은 @Transactional. `commitSuccess`/`handleRetry`가 `findById` 재조회 후 **status가 PROCESSING일 때만** 적용(소유권 가드). 발행 성공 후 결과 tx 실패 → `requeueAfterResultFailure`(REQUIRES_NEW)로 PENDING 복귀(주문/이력은 롤백돼 미변경·동일 idempotency-key replay).
- lease=`samhan.outbox.lease-seconds`(60·connect2s+read5s 초과). markProcessing 가드 PENDING/PROCESSING 허용(정상 claim은 native가 담당).

## D-854-06 4xx/5xx 재시도 분류(fail-fast)
`INVALID_INPUT`(400)·`CONFLICT`(409)=즉시 FAILED_PERMANENT, `INTERNAL_ERROR`(5xx)·`UNAUTHORIZED`·`FORBIDDEN`·기타=재시도. 복구불가 4xx의 24h 반복 제거.

## D-854-07 history enum 정정
`HistoryEventType.SLIP_FAILED_PERMANENT` 추가·FAILED 분기서 사용. **마이그 불요**(event_type=VARCHAR30 NO CHECK 확인).

## R2 검증
- **partner-order-service 전체 375 tests·failures0·errors0·skipped0**(`--rerun-tasks --no-build-cache`). SlipPublishOutboxProcessorIT 13(claim disjoint·stale reclaim·결과tx PROCESSING 재검·HTTP-outside-tx·400/409 fail-fast·F2 롤백+replay·기존 회귀). ci.yml 게이트 tests>=13.
- **라이브 QA(실 Docker·수동 시드)** — `docs/qa/854-r2-liveqa-claim-lease.png`. 로그 `Outbox claim: 3 rows`(SKIP LOCKED 원자 claim). ①A 4xx fail-fast: `{"foo":"bar"}`→slip 400→INVALID_INPUT→**att1 즉시 FAILED_PERMANENT**·주문 FAILED_PERMANENT. ②B 대조: 파싱=transient→PENDING att2 백오프10분·주문 미변경. ③C stale reclaim: PROCESSING(last_at now−70s)→claim 재점유→처리. history `SLIP_FAILED_PERMANENT`×2. QA 시드 정리·주문 2건 복원 완료.

## R2 잔여(재수렴 R3 대상)
- `claimReadyBatchMutationForJpaContract`(dead @Query·claim SQL을 Impl과 중복=drift 위험)·`existsByPartnerOrderId`(dead) — main/test 미사용 → 제거.
- `concurrentClaim` IT는 disjoint 정확성 검증이나 SKIP LOCKED non-blocking 자체는 미가드(성능 속성).

---

# R3 (OPUS 재수렴 5-agent → 개발책임자 전건 fix) — 원자 소유권 가드·lease 안전화·cleanup

claim/lease 재아키텍처(R2)가 상당 변경이라 OPUS R3 재수렴 적대라운드(BE·동시성/tx·QA·DevOps·Design). **아키텍처 자체 PASS(5-agent 공통 genuine)·BLOCKING 0**. 개발책임자 "전건 fix" 결정.

## [HIGH] 소유권 가드 원자화 (동시성 clobber 근본차단)
R3 동시성 에이전트가 **실 Postgres 재현**: `SlipPublishOutboxResultWriter.processingRow`가 `findById`(무락 SELECT)+Java `status==PROCESSING` 체크 후 `@Version` 없는 outbox에 PK-무조건 UPDATE → lease-overlap서 (A=commitSuccess→COMMITTED, B=stale handleRetry→PENDING) 동시 실행 시 둘 다 PROCESSING 관측→B가 A의 COMMITTED를 덮음(clobber). 멱등키+PartnerOrder `@Version`으로 데이터부패는 차단(BLOCKING 아님)이나 중복 SLIP_PUBLISHED history·재발행·churn.
- **fix**: `SlipPublishOutboxRepository.findWithLockById`(@Lock PESSIMISTIC_WRITE) 재추가·`processingRow`가 이를 사용 → 결과 tx가 row를 FOR UPDATE 락하여 per-row 직렬화(먼저 종결한 전이 확정 후 다른 tx는 최신 상태 읽고 skip). **락은 결과 tx 한정(HTTP는 processor 무tx라 락 밖 유지)**·단일 row라 데드락 없음.

## [MED] lease/batch 불변식 안전화
lease(60s) < 순차 batch 최악 dwell(BATCH_SIZE×(connect2s+read5s)) → 멀티인스턴스 overlap 상시화.
- **fix**: `BATCH_SIZE`를 `OutboxProperties.batchSize`(기본 **10**)로 이동·`leaseSeconds` 60→**120**(10×7=70<120 여유). `@PostConstruct`가 `lease ≥ batch×7` 위반 시 warn. (HIGH 가드가 부패 차단하므로 잉여 재발행 축소용.)

## cleanup + LOW
- **dead code 제거**: `claimReadyBatchMutationForJpaContract`(CLAIM_SQL 중복 drift)·`existsByPartnerOrderId`·**`SlipPublishOutbox.markProcessing()`**(호출자 0·main/test — R2 이후 native claim이 대체). ⟹ **spec/과거 "markProcessing #725 IllegalState KEEP" 결정은 본 R3로 대체(메서드 제거)**.
- **doc-sync**: HistoryEventType "7종"→8종·OutboxStatus("advisory lock" 제거·PROCESSING 영속/lease 재점유/4xx 즉시 FAILED)·OutboxProperties(FAILED_PERMANENT→OutboxStatus=FAILED 정정)·SlipServiceClient(HTTP는 락 밖·timeout=dwell 상한).
- **LOW**: `SlipPublishOutbox.markRequeue`(발행 성공 후 결과tx 실패 requeue는 attemptCount 미증가)·`SlipPublishOutboxScheduler @Profile("!local")`(native SQL H2 local 파손 차단)·`claimReadyBatch` em.find null 필터.

## R3 검증
- **partner-order-service 전체 377 tests·failures0·errors0·skipped0**(`--rerun-tasks --no-build-cache`). SlipPublishOutboxProcessorIT **15**(신규 2: **원자 소유권 가드 clobber-없음 ×30 동시 반복**·requeue attemptCount 불변). ci.yml 게이트 tests>=15.
- 신규 동시성 IT: commitSuccess/handleRetry 동시 ×30 → 최종 status 결정적(COMMITTED/PENDING)·불변식 `!(published && PENDING)`. ~~`findWithLockById`→무락 `findById` 회귀 시 clobber RED.~~ ⚠️ **이 주장은 R4 에서 실측으로 반증됨(아래 R4 HIGH-A 참조) — 무락 회귀에도 90/90 GREEN 이었다.**

관련: PR #854 · spec `docs/specs/854-outbox-selfinvocation-tx-spec.md` · 별건 노출원 #853.

---

# R4 재수렴 (OPUS 6-agent 적대검증 + fix + 라이브QA)

R3 fix 독립 재검증. 5차원 필수 + **스키마/마이그 증원 = 6차원**. BLOCKING 0 · 신규 HIGH 4.

## [HIGH-A] R3 HIGH fix 가 무가드였음 — PM 뮤테이션 실측으로 확정
차원3(QA)과 차원2(동시성)가 정반대 결론을 내 **PM 이 뮤테이션으로 결판**. `processingRow` 의
`findWithLockById` → 무락 `findById` 한 줄만 되돌리고 IT 3회 실행 → **전부 BUILD SUCCESSFUL
(tests=15·skipped0·failures0, 30회 반복 ×3 = 90/90 GREEN)**. 즉 R3 의 HIGH fix 는 어떤 테스트로도
가드되지 않았고, ci.yml `tests>=15` 게이트도 이 속성에 대해 아무 것도 보장하지 않았다.

**원인**: 무락 회귀 시 가능한 최종 상태는 ①handleRetry 가 나중 커밋 → `order PUBLISHED + outbox
PENDING`(유일한 검출 경로) ②commitSuccess 가 나중 커밋 → **락이 있을 때의 정상 결과와 관측적으로
완전 동일**(구조적 판별 불가) 두 가지인데, `commitSuccess` 가 `orderRepository.findById` 시점
auto-flush 로 UPDATE 를 먼저 잡은 뒤 order UPDATE + history INSERT + 직렬화를 더 수행하므로 ②로
편향된다. `GUARD_ITERATIONS=30` 은 이 확률성을 자인하는 장치였다.

**자기 교훈의 회귀**이기도 하다 — R1 에는 `pg_locks WHERE NOT granted` 폴링(`awaitLockWait`)으로
락 대기 진입을 **관측**해 결정화한 테스트가 있었으나 R2 재아키텍처에서 삭제됐고, R3 가 비관 락을
재도입하면서 가드는 순수 `CountDownLatch` 로 되돌아갔다. `#850` 의 확립된 교훈(동시성 IT 는
latch 만으론 스케줄 의존 false-green)과도 배치된다.

**fix**: `resultWriter_doesNotClobberTransitionCommittedByLockHolder` — holder tx 가 행 락을 쥔 채
COMMITTED 로 전이·커밋을 보류하고, 뒤늦은 `handleRetry` 를 투입한 뒤 `pg_locks` 폴링으로 대기 진입을
관측(배리어)하고 해제한다. 락이 있으면 뒤늦은 전이가 COMMITTED 를 읽고 skip(→COMMITTED 유지),
무락이면 stale PROCESSING 을 읽어 진행해 PENDING 으로 덮는다. **뮤테이션 재실행 결과
`expected: COMMITTED but was: PENDING` 으로 결정적 RED 확인.**
※ 1차 설계(“락 보유 시 대기하는가”)는 무락에도 GREEN 이었다 — `save()` 의 UPDATE 가 어차피 행 락에
걸려 동일하게 타임아웃하므로 SELECT 락을 분리 판별하지 못했다. 상태 판별식으로 재설계해 해소.

## [HIGH-B] 4xx fail-fast 오분류 — 자기 spec 위반 + 다운스트림 일시장애가 attempt 1 영구실패
spec D-854-06 은 재시도 대상에 **408/429** 를 명시했으나 `SlipServiceClient` 는 401/403/409 를 제외한
모든 4xx 를 `INVALID_INPUT`(= 영구실패 분류)으로 흘렸다. 또한 partner-service 장애 →
`PartnerVerifyResult.serverError()` → `!isFound()` → slip-service `INVALID_INPUT`(400) → 즉시
FAILED_PERMANENT 로 이어지는 경로를 두 서비스에 걸쳐 확증했다(#853 fail-closed 자체는 의도된 설계이며,
**#854 의 4xx 즉시 종결과 결합된 것이 [NEW]**).
- **fix**: 408·429 → `INTERNAL_ERROR`(재시도) 분리 매핑. **동일 매핑이 `publishFromPartnerOrder`·
  `publishFromOrdersMerge` 두 곳에 중복 존재해 계열 전수 sweep 적용.**
- **fix**: `permanent-error-min-attempts`(기본 2) 도입 — 복구 불가 4xx 도 최소 시도 미만이면 재시도.
  1 로 설정하면 종전 즉시 fail-fast 와 동일.

## [HIGH-C] terminal 조건 부재 — max-retry-hours 가 도달 불가한 경로 2종 (3차원 독립 수렴)
종결 판정이 `handleRetry` 안에만 있어 ①**결과 tx 실패 루프**(`markRequeue` 는 attemptCount 불변·고정
5분 → `handleRetry` 미호출 → 24h 상한이 영원히 평가되지 않음) ②**lease 재점유 루프**(claim 은
attemptCount 미증가 → 24h 경과해도 FAILED 미전이·주문 PENDING_RETRY 고착)가 종결되지 않았다.
- **fix**: `SlipPublishOutboxResultWriter.expireIfExhausted` 신설 + 스케줄러가 **claim 직후** 호출.
  두 경로 모두 claim 을 거친다는 공통점을 이용해 벽시계 상한을 보장하고, 소진 row 는 재발행 없이 종결.

## [정책 명시 — R5 지적에 따른 추가 기록] `expireIfExhausted` 의 동작 변화
위 HIGH-C fix 는 종결 미도달 버그 2종을 막는 동시에 **정책을 바꾼다**: max-retry-hours(기본 24h)
를 초과한 row 는 claim 되는 즉시 **HTTP 재시도 0회로** `FAILED`/주문 `FAILED_PERMANENT` 종결된다.
R5 적대검증(아래 R5 절 "`handleRetry` 만료 분기 무가드")이 이 변화가 문서화되지 않았음을 지적했다.

- **종전(R1~R3)**: 종결 판정이 `handleRetry` 안에만 있어, claim 이 반복되며 24h 를 넘겨도 그
  사이 claim→HTTP 시도가 실제로 발생해 성공하면(다운스트림이 마침 복구돼 있었다면) `COMMITTED`
  로 끝날 수 있었다 — 즉 "다운스트림 복구 직후의 마지막 기회"가 존재했다. 다만 이 여지는 HIGH-C
  가 지적한 두 미도달 경로(결과 tx 실패 루프·lease 재점유 루프)에서는 애초에 `handleRetry` 가
  호출되지 않아 **영영 종결도 안 되던** 상태와 짝을 이루고 있었다 — "마지막 기회"와 "영구 미종결"
  이 같은 원인(종결 판정이 handleRetry 1곳에만 존재)의 양면이었다.
- **현재(HIGH-C 이후)**: claim 직후 벽시계 검사가 먼저 실행되므로, 이미 24h 를 넘긴 row 는
  **단 한 번의 HTTP 시도도 없이** 종결된다. 다운스트림이 claim 시각 직전에 막 복구되었더라도 이
  row 는 그 회복의 수혜를 받지 못한다.
- **판단**: 무결성 관점에서는 방어 가능한 보수적 선택이다 — "24h 넘게 미해결"이라는 사실 자체가
  이미 사람의 판단이 필요하다는 신호이며, 자동 종결을 지연하는 것은 운영자가 실제(터미널) 상태를
  인지하는 시점만 늦출 뿐이다. 그러나 **동작이 바뀌었다는 사실은 명시 기록이 필요**하다(재시도/
  종결 정책은 무결성 도메인에 인접) — 스케줄러 다운타임 등으로 claim 이 24h 언저리까지 지연된
  인스턴스가 있다면, 복구 직후 첫 claim 에서 재시도 없이 바로 종결될 수 있다는 뜻이다.

## [MED] 잔여
- 결과 writer 3메서드 `@Transactional(timeout=10)` — `jakarta.persistence.lock.timeout` 은 PostgreSQL
  에서 **무음 no-op**(`PostgreSQLDialect.supportsWait()==false`·라이브 `SHOW lock_timeout`=0)이라 락
  대기가 무한이었다. Javadoc 에 사실을 박제.
- `CLAIM_SQL` 에 `modified_at`/`modified_by` 추가 — native claim 이 BaseEntity 7-audit 을 우회해
  PROCESSING 전이만 감사 흔적이 없던 문제 해소.
- 주문 부재 시 `ifPresentOrElse` 로 error 로그 — outbox 만 COMMITTED 되고 주문 미갱신인데 성공 INFO 가
  찍히던 무음 발산 해소.
- 테스트 갭 4종 보강: FAILED_PERMANENT 3-write 원자성 · SKIP LOCKED 결정적 가드 · `REQUIRES_NEW` 판별 ·
  `OutboxProperties` 기본값/불변식 고정(`OutboxPropertiesTest` 신규).
- 문서: README `lease-seconds` 60→**120** 정정 + `batch-size`·`permanent-error-min-attempts` 행 추가 +
  불변식 명시 · `local` 프로파일 스케줄러 비활성 주석 · producer dormant 및 "재배선=별도 슬라이스" 반영 ·
  `PartnerOrderHistory` Javadoc 7→8종 · dead code(미사용 Logger·`getLeaseSeconds` 우회) 제거.

## R4 검증
- **partner-order-service 전체 391 tests·failures0·errors0·skipped0**(`--rerun-tasks --no-build-cache`).
  outbox IT 15→**23** · `SlipServiceClientTest` 14→**17** · `OutboxPropertiesTest` **3**(신규).
  ci.yml #854 hard gate `tests>=15` → **>=23** 상향.
- **anti-false-green**: HIGH-A 가드는 뮤테이션 재실행으로 RED 확인(위 참조).
- **라이브 QA(실 Docker + 실 데스크톱 GUI)**: `docs/qa/854-r4-liveqa-raw.txt`(원문 캡처·합성 없음) ·
  `docs/qa/854-r4-terminal-guard/*.png`(실 GUI). A(requeue 형상)·B(lease 재점유 형상) → 재발행 로그 없이
  `MAX_RETRY_EXHAUSTED` 종결 · C → 실 slip-service **400** 에 1차 재시도(attempt 2) 후 2차에 종결 ·
  claim row `modified_by=system` · 신규 `SLIP_FAILED_PERMANENT` history 가 실 DB 에 정상 INSERT(마이그 불요
  주장의 라이브 확인). ※ producer dormant 라 throwaway 시드 사용·cron 10초 단축(오버레이 미커밋)·QA 후 시드 정리 완료.

## R4 처분 유보 → 후속 (개발책임자 "전건 fix" 결정에 따라 본 PR 계속)
- ~~**[HIGH-D] 관측/알림 배선 0** — `log.error` 가 alert 를 표방하나 Micrometer/Prometheus/CloudWatch 배선이
  전무(저장소에 이미 3중 전례 존재). 신규 즉시-종결 경로가 무성음으로 소각될 수 있다.~~
  ⚠️ **R4 Track 2 에서 해소됨(아래 "R4 Track 2" 절 참조)**.
- ~~**[차원5 MED] FE 표시 면 부재** — `slipPublishStatus`/`PENDING_RETRY`/`FAILED_PERMANENT` 가 전 클라이언트
  grep 0매치. **라이브 GUI 캡처로 확증**: 발행 영구실패 주문이 상태 "완료" + 연결 전표 "-" 로만 보여 발행
  대기중과 구별 불가.~~
  ⚠️ **R4 Track 2 에서 해소됨(아래 "R4 Track 2" 절 참조)** — BE 응답에 `slipPublishStatus` 노출 +
  FE Badge 표시("전표 발행 대기"/"전표 발행 실패")로 grep 0매치가 해소됐다. **본 절의 서술은
  당시(R4 처분 유보 시점) 상태의 기록이며 HEAD 기준 현재형이 아니다.**
- ~~**[HIGH-B 근본] slip-service 상태코드 정정** — `resolveCommittedPartnerId` 의 SERVER_ERROR/SKIPPED(검증
  불가)를 400 이 아닌 5xx 로 반환해 "복구 불가 입력"과 "검증 불가"를 계약 수준에서 분리.~~
  ⚠️ **R4 Track 2 에서 해소됨(아래 "R4 Track 2" 절 참조)**.

---

# R4 Track 2 (CODEX LUNA 구현 — 개발책임자 "전건 fix" 결정 이행) — 관측/알림 배선 · FE 표시 면 · slip-service 상태코드 정정

R4 처분 유보 3건(HIGH-D 관측/알림 배선 0 · 차원5 MED FE 표시 면 부재 · HIGH-B 근본 slip-service
상태코드)을 순서대로 구현(commit `35ec40fba`).

## [R4 HIGH-D] 관측/알림 배선
`log.error` 가 alert 를 표방했으나 실제 배선이 전무했다(저장소에 이미 3중 전례 — slip 가격기억).
- `SlipPublishOutboxResultWriter`: terminal 전이마다 Micrometer counter
  `partner_order_slip_publish_terminal{reason}` 증가. `reason` 은 고정 태그 4종(`committed`/
  `invalid_input`/`conflict`/`max_retry_exhausted`) — 자유 문자열 없음(카디널리티 유계). 계측
  실패는 try/catch 로 격리해 결과 트랜잭션을 깨뜨리지 않는다.
- `infrastructure/prometheus/rules/partner-order-outbox.yml` 신규 — 기존 `slip-price-memory.yml`
  룰과 동형(경보명 `PartnerOrderSlipPublishTerminalFailure`).
- `infrastructure/terraform/monitoring.tf` — log metric filter(`"Outbox FAILED_PERMANENT"`) +
  alarm 신규(기존 slip 가격기억 알람과 **형상은** 동형). ⚠️ **형상만 동형이고 로그 원천(awslogs
  driver)은 최초 구현 시 누락돼 있었다 — R5 가 발견했고, 본 PR 의 infrastructure 담당 배치가
  해소했다(아래 R5 절 참조).**
- `docs/runbooks/partner-order-outbox-terminal-failure.md` 신규(한국어). ⚠️ 최초 버전은 재발행
  절차가 순환 참조였다 — 이 또한 R5 가 발견해 같은 배치로 재작성했다(아래 R5 절 참조).

## [R4 차원5] 전표발행 상태 FE 표시 면
`slipPublishStatus` 가 전 클라이언트 grep 0매치라, 발행이 영구 실패한 주문이 상태 "완료" + 연결
전표 "-" 로만 보여 발행 대기중과 구별 불가였다(R4 라이브 GUI 캡처로 확증된 결함).
- BE: `PartnerOrderDetailResponse`·`PartnerOrderSummaryResponse` 에 `slipPublishStatus` 노출
  (내부 outbox 식별자는 미노출 — UUID 비공개 원칙 유지).
- FE: `SalesPartnerOrderDetailPage` 가 design-system Badge 로 "전표 발행 대기"(warning)·
  "전표 발행 실패"(danger) 표시. 모바일 요약·데스크톱 카드 양쪽 반영. 색상 단독으로 의미를
  전달하지 않는다(텍스트 라벨 동반).
- 신규 `PartnerOrderResponseTest`: 실 도메인 전이 4상태(NOT_REQUIRED/PUBLISHED/PENDING_RETRY/
  FAILED_PERMANENT) 전수로 detail/summary 응답 보존을 검증.

## [R4 HIGH-B 근본] slip-service 상태코드 정정
`resolveCommittedPartnerId` 가 "복구 불가 입력"과 "검증 불가"를 구분하지 않아, partner-service
다운(SERVER_ERROR)이 400 으로 변환되고 outbox 가 이를 복구 불가(즉시 FAILED_PERMANENT)로
오분류했다.
- `NOT_FOUND` → `INVALID_INPUT`(400) **유지**(진짜 미등록 거래처는 여전히 즉시-종결 대상).
- `SERVER_ERROR`·`SKIPPED`(검증 스킵)·`FOUND`+빈 `partnerId`(비정상 조합) → `INTERNAL_ERROR`
  (5xx, 재시도 대상)로 정정.
- enum 전수 `switch` 로 재작성 — 신규 상태 추가 시 분기 누락이 컴파일 단계에서 포착된다.
- 🚨 **#853 fail-closed 불변식 유지** — 모든 실패 경로에서 커밋 전표 발행은 여전히 차단된다.
  바뀐 것은 차단 여부가 아니라 오류 분류(상태코드)뿐이다.
- `SlipPublishControllerIT`·`SlipPublishMergeIT` 파라미터화 테스트를 케이스별 기대 상태/코드로
  분기(종전 4케이스 모두 400 단언 → 강화, "전표 미생성" fail-closed 단언은 유지).

## Track 2 검증
PM 독립 검증(genuine · `--rerun-tasks --no-build-cache`):
- `:services:partner-order-service:test` — **392 tests · failures 0 · errors 0 · skipped 0**.
- `:services:slip-service:test` — **1417 tests · failures 0 · errors 0 · skipped 0**.
- `SlipPublishOutboxProcessorIT` **23**(ci.yml `#854` hard gate `tests>=23` 그대로 충족).
- `clients/desktop`: `npm run typecheck` 통과 · vitest **133 files / 1012 tests passed**.
- `promtool check rules` → `SUCCESS: 1 rules found`(실 prometheus 컨테이너, 구현 시점 확인).
- prometheus job 이름·rules 마운트·`rule_files` 글롭 정합 확인.

---

# R5 (FABLE5 6차원 적대검증) — BLOCKING 0 · HIGH 5 · MED 14 · LOW 23

Track 2(관측/알림 배선·FE 표시 면·slip-service 상태코드 정정) 위 재수렴 적대검증. **BLOCKING 0**.

## 핵심 발견
- **카운터 lazy 등록으로 첫/단발 실패 미탐** — Micrometer `Counter.builder(...).register(meterRegistry)`
  는 최초 `increment()` 호출 시점에야 레지스트리에 실제로 나타난다(lazy registration). 특정
  `reason` 이 처음 발생하는 이벤트 자체가 관측 시점 이전에 걸리면 그 첫 이벤트를 놓칠 수 있다.
- **dev Prometheus 룰이 런타임에 로드되지 않음** — `infrastructure/README.md` 가 이미 문서화한
  #809 R8-DEVOPS-1 트랩(룰 마운트는 컨테이너 *생성* 시점 bind 이며 기존 컨테이너에 사후 반영되지
  않는다. `rule_files` 글롭이 0매치여도 Prometheus 는 에러를 내지 않는다)과 동일 계열. 신규
  `partner-order-outbox.yml` 이 promtool 통과 + 마운트 확인만으로 "로드됨"으로 간주됐으나, 런타임
  `/api/v1/rules` 확인이 R4 Track 2 검증 시점에는 누락돼 있었다.
- **prod awslogs 로그 원천 부재** — 본 문서 상단 [HIGH] 항목과 동일 사안. partner-order-service
  컨테이너에 awslogs driver 가 없어 monitoring.tf 의 신규 alarm 이 CloudWatch Agent 의
  best-effort wildcard tail 에만 의존하고 있었다(저장소 스스로 "alarm 원천으로 쓰지 않는다"고
  못박은 바로 그 경로).
- **`handleRetry` 만료 분기 무가드** — R4 HIGH-C 가 도입한 claim 시점 종결(`expireIfExhausted`)이
  정책을 바꿨음(24h 초과 row 는 HTTP 재시도 0회로 종결)에도 이 변화가 문서에 명시 기록되지
  않았다(위 "[정책 명시]" 절로 해소).
- **mock 파리티 이탈** — FE mock 고정치가 BE 가 실제로 반환하는 `slipPublishStatus` 관련 값의
  형식/구성과 어긋나는 지점이 있어, mock 온 개발 환경과 실 서버 간 관측 결과가 달라질 수 있다.

## 처분
인프라·문서 범위로 분류된 발견(prod awslogs 부재 · runbook 순환 참조 · 정책 미기록 · severity
재평가)은 본 fix 배치(infrastructure/docs 담당)로 해소했다 — 상단 [HIGH]/[MED]/[LOW] 항목과
위 "[정책 명시]" 절 참조. 카운터 lazy 등록·mock 파리티 등 `services/`·`clients/` 범위 발견은
동시 진행 중인 별도 배치가 처리한다(본 문서는 그 결과를 앞질러 단언하지 않는다 — 해당 커밋 이력
참조).

## 교훈
- **promtool 통과 + 마운트 확인 ≠ 룰 로드됨** — `infrastructure/README.md` 가 #809 R8-DEVOPS-1 로
  이미 의무화한 사항("Always verify the rule is actually loaded — never assume", 런타임
  `/api/v1/rules` 확인 + `scripts/verify-prometheus-rules.ps1`)인데도 R4 Track 2 PM 검증이 이를
  놓쳤다. 런타임 확인이 유일한 증거다 — 정적 통과(promtool)와 마운트 확인은 필요조건일 뿐
  충분조건이 아니다. 본 배치는 `scripts/verify-prometheus-rules.ps1` 을 재실행해 두 rule
  파일(`partner-order-outbox.yml`·`slip-price-memory.yml`) 모두 `health=ok`로 런타임에 로드돼
  있음을 재확인했다(아래 "검증" 참조).
- **메트릭 counter 는 eager register 하지 않으면 `increase()` 가 첫 이벤트를 못 잡는다** —
  Micrometer 의 `Counter.builder(...).register(registry)` 는 최초 `increment()` 시점에야 실제
  등록되는 lazy 패턴이다. 알람이 "반복" 이벤트가 아니라 "최초 1건" 도 놓치지 않아야 하는 성격
  (본 건의 `FAILED_PERMANENT` 처럼 1건도 사건인 경우)이라면, 애플리케이션 시작 시점에
  `MeterRegistry` 에 0-값으로 미리 등록해두는 eager 패턴을 검토해야 한다(services/ 범위 — 본
  배치의 fix 대상 아님, 위 "처분" 참조).

## 검증 (본 배치 — infrastructure/docs, 읽기 전용)
`services/`·`clients/` 는 별도 담당 소유라 미접촉 — 아래는 인프라 파일 검증만.
- `docker compose -f infrastructure/docker-compose.prod.yml config` — **exit 0**(env 미주입 경고만,
  구문 오류 없음). partner-order-service 렌더 결과의 `logging:` 블록이 slip-service 와 `driver`/
  `awslogs-region`/`awslogs-group`/`mode`/`max-buffer-size` 전부 동일, `awslogs-stream` 만
  `partner-order-service`로 정확히 분기됨을 확인.
- `terraform fmt -check -diff -recursive infrastructure/terraform` — **exit 0**(diff 없음).
- `docker exec samhan-prometheus promtool check rules partner-order-outbox.yml
  slip-price-memory.yml` — **SUCCESS: 1 rules found**(양쪽 모두, severity 변경 후).
- `infrastructure/scripts/verify-prometheus-rules.ps1` — **PASS**: git rule 파일 2건 == 런타임 로드
  파일 2건, 두 rule 모두 `health=ok, state=inactive`. 단, 실행 중인 `samhan-prometheus` 컨테이너는
  파일 편집만으로는 reload 되지 않으므로 `severity` 라벨 자체는 컨테이너 재생성/reload 전까지
  메모리상 `warning` 으로 남아 있음을 `curl /api/v1/rules` 로 직접 확인·기록한다(파일 정정은 완료,
  라이브 반영은 다음 recreate/reload 시점 — 본 배치는 docker apply 금지 범위라 recreate 는
  수행하지 않았다).
- `bash -n infrastructure/terraform/templates/user_data.sh` — 구문 오류 없음.

