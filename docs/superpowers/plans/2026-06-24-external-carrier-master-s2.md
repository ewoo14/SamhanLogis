# 슬2 — 외부기사/배송사 마스터 (external_carrier) Implementation Plan

> **실행 = canonical workflow([[feedback_canonical_workflow]])**: Opus 기획+조기PR → **Codex 개발** → Opus·Codex 순차 듀얼리뷰(각 라운드 단계별 라이브QA 스샷) → 0수렴 → PM 종합 게시 → 머지. Claude 직접 구현 금지(리뷰 라운드 fix 예외). 체크박스(`- [ ]`) 추적.

**Goal:** 외부기사/배송사 **마스터**(external_carrier) 신설 — CRUD + 관리 메뉴 + 권한 시드. 슬3(타배송사 SMS)·슬4(인쇄)의 발송 대상 기반.

**Architecture:** slip-service에 `ExternalCarrier` 엔티티(BaseEntity 7 audit + `@SQLRestriction` soft delete, 패키지 `com.samhanair.logis.slip.domain.external`) + Repository/Service/Controller/DTO(**Warehouse(inventory-service) 패턴 모방**) + Flyway **V49**(external_carrier 단일 테이블). auth **V69**(page-code `dispatch.external-carriers` seed). FE `ExternalCarriersPage`(RegionsPage 패턴) + AppLayout 배차 메뉴 SidebarLink + routes PermissionGuard + mock + canAccess.

> **🔧 PM 정찰 보정 (2026-06-24, 세션 재개 시 코드 정찰로 확정 — dual review 대상):**
> 1. **단일 page-code `dispatch.external-carriers` + 7-action 그래뉼러**(VIEW/CREATE/UPDATE/DELETE/RESTORE). 플랜 초안의 dual code(`...`+`.manage`)는 RegionsPage(=arologis-service **role-mode**, `canView/canEdit` 2-bool)를 모범으로 삼은 것이나, **slip-service는 account-mode**(`PermissionAspect.checkPermission` → `client.check(accountId,page,action)` → `account_page_permissions.can_<action>` 그래뉼러). 동일 account-mode 형제(`inventory.dps`·`inventory.stock-balance`·`accounting.receivables`)가 전부 **단일 page-code + action enum**. 근거: `shared/security/.../PermissionAspect.java:201`(account 모드 `check`), `PermissionAction.java:54`(`column()=can_<action>`), `auth .../AccountPermissionService.java:31,54,70`(enforcement 소스=`account_page_permissions`).
> 2. **PageCode enum 등록 필수**(플랜 누락분): `auth .../domain/PageCode.java`(184개 레지스트리)에 `DISPATCH_EXTERNAL_CARRIERS("dispatch.external-carriers","외부기사/배송사 관리")`를 배차 섹션(`DISPATCH_BOARD` line 268 인근)에 추가. `/my` bulkLoad의 MASTER 분기 `allPageActions()`가 `PageCode.values()`를 순회하므로, **enum 미등록 시 dev_master 메뉴조차 미노출**.
> 3. **auth V69 = V66/V67 4-table seed 패턴**(role_page_permissions + role_page_permission_templates + group_page_permissions + account_page_permissions 파생). 플랜 초안의 "V34 cross-join"(role_page_permissions 단독)은 **role-mode 전용** → account-mode enforcement(account_page_permissions) 미해결. 모범=`auth .../V66__seed_accounting_receivables_page_permission.sql`. 그룹 id: MASTER=`...100`/MANAGER=`...101`/DISPATCH=`...106`(V43 확인). MASTER/MANAGER/DISPATCH 모두 view+create+update+delete+restore=TRUE(운영자 carrier 관리).

**Tech Stack:** Spring Boot 3 / Java 17 / Spring Data JPA / PostgreSQL(slip-service, auth-service); React + TS + design-system DataTable + react-query(clients/desktop). Testcontainers IT, vitest.

