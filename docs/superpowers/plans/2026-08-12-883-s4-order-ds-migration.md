# #883 S4 주문서·견적서 design-system 표준화 Implementation Plan

> **For agentic workers:** Git 조작 금지 지시를 따른다. 이 계획은 현재 워크트리에서 인라인으로 실행하며 commit/push/PR은 수행하지 않는다.

**Goal:** 주문서와 견적서의 상태·문서번호·셸·색상 토큰을 design-system 표준으로 전환하면서 업무 표시값과 기존 동작을 보존한다.

**Architecture:** 전표 DS 컴포넌트의 forwardRef/span/CSS-module 패턴을 복제해 `OrderStatusBadge`와 `OrderNumberDisplay`를 만든다. 화면은 기존 API와 상태값을 그대로 사용하고, 공통 DS 컴포넌트와 의미 토큰을 배선한다. 인쇄 표면과 도메인 업무 함수는 건드리지 않는다.

**Tech Stack:** React, TypeScript, CSS Modules, Vitest, Playwright Chromium-1217, `@samhan/design-system`.

## Global Constraints

- 주문 상태 6종과 기존 한국어 라벨을 1:1 보존한다.
- 견적 상태 5종과 기존 한국어 라벨을 주문 상태에 합치지 않는다.
- 금액·수량·상태·날짜·문서번호 텍스트는 전환 전후 문자열 단위로 동일해야 한다.
- 정렬·필터·페이지네이션·행 클릭·뒤로 가기 스크롤 복귀·권한 disabled·자동 빈 행 입력 UX를 변경하지 않는다.
- `--c-bg → --surface-card`, `--c-line → --line-default`, `--c-accent → --action-brand`를 사용한다.
- `sales.module.css`의 runtime 사용 56개만 유지하고 dead 44개는 이관하지 않는다.
- 인쇄·미리보기 구현 파일은 수정하지 않는다.
- Git 명령은 실행하지 않는다.

---

### Task 1: OrderStatusBadge 계약

**Files:**
- Create: `clients/web/design-system/src/components/OrderStatusBadge/OrderStatusBadge.tsx`
- Create: `clients/web/design-system/src/components/OrderStatusBadge/OrderStatusBadge.module.css`
- Create: `clients/web/design-system/src/components/OrderStatusBadge/index.ts`
- Test: `clients/web/design-system/src/components/OrderStatusBadge/OrderStatusBadge.test.tsx`
- Modify: `clients/web/design-system/src/index.ts`

**Interfaces:**
- Produces `OrderStatusBadge` and `OrderStatus` for desktop consumers.
- `OrderStatusBadgeProps` accepts `status: OrderStatus`, optional `className`, and span HTML attributes.

- [ ] **Step 1: Write the failing test**

`OrderStatusBadge.test.tsx`에서 6개 상태를 표로 순회해 `data-status`와 한국어 라벨을 검증하고, `ON_HOLD`와 `CONVERTED`가 서로 다른 색상 group을 갖는지 검증한다.

- [ ] **Step 2: Run the focused test and confirm RED**

Run from `clients/web/design-system`: `npm exec vitest run src/components/OrderStatusBadge/OrderStatusBadge.test.tsx`

Expected: `FAIL` because the component and export do not exist.

- [ ] **Step 3: Implement the minimal component**

`SlipStatusBadge`처럼 `forwardRef`를 사용하고, `STATUS_LABEL`과 `COLOR_GROUP`을 exhaustive `Record<OrderStatus, ...>`로 둔다. 기존 라벨은 `DRAFT=진행중`, `ON_HOLD=보류`, `CONFIRMING=확인중`, `CONFIRMED=완료`, `CANCELED=취소`, `CONVERTED=전환완료`로 고정한다.

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run the same Vitest command. Expected: all focused tests pass with zero failures.

- [ ] **Step 5: Refactor only after GREEN**

Extract no new behavior; keep the exhaustive map and CSS module boundary aligned with `SlipStatusBadge`.

### Task 2: OrderNumberDisplay 계약

**Files:**
- Create: `clients/web/design-system/src/components/OrderNumberDisplay/OrderNumberDisplay.tsx`
- Create: `clients/web/design-system/src/components/OrderNumberDisplay/OrderNumberDisplay.module.css`
- Create: `clients/web/design-system/src/components/OrderNumberDisplay/index.ts`
- Test: `clients/web/design-system/src/components/OrderNumberDisplay/OrderNumberDisplay.test.tsx`
- Modify: `clients/web/design-system/src/index.ts`

**Interfaces:**
- `OrderNumberDisplayProps` accepts `orderNumber: string`, optional `size: 'sm' | 'md' | 'lg'`, and span HTML attributes.
- The component renders `orderNumber` exactly and never accepts or renders UUID data.

- [ ] **Step 1: Write the failing test**

Render `orderNumber="2026/08/12-17"` at `sm`, `md`, and `lg`; assert exact text and `data-order-number` for the rendered span.

- [ ] **Step 2: Run the focused test and confirm RED**

Run from `clients/web/design-system`: `npm exec vitest run src/components/OrderNumberDisplay/OrderNumberDisplay.test.tsx`

Expected: `FAIL` because the component and export do not exist.

- [ ] **Step 3: Implement the minimal component**

Follow `SlipNumberDisplay`'s forwardRef and size-class pattern, but do not parse, normalize, or reformat the order number.

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run the same Vitest command and confirm all tests pass.

### Task 3: Design-system build/export verification

**Files:**
- Modify: `clients/web/design-system/src/index.ts`
- Test: existing design-system component test suite

- [ ] **Step 1: Run component tests**

Run `npm exec vitest run` from `clients/web/design-system` and confirm the new exports do not break existing DS tests.

