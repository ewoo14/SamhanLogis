# Codex QA Review — SP-D3 PR #243 Cycle 1

대상 commit: `df337cdd`  
범위: Playwright T1~T5, scenarios, domain integrity, dev-report read-only 검토

## 결론

**Cycle 2 진입 권고. Playwright false-green 계열은 일부 방지됐지만, false-red/self-test 결함과 검증 누락이 있다.**

## Findings

### F-QA-01 [BLOCKER] Playwright false-green self-test 가 자기 자신의 문자열을 매칭해 실패한다

`sp-d3-slip-dispatch-permission-migration.spec.ts` 의 false green 가드는 주석만 제거하고 문자열 literal 은 제거하지 않는다: `clients/desktop/playwright/sp-d3-slip-dispatch-permission-migration/sp-d3-slip-dispatch-permission-migration.spec.ts:964-970`.

그 결과 아래 문자열/정규식 자체가 `codeLines` 에 남아 매칭된다.

- `|| true`: 메시지 문자열과 regex 정의 때문에 2건
- `test.skip(!ok)`: 메시지 문자열과 regex 정의 때문에 2건
- `page.setContent(`: regex 정의 때문에 1건

동일 로직을 PowerShell로 재현한 결과 count는 `2 / 2 / 1` 이다. 따라서 이 테스트는 실제 금지 패턴이 없어도 실패할 수 있다.

### F-QA-02 [BLOCKER] QA 문서의 V9 미발급 정당성이 실제 V7 값과 맞지 않는다

`domain-integrity-check.md` 는 WAREHOUSE의 `purchases.receipt-ocr` view=true, SALES의 `dispatch.board` 없음, WAREHOUSE의 sales hidden 등을 기대한다. 실제 V7은 다음과 다르다.

- `WAREHOUSE purchases.receipt-ocr = FALSE`: `V7__add_role_page_permissions.sql:128`
- `WAREHOUSE sales.slip.list = TRUE`: `V7__add_role_page_permissions.sql:130`
- `SALES dispatch.board = TRUE`: `V7__add_role_page_permissions.sql:118`

따라서 "V7 84 row 에 6 PageCode 이미 포함"만으로 V9 미발급을 정당화할 수 없다. row 존재와 값 정합성은 별개다.

### F-QA-03 [IMPORTANT] T1~T3 hidden 검증이 사용자 요구 ② 전체를 덮지 않는다

현재 Playwright 검증:

- T1 SALES: `sidebar-dispatch-board` hidden 만 확인 (`spec.ts:306-328`)
- T2 WAREHOUSE: `sidebar-dispatch-board`, `sidebar-arologis-sms-send-audit` hidden 만 확인 (`spec.ts:466-495`)
- T3 DISPATCH: 주석에는 `sidebar-purchases` hidden 이 있지만 실제 assertion 은 URL 직접 진입 redirect 중심이며 sidebar hidden assertion 이 없다 (`spec.ts:511-646`)

누락:

- SALES의 구매관리/매입 entry hidden
- WAREHOUSE의 판매관리/매출 entry hidden
- DISPATCH의 판매/구매 entry hidden

특히 AppLayout의 `/sales`, `/purchases` 최상단 링크는 항상 노출되므로, QA가 사용자 요구 ②를 엄격히 검증하지 못한다.

### F-QA-04 [OK] dev server 미가용 시 `test.skip(!ok)` 대신 fail 처리한다

`beforeEach` 에서 `isServerAvailable()` 결과를 `expect(ok).toBe(true)` 로 처리한다: `spec.ts:238-243`. `|| true`, `page.setContent` fallback 도 실제 실행 경로에는 없다.

## QA Decision

**merge blocker.** Playwright guard test 수정, hidden coverage 보강, V7/V9 domain integrity 재정의가 필요하다.
