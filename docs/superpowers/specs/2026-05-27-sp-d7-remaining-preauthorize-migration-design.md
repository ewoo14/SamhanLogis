# SP-D7 — 잔여 `@PreAuthorize` → `@RequirePermission` 마이그레이션 (설계)

> 2026-05-27. SP-D6 시리즈(7/7, ~400 endpoint) 완료 후 잔여 점검 결과 도출. 본 문서는 spec(설계)이며 구현은 Codex.

## 1. 배경 / 목표

SP-D6 가 거의 모든 controller 를 `@RequirePermission` 으로 전환 완료. 전수 점검(123 `@PreAuthorize` 표현식) 결과 잔여는 2 유형으로 수렴:

- **유형 A — 신규 마이그레이션**: `@PreAuthorize("isAuthenticated()")` 만 있고 `@RequirePermission` 부재인 user-facing 조회/SSE endpoint **25건**. → 적절한 `@RequirePermission(page, VIEW)` 로 전환.
- **유형 B — leftover 제거**: SP-D6 dual-guard 로 남은 role-based `@PreAuthorize` 가 이미 `@RequirePermission` 과 공존하는 **15건**. → redundant `@PreAuthorize` 라인 삭제 (기능 변화 없음, DPC 가 이미 강제).

**목표**: 모든 user-facing endpoint 권한을 DPC(`@RequirePermission`) 단일 경로로 통합. 단 **접근 회귀 0** (behavior-preserving).

## 2. 범위

### IN (MIGRATE)
- 유형 A 25건 (아래 §4 표).
- 유형 B 15건 redundant `@PreAuthorize` 제거.

### OUT (KEEP — 변경 금지)
- `@hr.isExecutiveOffice()` 24건 — SP-D6-4 선례 (정적 가드 보존).
- 모든 `*InternalController` + `SlipSalesQueryController`(`/internal/slips/sales-query`, X-Internal-Token) — service-to-service.
- auth-service 자체 인프라 (PermissionAdmin/PermissionInternal/DynamicPermissionService/AuthController/PasswordController/RolePagePermission).
- `SecurityConfig` / `HeaderAuthenticationFilter` / `ReportPermissionGuard` / `RestClient*` (endpoint 아님, Javadoc 참조).
- `DispatchTaskInternalController` (`hasAuthority('ROLE_MASTER')`, internal).
- **`UserMeController.is-executive-office`** — FE 부트스트랩 self-check (도메인 page 없음). KEEP. (D-D7-04)

## 3. 핵심 설계 결정 — behavior-preserving (회귀 방지)

**D-D7-01 (최우선):** 유형 A endpoint 는 현재 `isAuthenticated()` = "인증된 모든 사용자 허용". 이를 page VIEW 로 전환 시, 재사용 page 의 VIEW grant 가 **현재 접근 가능한 모든 role 을 포함**해야 한다 (그렇지 않으면 접근 회귀). 따라서:
- 각 재사용 page 에 대해 **VIEW grant 를 모든 활성 비즈니스 role 로 확장하는 V seed** 동반 (기존 grant 가 좁으면 보강). VIEW 컬럼만 영향, EDIT 측 불변.
- "활성 비즈니스 role" = 현 10-role taxonomy 중 PARTNER 제외 내부 role 집합 (MASTER/MANAGER/ACCOUNTANT/SALES/WAREHOUSE/INVENTORY/STAFF/DRIVER 등 — 실제 seed 시 기존 sibling VIEW grant 패턴 확인). PARTNER 포함 여부는 endpoint 가 partner-facing 인지에 따라 (partner-order/partner attachment 는 PARTNER 도 self-scope 가능성 — BE 리뷰 확인).
- **BE 리뷰 의무**: 각 유형 A page 의 최종 VIEW grant 가 마이그레이션 전 `isAuthenticated` 접근 집합 대비 회귀(축소) 없는지 cross-check.

**D-D7-02:** 신규 PageCode 는 `notifications.center` 1개만 (NotificationCenterController self-알림 조회 3건). 기존 `notifications.admin`(발송 관리)과 의미 분리. VIEW grant = 모든 활성 비즈니스 role (본인 알림은 X-User-Id self-filter).

**D-D7-03:** 유형 B 15건은 redundant `@PreAuthorize` 라인 **삭제** (이미 `@RequirePermission` 강제 중). 삭제 후 동작 동일함을 IT 로 보장.

