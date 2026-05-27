# SP-D7 잔여 PreAuthorize 동적 권한 마이그레이션

> 작성일: 2026-05-27
> 브랜치: `feat/sp-d7-remaining-preauthorize-migration`

## 1. 변경 요약

SP-D1~D6 이후 남아 있던 `@PreAuthorize("isAuthenticated()")` 조회성 endpoint 25건을
`shared:security`의 `@RequirePermission(page = "...", action = "VIEW")`로 전환했다.
이미 `@RequirePermission`을 함께 보유하던 redundant `@PreAuthorize` 15건은 삭제했다.

동작 우선순위는 D-D7-01 behavior-preserving 원칙이다. 기존에는 인증 사용자면 통과하던 endpoint이므로,
auth-service V38 seed가 신규 `notifications.center`와 재사용 page 13종의 `VIEW` grant를 모든 활성 비즈니스 role로 보강한다.

## 2. 유형 A 전환 범위

| Service | Endpoint 수 | PageCode |
|---|---:|---|
| notification-service | 3 | `notifications.center` |
| inventory-service | 2 | `inventory.stock-balance` |
| partner-service | 4 | `partners.detail` |
| product-service | 3 | `products.list`, `products.edit-requests` |
| slip-service | 10 | `slip.comments`, `slip.audit-overlay`, `slip.attachments.upload`, `slip.delivery-attachments.upload`, `slip.publish.from-estimate`, `slip.edit-requests`, `estimates.list` |
| partner-order-service | 3 | `sales.partner-order.history`, `sales.partner-order.edit-requests` |

모든 전환 endpoint는 기존 sibling controller 패턴과 동일하게 method-level `@RequirePermission`을 사용한다.
SSE endpoint도 `VIEW` action으로 묶어 화면 조회 권한과 같은 행위를 유지한다.

## 3. 유형 B 정리 범위

| Service | Controller | 삭제 수 | 유지 권한 |
|---|---|---:|---|
| inventory-service | `DpsCompareController` | 1 | `inventory.dps` VIEW |
| inventory-service | `InboundInspectionController` | 4 | 기존 `@RequirePermission` |
| inventory-service | `DpsSaveHistoryController` | 4 | 기존 `@RequirePermission` |
| inventory-service | `InspectionAttachmentController` upload/delete | 2 | 기존 `@RequirePermission` |
| user-service | `EmployeeController` create/update/updateRole/terminate | 4 | 기존 `@RequirePermission` |

## 4. PageCode + Flyway

### PageCode

`PageCode.NOTIFICATIONS_CENTER("notifications.center", "알림 센터")`를 추가했다.

### Flyway V38

신규 파일: `services/auth-service/src/main/resources/db/migration/V38__seed_sp_d7_remaining_preauthorize_page_codes.sql`

보강 page:

- `notifications.center`
- `slip.comments`
- `slip.audit-overlay`
- `slip.attachments.upload`
- `slip.delivery-attachments.upload`
- `slip.publish.from-estimate`
- `slip.edit-requests`
- `estimates.list`
- `sales.partner-order.history`
- `sales.partner-order.edit-requests`
- `products.list`
- `products.edit-requests`
- `partners.detail`
- `inventory.stock-balance`

V38은 `MASTER`, `MANAGER`, `ACCOUNTANT`, `SALES`, `WAREHOUSE`, `DISPATCH`, `INVENTORY`, `DEVELOPER`, `PARTNER`, `STAFF`, `DRIVER`를 활성 비즈니스 role 집합으로 사용한다.
기존 row가 없으면 `can_view = TRUE`로 insert하고, 기존 row가 있으면 `can_view`만 TRUE로 보강해 `isAuthenticated()` 동작을 보존한다.

## 5. 3-layer 문서화

1. 한국어 Javadoc: `EstimateController`, `EmployeeController`의 잔여 `@PreAuthorize` 설명을 `@RequirePermission` 기준으로 정리했다.
2. springdoc-openapi: 기존 controller method signature와 response DTO는 변경하지 않아 OpenAPI surface는 endpoint/path/status 기준 회귀가 없다.
3. dev-report: 본 문서가 SP-D7 endpoint/page/action 매핑, V38 seed, IT 가드 원칙을 기록한다.

## 6. IT 정책

변경 endpoint IT는 PR #310 see-saw 교훈에 따라 다음 원칙을 적용한다.

- 기본 stub은 allow-all로 둔다.
- deny case는 요청 직전 page/action-aware 명시 deny stub으로 덮어쓴다.
- 유형 B endpoint는 `@PreAuthorize` 삭제 뒤에도 기존 `@RequirePermission` allow/deny가 유지되는지 확인한다.

## 7. 검증

로컬 sandbox에서 Gradle wrapper가 `gradle-8.10.2-bin.zip` 다운로드를 시도하며 네트워크 권한 오류로 중단될 수 있다.
최종 검증 결과는 PR 본문 또는 handoff에 별도 기록한다.
