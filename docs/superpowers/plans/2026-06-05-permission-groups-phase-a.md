# 동적 권한그룹 Phase A 구현 계획

> **실행 방식(프로젝트 규칙 우선)**: superpowers subagent-driven 대신 **Codex 구현 + Claude dual 5-team review + 사이클 N=2 + CI green + Docker 실QA + PM 자율 머지**([[feedback_codex_implements_claude_reviews]], [[feedback_dual_5agent_review]], [[feedback_pm_permission_autonomy]]). 체크박스는 진행 추적용.

**Goal:** MASTER(+위임계정 — Phase B)가 권한그룹을 생성·삭제하고 권한 매트릭스로 그룹별 권한을 설정하며, 계정을 그룹에 다중 배속할 수 있게 한다.

**Architecture:** auth-service 에 그룹 4테이블 신설. 계정 실권한 = 개별 override(우선) ?? 그룹 합집합 을 `account_page_permissions`(기존 enforcement 캐시)로 재materialize → `@RequirePermission` enforcement 경로 무변경. 9 고정역할은 시드 기본 그룹으로 이관해 무중단.

**Tech Stack:** Java 17 / Spring Boot 3 / Flyway / PostgreSQL(service-per-DB) / JPA. desktop = React + design-system. 테스트 = JUnit5 + Testcontainers IT + Playwright(VITE_MOCK_MODE).

**Spec:** `docs/superpowers/specs/2026-06-05-permission-groups-phase-a-design.md` (D-PG-01~05)

---

## 파일 구조

### 백엔드 (services/auth-service)
- `db/migration/V42__permission_groups_tables.sql` — 4 테이블 DDL
- `db/migration/V43__seed_role_groups.sql` — 9역할→기본그룹 + MASTER 그룹 시드
- `db/migration/V44__assign_accounts_to_groups.sql` — 기존 계정 배속
- `domain/PermissionGroup.java`, `GroupPagePermission.java`, `AccountGroup.java`, `AccountPermissionOverride.java` (+ BaseEntity 7 audit + soft delete)
- `repository/PermissionGroupRepository.java`, `GroupPagePermissionRepository.java`, `AccountGroupRepository.java`, `AccountPermissionOverrideRepository.java`
- `service/EffectivePermissionMaterializer.java` — override ?? union 재계산
- `service/PermissionGroupService.java` — 그룹 CRUD
- `service/GroupPermissionService.java` — 그룹 매트릭스 조회/갱신
- `service/AccountGroupService.java` — 계정 배속
- `web/PermissionGroupController.java` — 그룹/배속 API
- `web/dto/` — 요청/응답 DTO
- 기존 `AccountPermissionService`(계정 매트릭스) → `account_permission_overrides` 대상으로 전환

### 프런트 (clients/desktop)
- `features/admin/permissions/PermissionGroupMatrixPage.tsx` — 그룹 선택 매트릭스
- `features/admin/permissions/PermissionGroupManagePage.tsx` — 그룹 CRUD + 계정 배속
- `api/admin/permissionGroupsApi.ts`
- 사이드바/라우트 등록 + PermissionGuard

### 테스트
- `services/auth-service/src/test/java/.../it/PermissionGroupControllerIT.java`
- `.../it/EffectivePermissionMaterializerIT.java`
- `.../it/PermissionGroupSeedIT.java` (시드 정합)
- `clients/desktop/.../permission-groups.spec.ts`
- `docs/qa/permission-groups-phase-a/real-qa-evidence.md`

---

## Task 1: 마이그레이션 V42 — 4 테이블 DDL

**Files:** Create `services/auth-service/src/main/resources/db/migration/V42__permission_groups_tables.sql`

