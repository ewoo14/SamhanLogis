# Phase 2.6c 주문→전환 시 재고 동기차감 정합 — Implementation Plan

> **For agentic workers:** 본 plan 은 SamhanLogis 5-team 병렬 패턴([[multi-agent-team-pattern]])으로 실행. 서비스별 task 를 BE/FE/Designer/QA/DevOps 에 분배 → TM 통합 → 사이클 N=2 → CI → Docker 실 QA → 머지.

**Goal:** 주문→출고전표 전환 시 재고를 동기 차감하고, 재고 부족 시 전환을 사전 차단(409)하며, 전환으로 생성된 출고전표를 발행 즉시 불변으로 만든다.

**Architecture:** partner-order-service 의 convert 유스케이스에서 (1) warehouseCode→warehouseId 변환 (2) inventory 동기 deduct(부족 시 409=사전차단) (3) slip 발행 (4) 발행 실패 시 재고 보상 (5) converted 누적 순으로 재설계. inventory-service 는 by-code 역조회 internal endpoint + deduct 멱등 가드 추가. slip-service 는 sourceType=PARTNER_ORDER 전표를 발행 즉시 불변(SENT) 전이. 회계는 기존 SlipPublishedEvent 자동연계 유지(금액 정합 IT만).

**Tech Stack:** Spring Boot 3.3 / Java 17 / JPA / Flyway / Testcontainers / Eureka lb RestClient / RabbitMQ(기존 이벤트).

**배포 순서(의무):** inventory-service → slip-service → partner-order-service.

---

## File Structure (변경 맵)

### inventory-service
- `web/InternalWarehouseController.java` (Create): `GET /internal/inventory/warehouses/by-code?code=` — X-Internal-Token 가드, code→{warehouseId,code,name}.
- `web/dto/WarehouseByCodeResponse.java` (Create).
- `service/StockService.java` (Modify): `deduct()` 에 멱등(reference 중복 시 no-op) 가드.
- `db/migration/V{next}__add_stock_deduct_idempotency.sql` (Create): 차감 이력 reference 유니크 인덱스.
- `repository/WarehouseRepository.java` (이미 findByCode 존재 — 확인만).

### partner-order-service
- `client/InventoryClient.java` (Modify): `deduct(...)` + `resolveWarehouseIdByCode(code)` 추가.
- `service/PartnerOrderConvertService.java` (Modify): convert 트랜잭션 재설계(§3.4).
- `client/dto/InventoryDeductRequest.java` (Create) / `WarehouseByCodeResponse.java` (Create).

### slip-service
- `publish/SlipPublishService.java` (Modify): publishFromPartnerOrder 완료 후 sourceType=PARTNER_ORDER 전표 `send()`(DRAFT→SENT) 불변 전이.
- `domain/Slip.java` (확인): `send()` 또는 상태전이 메서드 존재 여부 → 없으면 도메인 메서드 추가.

### FE (clients/desktop)
- `routes/SalesPartnerOrderDetailPage.tsx` (Modify): 전환 409(재고부족) 에러 메시지 표시.
- `api/sales.ts` (확인): convert 에러 핸들링.

### 문서
- `docs/dev-reports/phase-2-6c-inventory-deduction.md` (Create).
- `docs/decisions/DECISIONS.md` (Modify): D-PO-2.6c.
- `docs/operational-validation/phase-2-6c-deploy-order.md` (Create).

---

## Task 1 (BE/DevOps): inventory-service — warehouseCode 역조회 internal endpoint

**Files:**
- Create: `services/inventory-service/.../web/InternalWarehouseController.java`
- Create: `services/inventory-service/.../web/dto/WarehouseByCodeResponse.java`
- Test: `services/inventory-service/.../web/InternalWarehouseControllerIT.java`

- [ ] **Step 1: 실패 IT 작성** — `GET /internal/inventory/warehouses/by-code?code=WH01` + `X-Internal-Token` → 200 + warehouseId. 없는 code → 404. 토큰 없음 → 401/403.
- [ ] **Step 2: IT 실패 확인** (엔드포인트 없음 404/메서드 없음).
- [ ] **Step 3: 구현** — `WarehouseRepository.findByCode(code)` 활용. `/internal/` prefix(X-Internal-Token 가드 자동). 응답 `record WarehouseByCodeResponse(UUID warehouseId, String code, String name)`. 없으면 `BusinessException(NOT_FOUND)`.
- [ ] **Step 4: IT 통과 확인** (실 Postgres Testcontainers).
- [ ] **Step 5: 커밋** `feat(inventory): warehouseCode 역조회 internal endpoint (2.6c)`.

