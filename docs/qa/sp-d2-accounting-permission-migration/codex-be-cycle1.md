# Codex BE Review — SP-D2 cycle 1

대상: PR #242 `feat/sp-d2-accounting-permission-migration` @ `8090c109`  
범위: auth-service `PageCode`/V8 seed, accounting-service controller/service 동적 RBAC 가드, `AccountingDynamicPermissionIT`

## TM 판정

**cycle 2 진입 권고 — merge blocker 있음.**

## Findings

### Blocker 1 — 분개장 FE/BE PageCode 가 다르다

- FE 라우트는 `/accounting/journals*` 전체를 `accounting.journals` 로 보호한다.
  - `clients/desktop/src/renderer/routes/index.tsx:540`
  - `clients/desktop/src/renderer/routes/index.tsx:553`
  - `clients/desktop/src/renderer/routes/index.tsx:563`
  - `clients/desktop/src/renderer/routes/index.tsx:573`
- BE `JournalController` 는 분개 생성/게시/역분개 edit guard 를 `accounting.general-ledger` 로 검사한다.
  - `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/JournalController.java:54`
  - `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/JournalController.java:64`
  - `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/JournalController.java:207`
- auth-service enum/V8 에는 `accounting.journals` 가 별도 PageCode 로 추가되어 있다.
  - `services/auth-service/src/main/java/com/samhanair/logis/auth/domain/PageCode.java:49`
  - `services/auth-service/src/main/resources/db/migration/V8__sp_d2_accounting_page_permissions.sql:32`

영향: 권한 매트릭스에서 `accounting.journals` 를 revoke/grant 해도 BE mutation 은 `accounting.general-ledger` 를 본다. UI와 API 계약이 분리되어 직접 API 호출/회귀 테스트에서 다른 권한 정책이 적용된다.

권고: `JournalController` 의 동적 권한 코드를 `accounting.journals` 로 맞추거나, FE/V8/PageCode 에서 분개장을 `accounting.general-ledger` 공유 정책으로 되돌려 한쪽으로 통일.

### Blocker 2 — 세금계산서 create/update 라우트와 BE edit PageCode 가 다르다

- FE 신규/편집 라우트는 `accounting.tax-invoice.emit-nts` 로 보호한다.
  - `clients/desktop/src/renderer/routes/index.tsx:1110`
  - `clients/desktop/src/renderer/routes/index.tsx:1130`
- BE `TaxInvoiceController#create/update` 는 `accounting.tax-invoice.list` 의 edit/view 조합으로 검사한다.
  - `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/TaxInvoiceController.java:73`
  - `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/TaxInvoiceController.java:95`
  - `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/TaxInvoiceController.java:112`
  - `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/TaxInvoiceController.java:308`

영향: 사용자가 `emit-nts` 를 revoke 했는데 `tax-invoice.list` edit 이 남아 있으면 UI는 신규/편집을 숨기지만 BE 직접 호출은 다른 권한으로 판단한다. 반대 조합도 동일하게 예측 불가능하다.

권고: 세금계산서 목록/작성/편집/발행의 PageCode 정책을 명시하고 FE/BE를 같은 코드로 맞춘다. 실제 NTS 전송은 `TaxInvoiceEmitService` 의 `accounting.tax-invoice.emit-nts` 유지가 타당하다.

### Major 1 — `AccountingReportController` 는 일부 endpoint 만 동적 가드를 호출한다

- `aggregate` 는 `accounting.reports` 를 검사한다.
  - `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/AccountingReportController.java:116`
- `statementBatch` 는 `accounting.statement-batch` 를 검사한다.
  - `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/AccountingReportController.java:145`
- 하지만 `ledger-data`, legacy hometax export, hometax preview/split/exclusion/history, daily detail 은 role header 를 받지 않거나 동적 guard 호출이 없다.
  - `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/AccountingReportController.java:127`
  - `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/AccountingReportController.java:161`
  - `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/AccountingReportController.java:213`
  - `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/AccountingReportController.java:241`
  - `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/AccountingReportController.java:265`
  - `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/AccountingReportController.java:287`
  - `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/AccountingReportController.java:312`
  - `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/AccountingReportController.java:334`
  - `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/AccountingReportController.java:362`

영향: FE 는 `/accounting/hometax-export` 와 `/accounting/partner-ledger` 를 `accounting.partner-ledger` 로 보호하지만, BE 는 해당 호출을 같은 PageCode 로 보지 않는다. SP-D2 권한 매트릭스의 의미가 endpoint 단위로 일관되지 않다.

권고: `AccountingReportController` endpoint 를 실제 FE route PageCode 별로 분류하고 `X-User-Role` 기반 guard 를 모두 호출한다. VIEW fallback 허용 정책은 유지하더라도 최소한 같은 PageCode 로 관측/로그가 남아야 한다.

### Pass Notes

- `ReportPermissionGuard` 공유 컴포넌트는 10개 report controller 에 일관 적용되어 있다.
- `canEdit=false + canView=true -> 403`, `canEdit=false + canView=false -> fallback 통과` 패턴은 DailyClosing/DepositMatch/Journal/SupplierProfile/MonthEndClose edit guard 에 대체로 동일하다.
- V8 은 `pgcrypto` 를 중복 선언하지 않으며, V7 에 `CREATE EXTENSION IF NOT EXISTS "pgcrypto"` 가 있어 중복 불필요 판단은 맞다.
