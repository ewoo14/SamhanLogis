# #1163 UUID History Leak Implementation Plan

> **For agentic workers:** Execute the tasks in order with RED/GREEN checkpoints. Git commit/push/PR operations are prohibited for this worktree.

**Goal:** Remove UUID-derived user-visible actor names from remaining audit/history/edit-request paths while preserving internal UUID keys and known names.

**Architecture:** Reuse the existing local controller/service name-resolution boundaries and the established `변경자 미상` display convention. Keep UUIDs in `actorId` arguments and internal audit columns; only sanitize values crossing into display-name fields. Fix the accounting batch audit recorder separately because it has no caller-name header.

**Tech Stack:** Java Spring Boot/Gradle, TypeScript React/Vitest, Playwright Chromium.

## Global Constraints

- 사용자 표시 문자열에는 UUID 전체·일부를 노출하지 않는다.
- 이름을 아는 경우의 표시와 `SYSTEM_ACTOR_ID → 시스템` 표시를 보존한다.
- UUID는 내부 route key·join key로 계속 허용한다.
- RED 테스트를 먼저 실패시킨 뒤 최소 수정으로 GREEN을 만든다.
- Git 조작과 공유 DB write를 하지 않는다.

---

### Task 1: Establish RED coverage for the accounting recorder and remaining name boundaries

**Files:**
- Create or modify the smallest existing unit tests next to each affected service.
- Test: `services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/DepositMatchAuditRecorderTest.java` (create if absent).
- Test: existing controller/service tests for inventory, arologis, slip, partner, partner-order, product, accounting edit-request and partner revision paths.

**Interfaces:**
- Deposit recorder must persist `actorName = "변경자 미상"` for a non-null UUID actor.
- Controller name resolvers must preserve a real name and reject a UUID caller/name.
- Existing `actorId` arguments remain the parsed UUID.

- [ ] Write one focused failing test per independently exposed boundary, including the accounting actorName prefix case.
- [ ] Run each focused test and record the expected failure before production edits.
- [ ] Add RED-B assertions for normal names, system actor, nullable revision behavior, and internal actorId preservation.

### Task 2: Implement minimal backend guards

**Files:**
- Modify affected `resolveName`/`resolveActorName` controller methods identified by the sweep.
- Modify `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/DepositMatchAuditRecorder.java`.
- Preserve `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/WarehouseService.java` and existing #1164 guard behavior.

- [ ] Replace UUID-to-name fallbacks with the established unknown-name/null result for the specific contract.
- [ ] Keep non-UUID legacy identifiers and known display names unchanged.
- [ ] Keep parsed UUIDs passed to service/audit methods unchanged.
- [ ] Run focused backend tests and then each affected service test task.

### Task 3: Verify desktop surface and live QA

**Files:**
- Modify desktop tests only if the sweep finds a user-visible UUID fallback not already covered.
- Create/update a real-QA spec under a directory and filename ending in `-real-qa`.
- Save screenshots only through `resolveQaShotsDir()`.

- [ ] Run desktop Vitest/typecheck and the inventory test suite.
- [ ] Start only an isolated desktop QA server, use hash-router URLs, and capture a unique warehouse/history element.
- [ ] Stop the server and report the explicit datasource URL and read-only/shared-DB status.

### Task 4: Write the evidence report

**Files:**
- Create: `docs/dev-reports/2026-08-12-1163-uuid-history-leak.md`.

- [ ] Record the two pre-fixed coordinates and every sweep coordinate in an O/X table.
- [ ] For every O, cite the exact file:line proving why it is not user-visible or already guarded.
- [ ] Record RED-A/RED-B, test commands, live QA screenshot paths, and any environment blocker.
