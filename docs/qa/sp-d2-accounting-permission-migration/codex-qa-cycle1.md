# Codex QA Review — SP-D2 cycle 1

대상: PR #242 `feat/sp-d2-accounting-permission-migration` @ `8090c109`  
범위: Playwright spec, scenarios, domain integrity SQL, dev-report

## TM 판정

**cycle 2 진입 권고 — QA 산출물이 현재 구현을 검증하지 못한다.**

## Findings

### Blocker 1 — Playwright permission fixture 가 신규 7개 PageCode 를 누락한다

- T1 `ACCOUNTING_ROUTES` 는 계정과목/분개장/시산표/보고서/월말마감/거래명세서/거래처원장을 여전히 기존 4~5개 PageCode 로 매핑한다.
  - `clients/desktop/playwright/sp-d2-accounting-permission-migration/sp-d2-accounting-permission-migration.spec.ts:120`
  - `clients/desktop/playwright/sp-d2-accounting-permission-migration/sp-d2-accounting-permission-migration.spec.ts:130`
  - `clients/desktop/playwright/sp-d2-accounting-permission-migration/sp-d2-accounting-permission-migration.spec.ts:137`
  - `clients/desktop/playwright/sp-d2-accounting-permission-migration/sp-d2-accounting-permission-migration.spec.ts:179`
  - `clients/desktop/playwright/sp-d2-accounting-permission-migration/sp-d2-accounting-permission-migration.spec.ts:186`
  - `clients/desktop/playwright/sp-d2-accounting-permission-migration/sp-d2-accounting-permission-migration.spec.ts:193`
  - `clients/desktop/playwright/sp-d2-accounting-permission-migration/sp-d2-accounting-permission-migration.spec.ts:200`
- `buildAccountantFullPermissions()` 는 신규 7개 PageCode 를 반환하지 않는다.
  - `clients/desktop/playwright/sp-d2-accounting-permission-migration/sp-d2-accounting-permission-migration.spec.ts:209`
  - `clients/desktop/playwright/sp-d2-accounting-permission-migration/sp-d2-accounting-permission-migration.spec.ts:218`
- 실제 route 는 `accounting.accounts`, `accounting.journals`, `accounting.balances`, `accounting.reports`, `accounting.period-close`, `accounting.statement-batch`, `accounting.partner-ledger` 를 사용한다.
  - `clients/desktop/src/renderer/routes/index.tsx:543`
  - `clients/desktop/src/renderer/routes/index.tsx:583`
  - `clients/desktop/src/renderer/routes/index.tsx:597`
  - `clients/desktop/src/renderer/routes/index.tsx:1017`
  - `clients/desktop/src/renderer/routes/index.tsx:816`
  - `clients/desktop/src/renderer/routes/index.tsx:844`

영향: T1/T3/T4 는 SP-D2의 핵심인 신규 7개 PageCode migration 을 검증하지 못하거나, 실제 앱에서는 redirect 되는 fixture 를 "접근 가능"으로 기대할 수 있다.

권고: Playwright fixture 를 V7+V8 총 19개 PageCode 기준으로 갱신하고, revoke 시나리오도 `accounting.accounts` revoke, `accounting.journals` revoke 등 실제 route code 로 분리한다.

### Blocker 2 — hidden 보장 TC 가 실제 기본 seed 를 검증하지 않는다

- T2 는 `permissions/my` 를 "회계 pageCode 없음"으로 강제 mock 한다.
  - `clients/desktop/playwright/sp-d2-accounting-permission-migration/sp-d2-accounting-permission-migration.spec.ts:236`
  - `clients/desktop/playwright/sp-d2-accounting-permission-migration/sp-d2-accounting-permission-migration.spec.ts:244`
- 그러나 mock 기본 seed 는 SALES 에게 `accounting.tax-invoice.list` view 를 준다.
  - `clients/desktop/src/renderer/api/mock.ts:5607`
- 실제 V7 seed 도 SALES `accounting.tax-invoice.list` view=true 다.
  - `services/auth-service/src/main/resources/db/migration/V7__add_role_page_permissions.sql:109`

영향: T2는 요구사항을 만족하는 인위 fixture 만 검증한다. 실제 default DB/mock 조합에서 SALES hidden 이 깨지는지 잡지 못한다.

권고: 별도 fixture override 없이 mock 기본 로그인 SALES 로 sidebar hidden 을 검증하는 TC 를 추가하거나, seed/mock 를 먼저 수정한다.

### Major 1 — domain integrity SQL 이 실제 테이블명/컬럼명과 다르다

- 문서는 `page_permission`, `deleted_at` 을 사용한다.
  - `docs/qa/sp-d2-accounting-permission-migration/domain-integrity-check.md:17`
  - `docs/qa/sp-d2-accounting-permission-migration/domain-integrity-check.md:25`
- 실제 V7/V8 테이블은 `role_page_permissions`, soft delete 컬럼은 `is_deleted` 다.
  - `services/auth-service/src/main/resources/db/migration/V7__add_role_page_permissions.sql:16`
  - `services/auth-service/src/main/resources/db/migration/V7__add_role_page_permissions.sql:26`
  - `services/auth-service/src/main/resources/db/migration/V8__sp_d2_accounting_page_permissions.sql:25`

영향: 도메인 정합성 SQL 을 그대로 실행하면 실패하거나 잘못된 테이블을 본다.

권고: SQL 전체를 `role_page_permissions WHERE is_deleted = FALSE` 기준으로 갱신하고, 기대 row 도 5종이 아니라 V7 5종 + V8 7종 회계 PageCode 기준으로 바꾼다.

### Major 2 — scenarios/dev-report 가 구현 후 상태와 다르다

- scenarios 는 ACCOUNTANT 권한을 "5개 회계 pageCode" 로 설명한다.
  - `docs/qa/sp-d2-accounting-permission-migration/scenarios/sp-d2-scenarios.md:26`
- dev-report route 표도 신규 7개를 `accounting.tax-invoice.list`/`daily-closing` 으로 묶은 이전 설계를 적고 있다.
  - `docs/dev-reports/sp-d2-accounting-permission-migration.md:26`
  - `docs/dev-reports/sp-d2-accounting-permission-migration.md:37`
- dev-report 는 "SP-D2 신규 Flyway 없음"이라고 쓰지만 실제 변경에는 V8 migration 이 있다.
  - `docs/dev-reports/sp-d2-accounting-permission-migration.md:155`
  - `services/auth-service/src/main/resources/db/migration/V8__sp_d2_accounting_page_permissions.sql:1`

영향: PR 본문/검증 근거로 사용하기 어렵다.

권고: 문서 3종을 현재 구현 기준으로 재생성하고, Playwright/IT case 표도 실제 assert 값으로 고정한다.
