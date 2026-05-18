# Codex FE Review — SP-D2 cycle 1

대상: PR #242 `feat/sp-d2-accounting-permission-migration` @ `8090c109`  
범위: `permissionsApi`, route `PermissionGuard`, `AppLayout`, `PermissionMatrixPage`, mock API

## TM 판정

**cycle 2 진입 권고 — hidden 보장/route-code 매핑에 blocker 있음.**

## Findings

### Blocker 1 — SALES hidden 보장이 실제 seed/mock 와 충돌한다

- `AppLayout` 은 `showAccountingTaxInvoice = emit-nts || tax-invoice.list` 로 세금계산서 메뉴를 노출한다.
  - `clients/desktop/src/renderer/components/AppLayout.tsx:214`
  - `clients/desktop/src/renderer/components/AppLayout.tsx:465`
- mock 기본 권한은 SALES 에게 `accounting.tax-invoice.list` view 를 준다.
  - `clients/desktop/src/renderer/api/mock.ts:5607`
- 실제 V7 seed 도 SALES 에게 `accounting.tax-invoice.list` view=true 를 준다.
  - `services/auth-service/src/main/resources/db/migration/V7__add_role_page_permissions.sql:109`
- 사용자 요구는 SALES 회계 hidden 이고, QA 시나리오도 SALES `permissions/my` 에 회계 pageCode 가 없어야 한다고 적고 있다.
  - `docs/qa/sp-d2-accounting-permission-migration/scenarios/sp-d2-scenarios.md:42`
  - `docs/qa/sp-d2-accounting-permission-migration/scenarios/sp-d2-scenarios.md:46`

영향: 기본 mock/seed 기준 SALES 는 회계 세금계산서 메뉴가 보일 수 있다. 라우트는 `RoleGuard` 가 막더라도 "hidden 보장" 요구와 다르다.

권고: SP-D2 정책이 SALES hidden 이라면 V7 보정 migration 또는 V8 update 로 SALES `accounting.tax-invoice.list` 를 false 처리하고 mock seed 도 동일하게 맞춘다. 반대로 SALES 세금계산서 list 접근이 의도라면 QA/요구사항을 수정해야 한다.

### Blocker 2 — `showAccounting` 의 정적 OR fallback 이 로딩 이후에도 남는다

- `showAccounting` 은 모든 동적 권한이 false 여도 `canAccessAccounting(auth?.role)` 로 ACCOUNTANT/MANAGER/MASTER 에게 회계 그룹을 노출한다.
  - `clients/desktop/src/renderer/components/AppLayout.tsx:220`
  - `clients/desktop/src/renderer/components/AppLayout.tsx:226`
- 이 값은 "로딩 중 fallback" 이 아니라 렌더마다 영구 OR 로 적용된다. `usePermissions().isLoading` 을 보지 않는다.
- 특히 `sidebar-accounting-sales-closing` 은 `show={showAccounting}` 를 그대로 써서, 모든 동적 회계 권한이 revoke 되어도 회계 하위 메뉴가 남을 수 있다.
  - `clients/desktop/src/renderer/components/AppLayout.tsx:569`

영향: "회색 비활성 X, 완전 hidden" 요구와 맞지 않는다. 개별 `SidebarLink` 는 `return null` 패턴이라도 그룹/일부 메뉴는 정적 fallback 때문에 남는다.

권고: `usePermissions` 의 `isLoading` 을 AppLayout 에서 함께 받아 로딩 중에만 정적 fallback 을 허용하고, 로딩 완료 후에는 동적 권한만으로 show 값을 결정한다. `sales-closing` 도 별도 PageCode 또는 명시 정책을 부여해야 한다.

### Blocker 3 — FE route PageCode 와 BE 일부 PageCode 가 불일치한다

- FE 분개 라우트: `accounting.journals`
  - `clients/desktop/src/renderer/routes/index.tsx:543`
  - `clients/desktop/src/renderer/routes/index.tsx:553`
  - `clients/desktop/src/renderer/routes/index.tsx:563`
  - `clients/desktop/src/renderer/routes/index.tsx:573`
- BE 분개 edit guard: `accounting.general-ledger`
  - `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/JournalController.java:64`
- FE 세금계산서 신규/편집: `accounting.tax-invoice.emit-nts`
  - `clients/desktop/src/renderer/routes/index.tsx:1110`
  - `clients/desktop/src/renderer/routes/index.tsx:1130`
- BE 세금계산서 create/update edit guard: `accounting.tax-invoice.list`
  - `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/TaxInvoiceController.java:308`

영향: PermissionGuard 는 통과/차단했는데 API 는 다른 권한을 검사하는 상태가 된다.

권고: route PageCode 표를 단일 source 로 만들고 BE endpoint guard 와 대조하는 테스트를 추가한다.

### Pass Notes

- `permissionsApi` 는 SP-D1 cycle 2 회귀 가드인 `/auth/admin/permissions/my` endpoint 와 `res.data.data` 파싱을 유지한다.
- FE `PageCode` union 은 `PageCode.java` 의 dot-separated 코드 체계와 맞다.
- `SidebarLink` 자체는 `show=false` 일 때 `return null` 이므로 회색 disabled 패턴은 쓰지 않는다.
