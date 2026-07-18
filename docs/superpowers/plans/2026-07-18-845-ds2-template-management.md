# DS-2 Document Template Management Implementation Plan

> **For agentic workers:** This plan is executed inline in the current workspace. Git add/commit/push/checkout are forbidden by the task contract; the PM will inspect the files and commit them.

**Goal:** Persist docType-scoped document layouts in groupware-service, expose their lifecycle through the existing approval-template permission, and make the desktop approval renderer consume the active layout with deterministic DEFAULT fallback.

**Architecture:** Add a standalone `document_templates` aggregate with typed `DocumentPayload` JSONB and a V10-only migration. The service validates the same layout invariants as the desktop parser, activates at most one non-deleted row per docType using an explicit bulk demotion plus optimistic locking, and returns a TemplateEnvelope-shaped response. The desktop API normalizes the envelope; `ApprovalDocView` resolves one layout after its queries settle and hands the result to the existing `DocumentRenderer`.

**Tech Stack:** Spring Boot/JPA, PostgreSQL/Flyway, Jackson JSONB, Testcontainers, React Query, React, Vitest.

## Global Constraints

- Git commands are forbidden; modify files only and leave commit/push to the PM.
- `DocumentTemplate` extends `BaseEntity`, uses `@SQLRestriction("is_deleted = false")`, UUID generation, private constructor/static `create()`, chain domain methods, and Korean Javadoc.
- Only `V10__add_document_templates.sql` may be added; V1-V9 and auth/page-code migrations remain unchanged; Flyway remains `out-of-order=false` and JPA remains `ddl-auto=validate`.
- JSONB uses `@JdbcTypeCode(SqlTypes.JSON)` and `@Column(columnDefinition="jsonb")`.
- Client requests never mass-assign id/status/revision/lock_version/audit fields; `lock_version` is never returned.
- Active-layout queries use `retry:false` and `refetchOnReconnect:false`; every error, malformed payload, not-found, timeout, and late result converges to DEFAULT once.
- No UUID or invented catalog IDs are rendered to users.

---

### Task 1: Establish shared corpus and failing domain/validator tests

**Files:**
- Create: `services/groupware-service/src/test/resources/document-template-fixtures/valid-default.json`
- Create: `services/groupware-service/src/test/resources/document-template-fixtures/valid-reordered-sparse.json`
- Create: `services/groupware-service/src/test/resources/document-template-fixtures/invalid-*.json`
- Create: `services/groupware-service/src/test/java/com/samhanair/logis/groupware/service/DocumentPayloadValidatorTest.java`
- Create: `clients/desktop/src/renderer/print/document-template-fixtures.test.ts`

**Interfaces:** The corpus is canonical JSON read by Java resource loading and by desktop Vitest through a repository-relative path. Valid fixtures must contain `schemaVersion=1` and exactly one TITLE, APPROVAL_GRID, and CLOSING; invalid fixtures cover unknown version/paper/band/element, duplicate keys, placement/count violations, depth and size limits.

- [ ] Write focused tests for valid acceptance, invalid rejection, 64KB/depth/band/element/key limits, reserved docType, and fixture parity.
- [ ] Run the focused BE/FE tests and confirm they fail because the validator/corpus loader and FE limit checks are not implemented.

### Task 2: Add the V10 schema and typed aggregate

**Files:**
- Create: `services/groupware-service/src/main/java/com/samhanair/logis/groupware/domain/DocumentTemplateStatus.java`
- Create: `services/groupware-service/src/main/java/com/samhanair/logis/groupware/domain/DocumentPayload.java`
- Create: `services/groupware-service/src/main/java/com/samhanair/logis/groupware/domain/DocumentTemplate.java`
- Create: `services/groupware-service/src/main/resources/db/migration/V10__add_document_templates.sql`

**Interfaces:** `DocumentTemplate.create(String docType, String name, short schemaVersion, DocumentPayload document)` returns DRAFT/revision 1. Domain chains are `updateDocument`, `activate`, `deactivate`, `rename`, and `softDelete`; DRAFT-only document updates increment revision, while rename/status changes do not. `lock_version` is a non-null `@Version` field and is not exposed by DTOs.

- [ ] Add failing aggregate tests for creation defaults, DRAFT-only document update, lifecycle idempotence, rename, soft-delete, and JSONB mapping.
- [ ] Add V10 with exact columns, status CHECK, active/name partial unique indexes, and guarded approval-line backfill (`length(...) <= 40`) with no seed.
- [ ] Implement the aggregate and run the focused test to green.

### Task 3: Implement validator, repository, DTOs, and service lifecycle

**Files:**
- Create: `services/groupware-service/src/main/java/com/samhanair/logis/groupware/service/DocumentPayloadValidator.java`
- Create: `services/groupware-service/src/main/java/com/samhanair/logis/groupware/repository/DocumentTemplateRepository.java`
- Create: `services/groupware-service/src/main/java/com/samhanair/logis/groupware/dto/DocumentTemplateCreateRequest.java`
- Create: `services/groupware-service/src/main/java/com/samhanair/logis/groupware/dto/DocumentTemplateUpdateRequest.java`
- Create: `services/groupware-service/src/main/java/com/samhanair/logis/groupware/dto/DocumentTemplateResponse.java`
- Create: `services/groupware-service/src/main/java/com/samhanair/logis/groupware/service/DocumentTemplateService.java`