- [ ] **Step 1**: 4 테이블 생성. 컬럼/제약은 spec §3 따름. 각 테이블 BaseEntity 7 audit(created_at/by, updated_at/by, is_deleted) + soft-delete 부분 UNIQUE 인덱스.
  - `permission_groups`(id, name UNIQUE(active), description, is_builtin, is_system_master, audit)
  - `group_page_permissions`(id, group_id FK, page_code, can_view/create/update/delete/restore/download/print, UNIQUE(group_id,page_code) WHERE NOT is_deleted, audit)
  - `account_groups`(id, account_id FK, group_id FK, UNIQUE(account_id,group_id) WHERE NOT is_deleted, audit)
  - `account_permission_overrides`(id, account_id FK, page_code, 7 can_*, UNIQUE(account_id,page_code) WHERE NOT is_deleted, audit)
  - 인덱스: group_page_permissions(group_id), account_groups(account_id), account_groups(group_id), account_permission_overrides(account_id).
- [ ] **Step 2**: 기존 마이그레이션 컨벤션(V39/V41) 의 audit 컬럼 타입·기본값·명명 정확히 일치 확인.
- [ ] **Step 3**: Flyway clean migrate 로컬 검증(Docker auth_db) — 4테이블 생성 확인.
- [ ] **Step 4**: 커밋.

## Task 2: 마이그레이션 V43 — 기본 그룹 시드 (9역할 + MASTER)

**Files:** Create `V43__seed_role_groups.sql`

- [ ] **Step 1**: MASTER 그룹 1건 INSERT(결정적 UUID, name='마스터', is_builtin=true, is_system_master=true). group_page_permissions 없음(bypass).
- [ ] **Step 2**: 9역할(MANAGER/SALES/WAREHOUSE/ACCOUNTANT/INVENTORY/DISPATCH/DRIVER/STAFF/DEVELOPER) → permission_groups INSERT(결정적 UUID per role_code, name=Role enum 한글명, is_builtin=false). 한글명은 `Role.java` displayName 사용.
- [ ] **Step 2b**: 결정적 UUID = role_code 기반(예: md5 namespace) 으로 V44/테스트가 참조 가능하게. SQL 내 고정 UUID 리터럴로 명시(재현성).
- [ ] **Step 3**: `role_page_permission_templates` 의 각 역할 행 → 대응 그룹의 `group_page_permissions` 로 복사(7액션 그대로, MASTER 제외).
- [ ] **Step 4**: 로컬 검증 — `SELECT name, is_builtin FROM permission_groups`(10건), group_page_permissions 카운트 == 9역할 template 카운트.
- [ ] **Step 5**: 커밋.

## Task 3: 마이그레이션 V44 — 기존 계정 배속

**Files:** Create `V44__assign_accounts_to_groups.sql`

- [ ] **Step 1**: 모든 active account → 자기 `accounts.role` 에 대응하는 시드 그룹(V43 결정적 UUID)으로 `account_groups` INSERT 1건. (PARTNER 계정 없음 — accounts.role enum 10개 한정.)
- [ ] **Step 2**: 정합 검증 쿼리(주석): 시드 후 `account_page_permissions`(기존, role template 에서 materialize) 가 `override(없음) ?? union(단일 그룹)` 결과와 동치여야 함(그룹 권한 == 역할 template 이므로 동일).
- [ ] **Step 3**: 로컬 검증 — account_groups 카운트 == active account 카운트. 샘플 계정 effective 동치.
- [ ] **Step 4**: 커밋.

## Task 4: 도메인 엔티티 + repository

**Files:** Create 4 도메인 + 4 repository (파일구조 참조)

- [ ] **Step 1**: BaseEntity 상속 엔티티 4개. JPA 매핑(컬럼명 snake_case, @SQLRestriction/@Where soft-delete 기존 컨벤션 따름). enum page_code 는 String 저장(PageCode 컨벤션 확인 — 기존 account_page_permissions 매핑과 동일하게).
- [ ] **Step 2**: repository: 
  - PermissionGroupRepository: findByNameAndIsDeletedFalse, findByIsDeletedFalse, findById.
  - GroupPagePermissionRepository: findByGroupIdAndIsDeletedFalse.
  - AccountGroupRepository: findByAccountIdAndIsDeletedFalse, findByGroupIdAndIsDeletedFalse, countByGroupIdAndIsDeletedFalse.
  - AccountPermissionOverrideRepository: findByAccountIdAndIsDeletedFalse.
