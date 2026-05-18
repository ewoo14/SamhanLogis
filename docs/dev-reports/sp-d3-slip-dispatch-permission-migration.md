# SP-D3 매입/매출/배차 동적 RBAC 마이그레이션 — Dev Report

> 작성일: 2026-05-18
> 담당 슬라이스: SP-D3 (Slip/Dispatch Permission Migration)
> 브랜치: `feat/sp-d3-slip-dispatch-permission-migration`

---

## 1. 슬라이스 개요

SP-D1/D2 에서 구축한 동적 RBAC 시스템(PermissionGuard + usePermissions hook)을
매입/매출/배차 카테고리 6 PageCode 에 일괄 적용하는 마이그레이션 슬라이스.

**목표**:
- 매입 슬립 / 매출 슬립 / 배차 메뉴 / SMS 발송 이력 / 영수증 OCR / 입고 검수
  라우트를 정적 `@PreAuthorize` 단독 에서 동적 PermissionGuard 이중 가드 구조로 전환.
- 마스터가 DB 에서 직접 각 역할의 페이지 접근 권한을 제어 가능.
- SP-D2 회계 12 페이지 패턴과 3-service 일관성 달성.

**SP-D1/D2 대비**:
- SP-D1: `accounting.tax-invoice.emit-nts` 1개 라우트 POC
- SP-D2: 회계 12 라우트 일괄 전환 (ACCOUNTANT 역할 중심)
- SP-D3: 매입/매출/배차 6 PageCode — SALES / WAREHOUSE / DISPATCH 역할 중심

---

## 2. 매입/매출/배차 6 PageCode 마이그레이션 매트릭스

| 라우트 | 사이드바 data-testid | PageCode | 대상 역할 | SP-D3 이중 가드 |
|--------|---------------------|----------|-----------|----------------|
| `/sales/slips` | `sidebar-sales` | `sales.slip.list` | SALES/MANAGER/MASTER | RoleGuard + PermissionGuard |
| `/purchases/slips` | `sidebar-purchases` | `purchases.slip.list` | WAREHOUSE/MANAGER/MASTER | RoleGuard + PermissionGuard |
| `/purchases/receipt-ocr` | `sidebar-purchases-receipt-ocr` | `purchases.receipt-ocr` | WAREHOUSE/ACCOUNTANT/MANAGER/MASTER | RoleGuard + PermissionGuard |
| `/dispatch-board` | `sidebar-dispatch-board` | `dispatch.board` | DISPATCH/MANAGER/MASTER | RoleGuard + PermissionGuard |
| `/arologis/dispatch-sms/send-audit` | `sidebar-arologis-sms-send-audit` | `notification.dispatch-sms.send-audit` | DISPATCH/MANAGER/MASTER | RoleGuard + PermissionGuard |
| `/warehouse/inbound-inspections` | `sidebar-warehouse-inbound-inspections` | `inbound.inspection` | WAREHOUSE/MANAGER/MASTER | RoleGuard + PermissionGuard |

**총 6 PageCode** — SP-D1 초기 seeder (V7) 에서 기정의된 PageCode 재활용 (신규 PageCode 없음).

---

## 3. 역할별 기본 권한 매트릭스

| 역할 | 허용 PageCode | 비허용 PageCode |
|------|-------------|----------------|
| SALES | sales.slip.list, notification.dispatch-sms.send-audit | purchases.slip.list, dispatch.board, inbound.inspection |
| WAREHOUSE | purchases.slip.list, purchases.receipt-ocr, inbound.inspection | sales.slip.list, dispatch.board |
| DISPATCH | dispatch.board, notification.dispatch-sms.send-audit | sales.slip.list, purchases.slip.list |
| ACCOUNTANT | purchases.receipt-ocr | sales.slip.list, dispatch.board |
| MANAGER | 전체 6개 (MASTER 동일) | 없음 |
| MASTER | 전체 6개 + revoke 권한 | 없음 |

---

## 4. 3-service 패턴 일관성

SP-D3 는 다음 3개 서비스에 동적 RBAC 이중 가드를 적용한다.

### 4.1 slip-service (SlipController + ReceiptOcrController)

