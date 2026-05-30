# Phase 2.6c — 출고전표 전환 시 재고 예약(reserve) 모델 BE

> 작성일: 2026-05-31
> 브랜치: feat/phase-2-6c-inventory-deduction
> 담당: backend-engineer agent

---

## 0. 도메인 모델 (개발책임자 확정 2026-05-31)

- **주문서 = 재고 무영향** (confirm 포함)
- **출고전표로 전환(convert) = 재고 예약(reserve)** — 실재고 차감(deduct) 아님
- **가용 부족 시 전환 409 사전차단** (slip 미발행)
- **slip 발행 실패 시 reserve release 보상**
- **확정 단계 reserve 제거** (주문 무영향 원칙)
- **실재고 차감(deduct) = 후속 출고확정 슬라이스 — 본 범위 제외**

---

## 1. 구현 파일 목록

### inventory-service

| 파일 | 종류 | 내용 |
|---|---|---|
| `web/InternalWarehouseController.java` | 신규 Controller | `GET /internal/inventory/warehouses/by-code?code=` warehouseCode 역조회 |
| `web/dto/WarehouseByCodeResponse.java` | 신규 DTO | warehouseId / code / name 응답 |
| `service/StockService.java` | 수정 | reserve() 멱등 가드 추가 (referenceType+referenceId+productId+RESERVE 중복 no-op) |
| `repository/StockMovementRepository.java` | 수정 | `findByReferenceTypeAndReferenceIdAndProductIdAndMovementType` 추가 |
| `resources/db/migration/V14__add_stock_movement_reserve_idempotency_index.sql` | 신규 Flyway | `ux_stock_movement_reserve_idempotency` partial unique index |

### partner-order-service

| 파일 | 종류 | 내용 |
|---|---|---|
| `client/InventoryClient.java` | 수정 | reserve(referenceType, referenceId 오버로드) + release(동일) + resolveWarehouseIdByCode() 추가 |
| `service/PartnerOrderConvertService.java` | 수정 | reserve 예약 모델로 재설계 (warehouseId 역조회 → 라인별 reserve → slip 발행 → release 보상) |
| `service/PartnerOrderConfirmService.java` | 수정 | confirm 단계 라인별 reserve 제거 (주문 무영향 원칙) |

### slip-service

| 파일 | 종류 | 내용 |
|---|---|---|
| `publish/SlipPublishService.java` | 수정 | `publishFromPartnerOrder` 완료 후 PARTNER_ORDER 전표 DRAFT→SAVED→SENT 전이 (불변 가드) |

---

## 2. Flyway 버전

| 서비스 | 버전 | 내용 |
|---|---|---|
| inventory-service | **V14** | `ux_stock_movement_reserve_idempotency` partial unique index 추가 |
| partner-order-service | 변경 없음 | — |
| slip-service | 변경 없음 | — |

---

## 3. reserve 멱등 구조

- **인덱스**: `stock_movements (reference_type, reference_id, product_id, movement_type)` WHERE `reference_type IS NOT NULL AND reference_id IS NOT NULL AND movement_type = 'RESERVE'`
- **코드 가드**: `StockService.reserve()` — 동일 (referenceType, referenceId, productId, RESERVE) 조합 기존 movement 존재 시 balance 미변경 + no-op 응답 반환
- **referenceType**: `"PARTNER_ORDER_CONVERT"`, **referenceId**: SHA-256 해시 기반 결정적 UUID

---

## 4. StockBalance 가용·실·예약 구조

```
availableQty  = 실재고 - 예약재고 (가용 가능 수량)
reservedQty   = 예약 중 수량 (전환된 전표 수량)
totalQty      = 실재고 (= availableQty + reservedQty)
```

- `GET /inventory/balances` 응답(StockBalanceResponse): availableQty / reservedQty / totalQty 모두 노출 (기존부터 구분됨)

---

## 5. confirm reserve 제거 영향 (과도기)

- `PartnerOrderConfirmService.confirm()` 의 라인별 `inventoryClient.reserve()` 호출 **제거 완료**
- confirm 자동발행 slip (PENDING_RETRY 큐 포함) 의 전체 폐지는 **Phase 2.6b** 에서 처리 (미구현)
- 과도기: confirm 후 slip 은 발행되지만 재고 예약 없음 — 운영자 수동 관리 대상

---

## 6. IT 결과 (컴파일)

| 서비스 | compileJava | compileTestJava |
|---|---|---|
| inventory-service | SUCCESS | SUCCESS |
| partner-order-service | SUCCESS | SUCCESS |
| slip-service | SUCCESS | SUCCESS |

> Docker IT (Testcontainers) 는 한글 경로 JDK trap ([feedback_korean_path_jdk]) 으로 로컬 실행 불가. assemble + compileTestJava 만으로 PR 가능.

---

## 7. 신규 IT 파일

| 파일 | 서비스 | 검증 케이스 |
|---|---|---|
| `Phase26cReserveIT` | inventory | by-code 조회 + reserve 정상/멱등/가용부족/release/조회 |
| `Phase26cConvertReserveIT` | partner-order | reserve 호출 captor + 가용부족 사전차단 + slip 5xx release 보상 + 부분전환 |
| `Phase26cSlipImmutableIT` | slip | PARTNER_ORDER 전표 SENT 전이 + 수정/삭제 409 + ESTIMATE 전표 DRAFT 유지 |

---

## 8. commit 하지 않음

본 슬라이스는 파일 작성 + 컴파일 검증만 완료. **통합 commit 은 PM**.
