# #854 — SlipPublishOutboxScheduler self-invocation @Transactional 우회 fix (기획 spec)

> OPUS 기획 · **워크플로우 변경(2026-07-20 기획검수 폐지) 후 첫 슬라이스** — 신 파이프라인: OPUS 기획(본 spec·조기 PR) → CODEX LUNA 구현 → OPUS R1 5-agent 적대검증+fix+라이브QA → CODEX SOL R2 5-agent+LUNA fix → 0수렴 → PM 종합 머지.
> 성격: **pre-existing 실버그(회계 미영속)**. #853 전표 거래처 필수화 fail-closed가 노출. partner-order-service 범위.
>
> ⚠️ **후속 라운드가 대체한 기획 결정 (본 spec 본문보다 우선)** — 상세는 `docs/dev-reports/2026-07-20-854-outbox-selfinvocation-tx.md`.
> - **D-854-01/03/04 의 `markProcessing()`·`IllegalState` 가드·"#725 KEEP"** → **R2 native claim(FOR UPDATE SKIP LOCKED)이 대체**하고 **R3 에서 메서드 자체를 제거**했다. 본 spec 의 해당 서술은 폐기된 결정으로 읽는다.
> - **§3 "self-invocation 원복 시 RED"** → **R1 에서 거짓으로 판명**(명시 save 가 tx 없이도 각자 영속). tx-경계 genuine 가드로 대체.
> - **D-854-06 4xx 분류** → **R4 에서 구현이 spec 을 위반하고 있었음이 확인**(408/429 미분기)되어 코드를 spec 에 맞춰 정정하고, `permanent-error-min-attempts`(기본 2)를 추가했다.
> - **처리 상한** → **R4 에서 `expireIfExhausted`(claim 시점 종결 가드)** 가 추가되어, `handleRetry` 도달 여부와 무관하게 max-retry-hours 가 보장된다. 단 이 가드는 **정책도 함께 바꿨다** — 24h 초과 row 는 HTTP 재시도 0회로 종결된다(다운스트림이 claim 직전 복구됐어도 예외 없음). 상세는 dev-report "[정책 명시]" 절.
> - **§3 라이브 QA "주문 화면 슬립발행 상태 GUI 캡처"** → 최초 라운드들은 "GUI 없는 백엔드 스케줄러라 grep 0매치"로 이 항목을 dormant 관찰로 대체했으나, **R4 Track 2 에서 FE 표시 면(design-system Badge "전표 발행 대기"/"전표 발행 실패")이 실제로 구현**되어 원 spec 의 이 항목이 뒤늦게 충족됐다.
> - **관측/알림 배선 + 재발행 runbook** → 최초 라운드는 스코프 밖(§4)이었으나 **R4 Track 2 가 Micrometer counter + Prometheus rule + CloudWatch metric filter/alarm + runbook 을 신설**했고, **R5 6차원 적대검증이 그 로그 원천(prod awslogs driver 누락)과 runbook 재발행 절차의 순환 참조를 지적**해 같은 PR 에서 재정정했다. 상세는 dev-report 의 "R4 Track 2"·"R5" 절.

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

---

# R2 fix 스펙 (CODEX SOL R2 발견 → 개발책임자 3건 "지금 fix" · OPUS 기획)

> CODEX SOL R2(MED6·LOW2·머지 보류) 후속. 성격: R1 하드닝 위 2차 정확성/정석화. fix=CODEX LUNA 5.6.

## D-854-05 비관락 → FOR UPDATE SKIP LOCKED claim/lease 정석 전환 (핵심·재아키텍처)
**문제(R2 동시성 MED2)**: ①멀티인스턴스가 동일 정렬 첫 batch를 함께 pick→blocking convoy(후발 pod 처리량 0) ②락+DB커넥션을 slip HTTP 전구간 보유(@Transactional(timeout=20)은 동기 HTTP 미중단).

