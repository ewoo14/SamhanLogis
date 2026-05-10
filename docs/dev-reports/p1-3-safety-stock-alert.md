# P1-3 안전재고 알림 — DevOps dev-report

> **branch**: `feature/p1-3-safety-stock-alert`
> **작성일**: 2026-05-11
> **작성자**: DevOps agent

---

## 1. 슬라이스 목적

P1-3 안전재고 알림 — 제품별(창고별) 안전재고 임계값 설정 + 현재 가용 재고가 임계값 미만일 때 알림 목록 반환.
inventory-service 기존 `safety_stock_configs` 도메인(V7 스키마)에 V8 DEV-SEED 5건을 추가하고,
P13ValidationIT 로 엔드포인트·권한·부족 판정·upsert 동작을 검증한다.

---

## 2. 산출물 목록

| 파일 | 역할 |
|---|---|
| `services/inventory-service/src/main/resources/db/migration/V8__seed_p13_safety_stock.sql` | P1-3 안전재고 fixture seed 5건 (부족 3건 + 정상 2건) |
| `services/inventory-service/src/test/java/com/samhanair/logis/inventory/it/P13ValidationIT.java` | 안전재고 알림 검증 IT (12 시나리오, @MockBean 4종) |
| `docs/dev-reports/p1-3-safety-stock-alert.md` | 본 dev-report |

---

## 3. 기존 코드 확인 (변경 없음)

아래 파일은 이미 branch 에 존재하여 추가 작성하지 않았습니다.

| 파일 | 상태 |
|---|---|
| `V7__add_safety_stock_config.sql` | 기존 존재 — `safety_stock_configs` DDL + 인덱스 |
| `SafetyStockConfig.java` | 기존 존재 — 도메인 (productId / warehouseId / threshold / note) |
| `SafetyStockConfigRepository.java` | 기존 존재 — `findByProductIdAndWarehouseId` / `findAllByProductId` |
| `SafetyStockService.java` | 기존 존재 — `setSafetyStock` / `findAlerts` / `checkAndNotify` / `scheduledCheck` |
| `SafetyStockController.java` | 기존 존재 — `GET /inventory/alerts/safety-stock` / `POST /inventory/products/{productId}/safety-stock` |
| `SafetyStockSetRequest.java` | 기존 존재 — 임계값 설정 요청 DTO |
| `SafetyStockConfigResponse.java` | 기존 존재 — 설정 결과 응답 DTO |
| `SafetyStockAlertResponse.java` | 기존 존재 — 알림 응답 DTO (productId/warehouseId/threshold/currentQty/shortage) |
| `NotificationClient.java` | 기존 존재 — notification-service fire-and-forget 알림 발송 |

---

## 4. V8 seed 내용

### 4-1. safety_stock_configs fixture 5건

| ID | 창고 | 제품 | availableQty (V6) | threshold | 상태 |
|---|---|---|---|---|---|
| P13-CFG-001 | HQ-001 | PROD-001 (AJ040 싱글) | 115 | 100 | 정상 (115 ≥ 100) |
| P13-CFG-002 | HQ-001 | PROD-002 (AJ056 멀티) | 43  | 50  | BELOW (43 < 50) |
| P13-CFG-003 | HQ-001 | PROD-003 (AM100 실외기) | 27  | 30  | BELOW (27 < 30) |
| P13-CFG-004 | VH-001 | PROD-001 (AJ040 싱글) | 6   | 10  | BELOW (6 < 10) |
| P13-CFG-005 | VH-001 | PROD-002 (AJ056 멀티) | 4   | 3   | 정상 (4 ≥ 3) |

### 4-2. UUID 결정적 매핑 [DEV-SEED]

| 식별자 | UUID |
|---|---|
| HQ-001 창고 | `11111111-1111-1111-1111-000000000001` |
| VH-001 창고 | `11111111-1111-1111-1111-000000000002` |
| PROD-001 (AJ040 싱글) | `a0a0a0a0-0000-0000-0000-000000000001` |
| PROD-002 (AJ056 멀티) | `a0a0a0a0-0000-0000-0000-000000000002` |
| PROD-003 (AM100 실외기) | `a0a0a0a0-0000-0000-0000-000000000003` |
| P13-CFG-001 | `f1f1f1f1-0001-0000-0000-000000000001` |
| P13-CFG-002 | `f1f1f1f1-0002-0000-0000-000000000002` |
| P13-CFG-003 | `f1f1f1f1-0003-0000-0000-000000000003` |
| P13-CFG-004 | `f1f1f1f1-0004-0000-0000-000000000004` |
| P13-CFG-005 | `f1f1f1f1-0005-0000-0000-000000000005` |

