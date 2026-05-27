# SP-D7 잔여 PreAuthorize 동적 권한 마이그레이션

> 작성일: 2026-05-27
> 브랜치: `feat/sp-d7-remaining-preauthorize-migration`

## 1. 변경 요약

SP-D1~D6 이후 남아 있던 `@PreAuthorize("isAuthenticated()")` 조회성 endpoint 25건을
`shared:security`의 `@RequirePermission(page = "...", action = "VIEW")`로 전환했다.

cycle 2 정책은 옵션 A, behavior-preserving 통합이다. 기존 인증 사용자 접근을 내부 운영 role 범위에서 보존하되,
기존 VIEW endpoint가 이미 같은 page를 쓰던 곳은 전용 `.view` page code로 분리해 기존 endpoint widening을 피한다.
외부 role `PARTNER`는 내부 운영 page VIEW grant에서 제외한다.

## 2. 유형 A 전환 범위

| Service | Endpoint 수 | SP-D7 PageCode |
|---|---:|---|
| notification-service | 3 | `notifications.center` |
| inventory-service | 2 | `inventory.stock-balance.view` |
| partner-service | 4 | `partners.detail.view` |
| product-service | 3 | `products.list.view`, `products.edit-requests` |
| slip-service | 10 | `slip.comments`, `slip.audit-overlay`, `slip.attachments.upload`, `slip.delivery-attachments.upload`, `slip.publish.from-estimate`, `slip.edit-requests`, `estimates.list` |
| partner-order-service | 3 | `sales.partner-order.history.view`, `sales.partner-order.edit-requests` |

모든 전환 endpoint는 기존 sibling controller 패턴과 동일하게 method-level `@RequirePermission`을 사용한다.
SSE endpoint도 `VIEW` action으로 묶어 화면 조회 권한과 같은 행위를 유지한다.

## 3. 재사용 page 판별 결과

case W는 SP-D7 이전 동일 page의 `@RequirePermission(..., VIEW)` 사용처가 없어 기존 page를 재사용한다.
V38이 전 내부 role의 기존 `FALSE` row를 `TRUE`로 보강해 isAuthenticated 동작을 보존한다.

| Case W page | 처리 |
|---|---|
| `slip.comments` | 재사용 + 내부 role VIEW 보강 |
| `slip.audit-overlay` | 재사용 + 내부 role VIEW 보강 |
| `slip.attachments.upload` | 재사용 + 내부 role VIEW 보강 |
| `slip.delivery-attachments.upload` | 재사용 + 내부 role VIEW 보강 |
| `slip.publish.from-estimate` | 재사용 + 내부 role VIEW 보강 |
| `slip.edit-requests` | 재사용 + 내부 role VIEW 보강 |
| `estimates.list` | 재사용 + 내부 role VIEW 보강 |
| `sales.partner-order.edit-requests` | 재사용 + 내부 role VIEW 보강 |
| `products.edit-requests` | 재사용 + 내부 role VIEW 보강 |

case V는 SP-D7 이전 동일 page의 VIEW endpoint가 존재해 기존 page를 넓히면 기존 endpoint까지 widening된다.
SP-D7 endpoint 전용 page code를 신설했다.

| 기존 page | 전용 page |
|---|---|
| `sales.partner-order.history` | `sales.partner-order.history.view` |
| `products.list` | `products.list.view` |
| `partners.detail` | `partners.detail.view` |
| `inventory.stock-balance` | `inventory.stock-balance.view` |

## 4. 유형 B 정리 범위

cycle 2에서 deleted `@PreAuthorize`와 공존 `@RequirePermission` seed grant를 재대조했다.
grant가 정확히 같은 create/update는 redundant 삭제를 유지하고, seed grant가 더 넓은 endpoint는 엄격한 `@PreAuthorize`를 복원했다.

