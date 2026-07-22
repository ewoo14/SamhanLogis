# #825 슬7 거래처 우선 주문 병합 UX Implementation Plan

> **For agentic workers:** This plan is executed inline in the current worktree. Git commits are intentionally omitted because the PM owns commits.

**Goal:** 주문 병합 화면을 거래처 단수 선택 후 해당 거래처 주문만 칩으로 복수 선택하는 2단계 UX로 바꿔 서로 다른 거래처 주문 혼합 상태를 UI에서 제거한다.

**Architecture:** `SalesPartnerOrderListPage`는 병합 대상 체크박스/혼합 선택 상태를 제거하고 권한이 있는 사용자에게 병합 시작 버튼만 제공한다. `MergeConvertDialog`가 `PartnerAutocomplete`로 거래처를 먼저 선택한 뒤 `listPartnerOrders({ partnerId: partnerCode })` 후보 쿼리를 실행하고, `MultiSelectAutocomplete`의 `renderChip`으로 주문번호 칩을 관리한다. 선택 거래처별 주문 선택기는 `key={partnerCode}`로 remount하여 이전 거래처 선택을 동기 폐기한다. 기존 상세 조회·수량·창고·헤더 충돌·병합 mutation과 BE 409 안전망은 유지한다.

**Tech Stack:** React, TanStack Query, `@samhan/design-system` (`PartnerAutocomplete`, `MultiSelectAutocomplete`, 내부 `TagChip`), Vitest/Testing Library, 좁은 Playwright mock 스펙, Spring Boot 기존 병합 서비스 테스트.

## Global Constraints

- S7-1: 사용자가 서로 다른 거래처 주문을 섞어 고르는 상태에 도달할 수 없다.
- S7-2: BE의 서로 다른 거래처 409 가드는 유지한다.
- S7-3: `PartnerOrderMergeConvertService` 기존 병합 로직은 변경하지 않는다.
- S7-4: 거래처 변경 시 이전 거래처 주문 선택은 남지 않는다.
- 기존 design-system 칩/자동완성 컴포넌트를 재사용하고 자체 칩 컴포넌트를 만들지 않는다.
- UUID는 화면에 표시하지 않는다.
- 전체 Playwright mock suite와 공유 Docker DB 쓰기는 금지한다.

---

### Task 1: RED — 거래처 우선 선택과 partnerId 후보 필터의 실패 테스트

**Files:**
- Create: `clients/desktop/src/renderer/routes/components/MergeConvertDialog.test.tsx`
- Modify: `clients/desktop/playwright/d2-order-merge/d2-order-merge.spec.ts`

**Interfaces:**
- Test the current dialog/page behavior through visible business identifiers: partner name, order number, selected-order chips, and query filter payload.
- The test must positively assert the selected partner and its order candidates before asserting another partner's order count is zero.

- [ ] **Step 1: Write the failing unit/integration assertions**
  - Mock `PartnerAutocomplete`, `MultiSelectAutocomplete`, and existing dialog dependencies only enough to expose their controlled props.
  - Render the dialog with the partner search mock returning partner A/B and order list mock returning A/B rows.
  - Assert partner A is rendered, `listPartnerOrders` was called with `partnerId: partnerA.partnerCode`, A's order number is in candidates, B's order number has count zero, and changing to B resets the selected-chip count to zero.

- [ ] **Step 2: Run the focused test and capture RED**
  - Run: `cd clients/desktop; npx vitest run src/renderer/routes/components/MergeConvertDialog.test.tsx --reporter=verbose`
  - Expected: FAIL because the current dialog has no partner-first selector or partner-filtered candidate chips.

- [ ] **Step 3: Update the related Playwright scenario to encode S7-1/S7-4**
  - Replace old checkbox-mixing assertions with hard gates for partner selector visibility, positive partner/order output, zero count for the other partner order, and selection reset after partner change.
  - Preserve the existing narrow merge-success, stock-409, single-convert, and status-refresh coverage using the new UI flow.

### Task 2: GREEN — implement the two-stage dialog and remove the mixed checkbox path

**Files:**
- Modify: `clients/desktop/src/renderer/routes/components/MergeConvertDialog.tsx`
- Modify: `clients/desktop/src/renderer/routes/SalesPartnerOrderListPage.tsx`
- Modify: `clients/desktop/src/renderer/api/sales.ts` only if the candidate type/normalization needs an existing-field-compatible adjustment

