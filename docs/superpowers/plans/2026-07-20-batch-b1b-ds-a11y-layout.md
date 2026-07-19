# Batch B1-B DS A11y/Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the GO-approved D-B1B-01~03 contract for semantic a11y ownership, opaque Warehouse option IDs, and non-clipping Partner/Product match badges, with hard Vitest and CI-included Playwright gates.

**Architecture:** Keep LineRow and EstimateLineRow as visual grid primitives without orphaned `row`/`cell` semantics; expose price-source and changed-state descriptions from the price input as one IDREF chain. Keep Warehouse’s domain ID for React keys and callbacks while using an index-based opaque DOM ID. Split highlighted text and badges into flex siblings so only text truncates.

**Tech Stack:** React 18, TypeScript, Vitest + Testing Library, Playwright 1.59, `@axe-core/playwright`, CSS modules, Vite mock renderer.

## Global Constraints

- Follow `docs/specs/batch-b1b-ds-a11y-layout-spec.md` D-B1B-01~03 and §2 as the source of truth.
- `role="row"`, row-level `aria-selected`, row-level `aria-describedby`, and all EstimateLineRow `[role="cell"]` must be absent.
- Price input IDREFs must be space-separated and point only to existing elements for source-only, changed-only, both, and neither cases.
- Warehouse option DOM IDs must be opaque `...-opt-N`; React keys, selection, keyboard behavior, and `onChange(w.id, w)` remain domain-ID based.
- Match field outer wrappers must not own overflow; text wrapper truncates and badge remains visible.
- New desktop Playwright specs must be in the normal `playwright` test directory, not a `real-qa` path, and must not use `test.skip` or conditional early returns.
- No git commands, commits, pushes, or QA baseline PNG changes.

---

### Task 1: D-B1B-01 semantic row and price-description contract

**Files:**
- Modify: `clients/web/design-system/src/components/LineRow/LineRow.tsx`
- Modify: `clients/web/design-system/src/components/LineRow/LineTableHeader.tsx`
- Modify: `clients/web/design-system/src/components/EstimateLineRow/EstimateLineRow.tsx`
- Modify: `clients/desktop/src/renderer/routes/SlipFormPage.tsx`
- Modify: `clients/desktop/playwright/809-price-memory-real-qa/price-memory-r2-live-real-qa.spec.ts`
- Test: `clients/web/design-system/src/components/LineRow/LineRow.test.tsx`
- Test: `clients/web/design-system/src/components/EstimateLineRow/EstimateLineRow.test.tsx`

**Interfaces:**
- `LineRow` keeps checkbox state and `.selected` class; its price input receives a computed `aria-describedby` containing `priceStatusId` and/or `priceChangedStatusId`.
- `SlipMobileLineCard` uses the same IDREF order and has no generic-card `aria-describedby`.

- [ ] **Step 1: Add failing assertions** for absent row semantics, all four price IDREF combinations, existing target elements, checkbox accessible name/checked/class behavior, and EstimateLineRow zero `[role="cell"]` descendants.
- [ ] **Step 2: Run focused DS tests** and confirm failure is caused by the old row/cell and IDREF behavior.
- [ ] **Step 3: Remove row semantics and merge price input IDs** in LineRow and the mobile card; update comments and stale column/consumer descriptions.
- [ ] **Step 4: Remove LineTableHeader row role and all EstimateLineRow row/cell roles.**
- [ ] **Step 5: Update the existing #809 real-QA assertions** to locate the changed desktop line by `data-line-number` and class, then inspect the real unit-price input’s multiple IDREFs and existing targets; update stale comments.
- [ ] **Step 6: Run focused DS tests and confirm green.**

### Task 2: D-B1B-02 Warehouse opaque DOM and empty-list ARIA

**Files:**
- Modify: `clients/web/design-system/src/components/WarehouseAutocomplete/WarehouseAutocomplete.tsx`
- Create/Modify: `clients/web/design-system/src/components/WarehouseAutocomplete/WarehouseAutocomplete.test.tsx`