## Task 2 (BE/DevOps): inventory-service — deduct 멱등 가드

**Files:**
- Modify: `services/inventory-service/.../service/StockService.java`
- Create: `services/inventory-service/.../db/migration/V{next}__add_stock_deduct_idempotency.sql`
- Test: `StockServiceDeductIdempotencyIT.java`

- [ ] **Step 1: 최신 Flyway V번호 확인** — `ls services/inventory-service/src/main/resources/db/migration/`.
- [ ] **Step 2: 실패 IT 작성** — 동일 `(referenceType, referenceId, productId)` 로 deduct 2회 → 재고는 1회분만 차감(2회차 no-op 200).
- [ ] **Step 3: IT 실패 확인** (2회 차감되어 잔량 부족/이중차감).
- [ ] **Step 4: 마이그레이션 + 구현** — 차감 이력 테이블(현행 구조 확인)에 `(reference_type, reference_id, product_id)` 부분 유니크 인덱스(referenceId NOT NULL 조건). `deduct()` 진입 시 동일 reference 존재하면 no-op return(기차감 간주). referenceType/referenceId nullable 유지(기존 수동 조정 무영향).
- [ ] **Step 5: IT 통과 확인**.
- [ ] **Step 6: 커밋** `feat(inventory): deduct reference 멱등 가드 (2.6c)`.

## Task 3 (BE): partner-order-service — InventoryClient.deduct + by-code

**Files:**
- Modify: `services/partner-order-service/.../client/InventoryClient.java`
- Create: `.../client/dto/InventoryDeductRequest.java`, `.../client/dto/WarehouseByCodeResponse.java`
- Test: `InventoryClientTest.java` (captor)

- [ ] **Step 1: 실패 테스트** — MockRestServiceServer 로 `deduct()` → `POST /inventory/deduct` body(productId, warehouseId, quantity, fromReservation=false, referenceType, referenceId, note) + `X-Internal-Token`. `resolveWarehouseIdByCode("WH01")` → `GET /internal/inventory/warehouses/by-code?code=WH01`.
- [ ] **Step 2: 실패 확인**.
- [ ] **Step 3: 구현** — 기존 reserve/release 패턴 복제. 409 응답 → `BusinessException(CONFLICT, "재고 부족...")` 전파. by-code 404 → `BusinessException(INVALID_INPUT)`.
- [ ] **Step 4: 통과 확인**.
- [ ] **Step 5: 커밋** `feat(partner-order): InventoryClient deduct + warehouse by-code (2.6c)`.

## Task 4 (BE): partner-order-service — convert 트랜잭션 재설계

**Files:**
- Modify: `services/partner-order-service/.../service/PartnerOrderConvertService.java`
- Test: `PartnerOrderConvertInventoryIT.java`

순서(spec §3.4): requireConvertible+잔여검증(현행) → warehouseCode→warehouseId(by-code) → 라인별 deduct(referenceType=`PARTNER_ORDER_CONVERT`, referenceId=convertKey, 부족 시 409 전체중단) → slip 발행 → **발행 실패 시 차감분 INBOUND 역보상** → 발행 성공 시 line.convert 누적+markConvertedIfComplete+saveAndFlush.

- [ ] **Step 1: 실패 IT** — ① 정상 전환 → deduct 호출(captor) 라인별 + 잔량 차감 ② 재고부족 → 409 + slip 미발행(SlipServiceClient @MockBean never called) + 재고 불변 ③ slip 발행 5xx → deduct 보상(INBOUND) 호출 확인 + 409 ④ 동일 convertKey 재시도 → deduct referenceId 동일(멱등) ⑤ 부분전환 → 선택 라인만 deduct.
- [ ] **Step 2: 실패 확인**.
- [ ] **Step 3: 구현** — InventoryClient/SlipServiceClient @MockBean lenient([[it-mockbean-external-clients]]). 보상은 inventoryClient INBOUND 역조정(미정 §9: release 아닌 INBOUND). 도메인 메서드 체인 유지(직접 set 금지).
- [ ] **Step 4: 통과 확인** (실 Postgres, skipped=0).
- [ ] **Step 5: 커밋** `feat(partner-order): convert 재고 동기차감+사전차단+보상 (2.6c)`.