- [ ] **Step 3**: 컴파일(`:services:auth-service:compileJava`).
- [ ] **Step 4**: 커밋.

## Task 5: EffectivePermissionMaterializer + IT

**Files:** Create `service/EffectivePermissionMaterializer.java`, Test `it/EffectivePermissionMaterializerIT.java`

- [ ] **Step 1 (test first)**: Testcontainers IT — 계정에 그룹 2개 배속(권한 합집합 검증), override 페이지 1개(우선·deny 검증), materialize 후 `account_page_permissions` 가 `override ?? union` 와 일치 단언. MASTER 계정은 account_page_permissions 행 없음(bypass) 단언.
- [ ] **Step 2**: 구현 — `materializeForAccount(accountId)`: 계정 그룹들의 group_page_permissions OR 집계 → page 별 union. override 존재 page 는 override 값으로 대체. 기존 account_page_permissions soft-delete 후 재INSERT(또는 upsert). `materializeForGroup(groupId)`: 해당 그룹 배속 전 계정 materializeForAccount 반복.
- [ ] **Step 3**: IT 통과 확인.
- [ ] **Step 4**: 커밋.

## Task 6: PermissionGroupService (CRUD) + IT

**Files:** Create `service/PermissionGroupService.java`, IT 케이스 추가

- [ ] **Step 1 (test first)**: 그룹 생성(이름 UNIQUE 위반 409), 개명, 삭제(빈 그룹 OK / 배속 계정 존재 시 409 차단), 빌트인(MASTER/is_builtin) 삭제·개명 금지(409/403). 
- [ ] **Step 2**: 구현 — create/rename/delete. delete 시 `countByGroupIdAndIsDeletedFalse > 0` → 예외(409). is_builtin → 수정/삭제 차단.
- [ ] **Step 3**: IT 통과.
- [ ] **Step 4**: 커밋.

## Task 7: GroupPermissionService (매트릭스) + AccountGroupService (배속) + IT

**Files:** Create `service/GroupPermissionService.java`, `service/AccountGroupService.java`

- [ ] **Step 1 (test first)**: 그룹 매트릭스 일괄 갱신 → 그 그룹 배속 계정들 account_page_permissions 재materialize 반영(IT 로 effective 변화 단언). 계정 배속 추가/제거 → 재materialize. override 있는 계정은 그룹 변경에도 override page 불변.
- [ ] **Step 2**: 구현 — GroupPermissionService.updateGroupMatrix(groupId, rows) → group_page_permissions upsert + materializeForGroup. AccountGroupService.assign/unassign(accountId, groupId) → account_groups + materializeForAccount.
- [ ] **Step 3**: IT 통과.
- [ ] **Step 4**: 커밋.

## Task 8: 컨트롤러 + DTO + 실HTTP IT

**Files:** Create `web/PermissionGroupController.java`, `web/dto/*`, Test `it/PermissionGroupControllerIT.java`

- [ ] **Step 1 (test first)**: 실HTTP IT(Testcontainers + MockMvc): 엔드포인트별 `@RequirePermission(system.permission-admin)` 가드(비권한 403, MASTER bypass 200), CRUD/매트릭스/배속 end-to-end, false-green 방지(verify + 실 DB 단언).
- [ ] **Step 2**: 구현 — 엔드포인트(spec §5):
  - `GET/POST/PUT/DELETE /auth/admin/permission-groups`
  - `GET/PUT /auth/admin/permission-groups/{id}/permissions`
  - `GET/POST/DELETE /auth/admin/accounts/{accountId}/groups`
  - 전부 `@RequirePermission(page="system.permission-admin", action=VIEW/UPDATE/...)`. 한국어 Javadoc + springdoc([[feedback_function_documentation]]). UUID 비노출 응답(그룹명/표시명).
- [ ] **Step 3**: IT 통과 + 외부 client @MockBean 격리([[feedback_it_mockbean_external_clients]]).
- [ ] **Step 4**: 커밋.