## Global Constraints
- **Flyway 신규**: slip **V49**(external_carrier 단일 테이블만) + auth **V69**(page-code seed). 적용 마이그 불변([[feedback_applied_migration_immutable]]) · fresh Postgres probe 검증([[feedback_migration_fresh_postgres_probe]]).
- **🚫 external_dispatch / external_dispatch_slip = 슬3 (선구현 금지)**. 슬2는 마스터(external_carrier)만.
- **page-code**: **단일 `dispatch.external-carriers` + action enum**(GET=VIEW, POST=CREATE, PATCH=UPDATE, DELETE=DELETE, restore=RESTORE). FE canAccess pageCode/action = BE @RequirePermission 정확 일치([[feedback_fe_canaccess_pagecode_be_match]]). 메뉴/라우트=`view`, 관리 버튼=`create`. (PM 정찰 보정 — 상단 박스 ①)
- **권한 grant**: MASTER/MANAGER/DISPATCH(=dispatch.board 정합). **@RequireDepartment 미사용**(dispatch.board 정합 — Warehouse의 EXECUTIVE_OFFICE 게이트 비채용). PM 권한 자율([[feedback_pm_permission_autonomy]]).
- **UUID 비노출**([[uuid-no-user-visibility]]): 목록/상세 사용자 노출=이름/전화 등 비즈니스 식별자. UUID(id)는 라우팅 내부용만, FE data-testid는 이름 기준.
- **필드**: name(필수)·phone(필수, SMS 수신처)·email(nullable)·default_vehicle_type(nullable)·memo(nullable)·active(BOOL, **soft-delete와 별개** = 비활성 토글) + BaseEntity 7 audit. (spec §4)
- Role 풀네임([[feedback_role_naming_full]]) · 한국어 커밋/PR · `[FEAT]` prefix · 단계별 다수 스샷 QA([[feedback_canonical_workflow]]).
- **docs 동기화 catch-up**([[feedback_continuous_docs_sync]]·[[feedback_samhan_public_overview_sync]]): 슬1 누락분 포함 README/ROADMAP/overview 갱신(에픽 진행).

## File Structure
**slip-service (BE)** — 신규: `domain/external/ExternalCarrier.java`, `repository/external/ExternalCarrierRepository.java`, `service/external/ExternalCarrierService.java`, `web/external/ExternalCarrierAdminController.java`, `dto/external/{CreateExternalCarrierRequest,UpdateExternalCarrierRequest,ExternalCarrierResponse}.java`, `security/DispatchPageCodes.java`(상수), `resources/db/migration/V49__external_carrier.sql`. 테스트: `it/external/ExternalCarrierAdminControllerIT.java`.
**auth-service** — 신규: `resources/db/migration/V69__seed_dispatch_external_carriers_page_codes.sql`.
**clients/desktop (FE)** — 신규: `routes/admin/ExternalCarriersPage.tsx`, `api/externalCarrier.ts`; 수정: `components/AppLayout.tsx`(배차 SidebarLink), `routes/index.tsx`(PermissionGuard 라우트), `api/mock.ts`(핸들러). 테스트: `routes/admin/ExternalCarriersPage.test.ts`(또는 model 테스트).

---

## Task 1 — BE: ExternalCarrier 엔티티 + Flyway V49 + Repository
**Files:** ExternalCarrier.java(Create) · V49__external_carrier.sql(Create) · ExternalCarrierRepository.java(Create)
**Interfaces (Produces):** `ExternalCarrier`(BaseEntity 상속, 필드 위 Global Constraints) · `ExternalCarrierRepository extends JpaRepository<ExternalCarrier, UUID>` — `findAllByIsDeletedFalseOrderByNameAsc()`, `searchAdmin(String q, Pageable)`, `existsByPhoneAndIsDeletedFalse(String phone)`, `findDeletedById(UUID)`.

- [ ] **Step 1: Flyway V49 작성** — `external_carrier`: id UUID PK, name VARCHAR NOT NULL, phone VARCHAR NOT NULL, email VARCHAR, default_vehicle_type VARCHAR, memo TEXT, active BOOLEAN NOT NULL DEFAULT true, + BaseEntity 7컬럼(created_at/by, modified_at/by, deleted_at/by, is_deleted DEFAULT false). 인덱스: phone(부분 unique `WHERE is_deleted=false`로 활성 중복 방지 — Warehouse.code 패턴), name. **external_dispatch 테이블 생성 금지(슬3).**
- [ ] **Step 2: ExternalCarrier 엔티티** — Warehouse.java 모방(@Entity @Table("external_carrier") @SQLRestriction("is_deleted = false") @UuidGenerator id). 필드 + 도메인 메서드(update/activate/deactivate). 한국어 Javadoc.
- [ ] **Step 3: Repository** — 위 메서드.
- [ ] **Step 4: fresh Postgres probe** — V49를 fresh DB에 `psql ON_ERROR_STOP`로 적용 검증([[feedback_migration_fresh_postgres_probe]]). 커밋(Claude 대행).

