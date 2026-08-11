# 제품구분 수동분류 불가침 보완 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `classification_manual=true`인 제품의 `products.category_id`가 V38 재실행·rollback·시트/이카운트 동기화 등 자동 경로에서 덮어써지지 않도록 모든 write 지점을 검증하고 보완한다.

**Architecture:** V38 감사 재적용 UPDATE의 실제 행 잠금 조건에 `p.classification_manual = FALSE`를 추가해 후보 조회와 UPDATE 사이에도 수동 상태를 원자적으로 재검증한다. 전수표에서 X로 판정한 ECOUNT soft-delete 복원 SQL도 수동행의 현재 `category_id`를 유지하도록 조건부로 바꾸며, 화면의 `ProductService.update()`는 명시적 사용자 수정 경로로 그대로 둔다.

**Tech Stack:** Java 17, Spring Boot/JPA, Flyway Java migration, PostgreSQL/Testcontainers, JUnit 5/AssertJ, Playwright/Chromium 1217.

## Global Constraints

- 공유 DB에는 write하지 않고 product-service Testcontainers PostgreSQL 격리 DB만 사용한다.
- git checkout/fetch/pull/add/commit/reset/merge/push는 실행하지 않는다.
- `classification_manual=true` 제품의 자동 `category_id` 갱신을 금지하되, 화면의 명시적 ProductService 수정은 허용한다.
- 기존 SOL-1 목록·필터·동적 count, SOL-2 rollback 4조건, SOL-3 V38 연속, 시트 신규/soft-delete 재등장, 받침대·구성품 역산, 기존 견적·전표·세트 전개를 회귀시키지 않는다.
- 40% 규칙은 이번 라운드 범위에서 다루지 않는다.

## `category_id` write 전수표 기준

| 지점 | 성격 | `classification_manual` 존중 | 판정/조치 |
|---|---|---:|---|
| `V38__ProductCategoryBackfill.rollback()` `:69` | 자동 rollback UPDATE | O | 기존 `p.classification_manual = FALSE` 유지 |
| `V38__ProductCategoryBackfill.applyAuditedChanges()` `:236` | V38 감사행 재적용 UPDATE | X | UPDATE WHERE에 현재 수동 플래그 재검증 추가 |
| `ProductSheetSyncService` 신규 `seedFromSheet()` `:1328` | 신규 행 INSERT | O | 신규 기본값 false, 분류 결과만 기록 |
| `ProductSheetSyncService` 기존/soft-delete 재등장 `:1319-1320` | 기존 행 복원/동기화 | O | `category_id`를 쓰지 않고 기존 카테고리 보존 |
| `EcountProductImporter.UPSERT_PRODUCT_SQL` `:393` | 신규 ECOUNT INSERT 및 active conflict UPDATE | O | conflict UPDATE에 `category_id` 없음; 신규만 기본 버킷 기록 |
| `EcountProductImporter.restoreSoftDeletedProduct()` `:503` | soft-delete 자동 복원 UPDATE | X | 수동행이면 기존 `p.category_id` 유지하도록 조건부 assignment 추가 |
| `HvacProductSeeder.insertProductNative()` `:431` | 신규 seed INSERT | O | 신규 행에만 카테고리 기록 |
| `ProductService.create()` | 화면 신규 INSERT | O | 신규 사용자 요청 카테고리 기록 |
| `ProductService.update()` `:610` | 화면 명시적 사용자 수정 | 해당 없음(사용자 행위) | 사용자 변경 허용, 자동 가드로 막지 않음 |

조회·필터(`ProductRepository`)와 스키마/조인 참조는 write 지점이 아니므로 표의 write 분모에서 제외한다. 마이그레이션 테스트의 fixture SQL은 테스트 데이터 조작이며 production 자동 경로가 아니다.

---

### Task 1: V38 재실행 RED 및 원문 재현

**Files:**
- Modify: `services/product-service/src/test/java/db/migration/V38__ProductCategoryBackfillTest.java`
- Create: `docs/qa/2026-08-11-category-fix2/v38-r2-1-before-fix.txt`

**Interfaces:**
- Consumes: 기존 `V38__ProductCategoryBackfill.apply(Connection)` 테스트 helper.
- Produces: 감사행 생성 후 사람이 category와 `modified_by`를 바꾼 수동행을 재실행이 덮어쓰는 현행 RED 증거와 회귀 테스트.

- [ ] **Step 1: Write the failing test**

`실외기` 제품을 `INDOOR_WALL`로 만들고 첫 `apply()` 후 `INDOOR`로 수동 변경한다. `classification_manual=true`, `modified_by=human`, `rolled_back_at=NULL`을 확인한 뒤 두 번째 `apply()`를 실행하고 category/flag/modified_by/audit 상태가 보존되어야 한다고 단언한다.

- [ ] **Step 2: Run test to verify it fails**

