# #854 — SlipPublishOutboxScheduler self-invocation @Transactional 우회 fix (기획 spec)

> OPUS 기획 · **워크플로우 변경(2026-07-20 기획검수 폐지) 후 첫 슬라이스** — 신 파이프라인: OPUS 기획(본 spec·조기 PR) → CODEX LUNA 구현 → OPUS R1 5-agent 적대검증+fix+라이브QA → CODEX SOL R2 5-agent+LUNA fix → 0수렴 → PM 종합 머지.
> 성격: **pre-existing 실버그(회계 미영속)**. #853 전표 거래처 필수화 fail-closed가 노출. partner-order-service 범위.

## 0. 결함 (SOL R2 적대검증 dim2 발견)
`SlipPublishOutboxScheduler`:
- `retryPending()`(`@Scheduled`·**트랜잭션 없음**) → `this.processOne(row)` **self-invocation** → `processOne`의 `@Transactional` 프록시 **우회**(Spring proxy는 외부 호출만 인터셉트) → processOne 이 **트랜잭션 없이** 실행.
- processOne/handleRetry가 `locked`(outbox)·`order` 엔티티를 mutate(`markProcessing/Committed/Retry/Failed`·`markSlipPublished/FailedPermanent`)하나 **명시 `save()` 없음** + tx 없어 dirty-check flush 없음 → **상태 전이 미영속**(historyRepository.save 만 영속).
- ⟹ **성공**: markCommitted 미반영→PENDING 잔류→다음 cron 중복 발행(idempotency-key로 완화되나 order.markSlipPublished 유실). **실패**: markRetry/markFailed 미반영→attemptCount·nextAttemptAt·max-retry-hours·FAILED_PERMANENT 실작동 안 함→**무한 즉시 재시도 storm**(nextAttemptAt≤now 잔류).

## 1. 상태 모델 (SlipPublishOutbox)
PENDING/PROCESSING/COMMITTED/FAILED · attemptCount · firstAttemptedAt(max-retry 기준) · nextAttemptAt · lastError. `queue()`→PENDING(attempt 1·next+5m). markProcessing(PENDING→PROCESSING·IllegalState 가드·#725 KEEP)·markCommitted·markRetry(→PENDING·attempt++·next 갱신)·markFailed(→FAILED). maxRetryHours=24.

## 2. 결정 (D-854)

### D-854-01 processOne 트랜잭션 경계 복원 (핵심)
`processOne`+`handleRetry`를 **별도 `@Component SlipPublishOutboxProcessor`로 추출**하고 `processOne`에 `@Transactional`. 스케줄러는 processor 를 주입해 `processor.processOne(row)` **외부 호출**(프록시 경유) → **per-row 독립 tx**(설계 의도 "개별 row 실패가 batch 전체를 막지 않도록" 유지 — self-injection @Lazy 대신 별 빈이 [[feedback_self_invocation_transactional_bypass]] 권고안·프록시 경계 명확). retryPending(@Scheduled·no-tx)은 batch 루프+per-row catch 유지.

### D-854-02 상태 전이 명시 영속
processOne tx 내에서 `locked` 재조회(managed)라 dirty-check flush되나, **`outboxRepository.save(locked)` 명시**(성공/재시도/실패 종결 시)로 계약 명확화(#854 "명시 save 없음" 직접 해소). `order`도 save 명시. history 는 현행 유지.

### D-854-03 동시성 (pick 경합) — 평가
retryPending pick(findAllByStatus PENDING) → processOne findById+markProcessing 은 **다중 인스턴스 시 비원자**(두 tx가 PENDING 동시 관측 가능). 안전망=slip-service idempotency-key(중복 발행 차단). **조치**: `findById`를 **비관 락(`@Lock(PESSIMISTIC_WRITE)` findByIdForUpdate)**으로 pick-lock 하여 single-flight 보장(락 후 status 재검 PENDING). 단일 인스턴스 배포면 과설계일 수 있어 **R1 적대검증서 필요성 판정**(idempotency-key만으로 충분한지 vs 락 추가). 기본 채택(방어심층화)하되 리뷰 판단.

### D-854-04 마이그레이션·계약 무변경
DB 스키마·outbox status enum·idempotency-key 계약·cron·max-retry 무변경. 순수 tx 경계+영속 fix. #725 markProcessing IllegalState 가드 KEEP.

## 3. 검증 (풀 캐논)
- **BE IT(실 Postgres·AbstractPostgresIT)**: 기존 outbox 스케줄러 테스트 **부재**→신설. slip-service client @MockBean.
  - ① **성공 영속**: PENDING row → processor.processOne → slip-service 201 → **DB 재조회 status=COMMITTED**·order.slipPublished·history SLIP_PUBLISHED. (버그 시 PENDING 잔류로 RED)
  - ② **재시도 회계 영속**: 5xx → **DB 재조회 status=PENDING·attemptCount=2·nextAttemptAt 미래·lastError**. (버그 시 attemptCount 1 유지로 RED)
  - ③ **FAILED_PERMANENT 영속**: firstAttemptedAt 을 maxRetryHours 초과로 시드 → 5xx → **status=FAILED·order.slipFailedPermanent·history FAILED_PERMANENT**.
  - ④ **중복발행 방지**: 성공 후 status=COMMITTED라 다음 pick 후보 제외(재-processOne 시 pre-check 반환).
  - ⑤ (D-854-03 채택 시) 동시성: 2-thread 동시 processOne → 1회만 발행(락/idempotency).
  - **genuine**: `--rerun-tasks`·skipped=0·ci.yml 등재. self-invocation 원복(직접 호출)하면 ①②③ RED.
- **라이브 QA(실서버)**: 백엔드 스케줄러라 GUI 제약 — 실 Docker(partner-order+postgres+slip mock/실패), 미해소 partnerCode 주문 발행 fail→outbox INSERT→cron/수동 트리거→**outbox DB 상태 전이(attemptCount·FAILED 영속) 실측** + **주문 화면 슬립발행 상태(재시도/실패영구) GUI 캡처**. GUI 불가 지점은 DB 상태+로그로 정직 보완([[feedback_qa_docker_real_test]]·[[feedback_overnight_live_capture]]).

## 4. 스코프
partner-order-service outbox 스케줄러 tx 경계+영속 한정. slip-service·전표 도메인·#853 재설계·outbox 스키마 = 밖. #851(qa-e2e BE trigger)은 별건(B3 잔여).

## 5. 교차검증 (기존 결정)
- [[feedback_self_invocation_transactional_bypass]] — this.method 프록시 우회·별 빈/@Lazy self·HTTP 실경로 검증. **별 빈 추출** 채택.
- [[feedback_it_mockbean_external_clients]] — IT 에서 SlipServiceClient @MockBean(누락 시 Eureka 500).
- #725 markProcessing IllegalState = KEEP(도달불가 sentinel·컨트롤러 없음).
- outbox 설계 at-least-once + idempotency-key(중복 발행 안전) — 무변경.