## Task 2 — BE: Service + Controller + DTO + IT
**Files:** ExternalCarrierService.java(C) · ExternalCarrierAdminController.java(C) · dto/external/*.java(C) · DispatchPageCodes.java(C) · ExternalCarrierAdminControllerIT.java(Test)
**Interfaces (Consumes):** Task1 Repository/Entity. (Produces): REST `/admin/external-carriers` GET(list/search)·POST·PATCH/{id}·DELETE/{id}(soft)·POST/{id}/restore.

- [ ] **Step 1: DispatchPageCodes 상수** — `EXTERNAL_CARRIERS="dispatch.external-carriers"` (단일. `.manage` 폐기 — PM 정찰 보정 ①).
- [ ] **Step 2: DTO** — Create(name,phone 필수 @NotBlank; email/default_vehicle_type/memo nullable; active default true), Update(전 필드 nullable=부분수정), Response(id[내부]·name·phone·email·default_vehicle_type·memo·active·audit read). UUID는 Response에 포함하되 화면 비노출.
- [ ] **Step 3: Service** — list/searchAdmin/getOne/create(phone 활성중복 409)/update(부분+audit)/delete(soft+audit)/restore(중복 검증). WarehouseService 패턴.
- [ ] **Step 4: Controller** — 단일 page-code: GET(list/get)=@RequirePermission(EXTERNAL_CARRIERS, VIEW); POST=CREATE; PATCH=UPDATE; DELETE(soft)=DELETE; restore=RESTORE. @RequireDepartment 미사용. (PM 정찰 보정 ①. `inventory.dps`/`accounting.receivables` account-mode 형제 패턴.)
- [ ] **Step 5: IT(ExternalCarrierAdminControllerIT extends AbstractPostgresIT)** — ① CRUD happy(create→list 노출→update→soft-delete→list 제외) ② phone 활성중복 409 ③ 권한(manage 없는 role POST 403; view-only GET 200) ④ **UUID(inspector류) 응답 노출 규칙 준수**(id는 라우팅용 허용, 민감 UUID 없음 확인). @MockBean 외부 client 격리([[feedback_it_mockbean_external_clients]]). AbstractPostgresIT base 권한 stub 활용(슬1 교훈: 서브클래스 @MockBean DynamicPermissionClient 중복 금지).
- [ ] **Step 6: 커밋**(Claude 대행) `[FEAT] 외부기사/배송사 마스터 BE — external_carrier CRUD + 권한 (슬2)`

## Task 3 — auth: PageCode enum 등록 + page-code 시드 V69
**Files:** auth `domain/PageCode.java`(M) · auth `V69__seed_dispatch_external_carriers_page_codes.sql`(C)
- [ ] **Step 0: PageCode enum 등록** — `DISPATCH_EXTERNAL_CARRIERS("dispatch.external-carriers","외부기사/배송사 관리")`를 배차 섹션(`DISPATCH_BOARD` line 268 인근)에 추가. (PM 정찰 보정 ② — `/my` allPageActions가 `PageCode.values()` 순회 → 미등록 시 MASTER 메뉴 미노출.)
- [ ] **Step 1: V69 = V66/V67 4-table 패턴** — `V66__seed_accounting_receivables_page_permission.sql` 모방. 단일 page-code `dispatch.external-carriers`. 4 table 동기화: ①role_page_permissions(MASTER/MANAGER/DISPATCH, can_view+can_edit=TRUE) ②role_page_permission_templates(동 role, can_view/create/update/delete/restore=TRUE, download/print=FALSE) ③group_page_permissions(group_id `...100`/`...101`/`...106`, 동 액션) ④account_page_permissions(account_groups join 파생 + system-master NOT EXISTS 가드, V66 그대로). ON CONFLICT 갱신. **현 최신 auth=V68 → V69**. (PM 정찰 보정 ③ — account-mode enforcement=account_page_permissions.)
- [ ] **Step 2: fresh probe** 검증(V49+V69 fresh DB ON_ERROR_STOP) + 커밋.

## Task 4 — FE: ExternalCarriersPage + 메뉴 + mock + canAccess
**Files:** ExternalCarriersPage.tsx(C) · api/externalCarrier.ts(C) · AppLayout.tsx(M) · routes/index.tsx(M) · mock.ts(M) · ExternalCarriersPage.test.ts(Test)
**Interfaces (Consumes):** Task2 REST + page-code.

- [ ] **Step 1: api/externalCarrier.ts** — list/search/create/update/delete/restore + 타입(ExternalCarrier: id,name,phone,email?,default_vehicle_type?,memo?,active,audit).
- [ ] **Step 2: mock.ts** — `/admin/external-carriers` GET(MOCK 배열)·POST·PATCH·DELETE·restore. 3원칙([[feedback_inprocess_mock_principles]]: parseMockBody 엄격·non-null envelope·blob 무관). 활성/비활성 예시.
- [ ] **Step 3: ExternalCarriersPage.tsx** — RegionsPage 패턴. DataTable(이름/전화/이메일/기본차종/활성 + 액션) + 등록/수정 Modal(name·phone 필수) + 활성 토글 + soft-delete. react-query CRUD. `canAccess('dispatch.external-carriers','create')`로 등록/수정 노출(RegionsPage canManageRegions 동형, 단일 page-code — PM 정찰 보정 ①). UUID 비노출(testid=name).
- [ ] **Step 4: AppLayout.tsx** — 배차 SidebarCategory 하위 `showExternalCarriers=dynamicCanAccess('dispatch.external-carriers','view')` + SidebarLink(to=/admin/external-carriers, "외부기사/배송사", show=showExternalCarriers) + 배차 그룹 show 조건에 OR 추가 + activeTargets에 경로 추가.
- [ ] **Step 5: routes/index.tsx** — `/admin/external-carriers` → PermissionGuard(pageCode="dispatch.external-carriers", action="view") > ExternalCarriersPage.
- [ ] **Step 6: vitest** — 목록 렌더·canAccess 가드(manage 없으면 등록버튼 비노출)·필수필드 검증. `npm run typecheck`([[feedback_desktop_typecheck_command]])+lint+vitest GREEN(design-system dist 빌드 선행).
- [ ] **Step 7: 커밋**(Claude 대행) `[FEAT] 외부기사/배송사 마스터 FE — 관리 화면+메뉴+권한 (슬2)`

## Task 5 — docs 동기화 catch-up
- [ ] README/ROADMAP/docs/samhan-public-overview.html에 검수완료→배차발송 에픽(슬1 머지 + 슬2 마스터) 진행 반영([[feedback_continuous_docs_sync]]·[[feedback_samhan_public_overview_sync]]). 슬2 PR에 포함(별도 docs PR 금지).

## QA (각 리뷰 라운드 Docker 라이브 + 단계별 다수 스샷)
①외부기사/배송사 메뉴 진입(권한 보유 계정) ②등록 폼(이름·전화·기본차종) 작성→저장 ③목록에 신규 carrier 표시 ④수정/활성 토글 ⑤soft-delete 후 목록 제외 ⑥권한 없는 role 메뉴 미노출(canAccess 가드). 실 게이트웨이:8080·mock OFF·각 단계 별도 캡처. 가짜 금지([[feedback_no_fake_data_ever]]).

## Self-Review (spec §4·§7 대조)
- external_carrier 필드/CRUD/마스터 = §4 커버. page-code/메뉴/권한 = §7 커버. ✓
- external_dispatch(슬3) 선구현 없음 명시. ✓
- Flyway 2개(slip V49 단일테이블 + auth V69 page-code), 적용 불변·fresh probe. ✓
- UUID 비노출·canAccess=BE 일치·Role 풀네임·docs 동기화 반영. ✓
