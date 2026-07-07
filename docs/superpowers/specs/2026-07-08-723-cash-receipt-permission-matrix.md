# #723 cash-receipts 6+ endpoint 권한 매트릭스 deny-403 test

- 브랜치 `test/723-cash-receipt-permission-matrix` · 이슈 #723 · 연관 #718(발견)·#709(S1 유입)

## 문제
`CashReceiptController`의 endpoint 전부 `@RequirePermission(page="accounting.cash-receipts", action=...)` 존재하나, `AccountingPermissionControllerIT.endpoints()` deny-403 매트릭스엔 **from-bank-transactions(UPDATE)만 등재**. 나머지는 회귀 고정 공백(action 오변경돼도 green).

## 스코프 (정찰 실측 — 미등재 7건)
| endpoint | 매핑 | action |
|---|---|---|
| create | `POST /accounting/cash-receipts` | CREATE |
| list | `GET /accounting/cash-receipts` | VIEW |
| getOne | `GET /accounting/cash-receipts/{id}` | VIEW |
| update | `PATCH /accounting/cash-receipts/{id}` | UPDATE |
| confirm | `POST /accounting/cash-receipts/{id}/confirm` | UPDATE |
| cancel | `POST /accounting/cash-receipts/{id}/cancel` | UPDATE |
| deleteDraft | `DELETE /accounting/cash-receipts/{id}` | DELETE |

## 처방 (형제 패턴 그대로 — `AccountingPermissionControllerIT:266` 미러)
- `endpoints()` 스트림에 7건 `endpoint(name, "accounting.cash-receipts", PermissionAction.X, role, () -> <builder>)` 추가.
- ⚠️ **403 도달 보장**(400/404 마스킹 회피): create/update는 **최소 유효 body**(기존 positive 테스트 body 재사용), `{id}` 는 **유효 UUID 36자**(regex `[0-9a-fA-F-]{36}`) — 400 validation·404·경로 미스매치가 아닌 @RequirePermission 403이 나야 함. positive(`is(not(403))`) 대조도 필요 시.
- action 정확성: 각 endpoint의 실제 @RequirePermission action과 정확히 일치(오등재=tautology 위험).

## 검증
- `./gradlew :services:accounting-service:test --tests "*AccountingPermissionControllerIT*" --rerun-tasks --no-build-cache` — 7건 deny-403 genuine PASS(실 HTTP MockMvc·403·counter). 각 케이스가 403을 실제로 통과(400/404 아님)함을 실측.
- 신규 패키지 CI allowlist 이미 포함(기존 IT 확장이라 무관)·마이그 0.

## 워크플로우
조기 PR → 구현(BE test) → STEP4 Opus 독립 적대검증(genuine·403 도달·action 정확·tautology 아님·Codex Jul11 한도 대체) → 검증 → PM 종합 → CI → 머지.
