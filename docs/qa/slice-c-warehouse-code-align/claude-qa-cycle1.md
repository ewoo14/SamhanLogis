# QA 리뷰 — 슬라이스 C (PR #328) claude-qa-cycle1

- **PR**: #328 `feat/slice-c-slip-inventory-warehouse-align`
- **날짜**: 2026-05-31
- **리뷰어**: Claude QA Agent
- **결론**: APPROVE (단, P1 1건 · P2 3건 후속 확인 권고)

---

## 1. 결론 요약

슬라이스 C 의 핵심 설계(inventory 단일 출처 warehouseId 직달 + yml 폴백 하위호환 + FE 창고 필수선택)는 코드와 테스트 양쪽에서 올바르게 구현되었다. CI 23 job 전부 SUCCESS / skipped=0 확인. 머지 블로킹 결함은 없으나 P1 1건(cross-service 창고 동일성 단언 누락)을 후속에서 보강할 것을 권고한다.

---

## 2. 점검 결과 (Findings)

### [P0] — 없음

### [P1] P1-1: 창고 UUID 동일성(reserve↔slip) 를 단일 IT 에서 단언하는 테스트가 없음

**문제**

spec §6 의 가장 중요한 invariant는 "convert 가 reserve 에 전달한 warehouseId 와 slip 에 저장된 sourceWarehouseId 가 동일 창고 UUID 여야 한다"는 것이다.
현재 이를 검증하는 테스트가 두 서비스로 분리되어 있다.

- `PartnerOrderConvertIT.case6`: payload captor 로 `warehouseId = "00000000-…-0001"` 을 단언 (partner-order 측).
- `SlipPublishWarehouseIdIT.warehouseId_present_usedDirectly`: slip 이 `INVENTORY_WAREHOUSE_ID = "11111111-…-0001"` 을 `sourceWarehouseId` 로 저장함을 단언 (slip 측).

두 UUID 값이 서로 다른 test fixture 를 사용하고 있어 "같은 창고 UUID 가 reserve 와 slip 양쪽에 동시에 도달했는지" 를 직접 증명하지 못한다. partner-order IT 에서는 SlipServiceClient 가 @MockBean 이라 실제 slip DB 조회 불가; slip IT 에서는 InventoryClient 가 @MockBean 이라 실제 reserve 검증 불가. 서비스 간 경계를 넘는 invariant는 Docker 실 QA 에서만 완전히 증명 가능하다.

**제안**

Docker 실 QA 재현 절차(섹션 4)의 psql 쿼리를 반드시 실행하여 두 DB(inventory, slip)의 warehouseId 가 동일함을 스크린샷으로 캡처하고 PR 본문에 인라인 첨부할 것 (`feedback_pr_qa_screenshots`, `feedback_no_fake_data_ever`).

---

### [P2] P2-1: warehouseId 형식 오류(UUID 아닌 문자열) 시 400 응답 경로 — IT 미보유

**문제**

`SlipPublishService.resolveWarehouseId` 내부에서 `warehouseId` 가 UUID 형식이 아니면 `BusinessException(INVALID_INPUT)` 을 발생시킨다. 그러나 이 분기를 명시적으로 트리거하는 IT 가 없다. 현실에서 partner-order 가 `UUID.toString()` 을 통해 항상 올바른 형식을 보내므로 실제 발생 가능성은 낮지만, spec §5 에 명시된 에러 경로이므로 IT 보강이 권고된다.

**제안**

`SlipPublishWarehouseIdIT` 에 케이스 3 추가: `warehouseId = "not-a-uuid"` 전달 → 400 응답 단언.

---

### [P2] P2-2: Playwright 시나리오 11 — 창고 드롭다운이 실제 `GET /inventory/warehouses` 를 mock 하는지 미검증

**문제**

시나리오 11 은 `VITE_MOCK_MODE=1` 에서 실행된다. `warehouseSelect.selectOption({ index: 1 })` 은 비-placeholder 옵션 (index 1) 을 선택하는데, 이 옵션이 실제로 `GET /inventory/warehouses` mock 응답에서 채워진 것인지, 아니면 `WarehouseSelector` 컴포넌트의 하드코딩 옵션인지 spec 파일에서 확인할 수 없다. mock.ts 의 inventory warehouses 엔드포인트 블록이 Phase 2.6a 블록에 포함됐는지 별도 확인이 필요하다. mock 응답이 없으면 드롭다운이 빈 목록으로 렌더되어 `index: 1` 선택이 no-op 가 될 수 있다.

