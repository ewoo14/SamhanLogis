# PR #1132 세트 기본 구성품 지정 Implementation Plan

> **For agentic workers:** This plan is executed inline in the current worktree. Do not commit or perform git history operations.

**Goal:** 모든 BUNDLE 전개를 `is_default=true` 구성품만 사용하는 단일 규칙으로 수렴시키고, 현재 기본 구성품 0건인 대상 행만 감사 가능한 V37 마이그레이션으로 기본 지정한다.

**Architecture:** product-service V37은 활성 BUNDLE 중 활성 기본 구성품이 없는 부모와 그 활성 구성품을 구성품 행 전용 감사 테이블에 기록·갱신한다. `BundleExpander`는 부모의 수기 편집 여부와 무관하게 기본 구성품만 읽으며, 기존 수기 편집 표식은 시트 동기화 보존 용도로만 유지한다.

**Tech Stack:** Spring Boot 3, Java 17, PostgreSQL/Flyway, JUnit 5, AssertJ, Gradle, Docker Testcontainers.

## Global Constraints

- 대상 조건은 `products.is_deleted=false`, `status='ACTIVE'`, `product_type='BUNDLE'`, 활성 구성품 중 `is_default=true` 없음이다.
- 대상 밖의 BUNDLE은 갱신하지 않으며, 현재 실측 대상은 72세트·137활성 구성품이다.
- V37은 시드별 건수 차이로 실패하지 않고 조건에 맞는 행만 처리하며 처리 건수와 감사 행으로 결과를 남긴다.
- `bundle_components_manual`은 시트 동기화 보존 표식으로만 사용하고 전개 정책으로 사용하지 않는다.
- V36은 수정·되돌리지 않는다.
- RED-A 원문을 먼저 확보하고, 생산 서비스 배포본(#1126)을 PR 백엔드 검증 근거로 사용하지 않는다.
- 사용자 금지사항에 따라 commit, push, checkout, pull, redeploy, container restart, live DB 직접 UPDATE를 하지 않는다.

### Task 1: RED-A 및 사전 실측

**Files:**
- Read: `services/product-service/src/main/java/com/samhanair/logis/product/service/BundleExpander.java`
- Read: `services/slip-service/src/main/java/com/samhanair/logis/slip/client/ProductClient.java`
- Read: `services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/service/EstimateService.java`
- Read: `services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipService.java`
- Read: `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductSheetSyncService.java`

- [ ] Execute read-only product DB SELECTs for target sets, target components, and non-target 271 BUNDLE sets; save exact stdout in the final report.
- [ ] Execute the existing isolated `BundleExpanderIT` baseline and record the unmodified compatibility result as RED-A evidence, clearly labeling it isolated Testcontainers rather than live #1126.
- [ ] Check product audit tables and sync write paths; inspect PR #1131-related files without editing them.
- [ ] Check existing slip/estimate saved-line tests and current stored sale-slip rows; record 2 slips, 3 lines, VAT-included 15,242,370원.

### Task 2: V37 conditionally backfill with audit

**Files:**
- Create: `services/product-service/src/main/resources/db/migration/V37__mark_active_bundle_components_default.sql`
- Test: `services/product-service/src/test/java/com/samhanair/logis/product/it/BundleComponentDefaultBackfillMigrationIT.java`

- [ ] Write a failing migration regression test for a 72-parent/137-component fixture: it must record 137 prior false values and update only those rows; a non-target BUNDLE must remain unchanged.
- [ ] Run the test and verify failure before adding V37.
- [ ] Document why `product_audit_logs` is not reused: it is Product-revision-coupled, lacks component-row identity and rollback state, and would create false Product revisions.
- [ ] Add a dedicated row-level audit table with component id, parent model code, component code, previous value, reason, migration key, applied timestamp, rollback timestamp, and rollback actor.
- [ ] Add a V37 CTE selecting only active, non-deleted BUNDLE parents with no active default component. Insert selected rows into the audit table before updating `is_default=true`.
- [ ] Make V37 a no-op for zero matching rows so fresh/alternate seeds boot; never hard-fail on counts other than 72/137.
- [ ] Update only rows present in the V37 audit batch and preserve all other component fields.
- [ ] Run the migration regression test and verify it passes.

### Task 3: Remove expansion exceptions with TDD

**Files:**
- Modify: `services/product-service/src/main/java/com/samhanair/logis/product/service/BundleExpander.java:98-113`
- Modify: `services/product-service/src/test/java/com/samhanair/logis/product/it/BundleExpanderIT.java` (RED-A and mutation guards)

- [ ] Change the RED-A test first so an EXPAND BUNDLE with only false components expects zero lines; run it and capture the expected failure under the current fallback.
- [ ] Remove `allowLegacyNoDefaultFallback` and filter active components only by `is_default=true`.
- [ ] Keep `bundleComponentsManual` untouched in sync/domain code and add a test proving manual=true does not alter expansion once defaults exist.
- [ ] Run the focused BundleExpander tests and verify GREEN.

### Task 4: RED-B verification and report artifacts

**Files:**
- Modify: `docs/dev-reports/2026-08-11-1089-bundle-default-diagnosis.md` or create a new PR #1132 report alongside it
- Modify: `docs/handoff/CURRENT-WORK.md` only if required by the final handoff

- [ ] Verify A-1 quote save, A-2 sales-slip save, and A-3 expanded component equality in isolated service tests or an explicitly labeled local clone; do not claim live #1126.
- [ ] Verify B-1 271-set non-change by before/after SELECT and migration audit exclusion.
- [ ] Verify B-2 S discount 495,000→420,750 and B-3 NULL classification/167 item-DC invariants using existing focused tests.
- [ ] Verify B-4 REMEMBERED and USER price precedence using existing price-memory tests.
- [ ] Verify B-5 stored 2 slips/3 lines and VAT-included 15,242,370원 by read-only SELECT before and after; no rewrite of saved lines.
- [ ] Include exact V37 rollback SQL that restores only rows recorded by the audit batch and leaves audit evidence.
- [ ] Run final verification commands and report changed files, line counts, new files, RED/GREEN/mutation stdout, counts, sync behavior, audit-schema decision, and PR #1131 conflict findings.
