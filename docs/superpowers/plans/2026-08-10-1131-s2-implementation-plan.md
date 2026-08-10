# PR #1131 S2 수정 화면 품목 추가 Implementation Plan

> **For agentic workers:** This plan is being executed inline. Git commit/push is intentionally omitted because PM owns git operations.

**Goal:** 매출전표 수정 화면에서 품목 선택으로 신규 행을 확정하고, 그 입력을 저장 payload에 보존하면서 기존 행의 lineId 계약과 협업 안전성을 유지한다.

**Architecture:** trailing draft는 매출 수정 React state에만 둔다. ProductAutocomplete 선택 시 draft를 provider의 신규 Y.Doc 행으로 승격하고, 승격 완료 후에만 저장 가능 상태를 허용한다. provider seed와 coedit projection은 확정행만 다루며, payload는 `willLineBeSaved`를 통과한 행만 포함한다.

**Tech Stack:** React, TypeScript, Vitest, Yjs, `@samhan/design-system` ProductAutocomplete.

## Global Constraints

- `SlipDetailPage.lineIdContract.test.tsx` 기존 계약 단정은 수정하지 않는다.
- 자동 빈행 공통 함수는 재구현하지 않고 `autoBlankRow.ts`의 함수를 사용한다.
- `slip_type`은 `OUTBOUND`이며 `SALES`를 사용하지 않는다.
- provider에는 trailing draft를 쓰지 않는다.
- 저장 전 승격 경합에서 확정 품목을 조용히 버리지 않는다.
- 공유 실데이터 write, 컨테이너 조작, git 조작은 하지 않는다.

### Task 1: RED-A payload contract

**Files:**
- Create: `clients/desktop/src/renderer/routes/SlipDetailPage.s2ProductAddition.test.tsx`
- Test: same file

**Interfaces:**
- Consumes: `buildDetailLinePayload`, `willLineBeSaved`, `PurchaseEditLine` behavior.
- Produces: failing tests proving a selected new product is persisted and blank/deleted rows are excluded.

- [ ] Write one test for a selected new product with `productId` and quantity, asserting the payload contains its product and `lineId: null`.
- [ ] Write one test for a trailing draft and a deleted/empty row, asserting neither appears in the save projection.
- [ ] Run the narrowed Vitest command and preserve the raw RED output.

### Task 2: local draft and promotion

**Files:**
- Modify: `clients/desktop/src/renderer/routes/SlipDetailPage.tsx`
- Create: `clients/desktop/src/renderer/routes/SlipDetailPage.s2ProductAddition.test.tsx`

**Interfaces:**
- Consumes: existing `ProductAutocomplete`, `searchProducts`, `isSelectableProductStatus`, `appendBlankRowIfLastChanged`, `ensureTrailingBlankRow`, `removeLinePreservingMinimum`, `DocCoeditProvider.addItem`.
- Produces: sales-edit helpers that keep one local draft, promote only on product selection, preserve selected product data, and append the next local draft.

- [ ] Add `ProductAutocomplete` to the sales product cell with the same search/status filtering contract used by `SlipFormPage`.
- [ ] Keep the trailing draft in React state and keep its coedit field paths out of the provider.
- [ ] On selection, call `addItem` exactly once, write the selected product fields to the returned Y.Doc row, then add a fresh local draft.
- [ ] On clear, remove the provider row by its stable lineId when it is a confirmed row and retain the minimum local input path.
- [ ] Build the save projection with `filter((line) => willLineBeSaved(line))` before mapping to payload.

### Task 3: write fence and race coverage

**Files:**
- Modify: `clients/desktop/src/renderer/routes/SlipDetailPage.tsx`
- Modify: `clients/desktop/src/renderer/routes/SlipDetailPage.s2ProductAddition.test.tsx`

**Interfaces:**
- Consumes: local promotion helper and existing save handlers.
- Produces: a promotion-pending fence that prevents save from racing ahead of provider promotion; the selected value remains in the local save projection until promotion completes.

- [ ] Add a test that invokes selection while promotion is pending and proves save is disabled/blocked rather than dropping the selected line.
- [ ] Add a test that clearing a promoted product removes it from the payload.
- [ ] Add tests for remote projection, existing line edits, and two consecutive new selections using saved content rather than UI row count.
- [ ] Run mutation-focused tests and preserve any mutation RED before the implementation, then run GREEN.

### Task 4: regression verification

**Files:**
- No production file changes expected.

- [ ] Run `SlipDetailPage.lineIdContract.test.tsx` without changing its legacy cardinality assertions; report any red test and its protected invariant.
- [ ] Run the S1 transaction-partner and ledger state tests that are already present and targeted.
- [ ] Run a source/type check only through the documented `npx` path if available; do not run the full suite.
- [ ] Report changed files/line counts, new files, RED/GREEN raw output, mutation RED, five new surfaces, and remaining gaps.