## Task 5 (BE): slip-service — 주문전환 전표 발행 불변

**Files:**
- Modify: `services/slip-service/.../publish/SlipPublishService.java`, `.../domain/Slip.java`
- Test: `SlipPartnerOrderImmutabilityIT.java`

- [ ] **Step 1: 실패 IT** — from-partner-order 발행 전표 → 상태 SENT(불변) + 수정(updateSalesHeader)/삭제(deleteForSales) 시도 → 409. 기존 다른 sourceType 전표는 DRAFT 유지(회귀 0).
- [ ] **Step 2: 실패 확인** (현재 DRAFT 라 수정 가능).
- [ ] **Step 3: 구현** — `publishFromPartnerOrder()` saveAndFlush 전 `slip.send()`(DRAFT→SENT) 또는 신규 `markPublishedImmutable()` 도메인 메서드. sourceType=PARTNER_ORDER 한정. EDITABLE_STATUSES 미변경(SENT 가 자연히 제외됨).
- [ ] **Step 4: 통과 확인**.
- [ ] **Step 5: 커밋** `feat(slip): 주문전환 전표 발행 즉시 불변(SENT) (2.6c)`.

## Task 6 (QA): 회계 금액 정합 + 통합 IT

**Files:** `services/slip-service/.../SlipPublishedEventAmountIT.java` (회귀), cross-service 시나리오.

- [ ] 부분전환 slip 의 SlipPublishedEvent 금액 = 선택 라인 subtotal 합 IT 단언.
- [ ] 도메인 정합 SQL: inventory stock 차감 row(reference_type=PARTNER_ORDER_CONVERT) ↔ partner_order_lines.converted_quantity ↔ slip_lines.source_order_line_id 일관성.
- [ ] 커밋 `test(2.6c): 회계 금액 정합 + cross-service 재고/전환 일관성`.

## Task 7 (FE/Designer): 재고부족 전환 에러 UX

**Files:** `clients/desktop/.../routes/SalesPartnerOrderDetailPage.tsx`, `.../api/sales.ts`

- [ ] convert 409(재고부족) → 에러 메시지 토스트/모달("재고 부족: 품목 X 가용 N") 표시. design-system 컴포넌트 사용([[design-system-import-first]]).
- [ ] Designer: 에러 문구/색/위치 가이드.
- [ ] Playwright: 재고부족 전환 시도 → 에러 표시 / 정상 전환 성공.
- [ ] 커밋 `feat(fe): 전환 재고부족 409 에러 표시 (2.6c)`.

## Task 8 (QA/DevOps): Docker 실 QA + 문서

- [ ] Docker 실 QA: 실 inventory_db 적중(stock 차감 row psql 증빙) + slip 불변(수정 차단) 실화면. [[no-fake-data-ever]] 실 캡처만. `docs/qa/phase-2-6c-inventory-deduction/screenshots/`.
- [ ] dev-report + DECISIONS(D-PO-2.6c) + 배포순서 문서 + handoff 갱신(2.6a 머지 #325 + GitGuardian #326 + 2.6c).
- [ ] 커밋 `docs(2.6c): dev-report + DECISIONS + 배포순서 + handoff`.

---

## Self-Review
- **Spec coverage**: §3.1→T1, §3.2→T2, §3.3→T3, §3.4→T4, §3.5→T5, §3.6→T6, FE→T7, QA/문서→T8. ✅ 전 항목 매핑.
- **순서 일관**: deduct referenceId=convertKey 가 T3(클라)/T4(호출)/T2(멱등) 동일. ✅
- **배포순서**: inventory(T1,T2)→slip(T5)→partner-order(T3,T4). DevOps T8 문서화. ✅
- **미정(§9)**: 보상=INBOUND 역조정, 멱등=이력 reference 유니크 — T4/T2 Step3 에서 구조 확인 후 확정.
