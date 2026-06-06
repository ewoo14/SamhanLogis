# dev-report — 권한그룹 C5 후속 정리 통합

> 2026-06-06. 브랜치 `fix/permission-groups-c5-followup-cleanup`.
> 계획서: `docs/superpowers/plans/2026-06-06-permission-groups-c5-followup-cleanup-plan.md`

## 1. 범위

### S1. arologis CORS Javadoc 명확화

- `arologis-service SecurityConfig` 의 CORS 설명을 "아로로지스 전용 JWT/role-mode 정책"으로 명확화했다.
- `exposedHeaders` wire format 은 변경하지 않았다.
  - arologis 는 자체 JWT role 시맨틱 호환 때문에 `X-User-Role` exposed header 를 유지한다.
  - Samhan Public gateway 의 `X-User-Groups` 노출 정책을 복제하지 않는다.

### S2. downstream HeaderAuthenticationFilter role authority dead-code 제거

- 14개 서비스 `HeaderAuthenticationFilter` 에서 `X-User-Role` 파싱과 `ROLE_` authority 생성을 제거했다.
- 모든 필터는 `X-User-Groups` 기반 `GROUP_<uuid>` authority 만 생성한다.
- `X-User-Role` 이 수신되어도 무시되는 회귀 테스트를 14개 서비스에 추가했다.
- `api-gateway CorsConfig` exposed headers 에서 `X-User-Role` 을 제거했다.
- `HttpHeaderConstants.CALLER_ROLE_HEADER` 는 제거하지 않았다.
  - grep 결과 partner-order-service IT 들이 테스트 identity/legacy role-mode 문맥에서 아직 사용한다.
  - 상수 Javadoc 에 "gateway/downstream user authority 용도 아님"을 명시했다.
- `accounting-service /actuator/prometheus` 의 마지막 non-internal role gate 는 `authenticated()` 로 전환했다.
- `inventory-service InspectionAttachmentController` 의 중복 `hasAnyRole('MANAGER','MASTER')` 는 제거하고 `@RequirePermission` 단일 가드만 남겼다.

### S3. desktop AppLayout 정적 role fallback 제거

- BE `@RequirePermission` page-code 가 존재하는 사이드바 항목은 `usePermissions().canAccess(pageCode, 'view')` 로 전환했다.
- arologis role-mode 메뉴 6개는 role 문자열 대신 `hasBuiltinRoleGroup(auth, ...)` 로 V43 빌트인 role-group UUID 를 내부 매칭한다.
- 다음 정적 fallback helper/상수는 `clients/desktop/src/renderer` 에서 제거됐다.
  - `canAccessAccounting`, `canAccessAdmin`, `canAccessAudit`, `canAccessAccountingReports`
  - `ARO_MANUAL_DISPATCH_ROLES`, `ARO_PRECLASSIFY_ROLES`, `ARO_UNASSIGNED_ROLES`, `ARO_ADMIN_DISPATCH_ROLES`
  - `ACCOUNTING_EDIT_REQUEST_REVIEWER_ROLES`, `SLIP_CLEANUP_ROLES`, `SLIP_EDIT_REQUEST_REVIEWER_ROLES`
- UUID 는 비교용 내부 상수(`BUILTIN_ROLE_GROUP_IDS`)로만 쓰며 화면 렌더에는 노출하지 않는다.
- mock permission catalog 는 seed 와 맞춰 `products.sync` 를 추가하고, `MOCK_ACTION_ONLY_PAGES['products.sync'] = ['CREATE']` 로 UPDATE/DELETE 과다 grant 를 막았다.

### S4. canQuerySales 유지

- `canQuerySales` 는 유지했다.
- 유지 사유: `sales.slip.list` seed 는 ACCOUNTANT/INVENTORY view 를 포함하지만 BE `SlipSalesAccessGuard` 는 SALES/MANAGER/MASTER 만 허용한다. 따라서 일반 `canAccess('sales.slip.list')` 로 대체하면 FE-shows-BE-blocks 가 재발한다.
- 구현은 `canQuerySales(role)` 에서 `canQuerySales(auth)` 로 변경했다.
  - 허용 기준: `hasBuiltinRoleGroup(auth, 'SALES' | 'MANAGER' | 'MASTER')`
  - 현재 FE snapshot 에 별도 `isSystemMaster` 필드는 없으므로 MASTER 시스템 전권은 V43 MASTER 빌트인 role-group UUID 배속으로 판정한다.
- 표시용 role 은 유지했다.
  - 프로필 칩: `auth.role`
  - `client.ts` 의 PARTNER 분기: 유지 대상

### S5. 잔여 RoleGuard 전환

- `/sales/closing`
  - `RoleGuard` 제거 후 `PermissionGuard pageCode="accounting.period-close" action="view"` 로 전환.
  - BE 대응: accounting-service `AccountingRealtimeController` 및 period-close IT 에 `accounting.period-close` VIEW 계약 존재.
