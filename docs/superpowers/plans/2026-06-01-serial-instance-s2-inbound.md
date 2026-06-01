# 시리얼 인스턴스 S2 입고 연동 Implementation Plan

> **For agentic workers:** 본 plan 은 **Codex 가 구현**한다([[feedback_codex_implements_claude_reviews]]). Claude 는 기획·리뷰. 프로젝트 프로세스가 superpowers subagent/inline 실행 옵션보다 우선. 각 Task TDD(실패 테스트→구현→통과→커밋). 체크박스로 진행 추적.

**Goal:** 구매/차용 INBOUND 전표 처리완료 시 serial_managed 품목은 stock_instances N개를, batch 품목은 기존 stock_lots 를 생성하도록 `SlipService.complete()` 를 분기한다.

**Architecture:** 새 인프라/이벤트 없음. inventory 에 멱등 배치 인스턴스 생성 엔드포인트(`POST /inventory/instances/batch`)를 신설하고, slip-service `complete()` INBOUND 루프가 라인별 `serial_managed` 로 분기해 동기 REST 호출(2.6c reserve 패턴 미러). 멱등 = (inbound_slip_no, product_id) count 기반 deficit.

**Tech Stack:** Spring Boot 3 / Java 17, Gradle multi-project, Flyway(inventory V16), PostgreSQL service-per-DB, Testcontainers IT, RestClient + Eureka lb://.

**Spec:** `docs/superpowers/specs/2026-06-01-serial-instance-s2-inbound-design.md` (D-SER-05~08)

---

## File Structure

**inventory-service** (입고 인스턴스 생성 주체):
- `db/migration/V16__stock_instances_inbound_slip_index.sql` — (inbound_slip_no, product_id) 비-unique 인덱스
- `service/StockInstanceService.java:60+` — `inboundBatch(...)` 추가 (count 기반 deficit)
- `web/StockInstanceController.java` — `POST /inventory/instances/batch`
- `web/dto/BatchInboundInstanceRequest.java` — 신규 요청 DTO
- `web/it/StockInstanceBatchInboundIT.java` — 신규 IT

**product-service** (serial_managed 전파):
- 내부 lookup(`/products/internal/lookup`) 응답에 `serialManaged` 포함 확인/보강

**slip-service** (분기 orchestration):
- `client/ProductClient.java` + `ProductSummary` — `serialManaged` 필드 매핑
- `client/InventoryClient.java:115+` — `inboundInstances(...)` 추가 (기존 `inbound()` 옆)
- `service/SlipService.java:653-658` — INBOUND 루프 serial_managed 분기 + inboundType 파생
- `service/it/SlipInboundInstanceIT.java` — 신규 IT (분기/혼합/inboundType/실패롤백)

**docs:** DECISIONS D-SER-05~08, dev-report, overview.html(필요시), 각 서비스 README.

---

## Task 1: inventory V16 인덱스 마이그레이션

**Files:**
- Create: `services/inventory-service/src/main/resources/db/migration/V16__stock_instances_inbound_slip_index.sql`

- [ ] **Step 1: 마이그레이션 작성**

```sql
-- V16: S2 입고연동 — 멱등(count 기반 deficit) 조회 효율용 인덱스.
-- (inbound_slip_no, product_id) 로 "이 전표가 이 품목으로 생성한 인스턴스 수" 를 센다. UNIQUE 아님
-- (UUID 인스턴스는 단위별 비즈니스 키가 없어 N행 중복을 제약으로 막지 않고 count 로 수렴).
CREATE INDEX IF NOT EXISTS idx_stock_instances_inbound_slip_product
    ON stock_instances (inbound_slip_no, product_id)
    WHERE is_deleted = FALSE;
```

- [ ] **Step 2: 컴파일/Flyway 검증** — `./gradlew :services:inventory-service:compileJava` BUILD SUCCESSFUL. 마이그레이션 명명규약(V16, 직전 V15) 확인.

- [ ] **Step 3: Commit** — `feat(inventory): S2 V16 인스턴스 입고 멱등 인덱스`

---