## Task 9: 신규 PageCode + 계정 override 전환

**Files:** Modify `domain/PageCode.java`(+ V 마이그레이션 시드 if needed), 기존 `AccountPermissionService`

- [ ] **Step 1**: PageCode 에 `admin.permission-groups` 추가(그룹 관리 화면; Phase A 는 system.permission-admin 가드 사용, Phase B 위임 대상). 필요 시 templates/groups 시드.
- [ ] **Step 2**: 기존 계정 매트릭스 API/서비스(`AccountPermissionService`)가 직접 `account_page_permissions` 를 쓰던 것을 `account_permission_overrides` 대상으로 전환(개별=override 우선). 저장 시 materializeForAccount 호출로 effective 갱신. 기존 IT 갱신.
- [ ] **Step 3**: IT 통과(override 우선·deued enforcement 회귀).
- [ ] **Step 4**: 커밋.

## Task 10: 프런트 — 그룹 매트릭스 + 관리 + 배속

**Files:** Create FE 파일(파일구조), Test `permission-groups.spec.ts`

- [ ] **Step 1 (test first)**: Playwright(VITE_MOCK_MODE, in-process mock [[feedback_inprocess_mock_principles]]): 그룹 선택→매트릭스 토글→저장 토스트, 그룹 추가/개명/삭제(빌트인 잠금), 계정 다중 배속. testid 명시.
- [ ] **Step 2**: 구현 — PermissionGroupMatrixPage(기존 매트릭스 컴포넌트 재사용, 대상 account→group), PermissionGroupManagePage(목록+CRUD+배속), api 클라이언트, 사이드바/라우트("권한설정">"권한그룹"), PermissionGuard. UUID 비노출.
- [ ] **Step 3**: `npm run typecheck`([[feedback_desktop_typecheck_command]]) + Playwright green.
- [ ] **Step 4**: 커밋.

## Task 11: Docker 실 QA + dev-report + 문서동기화

**Files:** Create `docs/qa/permission-groups-phase-a/real-qa-evidence.md`, `docs/dev-reports/slice-permission-groups-phase-a.md`, 문서동기화([[feedback_continuous_docs_sync]])

- [ ] **Step 1**: 실 스택 기동 + 신 이미지 재빌드(`docker compose build auth-service` 등, [[project_local_stack_qa_gotchas]]). 그룹 생성→권한부여→계정배속→해당 계정 실 gateway 200/403 + psql 그룹/배속/effective 실측 캡처([[feedback_no_fake_data_ever]]).
- [ ] **Step 2**: dev-report + QA evidence + README/ROADMAP/overview.html 동기화.
- [ ] **Step 3**: 커밋.

---

## Self-Review (스펙 대조)

- **D-PG-01**(MASTER 빌트인) → Task 2(V43 MASTER 그룹), Task 6(빌트인 삭제금지). ✓
- **D-PG-02**(M:N 합집합) → Task 1(account_groups), Task 5(union). ✓
- **D-PG-03**(개별 override 우선+deny) → Task 1(account_permission_overrides), Task 5(override ?? union), Task 9(계정 매트릭스→override). ✓
- **D-PG-04**(enforcement 무변경/재materialize) → Task 5(materializer→account_page_permissions), Task 8(@RequirePermission 무수정). ✓
- **D-PG-05**(위임/하드게이트 Phase A 제외) → 컨트롤러 가드 system.permission-admin 유지(Task 8), 위임 미포함. ✓
- 9역할 시드이관 → Task 2/3. ✓  무중단(effective 동치) → Task 3 검증 + Task 5 IT. ✓
- 실QA/실데이터 → Task 11. ✓
- **갭 없음.**

> ⚠️ 실행 시 task 간 dependency: 1→2→3(마이그레이션 순서) / 4→5→6/7→8→9(BE) / 10(FE, 8 이후) / 11(전체 후). Codex 디스패치는 BE 묶음(1~9) 먼저, FE(10), QA(11) 순. [[feedback_open_pr_early]] = Task 1~4 첫 push 직후 PR 개설 후 누적.
