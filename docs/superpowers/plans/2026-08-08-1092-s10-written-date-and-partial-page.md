# S10 Written Date Field and Partial Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the order-list `submittedAt` contract, add additive `createdAt` semantics for the unified list, and preserve successful pages when a later page fails while exposing incompleteness.

**Architecture:** Keep backend query filtering and ordering on `COALESCE(confirmedAt, createdAt)). Expose both timestamps in the summary DTO, mapping `submittedAt` only from `confirmedAt` and `createdAt` from the audit field. In the desktop client, make page aggregation return successful content plus an incompleteness flag, then render successful rows and a warning banner.

**Tech Stack:** Java/Spring records and JUnit/AssertJ; TypeScript/React/Vitest/Testing Library.

## Global Constraints

- Do not change the existing `COALESCE(confirmedAt, createdAt)` query filter/order.
- Do not expose UUIDs or 담당/actor identifiers.
- Do not modify the pre-existing estimate-table `—` cells.
- Do not restart Docker, write to the database, commit, or push.
- Preserve existing consumers of `submittedAt` as sent/confirmed time.

### Task 1: Backend timestamp contract

**Files:**
- Modify: `services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/web/dto/PartnerOrderResponseTest.java`
- Modify: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/dto/PartnerOrderSummaryResponse.java`
- Modify: affected constructor call sites/tests only if compilation requires the additive field

**Interfaces:**
- Produces `PartnerOrderSummaryResponse.createdAt(): LocalDateTime`.
- Preserves `submittedAt(): LocalDateTime) as `PartnerOrder.getConfirmedAt()`.

- [ ] Write a failing test asserting a DRAFT summary has `submittedAt() == null` and `createdAt()) equal to its created audit timestamp.
- [ ] Run the focused DTO test and confirm failure because the field/mapping is absent.
- [ ] Add `createdAt` additively, keep the compatibility constructor, and map timestamps independently.
- [ ] Run the focused DTO test and confirm it passes.

### Task 2: Unified model written date

**Files:**
- Modify: `clients/desktop/src/renderer/api/sales.ts`
- Modify: `clients/desktop/src/renderer/routes/estimateUnifiedListModel.ts`
- Modify: `clients/desktop/src/renderer/routes/estimateUnifiedListModel.test.ts`
- Modify: `clients/desktop/src/renderer/routes/EstimateListPage.test.tsx` if fixture typing requires the additive field

**Interfaces:**
- `PartnerOrderSummary.createdAt: string | null`.
- Unified order rows use `createdAt) for `writtenAt`; `submittedAt) remains available for sent-date consumers.
- Estimate/order rows remain cross-sorted by their displayed `writtenAt) values.

- [ ] Add RED-A/B/C assertions: draft sent date is null, unified written date uses created date for all order rows, and mixed estimate/order ordering remains chronological.
- [ ] Run focused model/page tests and confirm the new assertions fail.
- [ ] Implement the additive type, normalizer mapping, and model mapping.
- [ ] Run focused tests and confirm they pass.

### Task 3: Partial page retention and incomplete warning

**Files:**
- Modify: `clients/desktop/src/renderer/routes/EstimateListPage.tsx`
- Modify: `clients/desktop/src/renderer/routes/EstimateListPage.test.tsx`

**Interfaces:**
- Internal page aggregation returns `{ items: T[]; incomplete: boolean }`.
- A failed later page does not discard earlier successful page content.
- Unified query retains successful rows and reports an error banner for the affected source.

- [ ] Add a RED test where page 0 resolves with content and page 1 rejects; assert page-0 rows remain and the UI announces incomplete data.
- [ ] Run the focused page test and confirm it fails because the current promise rejects the whole source.
- [ ] Aggregate pages with per-page settled results and preserve fulfilled contents; combine per-source incomplete status into the existing error banner.
- [ ] Run the focused page test and confirm it passes.

### Task 4: Regression verification and report

**Files:**
- Modify: `docs/dev-reports/2026-08-08-1092-s10-written-date-field-and-partial-page.md`

- [ ] Run backend DTO tests, focused FE tests, and the full FE test suite required by the existing package scripts.
- [ ] Re-enumerate every repository production consumer of `submittedAt), including labels, and record an impact table.
- [ ] Record RED-A/B/C, partial-page RED, RED-D preservation checks, new-file list, and `git diff --stat` deletion lines.
- [ ] Report that backend redeployment is required and that Docker was not restarted.