## Task 2: inventory `inboundBatch` 서비스 메서드 (count 기반 deficit, 멱등)

**Files:**
- Modify: `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockInstanceService.java`
- Modify: `repository/StockInstanceRepository.java` — count 쿼리 추가
- Test: `service/StockInstanceServiceBatchTest.java` (또는 IT 로 통합, Task 3)

- [ ] **Step 1: 실패 테스트** — `inboundBatch(product, code, warehouse, qty=3, inboundType="구매", slipNo, unitCost, receivedAt)` 호출 시 ① serial_managed=false 품목 → BusinessException(CONFLICT 409) ② serial=true → 3개 AVAILABLE 인스턴스 생성 ③ **동일 인자 재호출 → 추가 생성 0(count=3 유지), 기존 3개 반환** ④ count=1 상태에서 qty=3 재호출 → 2개만 추가(총 3).

- [ ] **Step 2: Repository count 쿼리**

```java
@Query("SELECT COUNT(s) FROM StockInstance s WHERE s.inboundSlipNo = :slipNo AND s.productId = :productId AND s.isDeleted = false")
long countByInboundSlipAndProduct(@Param("slipNo") String slipNo, @Param("productId") UUID productId);
```

- [ ] **Step 3: `inboundBatch` 구현** — serial_managed 가드(기존 `create()` 의 판정 재사용: product serialManaged=false 면 409). `existing = countByInboundSlipAndProduct(slipNo, productId)`; `deficit = max(0, qty - existing)`; deficit 개 `StockInstance.inbound(...)`(S1 팩토리, status=AVAILABLE) 생성·save; `(기존+신규)` 또는 신규 리스트 반환. 단일 @Transactional.

- [ ] **Step 4: 테스트 통과** — `./gradlew :services:inventory-service:test --tests "*StockInstanceServiceBatch*"` PASS.

- [ ] **Step 5: Commit** — `feat(inventory): 인스턴스 배치 입고(inboundBatch) count 기반 멱등`

---

## Task 3: inventory `POST /inventory/instances/batch` 엔드포인트 + IT

**Files:**
- Create: `web/dto/BatchInboundInstanceRequest.java` — `{UUID productId, String productCode, UUID warehouseId, int quantity, String inboundType, String inboundSlipNo, BigDecimal unitCost, LocalDateTime receivedAt}` (+@Valid 제약: quantity≥1, productId/warehouseId NotNull)
- Modify: `web/StockInstanceController.java`
- Create: `web/it/StockInstanceBatchInboundIT.java` (Testcontainers, AbstractPostgresIT 상속)

- [ ] **Step 1: 실패 IT** — `POST /inventory/instances/batch` ① serial 품목 qty=3 → 201 + 3개 응답, psql `stock_instances` 3행 AVAILABLE + inbound_type="구매" ② 동일 body 재요청 → 201 + count 여전히 3(멱등) ③ batch 품목 → 409 ④ 권한: 내부 토큰/X-User-Role MASTER 헤더(기존 단건 IT 패턴 미러).

- [ ] **Step 2: Controller 메서드**

```java
@PostMapping("/batch")
@Operation(summary = "인스턴스 배치 입고", description = "serial-managed 품목 N개 인스턴스 멱등 생성(inbound_slip_no+product 기준). batch 품목 409.")
public ApiResponse<List<StockInstanceResponse>> inboundBatch(@Valid @RequestBody BatchInboundInstanceRequest req) {
    var created = stockInstanceService.inboundBatch(req.productId(), req.productCode(), req.warehouseId(),
            req.quantity(), req.inboundType(), req.inboundSlipNo(), req.unitCost(), req.receivedAt());
    return ApiResponse.ok(created.stream().map(StockInstanceResponse::from).toList());
}
```

- [ ] **Step 3: IT 통과** — `./gradlew :services:inventory-service:test --tests "*StockInstanceBatchInbound*"` PASS (Docker 가용 시). skipped=0.

- [ ] **Step 4: Commit** — `feat(inventory): POST /inventory/instances/batch 멱등 배치 입고 + IT`

