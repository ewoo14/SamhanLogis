# 시리얼 인스턴스 출고연동 S3 — 구현 계획

> **For agentic workers:** 본 계획은 Codex 구현 + Claude/Codex dual cross-check 로 실행한다. spec: `docs/superpowers/specs/2026-06-02-serial-instance-s3-outbound-design.md`.

**Goal:** OUTBOUND(판매)전표 accept/complete/reject 생명주기에 serial-managed 라인의 인스턴스 상태전이(reserve→ship→release)를 연동한다.

**Architecture:** 동기 REST(X-Internal-Token) + 멱등(count deficit + advisory lock) + Tx 롤백 보상. batch 라인은 기존 수량 경로 무변경. S2 입고연동 패턴 대칭.

**Tech Stack:** Spring Boot 3.3 / Java 17 / JPA / Flyway / Testcontainers. inventory-service + slip-service.

**대원칙:** BaseEntity 7 audit + Soft Delete + 한국어 Javadoc + 도메인 메서드 chain(직접 set 금지). 모든 IT skipped=0. UUID 사용자 비공개(productCode/슬립번호만 노출).

---

## 파일 구조

### inventory-service
- Modify `domain/StockInstance.java` — `ship()` 가드 확장(AVAILABLE|RESERVED→SHIPPED), `reserve(String outboundSlipNo)` 마커, `release()` 마커 클리어.
- Modify `repository/StockInstanceRepository.java` — warehouse-scoped FIFO + slipNo 대상 조회 + count.
- Modify `service/StockInstanceService.java` — `reserveBatch`/`shipBatch`/`releaseBatch`.
- Create `web/dto/ReserveBatchInstanceRequest.java`, `ShipBatchInstanceRequest.java`, `ReleaseBatchInstanceRequest.java`.
- Modify `web/StockInstanceController.java` — `POST .../reserve-batch|ship-batch|release-batch`.
- Create `db/migration/V17__stock_instances_outbound_slip_index.sql` — `(outbound_slip_no, product_code, status)` 부분 인덱스.
- Test: `service/StockInstanceServiceOutboundTest.java`, `it/StockInstanceOutboundIT.java`.

### slip-service
- Modify `client/InventoryClient.java` — `reserveInstances`/`shipInstances`/`releaseInstances`.
- Modify `service/SlipService.java` — `accept()`/`complete()`/`reject()`/`cancel()` OUTBOUND serial 분기.
- Test: `client/InventoryClientTest.java`(보강), `it/SlipOutboundInstanceIT.java`.

---

## Task 1: StockInstance 도메인 전이 보강

**Files:** Modify `services/inventory-service/.../domain/StockInstance.java`, Test `.../domain/StockInstanceTest.java`(없으면 생성)

- [ ] **Step 1: 실패 테스트** — RESERVED 인스턴스 `ship()` 시 SHIPPED + 출고처 기록 / AVAILABLE 직접 `ship()` 도 여전히 동작 / `reserve(slipNo)` 후 `outboundSlipNo` 세팅 + RESERVED / `release()` 후 AVAILABLE + `outboundSlipNo` null.

```java
@Test void reservedInstanceCanBeShipped() {
    StockInstance i = StockInstance.inbound(pid, "010001", wh, "구매", t, cost, "IN-1");
    i.reserve("2026/06/02-1");
    assertThat(i.getStatus()).isEqualTo(RESERVED);
    assertThat(i.getOutboundSlipNo()).isEqualTo("2026/06/02-1");
    i.ship("CUST-1", "2026/06/02-1", null);
    assertThat(i.getStatus()).isEqualTo(SHIPPED);
    assertThat(i.getOutboundPartnerCode()).isEqualTo("CUST-1");
    assertThat(i.getOutboundAt()).isNotNull();
}
@Test void releaseClearsMarker() { /* reserve→release → AVAILABLE + outboundSlipNo null */ }
@Test void shipFromInvalidStateThrows409() { /* SHIPPED 재ship → BusinessException CONFLICT */ }
```