**Interfaces:** The repository exposes active lookup, non-deleted docType listing, and `demoteOtherActive(String docType, UUID targetId, LocalDateTime now, String actor)`. The service exposes create/update/activate/deactivate/softDelete/find/list/get and validates on create/update/activate. Reserved docTypes are `GROUPWARE_DEFAULT` and `DEFAULT`; ACTIVE updates return UNPROCESSABLE_ENTITY; activation conflict and optimistic-lock failures return CONFLICT.

- [ ] Add service tests for reserved names, name uniqueness, ACTIVE update rejection, validation at all three boundaries, idempotent activation, demotion audit/version increment, and soft deletion.
- [ ] Implement validator and repository with explicit bulk audit/lock-version update, followed by service transaction `flush()` before target activation.
- [ ] Run focused service tests and then the groupware compile test task.

### Task 4: Expose authenticated/admin HTTP contracts and ApprovalLine documentType

**Files:**
- Create: `services/groupware-service/src/main/java/com/samhanair/logis/groupware/controller/GroupwareDocumentTemplateController.java`
- Modify: `services/groupware-service/src/main/java/com/samhanair/logis/groupware/dto/ApprovalLineAdminResponse.java`
- Modify: `clients/desktop/src/renderer/api/groupwareApproval.ts`

**Interfaces:** Admin routes are `/admin/groupware/document-templates` CRUD plus `/{id}/activate` and `/{id}/deactivate`, guarded by `groupware.approval-templates` VIEW/UPDATE. Renderer route is `/groupware/document-templates/active?docType=`, authenticated-only. Responses are standard `ApiResponse` envelopes; response data includes schemaVersion/revision/docType/name/document plus id/status, never lock_version/audit.

- [ ] Add MockMvc tests for permission guards, CRUD status codes, activation/deactivation, active lookup, malformed payload handling, and absent active response.
- [ ] Implement the controller using the established groupware approval-template route and exception patterns.
- [ ] Add `documentType` to the admin approval response from `line.getDocumentType()` and update the desktop type.

### Task 5: Add BE integration matrix and canonical round-trip artifact

**Files:**
- Create: `services/groupware-service/src/test/java/com/samhanair/logis/groupware/it/DocumentTemplateIT.java`
- Create: `services/groupware-service/src/test/resources/document-template-fixtures/canonical-active-response.json`

**Interfaces:** Testcontainers PostgreSQL must exercise Flyway V1→V10 plus `ddl-auto=validate`, CRUD, partial indexes/CHECK, concurrent activation variants, stale optimistic locking, backfill 30/31-character boundaries, typed JSONB round-trip, corpus parity, upper-bound acceptance/rejection, soft-delete, and HTTP POST→activate→active GET for the DEFAULT payload.

- [ ] Write the integration assertions and run them against fresh PostgreSQL, recording real failures rather than hiding skips.
- [ ] Fix schema/entity/service defects until the matrix is green.
- [ ] Save the canonical active-response JSON from the HTTP round trip for the desktop golden test.

### Task 6: Make DEFAULT immutable and add active-layout API

**Files:**
- Create: `clients/desktop/src/renderer/api/documentTemplate.ts`
- Modify: `clients/desktop/src/renderer/print/templateSchema.ts`
- Modify: `clients/desktop/src/renderer/print/approvalDefaultTemplate.ts`

**Interfaces:** `findActiveDocumentTemplate(docType): Promise<TemplateEnvelope|null>` calls the authenticated renderer route and normalizes payload. `resolveDocumentTemplate` returns a deep clone of either parsed active payload or frozen canonical DEFAULT. The parser enforces the shared structural limits and reserved docTypes are not accepted by creation/update callers.

- [ ] Add failing Vitest cases for recursive freeze, mutation isolation, malformed API payload, canonical artifact parsing, and non-default reordered/sparse bands.
- [ ] Implement recursive freeze/deep clone, parser caps, and API normalization.
- [ ] Run the focused FE tests and typecheck.

### Task 7: Connect ApprovalDocView with one-time layout decision and route-level regressions

**Files:**
- Modify: `clients/desktop/src/renderer/print/ApprovalDocView.tsx`
- Create/modify: `clients/desktop/src/renderer/print/ApprovalDocView.test.tsx`
- Modify: `clients/desktop/src/renderer/print/DocumentRenderer.test.tsx`

**Interfaces:** `docType = approval.documentType ?? (templateCode ? 'GROUPWARE_' + templateCode : null)`. A query keyed by `['approval.documentType', docType]` is enabled only for a non-null docType, with retry/refetch-on-reconnect disabled. After approval/attachments/template/layout loading settles, the component fixes one `resolveDocumentTemplate(activeLayout?.document ?? null)` result and passes it to the real `DocumentRenderer`.

- [ ] Add route-level tests with API mocks for absent/active/error/malformed/pending-timeout/late-resolve/reconnect and assert real renderer output.
- [ ] Assert absent active layout output is byte-identical to the existing DEFAULT golden output and that late results never replace the chosen layout.
- [ ] Implement the query and stable decision, then run DS-1 golden 18 plus the new route-level suite.

### Task 8: Full verification and handoff

**Files:**
- Modify only files required by failing verification or fixture parity.

- [ ] Run `./gradlew :groupware-service:test` and record pass/fail/skip counts and any Docker limitation honestly.
- [ ] Run `cd clients/desktop && npm run typecheck && npm run test` and record pass/fail counts.
- [ ] Re-run the spec self-review against every requirement, inspect generated artifacts, and report changed files, assumptions, deviations, and unresolved items without invoking git.