**전환** — HTTP를 DB 락 밖에서 수행하는 claim/lease 패턴:
1. **원자 claim (스케줄러·짧은 tx)**: 네이티브 `UPDATE slip_publish_outbox SET status='PROCESSING', last_attempted_at=now() WHERE id IN (SELECT id FROM slip_publish_outbox WHERE is_deleted=false AND ((status='PENDING' AND next_attempt_at<=now()) OR (status='PROCESSING' AND last_attempted_at < now() - :leaseInterval)) ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT :batch) RETURNING *`. SKIP LOCKED로 worker별 **disjoint 행 claim**(convoy 해소)·stale PROCESSING(lease 만료) **동시 reclaim**(크래시 복구). `last_attempted_at`을 lease 마커로 재사용(신규 컬럼 불요).
2. **처리 (락 없음·per-row)**: claim된 각 row에 slip HTTP 호출(DB 락/커넥션 미보유 → lock-across-IO 해소). connect2s/read5s가 실제 시간 bound.
3. **결과 (per-row 짧은 tx)**: `findById` 재조회 → **status가 여전히 PROCESSING일 때만** markCommitted/handleRetry(아니면 다른 worker/reaper가 인수 → skip) + 명시 save + order/history. per-row 독립 tx 유지(row 실패가 batch 미차단).
4. **lease**: `samhan.outbox.lease-seconds`(기본 60s·> connect2s+read5s+마진). reaper=별도 컴포넌트 불필요(claim WHERE의 stale PROCESSING OR절이 겸함).
5. **markProcessing #725 가드 조정**: PENDING→PROCESSING(신규 claim) **및 PROCESSING→PROCESSING(stale reclaim)** 허용하도록 완화(claim이 네이티브 UPDATE라 엔티티 markProcessing 우회 가능 — 가드는 결과 tx의 상태 재검으로 대체). #725 sentinel 무의미화 주석.
6. **idempotency**: HTTP 후 결과 tx 전 크래시 → reaper 재claim → 재발행 → slip idempotency-key replay(at-least-once 유지).

## D-854-06 4xx/5xx 재시도 분류 (fail-fast)
**문제(R2 BE MED·PRE)**: 모든 BusinessException이 handleRetry→24h 재시도. 복구불가 400/409도 24h 반복.
**분류**: handleRetry(또는 호출부)가 ErrorCode 판정 —
- **즉시 FAILED_PERMANENT**(terminal): `INVALID_INPUT`(400)·`CONFLICT`(409·동일키 다른본문). order.markSlipFailedPermanent + history.
- **재시도**(transient): `INTERNAL_ERROR`(5xx)·`UNAUTHORIZED`(401)·`FORBIDDEN`(403)·408/429/network. (401/403=배포중 토큰/전파 지연 가능성 → 재시도, 24h 후 FAILED_PERMANENT 수렴). SlipServiceClient가 이미 상태→ErrorCode 매핑(:103 근방).

## D-854-07 history enum 오표기 정정 (마이그 불요)
**문제(R2 Design MED·PRE)**: FAILED_PERMANENT를 `SLIP_RETRY_QUEUED`로 기록.
**정정**: `HistoryEventType`에 `SLIP_FAILED_PERMANENT` 추가 + handleRetry의 FAILED 분기에서 사용. **마이그 불필요**(partner_order_history.event_type=VARCHAR(30) NO CHECK 제약 확인·"SLIP_FAILED_PERMANENT"=21자<30 → D-854-04 무마이그 스코프 보존). IT ③ 기대값 SLIP_FAILED_PERMANENT로 변경.

## R2 in-scope 테스트/CI 보강 (논의 불요)
- **F2 롤백 IT**: 발행 성공 후 order/history save 예외 주입 → outbox PENDING(COMMITTED 아님)·order 미변경·동일키 replay 단언(fresh DB). (F2가 catch 안으로 되돌아가면 RED)
- **timeout/clone constructor 테스트**: SlipServiceClient가 builder.clone 호출·원본 비변이·requestFactory connect2000/read5000ms 캡처 단언(mockBoundBuilder no-op가 가리던 계약). 기존 HTTP 계약 테스트와 별도.
- **ci.yml 게이트**: SlipPublishOutboxProcessorIT `tests>=N`(또는 필수 testcase 이름) 추가(테스트 삭제 시 통과 방지).
- **barrier(LOW)**: pg_locks 전역 대신 worker2 PID + `pg_blocking_pids()` 결속(가능 시).

## D-854-05 검증 (claim/lease IT)
- **claim disjoint**: 2 worker 동시 claim → 서로 다른 행(중복 processing 0)·SKIP LOCKED.
- **reaper reclaim**: PROCESSING·last_attempted_at 과거(lease 만료) row → 다음 claim이 재점유 → 처리 종결.
- **HTTP-outside-lock**: 발행 중 다른 worker가 동일 창구 아닌 타 행 진행(블로킹 없음) — 관측 가능하면.
- **결과 tx 상태재검**: PROCESSING 아닌 row 결과 적용 skip.
- 기존 성공/재시도/FAILED/tx-active/parse-storm/경계 IT 유지 or claim 경로에 맞게 갱신. skipped=0·--rerun-tasks.
