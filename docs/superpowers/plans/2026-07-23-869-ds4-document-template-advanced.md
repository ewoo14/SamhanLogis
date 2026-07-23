# DS-4 문서 양식 고도화 Implementation Plan

> **For agentic workers:** PM이 커밋을 대행하므로 이 워크트리에서는 git 명령을 실행하지 않는다. 아래 단계는 TDD와 좁은 검증 게이트를 따른다.

**Goal:** DS-3b schema v2에 허용 목록 기반 `DETAIL` 반복 밴드와 안전한 `IMAGE` 요소를 추가하고 기존 인쇄 계약을 유지한다.

**Architecture:** 기존 `templateSchema` parser와 groupware `DocumentPayloadValidator`에 additive 타입 검증을 추가한다. `ApprovalRenderModel`에 UUID 없는 line-item projection을 더하고 `DocumentRenderer`가 기존 `PrintLayout` 내부에서 detail table/image layer를 compile한다. 편집기는 기존 palette/inspector/draft 상태를 확장하며 별도 design-system 컴포넌트는 만들지 않는다.

**Tech Stack:** React 18, TypeScript, Vitest, Playwright, Spring Boot/Java records, Jackson JSONB, existing PrintLayout CSS.

## Global Constraints

- 새 Flyway migration과 새 API endpoint는 만들지 않는다.
- 기존 `FIELD`, `TEXT`, 레거시 7종 및 기존 schema v2 해석을 변경하지 않는다.
- Detail source는 실제 `EstimateLineResponse`의 검증된 필드명만 사용한다.
- Image source는 PNG/JPEG/WebP base64 data URL 또는 정확한 `/print-logo.svg`만 허용한다.
- 신규 design-system 컴포넌트를 만들지 않는다.
- 전체 Playwright 스위트를 실행하지 않고 `ac-868-document-template-editor.spec.ts`만 실행한다.
- 공유 Docker DB에 write하지 않는다.
- git 명령은 실행하지 않는다.

---

### Task 1: Schema parser RED/GREEN

**Files:**
- Modify: `clients/desktop/src/renderer/print/templateSchema.ts`
- Test: `clients/desktop/src/renderer/print/templateSchema.v2.test.ts`
- Test: `clients/desktop/src/renderer/print/templateSchema.limits.test.ts`

**Interfaces:**
- Produces `DetailColumnKey`, `DetailElement`, `ImageElement`, `DETAIL`/`IMAGE` parser results and source validation helpers.

- [ ] Step 1: Add failing tests for valid detail/image payloads, wrong band placement, unknown detail column, invalid image schemes, query strings, SVG data, and preservation of existing v2 FIELD/TEXT payloads.
- [ ] Step 2: Run `cd clients/desktop; npx vitest run src/renderer/print/templateSchema.v2.test.ts src/renderer/print/templateSchema.limits.test.ts`; expected new assertions fail because `DETAIL`/`IMAGE` are unsupported.
- [ ] Step 3: Add additive types, allowlists, parser branches, source validation, labels, and band rules without changing legacy parsing.
- [ ] Step 4: Re-run the two focused test files; expected all focused assertions pass.
- [ ] Step 5: Mutate the implementation in a temporary working edit by removing `DETAIL`/`IMAGE` from the accepted set and run the focused tests; expected a hard failure from the new tests. Restore the implementation.

### Task 2: BE JSONB validator/record RED/GREEN

**Files:**
- Modify: `services/groupware-service/src/main/java/com/samhanair/logis/groupware/domain/DocumentPayload.java`
- Modify: `services/groupware-service/src/main/java/com/samhanair/logis/groupware/service/DocumentPayloadValidator.java`
- Test: `services/groupware-service/src/test/java/com/samhanair/logis/groupware/service/DocumentPayloadValidatorTest.java`
- Test: `services/groupware-service/src/test/java/com/samhanair/logis/groupware/it/DocumentTemplateIT.java`

**Interfaces:**
- `DocumentPayload.Element` preserves `repeatBinding`, `columns`, `src`, and `alt` without changing existing constructor behavior.
- Validator accepts only schema v2 `DETAIL`/`IMAGE` values and rejects v1/new-element misuse, invalid columns, unsafe image sources, and invalid bands.

- [ ] Step 1: Add failing Java tests for detail/image JSONB round-trip, existing v2 round-trip, invalid sources, invalid columns, BODY-only detail, and schema v1 rejection.
- [ ] Step 2: Run `.\gradlew.bat :services:groupware-service:test --tests '*DocumentPayloadValidatorTest' --rerun-tasks --no-build-cache --console=plain`; expected new assertions fail with unsupported element/record field behavior.
- [ ] Step 3: Add nullable additive record fields and validator constants/checks matching FE allowlists and image policy.
- [ ] Step 4: Run the focused Gradle test again and read the console termination line; expected `BUILD SUCCESSFUL` with no `UP-TO-DATE`/`FROM-CACHE` reliance.
- [ ] Step 5: Remove one validator branch in a temporary edit and rerun the focused mutation test; expected invalid fixture becomes accepted and test fails. Restore the branch.

### Task 3: Render model and renderer RED/GREEN