- `/sales/vendor-order-upload`
  - `PermissionGuard pageCode="sales.vendor-order" action="view"` 로 전환.
  - 실 BE 위치: `partner-order-service`.
  - `VendorOrderController`
    - `POST /vendor-orders/upload` → `@RequirePermission(page="sales.vendor-order", action=CREATE)`
    - `POST /vendor-orders/confirm` → `@RequirePermission(page="sales.vendor-order", action=CREATE)`
  - action 판정: upload 는 OCR preview 생성, confirm 은 vendor order 등록 생성 흐름이므로 둘 다 CREATE 유지.
- `/admin/sheet-sync`
  - 신규 page-code: `products.sync`
  - auth-service
    - `PageCode.PRODUCTS_SYNC`
    - `V47__seed_products_sync_group_permission.sql`
    - `group_page_permissions` MANAGER group 에만 view/create 부여
    - MASTER 는 `is_system_master` bypass 로 통과하므로 seed row 없음
    - `role_page_permissions` / template 은 갱신하지 않음
  - product-service
    - `POST /api/v1/products/admin/sync` → `products.sync` CREATE
    - `GET /api/v1/products/admin/sync/last` → `products.sync` VIEW
  - FE
    - `PermissionGuard pageCode="products.sync" action="view"`
    - `permissionsApi` PageCode union, `PermissionMatrixPage`, mock catalog 동기화

## 2. page-code ↔ BE 대조표

| FE 진입점 | FE guard | BE service/controller | BE endpoint/action | 판정 |
|---|---|---|---|---|
| `/sales/closing` | `accounting.period-close` VIEW | accounting-service | period-close/realtime 조회 계열 VIEW 계약 존재 | RoleGuard 제거 가능 |
| `/sales/vendor-order-upload` | `sales.vendor-order` VIEW | partner-order-service `VendorOrderController` | upload CREATE, confirm CREATE | 기존 BE 계약 유지 |
| `/admin/sheet-sync` | `products.sync` VIEW | product-service `ProductAdminController` | POST sync CREATE, GET last VIEW | 신규 V47 group seed |
| AppLayout 회계 메뉴 | `accounting.*` VIEW | accounting-service controllers | 각 controller `@RequirePermission` | 정적 fallback 제거 |
| AppLayout 상품 동기화 | `products.sync` VIEW | product-service `ProductAdminController` | CREATE/VIEW | 신규 연결 |
| AppLayout arologis 6개 role-mode 메뉴 | V43 role-group UUID 내부 매칭 | arologis-service role-mode endpoints | arologis 자체 role 시맨틱 | UUID 화면 노출 없음 |

## 3. S2 grep 증빙

### 대상 HeaderAuthenticationFilter 14개

`rg --files services | rg 'HeaderAuthenticationFilter\.java'`

```
services\dashboard-service\src\main\java\com\samhanair\logis\dashboard\config\HeaderAuthenticationFilter.java
services\dc-config-service\src\main\java\com\samhanair\logis\dcconfig\config\HeaderAuthenticationFilter.java
services\user-service\src\main\java\com\samhanair\logis\user\config\HeaderAuthenticationFilter.java
services\arologis-service\src\main\java\com\samhanair\logis\arologis\config\HeaderAuthenticationFilter.java
services\inventory-service\src\main\java\com\samhanair\logis\inventory\config\HeaderAuthenticationFilter.java
services\partner-auth-service\src\main\java\com\samhanair\logis\partnerauth\config\HeaderAuthenticationFilter.java
services\product-service\src\main\java\com\samhanair\logis\product\config\HeaderAuthenticationFilter.java
services\auth-service\src\main\java\com\samhanair\logis\auth\config\HeaderAuthenticationFilter.java
services\accounting-service\src\main\java\com\samhanair\logis\accounting\config\HeaderAuthenticationFilter.java
services\partner-order-service\src\main\java\com\samhanair\logis\partnerorder\config\HeaderAuthenticationFilter.java
services\partner-service\src\main\java\com\samhanair\logis\partner\config\HeaderAuthenticationFilter.java
services\groupware-service\src\main\java\com\samhanair\logis\groupware\config\HeaderAuthenticationFilter.java
services\notification-service\src\main\java\com\samhanair\logis\notification\config\HeaderAuthenticationFilter.java
services\slip-service\src\main\java\com\samhanair\logis\slip\config\HeaderAuthenticationFilter.java
```

### 필터 내 role 파싱/ROLE_ authority 생성 0

`rg -n 'X-User-Role|CALLER_ROLE_HEADER|USER_ROLE_HEADER|ROLE_\s*\+|new SimpleGrantedAuthority\("ROLE_' services -g 'HeaderAuthenticationFilter.java'`

```
no matches
```

### user-facing non-internal Spring Security ROLE gate 0

`rg -n -P "hasRole\('(?!INTERNAL)" services -g '*.java'`

남은 production match 는 모두 `/internal/**` controller 또는 InternalTokenFilter 가 `ROLE_MASTER` 를 부여하는 형제 서비스 호출 문맥이다.

