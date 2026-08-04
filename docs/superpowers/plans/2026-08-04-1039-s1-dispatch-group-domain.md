# S1 배차 그룹 도메인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `slip-service`에 운송사 마스터와 가배차 그룹의 영속 도메인·CRUD·전표 편입을 추가한다.

**Architecture:** 기존 `dispatch_task` 기반 레거시 차량 그룹과 분리된 `dispatch_groups` aggregate를 사용한다. `dispatch_group_slips.slip_id`는 동일 DB의 `slips(id)` FK로 보장하고, 운송사·그룹·편입 규칙은 application service와 PostgreSQL partial unique/check constraint 양쪽에서 검증한다.

**Tech Stack:** Java 21, Spring Boot, Spring Data JPA, PostgreSQL, Flyway, JUnit 5, Testcontainers.

## Global Constraints

- Flyway는 V104부터 사용하며 기존 컬럼/테이블 DROP 금지.
- `clients/**`, `PreClassifyService`, 전송 구현, Docker 조작, 전체 Gradle 스위트는 수정/실행하지 않는다.
- 신규 엔티티는 BaseEntity 7 audit + soft delete를 따른다.
- UUID는 API 응답 식별자로 노출하지 않고 groupNo, carrierCode, slipNo를 사용한다.
- `dispatch.board`는 기존 권한을 재사용하고 `hr.carriers`는 카탈로그 부재를 보고서에 명시한다.

### Task 1: 조사·권한·DB 계약을 테스트로 고정

**Files:**
- Create: `services/slip-service/src/test/java/com/samhanair/logis/slip/dispatchgroup/DispatchGroupSchemaContractTest.java`
- Create: `services/slip-service/src/test/java/com/samhanair/logis/slip/dispatchgroup/DispatchGroupDomainTest.java`
- Modify: `docs/dev-reports/2026-08-04-1039-s1-dispatch-group-domain.md`

- [ ] **Step 1: Write the failing domain tests** — `inclusion_type` OUTBOUND/INBOUND, group carrier nullable, duplicate active slip rejection, inactive carrier rejection, and soft-deleted slip rejection cases를 작성한다.
- [ ] **Step 2: Run tests and record expected RED output** — production classes/methods 부재로 실패함을 보고서에 append한다.
- [ ] **Step 3: Record permission and legacy evidence** — `rg` 출력 원문과 `dispatch_vehicle_group`가 현재 `DispatchTaskService`/기존 migration에 연결된 별도 aggregate임을 기록한다.

### Task 2: V104 스키마와 시드

**Files:**
- Create: `services/slip-service/src/main/resources/db/migration/V104__create_dispatch_group_domain.sql`
- Modify: `services/slip-service/src/test/java/com/samhanair/logis/slip/dispatchgroup/DispatchGroupSchemaContractTest.java`

- [ ] **Step 1: Add tables** — `carriers`, `dispatch_groups`, `dispatch_group_slips`에 BaseEntity 7 audit, UUID PK, check constraints, `slips(id)` FK를 추가한다.
- [ ] **Step 2: Add indexes/uniques** — 활성 `code`, `group_no`, `(group_id, slip_id)`, `slip_id` partial unique/index를 추가한다.
- [ ] **Step 3: Add exactly one seed** — `AROLOGIS`, `is_arologis=true`, active 상태 한 건만 idempotent seed한다.
- [ ] **Step 4: Run schema contract test** — V104, DROP 부재, seed 수, FK/index를 검증한다.

### Task 3: 운송사·그룹·편입 엔티티와 repository

**Files:**
- Create: `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/dispatchgroup/Carrier.java`
- Create: `.../DispatchGroup.java`
- Create: `.../DispatchGroupSlip.java`
- Create: `.../InclusionType.java`
- Create: `.../TransferStatus.java`
- Create: corresponding repositories under `repository/dispatchgroup/`
- Modify: `DispatchGroupDomainTest.java`

- [ ] **Step 1: Implement minimal entities** — factory methods, validation, carrier assignment, sequence update, soft-delete helpers를 작성한다.
- [ ] **Step 2: Run domain tests GREEN**.
- [ ] **Step 3: Add repository queries** — active lookup, group/date list, slip active membership, carrier active lookup를 추가한다.

### Task 4: 서비스·DTO·컨트롤러 CRUD

**Files:**
- Create: `service/dispatchgroup/DispatchGroupService.java`, `CarrierService.java`
- Create: request/response DTOs under `dto/dispatchgroup/`
- Create: `web/dispatchgroup/DispatchGroupAdminController.java`, `CarrierAdminController.java`
- Create: service/controller tests

- [ ] **Step 1: Write failing service tests** — CRUD, nullable carrier, inactive carrier 지정 실패, UUID 비노출을 검증한다.
- [ ] **Step 2: Implement minimal services/controllers** — `/admin/dispatch-groups`, `/admin/carriers`, `dispatch.board` 및 신설 `hr.carriers` 가드를 적용한다.
- [ ] **Step 3: Run focused unit/controller tests GREEN**.

### Task 5: 전표 편입·삭제 양방향 보호

**Files:**
- Modify: `DispatchGroupService.java`
- Modify: existing slip deletion service/repository path identified by grep
- Create: `DispatchGroupSlipLifecycleIT.java`

- [ ] **Step 1: Write failing lifecycle tests** — 활성 전표 편입, OUTBOUND/INBOUND, 제외·순서 변경, 담긴 전표 삭제 차단, 중복 그룹 차단, 비활성 운송사 기존 그룹 보존을 검증한다.
- [ ] **Step 2: Implement add/remove/reorder and deletion guard** — 추가 시 active `Slip` 확인, 삭제 시 활성 편입 존재를 검사한다.
- [ ] **Step 3: Run lifecycle test GREEN**.

### Task 6: Spring 컨텍스트 IT·종료조건 증거·보고서

**Files:**
- Create/modify: `services/slip-service/src/test/java/com/samhanair/logis/slip/it/dispatchgroup/DispatchGroupContextIT.java`
- Modify: `docs/dev-reports/2026-08-04-1039-s1-dispatch-group-domain.md`

- [ ] **Step 1: Add context-load IT** — `@SpringBootTest(classes = SlipServiceApplication.class)`와 기존 `AbstractPostgresIT`를 사용해 신규 빈 배선을 검증한다.
- [ ] **Step 2: Run focused domain tests and context IT** — 출력 원문을 보고서에 append한다.
- [ ] **Step 3: Run required grep reference sweep** — 새 식별자·endpoint·권한·테이블명을 전수 조사하고 출력 원문을 append한다.
- [ ] **Step 4: Enumerate new state combinations** — 삭제 전표, 비활성 carrier 기존 그룹, 동일 slip 중복, carrier 없음, OUTBOUND/INBOUND, transfer status 등을 실제 테스트 결과와 함께 기록한다.
- [ ] **Step 5: Inspect diff/status** — `clients/**`와 금지 대상 변경 여부, 신규 파일 목록을 확인한다.

