# BE 코드 리뷰 — slice-inv-s1-serial-instance (사이클 1)

**리뷰어:** Claude BE  
**날짜:** 2026-05-31  
**대상 브랜치:** feat/inv-s1-serial-instance  
**변경 범위:** product-service V9/Category/ProductSummaryResponse + inventory-service V15/StockInstance/StockInstanceStatus/StockInstanceRepository/StockInstanceService/StockInstanceController/ProductSummary/StockInstanceSeeder/StockInstanceIT

---

## 1. P0 결함 (머지 차단)

### P0-1 [StockInstanceService] 예외 타입 불일치 — BusinessException vs ResponseStatusException 혼용
**파일:** `services/inventory-service/.../service/StockInstanceService.java:65`

```java
// 현재 (서비스 레이어)
throw new BusinessException(ErrorCode.CONFLICT,
    "개별시리얼 관리 품목이 아닙니다 (batch 품목은 stock_lots 사용). productId=" + productId);
```

```java
// plan 스펙 (Task 8 Step 1 코드)
throw new ResponseStatusException(HttpStatus.CONFLICT, "...");
```

**문제:** 서비스 레이어에서 `BusinessException(ErrorCode.CONFLICT)`를 던지는 것은 프로젝트 컨벤션에 부합하나, 동일한 409 상황인 도메인 메서드(StockInstance.requireStatus)는 `ResponseStatusException`을 던진다. 두 예외가 동일한 HTTP 409를 생성하더라도 GlobalExceptionHandler가 두 타입을 다르게 처리하면 응답 envelope 형식이 달라질 수 있다.

**현황 분석:** ErrorCode.CONFLICT는 `HttpStatus.CONFLICT`에 매핑된다. 따라서 BusinessException은 GlobalExceptionHandler에서 ApiResponse 래핑 후 409로 반환되고, 도메인의 ResponseStatusException은 Spring MVC 기본 처리 경로를 따른다. 실제로 IT TC-2에서 `status().isConflict()`만 단언하므로 응답 바디 형식 검증이 없어 클라이언트가 두 가지 다른 409 응답 형식을 받을 수 있다.

**요구 조치:** 서비스 레이어와 도메인 레이어의 예외 타입을 통일하거나, IT TC-2에서 `$.error.code` 단언을 추가하여 형식 일관성을 보장해야 한다. GlobalExceptionHandler가 두 예외를 동일 형식으로 처리하는지 명시 확인이 필요하다.

---

### P0-2 [StockInstanceService.byProduct] status=null 시 findAll() 전체 스캔 — 성능/안전 결함
**파일:** `services/inventory-service/.../service/StockInstanceService.java:111`

```java
// status null 시 전체 조회 (soft-delete 필터는 @SQLRestriction 적용)
return repo.findAll().stream()
        .filter(i -> i.getProductId().equals(productId))
        .toList();
```

**문제:**
1. `repo.findAll()`은 stock_instances 테이블 전체를 메모리에 로드한다. 인스턴스 수가 수천 건 이상이 되면 OOM 또는 응답 지연이 발생한다.
2. 컨트롤러(`GET /inventory/instances?productId=&status=`)에서 status가 null일 때 이 경로가 실행된다. S1 단계에서는 데이터 양이 적지만, 운영 환경에서는 치명적이다.
3. Repository에 `findByProductId(UUID productId)`를 추가하고 인덱스 `ix_stock_instances_product`를 활용해야 한다. 해당 인덱스는 V15에 이미 존재한다(`CREATE INDEX ix_stock_instances_product ON stock_instances(product_id)`).

**요구 조치:** `StockInstanceRepository`에 `List<StockInstance> findByProductId(UUID productId)`를 추가하고 서비스에서 호출하도록 변경해야 한다.

---

## 2. P1 결함 (머지 전 수정 권장)

### P1-1 [V15 마이그레이션] version 컬럼 누락 — BaseEntity 7 audit 불완전
**파일:** `services/inventory-service/src/main/resources/db/migration/V15__create_stock_instances.sql`

**문제:** 프로젝트 컨벤션(`project_build_conventions`)에 따라 "모든 entity가 BaseEntity 상속 (id / createdAt / createdBy / modifiedAt / modifiedBy / deletedAt / deletedBy / isDeleted + **version**)"이다. V15에 `version` 컬럼이 없다.

```sql
-- 현재 V15 (누락)
id, product_id, product_code, ...,
created_at, created_by, modified_at, modified_by,
deleted_at, deleted_by, is_deleted
-- version 컬럼 없음
```