| Service | Controller | 처리 |
|---|---|---|
| user-service | `EmployeeController.create`, `EmployeeController.update` | `admin.employees` EDIT grant가 MASTER/MANAGER로 동일해 삭제 유지 |
| user-service | `EmployeeController.updateRole`, `EmployeeController.terminate` | `hasRole('MASTER')` 복원, 역할 변경/퇴사 처리는 MASTER 전용 유지 |
| inventory-service | `InspectionAttachmentController` upload/delete | 기존 role set이 더 좁아 `@PreAuthorize` 복원 |
| inventory-service | `InboundInspectionController` | 기존 role set이 더 좁아 `@PreAuthorize` 복원 |
| inventory-service | `DpsCompareController.analyzeByProduct` | 기존 role set이 더 좁아 `@PreAuthorize` 복원 |
| inventory-service | `DpsSaveHistoryController` | 기존 role set이 더 좁아 `@PreAuthorize` 복원 |

## 5. PageCode + Flyway

### PageCode

신규 enum:

- `NOTIFICATIONS_CENTER("notifications.center", "알림 센터")`
- `SALES_PARTNER_ORDER_HISTORY_VIEW("sales.partner-order.history.view", "거래처주문 이력 조회")`
- `PRODUCTS_LIST_VIEW("products.list.view", "상품 목록 조회")`
- `PARTNERS_DETAIL_VIEW("partners.detail.view", "거래처 상세 조회")`
- `INVENTORY_STOCK_BALANCE_VIEW("inventory.stock-balance.view", "재고 잔액 조회")`

### Flyway V38

신규 파일: `services/auth-service/src/main/resources/db/migration/V38__seed_sp_d7_remaining_preauthorize_page_codes.sql`

V38 내부 role 집합:

`MASTER`, `MANAGER`, `ACCOUNTANT`, `SALES`, `WAREHOUSE`, `DISPATCH`, `INVENTORY`, `DEVELOPER`, `STAFF`, `DRIVER`

`PARTNER`는 내부 운영 page VIEW grant에서 제외한다.

V38 동작:

- case W 재사용 page는 기존 active row 중 `can_view IS DISTINCT FROM TRUE`인 내부 role row를 `TRUE`로 UPDATE한다.
- case W 재사용 page와 신규/전용 page는 없는 active row만 `can_view = TRUE`, `can_edit = FALSE`로 INSERT한다.
- INSERT는 `ON CONFLICT (role_code, page_code) WHERE is_deleted = FALSE DO NOTHING`으로 멱등 유지한다.
- UPDATE/INSERT audit marker는 `sp-d7-cycle2-view-grant`를 사용한다.

## 6. FE 권한 매트릭스

Desktop permission matrix에 다음 page를 추가했다.

- 알림 그룹: `notifications.center`
- 주문 그룹: `sales.partner-order.history.view`
- 재고 그룹: `inventory.stock-balance.view`
- 거래처 그룹: `partners.detail.view`
- 상품 그룹: `products.list.view`

전부 조회 전용이므로 `PAGES_WITH_EDIT`에는 추가하지 않았다.

## 7. 3-layer 문서화

1. 한국어 Javadoc: `EmployeeController`에 역할 변경/퇴사 처리의 MASTER 전용 strict guard 보존을 명시했다.
2. springdoc-openapi: 기존 controller method signature와 response DTO는 변경하지 않아 OpenAPI surface는 endpoint/path/status 기준 회귀가 없다.
3. dev-report: 본 문서가 SP-D7 endpoint/page/action 매핑, V38 seed, cycle 2 보안 보정, FE 매트릭스 동기화를 기록한다.

## 8. IT 정책

변경 endpoint IT는 PR #310 see-saw 교훈에 따라 다음 원칙을 적용한다.

- 기본 stub은 allow-all로 둔다.
- deny case는 요청 직전 page/action-aware 명시 deny stub으로 덮어쓴다.
- 전용 `.view` page로 분리된 controller IT는 변경된 page code를 기대한다.
- auth-service `AuthFlywayV38SeedIT`는 V38 적용 후 실제 seed 기준 내부 role VIEW 허용과 `PARTNER` 미부여를 repository/service 조회로 검증한다.

## 9. 검증

로컬 sandbox에서는 Gradle wrapper와 Gradle plugin dependency 해석이 네트워크/캐시 제약에 막힐 수 있다.
최종 compile/test 결과는 PR 본문 또는 handoff에 별도 기록한다.