**D-D7-05:** **IT 패턴 (PR #310 교훈 필수 적용)** — 각 마이그레이션 endpoint 의 IT 는 slip-service 검증 패턴: allow-all 기본 stub + **deny-case 는 요청 직전 명시 deny stub** (page/action-aware). blanket default 의존 금지. 유형 A 는 "모든 role VIEW 200" + (해당되면) deny role 403 명시.

## 4. 유형 A 매핑 표 (25건)

| service | 컨트롤러:메서드 | HTTP path | page | action |
|---|---|---|---|---|
| notification | NotificationCenterController:findMyUnread | GET /notifications/my | **notifications.center** (신규) | VIEW |
| notification | NotificationCenterController:findMyHistory | GET /notifications/history | notifications.center | VIEW |
| notification | NotificationCenterController:acknowledge | POST /notifications/{id}/acknowledge | notifications.center | VIEW |
| inventory | InspectionAttachmentController:list | GET /inventory/inspections/{slipId}/attachments | inventory.stock-balance | VIEW |
| inventory | InspectionAttachmentController:detail | GET .../attachments/{attachmentId} | inventory.stock-balance | VIEW |
| partner | PartnerAttachmentController:list | GET /api/v1/partners/{partnerId}/attachments | partners.detail | VIEW |
| partner | PartnerAttachmentController:detail | GET /api/v1/partners/attachments/{attachmentId} | partners.detail | VIEW |
| partner | PartnerVisitAttachmentController:list | GET /admin/partners/{partnerCode}/visit-attachments | partners.detail | VIEW |
| partner | PartnerVisitAttachmentController:detail | GET .../visit-attachments/{attachmentId} | partners.detail | VIEW |
| product | ProductAuditLogController:listAuditLogs | GET /products/{productId}/audit-logs | products.list | VIEW |
| product | ProductEditRequestController:listByProduct | GET /products/{productId}/edit-requests | products.edit-requests | VIEW |
| product | ProductRealtimeController:subscribe | GET /products/{productId}/realtime (SSE) | products.list | VIEW |
| slip | SlipCommentController:listRecent | GET /slips/{slipId}/comments | slip.comments | VIEW |
| slip | SlipAuditLogController:listAuditLogs | GET /slips/{slipId}/audit-logs | slip.audit-overlay | VIEW |
| slip | SlipAttachmentController:list | GET /slips/{slipId}/attachments | slip.attachments.upload | VIEW |
| slip | SlipAttachmentController:detail | GET .../attachments/{attachmentId} | slip.attachments.upload | VIEW |
| slip | DeliveryAttachmentController:list | GET /slips/{slipId}/delivery-attachments | slip.delivery-attachments.upload | VIEW |
| slip | SlipPublishController:findBySource | GET /api/v1/slips/by-source | slip.publish.from-estimate | VIEW |
| slip | SlipRealtimeController:subscribe | GET /slips/{slipId}/realtime (SSE) | slip.comments | VIEW |
| slip | SlipEditRequestController:listBySlip | GET /slips/{slipId}/edit-requests | slip.edit-requests | VIEW |
| slip | EstimateController:list | GET /slips/estimates | estimates.list | VIEW |
| slip | EstimateController:getOne | GET /slips/estimates/{id} | estimates.list | VIEW |
| partner-order | PartnerOrderRealtimeController:subscribe | GET /api/v1/partner-orders/{id}/realtime (SSE) | sales.partner-order.history | VIEW |
| partner-order | PartnerOrderEditRequestController:listByOrder | GET .../{id}/edit-requests | sales.partner-order.edit-requests | VIEW |
| partner-order | PartnerOrderAuditLogController:listAuditLogs | GET .../{id}/audit-logs | sales.partner-order.history | VIEW |

> 각 재사용 page 의 실제 코드 존재 + 현재 VIEW grant 는 구현 시 Codex 가 PageCode.java + sibling V seed 로 확인 후 D-D7-01 에 따라 보강.

## 5. 유형 B 제거 표 (15건) — §인벤토리 참조
inventory: DpsCompareController(1), InboundInspectionController(4), DpsSaveHistoryController(4), InspectionAttachmentController upload/delete(2). user: EmployeeController create/update/updateRole/terminate(4). → redundant `@PreAuthorize` 삭제, 공존 `@RequirePermission` 유지.

## 6. 슬라이스 분할

- **SP-D7-1 — slip + partner-order** (유형 A 13건): 신규 PageCode 0 (전부 기존 재사용 + VIEW grant 보강 V seed). 위험 최저, 먼저.
- **SP-D7-2 — notification + partner + product + inventory + user** (유형 A 12건 + 유형 B 15건): `notifications.center` 신규 PageCode + V seed, inventory/user leftover 제거.

(대안: 신규 page 1개뿐이라 단일 통합 PR 도 가능 — 단 40 endpoint 변경 리뷰 부담 고려해 2 슬라이스 권장.)

## 7. 필수 동반 (각 슬라이스)
- PageCode.java enum (notifications.center, SP-D7-2 만).
- Flyway V## seed (auth-service): 신규 page row + D-D7-01 VIEW grant 보강. SP-D6-3 (`notifications.admin` 추가) 커밋 선례 미러.
- IT: D-D7-05 패턴 (allow + 명시 deny stub).
- 문서 동기화: dev-report + README + samhan-public-overview.html ([[continuous-docs-sync]] + [[samhan-public-overview-sync]]).

## 8. Decisions
- D-D7-01 behavior-preserving VIEW grant (회귀 0) — 최우선.
- D-D7-02 notifications.center 신규 page 1개.
- D-D7-03 유형 B redundant @PreAuthorize 삭제.
- D-D7-04 UserMe is-executive-office + SlipSalesQuery KEEP.
- D-D7-05 IT deny-stub 명시 (PR #310 see-saw 교훈).
- D-D7-06 @hr / internal / auth-infra KEEP (SP-D6-4 선례).
