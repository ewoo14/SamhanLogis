# Actor Display Fix2 Implementation Plan

> **For agentic workers:** This plan is executed inline in the existing isolated worktree. Git commands are prohibited by the task owner.

**Goal:** Make actor display resolution a closed structural boundary, close Unicode UUID variants by normalization, and restore auth permission actorId traceability without exposing UUIDs.

**Architecture:** The Java and TypeScript display helpers remain the only display-name boundary. Their comparison contract normalizes Unicode NFKC, removes every Unicode format character, folds UUID punctuation/confusables, and then rejects UUID-shaped values. Existing app-specific helpers become adapters to that boundary. A source architecture test scans every in-scope renderer/mobile/print file and fails on raw actor display reads or local masking, with a mutation fixture proving a new exit is RED. Auth permission rows carry a separate internal actor_id UUID through role, account, template, copy, bulk, and materialization paths.

**Tech Stack:** Java 17/Spring Boot/JPA/Flyway/JUnit/Mockito; TypeScript/React/React Native/Vitest/Jest; PowerShell and Node test runners; Playwright with isolated PostgreSQL for live QA.

## Global Constraints

- Display strings must not expose UUIDs; internal actorId/callerId/soft-delete keys remain available for joins and audit lookup.
- Existing `변경자 미상` remains the unknown display; `system` becomes `시스템` only at display boundaries.
- Normal names remain unchanged.
- No shared DB login or write; all live QA uses an isolated PostgreSQL and dedicated service ports.
- QA specs use `-real-qa` in both directory and filename and screenshots go through `resolveQaShotsDir()`.
- No git add/commit/checkout/merge/push/reset commands.

---

### Task 1: Lock the normalization contract RED

**Files:**
- Modify: `shared/common/src/main/java/com/samhanair/logis/common/security/ActorDisplayName.java`
- Test: `shared/common/src/test/java/com/samhanair/logis/common/security/ActorDisplayNameTest.java`
- Modify: `clients/web/design-system/src/utils/actorName.ts`
- Test: `clients/web/design-system/src/utils/actorName.test.tsx`
- Modify/Test: RN actor display adapters under `clients/mobile-staff/src/utils/` and `clients/arologis-mobile/src/utils/`

- [ ] Add U+2063, fullwidth/Unicode punctuation, and Latin-lookalike UUID fixtures; run focused BE/FE/RN tests and capture the expected RED.
- [ ] Implement one normalization algorithm per runtime: NFKC, `Cf` removal, dash/colon folding, UUID confusable folding, then UUID/URN/raw32 detection.
- [ ] Re-run focused tests GREEN and preserve names, unknown label, and SYSTEM display behavior.

### Task 2: Make every display exit use the boundary

**Files:**
- Modify: `clients/desktop/src/renderer/utils/maskCreatedBy.ts`
- Modify: `clients/arologis-desktop/src/renderer/utils/maskCreatedBy.ts`
- Modify: desktop deleted-row display helpers, mobile `AuditOverlay`, slip response sanitizers, and `QuoteView`.
- Test: focused helper/component/print/API tests for each exit.

- [ ] Write focused RED tests for mobile, arologis, deleted badge/title/aria, slip audit/version/redline/photo, SYSTEM history, and quote print.
- [ ] Route all display values through the shared resolver contract; retain raw IDs only in internal fields and color/hash/path uses.
- [ ] Run focused tests GREEN and typechecks for all affected clients/services.

### Task 3: Add the structural exit guard and mutation proof

**Files:**
- Create: `clients/desktop/scripts/actor-display-boundary.test.cjs`
- Test: `clients/desktop/scripts/actor-display-boundary.test.cjs`
- Modify: `clients/desktop/package.json` if needed to run the guard in normal test/typecheck scope.

- [ ] Define the in-scope renderer/mobile/arologis/print roots and forbidden raw actor display member patterns.
- [ ] Assert each declared display-name DTO field has a resolver import/use at its final renderer boundary.
- [ ] Add an intentionally invalid temporary fixture/new exit, run the guard, record the exact RED output, remove the fixture, and run GREEN.
- [ ] Assert a normal resolver-backed fixture is accepted to demonstrate the guard is not over-sensitive.

### Task 4: Restore auth actorId traceability

**Files:**
- Create: auth Flyway migration after current head adding internal `actor_id UUID` to role/account/template/effective permission tables.
- Modify: auth permission entities, `DynamicPermissionService`, `AccountPermissionService`, `EffectivePermissionMaterializer`.
- Test: auth service unit/IT tests covering role grant, account matrix, template, copy, bulk, materialized rows, and display-safe logs.

- [ ] Write RED tests asserting persisted permission rows retain the supplied actor UUID while log/UI strings do not contain it.
- [ ] Add internal actorId fields/setters and propagate the UUID through every permission mutation path, including materialization.
- [ ] Verify transaction-end repository/entity values and reverse lookup by actorId; leave JPA `system-internal` audit token semantics unchanged.

### Task 5: Verify and report

- [ ] Run focused tests, affected module builds/typechecks, and the structural guard.
- [ ] Run isolated PostgreSQL + dedicated services for the five original screens plus mobile/arologis/deleted badge/slip API/print evidence; never touch shared DB.
- [ ] Confirm cleanup of owned processes/ports/container only.
- [ ] Write `docs/dev-reports/2026-08-12-1163-fix2.md` with RED-A, RED-B, mutation RED 원문, structural rationale, QA evidence, and limitations.