---

## Task 4: product 내부 lookup serialManaged 전파 확인/보강

**Files:**
- Verify/Modify: product-service 내부 lookup(`/products/internal/lookup`) 응답 DTO 에 `serialManaged` 포함
- Test: product IT 보강(필요시)

- [ ] **Step 1: 현황 확인** — `/products/internal/lookup` 응답(slip ProductClient 가 소비)에 `serialManaged` 가 포함되는지 확인. S1 이 `ProductSummaryResponse.serialManaged` 를 추가했으나 내부 lookup DTO 가 별개면 누락 가능.

- [ ] **Step 2: 누락 시 보강** — 내부 lookup 응답에 `serialManaged` 필드 추가(boolean, 기본 false). 매핑(Category.serialManaged 파생).

- [ ] **Step 3: IT 보강** — serial 품목 lookup 시 serialManaged=true 반환 검증.

- [ ] **Step 4: Commit** — `feat(product): 내부 lookup 응답 serialManaged 노출 (S2)`

---

## Task 5: slip-service `ProductClient`/`ProductSummary` serialManaged 매핑

**Files:**
- Modify: `services/slip-service/src/main/java/com/samhanair/logis/slip/client/ProductClient.java` (+ 내부 `ProductSummary` record)

- [ ] **Step 1: 실패 테스트** — slip ProductClient `lookup()` 결과 `ProductSummary.serialManaged()` 가 product 응답값을 반영.

- [ ] **Step 2: `ProductSummary` 에 `boolean serialManaged` 추가** — record/DTO 필드 + 역직렬화 매핑(@JsonProperty 필요시). 기본 false(역호환).

- [ ] **Step 3: 테스트 통과** — `./gradlew :services:slip-service:test --tests "*ProductClient*"` PASS.

- [ ] **Step 4: Commit** — `feat(slip): ProductClient serialManaged 매핑 (S2)`

---

## Task 6: slip `InventoryClient.inboundInstances()` + `complete()` 분기

**Files:**
- Modify: `services/slip-service/src/main/java/com/samhanair/logis/slip/client/InventoryClient.java`
- Modify: `services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipService.java:653-658`

- [ ] **Step 1: `InventoryClient.inboundInstances(...)`**

```java
/** S2 — serial_managed 품목 입고: 인스턴스 N개 멱등 생성. */
public void inboundInstances(UUID productId, String productCode, UUID warehouseId, int quantity,
                             String inboundType, String inboundSlipNo, java.math.BigDecimal unitCost) {
    var body = java.util.Map.of(
        "productId", productId, "productCode", productCode, "warehouseId", warehouseId,
        "quantity", quantity, "inboundType", inboundType, "inboundSlipNo", inboundSlipNo,
        "unitCost", unitCost, "receivedAt", java.time.LocalDateTime.now());
    post("/inventory/instances/batch", body);  // 기존 post() 헬퍼 재사용(내부토큰/MASTER 헤더)
}
```

- [ ] **Step 2: `SlipService.complete()` INBOUND 분기 (L653-658 교체)**

```java
} else {
    for (SlipLine line : slip.getLines()) {
        boolean serial = productClient.requireExists(line.getProductId()).serialManaged();
        if (serial) {
            inventoryClient.inboundInstances(line.getProductId(), /*productCode*/ line.getModelName(),
                    slip.getDestinationWarehouseId(), line.getQuantity(),
                    resolveInboundType(slip), slip.getSlipNo(), line.getUnitPrice());
        } else {
            inventoryClient.inbound(line.getProductId(), slip.getDestinationWarehouseId(),
                    line.getQuantity(), slip.getSlipNo(), line.getUnitPrice());
        }
    }
}
```
> `productCode` 소스: SlipLine 의 품목코드 필드(modelName/productCode — 실제 필드명 확인). inventory 인스턴스 product_code 컬럼용.

- [ ] **Step 3: `resolveInboundType(slip)` 헬퍼** — `slip.getDeliveryTag()` 가 BORROW → "차용", RETURN/RETURN_TRIP → BusinessException(CONFLICT, "회수 입고는 S4 범위") 또는 안전 처리, 그 외/null → "구매".

