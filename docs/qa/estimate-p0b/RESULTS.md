# P0-B 전표발행 /from-estimate 연결 — 실 Docker QA 결과

- 일시: 2026-06-10 / branch `feat/estimate-p0b-from-estimate-internal-token`
- 방법: **실 로컬 Docker 스택**(samhan-slip-service 본 PR 코드로 재빌드·재기동 + 실 Postgres `slip_db`) 대상 curl + 실 slip-bridge 코드 E2E. 실 product DB 의 ACTIVE SINGLE 모델(`AR05TXEAAWKNEU-01`/`AR06TXEAAWKNEU-02`)·실 partner 코드(`P0-6-C001`) 사용 — 가짜 데이터 0.

## 토큰 게이트 enforcement (실 HTTP)

| # | 시나리오 | 결과 | 판정 |
|---|---|---|---|
| ① | 유효 X-Internal-Token → POST `/internal/slips/from-estimate` | **201** `slipNo=2026/06/10-1` DRAFT, sourceId 보존 | ✅ |
| ② | 토큰 미제시 | **403** (미인증 → authenticated() 차단) | ✅ |
| ③ | 토큰 불일치 | **401** `내부 인증 토큰이 유효하지 않습니다` (filter 즉시 차단) | ✅ |
| ④ | 멱등 재호출(같은 Idempotency-Key+같은 본문) | **200** `idempotentReplay=true`, 동일 slipId | ✅ |

## estimate-app 실 slip-bridge E2E (코드 경로 그대로)

`SLIP_SERVICE_URL`+`SAMHAN_INTERNAL_TOKEN` env 로 `postSlip()` 직접 호출:
- `ok=true`, **slipNo `2026/06/10-2` 봉투 언래핑 정상**(ApiResponse.data.slipNo — 기존 코드는 가짜 `SLP-${Date.now()}` fallback 이던 버그 fix 실증).
- estimateNumber 미전달 → **`WEB-20260610-<ts>` fallback 생성**(@NotBlank 계약 충족), qty String 계약.

## DB 실증 (실 Postgres slip_db)

```
2026/06/10-2|DRAFT|WEB-20260610-...|AR06TXEAAWKNEU-02|3|550000.00|브리지QA|system-internal
2026/06/10-1|DRAFT|WEB-QA-P0B-001  |AR05TXEAAWKNEU-01|2|1000000.00|실QA  |system-internal
```
- slipNo **슬래시 표준**(YYYY/MM/DD-N), 한글 spec 무결, `created_by=system-internal`(내부 토큰 principal audit 추적).
- QA 잔여물 정리 완료: slips/slip_lines/slip_publish_audit 각 2건 삭제, 잔존 0 확인.

## 테스트

- estimate-app jest **51/51 PASS** (slip-bridge URL/봉투/qty/estimateNumber fallback 계약 갱신).
- slip-service 로컬 전체 테스트 879건 0 실패(Testcontainers IT 374건 Windows skip — 신규 `InternalSlipPublishControllerIT` 4케이스는 CI Linux 실행 + 본 실 Docker QA 가 동일 시나리오 실증).