**제안**

mock.ts 에서 `GET /inventory/warehouses` 응답(최소 1 물리창고)이 정의됐는지 확인하고, 시나리오 11 에 `warehouseSelect` 의 `option` 개수 >= 2 단언을 추가하라.

---

### [P2] P2-3: estimate-app 폴백 회귀 증명 — Phase26cSlipImmutableIT 의 buildPartnerOrderPayload 가 warehouseId 없이 호출하므로 폴백 경로를 간접 실행하지 않음

**문제**

`Phase26cSlipImmutableIT.buildPartnerOrderPayload` 는 payload 에 `warehouseId` 를 넣지 않는다. 슬라이스 C 이전 작성된 이 헬퍼는 따라서 `resolveWarehouseId(null, "WH-001")` → yml 폴백 경로를 실행한다. 이것이 의도된 회귀 검증이다.

그러나 `SlipPublishWarehouseIdIT.warehouseId_absent_fallsBackToYml` 과 `Phase26cSlipImmutableIT` 양쪽에서 yml 폴백이 중복 검증되는 반면, convert 경로(warehouseId 비-null)의 DRAFT→SAVED→SENT 불변 전이 연동은 별도로 검증되지 않는다. 즉 "warehouseId 직달 + SENT 불변 전이가 함께 동작하는가?" 를 단언하는 IT 가 없다.

**제안**

`SlipPublishWarehouseIdIT` 에 케이스 3 추가: `warehouseId` 비-null 로 발행 → `Slip.status == SENT` 단언. (SlipPublishWarehouseIdIT 는 현재 status 를 단언하지 않음.)

---

### [OK] 회귀 위험: estimate 경로(yml 폴백) 보호 — 충분

`Phase26cSlipImmutableIT.s4_estimateSlip_remainsDraft` 가 estimate 경로 발행 → status=DRAFT 를 보장하고, `SlipPublishWarehouseIdIT.warehouseId_absent_fallsBackToYml` 이 yml 폴백 UUID 저장을 단언한다. `WarehouseCodeMapper` 자체는 수정 없음. 회귀 위험 없음.

---

### [OK] @MockBean 격리 — 준수

`SlipPublishWarehouseIdIT`: `ProductClient`, `InventoryClient`, `PartnerInternalClient`, `UserInternalClient`, `WarehouseInternalClient` 모두 `@MockBean` + `Mockito.lenient()`. `feedback_it_mockbean_external_clients` 규칙 준수.

`PartnerOrderConvertIT`: `EstimateClient`, `DcConfigClient`, `ProductClient`, `InventoryClient`, `SlipServiceClient`, `PartnerAuthClient`, `PartnerLookupClient`, `ProductCatalogLookupClient`, `DynamicPermissionClient` 전부 `@MockBean` + `lenient`. 준수.

---

### [OK] fingerprint 에 warehouseId 미포함 — 설계 의도 반영

`SlipPublishService.computeFingerprint(PublishFromPartnerOrderRequest)` 에서 fingerprint canonical 맵에 `warehouseCode` 는 포함되고 `warehouseId` 는 미포함이다. 이는 spec §3.1 "fingerprint: 기존대로 warehouseCode 기준 유지(멱등 안정성)"와 정합한다. convert 재시도 시 warehouseId 가 달라도 fingerprint 충돌이 일어나지 않아 재시도 안전.

---

### [OK] FE UUID 비공개 가드 — 준수

`SalesPartnerOrderDetailPage.tsx` 의 convert mutate 호출: `{ items, warehouseCode: convertWarehouse.code }`. `warehouseCode`(문자열 "HQ-001") 만 API 전송, UUID 는 전송 안 함. `WarehouseSelector` 의 내부 value 가 id(UUID)이지만 `onChange(_id, warehouse)` 에서 `warehouse.code` 만 추출. `feedback_uuid_no_user_visibility` 준수.

---

### [OK] CI — 전 job SUCCESS, skipped=0

