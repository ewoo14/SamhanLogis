# QA 리뷰 — slice-inv-s1-serial-instance (사이클 1)

> 리뷰어: Claude QA Agent | 날짜: 2026-05-31 | 브랜치: feat/inv-s1-serial-instance
> 대상: StockInstanceIT + seeder + product-service serialManaged 노출 | spec: §4 S1

---

## 요약

| 항목 | 결과 |
|---|---|
| 커버된 케이스 수 | TC-1~6 + TC-5b (7개) |
| 발견 결함 | 9건 (CRITICAL 2 / MAJOR 4 / MINOR 3) |
| skipped=0 위험 | 있음 (Docker 없는 환경 TC-5/5b false-pass 위험, 상세 #4) |
| false-green 위험 | 있음 (TC-3 FIFO 정확값 미단언, TC-2 body 미검증, 상세 #1 #2) |
| 판정 | CHANGES_REQUESTED |

---

## 1. CRITICAL — TC-3 FIFO 순서 단언이 정확 값을 검증하지 않음 (false-green 위험)

**위치:** `StockInstanceIT` TC-3 (lines 195~203)

**현상:** FIFO 조회 단언이 인접 원소 쌍의 부등호(`isBeforeOrEqualTo`) 만 확인한다.

```java
assertThat(fifo.get(0).getReceivedAt())
        .isBeforeOrEqualTo(fifo.get(1).getReceivedAt());
assertThat(fifo.get(1).getReceivedAt())
        .isBeforeOrEqualTo(fifo.get(2).getReceivedAt());
```

**문제:** `isBeforeOrEqualTo` 는 두 값이 같을 때도 통과한다. 더 중요하게, FIFO 쿼리가 정렬을 전혀 안 해도 **우연히 삽입 순서가 ASC라면** 통과한다. 특정 `receivedAt` 기대값을 단언하지 않으므로 FIFO 인덱스(`ix_stock_instances_fifo`) 가 빠지거나 정렬 방향이 바뀌어도 탐지 불가한 경우가 존재한다.

**보완 방법:** `fifo.get(0).getReceivedAt()` 이 `early(2026-01-01)`과 정확히 동일한지 `isEqualTo(early)` 단언 추가, 마지막 원소가 `late(2026-03-01)` 임을 단언.

---

## 2. CRITICAL — TC-2 batch 품목 409 응답 body 미검증 (false-green 위험)

**위치:** `StockInstanceIT` TC-2 (lines 147~157)

**현상:**
```java
mockMvc.perform(post("/inventory/instances") ...)
        .andExpect(status().isConflict());
```

HTTP 상태코드 409만 확인하고, 응답 body의 오류 코드/메시지를 검증하지 않는다.

**문제:**
1. `StockInstanceService.create()` 는 `BusinessException(ErrorCode.CONFLICT, ...)` 을 던진다. `GlobalExceptionHandler` 에 `ResponseStatusException` 핸들러가 없으므로, 만약 서비스가 `BusinessException` 대신 다른 예외를 던져도 `@ExceptionHandler(Exception.class)` 가 500을 반환할 수 있다. 현재 구현은 정상이지만 body 단언이 없으면 리그레션 탐지 불가.
2. 더불어 계획 문서(plan Task 10)의 서비스 skeleton 코드는 `ResponseStatusException(HttpStatus.CONFLICT, ...)` 를 사용하지만, 실제 구현은 `BusinessException(ErrorCode.CONFLICT, ...)` 을 사용한다. `GlobalExceptionHandler` 가 `ResponseStatusException` 을 처리하지 않으므로, 만약 향후 서비스 코드가 plan 초안대로 바뀌면 `@ExceptionHandler(Exception.class)` (500)에 잡혀 409가 아닌 500이 반환될 수 있다. 테스트가 이를 탐지하지 못한다.

**보완 방법:**
- `andExpect(jsonPath("$.errorCode").exists())` 또는 `andExpect(jsonPath("$.message").value(containsString("batch")))` 추가.
- `GlobalExceptionHandler` 에 `ResponseStatusException` 핸들러 추가 또는 서비스 예외 타입 일관화.

---

## 3. MAJOR — recall()/release() 상태전이 도메인 테스트 누락

**위치:** `StockInstanceIT` TC-5/5b 에서 `recall()`, `release()` 전이 미검증

**현상:** 스펙 §1 업무 규칙상 `SHIPPED → recall() → RECALLED`, `RESERVED → release() → AVAILABLE` 전이가 명세됐고 도메인에 구현돼 있으나, IT에서 이 두 전이를 검증하는 테스트 케이스가 없다.

**누락 케이스:**
- `recall()`: SHIPPED → RECALLED 전이 확인 + AVAILABLE 상태에서 `recall()` 시도 시 409 확인
- `release()`: RESERVED → AVAILABLE 전이 확인 + SHIPPED 상태에서 `release()` 시도 시 409 확인

---

## 4. MAJOR — Docker 없는 환경에서 TC-5/5b false-pass 위험

**위치:** `StockInstanceIT` TC-5 `stateGuard_ship_fromReserved_throws409()`, TC-5b

**현상:** TC-5/5b 는 순수 도메인 메서드 테스트이지만 `warehouseId` 픽스처를 `setUp()` 에서 `warehouseRepository.findAll...` 로 조회하므로 실 DB 의존이 있다. Docker가 없으면 `warehouseId = null` 이 된다.

```java
StockInstance instance = StockInstance.inbound(
        serialProductId, serialProductCode, warehouseId, // warehouseId = null
        "구매", LocalDateTime.now(), BigDecimal.valueOf(500000), null);
```

`StockInstance.inbound()` 내부 생성자에 `warehouseId == null` 체크가 있어 `IllegalArgumentException` 이 발생한다. `assertThrows(ResponseStatusException.class, ...)` 가 `IllegalArgumentException` 을 잡지 못해 **TC-5/5b 가 FAIL(not SKIP)** 된다.

`AbstractPostgresIT.DockerAvailableCondition` 이 클래스 전체를 skip하므로 실제로는 skip 처리되지만, skip 판정이 실행 전에 이뤄지는지 확인 필요. 또한 순수 도메인 단위 테스트는 DB 픽스처 의존을 제거하고 하드코딩 UUID를 사용해야 한다.

**보완 방법:** TC-5/5b 에서 `warehouseId = UUID.randomUUID()` 하드코딩 사용 (순수 도메인 테스트이므로 DB 픽스처 불필요).

---

## 5. MAJOR — product-service /products/internal/lookup 응답의 serialManaged 키 검증 테스트 없음

**위치:** `services/product-service/src/test/` — 미변경 (신규 테스트 없음)

**현상:** `ProductSummaryResponse` 에 `serialManaged` 필드가 추가됐고 `ProductSummaryResponse.from(Product p)` 에서 `p.getCategory().isSerialManaged()` 를 읽어 매핑하지만, 이를 검증하는 테스트가 없다.

구체적으로:
- `ProductInternalControllerTest` — `serialManaged` 응답 키 검증 없음 (기존 backward-compat 생성자로 mock 데이터 생성해 `serialManaged=false` 고정)
- `CategoryRepositoryIT` — `serial_managed` DB 컬럼 조회 및 `isSerialManaged()` 도메인 메서드 검증 없음
- V9 마이그레이션 후 에어컨 카테고리 행의 `serial_managed=TRUE` 검증 IT 없음

**inventory-service 영향:** inventory `ProductClient` 가 `serialManaged` 를 읽어 인스턴스 생성 여부를 판정하므로, product-service 응답 JSON에 `serialManaged` 키가 실제로 포함되는지 end-to-end 검증이 없다. `@MockBean` 으로만 검증하므로 실제 product-service 직렬화 버그를 탐지 불가.

**보완 방법:** `ProductInternalControllerTest` 또는 `ProductCatalogControllerIT` 에 에어컨 카테고리 품목 lookup 후 `serialManaged: true` JSON 키 단언 추가.

---

## 6. MAJOR — HvacProductSeeder/CategorySeeder에서 serial_managed 런타임 초기화 코드 없음

**위치:** `services/product-service/src/main/java/.../seed/HvacProductSeeder.java`

**현상:** V9 마이그레이션 SQL (`V9__add_category_serial_managed.sql`) 은 `categories` 테이블에 `UPDATE ... SET serial_managed = TRUE WHERE code IN ('HVAC', 'INDOOR', 'OUTDOOR', 'INDOOR_WALL', 'INDOOR_CEILING')` 를 실행한다. 그러나 `HvacProductSeeder` Java 코드에는 `markSerialManaged(true)` 호출이 전혀 없다.

**위험:**
1. Flyway 마이그레이션 없이 seeder만 재실행하는 경우(또는 테스트 컨텍스트 내 H2 in-memory) `serial_managed` 가 `false` 로 남는다.
2. IT 환경에서 Flyway가 실행되면 V9 SQL UPDATE로 `serial_managed=TRUE` 가 적용되지만, IT seeder가 `category.markSerialManaged(true)` 없이 카테고리를 생성하면 INSERT 후 UPDATE 실행 전까지 일시적으로 `false` 상태가 된다.
3. `StockInstanceSeeder` 가 dev 프로파일에서 실행될 때 ProductClient @MockBean을 사용하지 않으므로, 실제 product-service가 `serialManaged=true`를 반환해야 한다.

**보완 방법:** `HvacProductSeeder` 에서 에어컨 카테고리에 `category.markSerialManaged(true)` 호출 추가 (또는 V9 SQL과 중복이므로 IT 맥락에서 Flyway 실행 순서 보장 확인).

---

## 7. MINOR — TC-1 MvcResult 미사용 변수

**위치:** `StockInstanceIT` TC-1 (line 128)

```java
MvcResult result = mockMvc.perform(...).andExpect(...).andReturn();
```

`result` 변수를 이후에 사용하지 않음. 컴파일 경고 발생. 제거 또는 실제 응답 body 파싱에 활용 권장.

---

## 8. MINOR — TC-3 hasSizeGreaterThanOrEqualTo 대신 정확한 크기 단언 권장

**위치:** `StockInstanceIT` TC-3 (lines 196~200)

```java
assertThat(fifo).hasSizeGreaterThanOrEqualTo(3);
```

`@Transactional` 롤백으로 테스트 간 격리가 보장되므로 이론상 정확히 3개여야 한다. `hasSize(3)` 단언이 더 명확하고, 의도치 않은 데이터 잔류를 탐지할 수 있다. TC-4 도 동일 (`hasSizeGreaterThanOrEqualTo(3)` → `hasSize(3)`).

---

## 9. MINOR — StockInstanceSeeder PRODUCT_CODES와 StockBalanceSeeder 참조 표기 불일치

**위치:** `StockInstanceSeeder` Javadoc (line 50 내외)

```java
/** StockBalance 결정성 UUID namespace prefix. {warehouseCode}:{modelName} 가변. */
```

Javadoc에서 "StockBalanceSeeder#PRODUCT_MODEL_NAMES" 를 단순 참조하지만, `StockBalanceSeeder` 는 `product_code` 파라미터에 실제로 **modelName** (`"AR05TXEAAWKNEU-01"` 형식)을 전달하는 반면 `StockInstanceSeeder` 는 HvacProductSeeder의 `productCode` 형식 (`"010001"`) 을 사용한다. 두 seeder의 `productCode` 개념이 달라 혼동을 초래한다. Javadoc에 두 seeder의 productCode 기준이 다름을 명기 권장. (기능적 오류는 아님 — `stock_balances` 테이블에는 product_code 컬럼이 없어 실제 저장은 productId로 이루어짐.)

---

## 누락 케이스 체크리스트

| 케이스 | 커버 여부 | 비고 |
|---|---|---|
| 인스턴스 생성(serial) — 201 + AVAILABLE | TC-1 | 커버됨 |
| batch 품목 409 | TC-2 | HTTP 상태만, body 미단언 (#2) |
| FIFO received_at ASC 순서 | TC-3 | 방향만, 정확 값 미단언 (#1) |
| 역-FIFO SHIPPED outbound_at DESC 순서 | TC-4 | 방향만, 정확 값 미단언 (TC-4도 동일) |
| AVAILABLE 아닌 상태에서 ship → 409 | TC-5 | 도메인 단위, warehouseId null 위험 (#4) |
| SHIPPED 상태에서 reserve → 409 | TC-5b | 동일 위험 (#4) |
| SHIPPED → recall() → RECALLED | **미커버** | #3 |
| RECALLED 상태에서 전이 시도 → 409 | **미커버** | #3 |
| RESERVED → release() → AVAILABLE | **미커버** | #3 |
| soft-delete @SQLRestriction 필터 | TC-6 | 커버됨 (flush 포함, 양호) |
| product-service serialManaged=true 응답 JSON 키 | **미커버** | #5 |
| V9 에어컨 카테고리 serial_managed=TRUE DB 검증 | **미커버** | #5 |
| seeder 2회 재실행 멱등 row count 동일 | 코드 검토 OK (insertIfAbsent) | IT 단언은 없음 |
| warehouseId 존재하지 않는 UUID로 생성 시도 | **미커버** | spec 범위 외이지만 FK 없는 MSA 모델 주의 |

---

## Docker 실 QA 재현 절차 (누락 — 권장 추가)

spec/plan 에 Docker 실 QA 절차가 명시되지 않았다. 아래 절차를 QA docs에 추가 권장:

```sql
-- 1. IT 실행 후 inventory_db 컨테이너 접속
-- (Testcontainers 실행 중 컨테이너 포트 확인: docker ps | grep postgres)

-- 2. FIFO 순서 확인
SELECT id, product_code, status, received_at
FROM stock_instances
WHERE product_code = 'TEST-SERIAL-001'
  AND status = 'AVAILABLE'
  AND is_deleted = FALSE
ORDER BY received_at ASC;
-- 기대: early(2026-01-01) → middle(2026-02-01) → late(2026-03-01) 순

-- 3. 역-FIFO 순서 확인
SELECT id, product_code, status, outbound_at, outbound_partner_code
FROM stock_instances
WHERE product_code = 'TEST-SERIAL-001'
  AND status = 'SHIPPED'
  AND outbound_partner_code = 'TEST-PARTNER-001'
  AND is_deleted = FALSE
ORDER BY outbound_at DESC;
-- 기대: out3(2026-03-15) → out2(2026-02-15) → out1(2026-01-15) 순

-- 4. is_deleted=TRUE 인 인스턴스가 FIFO 조회에 포함 안 되는지
SELECT COUNT(*) FROM stock_instances WHERE is_deleted = TRUE;
-- TC-6 실행 후 1건 이상이어야 하지만 @Transactional rollback으로 0건 정상

-- 5. stock_instances row count (seeder 재실행 멱등)
SELECT COUNT(*) FROM stock_instances;
-- 재실행 전후 동일 값이어야 함
```

---

## 총평

전체 S1 핵심 도메인(생성/FIFO/역-FIFO/상태전이/soft-delete)이 테스트 케이스로 커버됐고, `@MockBean` ProductClient 격리, `@Transactional` 롤백, `AbstractPostgresIT` 싱글턴 컨테이너 패턴이 올바르게 적용됐다. `StockInstance` 도메인 불변식(생성자 null 체크, 상태전이 가드 409, `@SQLRestriction`)과 `StockInstanceSeeder` 멱등 설계는 양호하다.

그러나 CRITICAL 2건(FIFO 정확 값 미단언, TC-2 body 미단언)과 product-service `serialManaged` end-to-end 검증 공백이 핵심 기능의 실제 보호 강도를 낮춘다. 특히 FIFO 단언 약함은 인덱스 방향 버그를 탐지 못할 수 있어 즉시 보강 필요.

**판정: CHANGES_REQUESTED**

필수 수정:
1. TC-3 FIFO / TC-4 역-FIFO 정확 값(`isEqualTo`) 단언 추가 (CRITICAL #1)
2. TC-2 409 응답 body 단언 추가 + `GlobalExceptionHandler` ResponseStatusException 핸들러 확인 (CRITICAL #2)
3. TC-5/5b `warehouseId` 하드코딩 UUID로 교체 (MAJOR #4)
4. product-service `ProductInternalControllerIT` 에 `serialManaged=true` JSON 키 단언 추가 (MAJOR #5)
5. `recall()` / `release()` 전이 테스트 케이스 추가 (MAJOR #3)
