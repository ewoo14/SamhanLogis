# D-G7 교차 서비스 TOCTOU 수정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CONFIRMED 영업수수료 정산서와 활성 결재 참조 사이의 교차 서비스 경합에서 `DRAFT + 활성 참조`가 저장되지 않도록 accounting claim/CAS 직렬화를 추가한다.

**Architecture:** accounting의 `sales_commission_settlements` 행을 두 쓰기의 공통 직렬화 지점으로 사용한다. 결재별 claim은 accounting DB에 저장되며 `RESERVED`(첨부 저장 중)와 `ACTIVE`(첨부 저장 성공 직전/후) 상태, 소유 결재 UUID, 유효기간을 가진다. groupware는 첨부 전에 claim을 예약하고 로컬 첨부 transaction 안에서 claim을 활성화한다. 취소는 정산 행 잠금 아래 groupware 기존 활성 참조 조회와 claim 유효성 검사를 모두 통과해야만 DRAFT 전이를 저장한다.

**Tech Stack:** Spring Boot, Spring Data JPA, PostgreSQL/Flyway, RestClient, JUnit 5, Mockito.

## Global Constraints

- 분산 트랜잭션·2PC를 도입하지 않는다.
- groupware V19 migration과 기존 역조회 구현은 수정하지 않는다.
- 모든 claim은 BaseEntity soft-delete/audit 규약을 따른다.
- claim은 정산서당 단일 행이 아니라 `(settlement, approvalId)`별 행이다.
- claim 해제 실패는 RESERVED 30초, ACTIVE 5분 유효기간 만료로 자가 치유한다.
- git 조작·공유 DB write·배포는 하지 않는다.

### Task 1: accounting claim 도메인과 잠금 계약

**Files:**
- Create: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain/SalesCommissionSettlementApprovalClaim.java`
- Create: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain/SalesCommissionSettlementApprovalClaimStatus.java`
- Create: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/repository/SalesCommissionSettlementApprovalClaimRepository.java`
- Modify: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/repository/SalesCommissionSettlementRepository.java`
- Create: `services/accounting-service/src/main/resources/db/migration/V100__add_sales_commission_settlement_approval_claim.sql`
- Create: `services/accounting-service/src/test/java/com/samhanair/logis/accounting/migration/SalesCommissionSettlementApprovalClaimMigrationSqlTest.java`
- Create: `services/accounting-service/src/test/java/com/samhanair/logis/accounting/domain/SalesCommissionSettlementApprovalClaimTest.java`

- [ ] **Step 1: Write failing tests** for claim owner, status transition, expiry and migration index/FK/soft-delete columns.
- [ ] **Step 2: Run the focused tests** and confirm they fail because the claim types/table do not exist.
- [ ] **Step 3: Implement** the entity, enum, repository queries and V100 migration. Add pessimistic-lock lookup by settlement document number and an indexed active-claim query.
- [ ] **Step 4: Run focused accounting migration/domain tests** and confirm they pass.

### Task 2: accounting claim service and conditional cancellation

**Files:**
- Create: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/SalesCommissionSettlementApprovalClaimService.java`
- Modify: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/SalesCommissionSettlementService.java`
- Modify: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/repository/SalesCommissionSettlementRepository.java`
- Modify: `services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/SalesCommissionSettlementServiceTest.java`
- Create: `services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/SalesCommissionSettlementApprovalClaimServiceTest.java`

- [ ] **Step 1: Write failing tests** for reserve-on-CONFIRMED, reject-on-DRAFT, multiple approval claims, idempotent same-owner retry, release, expiry self-heal, and cancellation/claim lock ordering.
- [ ] **Step 2: Run the focused tests** and confirm the missing service/constructor behavior fails.
- [ ] **Step 3: Implement** reserve/activate/release/release-by-approval and `assertNoActiveClaims` under the locked settlement row. Make cancellation load the settlement with `PESSIMISTIC_WRITE`, preserve the existing groupware fail-closed check, then check claims before history capture and DRAFT mutation.
- [ ] **Step 4: Run the focused service tests** and confirm all existing no-approval/active-approval behavior remains green.

### Task 3: accounting internal claim API and groupware client

**Files:**
- Create: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/AccountingInternalSettlementApprovalClaimController.java`
- Create: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/dto/SettlementApprovalClaimRequest.java`
- Create: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/dto/SettlementApprovalClaimResponse.java`
- Create: `services/groupware-service/src/main/java/com/samhanair/logis/groupware/client/AccountingSettlementApprovalClaimClient.java`
- Create: `services/groupware-service/src/test/java/com/samhanair/logis/groupware/client/AccountingSettlementApprovalClaimClientTest.java`
- Create: `services/accounting-service/src/test/java/com/samhanair/logis/accounting/web/AccountingInternalSettlementApprovalClaimControllerTest.java`

