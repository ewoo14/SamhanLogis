# S3 배차 그룹 UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Samhan desktop carrier master and dispatch-group workflow for carrier assignment and sales/purchase slip inclusion, without transfer execution.

**Architecture:** Add typed API clients and mock handlers for the existing S1/S2 contracts. Add two protected routes using existing design-system components; the group screen separates pre-classified outbound slips from independently searched inbound slips and exposes read-only transfer status.

**Tech Stack:** React 18, TypeScript, React Router, TanStack Query, Vitest, Playwright mock suite, `@samhan/design-system`.

## Global Constraints

- Only `clients/desktop` plus the required S3 report/spec/plan files may change.
- Never modify `clients/arologis-desktop`.
- Never change pre-classification rules or existing S1/S2 backend contracts.
- Never display UUIDs; display group number, carrier code/name, and slip number.
- Do not add transfer UI or transfer mutation; display `transfer_status` read-only.
- Use existing design-system components before creating UI primitives.
- Do not run Docker or commit/push.

---

### Task 1: Establish contract coverage and permission key

**Files:**
- Create: `clients/desktop/src/renderer/api/dispatchGroupApi.ts`
- Create: `clients/desktop/src/renderer/api/dispatchGroupApi.contract.test.ts`
- Modify: `clients/desktop/src/renderer/api/permissionsApi.ts`
- Modify: `clients/desktop/src/renderer/routes/permissionPageCatalog.ts` and its source catalog
- Modify: `clients/desktop/src/renderer/api/mock.ts`

- [ ] Write failing API contract tests for carrier list/create/update/delete and group list/create/update/delete/carrier assign/clear/slip add/remove, asserting exact paths and no transfer mutation.
- [ ] Run the focused contract test and confirm it fails because the client is absent.
- [ ] Implement typed clients using the existing `apiClient`/`ApiResponse` conventions and S1 payload names; keep IDs internal.
- [ ] Add `hr.carriers` to the `PageCode` union, page labels/groups, mock permission catalog, and mock role grants.
- [ ] Add mock state and handlers for carrier/group endpoints, including reasons for invalid mutations and read-only `transferStatus`.
- [ ] Run focused contract and mock tests; confirm green.

### Task 2: Add carrier master screen and navigation

**Files:**
- Create: `clients/desktop/src/renderer/routes/CarrierListPage.tsx`
- Create: `clients/desktop/src/renderer/routes/CarrierListPage.test.tsx`
- Modify: `clients/desktop/src/renderer/routes/index.tsx`
- Modify: `clients/desktop/src/renderer/components/AppLayout.tsx`

- [ ] Write failing component tests for listing, create/edit, active toggle, and visible settlement-partner state.
- [ ] Run the focused component test and confirm the expected missing-screen failure.
- [ ] Implement the screen with `Card`, `DataTable`, `Button`, `Input`, `Select`, `Modal`/`FormField` from design-system and `hr.carriers` permission guards.
- [ ] Add `/admin/carriers`, the personnel sidebar link, and `/admin/carriers` to `activeTargets`.
- [ ] Run carrier component and navigation parity tests.

### Task 3: Add dispatch-group screen and slip inclusion flows

**Files:**
- Create: `clients/desktop/src/renderer/routes/DispatchGroupPage.tsx`
- Create: `clients/desktop/src/renderer/routes/DispatchGroupPage.test.tsx`
- Modify: `clients/desktop/src/renderer/routes/index.tsx`
- Modify: `clients/desktop/src/renderer/components/AppLayout.tsx`
- Modify: `clients/desktop/src/renderer/routes/ArologisPreClassifyPage.tsx`

- [ ] Write failing tests for group CRUD, outbound pre-classify selection, separate inbound search, and reason-bearing guards for no carrier, inactive carrier, sent status, and non-empty deletion.
- [ ] Run the focused component test and confirm missing-screen failure.
- [ ] Implement date/group selection and forms; make outbound and inbound sources visibly separate; use only business identifiers in rendered text.
- [ ] Add carrier assign/clear controls with inactive-carrier reason and read-only transfer-status badge.
- [ ] Add the pre-classify-to-groups link and dispatch sidebar link/active target.
- [ ] Run focused component tests and route tests.

### Task 4: Playwright mock coverage and final verification

**Files:**
- Modify: existing `clients/desktop` Playwright mock spec under the repository's current test location
- Modify: `docs/dev-reports/2026-08-04-1039-s3-dispatch-group-ui.md`

- [ ] Add Playwright mock scenarios for carrier list, group creation, outbound inclusion, inbound-only search, and every required blocked state.
- [ ] Run the relevant Playwright mock suite and record the exact command/output.
- [ ] Run `npm run typecheck`, related vitest, and `git diff --check`; record exact output.
- [ ] Run reference grep for routes/API/`hr.carriers` and confirm no forbidden client or transfer UI changes.
- [ ] Append the SQL count, design rationale, API additions, three-layer permission synchronization, termination-condition commands/output, and changed-file lists to the report.