**Files:**
- Modify: `clients/desktop/src/renderer/print/approvalRenderModel.ts`
- Modify: `clients/desktop/src/renderer/print/DocumentRenderer.tsx`
- Modify: `clients/desktop/src/renderer/print/DocumentRenderer.css` or the existing print CSS file selected after inspection
- Test: `clients/desktop/src/renderer/print/DocumentRenderer.test.tsx`

**Interfaces:**
- `ApprovalRenderModel.body.lineItems` is an optional UUID-free projection with the exact allowlisted EstimateLineResponse field names.
- `DocumentRenderer` renders detail table/image layers through the existing `PrintLayout` shell.

- [ ] Step 1: Add failing renderer tests for 0/1/N rows, distinct item and amount output, image geometry, unsafe image omission, and legacy v2 unchanged output.
- [ ] Step 2: Run `cd clients/desktop; npx vitest run src/renderer/print/DocumentRenderer.test.tsx`; expected the new assertions fail.
- [ ] Step 3: Implement the minimal line-item projection, column renderer, empty copy `데이터가 없습니다.`, image normalization, detail table CSS, repeating `thead`, and row break guard.
- [ ] Step 4: Re-run the focused renderer test and the existing golden test `npx vitest run src/renderer/print/approvalRenderGolden.test.tsx`; expected new tests pass and goldens remain unchanged.
- [ ] Step 5: Mutate the renderer by removing row mapping or geometry style and run focused tests; expected distinct output/geometry assertions fail. Restore the code.

### Task 4: Editor palette/inspector/draft RED/GREEN

**Files:**
- Modify: `clients/desktop/src/renderer/components/documentTemplate/useTemplateDraft.ts`
- Modify: `clients/desktop/src/renderer/components/documentTemplate/ElementPalette.tsx`
- Modify: `clients/desktop/src/renderer/components/documentTemplate/ElementInspector.tsx`
- Modify: `clients/desktop/src/renderer/components/documentTemplate/BandCanvas.tsx`
- Modify: `clients/desktop/src/renderer/routes/DocumentTemplateEditorPage.tsx`
- Modify: `clients/desktop/src/renderer/components/documentTemplate/documentTemplateEditor.css`
- Test: existing focused draft/component tests alongside new assertions where established patterns permit

**Interfaces:**
- `addElement('DETAIL'|'IMAGE')` creates valid schema v2 elements with deterministic keys.
- Inspector updates only allowlisted columns/src/geometry/style and stays disabled under existing permission/ACTIVE locks.

- [ ] Step 1: Add failing tests for palette add, default detail columns, image file selection, invalid source rejection, and 0/1/N preview values.
- [ ] Step 2: Run the focused component/draft test files; expected new assertions fail.
- [ ] Step 3: Extend existing controls with design-system imports only and connect the same `DocumentRenderer` preview.
- [ ] Step 4: Re-run focused component/draft tests and `npm run typecheck`; expected both pass.
- [ ] Step 5: Mutate `canEdit` propagation or remove column validation and rerun focused tests; expected hard failures. Restore the code.

### Task 5: Narrow Playwright hard gate and PDF fixture

**Files:**
- Modify: `clients/desktop/playwright/ac-868-document-template-editor.spec.ts`
- Modify: `clients/desktop/src/renderer/api/mock.ts` only for the existing mock route/seed used by this spec
- Create: `docs/qa/869-ds4-document-template/` screenshots/PDF evidence as generated QA artifacts if the repository convention requires tracked evidence

**Interfaces:**
- Existing mock seed exposes a detail/image template and deterministic 0/1/N fixture values; no invented route ids.

- [ ] Step 1: Add failing hard assertions for 7 viewport boundaries, actual line counts, horizontal overflow, hit-test, print media visibility, and detail/image presence with unique content.
- [ ] Step 2: Run only `cd clients/desktop; npx playwright test playwright/ac-868-document-template-editor.spec.ts`; expected failures identify missing UI/geometry/print behavior.
- [ ] Step 3: Implement only the missing mock/UI behavior and use visible-wait → click → enabled checks for permission-dependent controls.
- [ ] Step 4: Generate a real multi-page PDF with `page.pdf()` from a fixture with enough rows, then assert page count, no row split, and repeated header on page 2 using PDF text/geometry inspection.
- [ ] Step 5: Run the focused spec repeatedly (at least 3 consecutive runs) and preserve each console result; no full Playwright suite.

### Task 6: Print fidelity iteration and final verification

**Files:**
- Modify: only focused print/editor CSS and tests after evidence from each iteration
- Modify: `docs/dev-reports/2026-07-23-869-ds4-document-template-advanced.md`

- [ ] Step 1: Run mock capture/PDF round 1 and record the actual mismatch before changing CSS.
- [ ] Step 2: Apply the smallest CSS correction and run round 2; record the mismatch.
- [ ] Step 3: Apply the next correction and run round 3; record the mismatch.
- [ ] Step 4: Run rounds 4–5 only if a measured mismatch remains; never declare a one-shot fit.
- [ ] Step 5: Run the required desktop typecheck/vitest, focused Playwright, and full groupware Gradle command. Read console termination lines and record skipped/unavailable checks honestly.
