# P0-9 입고 검수 UI — DevOps dev-report

> **branch**: `feature/p0-9-warehouse-inspection-ui`
> **작성일**: 2026-05-11
> **작성자**: DevOps agent

---

## 1. 슬라이스 목적

P0-9 (missing-features-catalog §1 P0-9) — 입고 검수(INSPECTING) UI 화면 구현.
`SlipTransitionService.inspect()` backend 구현 완료 상태에서 inventory-service 검수 도메인 연계 seed + IT 검증 산출물 제공.

---

## 2. 산출물 목록

| 파일 | 역할 |
|---|---|
| `services/inventory-service/src/main/resources/db/migration/V6__seed_p09_inbound_inspection.sql` | 입고 슬립 5건 검수 seed (stock_lots 13행 + stock_balances 6행 + stock_movements 13행) |
| `services/inventory-service/src/test/java/com/samhanair/logis/inventory/it/P09ValidationIT.java` | 검수 UI 검증 IT (10 시나리오) |
| `docs/dev-reports/p0-9-warehouse-inspection-ui.md` | 본 dev-report |

---

## 3. 기존 코드 확인 (변경 없음)

아래 파일은 이미 branch 에 존재하여 추가 작성하지 않았습니다.

| 파일 | 상태 |
|---|---|
| `V5__add_inbound_inspections.sql` | 기존 존재 — inbound_inspections / inbound_inspection_lines 테이블 DDL |
| `InboundInspection.java` | 기존 존재 — 도메인 (PENDING/COMPLETED/CANCELED 상태머신) |
| `InboundInspectionLine.java` | 기존 존재 — 라인 도메인 (recordResult / normalQty) |
| `InboundInspectionService.java` | 기존 존재 — getOrCreateInspection / saveInspectionResult / completeInspection |
| `InboundInspectionController.java` | 기존 존재 — GET/{slipId}, POST/{slipId}/inspect, POST/{slipId}/complete |
| `InboundInspectionRepository.java` | 기존 존재 |
| `InboundInspectionLineRepository.java` | 기존 존재 |
| `SlipClient.java` | 기존 존재 — slip-service getSlip(slipId) |
| `SlipDetail.java` / `SlipLineDetail.java` | 기존 존재 |

---

## 4. V6 seed 내용

### 4-1. 입고 슬립 5건 대응 UUID 매핑

| 슬립번호 | slip_id UUID | 상태 | 창고 | 라인 수 |
|---|---|---|---|---|
| INSP-2026-0001 | b0b0b0b0-...-0001 | SAVED | HQ-001 | 2 |
| INSP-2026-0002 | b0b0b0b0-...-0002 | SAVED | HQ-001 | 3 |
| INSP-2026-0003 | b0b0b0b0-...-0003 | SAVED | HQ-001 | 2 |
| INSP-2026-0004 | b0b0b0b0-...-0004 | SAVED | VH-001 | 3 |
| INSP-2026-0005 | b0b0b0b0-...-0005 | CONFIRMED | HQ-001 | 3 |

### 4-2. 제품 UUID 결정적 매핑 [DEV-SEED]

| 품목 | product_id UUID |
|---|---|
| AJ040RXH4BC1 (싱글) | a0a0a0a0-...-0001 |
| AJ056RXH4BC1 (멀티) | a0a0a0a0-...-0002 |
| AM100 (실외기) | a0a0a0a0-...-0003 |

### 4-3. stock_lots 초기 잔량 합계

| product_id | HQ-001 available | VH-001 available |
|---|---|---|
| PROD-001 | 115 (20+15+30+50) | 6 |
| PROD-002 | 43 (10+8+25) | 4 |
| PROD-003 | 27 (5+12+10) | 2 |

stock_movements 13건 — referenceType = `INBOUND_SLIP`, referenceId = 슬립 UUID.

---

## 5. P09ValidationIT 시나리오