BaseEntity를 확인해야 하나, 프로젝트 컨벤션 메모리에 "version" 이 BaseEntity 필드로 명시되어 있다. Hibernate가 `@Version` 필드를 기대하면 마이그레이션 완료 후 `spring.jpa.hibernate.ddl-auto=validate` 단계에서 스키마 불일치로 실패할 수 있다.

**요구 조치:** BaseEntity의 `version` 필드 여부를 확인하고, 있으면 V15에 `version BIGINT NOT NULL DEFAULT 0` 추가 필요.

---

### P1-2 [CreateInstanceRequest] productCode @NotBlank 누락
**파일:** `services/inventory-service/.../web/dto/CreateInstanceRequest.java:19`

```java
@NotNull(message = "productCode 는 필수입니다")
String productCode,
```

**문제:** `@NotNull`만 있고 `@NotBlank`가 없다. `productCode = ""`(빈 문자열)이나 `productCode = "   "`(공백 문자열)이 유효성 검사를 통과한다. 이후 StockInstance 내부 생성자에서 `productCode.isBlank()` 체크가 있어 런타임 IAE가 발생하지만, 이는 400이 아닌 500으로 반환될 가능성이 있다 (IAE는 GlobalExceptionHandler가 처리하지 않으면 500).

**요구 조치:** `@NotBlank(message = "productCode 는 필수이며 공백만으로 구성될 수 없습니다")`로 변경.

---

### P1-3 [StockInstanceSeeder] @Order(11) 충돌 위험 — StockBalanceSeeder @Order(10) 의존 명시 미흡
**파일:** `services/inventory-service/.../seed/StockInstanceSeeder.java:44`

**문제:** StockInstanceSeeder가 product-service의 결정적 UUID를 참조하는데, inventory-service 내에서 StockBalanceSeeder(@Order(10))와의 실행 순서가 @Order(11)로 보장된다. 그러나 Seeder Javadoc 및 코드에서 "StockBalanceSeeder 완료 후 실행 필수"라는 의존 관계가 명시되어 있지 않다. 또한 seeder가 product-service 카탈로그와의 UUID 정합을 주석으로만 의존하므로 `project_seed_product_uuid_catalog` 메모리의 단일 소스 원칙이 코드 수준에서 강제되지 않는다.

**요구 조치:** Javadoc에 "StockBalanceSeeder(@Order(10)) 완료 후 실행. product-service HvacProductSeeder UUID 카탈로그와 동일 namespace 사용" 명시 보강.

---

### P1-4 [IT TC-1] warehouseId == null 시 조기 return — 검증 누락 위험
**파일:** `services/inventory-service/.../it/StockInstanceIT.java:123`

```java
@Test
void createInstance_serialManaged_success() throws Exception {
    if (warehouseId == null) return;  // 창고 없으면 테스트 skip
    ...
```

**문제:** `warehouseId == null`이면 테스트를 통과(success)로 처리한다. 이는 "창고 시드 실패 시 핵심 TC-1이 silently pass"되는 문제다. `assumeTrue(warehouseId != null, "창고 시드 없음 — 테스트 skip")`으로 변경해야 JUnit이 `ABORTED`(skip)로 처리하며, CI에서 의도치 않은 silent pass를 방지할 수 있다.

**요구 조치:** `if (warehouseId == null) return;`을 `assumeTrue(warehouseId != null, "...")` 패턴으로 전환 (TC-3, TC-4, TC-6 동일 적용 필요).

---

### P1-5 [V9 마이그레이션] 판넬 카테고리 serial_managed=true 미설정
**파일:** `services/product-service/src/main/resources/db/migration/V9__add_category_serial_managed.sql`

```sql
UPDATE categories
   SET serial_managed = TRUE
 WHERE code IN ('HVAC', 'INDOOR', 'OUTDOOR', 'INDOOR_WALL', 'INDOOR_CEILING')
   AND is_deleted = FALSE;
```

**문제:** spec §3.1 및 plan 주석에 "에어컨/판넬=개별, 부자재=batch"라고 명시되어 있으나, V2 시드 카테고리(V2__seed_product_categories.sql)를 확인하면 판넬(PANEL) 카테고리가 존재하지 않는다. 계획 문서에 "판넬 카테고리 부재 시 처리" 주의 사항이 있었음에도 V9에 대한 처리가 없다. 현재 V2에 판넬 카테고리가 없으므로 에어컨 계열만 true 처리는 기술적으로 문제없으나, Javadoc 주석("에어컨/판넬 계열")과 V9 SQL의 UPDATE 대상("에어컨 계열만") 간에 불일치가 있다.

**요구 조치:** V9 SQL 주석에서 "판넬 카테고리는 현재 V2에 미정의 — 추가 시 별도 V10 UPDATE 예정" 명시 추가. Category.java Javadoc 동일하게 정합.