---

## 5. P13ValidationIT 시나리오 (12건)

| # | 시나리오 | 검증 포인트 |
|---|---|---|
| 1-A | GET /alerts/safety-stock — INVENTORY 권한 | 부족 3건 반환 (data.length = 3) |
| 1-B | GET — MANAGER 권한 | 200 OK |
| 1-C | GET — MASTER 권한 | 200 OK |
| 1-D | 응답 필드 구조 검증 | productId / warehouseId / threshold / currentQty / shortage 존재 |
| 1-E | shortage 양수 검증 | 모든 BELOW 항목 shortage > 0 |
| 2-A | GET — SALES 권한 | 403 Forbidden |
| 2-B | POST — SALES 권한 | 403 Forbidden |
| 3-A | POST 신규 제품 설정 | 201 + id/productId/warehouseId/threshold/note 일치 |
| 3-B | POST 기존 (productId, warehouseId) 재요청 | upsert 갱신 — threshold 변경 반영 |
| 3-C | POST threshold = -1 | 400 Bad Request (@Min(0)) |
| 3-D | POST threshold = 0 | 201 (알림 비활성화 허용) |
| 4-A | 신규 설정 후 알림 목록 건수 증가 | balance 없는 제품 threshold 5 → BELOW → 건수 +1 |
| 4-B | 기존 BELOW threshold 낮추면 알림 감소 | PROD-003 threshold 30→20 (27≥20) → 건수 -1 |
| 5   | 인증 헤더 미설정 | 403 |

---

## 6. @MockBean 외부 client 4종

| Bean | mock 목적 |
|---|---|
| `ProductClient` | `setSafetyStock` 내 `requireExists` 격리 (Eureka 비활성 환경 500 방지) |
| `AccountingClient` | `InventoryAuditService` 공유 빈 격리 |
| `SlipClient` | `InboundInspectionService` 공유 빈 격리 |
| `NotificationClient` | `SafetyStockService.fireAlert` fire-and-forget 격리 |

`Mockito.lenient()` 패턴 적용 — 특정 시나리오에서 미호출 시 UnnecessaryStubbingException 방지.

---

## 7. 엔드포인트 요약

| Method | Path | 권한 | 설명 |
|---|---|---|---|
| GET | `/api/v1/inventory/alerts/safety-stock` | MASTER/MANAGER/INVENTORY | 안전재고 미달 목록 조회 |
| POST | `/api/v1/inventory/products/{productId}/safety-stock` | MASTER/MANAGER/INVENTORY | 임계값 설정/갱신 (upsert, 201) |

---

## 8. 알림 판정 규칙 (SafetyStockService.findAlerts)

1. `safety_stock_configs` 전체 순회
2. `threshold = 0` → 알림 비활성, 건너뜀
3. `warehouseId != null` → 해당 (product, warehouse) `stock_balance.availableQty` 단건 조회
4. `warehouseId = null` → 해당 product 전체 창고 `availableQty` 합산
5. `currentQty <= threshold` 이면 `SafetyStockAlertResponse` 목록에 추가
6. `shortage = threshold - currentQty` (양수 = 부족량)
7. 알림 발송은 `scheduledCheck` (5분 polling) + `checkAndNotify` (재고 변동 후 즉시 점검)

---

## 9. 연관 가드

- `feedback_it_mockbean_external_clients.md` — ProductClient/AccountingClient/SlipClient/NotificationClient 4종 @MockBean 의무
- `feedback_gradlew_exec_bit.md` — Windows 커밋 시 `git update-index --chmod=+x gradlew` 필수
- `project_build_conventions.md` — BaseEntity 7 audit fields, Soft Delete only
- `feedback_uuid_no_user_visibility.md` — 관리자 전용 화면이므로 UUID 노출 허용

---

## 10. 변경 이력

| 일자 | 작성자 | 내용 |
|---|---|---|
| 2026-05-11 | DevOps agent | V8 seed 5건 + P13ValidationIT 12 시나리오 (@MockBean 4종) + dev-report 초안 |