- [ ] **Step 2: 테스트 실패 확인** — `reserve(String)` 미존재 컴파일 실패.
- [ ] **Step 3: 구현**
  - `reserve(String outboundSlipNo)`: `requireStatus(AVAILABLE,"예약")` → `status=RESERVED; this.outboundSlipNo=outboundSlipNo;` (기존 무인자 `reserve()` 는 제거 또는 `reserve(null)` 위임).
  - `ship(partnerCode, outboundSlipNo, outboundAt)`: 가드를 `if (status != AVAILABLE && status != RESERVED) throw 409` 로 변경. 본문 동일(SHIPPED + 출고처 3필드).
  - `release()`: `requireStatus(RESERVED,"예약 해제")` → `status=AVAILABLE; this.outboundSlipNo=null;`.
  - Javadoc 갱신(RESERVED→SHIPPED 전이 명시).
- [ ] **Step 4: 테스트 통과 확인.**
- [ ] **Step 5: 커밋** `feat(inventory): StockInstance reserve 마커 + RESERVED→SHIPPED 전이 (S3)`

> ⚠️ 기존 `reserve()` 무인자 호출처가 있으면(S1 테스트 등) `reserve(null)` 또는 시그니처 통일로 컴파일 정합. grep `\.reserve\(\)` 확인.

## Task 2: Repository 보강

**Files:** Modify `.../repository/StockInstanceRepository.java`

- [ ] **Step 1~2: 실패 테스트는 Task 3 서비스 테스트로 커버**(repository 파생 메서드는 IT 에서 검증).
- [ ] **Step 3: 메서드 추가**
```java
// warehouse-scoped FIFO 예약 후보
List<StockInstance> findByProductCodeAndWarehouseIdAndStatusOrderByReceivedAtAsc(
        String productCode, UUID warehouseId, StockInstanceStatus status);
// ship/release 대상 (slipNo + productCode + status)
List<StockInstance> findByOutboundSlipNoAndProductCodeAndStatus(
        String outboundSlipNo, String productCode, StockInstanceStatus status);
long countByOutboundSlipNoAndProductCodeAndStatus(
        String outboundSlipNo, String productCode, StockInstanceStatus status);
// 재고부족 사전차단용 (이미 존재: countByProductCodeAndWarehouseIdAndStatus 재사용)
```
- [ ] **Step 4~5: 커밋** `feat(inventory): StockInstance OUTBOUND 조회 메서드 (S3)`

## Task 3: StockInstanceService 출고 배치

**Files:** Modify `.../service/StockInstanceService.java`, Test `.../service/StockInstanceServiceOutboundTest.java`

- [ ] **Step 1: 실패 테스트(단위, mock repo/productClient)**
  - `reserveBatch` serial-managed=false → 409.
  - `reserveBatch` AVAILABLE 수 < quantity → 409(재고부족 사전차단), 아무것도 예약 안 함.
  - `reserveBatch` FIFO N개(received_at ASC) reserve + outboundSlipNo 세팅 / 멱등(이미 RESERVED deficit 만).
  - `shipBatch` RESERVED → SHIPPED + partnerCode/outboundAt / 멱등(이미 SHIPPED skip).
  - `releaseBatch` RESERVED → AVAILABLE / 멱등.