Run: `gradlew.bat :services:product-service:test --tests db.migration.V38__ProductCategoryBackfillTest --no-daemon`

Expected: the new test fails with the original overwrite, `expected: INDOOR but was: OUTDOOR`, and the raw output is saved in `docs/qa/2026-08-11-category-fix2/v38-r2-1-before-fix.txt`.

### Task 2: V38 실제 UPDATE 시점 가드

**Files:**
- Modify: `services/product-service/src/main/java/db/migration/V38__ProductCategoryBackfill.java:235-247`
- Modify: `services/product-service/src/test/java/db/migration/V38__ProductCategoryBackfillTest.java`

**Interfaces:**
- Consumes: Task 1 regression fixture.
- Produces: 수동행 skip, 정상 자동행 적용, apply 멱등성 및 감사 상태 보존.

- [ ] **Step 1: Add the mixed-batch assertions**

같은 테스트 또는 별도 테스트에서 `classification_manual=true` + applied와 같은 현재값, 제3 카테고리 현재값, 정상 자동행을 한 batch에 넣고 수동 두 행의 category/modified_by는 불변이며 정상행만 적용되는지 검증한다.

- [ ] **Step 2: Run the expanded test before production change**

Run: `gradlew.bat :services:product-service:test --tests db.migration.V38__ProductCategoryBackfillTest --no-daemon`

Expected: RED remains only on the new apply re-run/manual-batch assertions.

- [ ] **Step 3: Implement the minimal SQL guard**

`applyAuditedChanges()`의 UPDATE WHERE에 `AND p.classification_manual = FALSE`를 추가한다. 후보 SELECT는 기존 가드를 유지하고, rollback SQL이나 감사행 자체를 변경하지 않는다.

- [ ] **Step 4: Run the focused migration tests**

Run: `gradlew.bat :services:product-service:test --tests db.migration.V38__ProductCategoryBackfillTest --no-daemon`

Expected: all V38 tests pass and second `apply()` leaves the manual category/modified_by unchanged.

### Task 3: ECOUNT soft-delete 복원 X 지점 보완

**Files:**
- Modify: `services/product-service/src/main/java/com/samhanair/logis/product/service/EcountProductImporter.java:489-532`
- Modify: `services/product-service/src/test/java/com/samhanair/logis/product/it/EcountProductImporterIT.java`

**Interfaces:**
- Consumes: existing ECOUNT importer restore flow and `classification_manual` column.
- Produces: 자동 복원 시 수동 soft-delete 행의 category 보존, 비수동 soft-delete 행의 기존 ECOUNT 복원 동작 유지.

- [ ] **Step 1: Write the failing integration test**

soft-delete된 행을 `classification_manual=true`와 제3 category로 만들고 동일 product code를 ECOUNT import로 복원한 뒤 category가 제3값인지 단언한다. 비수동 fixture는 `ECOUNT_MIG2`로 복원되는 기존 계약도 함께 유지한다.

- [ ] **Step 2: Run the importer test to verify RED**

Run: `gradlew.bat :services:product-service:test --tests '*EcountProductImporterIT' --no-daemon`

Expected: manual soft-delete fixture is overwritten with `ECOUNT_MIG2` before the SQL change.

- [ ] **Step 3: Implement the minimal conditional assignment**

복원 UPDATE의 `category_id` assignment를 `CASE WHEN p.classification_manual THEN p.category_id ELSE (ECOUNT_MIG2 id) END`로 바꾸고, 다른 시트/ECOUNT 필드 동기화는 기존대로 둔다.

- [ ] **Step 4: Run the focused importer tests**

Run: `gradlew.bat :services:product-service:test --tests '*EcountProductImporterIT' --no-daemon`

Expected: manual category is preserved and non-manual restore remains unchanged.

### Task 4: 라이브 QA 및 보고서

**Files:**
- Create: `docs/dev-reports/2026-08-11-product-category-fix2.md`
- Create/update only within: `docs/qa/2026-08-11-category-fix2/`

- [ ] **Step 1: Run product-service regression suite**

Run: `gradlew.bat :services:product-service:test --no-daemon --rerun-tasks`

Expected: product-service full suite passes with the new V38 and importer regressions.

- [ ] **Step 2: Run Desktop tests and direct Playwright QA**

From `clients/desktop`, run the existing Vitest command for the 152-test renderer scope and the headless Chromium-1217 Playwright flow for `미분류` filter. Capture before/filter-cleared states and retain failure output if any step fails.

- [ ] **Step 3: Record the final report**

Include the exact pre-fix RED output, the complete write-point O/X table, root-cause/selected SQL guard rationale, RED-A/RED-B results, apply/rollback/sheet combinations, preserved SOL-B evidence, test counts, and any blocked verification with raw output.

- [ ] **Step 4: Verify forbidden actions did not occur**

Run read-only `git status --short` and report that no git operation, shared DB write, migration deployment, or 40% rule work was performed.
