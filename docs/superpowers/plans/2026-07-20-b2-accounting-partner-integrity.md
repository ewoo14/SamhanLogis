# B2 Accounting Partner Integrity Implementation Plan

> **For agentic workers:** This plan is executed inline in the current workspace. Git commands, commits, branches, pushes, and merges are forbidden by the task request.

**Goal:** Apply accounting V63 to widen the four in-scope `partner_code` columns to `VARCHAR(100)` and persist human-readable, UUID-free tax-invoice partner replacement audit changes.

**Architecture:** Keep V61/V62 and all applied migrations immutable; add only `V63__widen_accounting_partner_code_100.sql`. Align the two affected JPA entities and five request DTOs with the database contract. In `TaxInvoiceService.update`, snapshot `partnerId`, detect changes with `Objects.equals`, and route partner changes through a dedicated audit method that never suppresses equal display strings.

**Tech Stack:** Spring Boot, JPA/Hibernate, Flyway, PostgreSQL/Testcontainers, MockMvc, JUnit 5, AssertJ, Mockito, Gradle.

## Global Constraints

- Scope is accounting-service only: `tax_invoice_batch_exclusions`, `bank_depositor_partner_mapping`, and the two `staging.ecount_*_ledger_raw` tables.
- Applied migrations are immutable; create V63 only.
- The physical staging column is `partner_code`, never `partner_code_snapshot`.
- Partner audit changes use `fieldName = "taxInvoice.partner"` and display values only; UUIDs are forbidden in `changes[*].oldValue/newValue`.
- Same partner UUID with other field changes produces zero partner audit rows; a different UUID produces exactly one partner audit row even when code/name are equal.
- Preserve best-effort audit behavior and existing internal actor/entity UUID storage contracts.
- Do not run git commands or create commits.

## File Map

- Create: `services/accounting-service/src/main/resources/db/migration/V63__widen_accounting_partner_code_100.sql`
- Modify: `TaxInvoiceBatchExclusion.java`, `BankDepositorPartnerMapping.java`, the five request DTOs, `TaxInvoiceService.java`, `.github/workflows/ci.yml`
- Create: `PartnerCodeWidthMigrationIT.java`, `PartnerCodeWidthUpgradeIT.java`, `Mig11LedgerPartnerCodeWidthImportIT.java`, `TaxInvoicePartnerChangeAuditIT.java`
- Modify: `TaxInvoiceServiceTest.java` with focused unit coverage for partner UUID comparison and display fallback.

## Execution Sequence

1. Add the required failing tests for DTO limits, entity flush, V63 fresh/upgrade schema behavior, MIG-11 86-character import, and bidirectional HTTP audit behavior; run the focused tests to confirm RED or the precise missing-fixture failure.
2. Add V63 and the entity/DTO changes; rerun the focused width tests and verify 86/100-character round trips, 101-character validation rejection, preserved rows/indexes, and real MIG-11 import.
3. Add `partnerChanged` snapshot logic and `recordPartnerChanged`; rerun `TaxInvoiceServiceTest` and the real Spring/Postgres audit IT, checking zero/one row behavior and UUID-free display values.
4. Register all four exact IT classes and their skipped=0/test-count/failure/error gates in the accounting CI job; run the requested focused Gradle command and the full accounting-service test task.
5. Inspect the final file list and test reports without using git; report only observed execution results.
