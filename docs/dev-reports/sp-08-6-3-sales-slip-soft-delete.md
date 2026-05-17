# SP-08-6-3 매출 전표 soft delete (D1)

## 개요

- **슬라이스**: SP-08-6-3
- **작업일**: 2026-05-18
- **담당**: BE agent
- **브랜치**: `feat/sp-08-6-3-sales-slip-soft-delete`

## 정책 결정

### 출고 정책

| 상태 | 삭제 가능 여부 |
|---|---|
| DRAFT | O |
| SAVED | O |
| SENT 이후 (SENT/ACCEPTED/PROCESSING/INSPECTING/COMPLETED/CONFIRMED/SHIPPING/SHIPPED/DELIVERED) | X (422) |

- EDITABLE_STATUSES = {DRAFT, SAVED} — SP-08-5-3 매입 삭제 정책과 동일 기준 적용
- SENT 이후는 "출고 진행 중이거나 완료된 매출 전표" 로 간주 → 422 `SLIP_DELETE_SALES_SHIPPED`

### ErrorCode 매핑

| ErrorCode | HTTP | 메시지 |
|---|---|---|
| `SLIP_DELETE_SALES_SHIPPED` | 422 | 출고 진행 중이거나 완료된 매출 전표는 삭제할 수 없습니다. |
| `SLIP_DELETE_NON_SALES` | 403 | 매출 전표만 삭제할 수 있습니다. |

## 변경 파일

### 신규
1. `services/slip-service/src/main/java/com/samhanair/logis/slip/service/SalesSlipDeleteService.java`
2. `services/slip-service/src/main/java/com/samhanair/logis/slip/web/SalesSlipDeleteController.java`
3. `services/slip-service/src/test/java/com/samhanair/logis/slip/it/SlipSalesDeleteIT.java`

### 수정
4. `shared/common/src/main/java/com/samhanair/logis/common/exception/ErrorCode.java` — SLIP_DELETE_SALES_SHIPPED + SLIP_DELETE_NON_SALES 추가
5. `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/Slip.java` — `deleteForSales(actorId)` 도메인 메서드 추가

## IT 케이스 (9건)

| ID | 케이스 | 예상 결과 |
|---|---|---|
| D1 | SALES 권한으로 OUTBOUND DRAFT 전표 삭제 | 200 OK → 후속 GET 404 |
| D2 | stale updatedAt 전송 | 409 SLIP_OPTIMISTIC_LOCK_CONFLICT |
| D3 | 이미 삭제된 전표 재삭제 | 404 |
| D4 | INVENTORY 역할 삭제 시도 | 403 |
| D5 | WAREHOUSE 역할 삭제 시도 | 403 |
| D6 | ACCOUNTANT 역할 삭제 시도 | 403 |
| D7 | INBOUND 전표에 매출 삭제 endpoint 호출 | 403 SLIP_DELETE_NON_SALES |
| D8 | SENT 단계 전표 삭제 시도 | 422 SLIP_DELETE_SALES_SHIPPED |
| D9 | 삭제 성공 시 SLIP_DELETE audit log 1건 기록 | audit log revisionNo=1 |

## @MockBean 격리 8종

`InventoryClient` / `ProductClient` / `NotificationClient` / `NotificationChatRoomClient` / `PartnerInternalClient` / `PartnerBlockClient` / `UserInternalClient` / `ArologisDispatchClient`

## 컴파일 결과

```
./gradlew :shared:common:compileJava :services:slip-service:compileJava :services:slip-service:compileTestJava
→ BUILD SUCCESSFUL (unchecked 경고는 기존 코드베이스 기인, 신규 파일 무관)
```

## 미해결 항목

- Flyway 마이그레이션 불필요 — 신규 컬럼 없음 (soft delete 는 기존 `is_deleted` 컬럼 재사용)
- `SlipDeleteRequest` DTO 재사용 — 매입/매출 동일 구조이므로 신규 DTO 불필요

---

## QA 검증 (SP-08-6-3 D1)

작성일: 2026-05-18 | QA Agent: claude-sonnet-4-6

### Playwright 5 case 정적 검증

| 케이스 | 검증 대상 | assertion 수 | 결과 |
|---|---|---:|---|
| T1 | BE 계약: SalesSlipDeleteController + SalesSlipDeleteService + Slip.deleteForSales + ErrorCode | 16 | PASS |
| T2 | FE 계약: SALES_DELETE_ROLES + testid 4종 + Modal + deleteSalesSlip API | 15 | PASS |
| T3 | 409 conflict + 422 SHIPPED 배너 처리 | 7 | PASS |
| T4 | audit SLIP_DELETE + /audit-logs + slipAuditLogs + UUID 비공개 | 4 | PASS |
| T5 | 권한 가드: PreAuthorize + SlipSalesDeleteIT 5 method names | 9 | PASS |
| **합계** | | **51** | **51/51 PASS** |

### 핵심 검증 포인트

1. **엔드포인트 분리**: `DELETE /slips/{id}/sales` (매출) vs `DELETE /slips/{id}` (매입) URL 분리 확인
2. **권한 대칭**: BE `@PreAuthorize("hasAnyRole('SALES','MANAGER','MASTER')")` — FE `SALES_DELETE_ROLES` 정확히 일치
3. **422 SHIPPED**: `SLIP_DELETE_SALES_SHIPPED` (매출) vs `SLIP_DELETE_INSPECTION_COMPLETED` (매입) — 명칭 및 메시지 분리
4. **UUID 비공개**: `actorId` 화면 텍스트 직접 노출 없음, 전표번호(`slipNo`)만 Modal에 표시
5. **audit**: `"SLIP_DELETE"` action + `recordBatch` 호출 + `slipAuditLogs` query key 연동

### PNG 4장

| 파일 | 내용 |
|---|---|
| `01-sales-delete-confirm-modal.png` | 삭제 확인 Modal (SAVED 상태, 전표번호 SL-2026-00142, Malgun Gothic 한국어) |
| `02-sales-delete-shipped-alert.png` | 422 SHIPPED danger-banner (SENT 이후 단계 차단) |
| `03-sales-delete-success-redirect.png` | 삭제 성공 후 /sales 목록 리다이렉트 + success toast |
| `04-sales-delete-permission-guard.png` | INVENTORY 역할 — canDirectDeleteSales=false, 삭제 버튼 미노출 |

### Playwright spec 위치

`clients/desktop/playwright/sp-08-6-3-sales-slip-soft-delete/sp-08-6-3-sales-slip-soft-delete.spec.ts`
