# SP-D4 — 잔여 7 도메인 동적 RBAC PermissionGuard 이중 가드 마이그레이션

> 작성일: 2026-05-18
> 브랜치: `feat/sp-d4-remaining-pages-permission-migration`
> PR 타이틀: `[FEAT] SP-D4 잔여 7 도메인 PermissionGuard 이중 가드 마이그레이션`

---

## §1 슬라이스 개요

SP-D1~D3(회계/슬립/배차/SMS) 완료 후 잔여 핵심 사용자 노출 도메인 7개에
동적 RBAC PermissionGuard 이중 가드를 추가한 슬라이스.

- **PageCode enum**: 19개 → 41개 (+22)
- **Flyway V10 seed**: 22 PageCode × 7 ROLE = 154 row
- **PermissionGuard 신규 7개**
- **Controller 수정 7개 서비스**
- **IT 신규 7개 (총 28 case)**

---

## §2 변경 파일 목록

### 신규 생성

| 파일 | 설명 |
|---|---|
| `services/auth-service/src/main/resources/db/migration/V10__sp_d4_remaining_domains_page_permissions.sql` | Flyway V10 seed 154 row |
| `services/slip-service/src/main/java/.../estimate/web/EstimatePermissionGuard.java` | 견적 PermissionGuard |
| `services/partner-order-service/src/main/java/.../web/PartnerOrderPermissionGuard.java` | 거래처주문 PermissionGuard (다중 코드) |
| `services/partner-order-service/src/main/java/.../client/DynamicPermissionClient.java` | partner-order-service DPC 인터페이스 |
| `services/partner-order-service/src/main/java/.../client/DynamicPermissionClientImpl.java` | partner-order-service DPC 구현체 |
| `services/inventory-service/src/main/java/.../web/InventoryPermissionGuard.java` | 재고 PermissionGuard (다중 코드) |
| `services/inventory-service/src/main/java/.../client/DynamicPermissionClient.java` | inventory-service DPC 인터페이스 |
| `services/inventory-service/src/main/java/.../client/DynamicPermissionClientImpl.java` | inventory-service DPC 구현체 |
| `services/user-service/src/main/java/.../web/EmployeePermissionGuard.java` | 직원/계정 PermissionGuard |
| `services/user-service/src/main/java/.../client/DynamicPermissionClient.java` | user-service DPC 인터페이스 |
| `services/user-service/src/main/java/.../client/DynamicPermissionClientImpl.java` | user-service DPC 구현체 |
| `services/partner-service/src/main/java/.../controller/PartnerPermissionGuard.java` | 거래처 PermissionGuard (다중 코드) |
| `services/partner-service/src/main/java/.../client/DynamicPermissionClient.java` | partner-service DPC 인터페이스 |
| `services/partner-service/src/main/java/.../client/DynamicPermissionClientImpl.java` | partner-service DPC 구현체 |
| `services/partner-service/src/main/java/.../config/RestClientConfig.java` | partner-service LoadBalanced RestClientConfig |
| `services/product-service/src/main/java/.../web/ProductPermissionGuard.java` | 상품 PermissionGuard |
| `services/product-service/src/main/java/.../client/DynamicPermissionClient.java` | product-service DPC 인터페이스 |
| `services/product-service/src/main/java/.../client/DynamicPermissionClientImpl.java` | product-service DPC 구현체 |
| `services/product-service/src/main/java/.../config/RestClientConfig.java` | product-service LoadBalanced RestClientConfig |
| `services/arologis-service/src/main/java/.../controller/ArologisAdminPermissionGuard.java` | 아로로지스 admin PermissionGuard |
| `services/slip-service/src/test/java/.../estimate/it/EstimatePermissionIT.java` | 견적 IT (4 case) |
| `services/partner-order-service/src/test/java/.../it/PartnerOrderListPermissionIT.java` | 거래처주문 IT (4 case) |
| `services/inventory-service/src/test/java/.../it/WarehousePermissionIT.java` | 창고 IT (4 case) |
| `services/user-service/src/test/java/.../it/EmployeePermissionIT.java` | 직원 IT (4 case) |
| `services/partner-service/src/test/java/.../it/PartnerAdminPermissionIT.java` | 거래처 admin IT (4 case) |
| `services/product-service/src/test/java/.../it/ProductPermissionIT.java` | 상품 IT (4 case) |
| `services/arologis-service/src/test/java/.../it/ArologisAdminPermissionIT.java` | 아로로지스 admin IT (4 case) |

### 수정

