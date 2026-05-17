# SP-08-5-3 매입 전표 soft delete

작성일: 2026-05-18
브랜치: `feat/sp-08-5-3-purchase-slip-soft-delete`

## 1. Scope

GAS 운영 동등 기능 (SP-08 legacy parity) — 매입 전표 삭제 기능.
WAREHOUSE / MANAGER / MASTER 가 DRAFT 또는 SAVED 상태의 INBOUND 전표를
`updatedAt` 낙관적 잠금으로 soft delete 처리한다.
물리 삭제(hard delete)는 절대 허용하지 않으며 `is_deleted = true` + `deleted_at` 기록만 수행한다.

## 2. BE 변경

| 영역 | 변경 |
|---|---|
| Controller | `SlipDeleteController` 신규. `DELETE /slips/{id}` — SP-08-5-2 `SlipUpdateController` 패턴 일관 |
| 권한 | `WAREHOUSE / MANAGER / MASTER` 허용. `INVENTORY / SALES / ACCOUNTANT` 는 403 |
| Service | `SlipDeleteService` 신규. INBOUND 전용, `updatedAt` 검증, `deleteForPurchase()` 위임, audit 기록 |
| Domain | `Slip.deleteForPurchase(actorId)` 신규. INBOUND 가드 + `requireEditable()` (DRAFT/SAVED 만 허용) |
| DTO | `SlipDeleteRequest` 신규. `updatedAt` 단일 필드 (낙관적 잠금 값) |
| 응답 | `200 OK { data: null }` — 성공 시 빈 data (SP-08-5-2 패턴 일관) |
| ErrorCode | `SLIP_DELETE_INSPECTION_COMPLETED` 422 신규, `SLIP_DELETE_NON_INBOUND` 403 신규, `SLIP_OPTIMISTIC_LOCK_CONFLICT` 409 재사용 |

## 3. FE 변경

| 영역 | 변경 |
|---|---|
| API | `deletePurchaseSlip(id, updatedAt)` 신규. `apiClient.delete` + `{ data: { updatedAt } }` 요청 본문 |
| 상세 화면 | `SlipDetailPage` INBOUND 상세에 `삭제` 버튼 추가 |
| 권한 | `PURCHASE_DELETE_ROLES = ['WAREHOUSE', 'MANAGER', 'MASTER']` + `canDirectDeletePurchase` 연산 |
| 삭제 Modal | design-system `Modal` + 전표번호 비즈니스 식별자 표시 + `Button variant="danger"` |
| 409 처리 | `purchase-slip-delete-conflict-banner` + "다른 사용자가 먼저 수정했습니다. 최신 내용 불러오기 후 다시 시도해 주세요." + `refetchDetail()` 재시도 |
| 422 처리 | `alert('검수 완료된 매입 전표는 삭제할 수 없습니다')` 후 Modal close |
| 성공 처리 | `navigate('/purchases', { state: { toast: '전표가 삭제되었습니다' } })` + query cache invalidate |

## 4. Design 변경

| 영역 | 변경 |
|---|---|
| 삭제 버튼 위치 | 수정 버튼 우측, 목록으로 버튼 좌측 — DRAFT/SAVED 단계 `canDirectDeletePurchase` 조건부 렌더 |
| Modal UX | `size="sm"` Modal. 전표번호 강조 + 경고 문구 + 취소/삭제 footer |
| 409 배너 | `error-banner` class, `role="alert"`, 배너 내 UUID 미포함 |

## 5. ErrorCode catalog

| code | HTTP | 발생 조건 | IT case |
|---|---:|---|---|
| `SLIP_OPTIMISTIC_LOCK_CONFLICT` | 409 | 요청 `updatedAt` 과 서버 `modifiedAt`/`createdAt` 불일치 | `testDeleteOptimisticLockConflict` |
| `SLIP_DELETE_INSPECTION_COMPLETED` | 422 | DRAFT/SAVED 외 단계 전표 삭제 시도 | `testDeleteInspectionCompletedReturns422` |
| `SLIP_DELETE_NON_INBOUND` | 403 | INBOUND 아닌 전표에 매입 삭제 endpoint 호출 | `testDeleteNonInboundForbidden` |
| `NOT_FOUND` | 404 | 전표 미존재 또는 이미 soft-deleted | `testDeleteAlreadyDeletedReturns404` |
| `FORBIDDEN` | 403 | 비허용 role (INVENTORY / SALES / ACCOUNTANT) | `testDeleteForbiddenForInventory/Sales/Accountant` |

## 6. Verification table

