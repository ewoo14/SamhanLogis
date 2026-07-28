# Quantity Sync Schema Implementation Plan

> **For agentic workers:** This plan is executed inline in the current worktree. Git state-changing commands are prohibited by the task request; each task ends with a runnable verification command instead of a commit.

> 🚨 **2026-07-28 scope reduction (개발책임자 decision, after PR #958 R5)** — This plan
> describes the original design, which included a V24 deferred constraint trigger layer on
> `products`/`bundle_component`/`product_estimate_exposure` plus `quantity_sync_rule`/
> `source`/`target` themselves, and a `QuantitySyncRuleDbProbeIT` that proved DB-level
> bypass protection (I-2). That entire trigger layer and probe file were removed after five
> consecutive rounds of reachable defects (convergence ratio 1.00→3.50) traced to those old
> write paths. What remains matches this plan for schema (tables, CHECK constraints,
> indexes) and CRUD, but **not** for DB-enforced graph validation — that is Java-only now,
> and I-2 is deferred to slice 3. See
> `docs/dev-reports/2026-07-28-896-s2-quantity-sync-schema.md` §10 for the authoritative
> current state.

**Goal:** Add the product-service quantity synchronization rule schema, fail-closed storage validation, UUID-free CRUD API, and honest snapshot provenance evidence without changing any runtime evaluator or price calculation path.

**Architecture:** `QuantitySyncRule` is the aggregate root; source and target rows store raw Product UUID foreign keys internally and expose model code/name at the API boundary. Java service validation performs the same eight checks before an atomic replace, while V24 PostgreSQL constraints and a deferred constraint trigger re-check all active rows at transaction commit so direct SQL cannot bypass DTO/service guards. No seed rows are emitted because the available local database is a documented HvacProductSeeder development seed rather than the required real catalog snapshot.

**Tech Stack:** Spring Boot 3, Spring Data JPA, Hibernate JSONB mapping, PostgreSQL 16/Flyway, JUnit 5/AssertJ/MockMvc, Testcontainers PostgreSQL, PowerShell and `psql -f` probe scripts.

## Global Constraints

- Use the survey schema in `docs/superpowers/specs/2026-07-27-896-survey.md` §6.2, §6.5, and §6.5 seed procedure as the canonical source.
- Add only `V24__`; do not touch V1~V23, including comments.
- All three entities extend `BaseEntity`, use `@SQLRestriction("is_deleted = false")`, and expose domain methods instead of direct setters.
- Store Product UUIDs only as internal foreign keys; API responses use `modelCode` fallback and product name, never UUIDs.
- Keep H-07 and C-09 in the legacy evaluator and create no configuration rows for them.
- Do not modify `clients/web/estimate-app/views/index.ejs`, `clients/web/order-app/index.html`, or `tools/legacy-gas/**`.
- Do not add evaluator, shadow diff, document replay, cutover, or chip UI behavior.
- Do not synthesize data. If no real catalog snapshot is available, leave V24 seed-free and record the exact provenance evidence.
- Never write to the shared product database; all DB mutation probes use isolated PostgreSQL or disposable transaction-local fixtures.

---

### Task 1: Establish RED-first validation fixtures and test contracts

**Files:**
- Create: `services/product-service/src/test/java/com/samhanair/logis/product/quantitysync/QuantitySyncRuleValidationTest.java`
- Create: `services/product-service/src/test/java/com/samhanair/logis/product/quantitysync/QuantitySyncRuleDbProbeIT.java`
- Create: `services/product-service/src/test/java/com/samhanair/logis/product/quantitysync/QuantitySyncRuleSeedAbsenceIT.java`

**Interfaces:**
- `QuantitySyncRuleValidationTest` calls `QuantitySyncRuleService.replace(...)` with one invalid draft per survey validation and asserts `BusinessException` with `INVALID_INPUT`.
- Each invalid draft uses two or three named product fixtures and identifies the violated invariant in the test name: cross-category, source-target overlap, duplicate REPLACE, cycle, hidden/deleted product, BUNDLE component boundary, invalid multiplier scale/range, and invalid whole-graph replacement.
- `QuantitySyncRuleDbProbeIT` executes SQL against the migrated PostgreSQL schema and asserts COMMIT fails for the same invalid inputs without using the Java service.
- `QuantitySyncRuleSeedAbsenceIT` asserts no active rule key or legacy reference contains H-07 or C-09.

- [ ] **Step 1: Write the eight service-level failing tests first**

  Build test drafts that use model codes rather than UUIDs and assert the intended rejection. The test data uses isolated entity fixtures; it does not reuse or mutate the shared local stack.

- [ ] **Step 2: Run the focused test class before production validation exists**

  Run: `.\gradlew :services:product-service:test --tests "com.samhanair.logis.product.quantitysync.QuantitySyncRuleValidationTest" --rerun-tasks --no-build-cache`

  Expected RED: the new validation surface is absent; record the exact compiler/test output in the dev-report and then continue to the minimal persistence implementation.

- [ ] **Step 3: Add DB probe cases before adding trigger enforcement**

  The probe inserts only isolated fixture rows, commits each invalid graph, captures the PostgreSQL error, and verifies the transaction leaves zero active quantity-sync rows.

- [ ] **Step 4: Run the probe before V24 trigger implementation**

  Run: `.\gradlew :services:product-service:test --tests "com.samhanair.logis.product.quantitysync.QuantitySyncRuleDbProbeIT" --rerun-tasks --no-build-cache`

  Expected RED: the direct SQL inputs are accepted or the V24 schema is absent. Preserve the actual output; do not label a skipped Testcontainers test as passing.

---

### Task 2: Add V24 schema and database-enforced invariants

**Files:**
- Create: `services/product-service/src/main/resources/db/migration/V24__quantity_sync_rule_schema.sql`

**Interfaces:**
- Creates `quantity_sync_rule`, `quantity_sync_source`, and `quantity_sync_target` with UUID primary keys, BaseEntity audit fields, soft-delete flags, Product foreign keys, and survey field names.
- Rule columns: `rule_key`, `estimate_category`, `name`, `enabled`, `aggregation`, `condition_json`, `inactive_behavior`, `conflict_policy`, `priority`, `legacy_ref`.
- Source columns: `rule_id`, `source_product_id`, `factor`.
- Target columns: `rule_id`, `target_product_id`, `multiplier`, `rounding_mode`, `display_order`.
- Adds partial unique indexes for active rule keys, active rule/source pairs, active rule/target pairs, and active target display order.
- Adds immediate enum/range/scale checks and a deferred PostgreSQL constraint trigger that calls one complete active-graph validation function on every rule/source/target mutation.

- [ ] **Step 1: Write the migration tables and basic constraints**

  Use `uuid`, `varchar`, `boolean`, `jsonb`, `numeric(12,4)`, and the exact seven audit columns. Enforce `aggregation='SUM'`, permitted categories `HOME_MULTI/SINGLE_SET/COMM_MULTI`, `inactive_behavior IN ('ZERO','KEEP')`, `conflict_policy IN ('ADD','REPLACE')`, `rounding_mode IN ('NONE','FLOOR')`, priority non-negative, display order positive, and multipliers `> 0 AND <= 1000 AND value = round(value, 4)`.

- [ ] **Step 2: Add JSON condition validation in PostgreSQL**

  Recursively permit only object nodes using `optionEquals`, `optionIn`, `all`, `any`, and `not`; permit only known option keys from the existing web option contract; reject function names, regex text, SQL fragments, and arbitrary expression strings.

- [ ] **Step 3: Add deferred graph validation**

  At commit, reject missing active source/target rows, category mismatches after mapping Product `COMMERCIAL_MULTI` to schema `COMM_MULTI`, source-target overlap, duplicate same-condition `REPLACE` targets, cycles in the active source→target graph, deleted/discontinued/NONE-scope Products, and BUNDLE source to its own `bundle_component` target. The function must use only active rows and must roll back the entire transaction on any violation.

- [ ] **Step 4: Apply V24 to an isolated PostgreSQL database and run the DB RED/GREEN cycle**

  Run the exact fresh-PostgreSQL probe with `ON_ERROR_STOP=1`; use `docker cp` plus `psql -f`, never a `docker exec` heredoc. Record the pre-trigger acceptance and post-trigger rejection output in the report.

---

### Task 3: Implement domain entities, repositories, and pure Java validation

**Files:**
- Create: `services/product-service/src/main/java/com/samhanair/logis/product/domain/QuantitySyncEstimateCategory.java`
- Create: `services/product-service/src/main/java/com/samhanair/logis/product/domain/QuantitySyncAggregation.java`
- Create: `services/product-service/src/main/java/com/samhanair/logis/product/domain/QuantitySyncInactiveBehavior.java`
- Create: `services/product-service/src/main/java/com/samhanair/logis/product/domain/QuantitySyncConflictPolicy.java`
- Create: `services/product-service/src/main/java/com/samhanair/logis/product/domain/QuantitySyncRoundingMode.java`
- Create: `services/product-service/src/main/java/com/samhanair/logis/product/domain/QuantitySyncRule.java`
- Create: `services/product-service/src/main/java/com/samhanair/logis/product/domain/QuantitySyncSource.java`
- Create: `services/product-service/src/main/java/com/samhanair/logis/product/domain/QuantitySyncTarget.java`
- Create: `services/product-service/src/main/java/com/samhanair/logis/product/repository/QuantitySyncRuleRepository.java`
- Create: `services/product-service/src/main/java/com/samhanair/logis/product/repository/QuantitySyncSourceRepository.java`
- Create: `services/product-service/src/main/java/com/samhanair/logis/product/repository/QuantitySyncTargetRepository.java`
- Create: `services/product-service/src/main/java/com/samhanair/logis/product/quantitysync/QuantitySyncRuleValidator.java`

**Interfaces:**
- Entities expose `create`, `changeDefinition`, `changeFactor`, `changeMultiplier`, `markDeleted`, and read-only getters; no public field setter is added.
- `QuantitySyncRuleValidator.validate(QuantitySyncRuleDraft, Map<String, Product>, List<QuantitySyncRuleSnapshot>)` performs the eight service checks and recursively validates condition JSON.
- Repositories provide active rule lookup by rule key/category and child lookup by rule ID; ProductRepository gains only model-code batch lookup needed for request resolution.

- [ ] **Step 1: Implement enums and entity factories after the RED tests exist**

  Use Korean Javadoc, raw UUID Product IDs internally, `@JdbcTypeCode(SqlTypes.JSON)` for the condition tree, and `@SQLRestriction` on all three entities.

- [ ] **Step 2: Implement the validator minimally to make each service RED test GREEN**

  Resolve product code to active Product, validate category and visibility, reject source/target overlap, detect duplicate REPLACE pairs and cycles, enforce BUNDLE boundaries, enforce factor/multiplier scale/range, and require a non-empty complete graph before persistence.

- [ ] **Step 3: Run the focused validation test class**

  Run: `.\gradlew :services:product-service:test --tests "com.samhanair.logis.product.quantitysync.QuantitySyncRuleValidationTest" --rerun-tasks --no-build-cache`

  Expected GREEN: eight invalid inputs fail for their intended reason; valid control drafts save in the later service task.

---

### Task 4: Implement atomic CRUD service and UUID-free API

**Files:**
- Create: `services/product-service/src/main/java/com/samhanair/logis/product/service/QuantitySyncRuleService.java`
- Create: `services/product-service/src/main/java/com/samhanair/logis/product/web/QuantitySyncRuleController.java`
- Create: `services/product-service/src/main/java/com/samhanair/logis/product/web/dto/QuantitySyncRuleRequest.java`
- Create: `services/product-service/src/main/java/com/samhanair/logis/product/web/dto/QuantitySyncRuleResponse.java`
- Create: `services/product-service/src/main/java/com/samhanair/logis/product/web/dto/QuantitySyncProductRef.java`
- Modify: `services/product-service/src/main/java/com/samhanair/logis/product/repository/ProductRepository.java`
- Modify: `services/api-gateway/src/main/resources/application.yml`

**Interfaces:**
- `GET /api/v1/quantity-sync-rules?estimateCategory=` lists active rules.
- `GET /api/v1/quantity-sync-rules/{ruleKey}` reads one rule.
- `POST /api/v1/quantity-sync-rules` creates a rule.
- `PUT /api/v1/quantity-sync-rules/{ruleKey}` replaces the definition and all active source/target rows atomically.
- `DELETE /api/v1/quantity-sync-rules/{ruleKey}` soft-deletes the rule and children atomically.
- Request product refs contain `productCode`, `factor`, `multiplier`, `roundingMode`, and `displayOrder`; response refs contain `productCode`, `productName`, and the numeric relation fields. No response field contains an internal UUID.

- [ ] **Step 1: Add DTO bean validation and response mapping**

  Validate nonblank stable keys, bounded names/refs, non-empty source/target arrays, and JSON object conditions. Use `BigDecimal` for factors and multipliers so scale is preserved.

- [ ] **Step 2: Implement transactional create/update/delete**

  Resolve all product codes before any write, acquire the rule row lock for updates, validate the complete graph, mark old children deleted, insert the replacement children through factories, and rely on one transaction plus the deferred DB trigger for atomicity.

- [ ] **Step 3: Add controller permission and gateway routing**

  Use `products.list` for reads and `products.admin` CREATE/UPDATE/DELETE for mutations. Add a no-strip gateway route before broad product routes so `/api/v1/quantity-sync-rules` reaches the full controller path.

- [ ] **Step 4: Run CRUD unit/MockMvc tests**

  Run: `.\gradlew :services:product-service:test --tests "com.samhanair.logis.product.quantitysync.*" --rerun-tasks --no-build-cache`

  Verify model code/name output and assert the response body has no `id`, `ruleId`, `sourceProductId`, or `targetProductId` fields.

---

### Task 5: Add direct DB probe, H-07/C-09 absence lock, and migration evidence

**Files:**
- Modify: `services/product-service/src/test/java/com/samhanair/logis/product/quantitysync/QuantitySyncRuleDbProbeIT.java`
- Modify: `services/product-service/src/test/java/com/samhanair/logis/product/quantitysync/QuantitySyncRuleSeedAbsenceIT.java`
- Create: `scripts/probe-896-s2-quantity-sync-db.ps1`

**Interfaces:**
- The probe script receives an isolated PostgreSQL container/database, copies SQL files into the container, runs `psql -v ON_ERROR_STOP=1 -f`, and prints row counts before/after each rejected transaction.
- The migration probe applies V1~V24 to a fresh database after `DROP DATABASE`/`CREATE DATABASE` in the isolated container and reports every Flyway migration version plus V24 table/trigger existence.

- [ ] **Step 1: Make the DB probe exercise all eight invariants with direct SQL**

  For each case, insert a valid base graph plus one invalid mutation, `COMMIT`, expect a PostgreSQL exception, then query active counts to prove rollback. Do not use service endpoints or repository saves.

- [ ] **Step 2: Lock H-07/C-09 absence**

  Assert active count is zero for keys or legacy refs matching `H-07`/`C-09`, and assert the V24 migration contains no such inserts. The test must become RED if a future seed adds either configuration.

- [ ] **Step 3: Run the fresh migration probe**

  Run: `powershell -ExecutionPolicy Bypass -File scripts/probe-896-s2-quantity-sync-db.ps1`

  Record the exact `DROP`/`CREATE`, `psql -f`, `ON_ERROR_STOP`, migration count, V24 table count, and trigger rejection output.

---

### Task 6: Document honest snapshot result, sync README, and add CI hard gate

**Files:**
- Create: `docs/dev-reports/2026-07-28-896-s2-quantity-sync-schema.md`
- Modify: `services/product-service/README.md`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- The dev-report records the ordered source reads, snapshot decision, exact Docker/psql provenance output, RED/GREEN commands and output, fresh-PG migration probe, chosen deferred-trigger/duplicate Java validation approach, rejected alternatives, and explicit “실 snapshot 미확보로 시드 미생성”.
- README documents the new API contract, internal UUID boundary, H-07/C-09 legacy ownership, and no-seed provenance.
- CI runs the product-service test task as a hard gate and fails if quantity-sync tests are filtered or skipped; no `continue-on-error` is used for this gate.

- [ ] **Step 1: Add the dev-report from actual captured output only**

  Do not claim skipped Testcontainers tests as passing; distinguish compilation RED, service GREEN, DB probe GREEN, and any Docker/Windows skip.

- [ ] **Step 2: Update the related README**

  Document only the schema/API slice; explicitly state evaluator, shadow, replay, cutover, and chip UI are later slices.

- [ ] **Step 3: Add and run the CI hard gate locally**

  Run: `.\gradlew :services:product-service:test --rerun-tasks --no-build-cache`

  Capture total tests, failures, errors, and skipped count. If Testcontainers skips because Docker is unavailable, report the skip and keep the CI gate configured to fail on skip.

---

## Plan Self-Review

- Spec coverage: V24 schema, eight validations, I-2 direct SQL, H-07/C-09 absence, no-runtime-change boundary, conditional seed refusal, README, dev-report, and CI hard gate are covered by Tasks 1~6.
- Placeholder scan: no seed placeholder or synthetic data is requested; “no snapshot” is an explicit observed outcome, not an unfinished implementation.
- Type consistency: all API product references use `productCode`; internal entities use UUID; schema category uses `COMM_MULTI` while existing Product `COMMERCIAL_MULTI` is mapped only in validation.
- Scope check: no evaluator, shadow, replay, cutover, UI, or protected legacy file is included.