```
FE 라우트 → RoleGuard (SALES/WAREHOUSE 등) → PermissionGuard → 페이지
               |                                     |
               v                                     v
      기존 @PreAuthorize 보존              DynamicPermissionClient.canView()
      (regression 0)                      canView=false → 403 FORBIDDEN
```

**적용 PageCode**:
- `sales.slip.list` — SlipController GET /slips?slipType=OUTBOUND
- `purchases.slip.list` — SlipController GET /slips?slipType=INBOUND
- `purchases.receipt-ocr` — ReceiptOcrController POST /purchases/receipt-ocr

### 4.2 notification-service (DispatchSmsSaveHistoryController)

```
FE 라우트 → RoleGuard (DISPATCH/MANAGER/MASTER) → PermissionGuard → 페이지
               |                                        |
               v                                        v
      @PreAuthorize("hasAnyRole(...)") 보존     DynamicPermissionClient.canView()
                                               notification.dispatch-sms.send-audit
```

**SP-D3 신규 구현**: `DispatchSmsSaveHistoryController` 에 `DynamicPermissionClient` 주입 및
VIEW/EDIT 가드 `checkViewPermission()` / `checkEditPermission()` 추가.

### 4.3 arologis-service (DispatchAdminV1Controller)

```
FE 라우트 → RoleGuard (MASTER/MANAGER/AROLOGIS_MASTER/AROLOGIS_MANAGER) → PermissionGuard(dispatch.board) → 페이지
               |                                                                   |
               v                                                                   v
      기존 @PreAuthorize 보존                                        DynamicPermissionClient.canView/canEdit()
      (regression 0)                                                dispatch.board 페이지 코드
```

**적용 endpoint**:
- `GET /api/v1/arologis/admin/dispatches` — VIEW 가드 (`checkViewPermission`)
- `POST /api/v1/arologis/admin/dispatches/auto-match` — EDIT 가드 (`checkEditPermission`)
- `POST /api/v1/arologis/admin/dispatches/{id}/manual-assign` — EDIT 가드
- `PATCH /api/v1/arologis/admin/dispatches/{id}/driver` — EDIT 가드

### 4.4 slip-service (SlipController.inspect — inbound.inspection)

**적용 endpoint**:
- `POST /slips/{id}/inspect` — EDIT 가드 (`inbound.inspection` PageCode)

---

## 5. 점진 마이그레이션 이중 가드 패턴

SP-D2 와 동일한 이중 가드 구조:

1. **RoleGuard (1차 가드)**: 정적 역할 화이트리스트 — 기존 `@PreAuthorize` 보존.
2. **PermissionGuard (2차 가드)**: DB 동적 체크 — 마스터 revoke 시 RoleGuard 통과 후에도 진입 차단.

**SP-D4 계획 (전체 121 @PreAuthorize 동적 전환)**:
- RoleGuard 제거 후 PermissionGuard 단독 운용
- 비기본 역할(SALES → 매입 열람 등)에게 동적 grant 유효화

---

## 6. 회귀 가드 — SP-D2 P04 트랩 (lenient stub 자동 적용)

**SP-D2 P04 트랩**: `@MockBean DynamicPermissionClient` 누락 시
Eureka 비활성 환경에서 실제 auth-service 호출 시도 → RestClientException → 500.

**SP-D3 대응**:
- `SlipDynamicPermissionIT`: `@MockBean DynamicPermissionClient` + `@BeforeEach lenient stub` 신규 추가
- `DispatchSmsAuditDynamicPermissionIT`: notification-service 동일 패턴 추가
- 기존 `DispatchBoardAdminControllerIT`: `DynamicPermissionClient` @MockBean 미포함 — SP-D3 IT 신규 분리로 격리

**lenient stub 패턴**:
```java
@BeforeEach
void setupLenientStubs() {
    Mockito.lenient()
            .when(dynamicPermissionClient.canView(anyString(), anyString()))
            .thenReturn(true);
    Mockito.lenient()
            .when(dynamicPermissionClient.canEdit(anyString(), anyString()))
            .thenReturn(true);
}
```

---

## 7. Playwright 스펙 (QA)