- [ ] **Step 1: Write failing REST contract tests** for internal token, reserve/activate/release paths and 409 propagation.
- [ ] **Step 2: Run focused contract tests** and confirm they fail because endpoints/client do not exist.
- [ ] **Step 3: Implement** internal-only endpoints and a fail-closed groupware RestClient wrapper. Keep the claim token internal and never include it in user DTOs.
- [ ] **Step 4: Run focused client/controller tests** and confirm they pass.

### Task 4: groupware attachment lifecycle and terminal-state release

**Files:**
- Modify: `services/groupware-service/src/main/java/com/samhanair/logis/groupware/service/ApprovalAttachmentService.java`
- Modify: `services/groupware-service/src/main/java/com/samhanair/logis/groupware/service/ApprovalLineService.java`
- Modify: `services/groupware-service/src/main/java/com/samhanair/logis/groupware/repository/ApprovalAttachmentRepository.java`
- Modify: `services/groupware-service/src/test/java/com/samhanair/logis/groupware/service/ApprovalAttachmentSettlementPolicyTest.java`
- Modify: `services/groupware-service/src/test/java/com/samhanair/logis/groupware/service/ApprovalLineApprovalConflictTest.java`
- Create: `services/groupware-service/src/test/java/com/samhanair/logis/groupware/service/ApprovalAttachmentSettlementClaimTest.java`

- [ ] **Step 1: Write failing tests** for DRAFT rejection, CONFIRMED reserve/activate, save failure compensation, release failure expiry contract, two approvals on one settlement, delete release, and REJECTED/WITHDRAWN release.
- [ ] **Step 2: Run focused groupware tests** and confirm the stale-attachment path still succeeds or the new client is missing.
- [ ] **Step 3: Implement** settlement-only claim calls around the existing reference construction/save path. Release claims on attachment deletion and on REJECTED/WITHDRAWN transitions; preserve FILE, slip, partner-ledger and existing V19/reverse-lookup behavior.
- [ ] **Step 4: Run focused groupware tests** and confirm compensation is idempotent and existing attachment behavior is unchanged.

### Task 5: regression matrix, original RED reproduction and report

**Files:**
- Create/Modify: `services/accounting-service/src/test/java/com/samhanair/logis/accounting/it/SalesCommissionSettlementApprovalClaimIT.java`
- Create/Modify: `services/groupware-service/src/test/java/com/samhanair/logis/groupware/it/GroupwareSettlementApprovalClaimIT.java`
- Create: `docs/dev-reports/2026-08-11-dg7-toctou-fix.md`

- [ ] **Step 1: Add RED-A/RED-B and orphan-claim tests** with explicit allowed winners and forbidden final states.
- [ ] **Step 2: Run the focused integration tests** without touching any shared database; skip only when Docker/Testcontainers is unavailable and record that fact.
- [ ] **Step 3: Run accounting’s full `--rerun-tasks` test command** and aggregate all XML results.
- [ ] **Step 4: Write the Korean report** with original reproduction before the fix, claim/CAS coordinates, exact residual windows, orphan self-healing/user escape, multi-approval model, unchanged S1/S2 behavior, combination table and fresh test totals.
- [ ] **Step 5: Verify worktree diff and requested scope**; do not commit, push, deploy or modify `samhan-*` resources.