PR #328 CI 체크롤업:
- 빌드+테스트 (shared/auth/gateway/user/product/inventory/logging/slip-units/slip-it-public/slip-it-core/accounting+partner/phase9-10): 전부 SUCCESS
- JUnit 테스트 결과 보고서 (7개 job): 전부 SUCCESS
- Playwright (web + electron + mobile emul): SUCCESS
- Detox Android (mobile-staff / arologis-mobile): SUCCESS
- Frontend DS / Mobile-Staff / Desktop typecheck+lint+build: SUCCESS
- Notion Runtime Zero Guard / Credential Plaintext Guard: SUCCESS
- GitGuardian: SUCCESS

총 23 job 전부 `conclusion: SUCCESS`. silent skip 징후 없음.

---

## 3. Docker 실 QA 재현 절차

> 주의: 실 QA 는 합성 데이터/mock fixture 화면 사용 금지. 실 캡처만 PR 인라인 첨부 (`feedback_no_fake_data_ever`).

### 사전 조건

```
# Docker Desktop 실행 확인
docker ps

# 전체 서비스 기동 (docker-compose.dev.yml)
docker-compose -f docker-compose.dev.yml up -d

# 서비스 준비 대기 (gateway:8080 응답 확인)
# partner-order-service:8084, slip-service:8086, inventory-service:8083
```

### 단계 1: 시드 데이터 확인 (inventory DB)

```sql
-- inventory DB 접속
\c inventory_db

-- 물리 창고 목록 확인
SELECT id, code, name, virtual FROM warehouses WHERE virtual = FALSE ORDER BY code;
-- 예상: HQ-001(…0001), VH-001(…0002), CS-001(…0003), VR-001(…0004)

-- 테스트 대상 품목 재고 가용량 확인
SELECT
    p.model_name,
    w.code AS warehouse_code,
    i.available_quantity,
    i.reserved_quantity,
    i.actual_quantity
FROM inventory_items i
JOIN products p ON i.product_id = p.id
JOIN warehouses w ON i.warehouse_id = w.id
WHERE i.available_quantity > 0
ORDER BY w.code, p.model_name
LIMIT 10;
-- 가용 > 0 품목 + 창고 조합 1개 이상 확보 필요
```

### 단계 2: 주문 생성 및 창고 선택 전환

```
# JWT 토큰 취득 (MASTER 계정)
POST http://localhost:8080/api/v1/auth/login
Body: { "username": "admin", "password": "..." }
→ accessToken 저장

# 거래처 주문 생성 (DRAFT)
POST http://localhost:8080/api/v1/partner-orders
Header: Authorization: Bearer {accessToken}
Body: {
  "partnerCode": "P-001",
  "lines": [{ "modelCode": "<단계1 에서 확인한 모델명>", "quantity": 2, ... }]
}
→ orderId, orderNo 저장
```

데스크톱 앱 (`http://localhost:5174`) 에서 실행:
1. 로그인 (MASTER)
2. 영업 > 주문서 > 방금 생성된 주문 상세 진입
3. "출고전표 전환" 버튼 클릭 → 모달 열림 확인
4. **창고 미선택 상태에서 전환 버튼이 disabled 임을 캡처**
5. 출고 창고 드롭다운 → "단계1 에서 재고 가용 창고(예: HQ-001)" 선택
6. 전환 수량 입력 (1 이상)
7. "출고전표로 전환" 클릭
8. **성공 토스트(slipNo + 발행 문구) 화면 캡처** → PR 인라인 첨부 의무

### 단계 3: psql 적중 검증 (창고 UUID 동일성)

