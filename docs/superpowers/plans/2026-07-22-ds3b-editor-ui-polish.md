# DS-3b Editor UI Polish Implementation Plan

> **For agentic workers:** This plan is executed inline in the current worktree. Git commands are prohibited by the developer request, so no commit step will be performed.

**Goal:** Improve DS-3b document-template editor and admin-list layout for desktop and mobile while preserving all existing behavior, QA selectors, and print output.

**Architecture:** Add one editor-scoped global stylesheet for responsive layout and visual tokens, then attach stable classes to the existing route/components. Keep the editor preview DOM and shared `PrintLayout/.paper` untouched; scope screen-only A4 containment under the editor preview wrapper. Keep the admin list as a real `<table>` at every viewport and use CSS-only visual cards on narrow screens.

**Tech Stack:** React 18, TypeScript, CSS custom properties from `@samhan/design-system`, Vitest, existing Playwright selector contracts (inspection only).

## Global Constraints

- Keep all real-QA aria labels, form labels, button names, and testids unchanged.
- Keep editor UI and newly added editor wrappers `no-print`; keep preview document content printable.
- Use no new hard-coded colors; use `var(--color-*)`, spacing, radius, typography, and shadow tokens.
- At `>=1100px`, retain a reachable 3-pane editor with `minmax(0, ...)` and `min-width:0` safeguards.
- At `<1100px`, use a no-fixed-min-width vertical stack: palette → band canvas → inspector → preview.
- At `<700px`, make the admin list visually card-like without removing the semantic `<table>` or its `table` role.
- Do not alter validation, save, lock, approval-grid, geometry, or mutation behavior.
- Do not run Playwright and do not run git commands.

## `.paper` impact inventory

The shared `PrintLayout`/`.paper` surface is consumed by these non-editor screens: ExternalDispatchRequestView, InvoiceView, NextDaySlipView, PartnerLedgerView, PurchaseSlipPrintPage, QuoteView, SalesInvoicePrintPage, SalesTransactionStatementPrintPage, StatementBatchView, TaxInvoiceView, and the accounting print layouts BalanceSheet, CashFlowStatement, CorporateTaxReport, DailySummary, EquityChanges, IncomeStatement, MonthlySummary, PartnerAging, and VatReport. The implementation will not modify global `.paper` rules; only `.document-template-preview .paper` under the editor route receives screen containment rules.

### Task 1: Add editor-scoped responsive stylesheet

**Files:**
- Create: `clients/desktop/src/renderer/components/documentTemplate/documentTemplateEditor.css`
- Modify: `clients/desktop/src/renderer/routes/DocumentTemplateEditorPage.tsx` (import stylesheet and attach classes)

- [ ] Add token-only base styles for editor form, panes, card surfaces, preview viewport, and print reset.
- [ ] Add `@media (max-width: 1099px)` stack rules with no fixed minimum width.
- [ ] Add `@media (max-width: 639px)` single-column top form rules.
- [ ] Add `@media print` rules that hide editor UI already marked `no-print`, restore preview layout to print flow, and do not change shared `.paper` dimensions.
- [ ] Run the required typecheck after the route class changes.

### Task 2: Improve palette, band canvas, and inspector visual hierarchy

**Files:**
- Modify: `clients/desktop/src/renderer/components/documentTemplate/ElementPalette.tsx`
- Modify: `clients/desktop/src/renderer/components/documentTemplate/BandCanvas.tsx`
- Modify: `clients/desktop/src/renderer/components/documentTemplate/ElementInspector.tsx`

- [ ] Preserve each existing region name and action name while attaching classes.
- [ ] Make palette actions wrap on narrow cards.
- [ ] Add band header metadata and selected-element text without changing element button accessible names.
- [ ] Add a selected-element summary in the inspector section while preserving all existing labels and controls.
- [ ] Replace default fieldset/legend appearance via classes only; keep the semantic elements and labels.
- [ ] Run the targeted component/template Vitest command after the component edits.

### Task 3: Improve editor form, preview containment, and mobile order

**Files:**
- Modify: `clients/desktop/src/renderer/routes/DocumentTemplateEditorPage.tsx`

- [ ] Replace the narrow single-column form wrapper with a responsive two-column form wrapper; keep `문서 유형` and `양식명` labels unchanged.
- [ ] Preserve `data-testid="document-template-editor-scroll"` while replacing the fixed 824px minimum with responsive classes.
- [ ] Keep desktop grid columns explicit and min-content-safe; use mobile stack order palette → canvas → inspector → preview.
- [ ] Scope A4 containment to `.document-template-preview .paper` only.
- [ ] Keep all save/status/lock/list controls in `no-print` wrappers.
- [ ] Inspect the final JSX against both real-QA specs and verify no selector string changed.

### Task 4: Make the admin list responsive without losing table semantics

**Files:**
- Create: `clients/desktop/src/renderer/routes/GroupwareDocumentTemplateAdminPage.css`
- Modify: `clients/desktop/src/renderer/routes/GroupwareDocumentTemplateAdminPage.tsx`

- [ ] Add classes to the existing section, header, table, rows, cells, and action group.
- [ ] Add `data-label` attributes for narrow-screen visual labels without changing visible field names or QA selectors.
- [ ] At `<700px`, style rows/cells as cards but keep the actual table DOM and implicit `table` role intact; verify with role reasoning rather than replacing it with divs.
- [ ] Preserve navigate, activate/deactivate, delete, and Modal behavior.

### Task 5: Verify required behavior and contracts

**Files:**
- Inspect only: the two real-QA specs and all changed TSX/CSS files.

- [ ] Run `npm run typecheck` from `clients/desktop` and record full output.
- [ ] Run `npx vitest run src/renderer/print src/renderer/components/documentTemplate` from `clients/desktop` and record full output.
- [ ] Confirm `.paper` changes are editor-scoped and list the inventory in the final report.
- [ ] Confirm selector strings are unchanged by comparing the changed TSX with both specs.
- [ ] Perform code-based reachability review for `>=1100px` and `<1100px`: add, select, coordinate edit, style edit, delete, save, and list return.
- [ ] Report any unverified visual/runtime items honestly; do not claim Playwright execution.

