# 견적서 목록 source 구분 구현 계획

> **For agentic workers:** TDD 순서로 수행한다. 이 작업은 사용자 지시로 직접 실행하며 git 변경/커밋 명령은 실행하지 않는다.

**Goal:** `/sales/estimates` 통합 목록에 기존 데스크톱 저장분과 웹 저장분의 출처를 표시하고 source 필터를 제공한다.

**Architecture:** 기존 `estimates + partner_orders` 조회를 유지하면서 각 저장소의 활성/조회 대상 메타데이터를 읽기 전용 목록 API로 노출한다. 데스크톱은 세 API 결과를 source-aware 행 모델로 병합하며, 각 행에는 UUID가 아닌 업무 식별자/표시용 label만 둔다. source 표시 문자열은 별도 후보 상수로 격리한다.

**Tech Stack:** Spring Boot/JPA, React/TypeScript, Vitest, Testing Library, npm.

## Global Constraints

- 이번 슬라이스는 source 구분·표시·필터만 다룬다. `estimates` 단일화·웹앱 배선·웹 왕복은 변경하지 않는다.
- 기존 `estimates`·`partner_orders` 행은 모두 보존한다.
- 실측 웹 저장분 4 + 11 = 15건을 목록 모델/API 테스트와 보고서 원문으로 고정한다.
- 화면/API 응답에 UUID를 노출하지 않는다.
- RED 원문을 먼저 실행하고, 구현 후 GREEN 원문을 남긴다.
- 공유 DB에는 쓰지 않는다. 마이그레이션은 만들지 않으며 번호를 세지 않는다.

---

### Task 1: 웹 저장분 읽기 전용 목록 계약

**Files:**
- Modify: `services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/snapshot/web/QuoteSnapshotController.java`
- Modify: `services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/snapshot/service/QuoteSnapshotService.java`
- Modify: `services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/snapshot/web/dto/QuoteSnapshotResponse.java`
- Test: 기존 quote snapshot controller/service 테스트 위치
- Modify: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/PartnerOrderDraftController.java`
- Modify: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderDraftService.java`
- Modify: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/dto/DraftResponse.java`
- Test: 기존 partner-order draft controller/service 테스트 위치

**Interfaces:**
- Produces source-list DTOs containing only non-UUID fields: source-specific business label/number, partner display fields, amount, createdAt, status, deleted flag.
- The desktop-admin read endpoints return all rows permitted for the desktop list, without payload blobs and without entity IDs.

- [ ] Write failing backend tests proving the desktop read contract returns quote snapshots and partner drafts without UUID fields.
- [ ] Run the focused service tests and capture RED output.
- [ ] Add minimal read-only service/controller methods and DTO projections; preserve existing web self-scope endpoints.
- [ ] Run focused service tests and capture GREEN output.

### Task 2: Source-aware desktop list model

**Files:**
- Modify: `clients/desktop/src/renderer/routes/estimateUnifiedListModel.ts`
- Test: `clients/desktop/src/renderer/routes/estimateUnifiedListModel.test.ts`

**Interfaces:**
- Add `UnifiedEstimateSource` members for desktop estimate, desktop partner order, web quote snapshot, and web partner-order draft.
- Add `sourceLabel` from a separately exported candidate map; do not expose UUID fields.
- `mergeEstimateAndOrderRows` evolves to accept all four source arrays and returns all rows sorted by source row timestamp.
- Add a pure source filter helper used by the page.

- [ ] Add four failing tests, one per invariant: every row has source, source filter selects only its source, 4+11 web rows are all present, and pre-existing estimate/order rows remain present.
- [ ] Run `npx vitest run src/renderer/routes/estimateUnifiedListModel.test.ts` and save the four RED failures.
- [ ] Implement the smallest source-aware row types, mapping, filter helper, and UUID-free identity strategy.
- [ ] Run the focused model test and save GREEN output.

### Task 3: Desktop API wiring and page filter

**Files:**
- Modify: `clients/desktop/src/renderer/api/estimateApi.ts` or a focused new API module beside it
- Modify: `clients/desktop/src/renderer/api/sales.ts` or a focused new API module beside it
- Modify: `clients/desktop/src/renderer/routes/EstimateListPage.tsx`
- Test: `clients/desktop/src/renderer/routes/EstimateListPage.test.tsx`

**Interfaces:**
- Add read-only API functions returning the non-UUID web source summaries.
- Unified query fetches estimates, partner orders, quote snapshots, and partner drafts independently; successful sources remain visible when another source fails.
- Add a source filter control with values derived from the candidate map and filter the already merged rows.
- Keep existing status/date/partner filters and navigation behavior.

- [ ] Add failing page tests for source labels, source filtering, 15 web rows, and preservation of the existing estimate/order rows.
- [ ] Run the focused page tests and save RED output.
- [ ] Wire APIs, query aggregation, source filter state, and table rendering; ensure row keys/navigation use non-UUID business identifiers.
- [ ] Run focused page tests and save GREEN output.
- [ ] Run `npm run typecheck` from `clients/desktop`.

### Task 4: Evidence report and final verification

**Files:**
- Create: `docs/dev-reports/2026-08-12-1092-s1-source-distinction-luna.md`

- [ ] Record 정찰 사실: current list is `estimates + partner_orders`, web stores are currently absent/unclassified.
- [ ] Record source-label candidates and leave final terminology as a developer-lead decision; keep code labels easy to change.
- [ ] Record the original measured counts, before/after totals, and the literal 4 + 11 = 15 evidence.
- [ ] Include RED and GREEN command/output excerpts, changed files, and explicitly list anything not done.
- [ ] Run changed-module tests, related service tests, and desktop typecheck; record exit codes.
- [ ] Run `git ls-files --deleted` and verify `tools/.s24-build-only/build/deep/tracked-writer.mjs` exists and is not deleted/modified.
- [ ] Check for and clean only task-created temporary containers/directories/processes; do not alter shared DB.
