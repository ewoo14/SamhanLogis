# SP-D6-2 — groupware + product + partner-order @PreAuthorize → @RequirePermission 마이그레이션 설계

> SP-D6-1(PR #304, `7964d29c`) 의 후속 슬라이스. `@RequirePermission(page, action)` AOP, HTTP `DefaultDynamicPermissionClient`, V29-style idempotent seed, WebMvcTest 권한 검증 패턴을 그대로 따른다.

## 1. 목표

1. **groupware/product/partner-order endpoint 변환** — RBAC `@PreAuthorize("hasAnyRole(...)")` 를 동적 권한 PageCode 로 이동한다.
2. **기존 PageCode 재사용 우선** — V10 `products.list`, `products.admin`, `sales.partner-order.*`, `sales.vendor-order` 를 사용한다.
3. **신규 PageCode 최소 추가** — `messenger.admin`, `messenger.send`, `products.edit-requests`, `products.ecount-import`, `sales.partner-order.edit-requests`, `sales.partner-order.tutorial`.
4. **DPC bean 3개 service 추가** — `${SAMHAN_AUTH_SERVICE_URL:http://localhost:8081}` 기반 direct auth-service 호출.
5. **변환 제외 유지** — `isAuthenticated()` 와 internal token endpoint 는 변경하지 않는다.

## 2. 변환 매트릭스

### 2.1 groupware-service

| Endpoint | 현재 | 신규 |
|---|---|---|
| `POST /admin/groupware/approvals` | `@hr.isExecutiveOffice() and MASTER/MANAGER` | 정적 `@hr.isExecutiveOffice()` 유지 + `@RequirePermission("messenger.admin","EDIT")` |
| `PUT /approvals/{id}/approve` | 동일 | `messenger.admin` EDIT |
| `PUT /approvals/{id}/reject` | 동일 | `messenger.admin` EDIT |
| `POST /messages` | 7 role broad | `messenger.send` EDIT |
| `GET /messages/inbox` | 7 role broad | `messenger.send` VIEW |
| `POST /schedules` | 7 role broad | `messenger.send` EDIT |
| `GET /schedules` | 7 role broad | `messenger.send` VIEW |
| `PUT /schedules/{id}` | 7 role broad | `messenger.send` EDIT |
| `DELETE /schedules/{id}` | MASTER/MANAGER | `messenger.admin` EDIT |

`GroupwareInternalController` 의 `hasRole('MASTER')` internal-style endpoint 는 scope 밖이다.

### 2.2 product-service

| Endpoint | 신규 PageCode/action |
|---|---|
| `ProductEditRequestController` 생성/승인/거절/대시보드 | `products.edit-requests` EDIT/EDIT/EDIT/VIEW |
| `CategoryController` create/update/delete | `products.admin` EDIT |
| `EcountProductImportController` upload | `products.ecount-import` EDIT |
| `ProductByCodeController` by-code | `products.list` VIEW |
| `ProductController` list/detail/by-model | `products.list` VIEW |
| `ProductController` create/update/price/tags/discontinue/reactivate/delete | `products.admin` EDIT |

`ProductEditRequestController` 제품별 이력, audit log, realtime SSE, internal product lookup 은 `isAuthenticated()`/internal 계약 유지.

### 2.3 partner-order-service

| Endpoint | 신규 PageCode/action |
|---|---|
| edit-request 생성/승인/거절/대시보드 | `sales.partner-order.edit-requests` EDIT/EDIT/EDIT/VIEW |
| vendor upload/confirm | `sales.vendor-order` EDIT |
| confirm | `sales.partner-order.confirm` EDIT |
| delete/edit/from-estimate | `sales.partner-order.draft` EDIT |
| draft create/list/detail | `sales.partner-order.draft` EDIT/VIEW/VIEW |
| history/list/detail | `sales.partner-order.history` VIEW, `sales.partner-order.list` VIEW |
| print | `sales.partner-order.print` VIEW |
| tutorial state | `sales.partner-order.tutorial` EDIT |

partner-order audit log, realtime SSE 는 `isAuthenticated()` 유지.

## 3. V30 seed

신규 6개 PageCode 만 추가한다. 기존 partner portal `PARTNER`/`DEVELOPER` 통과 경로는 UI 매트릭스 대상이 아니어도 DPC 조회가 가능하도록 V30 에 보존 row 를 함께 둔다.

| PageCode | 권한 seed |
|---|---|
| `messenger.admin` | MASTER/MANAGER view+edit |
| `messenger.send` | MASTER/MANAGER/SALES/ACCOUNTANT/WAREHOUSE/INVENTORY/DEVELOPER view+edit |
| `products.edit-requests` | MASTER/MANAGER/SALES/ACCOUNTANT view+edit |
| `products.ecount-import` | MASTER/MANAGER view+edit |
| `sales.partner-order.edit-requests` | MASTER/MANAGER/SALES/PARTNER view+edit |
| `sales.partner-order.tutorial` | MASTER/MANAGER/PARTNER view+edit |

`ON CONFLICT DO NOTHING` 으로 V29와 동일하게 멱등 처리한다.

## 4. FE 영향

- `permissionsApi.ts` PageCode union 에 신규 6개 추가.
- `PermissionMatrixPage.tsx`:
  - "메신저" 그룹 신설: `messenger.admin`, `messenger.send`
  - "상품" 그룹에 `products.edit-requests`, `products.ecount-import`
  - "거래처주문" 그룹에 `sales.partner-order.edit-requests`, `sales.partner-order.tutorial`
- MASTER-only 신규 PageCode 는 없다. `SYSTEM_ONLY_PAGES` 변경 없음.

## 5. Testing

- 신규/변환 권한 테스트는 `@WebMvcTest` slice 로 작성한다.
- 각 service 별 대표 endpoint set 에 대해 권한 grant → 2xx, no grant → 403 + `permission_guard_denied_total` 증가를 검증한다.
- 기존 `isAuthenticated()`/internal endpoint 테스트는 변경하지 않는다.