- [ ] **Step 3: 구현**
```java
@Transactional
public List<StockInstance> reserveBatch(String productCode, UUID warehouseId, int quantity,
                                        String outboundSlipNo) {
    lockOutboundKey(outboundSlipNo, productCode);
    long already = repo.countByOutboundSlipNoAndProductCodeAndStatus(outboundSlipNo, productCode, RESERVED);
    if (already >= quantity) {
        return repo.findByOutboundSlipNoAndProductCodeAndStatus(outboundSlipNo, productCode, RESERVED);
    }
    int deficit = quantity - Math.toIntExact(already);
    long available = repo.countByProductCodeAndWarehouseIdAndStatus(productCode, warehouseId, AVAILABLE);
    if (available < deficit) {
        throw new BusinessException(ErrorCode.CONFLICT,
            "재고 부족 — 가용 인스턴스 " + available + " < 필요 " + deficit
            + " (productCode=" + productCode + ", warehouse=" + warehouseId + ")");
    }
    List<StockInstance> candidates =
        repo.findByProductCodeAndWarehouseIdAndStatusOrderByReceivedAtAsc(productCode, warehouseId, AVAILABLE);
    List<StockInstance> reserved = new ArrayList<>(deficit);
    for (int i = 0; i < deficit; i++) {
        StockInstance ins = candidates.get(i);
        ins.reserve(outboundSlipNo);
        reserved.add(ins);
    }
    // 기존 예약 + 신규
    List<StockInstance> result = new ArrayList<>(
        repo.findByOutboundSlipNoAndProductCodeAndStatus(outboundSlipNo, productCode, RESERVED));
    return result; // (dirty checking 으로 flush)
}

@Transactional
public List<StockInstance> shipBatch(String outboundSlipNo, String productCode,
                                     String partnerCode, LocalDateTime outboundAt) {
    List<StockInstance> reserved =
        repo.findByOutboundSlipNoAndProductCodeAndStatus(outboundSlipNo, productCode, RESERVED);
    for (StockInstance ins : reserved) {
        ins.ship(partnerCode, outboundSlipNo, outboundAt);
    }
    return repo.findByOutboundSlipNoAndProductCodeAndStatus(outboundSlipNo, productCode, SHIPPED);
}

@Transactional
public List<StockInstance> releaseBatch(String outboundSlipNo, String productCode) {
    List<StockInstance> reserved =
        repo.findByOutboundSlipNoAndProductCodeAndStatus(outboundSlipNo, productCode, RESERVED);
    for (StockInstance ins : reserved) { ins.release(); }
    return reserved;
}
```
  - `lockOutboundKey` = `lockInboundBatchKey` 와 동일 advisory lock 패턴(키 `outboundSlipNo|productCode`). 기존 메서드 일반화 재사용.
- [ ] **Step 4~5: 커밋** `feat(inventory): 인스턴스 출고 reserve/ship/release 배치 서비스 (S3)`

## Task 4: 컨트롤러 + DTO

**Files:** Create 3 Request DTO, Modify `web/StockInstanceController.java`

- [ ] **Step 1~3:** S2 `BatchInboundInstanceRequest`/`inboundBatch` 패턴 복제.
  - `ReserveBatchInstanceRequest(productCode, warehouseId, quantity, outboundSlipNo)` (+ @NotNull/@Positive validation).
  - `ShipBatchInstanceRequest(outboundSlipNo, productCode, partnerCode, outboundAt?)`.
  - `ReleaseBatchInstanceRequest(outboundSlipNo, productCode)`.
  - 컨트롤러: `POST /inventory/instances/reserve-batch`(200, `inventory.stock-balance UPDATE`), `.../ship-batch`(200, UPDATE), `.../release-batch`(200, UPDATE). 응답 `List<StockInstanceResponse>`.
- [ ] **Step 4~5: 커밋** `feat(inventory): 인스턴스 출고 배치 API 3종 (S3)`

## Task 5: Flyway V17 인덱스

**Files:** Create `db/migration/V17__stock_instances_outbound_slip_index.sql`

- [ ] **Step 3:**
```sql
-- S3 출고연동: outbound_slip_no 기준 ship/release 대상 조회 인덱스
CREATE INDEX IF NOT EXISTS ix_stock_instances_outbound_slip
    ON stock_instances (outbound_slip_no, product_code, status)
    WHERE outbound_slip_no IS NOT NULL;
```
- [ ] **Step 5: 커밋** `feat(inventory): V17 outbound_slip 인덱스 (S3)`

## Task 6: slip InventoryClient 보강

**Files:** Modify `services/slip-service/.../client/InventoryClient.java`, Test `.../client/InventoryClientTest.java`