**파일**: `clients/desktop/playwright/sp-d3-slip-dispatch-permission-migration/sp-d3-slip-dispatch-permission-migration.spec.ts`

| TC | 시나리오 | 검증 항목 |
|----|---------|---------|
| T1 | SALES → 매출 슬립 접근 가능 + 매입/배차 hidden | sales.slip.list 통과 + dispatch.board hidden |
| T2 | WAREHOUSE → 매입 슬립 + OCR 접근 가능 + 매출/배차 hidden | purchases.slip.list 통과 + dispatch.board hidden |
| T3 | DISPATCH → 배차 메뉴 + SMS 이력 접근 가능 + 매입/매출 차단 | dispatch.board 통과 + slips redirect "/" |
| T4 | 마스터가 SALES 의 purchases.slip.list revoke → hidden 확인 | revoke 후 redirect "/" + sales.slip.list 유지 |
| T5 | 권한 없는 URL 직접 진입 → redirect "/" (6 PageCode) | PermissionGuard Navigate to="/" replace |

**false green 가드**: `|| true` / `test.skip(!ok)` / `page.setContent()` 0건 (회귀 가드 4 TC 포함).

---

## 8. IT 추가 (구현 완료)

### 8.1 SlipDynamicPermissionIT (slip-service)

**파일**: `services/slip-service/src/test/java/com/samhanair/logis/slip/it/SlipDynamicPermissionIT.java`

| Case | 시나리오 | endpoint | 조건 | 기대 결과 |
|------|---------|----------|------|---------|
| C1 | SALES sales.slip.list canView=true → 매출 슬립 | `GET /slips?slipType=OUTBOUND` | canView=true | 200 OK |
| C2 | SALES sales.slip.list canView=false → 403 | `GET /slips?slipType=OUTBOUND` | canView=false | 403 FORBIDDEN |
| C3 | WAREHOUSE purchases.slip.list canView=true → 매입 슬립 | `GET /slips?slipType=INBOUND` | canView=true | 200 OK |
| C4 | WAREHOUSE purchases.slip.list canView=false → 403 | `GET /slips?slipType=INBOUND` | canView=false | 403 FORBIDDEN |
| C5 | DynamicPermissionClient RuntimeException → 500 아님 | `GET /slips?slipType=OUTBOUND` | throw RuntimeException | 200/403 (**500 아님**) |
| C6 | DISPATCH 매출 슬립 @PreAuthorize 차단 | `GET /slips?slipType=OUTBOUND` | ROLE_DISPATCH | 403 FORBIDDEN |

### 8.2 ArologisDynamicPermissionIT (arologis-service)

**파일**: `services/arologis-service/src/test/java/com/samhanair/logis/arologis/it/ArologisDynamicPermissionIT.java`

| Case | 시나리오 | endpoint | 조건 | 기대 결과 |
|------|---------|----------|------|---------|
| C1 | MASTER canView=true → 배차 list | `GET /api/v1/arologis/admin/dispatches` | canView=true | 200 OK |
| C2 | MASTER canView=false → 403 | `GET /api/v1/arologis/admin/dispatches` | canView=false | 403 FORBIDDEN |
| C3 | MASTER canEdit=false + canView=true → 403 (view-only) | `POST auto-match` | canEdit=false, canView=true | 403 FORBIDDEN |
| C4 | MASTER canEdit=false + canView=false → fallback 통과 | `POST auto-match` | canEdit=false, canView=false | 200/404 (403/500 금지) |
| C5 | MASTER canEdit=false + canView=true → 기사 변경 403 | `PATCH /driver` | canEdit=false, canView=true | 403 FORBIDDEN |
| C6 | AROLOGIS_MANAGER canView=true → 배차 list 200 | `GET /api/v1/arologis/admin/dispatches` | canView=true | 200 OK |

### 8.3 NotificationDynamicPermissionIT (notification-service)

**파일**: `services/notification-service/src/test/java/com/samhanair/logis/notification/it/NotificationDynamicPermissionIT.java`

