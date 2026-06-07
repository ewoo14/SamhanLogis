# D-LOAD-04 Fix5 Numbering Family Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Protect all discovered daily or prefix-based business-number generators from concurrent duplicate numbers.

**Architecture:** Reuse the fix4 `SlipNumberService` pattern where a sequence helper table already exists: `INSERT ... ON CONFLICT DO NOTHING` followed by `PESSIMISTIC_WRITE` row locking. For services without sequence helper tables, serialize the existing `max/count+1` calculation with PostgreSQL advisory transaction locks and keep existing unique indexes as the final guard.

**Tech Stack:** Spring Boot 3.3, Java 17, JPA repositories, PostgreSQL advisory locks, Testcontainers IT compile coverage.

---

### Task 1: Slip Estimate Number Locking

**Files:**
- Modify: `services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/repository/EstimateNumberSequenceRepository.java`
- Modify: `services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/service/EstimateNumberService.java`
- Test: `services/slip-service/src/test/java/com/samhanair/logis/slip/estimate/it/EstimateNumberServiceIT.java`

- [ ] **Step 1: Write the parallel uniqueness IT**

Create `EstimateNumberServiceIT` with 8 parallel callers against the same `LocalDate`, asserting no duplicate `estimateNo` and exact sequence set `1..8`.

- [ ] **Step 2: Add locked repository methods**

Add `findLockedByEstimateDate(LocalDate)` using `@Lock(PESSIMISTIC_WRITE)` and `insertIfAbsent(UUID, LocalDate)` native `ON CONFLICT (estimate_date) DO NOTHING`.

- [ ] **Step 3: Use locked load/create in service**

Change `EstimateNumberService.next()` to call `loadOrCreateLockedSequence()` before `seq.next()`, with Korean Javadoc documenting the D-LOAD-04 race.

### Task 2: Accounting Sequence Services

**Files:**
- Modify: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/repository/JournalNumberSequenceRepository.java`
- Modify: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/repository/TaxInvoiceNumberSequenceRepository.java`
- Modify: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/JournalNumberService.java`
- Modify: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/TaxInvoiceNumberService.java`
- Test: `services/accounting-service/src/test/java/com/samhanair/logis/accounting/it/AccountingNumberServiceIT.java`

- [ ] **Step 1: Write the accounting parallel uniqueness IT**

Add two 8-worker tests: one for `JournalNumberService.next(date)`, one for `TaxInvoiceNumberService.next(date)`.

- [ ] **Step 2: Apply the same sequence-table locking pattern**

Add locked lookup and `insertIfAbsent` methods for `journal_number_sequences` and `tax_invoice_number_sequences`, then update both services.

### Task 3: Inventory Transfer Number Serialization

**Files:**
- Modify: `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/StockTransferService.java`
- Test: `services/inventory-service/src/test/java/com/samhanair/logis/inventory/service/StockTransferNumberServiceIT.java`

- [ ] **Step 1: Write the parallel transfer number IT**

Call package-visible `nextTransferNo(LocalDate)` from 8 workers and assert no duplicates plus sequence set `1..8`.

- [ ] **Step 2: Serialize max+1 calculation**

Inject `EntityManager` and take `pg_advisory_xact_lock(hashtext('stock_transfer_seq_' + prefix))` before `findMaxSequenceByTransferNoPrefix(prefix)`.

### Task 4: Batch And Dispatch Disposition

**Files:**
- Modify: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/TaxInvoiceBatchService.java`
- Modify: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/HometaxExportService.java`
- Modify: `services/slip-service/src/main/java/com/samhanair/logis/slip/service/dispatch/DispatchTaskService.java`
- Test: reuse compile coverage for private methods; no direct IT unless public service workflow fixtures are required.

- [ ] **Step 1: Serialize batch count+1**

Add `EntityManager` advisory locks around `TIB-yyyyMM-NNN` generation in both batch services.

- [ ] **Step 2: Serialize dispatch task probing**

Add `EntityManager` advisory lock around `generateTaskCode(LocalDate)` before the first missing counter probe.

### Task 5: Verification And Report

**Files:**
- Add: `docs/dev-reports/d-load-04-fix5-numbering-family-sweep.md`

- [ ] **Step 1: Write the disposition table**

Document every discovered path with `경로 | 채번 방식 | 동시성 안전 여부 | 처분`.

- [ ] **Step 2: Run compile-only verification**

Run `compileJava` and `compileTestJava` only; do not run git or Docker commands.
