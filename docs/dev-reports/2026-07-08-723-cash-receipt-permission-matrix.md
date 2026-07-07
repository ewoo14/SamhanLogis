# #723 cash-receipts 권한 매트릭스 deny-403 test 등재

- PR #766 · 브랜치 `test/723-cash-receipt-permission-matrix` · 이슈 #723 · 연관 #718(발견)·#709(S1 유입)

## 문제
`CashReceiptController` 전 endpoint에 `@RequirePermission(page="accounting.cash-receipts")` 존재하나, `AccountingPermissionControllerIT.endpoints()` deny-403 매트릭스엔 from-bank-transactions(UPDATE)만 등재 → 나머지는 action 오변경돼도 green이던 회귀 고정 공백(E3 S1 #709 유입 부채·#718 재검 발견).

## 구현 (형제 패턴 미러)
`endpoints()` 매트릭스에 미등재 7건 등재(action=CashReceiptController 원문 대조 일치):
| name | 매핑 | action | body |
|---|---|---|---|
| create | POST /accounting/cash-receipts | CREATE | JSON(amount·transactionDate) |
| list | GET /accounting/cash-receipts | VIEW | — |
| getOne | GET /accounting/cash-receipts/{id} | VIEW | — |
| update | PATCH /accounting/cash-receipts/{id} | UPDATE | JSON |
| confirm | POST /accounting/cash-receipts/{id}/confirm | UPDATE | — |
| cancel | POST /accounting/cash-receipts/{id}/cancel | UPDATE | — |
| deleteDraft | DELETE /accounting/cash-receipts/{id} | DELETE | — |

## 403 genuine 도달 실증 (400/404 마스킹 아님·tautology 아님)
- deny 테스트가 `status().isForbidden()`(exactly 403) + `PermissionGuardMetrics` 카운터 +1 단언 — 카운터는 `PermissionAspect.deny()` 내부에서만 증가 → 통과 = @Valid 통과 후 **AOP 권한계층 도달** 기계적 증거(400/404면 AOP 미실행·카운터 불변으로 FAIL).
- **음성 대조 실험**: create body를 `{}`로 바꾸면 실제 400 발생(403 미도달)→테스트 FAIL 실측 → 유효 body로 원복. create/update의 최소 유효 body가 403 도달의 전제임을 실증. `{id}`=검증된 `ID` 상수(36자 UUID)로 라우팅 404 회피.

## 검증 (genuine·`--rerun-tasks --no-build-cache`)
- `AccountingPermissionControllerIT`: **74 tests 0 fail**(cash receipt 16 케이스=7신규+1기존×grant/deny).
- accounting-service 모듈 전체: **1163 tests 0 fail**(10 skip=기존 Windows Docker 의존·무관). 프로덕션 코드 무변경.
- null-safety 경고(MockMvc builder/MediaType)는 기존 sibling과 동일 패턴(비차단).
