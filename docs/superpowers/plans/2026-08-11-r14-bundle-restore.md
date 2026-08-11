# R14 Bundle Restore Implementation Plan

> **For agentic workers:** This plan is executed inline in the current worktree. Git commit/push/merge and shared-DB writes are forbidden.

**Goal:** Restore legacy BUNDLE revisions without inferring instance ownership from row order, while keeping ambiguous real-world revisions restorable.

**Architecture:** Keep `BundleSetInstanceKeyPolicy` as the single policy used by Slip and Estimate. For keyless multi-head parents, build a signature from the five non-key `BundleSetOptions` values and assign one generated key per unique head signature, independent of row order. If a signature is duplicated or a child cannot match a head, preserve the keyless rows, emit a warning, and let restore continue. Compute policy output before domain mutation so a future strict validation cannot partially mutate a Slip or Estimate.

**Tech Stack:** Java, JUnit 5, AssertJ, Spring Boot/Gradle, PostgreSQL read-only inspection through Docker.

## Global Constraints

- Do not modify `PartnerProductPriceMemoryIT.java`.
- Do not write to the shared database, deploy, or perform git operations.
- Keep the policy definition in one common class and invoke it from both Slip and Estimate restore paths.
- Preserve existing keyed options byte-for-byte and preserve single keyless legacy behavior.
- Preserve V119, existing QA files, quantity/deletion contracts, and R10 creation behavior.
- Run the complete `slip-service` test task after focused tests.

---

### Task 1: Capture the current cross-order defect and policy contract

**Files:**
- Modify: `services/slip-service/src/test/java/com/samhanair/logis/slip/service/BundleSetInstanceKeyPolicyTest.java` if present, otherwise create it.
- Modify: `services/slip-service/src/test/java/com/samhanair/logis/slip/domain/SlipRestoreTest.java`.
- Modify: `services/slip-service/src/test/java/com/samhanair/logis/slip/estimate/revision/service/EstimateRestoreTest.java`.

**Interfaces:**
- Test `BundleSetInstanceKeyPolicy.materializeLegacyMultiInstanceKeys` with two heads followed by crossed children.
- Test Slip and Estimate restore use the common policy and preserve restore behavior.

- [ ] Add the smallest policy RED for `head-A, head-B, child-A, child-B`, asserting the desired signature grouping.
- [ ] Run only that test and record the existing failure showing `[[head-A], [head-B, child-A, child-B]]`.
- [ ] Add symmetric Slip and Estimate restore cases plus atomic-state assertions for ambiguous input.

### Task 2: Implement order-independent signature materialization

**Files:**
- Modify: `services/slip-service/src/main/java/com/samhanair/logis/slip/service/BundleSetInstanceKeyPolicy.java`.

**Interfaces:**
- Keep `materializeLegacyMultiInstanceKeys(List<T>, Function<T,String>, Predicate<T>, Function<T,BundleSetOptions>)`.
- Signature components are `remoteOption`, `remoteExcluded`, `panelOption`, `panelShape360`, and `materialIncluded`; `instanceKey` is excluded.

- [ ] Build parent-local keyless head signature groups without using row adjacency.
- [ ] Assign generated keys by signature only when every keyless head signature is unique and every keyless child signature matches exactly one head signature.
- [ ] Preserve keyless rows and emit a warning for duplicate or unmatched signatures instead of throwing.
- [ ] Leave existing keyed rows untouched and preserve single-head/headless legacy behavior.
- [ ] Run the policy tests until green.

### Task 3: Make Slip and Estimate restore policy-first

**Files:**
- Modify: `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/Slip.java`.
- Modify: `services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/domain/Estimate.java`.

- [ ] Compute materialized options immediately after non-mutating guards and before header assignment, line deletion, or collection clear.
- [ ] Use the computed list while recreating lines for both domains.
- [ ] Add tests that ambiguous restore succeeds, retains keyless options, and leaves existing state unchanged if policy validation throws in future.
- [ ] Run Slip and Estimate restore tests.

### Task 4: Exercise the requested combinations and regressions

**Files:**
- Modify or create focused tests under `services/slip-service/src/test/java/com/samhanair/logis/slip/service/`, `.../slip/domain/`, and `.../slip/estimate/`.
- Create: `docs/dev-reports/2026-08-11-1131-r14-fix.md`.

- [ ] Cover contiguous, crossed, head-last, three-or-more interleaved instances, child-only, same-model/same-option duplicate signatures, keyed+keyless, interleaved parents, reordered input, Slip restore, Estimate restore, and post-restore behavior.
- [ ] Run all tests referencing changed files, then the full `services:slip-service:test` task.
- [ ] Report the read-only DB counts, signature definition, RED originals, combination matrix, test output, and new files.

### Task 5: Verify constraints before handoff

- [ ] Confirm `PartnerProductPriceMemoryIT.java` is unchanged.
- [ ] Confirm no shared DB write, git operation, deploy, migration, or `samhan-*` mutation occurred.
- [ ] Confirm existing `docs/qa` files were not deleted, moved, or overwritten.
- [ ] Re-read the report and verify every requested RED-B target and full-test result is represented.
