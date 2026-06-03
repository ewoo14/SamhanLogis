# 보상 실패 자동 재시도 (outbox/Saga) — 설계 (⑦, D-SER-27)

> ⓑ 보상 saga 완성. ④(실패 알림)에 이어 미해소 보상 실패를 **주기적으로 자동 재시도**해 운영자 수동 정합 부담을 줄인다. slip-service 단독.

## 배경

`serial_compensation_failures`(V31) 는 원격 재고 보상 실패를 append-only 기록한다. #355 복구 API 는 운영자가 수동으로 `resolved=true` 처리. ⑦ 은 **재시도 가능한 보상 동작을 자동 재실행**해 성공 시 자동 해소한다.

## 재시도 디스패치 (attemptedOperation 기반)

- **RELEASE_INSTANCES** → `InventoryClient.releaseInstances(slipNo, productCode)` (저장 필드만으로 재시도 가능).
- **UNRECALL_INSTANCES** → `InventoryClient.unrecallInstances(slipNo, productCode)` (동일).
- **RELEASE/RESERVE 등 수량형** → 재시도에 필요한 productId/warehouseId/quantity 가 감사 행에 없음 → **자동 재시도 제외(WARN 로그 + skip, 수동 정합 대상 유지)**. (시리얼 보상이 본 saga 의 대상.)

## 데이터 (V32, slip_db)

`serial_compensation_failures` 에 재시도 메타 컬럼 추가(append-only 본문은 불변, 재시도 상태만):
- `retry_count INT NOT NULL DEFAULT 0`
- `last_retry_at TIMESTAMP NULL`
- `next_retry_at TIMESTAMP NULL` (지수 백오프 — null 이면 즉시 후보)

## 도메인

- `recordRetrySuccess()` → `resolve()` 위임(해소).
- `recordRetryFailure(reason, nextRetryAt)` → retry_count++, last_retry_at=now, next_retry_at=백오프, failureReason 갱신.
- append-only 본문(slipNo/phase/op 등) 불변. resolved=true 행은 재시도 후보 아님.

## 서비스/스케줄러

- `CompensationRetryService.retryEligible(now, maxRetries)`: `findByResolvedFalseAndRetryEligible`(resolved=false AND retry_count<max AND (next_retry_at IS NULL OR <=now)) → 동작별 디스패치 → 성공 시 recordRetrySuccess + audit(성공 WARN→INFO), 실패 시 recordRetryFailure(지수 백오프). best-effort(개별 실패가 배치 중단 X).
- `CompensationRetryScheduler`: `@Scheduled(cron, zone=Asia/Seoul)` + `@ConditionalOnProperty(samhan.compensation.retry.enabled, 기본 false)` + Clock 주입. (③ retention 패턴 일관.)
- `application.yml` `samhan.compensation.retry.{enabled:false, cron, max-retries:5, backoff-base-minutes:10, zone}`.

## 멱등/안전

- inventory unrecall/release 는 멱등(이미 처리된 상태면 no-op 또는 멱등 응답) — #349 advisory+row lock 기반. 재시도 중복 호출 안전.
- max-retries 도달 시 자동 재시도 중단(수동 정합 대상 유지, resolved=false). 운영 알림(④)은 최초 실패 시 이미 발송.
- 기본 비활성 — 운영 활성 시에만 동작. Clock/now 주입(date-bomb 회피).

## 검증

- 단위: 디스패치 분기(RELEASE_INSTANCES/UNRECALL_INSTANCES/수량형 skip), 성공→resolve, 실패→retry_count++/백오프, max 도달 후보 제외.
- IT(실 Testcontainers, @MockBean InventoryClient): 미해소 행 → 재시도 성공(resolved=true) / 재시도 실패(retry_count 증가+next_retry_at) / max-retries 소진 / next_retry_at 미래면 skip. skipped=0.
- Docker 실 QA: 기본 비활성 미등록 확인. 활성 경로는 IT 갈음.

## 자기검토

- 자동 재시도 대상 = 시리얼 보상(slipNo+productCode 충분). 수량형 제외(데이터 부족). 멱등 재호출 안전. 기본 비활성. max-retries 무한루프 차단. resolved 행 불가침. DECISIONS D-SER-27.