```sql
-- [partner_order_db] 주문 converted_quantity 갱신 확인
\c partner_order_db
SELECT
    po.order_no,
    pol.model_name,
    pol.quantity,
    pol.converted_quantity
FROM partner_orders po
JOIN partner_order_lines pol ON pol.partner_order_id = po.id
WHERE po.order_no = '<단계2 orderNo>';
-- 기대: converted_quantity = 전환 입력 수량

-- [inventory_db] 예약(reserve) 확인
\c inventory_db
SELECT
    p.model_name,
    w.code AS warehouse_code,
    w.id AS warehouse_id,
    ir.quantity AS reserved_qty,
    ir.reference_type,
    ir.reference_id
FROM inventory_reservations ir
JOIN products p ON ir.product_id = p.id
JOIN warehouses w ON ir.warehouse_id = w.id
WHERE ir.reference_type = 'PARTNER_ORDER_CONVERT'
ORDER BY ir.created_at DESC
LIMIT 5;
-- 기대: warehouse_id = 선택한 창고 UUID (예: HQ-001 → …0001)

-- [slip_db] 전표 발행 확인 및 sourceWarehouseId 적중
\c slip_db
SELECT
    s.slip_no,
    s.status,
    s.source_warehouse_id,
    s.source_type
FROM slips s
WHERE s.source_type = 'PARTNER_ORDER'
ORDER BY s.created_at DESC
LIMIT 3;
-- 기대:
--   status = SENT (2.6c 불변)
--   source_warehouse_id = inventory_db 의 warehouse_id (동일 UUID)

-- [핵심 단언] inventory reserve warehouse_id = slip source_warehouse_id 동일 확인
-- (별도 쿼리 또는 수동 비교)
-- inventory_db warehouse_id:  <UUID-A>
-- slip_db source_warehouse_id: <UUID-A>
-- → 양쪽 동일해야 창고코드 정렬 성공 확인
```

### 단계 4: 멱등 재시도 확인

```
# 동일 orderId 로 convert-to-slip 재호출 (동일 idempotencyKey)
POST http://localhost:8080/api/v1/partner-orders/{orderId}/convert-to-slip
Header: Authorization: Bearer {accessToken}
Body: { "items": [...], "warehouseCode": "<단계2 창고코드>" }
→ 기대: 200 OK, 동일 slipNo 반환 (slip 신규 발행 없음)
```

```sql
-- slip_db: slip row count 변화 없음 확인
SELECT COUNT(*) FROM slips WHERE source_type = 'PARTNER_ORDER';
-- 재시도 전후 동일해야 함
```

### 단계 5: estimate-app 폴백 회귀 확인

```
# from-estimate 발행 (yml warehouseCode 사용) — 별도 curl 또는 estimate-app 사용
POST http://localhost:8080/api/v1/slips/from-estimate
Header: Idempotency-Key: EST-REG-001
Body: {
  "estimateNumber": "EST-2026-001",
  "warehouseCode": "00003",
  ...
}
→ 기대: 201 Created
```

```sql
-- slip_db: 방금 발행된 전표의 source_warehouse_id = yml 맵의 UUID
SELECT slip_no, status, source_warehouse_id, source_type
FROM slips WHERE source_type = 'ESTIMATE'
ORDER BY created_at DESC LIMIT 1;
-- 기대: source_warehouse_id = app.publish.warehouse-code-map["00003"] UUID
-- status = DRAFT (PARTNER_ORDER 불변 미적용)
```

---

## 4. 미확인 사항 (후속 확인 권고)

| 항목 | 세부 | 우선순위 |
|---|---|---|
| P1-1 | Docker 실 QA 에서 inventory reserve warehouseId = slip sourceWarehouseId psql 직접 비교 캡처 | 머지 전 의무 |
| P2-1 | `SlipPublishWarehouseIdIT` 케이스 3: 잘못된 UUID 형식 → 400 단언 추가 | 다음 슬라이스 |
| P2-2 | mock.ts `GET /inventory/warehouses` 블록 존재 여부 확인 + 시나리오 11 옵션 개수 단언 | 다음 슬라이스 |
| P2-3 | `SlipPublishWarehouseIdIT` 케이스: warehouseId 비-null + status=SENT 연동 단언 추가 | 다음 슬라이스 |

---

## 5. 검증 근거 파일 목록

- `services/slip-service/src/test/java/com/samhanair/logis/slip/publish/SlipPublishWarehouseIdIT.java`
- `services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/it/PartnerOrderConvertIT.java` (case6 신규 단언)
- `clients/desktop/playwright/phase-2-6a-order-convert/phase-2-6a-order-convert.spec.ts` (시나리오 11 신규)
- `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java` (`resolveWarehouseId` 신규)
- `services/slip-service/src/main/java/com/samhanair/logis/slip/publish/PublishFromPartnerOrderRequest.java` (`warehouseId` 필드 추가)
- `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderConvertService.java` (`warehouseId` payload 추가)
- `clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx` (`WarehouseSelector` 통합)
- `services/slip-service/src/test/java/com/samhanair/logis/slip/publish/Phase26cSlipImmutableIT.java` (회귀)