```
notification-service NotificationCenterInternalController
user-service InternalUserController
dashboard-service DashboardInternalController
groupware-service GroupwareInternalController
notification-service NotificationInternalController
partner-service PartnerInternalController
slip-service SlipSalesQueryController
slip-service SlipInternalController
```

따라서 `X-User-Role` downstream parsing 제거로 영향을 받는 user-facing non-internal `hasRole`/`hasAuthority("ROLE_")` consumer 는 0건이다. `InternalTokenFilter` / `ArologisJwtFilter` / auth internal `hasRole('INTERNAL')` 경로는 보존 대상이므로 제거하지 않았다.

### `CALLER_ROLE_HEADER` 보존 사유

`rg -n 'CALLER_ROLE_HEADER' services shared -g '*.java'`

- shared constant 1건
- partner-order-service IT 잔존 사용 다수

따라서 상수 제거는 보류했고 Javadoc 으로 C5 이후 gateway/downstream user authority 용도가 아님을 명시했다.

## 4. 정적 사용처 증빙

### S3 제거 대상 static fallback 0

`rg -n 'canAccessAccounting|canAccessAdmin|canAccessAudit|canAccessAccountingReports|ARO_MANUAL_DISPATCH_ROLES|ARO_PRECLASSIFY_ROLES|ARO_UNASSIGNED_ROLES|ARO_ADMIN_DISPATCH_ROLES|ACCOUNTING_EDIT_REQUEST_REVIEWER_ROLES|SLIP_CLEANUP_ROLES|SLIP_EDIT_REQUEST_REVIEWER_ROLES' clients/desktop/src/renderer -g '*.ts' -g '*.tsx'`

```
no matches
```

### S5 route role constants 0

`rg -n 'ACCOUNTING_ROLES|VENDOR_ORDER_OCR_ROLES|SHEET_SYNC_ROLES|<RoleGuard allow=\{ACCOUNTING_ROLES\}|<RoleGuard allow=\{VENDOR_ORDER_OCR_ROLES\}|<RoleGuard allow=\{SHEET_SYNC_ROLES\}' clients/desktop/src/renderer clients/desktop/playwright -g '*.ts' -g '*.tsx'`

```
clients/desktop/playwright\permission-groups-c5-followup\permission-groups-c5-followup.spec.ts:81-83
```

남은 매치는 신규 negative assertion 뿐이다.

### RoleGuard 컴포넌트 제거 보류

`RoleGuard` 실제 사용처가 남아 있어 컴포넌트와 `ADMIN_ROLES` 는 제거하지 않았다.

```
clients/desktop/src/renderer\components\AdminLayout.tsx:24: import { RoleGuard } from './RoleGuard'
clients/desktop/src/renderer\components\AdminLayout.tsx:27: const ADMIN_ROLES = ['MASTER'] as const
clients/desktop/src/renderer\components\AdminLayout.tsx:31: <RoleGuard allow={ADMIN_ROLES}>
clients/desktop/src/renderer\components\RoleGuard.tsx:25: export function RoleGuard(...)
```

## 5. 검증 결과

| 명령 | 결과 |
|---|---|
| `npm run lint` (`clients/desktop`) | 통과. 기존 경고 1건: `PurchaseSlipPrintPage.tsx totalQty unused` |
| `npm run typecheck` (`clients/desktop`) | 실패. `node_modules/@samhan/design-system` junction 이 옛 경로 `C:\dev\SamhanLogis\clients\web\design-system` 를 가리켜 module resolve 실패 |
| junction 수동 교정 | 실패. `Remove-Item ... node_modules/@samhan/design-system` access denied |
| `npm install --ignore-scripts --offline` | 실패. `EPERM: operation not permitted, symlink 'C:\dev\SamhanLogis\clients\web\design-system'` |
| 전체 Playwright mock suite | 실패. runner 시작 전 `EPERM unlink test-results\.last-run.json` |
| Playwright output `C:\tmp` 우회 | 실패. `spawn EPERM` 및 `mkdir C:\tmp\samhan-pw-results-c5-followup EPERM` |
| 신규 source-contract spec 단독 | 실패. Playwright worker `spawn EPERM` |
| Gradle 변경 서비스 compile/test | 실패. Gradle wrapper lock `gradle-8.10.2-bin.zip.lck` access denied |

백엔드/Playwright 실패는 코드 assertion 실패가 아니라 현재 Windows 로컬 권한/링크 상태로 인한 실행 차단이다.

## 6. 보류/주의

- `RoleGuard` 제거는 보류: `AdminLayout` 이 아직 MASTER 전용 외부 가드로 실제 사용 중이다.
- `CALLER_ROLE_HEADER` 제거는 보류: partner-order-service IT 가 아직 상수를 사용한다.
- `clients/desktop/node_modules/@samhan/design-system` junction 은 controller 환경에서 현재 repo 경로로 재생성해야 `npm run typecheck` 가 정상 검증 가능하다.
- Gradle wrapper lock 권한과 Playwright child-process EPERM 은 controller 환경에서 재실행 필요하다.