**Interfaces:**
- Candidate `<li>` keeps `key={w.id}`, `onChange(w.id, w)`, and domain-ID selection; only `id` and `aria-activedescendant` use `optionDomId(index)`.
- `hasListbox = open && candidates.length > 0` controls `aria-expanded`, `aria-controls`, `aria-activedescendant`, and listbox rendering.

- [ ] **Step 1: Add failing Vitest cases** for opaque IDs/no UUID or code in ID/IDREF attributes, ArrowDown active target, Enter/mouse callback payloads, React key behavior, and zero-candidate status/ARIA.
- [ ] **Step 2: Run the Warehouse test and confirm the expected old-ID/ARIA failures.**
- [ ] **Step 3: Implement `optionDomId(index)` and the single `hasListbox` condition.**
- [ ] **Step 4: Run the focused Warehouse test and confirm green with skipped=0.**

### Task 3: D-B1B-03 HighlightedField flex sibling layout

**Files:**
- Modify: `clients/web/design-system/src/components/PartnerAutocomplete/PartnerAutocomplete.tsx`
- Modify: `clients/web/design-system/src/components/ProductAutocomplete/ProductAutocomplete.tsx`
- Modify: `clients/web/design-system/src/components/AsyncAutocomplete/AsyncAutocomplete.module.css`
- Modify: `clients/web/design-system/src/components/PartnerAutocomplete/highlight.test.tsx`
- Modify: `clients/web/design-system/src/components/ProductAutocomplete/ProductAutocomplete.test.tsx`

**Interfaces:**
- Highlighted field markup has a text wrapper and badge as siblings; `matchBadge` remains the existing visible label and `splitHighlightMatches` behavior is unchanged.
- CSS uses outer `display:inline-flex; align-items:baseline; min-width:0`, text `flex:1 1 auto; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis`, badge `flex:0 0 auto`, and tertiary `min-width:0`.

- [ ] **Step 1: Add failing DOM/CSS contract assertions** that matched text and badge are sibling flex children and the expected class rules are present while existing highlight behavior remains.
- [ ] **Step 2: Run focused DS tests and confirm failure against the nested badge/current tertiary shrink behavior.**
- [ ] **Step 3: Split the JSX wrappers and apply the exact CSS contract without outer overflow.**
- [ ] **Step 4: Run Partner/Product/highlight tests and confirm green.**

### Task 4: CI desktop axe and 360/390/1440 visual contracts

**Files:**
- Modify: `clients/desktop/package.json`
- Modify: `clients/desktop/package-lock.json`
- Create: `clients/desktop/playwright/ac-b1b-ds-a11y-layout.spec.ts`
- Modify: `clients/desktop/playwright.config.ts` only if the normal include/exclude check proves necessary

**Interfaces:**
- The new normal-path mock spec visits `/#/sales/new?mockRole=MANAGER`, waits for `.sfp-line-table`, runs `checkA11y` scoped to `.sfp-line-table`, and asserts zero `aria-required-parent` violations.
- The same spec exercises Partner/Product candidates at 360px and 390px, asserts each of the five badges is visible and inside its option bounding box within 1px, then checks 1440px text/separator order and field presence.

- [ ] **Step 1: Add the spec and dependency declaration/lock entry, then run it to establish any fixture or contract failures.**
- [ ] **Step 2: Use existing `ac-*` mock routes/data and stable accessible/test selectors; do not add skips, real-server routes, or screenshot artifacts.**
- [ ] **Step 3: Run the new spec at the desktop Playwright config and confirm `skipped=0`.**
- [ ] **Step 4: Verify `playwright.config.ts` includes the new normal spec and excludes only real-QA paths.**

### Task 5: Full verification and handoff

**Files:**
- No additional source changes unless a verified test failure requires a scoped correction.

- [ ] **Step 1: Run design-system Vitest and `npm run typecheck`.**
- [ ] **Step 2: Run desktop Vitest and `npm run typecheck`.**
- [ ] **Step 3: Run the new axe/bbox Playwright spec with the mock web server.**
- [ ] **Step 4: Confirm all requested commands have fresh exit-0 evidence, every suite reports skipped=0, no git command was used, and report all changed/new files including package manifests.**
