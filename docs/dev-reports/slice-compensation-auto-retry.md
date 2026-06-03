# Slice: 보상 실패 자동 재시도 (outbox/Saga, D-SER-27)

> branch `feat/compensation-auto-retry` / 2026-06-03 / slip-service 단독.
> ⓑ 보상 saga 완성 — ④(실패 알림)에 이어 미해소 보상 실패를 주기적으로 **자동 재시도**해 성공 시 자동 해소.

## 1. 구현

- **V32**: `serial_compensation_failures` 에 `retry_count/last_retry_at/next_retry_at` 추가(append-only 본문 불변, 재시도 상태만) + `idx_serial_comp_retry_candidate` 부분 인덱스(is_deleted=false).
- **도메인**: `recordRetrySuccess(retriedAt)`(retry_count++/lastRetryAt/resolve), `recordRetryFailure(retriedAt, nextRetryAt)`(retry_count++/백오프). 생성자 retry 필드 0/null 초기화.
- **Repository**: `findRetryCandidates(maxRetries, now)` — resolved=false AND retry_count<max AND (next_retry_at IS NULL OR ≤now), occurred_at ASC.
- **CompensationRetryService**(@Transactional, best-effort): 동작별 디스패치 — `RELEASE_INSTANCES`→`releaseInstances(slipNo,productCode)`, `UNRECALL_INSTANCES`→`unrecallInstances(slipNo,productCode)`. 수량형(RELEASE/RESERVE)은 식별자 부족 → **skip+WARN**(수동 정합 유지). 성공→recordRetrySuccess, 실패→recordRetryFailure(지수 백오프 `now + base*2^retryCount`). 개별 실패가 배치 중단 X. RetryResult 요약.
- **CompensationRetryScheduler**: `@Scheduled(cron, zone=Asia/Seoul)` + `@ConditionalOnProperty(samhan.compensation.retry.enabled, 기본 false)`. (③ retention 패턴.)
- **application.yml** `compensation.retry.{enabled:false, cron:"0 */10 * * * *", max-retries:5, backoff-base-minutes:10}` env override.

## 2. 멱등/안전

- inventory unrecall/release 멱등(#349 advisory+row lock) — 중복 재호출 안전.
- max-retries 도달 시 자동 재시도 중단(resolved=false 유지, 수동 정합 대상). 최초 실패 알림(④)은 이미 발송.
- 기본 비활성 — 운영 활성 시에만. Clock/now 주입(date-bomb 회피). resolved 행 불가침.

## 3. 검증

- 단위 `CompensationRetryServiceTest` 4: 수량형 skip(inventory 미호출), RELEASE_INSTANCES 성공→resolve, 실패 지수 백오프(base*2^retryCount), 후보 0.
- IT(실 Testcontainers, @MockBean InventoryClient) `CompensationRetryServiceIT` 5: 성공 해소+retry_count, 실패 retry_count++/next_retry_at, max-retries 후보 제외, 미래 백오프 skip, resolved 후보 제외. **skip0/fail0/err0**.

## 3.5 리뷰 반영 (Claude 5-team + Codex)

- **트랜잭션 정합(BE P0)**: 단일 `@Transactional` 내 HTTP 다건 루프 → 커넥션 장시간 점유 + flush 예외 롤백 정합 불일치. → **`CompensationRetryExecutor`(REQUIRES_NEW per-failure)** 분리(선례 CompensationAuditWriter). 오케스트레이터는 후보 id 만 조회 후 건별 위임 — 커넥션 건 사이 반납, 실패 격리.
- **동시성(BE/Codex P1)**: findRetryCandidates 락 없음 → 다중 인스턴스 retry_count 이중 증가. → executor 가 **`findByIdForUpdate`(PESSIMISTIC_WRITE) 행 락** + 락 후 resolved 재확인(GONE). inventory 멱등(#349)과 이중 안전망.
- **백오프 오버플로(BE P1)**: `1L << retryCount` 가 max-retries env override 과대 시 음수→과거→무한루프. → `Math.min(retryCount, 30)` 상한 클램프 + Javadoc 명확화(갱신 전 retryCount 지수).
- **테스트 강화(QA P0/P1)**: IT 실패 케이스 resolved=false 단언 + 백오프 차이(last↔next=10분, 타임존 무관) 단언, max-retries 경계(retry_count=4 후보 포함), next_retry_at 등호 경계 후보, occurred_at ASC 순서(InOrder). 단위 혼합 배치(성공+실패+skip+GONE 집계) + executor 디스패치/락후 재확인.

## 4. 후속

- **Phase 11 활성화**: `SAMHAN_COMPENSATION_RETRY_ENABLED=true` (retention/alert 활성화와 동반 컷오버).
- 수량형(RELEASE) 자동 재시도는 식별자(productId/warehouseId/quantity) 감사 보강이 선결 — 별도.