- [ ] **Step 2: Run the design-system typecheck/build**

Run the package's existing typecheck/build scripts from `clients/web/design-system`; record the exact command and result for the dev report.

### Task 4: Token and CSS dead-code reduction

**Files:**
- Modify: `clients/desktop/src/renderer/components/sales/sales.module.css`
- Modify: `clients/desktop/src/renderer/components/sales/SalesSubNav.tsx` only if its layout needs DS token class names

- [ ] **Step 1: Add a source contract test before removal**

Add or extend a desktop contract test that enumerates the 44 approved dead selectors and asserts they are not imported by runtime sales consumers. This test must read only the named seven pages plus `MergeConvertDialog` and exclude test mocks.

- [ ] **Step 2: Run the contract test and confirm RED for the new token assertions**

Assert `salesScope` is absent from the seven runtime pages and that `--c-line`, `--c-bg`, and `--c-accent` are absent from the retained scope rules. Run the focused test before editing; it must fail against the current source.

- [ ] **Step 3: Implement the CSS reduction**

Remove only the 44 dead selector groups. In retained rules replace `--c-bg` with `var(--surface-card)`, `--c-line`/`--c-col-sep` with `var(--line-default)`, `--c-accent` with `var(--action-brand)`, `--c-muted` with `var(--ink-secondary)`, and `--c-strong` with `var(--ink-primary)`. Preserve the 56 runtime class names and all numeric/layout declarations needed by existing screens.

- [ ] **Step 4: Remove `salesScope` wrappers and imports**

Update exactly the seven runtime pages using the wrapper so their root is the existing page content. Preserve all children, callbacks, query keys, filters, row click handlers, pagination, permission conditions, and form input structure.

- [ ] **Step 5: Run the focused contract test and confirm GREEN**

Run the same test and confirm zero failures. Run a source scan for every retained class and verify no runtime consumer references a removed selector.

### Task 5: Order and estimate component wiring

**Files:**
- Modify: `clients/desktop/src/renderer/routes/SalesPartnerOrderListPage.tsx`
- Modify: `clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx`
- Modify: `clients/desktop/src/renderer/routes/EstimateListPage.tsx`
- Modify: `clients/desktop/src/renderer/routes/EstimatePricingConfigPage.tsx`
- Modify: `clients/desktop/src/renderer/routes/SalesOrderApprovalsPage.tsx`
- Modify: `clients/desktop/src/renderer/routes/SalesPartnerDcConfigPage.tsx`
- Modify: `clients/desktop/src/renderer/routes/components/MergeConvertDialog.tsx`
- Modify: related desktop tests where CSS mocks or exact status text need updated imports

- [ ] **Step 1: Add/extend failing render assertions**

Assert order list/detail render `OrderStatusBadge` with each existing status label, order number text is unchanged, and estimate list retains all five estimate labels. Assert the detail page no longer defines or uses `statusBadgeStyle`.

- [ ] **Step 2: Run focused desktop tests and confirm RED**

Run the affected Vitest files from `clients/desktop` using the existing package test command. Expected: the new component/testid/source assertions fail before wiring.

- [ ] **Step 3: Wire the DS components with no business-logic edits**

Replace only presentation imports and JSX. Keep `PARTNER_ORDER_STATUS_LABEL`, `ESTIMATE_STATUS_LABEL`, API calls, query keys, permission checks, form state, automatic empty-row behavior, and navigation untouched. Use `OrderStatusBadge` for order status and `OrderNumberDisplay` for visible order number text. Keep deleted-row labels and slip-publish badges semantically separate.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run the same affected Vitest files and confirm status labels, value strings, permission behavior, row navigation, and form contracts pass.

### Task 6: RED-A value and output regression evidence

**Files:**
- Create: `clients/desktop/playwright/883-s4-order-ds-migration-real-qa/883-s4-order-ds-migration-real-qa.spec.ts`
- Create or modify: `clients/desktop/playwright/883-s4-order-ds-migration-real-qa/playwright.config.ts`
- Create or modify: QA helper usage through `resolveQaShotsDir()` only

- [ ] **Step 1: Add pre/post text assertions**

For order list/detail and estimate list/detail, assert exact visible strings for document number, amount, quantity, status label, and date. Use unique page elements before capture. Add print/preview assertions for the existing output fields without changing print code.

- [ ] **Step 2: Run the live QA in isolated mode**

From `clients/desktop`, run the dedicated Playwright config with headless Chromium-1217, hash-router URLs (`${BASE_URL}/#/...`), isolated service/database credentials, and `resolveQaShotsDir()` output. Do not use the in-app browser or shared DB login.

- [ ] **Step 3: Inspect screenshots and text results**

Confirm the screenshots exist under the resolved directory, the four unique page elements were visible before capture, and all value assertions are string-identical before/after. Stop any server started by the QA process.

### Task 7: Full verification and report

**Files:**
- Create: `docs/dev-reports/2026-08-12-883-s4-order-ds-migration.md`

- [ ] **Step 1: Run desktop Vitest**

Run the full desktop Vitest command from `clients/desktop`; record total tests, failures, errors, and skips.

- [ ] **Step 2: Run desktop typecheck and lint**

Run the existing typecheck and lint scripts from `clients/desktop`; record exit codes and relevant output.

- [ ] **Step 3: Re-run the RED-A Playwright suite**

Run the dedicated `-real-qa` suite again after all code/test changes and confirm the resolved screenshot paths and text assertions.

- [ ] **Step 4: Write the Korean dev report**

Include: approved scope, DS component inventory, exact status/label comparison, token before/after color table, CSS 56-used/44-dead accounting, changed files, RED-A exact values, print/preview result, test/typecheck/lint/QA evidence, and any unresolved blocker. Do not claim success for a command without its fresh output.
