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

관련: PR #854 · spec `docs/specs/854-outbox-selfinvocation-tx-spec.md` · 별건 노출원 #853 · enum 오표기(SLIP_RETRY_QUEUED 재사용) 정정 = 후속.
