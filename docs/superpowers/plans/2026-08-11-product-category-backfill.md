# 제품구분 카테고리 백필 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 품목명 보수 규칙을 하나로 유지하여 시트 신규 품목과 기존 활성 품목에 제품구분 카테고리를 안전하게 부여한다.

**Architecture:** `ProductNameCategoryClassifier`가 정규화된 품목명에서 카테고리 코드를 반환하는 단일 규칙 원천이 된다. V38 Java Flyway migration이 이를 호출해 감사행을 먼저 기록하고 백필하며, 시트 동기화도 동일한 결과로 카테고리를 해소한다. soft-delete 재등장은 기존 행을 복원해 카테고리를 보존한다.

**Tech Stack:** Java 17, Spring Boot/JPA, Flyway Java migration, PostgreSQL/Testcontainers, JUnit 5/AssertJ/Mockito.

## Global Constraints

- Flyway는 product-service `origin/main` 최대 V37의 다음인 V38이다.
- `UNCLASSIFIED`는 루트(`parent_id=NULL`), 코드 `UNCLASSIFIED`, 명칭 `미분류`, 기존 루트의 마지막 다음 `display_order`다.
- 자동분류 키워드·우선순위를 확장하지 않는다.
- `classification_manual=true` 행, 정액DC 분류 축, 견적·전표·세트 전개는 변경하지 않는다.
- BaseEntity 7 audit 및 soft-delete만 사용한다. 공유 DB에는 쓰지 않는다.

---

### Task 1: 단일 품목명 분류기

**Files:**
- Create: `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductNameCategoryClassifier.java`
- Create: `services/product-service/src/test/java/com/samhanair/logis/product/service/ProductNameCategoryClassifierTest.java`

**Interfaces:**
- Produces: `String ProductNameCategoryClassifier.classify(String productName)` — `SERVICE`, `CONTROL`, `PIPING`, `OUTDOOR`, `HVAC`, `INDOOR_WALL`, `INDOOR_CEILING`, `INDOOR`, `UNCLASSIFIED` 중 하나.

- [ ] **Step 1: Write the failing test**

```java
@ParameterizedTest
@MethodSource("cases")
void classify_보수규칙_우선순위대로_카테고리코드를_반환한다(String name, String expected) {
    assertThat(ProductNameCategoryClassifier.classify(name)).isEqualTo(expected);
}

private static Stream<Arguments> cases() {
    return Stream.of(
        arguments("실외기 받침대", "PIPING"),
        arguments("벽걸이 리모컨", "CONTROL"),
        arguments("실외기", "OUTDOOR"),
        arguments("벽걸이 실내기", "INDOOR_WALL"),
        arguments("판정불가 모델", "UNCLASSIFIED"));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew :services:product-service:test --tests '*ProductNameCategoryClassifierTest'`

Expected: FAIL because `ProductNameCategoryClassifier` does not exist.

- [ ] **Step 3: Write minimal implementation**

```java
public final class ProductNameCategoryClassifier {
    public static String classify(String productName) {
        String normalized = productName == null ? "" : productName.replaceAll("\\s+", "")
                .toLowerCase(Locale.ROOT);
        // 정찰본의 서비스 → 제어 → 부속 → 실외기 → ERV → 벽걸이 → 천장형 → 실내기 순서
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./gradlew :services:product-service:test --tests '*ProductNameCategoryClassifierTest'`

Expected: PASS.

### Task 2: V38 감사 백필 migration

**Files:**
- Create: `services/product-service/src/main/java/db/migration/V38__ProductCategoryBackfill.java`
- Create: `services/product-service/src/test/java/com/samhanair/logis/product/it/ProductCategoryBackfillMigrationIT.java`

**Interfaces:**
- Consumes: `ProductNameCategoryClassifier.classify(String)`.
- Produces: `product_category_backfill_audit`와 `UNCLASSIFIED` 루트 카테고리.

- [ ] **Step 1: Write the failing integration test**

```java
@Test
void backfill_수동분류행을_제외하고_감사후_자동및미분류카테고리를_적용한다() throws Exception {
    // OUTDOOR, INDOOR_WALL, UNCLASSIFIED, classification_manual=true fixture를 적재
    ProductCategoryBackfillMigration.apply(jdbcTemplate.getDataSource().getConnection());
    // 수동행의 category_id 불변, 나머지 세 코드 및 감사 이전/적용값 검증
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew :services:product-service:test --tests '*ProductCategoryBackfillMigrationIT'`

Expected: FAIL because V38 migration helper and audit table do not exist.

- [ ] **Step 3: Write minimal migration**

```java
public final class V38__ProductCategoryBackfill extends BaseJavaMigration {
    @Override public void migrate(Context context) throws Exception {
        ProductCategoryBackfillMigration.apply(context.getConnection());
    }
}
```

`apply(Connection)`은 `UNCLASSIFIED` 루트를 `MAX(display_order)+1`로 멱등 생성하고, 감사행을 먼저 `ON CONFLICT (migration_key, product_id) DO NOTHING`으로 삽입한다. 이후 rollback되지 않은 감사행만으로 `products.category_id`를 갱신한다.

- [ ] **Step 4: Run test to verify it passes**

Run: `./gradlew :services:product-service:test --tests '*ProductCategoryBackfillMigrationIT'`

Expected: PASS.

### Task 3: 시트 신규·재등장 카테고리 적용

**Files:**
- Modify: `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductSheetSyncService.java`
- Modify: `services/product-service/src/main/java/com/samhanair/logis/product/repository/ProductRepository.java`
- Modify: `services/product-service/src/test/java/com/samhanair/logis/product/it/ProductSheetSyncServiceIT.java`

**Interfaces:**
- Consumes: `ProductNameCategoryClassifier.classify(String)`, 코드별 `CategoryRepository.findByCode`.
- Produces: 신규 시트 행의 자동/미분류 카테고리와 재등장 행의 기존 카테고리 보존.

- [ ] **Step 1: Write failing integration tests**

```java
@Test void sync_실외기_신규품목은_OUTDOOR_카테고리로_생성한다() { }
@Test void sync_미일치_신규품목은_UNCLASSIFIED_카테고리로_생성한다() { }
@Test void sync_softDelete후_재등장한_수동카테고리품목은_기존카테고리를_보존한다() { }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `./gradlew :services:product-service:test --tests '*ProductSheetSyncServiceIT'`

Expected: FAIL because the service still resolves `INDOOR_WALL` for every new row and creates a replacement row after soft-delete.

- [ ] **Step 3: Write minimal implementation**

Resolve each required category code once at sync start. For a new row, invoke the classifier and use the mapped category; do not alter an active existing row's category. When no active model-code row exists, query the latest soft-deleted row by model code, call `markRestored()`, then continue through the existing-update path so its category remains unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `./gradlew :services:product-service:test --tests '*ProductSheetSyncServiceIT'`

Expected: PASS.

### Task 4: 격리 검증 및 개발 보고서

**Files:**
- Create: `docs/dev-reports/2026-08-11-product-category-backfill.md`

- [ ] **Step 1: Run focused and product-service test suites**

Run: `./gradlew :services:product-service:test`

Expected: PASS.

- [ ] **Step 2: Run isolated PostgreSQL migration verification**

Run the V38 test fixture against its Testcontainers database; do not use `samhan-postgres` or any shared database.

Expected: 916 auto-classified, 2,168 `UNCLASSIFIED`, manual rows unchanged, audit and rollback verified.

- [ ] **Step 3: Record evidence**

Write the required Korean report containing preflight data, exact rule source, category distribution, audit/rollback SQL, RED assertions, combination matrix, test commands/results, and all newly created files.