**Interfaces:**
- `MergeConvertDialog` accepts no preselected mixed list; it owns partner selection and candidate order selection.
- Candidate selector consumes `PartnerOrderSummary[]` and returns `PartnerOrderSummary[]` through `MultiSelectAutocomplete` delta callbacks.
- Existing merge mutation still receives the same `MergeConvertOrderItems[]`, warehouse code, and shipping info.

- [ ] **Step 1: Add partner-first state and query**
  - Import `PartnerAutocomplete`, `MultiSelectAutocomplete`, `type PartnerOption`, `searchPartners`, and `listPartnerOrders` from existing modules.
  - Store one `PartnerOption | null` in the dialog.
  - Enable the candidate query only after a partner is selected and call `listPartnerOrders(0, 50, { partnerId: selectedPartner.partnerCode, includeDeleted: false })`.
  - Filter candidates to active, non-deleted `DRAFT`/`ON_HOLD` rows before presenting them.

- [ ] **Step 2: Add the keyed candidate chip selector**
  - Render `MultiSelectAutocomplete<PartnerOrderSummary, PartnerOrderSummary>` with opaque order number keys and visible order number/partner name labels.
  - Wrap the selector in `key={selectedPartner?.partnerCode ?? 'no-partner'}` so changing partner synchronously remounts and clears selected orders.
  - Use `renderChip` with the design-system `TagChip` and order-number-only visible text; no UUIDs.
  - Add a positive candidate summary and an explicit empty state after candidate query resolution.

- [ ] **Step 3: Preserve the existing detail, quantity, warehouse, conflict, mutation, and 409 paths**
  - Derive `selectedOrders` from the new chip selection.
  - Disable submit until a partner, at least two candidate orders, detail quantities, warehouse, and conflicts are resolved.
  - Keep the existing same-partner BE safety-net error handling and `mergeConvertToSlip` payload shape unchanged.

- [ ] **Step 4: Replace list-page checkboxes with a single merge-start action**
  - Remove `selectedOrderNumbers`, mixed-partner calculation, checkbox column, mixed warning, and selection reset action.
  - Keep the existing `merge-convert-open` test id for the permission-gated merge-start button so unrelated callers remain stable.
  - Open the dialog with no preselected orders; success still clears the dialog and invalidates the same caches.

- [ ] **Step 5: Run the focused unit test and capture GREEN**
  - Run: `cd clients/desktop; npx vitest run src/renderer/routes/components/MergeConvertDialog.test.tsx --reporter=verbose`
  - Expected: PASS with the selected partner's positive candidate and zero other-partner candidates.

### Task 3: Mutation RED and S7-2 regression proof

**Files:**
- Modify: `clients/desktop/src/renderer/routes/components/MergeConvertDialog.test.tsx`
- Modify: `clients/desktop/src/renderer/api/mock.ts` only for focused mock parity if required
- Preserve: `services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/service/PartnerOrderMergeConvertServiceTest.java`

- [ ] **Step 1: Run the mutation test with the partnerId filter disabled**
  - Temporarily mutate only the test seam/mock so candidate results ignore `partnerId`.
  - Run the focused test; expected RED because the other partner's order becomes a visible candidate.
  - Restore the production/test seam with `apply_patch` and rerun the test.

- [ ] **Step 2: Run the existing S7-2 service regression**
  - Run: `./gradlew.bat :services:partner-order-service:test --tests '*PartnerOrderMergeConvertServiceTest*' --rerun-tasks --no-build-cache --console=plain`
  - Expected: Gradle console ends with `BUILD SUCCESSFUL`; the different-partner case remains a 409 and external reserve/publish calls remain absent.

### Task 4: Verification and report evidence

**Files:**
- Modify: `docs/dev-reports/2026-07-23-867-s7-order-merge-partner-first.md`

- [ ] **Step 1: Run focused frontend verification**
  - `cd clients/desktop; npm run typecheck`
  - `cd clients/desktop; npx vitest run`

- [ ] **Step 2: Run focused Playwright only**
  - `cd clients/desktop; npx playwright test playwright/d2-order-merge --reporter=line`
  - Do not run the full mock suite.

- [ ] **Step 3: Run the requested backend modules**
  - `./gradlew.bat :services:partner-order-service:test :services:slip-service:test --rerun-tasks --no-build-cache --console=plain`
  - Judge by the actual terminal ending (`BUILD SUCCESSFUL` or `BUILD FAILED`), not XML files or cached task status.

- [ ] **Step 4: Record raw RED, GREEN, mutation RED, S7-2 409 evidence, changed files, reused components, and any unexecuted checks**
