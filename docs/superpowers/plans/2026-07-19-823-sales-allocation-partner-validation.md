# #823 Sales Allocation Partner Validation Implementation Plan

> **For agentic workers:** Execute task-by-task with test-first RED→GREEN checkpoints. This session is file-only; do not run git commands or create commits.

**Goal:** Make sales and purchase accounting allocation headers derive partner identity from allocation sources, and make backend snapshot partner code/name authoritative alongside partnerId.

**Architecture:** The desktop allocation row retains the source slip's partner tuple. Each form resolves one partner tuple from allocated rows and refuses submit when it is missing or mixed. The accounting services preflight the first source, create the header from that snapshot's partner tuple, then validate every source against the request partnerId while ignoring client-supplied code/name.

**Tech Stack:** React/TypeScript, Vitest + Testing Library, Spring Boot/Java records, JUnit/Spring MockMvc/Testcontainers.

## Global Constraints

- Use the existing contract at `docs/specs/823-sales-allocation-partner-validation-spec.md` v3.
- Do not add a database migration; `partner_code` and `partner_name` already exist on slip headers.
- Keep `SAS_SOURCE_PARTNER_MISMATCH` and `SAS_SOURCE_PARTNER_MISSING` as 422 responses.
- Preserve UUID privacy in user-visible UI; UUIDs are internal payload values only.
- Run FE verification with `npm run typecheck` and `npm run test` only.
- Run BE verification with `./gradlew :services:slip-service:test :services:accounting-service:test --rerun-tasks --no-build-cache` as a standalone command.
- Do not run git commands, make commits, or alter migration files.

### Task 1: Add FE contract RED tests

**Files:**
- Create: `clients/desktop/src/renderer/routes/accounting/SalesPurchaseAccountingSlipAllocationContract.test.tsx`
- Modify: `clients/desktop/src/renderer/components/SlipLineAllocationEditor.tsx` only if test seams require exported pure helpers; no production behavior before RED.

**Interfaces:**
- Consume the two form pages and the source API mock.
- Capture `createSalesSlipDraft` and `createPurchaseSlipDraft` request bodies after source lookup and range allocation.

- [ ] Render each page in jsdom with mocked source lookup and mutation APIs.
- [ ] Allocate two same-partner source rows and assert `header.partnerId === source.partnerId`, with code/name copied from the source.
- [ ] Render a mixed-partner source case and assert submit is blocked and the mutation is not called.
- [ ] Run the new test before production changes and record the expected RED failure caused by the current `fallbackUuid`/missing row partner fields.

### Task 2: Fix FE source propagation and header derivation

**Files:**
- Modify: `clients/desktop/src/renderer/components/SlipLineAllocationEditor.tsx`
- Modify: `clients/desktop/src/renderer/routes/accounting/SalesAccountingSlipFormPage.tsx`
- Modify: `clients/desktop/src/renderer/routes/accounting/PurchaseAccountingSlipFormPage.tsx`

**Interfaces:**
- `AllocationEditorRow` gains nullable `partnerId`, `partnerCode`, and `partnerName`.
- Add a resolver that returns one complete partner tuple or a missing/multiple status.

- [ ] Copy the three source partner fields in `toEditorRows`.
- [ ] Derive the header tuple from allocated rows; remove both `fallbackUuid` helpers and all fallback UUID calls.
- [ ] Disable submit and show an actionable message for no source partner or mixed partners.
- [ ] Make the request body use resolved source partnerId/code/name and rerun the focused FE contract test GREEN.

### Task 3: Extend producer/consumer snapshot contract

**Files:**
- Modify: `services/slip-service/src/main/java/com/samhanair/logis/slip/web/dto/SlipLineSnapshot.java`
- Modify: `services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipInternalController.java`
- Modify: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/SlipLineSnapshot.java`
- Modify: `services/accounting-service/src/test/java/com/samhanair/logis/accounting/client/SlipServiceClientTest.java`
- Modify: `services/slip-service/src/test/java/com/samhanair/logis/slip/it/SlipInternalControllerIT.java`

**Interfaces:**
- Snapshot record order becomes `slipId, slipNo, lineId, partnerId, partnerCode, partnerName, productName, quantity, unitPrice, lineTotal, slipStatus, slipType`.
- Producer maps `slip.getPartnerCode()` and `slip.getPartnerName()` directly.

- [ ] Add code/name to both records and retain unknown-field/legacy-null deserialization coverage.
- [ ] Update producer response assertions and contract fixtures with non-null source partner values.
- [ ] Run the targeted slip/contract tests and fix only positional constructor or fixture mismatches.

### Task 4: Make accounting snapshot identity authoritative

**Files:**
- Modify: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/SalesAccountingSlipCreateAttemptService.java`
- Modify: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/PurchaseAccountingSlipCreateAttemptService.java`
- Modify: all `new SlipLineSnapshot(...)` call sites under `services/accounting-service/src/test`

**Interfaces:**
- Both create services preflight the first allocation source, create the accounting header with `src.partnerId()/partnerCode()/partnerName()`, and continue source validation with the request partnerId.
- Client `partnerCode` and `partnerName` are never used as stored header authority.

- [ ] Add failing service/IT assertions proving a client code/name mismatch is stored as the source snapshot code/name.
- [ ] Update every positional constructor with code/name fixture values; count and report all call sites.
- [ ] Rename rollback tests to “preflight failure leaves slip unsaved” semantics while preserving the atomicity assertion.
- [ ] Run targeted accounting tests and then the required accounting/slip full command.

### Task 5: Align FE/BE mocks and final verification

**Files:**
- Modify: `clients/desktop/src/renderer/api/slipAllocationSourceApi.ts`
- Modify: `clients/desktop/src/renderer/api/salesAccountingSlipApi.ts`
- Modify: `clients/desktop/src/renderer/api/purchaseAccountingSlipApi.ts` if parity coverage requires it.
- Modify: `clients/desktop/src/renderer/api/mock.test.ts`

**Interfaces:**
- Mock allocation sources use valid non-null UUID-shaped partnerId plus matching code/name.
- Mock sales/purchase draft paths preserve 422 mismatch/missing parity at the API boundary.

- [ ] Replace null source partnerId fixtures with deterministic valid UUIDs and assert source partner tuple consistency.
- [ ] Add mock request tests for valid source, mismatch, and missing partner behavior without weakening BE contract assertions.
- [ ] Run `cd clients/desktop && npm run typecheck`.
- [ ] Run `cd clients/desktop && npm run test`.
- [ ] Run `./gradlew :services:slip-service:test :services:accounting-service:test --rerun-tasks --no-build-cache` alone and inspect skipped/failure counts.
- [ ] Confirm no migration file was added or modified and report remaining issues with evidence.