| Case | 시나리오 | endpoint | 조건 | 기대 결과 |
|------|---------|----------|------|---------|
| C1 | DISPATCH canView=true → GET 이력 | `GET /admin/notifications/dispatch-sms/history` | canView=true | 200 OK |
| C2 | DISPATCH canView=false → GET 이력 403 | 동일 | canView=false | 403 FORBIDDEN |
| C3 | DISPATCH canEdit=false + canView=true → POST 403 (view-only) | `POST /history` | canEdit=false, canView=true | 403 FORBIDDEN |
| C4 | DISPATCH canEdit=false + canView=false → POST fallback 통과 | `POST /history` | canEdit=false, canView=false | 200 (403/500 금지) |
| C5 | DISPATCH canView=true → GET /latest 200 | `GET /history/latest` | canView=true | 200/404 (403 금지) |
| C6 | MANAGER canView=false → GET /latest 403 | `GET /history/latest` | canView=false | 403 FORBIDDEN |

### 8.4 기존 IT 회귀 방지 MockBean 추가

SP-D2 P04 트랩 대응으로 다음 기존 IT에 `@MockBean DynamicPermissionClient` + lenient stub 추가:
- `slip-service/ReceiptOcrShellIT` — POST /slips/receipt-ocr + X-User-Role 사용
- `slip-service/SlipInspectControllerIT` — POST /slips/{id}/inspect + X-User-Role 사용
- `slip-service/SlipDeliveryTagFilterIT` — GET /slips?slipType=OUTBOUND/INBOUND + X-User-Role 사용
- `arologis-service/DispatchAdminV1ControllerIT` — GET/POST/PATCH dispatch endpoints + X-User-Role 사용
- `notification-service/DispatchSmsSaveHistoryIT` — POST/GET history + X-User-Role 사용

---

## 9. 도메인 정합성 SQL

**파일**: `docs/qa/sp-d3-slip-dispatch-permission-migration/domain-integrity-check.md`

- SP-D3 6 PageCode 데이터 존재 확인 (role_count >= 2)
- 역할별 기본 권한 정합성 (SALES/WAREHOUSE/DISPATCH)
- SALES 매입/배차 권한 없음 확인
- DISPATCH 매입/매출 슬립 권한 없음 확인
- revoke 후 soft-delete 정합성
- Idempotency: seeder 2회 재실행 후 row count 동일
- MASTER 전체 권한 보유 확인
- SP-D1~D3 누적 19개 PageCode 완전성 확인

---

## 10. 후속 SP-D4 이관 계획 (전체 121 @PreAuthorize 동적 전환)

SP-D4 에서 전체 `@PreAuthorize` 121건을 PermissionGuard 단독으로 전환하여 완전 동적 RBAC 달성.

**SP-D4 전환 대상 예시**:
- `/sales/estimates` — `estimates.list`
- `/sales/partner-orders` — `sales.partner-order.list`
- `/arologis/*` — `arologis.*` (dispatch admin 3개)
- `/warehouse/inbound-inspections` — `inbound.inspection` (이미 SP-D3 에서 PageCode 정의됨)
- `/admin/*` — `admin.*` (MASTER 전용)

**SP-D4 조건**: SP-D3 이중 가드 전체 안정화 확인 후 RoleGuard 제거.
SALES 에게 `purchases.slip.list` grant 시 RoleGuard 제거 전 단계에서도 접근 허용 동작 검증 후 진행.

---

## QA 스크린샷 (mock PNG — PR 인라인 첨부용)

스크린샷 위치: `docs/qa/sp-d3-slip-dispatch-permission-migration/screenshots/`

| 파일명 | 내용 |
|--------|------|
| `T1-sales-slip-access-dispatch-hidden.png` | SALES 매출 슬립 접근 + 배차 hidden |
| `T2-warehouse-purchase-ocr-access-dispatch-hidden.png` | WAREHOUSE 매입/OCR 접근 + 배차 hidden |
| `T3-dispatch-board-sms-access-slip-hidden.png` | DISPATCH 배차/SMS 접근 + 매입/매출 차단 |
| `T4-sales-purchase-slip-revoked.png` | SALES purchases.slip.list revoke 후 상태 |
| `T5-no-perm-url-block-redirect.png` | 권한 없는 URL 직접 진입 redirect |