| 파일 | 변경 내용 |
|---|---|
| `services/auth-service/src/main/java/.../auth/domain/PageCode.java` | +22 enum 상수 추가 |
| `services/slip-service/src/main/java/.../estimate/web/EstimateController.java` | Guard 호출 추가 |
| `services/partner-order-service/src/main/java/.../web/PartnerOrderListController.java` | Guard 호출 추가 |
| `services/partner-order-service/src/main/java/.../web/PartnerOrderConfirmController.java` | Guard 호출 추가 |
| `services/partner-order-service/src/main/java/.../web/PartnerOrderHistoryController.java` | Guard 호출 추가 |
| `services/partner-order-service/src/main/java/.../web/PartnerOrderPrintController.java` | Guard 호출 추가 |
| `services/partner-order-service/src/main/java/.../vendor/web/VendorOrderController.java` | Guard 호출 추가 |
| `services/inventory-service/src/main/java/.../web/WarehouseController.java` | Guard 호출 추가 |
| `services/user-service/src/main/java/.../web/EmployeeController.java` | Guard 호출 추가 |
| `services/partner-service/src/main/java/.../controller/PartnerAdminController.java` | Guard 호출 추가 |
| `services/product-service/src/main/java/.../web/ProductController.java` | Guard 호출 추가 |
| `services/arologis-service/src/main/java/.../controller/ArologisAdminController.java` | Guard 호출 추가 |
| `services/arologis-service/src/main/java/.../controller/RegionAdminController.java` | Guard 호출 추가 |

---

## §3 PageCode +22 enum 상수명 리스트

| 상수명 | code | displayName |
|---|---|---|
| `ESTIMATES_LIST` | `estimates.list` | 견적 목록 |
| `SALES_PARTNER_ORDER_LIST` | `sales.partner-order.list` | 거래처주문 목록 |
| `SALES_PARTNER_ORDER_DRAFT` | `sales.partner-order.draft` | 거래처주문 작성 |
| `SALES_PARTNER_ORDER_CONFIRM` | `sales.partner-order.confirm` | 주문 확정 |
| `SALES_PARTNER_ORDER_HISTORY` | `sales.partner-order.history` | 주문 이력 |
| `SALES_PARTNER_ORDER_PRINT` | `sales.partner-order.print` | 주문서 인쇄 |
| `SALES_VENDOR_ORDER` | `sales.vendor-order` | 벤더(외주) 주문 |
| `INVENTORY_WAREHOUSE` | `inventory.warehouse` | 창고 관리 |
| `INVENTORY_STOCK` | `inventory.stock` | 재고 현황 |
| `INVENTORY_STOCK_TRANSFER` | `inventory.stock-transfer` | 재고 이동 |
| `INVENTORY_DPS` | `inventory.dps` | DPS 비교/이력 |
| `INVENTORY_AUDIT` | `inventory.audit` | 재고 감사 |
| `ADMIN_EMPLOYEES` | `admin.employees` | 직원 관리 |
| `ADMIN_USERS` | `admin.users` | 계정 관리 |
| `PARTNERS_LIST` | `partners.list` | 거래처 목록 |
| `PARTNERS_DETAIL` | `partners.detail` | 거래처 4탭 상세 |
| `PARTNERS_BLOCK` | `partners.block` | 거래처 차단 |
| `PARTNERS_EDIT_REQUEST` | `partners.edit-request` | 거래처 편집 결재 |
| `PRODUCTS_LIST` | `products.list` | 상품 목록 |
| `PRODUCTS_ADMIN` | `products.admin` | 상품 관리 |
| `AROLOGIS_ADMIN` | `arologis.admin` | 아로로지스 배차 관리 |
| `AROLOGIS_REGION` | `arologis.region` | 아로로지스 지역/구역 관리 |

---

## §4 V10 Flyway seed 구조

- 총 154 row (22 PageCode × 7 ROLE)
- 역할: MASTER / MANAGER / ACCOUNTANT / SALES / WAREHOUSE / DISPATCH / INVENTORY
- BaseEntity 7 audit 필드 + `is_deleted=FALSE` 명시
- `ON CONFLICT (role_code, page_code) WHERE is_deleted = FALSE DO NOTHING` 멱등성 보장

---

## §5 이중 가드 정책

모든 PermissionGuard 공통:

| 조건 | 동작 |
|---|---|
| actorRole null/blank | 건너뜀 (기존 @PreAuthorize 만 적용) |
| canView=false | BusinessException(FORBIDDEN) |
| canEdit=false + canView=true | BusinessException(FORBIDDEN) (view-only override) |
| canEdit=false + canView=false | fallback 통과 (override row 없음) |

---

## §6 컴파일 검증 결과

```
./gradlew :services:auth-service:assemble
         :services:slip-service:assemble
         :services:partner-order-service:assemble
         :services:inventory-service:assemble
         :services:user-service:assemble
         :services:partner-service:assemble
         :services:product-service:assemble
         :services:arologis-service:assemble

BUILD SUCCESSFUL in 25s

./gradlew :services:{all-8}:testClasses

BUILD SUCCESSFUL in 22s
```

---

## §7 SP-D5 이연 항목

- RoleGuard `@PreAuthorize` 제거 (단일 가드화)
- AOP/Aspect 통합
- 권한 캐시 invalidation event-driven
- admin.users controller guard (`AdminUserController`)
- partners.block / partners.edit-request / partners.detail 전용 controller guard 완전 적용