| # | 시나리오 | 검증 포인트 |
|---|---|---|
| 1-A | GET /inbound-inspections/{slipId} 신규 생성 | status=PENDING, lines.size=2, slipNo 일치 |
| 1-B | 동일 slipId 2회 GET | 검수 레코드 중복 생성 없음 (inspectionId 동일) |
| 1-C | SALES 권한 GET → 403 | PreAuthorize 권한 매트릭스 |
| 2-A | POST /inspect 불량 없음 | inspectedQty/normalQty 저장, 상태 PENDING 유지 |
| 2-B | POST /inspect 불량 포함 | defectQty=2 → normalQty=18, defectReason 저장 |
| 2-C | POST /inspect lines 빈 배열 → 400 | @NotEmpty Bean Validation |
| 3-A | POST /complete 전체 통과 | status=COMPLETED, stockApplied=true, completedAt 존재 |
| 3-B | POST /complete 미입력 라인 있음 → 409 | 도메인 가드 (allFilled 검증) |
| 3-C | POST /complete 이미 완료 → 멱등 200 | stockApplied=true, 중복 재고 반영 없음 |
| 3-D | SALES 권한 complete → 403 | PreAuthorize 권한 매트릭스 |

---

## 6. @MockBean 외부 client 4종

| Bean | mock 목적 |
|---|---|
| `SlipClient` | slip-service getSlip(slipId) — Eureka 비활성 환경 500 방지 |
| `ProductClient` | InventoryAuditService.create 등 공유 사용 |
| `AccountingClient` | InventoryAuditService.complete 분개 trigger 공유 |
| `SlipServiceClient` | DpsCompareService.getOutboundSlips 공유 |

`Mockito.lenient()` 패턴 적용 — 특정 시나리오에서 미호출 시 UnnecessaryStubbingException 방지.

---

## 7. 엔드포인트 요약

| Method | Path | 권한 | 설명 |
|---|---|---|---|
| GET | `/api/v1/inventory/inbound-inspections/{slipId}` | WAREHOUSE/MANAGER/MASTER | 검수 상세 조회 (없으면 신규 생성) |
| POST | `/api/v1/inventory/inbound-inspections/{slipId}/inspect` | WAREHOUSE/MANAGER/MASTER | 라인별 검수 결과 저장 |
| GET | `/api/v1/inventory/inbound-inspections` | WAREHOUSE/MANAGER/MASTER | 검수 history 페이지 (status 필터) |
| POST | `/api/v1/inventory/inbound-inspections/{slipId}/complete` | WAREHOUSE/MANAGER/MASTER | 검수 완료 → 재고 반영 |

---

## 8. 재고 반영 규칙 (completeInspection)

1. `normalQty = inspectedQty - defectQty`
2. normalQty > 0 → `StockLot.create()` + `StockBalance.addInbound()` + `StockMovement` 기록
3. normalQty = 0 → 해당 라인 skip (결품 / 전량 불량)
4. movement referenceType = `"INBOUND_INSPECTION"`, referenceId = inspectionId
5. `InboundInspection.markStockApplied()` → `stockApplied = true` (중복 반영 방지)

---

## 9. 연관 가드

- `feedback_it_mockbean_external_clients.md` — SlipClient/ProductClient/AccountingClient/SlipServiceClient 4종 @MockBean 의무
- `feedback_gradlew_exec_bit.md` — Windows 커밋 시 `git update-index --chmod=+x gradlew` 필수
- `project_build_conventions.md` — BaseEntity 7 audit fields, Soft Delete only
- `feedback_uuid_no_user_visibility.md` — slipNo 사용자 노출, slipId(UUID) 내부 참조

---

## 10. 변경 이력

| 일자 | 작성자 | 내용 |
|---|---|---|
| 2026-05-11 | DevOps agent | P0-9 seed V6 + P09ValidationIT 10 시나리오 + dev-report 초안 |