---

## 3. P2 지적 (후속 슬라이스 진입 전 수정 권장)

### P2-1 [StockInstanceController] UUID 노출 — feedback_uuid_no_user_visibility 경계
**파일:** `services/inventory-service/.../web/StockInstanceResponse.java`

```java
/** 인스턴스 UUID — API key, 화면 미표시 */
UUID id,
/** 제품 UUID — API key */
UUID productId,
/** 창고 UUID — API key */
UUID warehouseId,
```

**현황:** 응답 DTO에 UUID 3개가 포함되어 있으며 Javadoc에 "API key — 화면 미표시"로 명시. FE가 이 값을 사용자에게 노출하지 않는다는 전제가 코드에만 있고 API 계약에 강제되지 않는다. S1 단계에서는 FE가 없으므로 직접 위반은 아니나, S2~S4 연동 시 FE 화면에 UUID가 노출될 위험이 있다.

**요구 조치:** Controller Javadoc에 "id/productId/warehouseId는 API key 전용 — FE 화면 표시 금지" 경고를 @deprecated 또는 별도 주석으로 강화. 또는 S2 진입 시 warehouseCode 필드 추가 계획을 IT에 TODO로 명시.

---

### P2-2 [역-FIFO 인덱스] outbound_at 컬럼 NULL 가능성 — 인덱스 효율 저하
**파일:** `services/inventory-service/src/main/resources/db/migration/V15__create_stock_instances.sql:26`

```sql
CREATE INDEX ix_stock_instances_recall ON stock_instances(outbound_partner_code, product_code, status, outbound_at);
```

**문제:** `outbound_at`는 AVAILABLE/RESERVED 상태에서 NULL이다. PostgreSQL 인덱스는 NULL 값을 포함하므로 효율이 저하된다. SHIPPED 상태 전용 조회이므로 `WHERE status = 'SHIPPED'` 부분 인덱스(partial index)로 생성하면 인덱스 크기와 스캔 효율이 향상된다.

```sql
-- 권장
CREATE INDEX ix_stock_instances_recall ON stock_instances(outbound_partner_code, product_code, outbound_at DESC)
WHERE status = 'SHIPPED';
```

**요구 조치:** S1에서 즉시 수정 권장. V16이 아닌 V15 내 수정(배포 전이므로 가능).

---

### P2-3 [StockInstanceSeeder] productCode 정합성 — 하드코딩 배열 단절 위험
**파일:** `services/inventory-service/.../seed/StockInstanceSeeder.java:59`

```java
private static final String[] SERIAL_MODEL_NAMES = {
    "AR05TXEAAWKNEU-01",   // 벽걸이 5평형 (seq 1)
    ...
};
private static final String[] PRODUCT_CODES = {
    "010001",
    "010031",
    "010051",
    "010076"
};
```

**문제:** `project_seed_product_uuid_catalog` 메모리에 따라 seeder productCode는 단일 소스에서 파생해야 한다. 현재 SERIAL_MODEL_NAMES와 PRODUCT_CODES가 별도 배열로 인덱스 기반 매핑되어 있어, 한쪽 배열 변경 시 순서가 틀어질 위험이 있다.

**요구 조치:** 두 배열을 record 또는 enum으로 묶거나, StockBalanceSeeder의 PRODUCT_MODEL_NAMES 상수를 공유하는 방식으로 리팩터링. S1 이후 슬라이스 진입 전 개선 권장.

---

### P2-4 [IT TC-5] 도메인 단위 테스트에서 warehouseId null 사용 — IllegalArgumentException 우선 발생 위험
**파일:** `services/inventory-service/.../it/StockInstanceIT.java:257`

```java
StockInstance instance = StockInstance.inbound(
    serialProductId, serialProductCode, warehouseId,  // warehouseId 가 null 일 수 있음
    ...);
```

**문제:** TC-5는 DB 의존이 없는 도메인 단위 테스트지만, `warehouseId` 필드는 `@BeforeEach`에서 DB 조회로 설정된다. Docker 미가용 시 `POSTGRES.start()` 실패로 warehouseId가 null이 되고, `StockInstance` 내부 생성자에서 `IllegalArgumentException("warehouseId 필수")`가 먼저 발생하여 TC-5 의도와 다른 예외가 던져진다.

**요구 조치:** TC-5/TC-5b는 DB 의존이 없으므로 `warehouseId = UUID.randomUUID()`로 로컬 고정값을 사용하거나, `AbstractPostgresIT`를 상속하지 않는 별도 단위 테스트 클래스로 분리.

---

### P2-5 [ProductSummaryResponse] LAZY 로딩 경고 — 트랜잭션 외부 호출 위험
**파일:** `services/product-service/.../web/dto/ProductSummaryResponse.java:17`