- [ ] **Step 4: 컴파일** — `./gradlew :services:slip-service:compileJava` BUILD SUCCESSFUL.

- [ ] **Step 5: Commit** — `feat(slip): complete() INBOUND serial_managed 분기 + inboundType 파생 (S2)`

---

## Task 7: slip IT — complete() 분기 검증

**Files:**
- Create: `services/slip-service/src/test/java/.../service/it/SlipInboundInstanceIT.java` (또는 기존 IT 확장, @MockBean InventoryClient/ProductClient)

- [ ] **Step 1: IT 작성** — INBOUND 전표 complete() 시: ① serial 라인 → `inventoryClient.inboundInstances` 호출(productId/qty/inboundType captor 검증), inbound() 미호출 ② batch 라인 → `inbound()` 호출, inboundInstances 미호출 ③ 혼합 전표(serial+batch 라인) → 각 1회씩 ④ deliveryTag BORROW → inboundType="차용", null → "구매" ⑤ inventory 호출 실패(예외 stub) → complete 예외 전파(슬립 상태 미커밋/롤백). ProductClient.serialManaged stub.

- [ ] **Step 2: IT 통과** — `./gradlew :services:slip-service:test --tests "*SlipInboundInstance*"` PASS. skipped=0.

- [ ] **Step 3: 전체 회귀** — `./gradlew :services:slip-service:test` (OUTBOUND/기존 batch inbound 회귀 0).

- [ ] **Step 4: Commit** — `test(slip): S2 complete() 분기 IT (serial/batch/혼합/inboundType/롤백)`

---

## Task 8: 문서 동기화

**Files:**
- Modify: `migration/decisions/DECISIONS.md` — D-SER-05~08 (spec §3)
- Create: `docs/dev-reports/slice-inv-s2-inbound.md`
- Modify: `docs/samhan-public-overview.html` — 시리얼 진행 배지/표(필요시)
- Modify: 관련 서비스 README(inventory/slip)

- [ ] **Step 1: DECISIONS D-SER-05~08 추가** — spec §3 표 + 산출 요약.
- [ ] **Step 2: dev-report 작성** — 목표/배경(코드현실 정정)/결정/변경파일/QA/배포.
- [ ] **Step 3: overview.html + README 갱신** ([[feedback_continuous_docs_sync]], [[feedback_samhan_public_overview_sync]]).
- [ ] **Step 4: Commit** — `docs: S2 입고연동 DECISIONS/dev-report/overview/README 동기화`

---

## Docker 실 QA (머지 전 의무 — [[no-fake-data-ever]])

- 실 INBOUND 전표 생성 → complete → psql `stock_instances` N행 status=AVAILABLE + inbound_type 정합, batch 라인은 `stock_lots`, 혼합 전표 1건. 멱등(complete 재시도 시 중복 0). 실 게이트웨이/JWT/3-DB(product/inventory/slip).
- 증빙 `docs/qa/slice-inv-s2-inbound/real-qa-evidence.md`.

---

## Self-Review (작성자 체크)

- **Spec 커버리지**: §3 D-SER-05(Task6)·06(Task6)·07(Task2,3)·08(Task6 resolveInboundType) / §4.1 배치 엔드포인트(Task2,3) / §4.2 slip 연동(Task5,6) / §5 멱등·보상(Task2 count deficit + Task7 롤백 IT) / §6 범위밖(RETURN 가드 Task6 step3) / §7 QA(Docker QA 섹션) / §8 배포(dev-report). 갭 없음.
- **Placeholder**: Task4 step1 "현황 확인" 은 조사 후 분기(보강 or no-op) — 실 작업. Task6 step2 productCode 필드명은 "확인" 명시(SlipLine 실 필드 검증 필요).
- **타입 일관**: `inboundBatch`(Task2) ↔ `inboundInstances`(Task6) ↔ `/inventory/instances/batch`(Task3) 시그니처/경로 일치. `serialManaged()`(Task4,5,6) 일관.