- [ ] **Step 1: 실패 테스트** — 3 메서드가 올바른 경로/바디/헤더(X-Internal-Token + X-User-Role:MASTER)로 호출(`inboundInstances` 테스트 패턴 복제).
- [ ] **Step 3: 구현** — `inboundInstances` 패턴 복제:
  - `reserveInstances(String productCode, UUID warehouseId, int qty, String outboundSlipNo)` → `POST /inventory/instances/reserve-batch`.
  - `shipInstances(String outboundSlipNo, String productCode, String partnerCode, LocalDateTime outboundAt)` → `.../ship-batch`.
  - `releaseInstances(String outboundSlipNo, String productCode)` → `.../release-batch`.
  - 실패 시 기존 패턴대로 `BusinessException(INTERNAL_ERROR)` 또는 4xx 전파(reserve 409 재고부족은 그대로 전파해 accept 실패).
- [ ] **Step 4~5: 커밋** `feat(slip): InventoryClient 인스턴스 출고 연동 메서드 (S3)`

## Task 7: SlipService OUTBOUND serial 분기

**Files:** Modify `services/slip-service/.../service/SlipService.java`

- [ ] **Step 3: 구현** — accept/complete/reject/cancel OUTBOUND 루프에 라인별 serial 분기 추가. S2 `complete()` INBOUND 분기 패턴 참고(`productClient.requireExists` → `serialManaged` → 동일 productCode 합산 1회 호출, productsById 캐시).
  - `accept()`: serial → `inventoryClient.reserveInstances(productCode, sourceWarehouseId, qtySum, slip.getSlipNo())` / batch → 기존 `reserve(...)`.
  - `complete()`: serial → `inventoryClient.shipInstances(slip.getSlipNo(), productCode, resolvePartnerCode(slip), null)` / batch → 기존 `deduct(...)`.
  - `reject()`/`cancel()` (previous==ACCEPTED): serial → `inventoryClient.releaseInstances(slip.getSlipNo(), productCode)` / batch → 기존 `release(...)`.
  - `resolvePartnerCode(slip)`: Slip 의 거래처 코드 필드 확인(grep `partnerCode`/`businessNumber`/`customerCode`). 없으면 destination 매핑. **구현 시 실제 필드로 확정**(없으면 S3 에서 outbound_partner_code 는 null 허용하되 가능한 식별자 우선).
  - serial productCode 는 `ProductSummary.productCode()` 사용(S2 확립).
- [ ] **Step 4: 검증** — slip-service 컴파일 + 단위테스트.
- [ ] **Step 5: 커밋** `feat(slip): OUTBOUND accept/complete/reject serial 인스턴스 분기 (S3)`

## Task 8: 통합 테스트 (실 Testcontainers Postgres, skipped=0)

**Files:** Create `inventory .../it/StockInstanceOutboundIT.java`, `slip .../it/SlipOutboundInstanceIT.java`

- [ ] **inventory IT:** reserve FIFO(received_at ASC 3개 중 오래된 2개 RESERVED) + 재고부족 409(가용<요청, 0 예약) + 멱등 재호출(추가 0) + ship(RESERVED→SHIPPED + outbound_partner_code/slip_no/at) + release(RESERVED→AVAILABLE + 마커 null) + batch 품목 reserve-batch 409.
- [ ] **slip IT:** OUTBOUND 전표 serial 라인 accept→reserve(RESERVED N) / complete→ship(SHIPPED + 출고처) / reject(ACCEPTED 후)→release(AVAILABLE 복원) / 혼합 전표(serial+batch 라인) 라인별 분기 / inventory 호출 실패 시 Tx 롤백. `@MockBean` 외부 client 격리 + 6월 date-bomb 회피(상대 날짜).
- [ ] **커밋** `test(S3): 출고연동 IT (inventory + slip, 실 Postgres)`

## 배포 순서
inventory(V17 + 배치 API) → slip-service(생명주기 분기). product-service 무변경(S1 serialManaged 노출).

## 자기검토 체크
- spec §3~5 전 항목 task 매핑 확인(도메인/repo/service/api/client/slip wiring/IT).
- `reserve(String)` 시그니처 변경 → 기존 `reserve()` 호출처 정합(Task 1 grep).
- productCode FIFO + warehouse 스코프 일관(Task 2/3).
- partnerCode 출처 미확정 → Task 7 구현 시 실 필드 확정(중대하지 않음, null 허용).