| 검증 항목 | 결과 |
|---|---|
| Playwright 정적 5 case | PASS: 5 / 0 failed |
| PNG 4장 생성 | PASS: 4 PNG, 19~27 KB (한국어 정상 렌더) |
| Spring targeted IT 10 case | PASS: 10 tests / 0 failed |

### BE IT 10 case 명세

| case | 검증 내용 |
|---|---|
| `testDeleteSuccess` | DRAFT 전표 삭제 200 + `is_deleted=true` + audit `SLIP_DELETE` 기록 |
| `testDeleteOptimisticLockConflict` | stale `updatedAt` → 409 `SLIP_OPTIMISTIC_LOCK_CONFLICT` |
| `testDeleteAlreadyDeletedReturns404` | 이미 soft-deleted 전표 → 404 |
| `testDeleteForbiddenForInventory` | INVENTORY role → 403 |
| `testDeleteForbiddenForSales` | SALES role → 403 |
| `testDeleteForbiddenForAccountant` | ACCOUNTANT role → 403 |
| `testDeleteNonInboundForbidden` | OUTBOUND 전표 삭제 시도 → 403 `SLIP_DELETE_NON_INBOUND` |
| `testDeleteInspectionCompletedReturns422` | INSPECTING 단계 전표 → 422 `SLIP_DELETE_INSPECTION_COMPLETED` |
| `testDeleteConfirmedReturns422` (D8b) | CONFIRMED 단계 전표 → 422 `SLIP_DELETE_INSPECTION_COMPLETED` |
| `testDeleteAuditLogRecorded` | 삭제 성공 후 `SLIP_DELETE` audit log 1건 조회 확인 |

## 7. Internal API UUID 정책 (SP-08-5-1 정합)

- path parameter `id` (UUID) 는 BE routing 전용 — 화면 텍스트 노출 금지
- Modal 확인 문구: 전표번호 (`slipNo`, 예: `2026/05/18-1`) 만 표시
- 409 conflict 배너: actorId 미노출, actorName 도 삭제 플로우에서 표시 불필요
- audit log: `actorId` 는 색상 hash 전용 (`slipAudit.ts` 주석 동일)

## 8. InboundInspection 정책 결정

BE agent 결정 (소스 코드 확인 기반):

- `Slip.deleteForPurchase()` 내부에서 `slipType != INBOUND` → `SLIP_DELETE_NON_INBOUND` (403)
- `requireEditable()` 가드 — DRAFT/SAVED 이외 상태는 `SLIP_DELETE_INSPECTION_COMPLETED` (422)
- 검수 완료(`COMPLETED`) 및 진행 중(`INSPECTING`, `PROCESSING`) 전표는 삭제 불가
- FE 에서도 `canDirectDeletePurchase` 로 DRAFT/SAVED 만 삭제 버튼 활성

InboundInspection 도메인 클래스는 현재 미존재. 검수 완료 판단은 `Slip.status` 기반으로 `requireEditable()` 에서 처리.

## 9. Migration 판단

신규 Flyway migration 불필요. 이유:
- soft delete 컬럼 (`is_deleted`, `deleted_at`) 은 V1 `BaseEntity` 패턴에 포함
- audit log 테이블 (`slip_audit_logs`) 은 SP-08-5-2 이전에 이미 존재
- `SLIP_DELETE_*` ErrorCode 는 Java enum 신규 — DB 스키마 변경 없음

## 10. QA 스크린샷

| 파일 | 내용 | 크기 |
|---|---|---|
| `docs/qa/sp-08-5-3-purchase-slip-soft-delete/screenshots/01-delete-confirm-modal.png` | 삭제 확인 Modal (전표번호 2026/05/18-1, 취소/삭제 버튼) | 19 KB |
| `docs/qa/sp-08-5-3-purchase-slip-soft-delete/screenshots/02-delete-inspection-completed-alert.png` | 422 검수 완료 차단 배너 + INSPECTING 상태 표시 | 22 KB |
| `docs/qa/sp-08-5-3-purchase-slip-soft-delete/screenshots/03-delete-success-redirect.png` | 삭제 성공 후 /purchases 리다이렉트 + toast 안내 | 25 KB |
| `docs/qa/sp-08-5-3-purchase-slip-soft-delete/screenshots/04-delete-permission-guard.png` | INVENTORY 역할 삭제 버튼 비노출 + 403 안내 | 27 KB |

모든 PNG: 한국어 정상 렌더 (Malgun Gothic), 비즈니스 식별자 `slipNo=2026/05/18-1` / 거래처 `삼한공조` 표시, UUID 미노출 검증 완료.