```
* category 는 LAZY 이므로 반드시 트랜잭션 내부에서 호출해야 한다.
```

**문제:** `from(Product p)` 내에서 `p.getCategory().isSerialManaged()`를 호출하는데, Javadoc 주석으로만 경고하고 있다. `@Transactional` 누락 호출처에서 LazyInitializationException이 발생할 위험이 있다. 기존 ProductService/ProductInternalController의 `from()` 호출 지점이 모두 @Transactional 보장이 되어 있는지 확인이 필요하다.

**요구 조치:** `from()` 호출 지점(ProductService/ProductInternalController)에서 @Transactional 어노테이션이 있는지 확인하고, 없는 경우 추가 또는 `@EntityGraph`로 EAGER 로딩 보장.

---

## 4. 종합 평가

### 긍정 사항

1. **상태전이 가드 정확성:** `requireStatus()` private 메서드가 모든 전이 메서드(ship/recall/reserve/release)에서 일관되게 호출되며, AVAILABLE→SHIPPED/RECALLED, AVAILABLE↔RESERVED, SHIPPED→RECALLED 전이 다이어그램이 spec §3.1과 정합.

2. **FIFO/역-FIFO 쿼리 정확성:** `findByProductCodeAndStatusOrderByReceivedAtAsc`(FIFO)와 `findByOutboundPartnerCodeAndProductCodeAndStatusOrderByOutboundAtDesc`(역-FIFO) 쿼리가 V15 인덱스 컬럼 순서와 정확히 대응.

3. **serial_managed 가드:** `StockInstanceService.create()`에서 `ProductClient.requireExists()` 호출 후 `!product.serialManaged()`이면 409를 던지는 가드가 명확히 구현되었고, IT TC-2로 검증됨.

4. **cross-service 계약 일관성:** `ProductSummaryResponse.serialManaged` ↔ `ProductSummary.serialManaged` record 필드명이 동일하고, 양쪽 모두 backward-compatible 생성자(6인자, 7인자)가 구현됨.

5. **마이그레이션 회귀 0:** V15가 stock_lots/stock_balances를 무변경으로 유지하고, V9의 ALTER TABLE이 DEFAULT FALSE로 legacy 호환됨.

6. **한국어 Javadoc:** 모든 신규 entity/도메인 메서드/Service/Controller에 한국어 Javadoc이 작성됨.

7. **소프트 딜리트 필터:** `@SQLRestriction("is_deleted = false")`가 엔티티에 적용되고 IT TC-6으로 검증됨.

8. **@MockBean 격리:** IT에서 `ProductClient`를 `@MockBean`으로 격리하고 lenient stub을 구성하여 `feedback_it_mockbean_external_clients` 준수.

### 결함 요약

| 우선순위 | ID | 내용 | 파일 |
|---|---|---|---|
| P0 | P0-1 | 서비스 BusinessException vs 도메인 ResponseStatusException 응답 형식 불일치 | StockInstanceService:65 |
| P0 | P0-2 | byProduct status=null 시 findAll() 전체 스캔 | StockInstanceService:111 |
| P1 | P1-1 | V15 version 컬럼 누락 (BaseEntity 7 audit) | V15__.sql |
| P1 | P1-2 | CreateInstanceRequest productCode @NotBlank 누락 | CreateInstanceRequest:19 |
| P1 | P1-3 | StockInstanceSeeder 의존 관계 Javadoc 미흡 | StockInstanceSeeder:44 |
| P1 | P1-4 | IT warehouseId null 조기 return → silent pass | StockInstanceIT:123 |
| P1 | P1-5 | V9 SQL 주석 판넬 카테고리 누락 설명 | V9__.sql |
| P2 | P2-1 | StockInstanceResponse UUID 노출 경계 주석 강화 필요 | StockInstanceResponse |
| P2 | P2-2 | 역-FIFO 인덱스 partial index 미적용 | V15__.sql:26 |
| P2 | P2-3 | Seeder 배열 단절 위험 | StockInstanceSeeder:59 |
| P2 | P2-4 | TC-5 warehouseId null 우선 발생 위험 | StockInstanceIT:257 |
| P2 | P2-5 | ProductSummaryResponse LAZY 로딩 경고 미검증 | ProductSummaryResponse:17 |

---

## 5. 최종 판정

**CHANGES_REQUESTED**

P0-1(예외 타입 불일치)과 P0-2(findAll 전체 스캔) 수정 필수. P1 항목 4건(version 컬럼, @NotBlank, IT silent pass, V9 주석) 사이클 2 fix 전 완료 권장. P2는 후속 슬라이스 전 점진 개선.
