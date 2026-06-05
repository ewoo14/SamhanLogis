# 현재 작업 핸드오프 노트

> 회사 PC 첫 세션 시작 시 본 파일만 읽으면 즉시 컨텍스트 복원 가능.

---

## 🆕 2026-06-05 — 동적 권한그룹(Permission Groups) Phase A 머지 + 권한코드 PM 전권

> 🚨 세션 시작 즉시 `git fetch origin`([[feedback_agent_origin_main_sync]]).

### 🔑 개발책임자 전권 위임 (2026-06-05) — [[feedback_pm_permission_autonomy]]
권한 관련 코드(RBAC/권한그룹/위임/마이그레이션/매트릭스/seed)는 **PM 이 머지까지 전권 자율**. 단 PR 워크플로우(dual review·N=2·Codex 구현·CI green·Docker 실QA·조기PR·백로그금지) 자율 엄격 적용 + 자가 지적. 멈춤 = 신규 업무규칙/정책(widening 수용 등)만 개발책임자 확인.

### ✅ @PreAuthorize 완전제거 마이그레이션 — role 전환 마무리 (머지 #387/#395)
- **#387 inventory role 전환(Option A)**: redundant @PreAuthorize 10건 제거→@RequirePermission 단일소스. INVENTORY widening **수용**(개발책임자 결정 D-PAM-05). delete 가드 유지(can_delete=TRUE 실측). 실 DB QA.
- **#395 EmployeeController(D-PAM-06)**: updateRole/terminate 의도적 MASTER-only **유지**(seed admin.employees MANAGER grant→제거 시 widening). Javadoc 제거금지 명시.
- **현황**: 순수 제거 가능범위 소진(auth #390/#391 + inventory #387). INTERNAL 34 + EmployeeController 유지. 잔여 = @RequirePermission 미병행 서비스(slip/partner/notification/dashboard/arologis) = 선추가 필요 deferred. umbrella spec §8.

### ✅ 동적 권한그룹 Phase A 머지 (#396 squash `caf8808e`)
고정역할(enum) → 사용자정의 권한그룹. **MASTER 만 빌트인**, 계정↔그룹 M:N 합집합, 개별 override 우선(deny), 9역할 시드이관(무중단). enforcement(account_page_permissions) 재materialize 로 무변경(저위험).
- 신규 4테이블(permission_groups/group_page_permissions/account_groups/account_permission_overrides) + V42~44 + materializer + 컨트롤러 9 endpoint + FE(그룹 매트릭스/관리/배속).
- spec `2026-06-05-permission-groups-phase-a-design.md`(D-PG-01~05), plan/dev-report/QA 동일자.
- **dual review + CI + Docker 실QA 가 정적 false-green 5건 적발**(IT @Transactional flush·한글 인코딩·sp-08-2 stale @PreAuthorize·시스템그룹 가드·**FE↔BE 매트릭스 계약 불일치+mock false-green**). 교훈: 실행이 정적리뷰를 이긴다(반복 확인).
- 실서버 QA: 그룹생성→매트릭스(중첩 actions)→배속→materialize t/t→cleanup f/f + 시스템그룹 409 실증.
- 🚨 **Phase B/C 시한폭탄**: 현재 MASTER bypass=role 헤더 기반이라 안전하나, AccountGroupService/GroupPermissionService 의 시스템그룹 가드는 Phase B(MASTER 그룹기반 전환) 전제 방어선.

### 🗺️ 다음 (권한그룹 후속 — PM 전권)
- **Phase B(위임)**: 그룹/HR 관리권한을 페이지권한(system.permission-admin/admin.employees/admin.permission-groups)으로 부여=위임, 회수. 하드 @PreAuthorize("hasRole('MASTER')") 제거(D-PAM-06 위임 허용 갱신). "MASTER 가 인사권한 위임 선택"(개발책임자 요청) 실현.
- **Phase C**: 잔여 hasRole/X-User-Role/accounts.role 정리, 다중그룹 토큰/헤더 반영(@PreAuthorize 완전제거 꼬리 흡수).
- **P2 후속**: 그룹명 한글 사용자 개명(시드는 Role enum 한글명), 권한그룹 화면 사용자 dogfooding.

---

## ✅ 2026-06-05 — PR #387 inventory role 전환 머지 (Option A) — role 전환 시리즈 재개

> 🚨 세션 시작 즉시 `git fetch origin`([[feedback_agent_origin_main_sync]]). 본 세션도 stale 핸드오프(#385) 믿었다 fetch 로 7커밋(#386~393) 적발. 핸드오프 항상 stale 가정.

### ✅ PR #387 머지 (squash `b32e7934`) — @PreAuthorize 완전제거 role 전환 첫 슬라이스 완료
- **개발책임자 결정 = Option A**: inventory-service redundant role-only `@PreAuthorize("hasAnyRole('WAREHOUSE','MANAGER','MASTER')")` **10건 제거** → `@RequirePermission` 단일소스. 제거가 INVENTORY widening 유발(seed 가 INVENTORY 에 inventory.dps/stock-balance grant)이라 behavior-preserving 아님 → **INVENTORY 접근 정식 수용**(동적 seed 단일소스 모델, 재고원 도메인 접근 합리).
- **delete 유지**: `InspectionAttachmentController.delete @PreAuthorize(MANAGER/MASTER)` 보존 — INVENTORY 의 stock-balance `can_delete=TRUE`(실 DB 실측)라 제거 시 삭제 widening. = load-bearing guard.
- **dual review**: Claude BE/QA/DevOps 3/3 APPROVE + Codex 5-section(4 APPROVE+1 P2). P0/P1 0, P2(단언강화·DOWNLOAD커버·stale 주석) 전건 in-cycle fix. QA 가 선존 false-green(attachment upload NPE→500 인데 not(403) 통과) 적발·치유.
- **실 데이터 QA**: `account_page_permissions`(account 모드 실 enforcement 소스) 에서 INVENTORY × 두 page all-grant 실측 → Option A 전제 실증. **live gateway HTTP 미수행**(inventory-service 미가동 + INVENTORY 계정 비번 V5 해시 불일치 = #390/#391 동일 블로커). dev-report `slice-preauth-role-inventory.md`, QA `docs/qa/preauth-role-inventory/real-qa-evidence.md`, umbrella **D-PAM-05**.
- 🚨 **교훈 재확인**: role 전환 착수 전 `@PreAuthorize` role-set vs seed grant role-set **완전 일치 교차확인 선행**(role_page_permissions + account_page_permissions). 좁으면 widening → 개발책임자 sign-off.

### 🗺️ 잔여 role 전환 맵 (다음, seed 교차확인 선행 의무)
- ⚠️ **user `EmployeeController.updateRole/delete`**: Javadoc "MASTER 보존" = 의도적 MASTER-only(seed admin.employees 는 MANAGER 등 grant → 제거 시 widening). = inventory.delete 패턴 → **유지** 또는 개발책임자 결정.
- 📋 **@RequirePermission 미병행 서비스**(slip ~11·partner 6·notification 3·dashboard 1·arologis Internal 7): @RequirePermission **선추가** 필요(순수 제거 아님, 더 큰 작업). INTERNAL 컨트롤러는 유지.
- ✅ **clean 슬라이스 공식**: @PreAuthorize role-set == seed grant role-set(MASTER-only + isMasterBypass 가 가장 깨끗). 착수 전 `services/auth-service/.../V*.sql` 교차표 대조.
- **P2 후속**: dev INVENTORY/non-MASTER 계정 비번 복구 → live gateway role-게이트 HTTP 직접 실증(현재 정적+psql+IT 로 대체 중).

---

## 🌙 2026-06-04 야간 PM 전권 자율 세션 (개발책임자 취침, ~오전 7시) — sp-d1 종결 + 권한설정 한글화/404

### ✅ PR #386 — sp-d1 권한설정 재게이트 + 한글화 + 한국어 404 (3-A2-④ B/C triage **완결**)
- **재게이트**: account-select 신 UI + in-process mock 정합 전면 재작성(page.route/waitForTimeout 0), testIgnore 정식 해제. T1~T6 strict 6/6 green.
- **한글화/리네임**: 액션 라벨 보기/생성/수정/삭제/복원/엑셀/인쇄, 메뉴·페이지명 "권한 매트릭스"→**"권한설정"**. 라우트·testid 불변.
- **한국어 404**: `NotFoundPage.tsx` + catch-all 2곳(AppLayout/AdminLayout children). 영문 dev 에러 → 한국어 "페이지를 찾을 수 없습니다".
- **dual 5-team**: Claude 5-agent + Codex 5-섹션, 사이클 1~2 전 팀 APPROVE 수렴. PR 코멘트에 전 리뷰 기록(TM 주도 agent discussion 패턴). 회귀 sidebar-disabled 5/5·permission-overhaul 4/4·sp-d4 20/20·tsc 0.
- 커밋: `bb855443`(재게이트)→`9caa511e`(Claude fix)→`502c2e5c`(한글화)→`2b4eb3e3`(Codex fix)→`8d1184b5`(한국어404). dev-report `slice-sp-d1-rbac-regate.md`, DECISIONS D-SPD1.
- **P2 후속**: mock id UUID화(`bulk.spec` 광범위 참조)·mock PageCode 카탈로그 59→전체 동기화·`PermissionMatrixBulkPage` 한글화 consistency.

> ℹ️ main #380 이 sp-d1 account-select 재게이트를 이미 머지(squash `b7b85761`). PR #386 이 동일 account-select + 한글화/404/dual-review 로 **supersede**(머지됨, `c8237253`).

### ✅ PR #388 — 권한 일괄 적용 화면 한글화 (머지 `4eda62b0`)
권한설정 하위 `PermissionMatrixBulkPage` ACTION_LABEL 영문→한글(보기/생성/수정/삭제/복원/엑셀/인쇄, #386 일관) + bulk.spec 정합. Codex APPROVE, CI green. (위 P2 "BulkPage 한글화" 해소.)

### ⚠️ PR #388·#386 다음 = PR #387 (inventory role 전환) — **Draft 보류, 🔴 개발책임자 결정 필요**
@PreAuthorize 완전제거 **role 전환 첫 슬라이스**(inventory-service redundant role-only @PreAuthorize 10건 제거 → @RequirePermission single source) 착수했으나 **BE 리뷰가 INVENTORY widening 적발**:
- 제거 대상 `@PreAuthorize("hasAnyRole('WAREHOUSE','MANAGER','MASTER')")` 는 **INVENTORY role 배제**. 그러나 seed(V10 inventory.dps / V35 inventory.stock-balance / V39)는 두 페이지를 **INVENTORY 에도 grant** → 제거 시 INVENTORY-role 이 10 endpoint 접근 = **access 확대**. (Explore 의 "100% 안전"이 seed role-set 동일성 검증 누락.)
- DevOps APPROVE(PermissionAspect 프로덕션 활성 확실, 무가드화 없음). QA P1(widening-guard verify) 수정 완료(`d1fb1b2e`).
- **보안 access 확대라 자율 머지 보류**(feedback_user_merge_authority: 결함→사용자 결정 / M-dept widening→descope 선례). **PR #387 Draft, 결정 코멘트 게시.**
- 🔴 **개발책임자 결정 옵션**: (A) INVENTORY 접근 정식 수용(Javadoc/IT 갱신 후 머지 — 동적 seed 수렴·재고원 도메인 접근 합리) / (B) seed 에서 INVENTORY default grant 제거(behavior-preserving 화, 단 compare/downloadTemplate narrowing) / (C) descope, seed-role-set 이 @PreAuthorize 와 정확히 일치하는 서비스부터.
- 🚨 **교훈**: role 전환 behavior-preserving 검증 = @PreAuthorize role-set 과 seed grant role-set **완전 일치** 확인 필수(@RequirePermission 병행 유무만으로 불충분). 다음 슬라이스 선정 시 seed 교차 확인 선행.

### 🚨 신규 교훈 (메모리 박제)
- **desktop 검증은 `npm run typecheck`**(tsconfig.node+web) — raw `npx tsc --noEmit` 는 느슨해 TS2367 류 놓침(#386 CI fail 회고). [[feedback-desktop-typecheck-command]]

### ✅ PR #390 — auth PermissionAdminController role 전환 (머지 `eb6aa835`)
@PreAuthorize("hasRole('MASTER')") **12건 제거** → @RequirePermission(system.permission-admin) single source. **widening 0**(seed system.permission-admin MASTER-only). BE(Codex)/QA/DevOps/Codex APPROVE, IT 양방향(MASTER 200 bypass+`verify(check never)`/non-MASTER 403), CI green.

### ✅ PR #391 — auth register/password-unlock role 전환 (머지 `2bf4d6b6`)
AuthController.register(system.account-admin)+PasswordController.unlock(system.password-admin) @PreAuthorize(MASTER) **2건 제거**. widening 0(seed MASTER-only). Codex 전섹션 APPROVE. **→ auth-service system.* admin role 전환 완성.** (GitGuardian=테스트 placeholder PM false-positive 판정.)

### 🗺️ 잔여 role 전환 맵 (다음 세션, seed 교차확인 선행 의무)
- 🔴 **inventory #387** — INVENTORY widening, 개발책임자 결정(A/B/C) 후 재개. Draft.
- ⚠️ **user EmployeeController.updateRole/delete** — Javadoc "MASTER 보존" 명시 = **의도적 MASTER-only**(seed admin.employees 는 MANAGER 등 grant → 제거 시 widening). inventory.delete 패턴 = **유지**(제거 금지) 또는 개발책임자 결정.
- 📋 **@RequirePermission 미병행 서비스**(slip ~11·partner 6·notification 3·dashboard 1·arologis InternalController 7) — @RequirePermission **추가 선행** 필요(순수 제거 아님, 더 큰 작업). INTERNAL 컨트롤러(auth/user/slip/partner/notification)는 **유지**(서비스간, 사용자 컨텍스트 부재).
- ✅ **clean 슬라이스 공식**: @PreAuthorize role-set == seed grant role-set(특히 **MASTER-only + isMasterBypass** 가 가장 깨끗, widening 0). 착수 전 `services/auth-service/.../V*.sql` role_page_permissions 교차표 대조.

### ▶ 기타 자율 진행 잔여 (PM 전권)
- P2: mock id UUID화·mock PageCode 카탈로그 동기화·sp-d1 mock 7-action 구조.
- Docker QA: 권한/부서 게이트 실 gateway 403/200(MockMvc 미포착 영역, D-SER-23 선례 = 실 QA 가 gateway 결함 포착).

### 🧪 Docker QA — #390/#391 권한 게이트 실 검증 (`docs/qa/auth-system-role-preauth-migration/real-qa-evidence.md`)
신 코드 재배포(auth image `401c39ab`) 후 실 gateway 검증: **MASTER JWT → system.permission-admin 200 / unlock 204(실 DB)** = MASTER bypass 실 작동, 미인증/위조 JWT 401, psql system.* **MASTER-only 실측** → **무가드화·widening 0 실증**.
- ⚠️ **한계1**: non-MASTER 403 직접 실증 못함 — **dev 비-master 계정(dev_manager 등) 비번이 V5 seed 해시와 불일치**(seed 후 변경 추정) → 401. 정적(isMasterBypass)+DB 증명으로 대체. **후속: dev seed 계정 비번 복구**(향후 non-MASTER QA 가능하게).
- 🔍 **발견(기존 이슈, #391 무관)**: `POST /auth/register` direct 는 **MASTER 도 403** — gateway `/auth/**`·`/api/v1/auth/**` 라우트에 JwtAuthentication 필터 부재 → `X-User-*` 미주입 → HeaderAuthenticationFilter 인증 실패. 실 등록경로는 user-service→`/auth/internal/accounts`(InternalTokenFilter)라 기능 우회 경로 없음. register 의 @RequirePermission(system.account-admin)은 gateway 직접경로에선 무의미(auth 컨텍스트 부재). **후속 판단**: register gateway 라우트 정비 또는 register 를 internal-only 로 명확화.

> 🌙 **2026-06-04~05 야간 세션 누계**: #386(sp-d1 재게이트+한글화+404)·#388(BulkPage 한글화)·#390(auth permission-admin role)·#391(auth register/password role)·#389·#392(docs) **6 머지** + #387(inventory) Draft 보류 + Docker QA(권한게이트 실증). 교훈 2건 메모리 박제([[feedback-desktop-typecheck-command]], [[feedback_preauth_migration_lessons]] §4 role-set).

---

## 🧭 2026-06-04 (후속 세션) — sp-d1 머지 완료 + **신규 이니셔티브: @PreAuthorize 완전제거**

> 🚨 세션 시작 즉시 `git fetch origin` + `git log origin/main` 먼저([[feedback_agent_origin_main_sync]]). 본 세션은 stale 핸드오프(#345)를 믿고 두 번(잔여16스펙 로드맵 / 시리얼S3) 완료된 작업을 후보로 착수했다 fetch 로 적발. **마라톤(#347~380)이 3-A2·시리얼 시리즈를 전부 완료**했음. 핸드오프는 항상 stale 가정.

### ✅ sp-d1 머지 완료 (#380 squash `b7b85761`) → 3-A2 기능 스펙 격리 0
account-select UI 재작성. dual N=2 가 false-green 2차 적발(P0 page.route 무력→mockRole/mockPerms / P1 T4 "보이지만 접근불가"→WAREHOUSE end-to-end / P1 T3 재조회 / P2 죽은단언). 프로덕션 src 무변경. CI 24/24. dev-report `sp-d1-dynamic-rbac-account-select-regate.md`.

### 🆕 신규 이니셔티브 — @PreAuthorize 완전제거 마이그레이션 (개발책임자 선택, 2026-06-04). **M1 머지 완료.**
정적 `@PreAuthorize` → 동적 `@RequirePermission`/`@RequireDepartment` **behavior-preserving 전환**. scope = 전부 전환, INTERNAL 유지(D-PAM-01). 교훈 [[feedback_preauth_migration_lessons]].
- **scope 정정(verify-first)**: 실 어노테이션 **94건**(grep 이 javadoc 포함해 131 로 부풀려졌음). = **Internal 컨트롤러 ~34(유지, 서비스간·사용자 JWT 없음)** + 부서게이트 `@hr.isExecutiveOffice()` ~25 + 순수 role ~35. accounting/partner-order/product 실 어노 0. umbrella: `docs/superpowers/specs/2026-06-04-preauthorize-full-migration-umbrella-design.md`.
- **✅ M1 머지 (#382 squash `6dd534ba`)**: `@RequireDepartment(EXECUTIVE_OFFICE)` 인프라(shared:security, `HrAuthorizationHelper` 동일 빈→판정 동일, fail-closed, **opt-in**) + groupware 결재선 3 endpoint 전환. M1 설계 `docs/superpowers/specs/2026-06-04-preauth-m1-require-department-design.md`, dev-report 없음(미작성 — 후속).
  - **🚨 DepartmentAspect 는 opt-in 필수**: `@ConditionalOnProperty(samhan.security.department.enabled=true)`. @RequireDepartment 쓰는 서비스만 main `application.yml`+IT properties 에 `enabled: true`. **미적용 시 빈 존재만으로 무관 서비스(accounting) CI 회귀**(로컬 무재현·CI 결정적). pointcut 은 `@annotation` 단독(@within 금지).
  - CI 디버깅이 정적 dual리뷰 통과 후 실 결함 3건 적발(hr 빈 중복·@WebMvcTest 실HTTP 0-request·빈격리 회귀) → [[feedback_preauth_migration_lessons]] §3.
- **✅ M-dept 머지 (#384 squash `824c0478`)**: 순수 부서게이트 **20건** → `@RequireDepartment` (user 8·partner 6·inventory 6). 4서비스 opt-in. IT 실 HTTP 매트릭스(비대표실+grant→403 부서deny). dual N=2: Claude behavior-preserving PASS + **Codex P1 적발→dc-config descope**. 실행 검증이 IT hr 빈 중복(M1 동일) 적발·수정. 설계 `docs/superpowers/specs/2026-06-04-preauth-mdept-department-gates-design.md`.
- **decomposition 잔여 (M1+M-dept 이후)**:
  - **dc-config import (1, descope됨)**: 복합 `@hr.isExecutiveOffice() and hasRole('MASTER')` — 하드 MASTER 드롭이 런타임 grant 시 이론적 widening(Codex P1) → **role 전환 슬라이스에서** MASTER→page-code 정책 명시 처리하며 함께 전환.
  - **role 전환 ~35건 (다음 권장)**: 순수 role `@PreAuthorize(hasRole/hasAnyRole)` → `@RequirePermission`. **대부분 이미 @RequirePermission 병행 = 중복 @PreAuthorize 제거**(behavior-preserving: 권한 page 가 동일 role 집합 grant 인지 seed 교차 확인). 일부 MASTER 전용은 명시 page-code(D-PAM-02). dc-config 복합 포함. 서비스별 슬라이스. **🚨 role-only @PreAuthorize 제거 시 behavior-preserving = 권한 seed 가 동일 role 집합인지 검증 필수**(아니면 widening).
  - INTERNAL 컨트롤러 34건: 유지(선택적으로 hasRole('MASTER')→hasRole('INTERNAL') 별도 정리).
- **다음 = role 전환 슬라이스** (개발책임자 선택). behavior-preserving + **실 실행 검증 의무**(정적 리뷰 APPROVE ≠ 통과 — M1/M-dept 모두 실행이 IT 결함 적발). 매 시작 `git fetch origin` 선행.

---

## 🏁 2026-06-04 연속 세션 (PM 전권 위임 자율 진행) — B/C triage 거의 완결, 잔여 = sp-d1 1건

### ✅ 이번 세션 머지 6건 (전부 main green, PM 자율 머지)
| PR | 슬라이스 | 비고 |
|---|---|---|
| #372 | sp-09-5 vendor 통합 재게이트(5/5) | isAttached→count, 역할 reload, Clova 502 strict |
| #373 | sp-09-2 알리고 SMS 발송이력(5/5) | in-process mock 3건 정합, 상세모달 마스킹/msg_id/result_code, RBAC reload |
| #374 | **sp-09-4 KFTC 입금매칭 상세모달(신규 FE 기능)**(5/5) | 자동 분개 미리보기 modal(차변 보통예금**102**/대변 외상매출금110 동액). 🔴 도메인 정정: 보통예금 102(103 아님, accounting-service V1 seed) |
| #375 | supplier-profile CRUD(7/7) | mock stateful 전환, 7 TC 전부 strict 강화 |
| #376 | tax-invoice-batch hometax-export 재게이트(7/7) | 4탭 워크플로 /accounting/hometax-export 로 relocation 정합, 실 다운로드 이벤트 |

> 위로 **3-A2-④ B/C triage 사실상 완결**. CURRENT-WORK 하단 "잔여 구현 슬라이스" 1~4(sp-09-1/4/2/5·phase-2-6c)는 이번 + 이전 세션에 **전부 완료**. 격리 잔여는 **sp-d1 단 1건**.

### 🔴 발견·수정한 잠복 mock 버그 3건 (strict 테스트가 표면화 — in-process mock 공통 함정)
1. **POST/PUT `JSON.parse(config.data)`**: VITE_MOCK_MODE 에서 `config.data` 는 이미 객체(`[object Object]`)라 파싱 throw → **`parseMockBody(config)`** 사용. (supplier POST/PUT, hometax preview/exclusions POST 등.)
2. **DELETE/204 `return null` ↔ 어댑터 미매칭 충돌**: `client.ts:48 if (mock !== null)` 가 null 을 "미매칭"으로 보고 **실 HTTP fallthrough → 네트워크 에러 → 페이지 블랭크**. 204 라도 null 금지 → **`envelope({ deleted: true })`**.
3. **`responseType:'blob'` ↔ string 반환 불일치**: 다운로드 소비자가 `res.data as Blob` 사용하는데 mock 이 string 반환 → `triggerDownload` 실패. → **`new Blob([...], {type})`** 반환.
> ⇒ 신규 mock 핸들러 작성 시 **(a) body 는 parseMockBody (b) 성공도 non-null envelope (c) blob 소비자는 Blob 반환** 3원칙.

### 🔧 회사 PC 잔여 = **sp-d1 단 1건** (RBAC 권한 매트릭스 — account-select 재설계 재작성)
> 정밀 recon 완료. **재게이트 가능**(페이지·mock 준비됨, 의미 재작성만 필요).
- **현황**: T4/T5/T6 통과(사이드바 OCR·404·403), **T1/T2/T3 실패** — 페이지가 **role-grid → account-select 로 재설계**됨(구 스펙의 7역할×12페이지 grid 모델 obsolete).
- **신 UI 흐름**(`src/renderer/routes/PermissionMatrixPage.tsx`): 페이지 로드 시 **첫 계정 자동선택**(`selectedAccountId`) → 그 계정의 페이지×액션(view/edit) 매트릭스 렌더.
- **신 testid**: `perm-matrix-account-select`(계정 드롭다운) · `perm-matrix-cell-{matrixPageNorm(page)}-{view|edit}`(셀, **role 없음**) · `perm-matrix-change-count` · `perm-matrix-save-btn` · `perm-matrix-apply-template` · `perm-matrix-copy-account` · `perm-matrix-domain-all-{domainId}[-off]` · `perm-matrix-col-all-{action}` · `perm-matrix-row-all-{page}` · `permission-matrix-table`.
- **mock**(`mock.ts` ~5112): GET `/auth/admin/permissions/accounts` → 3계정(김관리 MANAGER/이영업 SALES/박배차 DISPATCH) · GET `/account/{id}` · POST `/batch` · POST `/bulk`. (page.route mock `buildDefaultPermissionMatrix` 는 no-op — 제거 대상.)
- **재작성 방향**: T1=계정 선택 3옵션 + 매트릭스 cell 다수 렌더 / T2=`perm-matrix-cell-*` 토글 → `perm-matrix-change-count` 1 / T3=`perm-matrix-save-btn` → toast. 구 `permission-matrix-role-*`/`-cell-{role}-{page}` 단언 전부 제거. **dev-report: `slice-sp-d1-rbac-regate.md` 신규 작성**.
- **착수**: `git checkout -b feat/sp-d1-rbac-regate`; playwright.config testIgnore 의 `'**/sp-d1-dynamic-rbac/**'` 임시 해제 → 재작성 → 6/6 green → dual review(QA false-green + Codex) → testIgnore 정식 해제 → PR.

### 📋 P2 후속 (별도)
- retention soft-delete 물리 purge · Micrometer 보상 메트릭 · Phase11 활성화(`SAMHAN_COMPENSATION_{RETENTION,ALERT,RETRY}_ENABLED`) · sp-09-5 NTS/KFTC/Aligo 502 in-process mock 트리거 보강.

---

## 🏢 2026-06-03 야간 마라톤 종료 → 회사 PC 이어가기 (개발책임자 취침, 자율 진행 결과)

### ✅ 이번 세션 완료 (머지 14건 + admin-hr 재게이트)
- **④ notification 푸시**(#360, D-SER-26) · **⑤ A그룹 재게이트**(#361) · **⑦ outbox/Saga 보상 자동재시도**(#369, D-SER-27 — **보상 saga 완성**)
- **⑥ B/C 재게이트 누계 43 TC**: sp-d4(20)·phase-2-5(8)·sp-08-6-6(5)·sp-09-3(5)·**admin-hr(5, mock hash 교정으로 재게이트, `00139732`)**. ①②③ 은 이전(#357~359).
- 게이트 합동 **59 passed / 0 skipped** 확인. main green(확인 중).

### 🔧 회사 PC에서 이어갈 잔여 = 구현 슬라이스 (test 정합 아닌 신규 기능/대규모 mock 보강)
> 전건 근본원인·재현·해결경로 박제: `docs/dev-reports/slice-3a2-4-bc-triage.md`. **재사용 패턴**(중요):
> ① page.route 는 VITE_MOCK_MODE 에서 no-op → 단언을 in-process mock(src/renderer/api/mock.ts) 응답에 정합
> ② RoleGuard 역할 전환 검증 → `page.reload()` 로 세션 재설정(hash 네비는 mockRole 재설정 안 함)
> ③ HashRouter 쿼리(mockRole/mockDepartment/mockPerms)는 hash 에 있음 → mock 은 `mockLocationParams()` 사용
> ④ goto URL 은 반드시 `${BASE_URL}/#/...`(/#/ 누락 시 페이지 미로드)

1. **sp-09-1 T3** (eTaxExternalId 표시): 세금계산서 상세에 emit 응답의 eTaxExternalId 를 `data-testid="tax-invoice-detail-etax-external-id"` 로 표시하는 **FE 구현** + 테스트를 in-process mock emit 응답값에 정합. (TaxInvoiceListPage/Detail + mock emit-nts 핸들러 확인.)
2. **sp-09-4 T4** (deposit-match 상세 modal): MATCHED row 클릭 → 매칭 상세 모달(`deposit-match-detail-modal`) — Phase 11 미구현 모달 **FE 신규 구현**. T2/T5 는 패턴 정합으로 동반.
3. **sp-09-2/sp-09-5** (알리고 SMS / vendor): in-process mock 의 list/masking/filter/detail 데모 보강 + 5 TC 정합(page.route 의존 제거). sp-09-5 는 T2(테스트마트)·T3(reload) 부분 패턴 적용 가능.
4. **phase-2-6c** (전환 모달): submit 활성 조건이 `WarehouseAutocomplete 선택 + qty>0` 으로 진화 → 테스트에 autocomplete 상호작용 + qty 입력 단계 추가(시나리오 1~5) + 재고현황 화면(6~8).
5. **sp-d1** (권한 매트릭스): role-grid → account-select UI 재설계로 스펙(84-grid) 전면 재작성.
6. **후속(P2)**: retention soft-delete 물리 purge · Micrometer 보상 메트릭 · Phase11 활성화(SAMHAN_COMPENSATION_{RETENTION,ALERT,RETRY}_ENABLED).

### ⚙️ 회사 PC 셋업 메모
- `git pull` 후 `.\scripts\sync-claude-memory.ps1`(메모리 동기화). Docker 스택 `docker compose ... up -d`(24컨테이너). dev server: `cd clients/desktop; $env:VITE_MOCK_MODE=1; npx vite src/renderer --host 127.0.0.1 --port 5173`.
- gradle 격리: `GRADLE_USER_HOME=C:\dev\SamhanLogis\.gradle-codex --no-daemon -p C:\dev\SamhanLogis`. 빌드 전 orphan java worker 정리(VS Code PID 보존).
- 격리 스펙 검증 시 playwright.config testIgnore 에서 임시 해제 → 실행 → green 시 정식 해제.

---

## ✅ 2026-06-03 — ⓑ 보상 실패 복구 API + 운영자 화면 (PR 진행, D-SER-23)

> 세션 마무리 ②. #351(분산보상 견고화) 관측 → 정합(복구) 루프 완성. slip(BE)+desktop(FE).

- **BE**(slip): `SerialCompensationFailure.resolve()` + repo `findByResolvedOrderByCreatedAtDesc` + `CompensationFailureResponse`(slipId 제외) + `CompensationRecoveryService` + `CompensationRecoveryController`(GET `/api/v1/slips/compensation-failures` inventory.list VIEW + PATCH `/{id}/resolve` UPDATE). IT 6 + 단위 3, slip 800/0/0.
- **FE**(desktop): `CompensationFailuresPage`(목록+resolved 필터+해소 다이얼로그+배지, design-system 재사용, UUID 비노출) + api + mock + route(`/inventory/compensation-failures` PermissionGuard) + 사이드바("창고 운영"). Playwright 6/6 green, tsc 0.
- retention: 자동 스케줄러 descope → 운영 가이드(90일+resolved 정리) dev-report 문서화.
- **🚨 실 Docker QA 가 DevOps P1 포착**: gateway StripPrefix=2 로 컨트롤러 풀패스(`/api/v1/slips/...`) 미매칭 → `SlipController /slips/{id}` 충돌 400. **컨트롤러를 `/slips/compensation-failures` 컨벤션으로 정정**(IT 동기화, gateway 무변경) → gateway 200 확인. MockMvc IT 가 못 잡던 결함을 실 QA 가 포착(no-fake-data 가치). 5-agent fix(false-green UUID·IT 403 격리·버튼 update 가드·id Javadoc) + Codex 음성테스트.
- 다음 = ③ 3-A2-③.

---

## 🔁 2026-06-03 — 백로그 전부 처리 마라톤 (개발책임자 지시)

> "관련 모든 백로그 전부 처리하고 마무리". 7 슬라이스: ①WarehouseSelector제거 ②회수품재판매 ③retention ④notification ⑤3-A2-④A ⑥3-A2-④B/C ⑦outbox/Saga. (제조시리얼 수집은 개발책임자 제외 결정.)

- **① WarehouseSelector 제거** ✅ #357 — 타입 WA 이전, design-system build/desktop tsc 0.
- **② 회수품 재판매(RECALLED→AVAILABLE)** ✅ 머지 #358 — `StockInstance.resell()` + resell-batch API. Docker 실 QA(실 RECALLED resell→200→psql). D-SER-24.
- **③ retention 스케줄러** ✅ (PR #359, 머지 진행) — `CompensationRetentionScheduler`(@Scheduled cron+zone=Asia/Seoul, @ConditionalOnProperty 기본 비활성) resolved+90일경과 soft-delete. 🚨미해소·기간내 절대 미정리. TimeConfig Clock Asia/Seoul(Codex P1). build.gradle test heap 2g(OOM fix). 5-agent+Codex 수렴. Docker QA(재배포 healthy+스케줄러 미등록). D-SER-25. **후속: soft-delete 물리 purge(P1-2)·Phase11 활성화(P2)**.
- **④ notification 푸시** ✅ 머지 #360 (`b462b0ea`) — `CompensationAlertNotifier`(감사 저장 성공 후 best-effort push, config-gated 기본 비활성, afterCommit 발송, 본문 UUID 비공개). `CompensationAuditWriter` TODO seam 연결, 기존 `NotificationClient.sendUserPush` 재사용. Claude 5-team P1 5건(트랜잭션 커밋前 발송→afterCommit / catch(Exception) / IT body 단언 / @MockBean / env 템플릿) + Codex 사이클1 P1(본문 예외메시지 UUID 유출→본문서 원인 제거) fix → Codex 사이클2 APPROVE. CI 20/20 green. 실 Docker QA(재배포 3회 healthy/ERROR0, UUID부재 IT 실증). D-SER-26. **후속: Micrometer 카운터(P2)·Phase11 활성화(SAMHAN_COMPENSATION_ALERT_ENABLED+RECIPIENT)**.
- **⑤ 3-A2-④ A그룹 재게이트** ✅ 머지 #361 (`9279c529`) — sp-d2(회계 5/5)+sp-d3(슬립/배차 9/9)=16 passed/0 skipped. 이중 가드(RoleGuard+PermissionGuard) 차단 판정 sp-d4 패턴 교정 + 광범위 page.route 제거(SPA redirect 간섭). **프로덕션 src 무변경(스펙+config만)**. QA false-green 4건 적발→수정(T5 동어반복·T3 !==undefined·sp-d3 콘텐츠 단언·admin-hr test.skip(!ok)) + Codex APPROVE. **격리 유지**: admin-hr(미구현 TC-HR2 부서 route-게이팅 — CI silent-skip 가드로 fixme 불가, 개선분은 커밋 보존) · sp-d1(매트릭스 UI 재설계). **후속: admin-hr 부서 게이팅 구현 슬라이스(완료 시 admin-hr 재게이트) · sp-d1 매트릭스 스펙 재작성.**
- **⑥ 3-A2-④ B/C 재게이트** 🔄 진행(개발책임자 "계속" 지시) — 머지 #363 (`3fd1214a`):
  - ✅ **재게이트(33 TC)**: sp-d4(20, #363)·phase-2-5(8, #366)·sp-08-6-6(5, #366) — **순수 드리프트**(`/#/`·seed·단언 정정만으로 green).
  - 🔧 **부분 정정(격리 유지, feature 잔여 1+ TC)**: supplier-profile(5/7, #363)·tax-invoice-batch(6/7, #364)·sp-09-1(4/5, #365) — `/#/`+skip 정정했으나 feature TC 잔존(supplier TC-SP-3 add→save 흐름 / tax-invoice-batch TC-TIB-1 4탭 HometaxExportPage 이전 / sp-09-1 T3 eTaxExternalId 표시 UI 미구현).
  - 📋 **다음 세션 B/C 잔여 = feature 레벨**: sp-09-2(5·알리고 SMS)·sp-09-3(3·OCR 결과카드/422배너/RoleGuard)·sp-09-4(3·KFTC)·sp-09-5(3·vendor)·phase-2-6c(8·재고현황 모달) + 위 3 partial 의 잔여 feature TC. **🔑 B/C 는 혼합**: `/#/` 정정 후 전건 재실행으로 (순수 드리프트=즉시 re-gate / feature 잔여=드리프트 정정 후에도 남으면 실 기능 대조→갭이면 구현 슬라이스 분리) 판별. 상세: `docs/dev-reports/slice-3a2-4-bc-triage.md`.
  - ✅ **⑥ 추가 재게이트**: sp-09-3 OCR(5/5, #368 `e742cc57`) — page.route no-op→in-process mock 정합 + RoleGuard 역할전환→page.reload() 패턴. **⑥ 재게이트 누계 38 TC**(sp-d4·phase-2-5·sp-08-6-6·sp-09-3).
- **⑦ outbox/Saga(보상 자동재시도)** ✅ 머지 #369 (`3daac22f`) — **ⓑ 보상 saga 완성**(④ 알림→⑦ 자동 정합). V32(retry_count/last_retry_at/next_retry_at) + `CompensationRetryExecutor`(REQUIRES_NEW per-failure + PESSIMISTIC_WRITE 행락 + 락후 resolved 재확인) + `CompensationRetryService`(오케스트레이터) + `CompensationRetryScheduler`(@ConditionalOnProperty 기본 비활성). 디스패치 RELEASE_INSTANCES/UNRECALL_INSTANCES, 수량형 skip. 멱등(#349)·백오프 클램프(Math.min 30)·max-retries. Claude 5-team(BE P0 트랜잭션+P1 동시성/백오프, QA P0×2+P1×4)+Codex 사이클1(P1×2) **전건 fix**. IT zone 의존(CI UTC) fix. CI green, 실 Docker QA(V32 success=t·스케줄러 비활성·ERROR0). D-SER-27. **후속: Phase11 활성화(SAMHAN_COMPENSATION_RETRY_ENABLED)**.
- **🎉 마라톤 ①~⑦ 본체 완료**. 남은 = ⑥ feature 잔여(별도 모드): sp-09-2(알리고 SMS 모달)·sp-09-4(KFTC 매칭 모달 — Phase11 미구현)·sp-09-5(vendor)·phase-2-6c(전환 모달 상호작용) + supplier(TC-SP-3 add→save)·sp-09-1(T3 eTaxExternalId 미구현) — **mock 흐름/상호작용 per-feature, 실 기능 갭은 구현 슬라이스**. 후속: admin-hr 부서 게이팅·sp-d1 매트릭스 재작성.
- ⚠️ 세션 중 OOM/파일잠금으로 samhan Docker 스택 일시 중지 후 `docker compose up -d` 전체 복구함(24컨테이너). build.gradle slip test maxHeapSize=2g 추가(포크 JVM OOM 방지).

---

## ✅ 2026-06-03 — ③ 3-A2-③ mock 권한제어(?mockPerms=) + applayout 재게이트 (부분완주, PR 진행)

> 세션 마무리 ③. 3-A2-② 근본원인(page.route no-op) 해소 메커니즘 + A그룹 verify-then-fix(정직한 부분완주). clients/desktop 단독, 프로덕션 무변경.

- **메커니즘**(핵심): `mock.ts ?mockPerms=base64(JSON [{pageCode,view,edit}])` → `/permissions/my` 우선 적용(없으면 role 기반 회귀0). in-process mock 에 revoke/grant/dept 시나리오 주입 → page.route 무효 한계 해소. **전 RBAC 스펙 재게이트의 공통 enabler**.
- **재게이트**: `permission-overhaul/applayout`(전건 green; pre-response hidden 단언 OBSOLETE 재고정).
- **A그룹 실 Playwright 19/28 pass**. 재격리(진행분 보존+testIgnore 복원): admin-hr(부서게이팅/라벨)·sp-d1(매트릭스 role-grid→account-select 재설계)·sp-d2/sp-d3(권한없는 URL redirect "/" 미작동). 단언약화·false-green 없이 정직 처리.
- **후속 3-A2-④**: sp-d2/d3 redirect 의미론(usePermissions 캐시 타이밍 vs 가드, sp-d4 패턴 대조) / sp-d1 매트릭스 UI 재작성 / admin-hr 부서게이팅·라벨 / B·C그룹. 메커니즘 확보로 스펙별 verify-then-fix 만 남음. 상세 `docs/dev-reports/slice-3a2-3-mock-permission-control.md`.

---

## 🧹 2026-06-03 — 세션 마무리 정리 (작은 해소 일괄)

> 개발책임자 "남은 내용 해소 후 마무리" 지시. 작은 정리 → ⓑ 분산보상 후속 → 3-A2-③ 순 진행.

- **slip HikariCP**: `application.yml` datasource `hikari.maximum-pool-size: 20 / minimum-idle: 5`(env override) 추가 — CompensationAuditWriter REQUIRES_NEW 2중 커넥션 고갈 방지(D-SER-22 DevOps P1 해소).
- **WarehouseSelector @deprecated**: JSX 사용처 0(WarehouseAutocomplete 로 일원화) → 컴포넌트 `@deprecated` 마킹. `Warehouse`/`WarehouseType` 타입은 WarehouseAutocomplete 가 소비하므로 유지.
- **PR #339 close**: codex full-menu QA 산출물(100파일 스냅샷, 3일 stale Draft) → per-slice QA 워크플로우로 대체, 캡처 스크립트로 재생성 가능 → PM 판단 close.

---

## ✅ 2026-06-03 — WarehouseAutocomplete 통합 (ⓒ 3순위, 잔여 WarehouseSelector 일원화)

> ⓒ 마지막. design-system `WarehouseAutocomplete`(AC-1)를 작성 폼 헤더 창고 선택에 일원화. FE only(desktop).

- `SlipFormPage`(출발/도착 2) + `TransferFormPage`(출발/도착 2) 잔여 `WarehouseSelector`(plain select) → `WarehouseAutocomplete` 교체. props 동등(value string|null, onChange id, hideVirtual/error 보존). 프로덕션 로직 무변경.
- 검증: desktop `tsc` 0 + 실 Playwright(slip-form-v20/d2-6d/phase-2-6a) **30 pass/0 fail**. DS WarehouseSelector 미사용화(deprecate 별도 후속).
- **🎉 ⓒ 3건 종결**: 3-A2-②(revert+3-A2-③ 문서화) / 3-D(비-0 재고 실QA #352) / WarehouseAutocomplete(본 PR). → 대기 모드.

---

## ✅ 2026-06-03 — 3-D 비-0 재고 실 Docker QA 완수 (PR #343 보류 QA 마감)

> ⓒ 2순위. PR #343(SlipFormPage 재고모달 일원화) 머지 전 보류됐던 실 Docker QA 를 비-0 재고로 완수. 코드 무변경(QA 검증 + 증빙 docs only).

- 실 게이트웨이(127.0.0.1:8080) MASTER 로그인 → `POST /api/inventory/balances/batch` 실 호출 → 비-0 가용/실/예약 매트릭스(본사창고 498/0/498, 1호차 40/0/40) → **psql 전수 대조 완전 일치**. no-fake-data 준수.
- 증빙: `docs/qa/slice-3-d-nonzero-stock-qa/real-qa-evidence.md`. inventory_db stock_balances 200행 전부 available>0(reseed 불요).
- 다음 = ⓒ 3순위 WarehouseAutocomplete.

---

## 🧩 2026-06-03 — 3-A2-② RBAC 격리 재게이트 시도 → revert (개발책임자 결정) + 🔴 3-A2-③ 근본원인 발견

> ⓒ 1순위로 3-A2-②(RBAC/AppLayout 격리 A그룹 6스펙 재게이트) 시도. **mock 모드 구조적 한계로 깨끗한 재게이트 불가 → 전체 revert**(개발책임자 결정). 다음 = 3-D → WarehouseAutocomplete.

- **시도/결과**: A그룹 6스펙(admin-hr/applayout/sp-d1~d4) testIgnore 제거 후 실 Playwright 베이스라인 48 tests **33 pass / 15 fail**. verify-then-fix(Codex+PM)로 권한 mock shape 를 sp-d4 정답(`{pageCode, canView, canEdit}`)으로 교정 → 9 fail 까지 감소. 그러나 잔여 실패가 단일 근본원인에 수렴.
- 🔴 **근본원인(3-A2-③ 필수 선결)**: `clients/desktop/src/renderer/api/client.ts:45-52` — `VITE_MOCK_MODE=1` 시 `getMockResponse(config)` **in-process 직접 호출**, 실 HTTP 미발생. → Playwright `page.route`(네트워크 가로채기) **no-op**. sp-d1/d2/d3 의 권한 시나리오(revoke/grant/custom matrix) override 가 mock 모드에서 무효. sp-d4 통과는 `mockRole`+mock.ts 기본 권한모델이 우연히 단언 충족(page.route 죽은 코드).
- **3-A2-③ 처방**: `mock.ts` 에 권한 시나리오 제어 메커니즘(mockRole 별 `_mockPermissionCells` 동적 revoke/grant + dept 게이팅 + 매트릭스 account-select 재설계 반영) 신규 구축 후 스펙 재작성. admin-hr TC-HR2 = 부서(대표실) 게이팅 mock-gap, applayout Task14 = fail-closed 응답전 hidden 지연mock, sp-d1 = 매트릭스 role-grid→account-select(mock 3계정) 재설계. **전용 슬라이스**.
- revert 완료: testIgnore A그룹 복원, 브랜치 feat/3-a2-2-rbac-regate 폐기, 프로덕션·스펙 무변경(main 무오염).

---

## 🌙 2026-06-03 자율 세션 — ⓑ 시리얼 분산 보상 견고화 ✅ (PR #351, 머지 진행)

> Phase INV-S 후속 ⓑ. D-SER-05(동기 REST best-effort 보상) 한계 보완 — 보상 실패 조용한 삼킴 → 관측·영속·복구단서. slip-service 단독.
> **🚧 다음 = ⓒ는 개발책임자 새 세션 착수** (PM 자동 착수 금지).

- **PR #351** `[FEAT] 시리얼 분산 보상 견고화` (브랜치 feat/serial-compensation-resilience). spec/plan = `docs/superpowers/{specs,plans}/2026-06-03-serial-compensation-resilience*`. DECISIONS D-SER-22. dev-report `slice-serial-compensation-resilience.md`.
- **산출**(slip 단독): `CompensationAuditWriter`(@Transactional REQUIRES_NEW 별도 빈, 구조적 WARN `[COMPENSATION_FAILURE]` cause+originalCause + `serial_compensation_failures`(V31) append-only 독립 커밋) + `SlipService.runCompensationsWithAudit` 공통 헬퍼(accept ACCEPT_RESERVE / completeRecallInbound COMPLETE_RECALL, serial·batch 공통) + `SerialCompensationFailure`(BaseEntity, productCode guard) + `CompensationPhase`/`CompensationOperation` + `TimeConfig` Clock + V31(인덱스 resolved,created / slip_no).
- **왜 slip측 영속**: 보상 실패 원인 = inventory 도달 불가 → inventory stock_movements 도 실패 가능 → 호출자(slip) 측 영속이 정합.
- **dual 리뷰(N=1 수렴)**: Designer/FE APPROVE + Claude 5-agent fix 7건(QA P0 IT raw JDBC 커밋독립 단언 / QA P1 occurredAt·slipNo eq / BE P1 productCode guard / DevOps P1 WARN originalCause / BE P2 audit save 로그·slip_no 인덱스·Javadoc) + Codex(gpt-5.5) **OVERALL APPROVE**. @Version 미반영(append-only audit 선례 일관, PM 판정).
- **검증**: 신규 6테스트 skip0·fail0·err0, **CI 20/20 green**. **Docker 실 QA**(`docs/qa/slice-serial-compensation-resilience/real-qa-evidence.md`): Flyway V31 success=t·테이블 18컬럼·인덱스 2개·정상 무오염(count0/마커0)·REQUIRES_NEW 커밋독립 CI 실 IT.
- **후속**: HikariCP maximum-pool-size(DevOps P1) / retention·복구 API·운영자 보상실패 화면(Designer) / notification 푸시(TODO seam) / 자동 재시도 outbox·Saga(D-SER-05 근본).

---

## 🌙 2026-06-03 자율 세션 — ⓐ 시리얼 락 전략 최적화 ✅ 머지 완료 (#350 `ed087bdb`)

> Phase INV-S 후속 ⓐ. #349 DevOps cross-check P1/P2(락 범위·인덱스·timeout) 해소. 기능 불변·운영 안정성. inventory 단독.

- **PR #350** `[FEAT] 시리얼 재고 락 전략 최적화` (브랜치 feat/serial-lock-optimization). spec/plan = `docs/superpowers/{specs,plans}/2026-06-03-serial-lock-optimization*`. DECISIONS D-SER-19~21. dev-report `slice-serial-lock-optimization.md`.
- **산출**(inventory 단독): ForUpdate 후보조회 `Pageable`(`PageRequest.of(0, deficit)` → deficit 행만 FOR UPDATE) + `@QueryHints` lock.timeout 3000ms + Flyway V19 `ix_stock_instances_fifo_wh ... WHERE is_deleted=FALSE` 부분 인덱스 + unrecallBatch outboundSlipNo 단언.
- **dual 리뷰**: Claude 5-agent(P1 2 fix: QA outboundSlipNo 단언 / BE lock.timeout PG 적용 → Docker 검증) + Codex(gpt-5.5) **OVERALL APPROVE**(5섹션, 신규 P0/P1 0).
- **검증**: 단위/IT skip0·fail0·err0, **CI 전체 GREEN**. **Docker 실 QA**(`docs/qa/slice-serial-lock-optimization/real-qa-evidence.md`): Flyway V19 적용·partial 인덱스 정의·EXPLAIN `Index Scan ix_stock_instances_fifo_wh`·`SET LOCAL lock_timeout` 수용.
- 🚨 **lock.timeout PG 적용 결론(BE↔DevOps 상충 해소)**: PG 는 `SET LOCAL lock_timeout` 수용하나 `FOR UPDATE WAIT n` 부재로 Hibernate 힌트가 **PG 자동 발행 안 됨(no-op, BE 지적 정확)**. 실 방어 = advisory lock(키별 직렬화) 1차 + LIMIT deficit. hard timeout 강제는 **P2 후속**(native `SET LOCAL` / connection-init-sql). 머지 비차단(설계 수준 한계).

---

## 🌙 2026-06-03 자율 세션 — 시리얼 동시성·보상 강화 ✅ 머지 완료 (#349 `c2cd830a`) — 🎉 Phase INV-S 완결

> 🎉 **Phase INV-S 완결**: S1(#336)·S2(#338)·S3(#347)·S4(#348)·동시성보상(#349) 전부 머지. 모두 dual 5-agent cross-check N=2 + CI green + Docker 실 QA 검증.
>
> **차기 후속**(PM 자율선택, ⓐ 1순위 권장):
> - ⓐ **시리얼 락 전략 최적화**(DevOps P1/P2): recallBatch/reserveBatch ForUpdate `LIMIT :deficit`(락 범위 최소화·LockTimeout 완화) + 인덱스 V19 `(product_code, warehouse_id, status, received_at)` + `jakarta.persistence.lock.timeout` PG 적용 검증 + 역-FIFO filesort + IT jsonPath 단언.
> - ⓑ **분산 보상 견고화**(Codex P1, 전사): 동기 REST 보상 실패 대비 Saga/outbox 재시도(D-SER-05 한계 보완).
> - ⓒ 기타: 3-A2 격리 레거시 스펙 / 3-D 비-0 재고 QA / WarehouseAutocomplete 통합.

### (구현 상세 — Codex 세션 기록)

- 범위: `inventory-service` + `slip-service`, spec/plan `2026-06-03-serial-concurrency-compensation*`.
- inventory: 후보 조회 ForUpdate 2건(`PESSIMISTIC_WRITE`) 추가, `reserveBatch`/`recallBatch` 후보 조회 교체, `StockInstance.unrecall()`, `unrecallBatch`, `POST /inventory/instances/unrecall-batch`.
- slip: `InventoryClient.unrecallInstances`, `completeRecallInbound` serial recall 성공분 역순 unrecall 보상(addSuppressed).
- 문서: DECISIONS D-SER-17~18, `docs/dev-reports/slice-serial-concurrency-compensation.md`, README/ROADMAP 갱신.
- 검증(Gradle 격리 준수: `.gradle-codex`, `--no-daemon`, `-p C:\dev\SamhanLogis`):
  - inventory 단위 `StockInstanceOutboundTest` + `StockInstanceServiceOutboundTest` PASS.
  - slip 단위 `InventoryClientTest` + `SlipServiceTest` PASS.
  - inventory IT `StockInstanceOutboundIT`: 12 tests / 0 skipped / 0 failures / 0 errors.
  - slip IT `SlipInboundInstanceIT`: 10 tests / 0 skipped / 0 failures / 0 errors.

---

## 🌙 2026-06-03 자율 세션 — 시리얼 S4 회수연동 ✅ 머지 완료 (#348 squash `208acc78`, PM 완전 자율)

> 개발책임자 "머지 및 계속 진행" 지시로 머지(P1 2건은 후속 "시리얼 동시성·보상 강화" 슬라이스 분리). 🆕 **"머지도 PM 판단" 위임**([[feedback_user_merge_authority]] 강화 — 이제 P1 잔존·UNSTABLE 등도 개발책임자 확인 없이 PM 이 머지 여부 자율 판단).

- **PR #348** `[FEAT] 시리얼 인스턴스 회수연동 S4` (브랜치 feat/serial-instance-s4-recall). spec/plan/dev-report = `docs/superpowers/{specs,plans}/2026-06-03-serial-instance-s4-recall*` + `docs/dev-reports/slice-inv-s4-recall.md`. DECISIONS D-SER-13~16.
- **산출**: inventory(StockInstance.recall(recallSlipNo) 마커 + recallBatch 역-FIFO[outbound_at DESC+id tie-break]/회수부족409 후보크기단일판정/멱등/advisory lock + V18 recall_slip_no + recall-batch API) / slip(SlipService.complete() INBOUND RETURN/RETURN_TRIP 분기[S2 409 가드 해제]+혼합전표 + InventoryClient.recallInstances) / product 무변경.
- **dual 리뷰 N=2**: Claude 5-agent(P0/P1 0, P2 fix: tie-break·@MockBean·RETURN IT) + Codex cross-check(P1 2건 ↓).
- **검증**: inventory 408/slip 781 skip0. **CI 20 green**. **Docker happy-path 실QA PASS**(recall→RECALLED+recall_slip_no/부족409/멱등/역-FIFO, `docs/qa/slice-inv-s4-recall/`).
- 🚧 **차기 1순위 = "시리얼 동시성·보상 강화"**(Codex S4 cross-check P1 2건, S3 공통): ① `completeRecallInbound` 혼합전표 serial recall 성공 후 batch inbound 실패 시 un-recall(RECALLED→SHIPPED) 보상 인프라 부재 ② `recallBatch`/`reserveBatch` 다른 전표 동시 처리 시 같은 후보 중복선택(advisory lock key가 전표별이라 동일 거래처·품목 경합, row lock/@Version 없음). **S3 reserveBatch + S4 recallBatch + completeRecallInbound 일관 설계**(PESSIMISTIC row lock 또는 @Version + recall 역전이 도메인/API). 발생 조건(혼합전표 batch 실패 / 동일 거래처·품목 동시 2전표) 제한적이나 데이터 정합 결함.
- **Phase INV-S 완결**: S1(#336)·S2(#338)·S3(#347)·S4(#348) **전부 머지 완료** ✅. 잔여 = 위 동시성·보상 강화(P1 후속).

---

## 🌙 2026-06-03 자율 세션 — 시리얼 S3 출고연동 ✅ 머지 완료 (#347 squash `4dae83b5`, PM 완전 자율)

> 개발책임자 취침 중 PM 자율 연속 진행 지시. dual 5-agent cross-check + skip·error 0 + Docker 실 QA 의무.

- **PR #347** `[FEAT] 시리얼 인스턴스 출고연동 S3` (브랜치 feat/serial-instance-s3-outbound). spec/plan = `docs/superpowers/{specs,plans}/2026-06-02-serial-instance-s3-outbound*`.
- **Codex 구현(gpt-5.5) 완료** → PM이 커밋(Codex가 커밋 못하고 turn 종료). 커밋: inventory `8a15a6d7` / product `c099ef4d` / slip `627e32aa`.
  - inventory: StockInstance reserve(slipNo)/ship 가드(AVAILABLE|RESERVED→SHIPPED)/release + reserveBatch(FIFO 멱등+재고부족409)/shipBatch/releaseBatch + advisory lock + API 3종 + DTO + **V17** 인덱스 + ProductClient.requireExistsByCode.
  - product: **lookup-by-code endpoint 신규**(plan상 무변경이었으나 productCode 단건조회 필요 — 합리적 확장, DECISIONS 기록 예정).
  - slip: SlipService OUTBOUND accept→reserve/complete→ship(출고처)/reject·cancel→release serial vs batch 분기 + InventoryClient 3메서드. 동기REST+Tx보상(D-SER-05 계승).
- **통합 빌드 PASS**: inventory 399(skip 1=`Mig5StockTransferFixtureHeaderCrossCheckTest` 기존·S3무관)/slip 774(skip0)/product 210(skip0). **신규 S3 테스트 20개 전부 skip0·fail0·err0**(StockInstanceOutboundTest4/ServiceOutboundTest6/OutboundIT6/SlipOutboundInstanceIT4 — IT는 실 Testcontainers Docker 실행). push 완료(CI 트리거).
- ✅ **dual 리뷰 N=2 수렴(P0/P1 0)**: Claude 5-agent(P0 reserveBatch TOCTOU IndexOutOfBounds + P1 8 fix + Mig5 silent-skip false-green 원복) → Codex cross-check(P1 혼합전표 고아예약 보상 fix + 회귀테스트). CI 20 green. **Docker 실 QA PASS**(`docs/qa/slice-inv-s3-outbound/real-qa-evidence.md`). dev-report + DECISIONS D-SER-09~12.
- 🚨 **Codex 주의(신규 교훈)**: Codex 가 skipped=0 게이트를 맞추려 **무관 테스트 silent-skip(assumeTrue→if-return) 조작**(false-green)한 사례 적발·원복. **Codex 산출은 커밋 전 PM 이 git diff 전수 검토 필수**.
- **Docker QA 환경 셋업됨(S4 재사용)**: 컨테이너 healthy, `docker compose -f docker-compose.yml -f docker-compose.local-all.yml -f docker-compose.no-host-ports.yml`, dev_master JWT(`dev_p05_pass!`).
- 🚨 **Gradle 주의(2회 데드락 교훈)**: VS Code Java 확장이 `~/.gradle` 캐시 lock 점유 → gradle 데드락. **반드시 `$env:GRADLE_USER_HOME='C:\dev\SamhanLogis\.gradle-codex'` + `--no-daemon` + `-p C:\dev\SamhanLogis`** 사용(~/.gradle 금지). 실제 테스트 검증 시 `--no-build-cache`(FROM-CACHE 회피).
- PR #347 body 한글깨짐(PowerShell UTF-8 위반)은 복구 완료. 임시파일 `.pr-347-body.md`는 PR ready 시 정리.
- **다음 = 시리얼 S4 회수**(반품/회차 역-FIFO, [[project_serial_inventory_model]]) — PM 자율 착수 중(brainstorming→spec→plan→Codex 구현→dual 5-agent→CI→Docker 실QA→머지 풀사이클).

---

## 🧭 새 세션 시작 가이드 (2026-06-01 갱신 — 회사 PC, Codex 복구 후)

> **🖥️ 회사 PC 세션 (2026-06-01, 종료)**: `git pull`(32커밋) + 메모리 sync → **6 PR 머지**(#337 CORS / #338 S2 / #340 CI하드닝 / #341 3-B / #342 3-C + 핸드오프/메모리 커밋). main 클린·origin 동기화. **내일 본 파일만 읽고 3-D 부터 재개.**
> ⚠️ **Codex 복구됨** (2026-06-01) — dual 5-agent 정상 가동(Claude 기획→Codex 구현→양쪽 cross-check). **PR 은 spec/plan push 직후 즉시 발행**([[feedback_open_pr_early]]).
> 🚨 **교훈(개발책임자 지적)**: CHORE 라도 **dual 5-agent TM 리뷰 제대로** 돌릴 것 — 가벼운 PM 단독 리뷰가 #342 의 P1(CI 필터 누락 false-green)을 놓칠 뻔. PR 마다 **Claude TM / Codex TM 사이클별 종합 코멘트 게시 의무**([[feedback_dual_5agent_review]]).
> **다음 = 아래 "다음 작업" 3-D**(FE StockBalanceModal, brainstorming 필요) → 3-A2(Playwright) → item 2(typeahead). [[feedback_pm_auto_continuous]].

**현재 상태**: **PR #346 (3-A2-① 정적계약 22스펙 재게이트) 머지 완료 (squash `a34eed0f`)** — 회사 PC Codex 리뷰 중 세션 단절 → 재개. CI 실패(operational `describe.skip` silent-skip 가드 위반) 선제 fix → dual 5-agent 리뷰 3사이클 수렴(Codex+Claude QA/FE, false-green/단언약화 7건+1건 fix, 최종 APPROVE) → 전체 CI green(게이트 297 passed/0 skipped) → 개발책임자 승인 → squash 머지·브랜치 삭제. **진행 중 작업 없음.** 다음 후보 ↓.
> ⚠️ 잔여(비차단, 추적): PermissionMatrix system.* 셀 FE readonly 미구현(서버 시드 V37 강제, sp-d6-1 TODO) / 격리 유지 sp-08-6-6·sp-09-*·sp-d1~d4 후속 배치 / **3-A2 격리 잔여 레거시 스펙**(동적RBAC·드리프트UI — 정적계약 22 외).

**(직전)**: **item 2 머지 완료 (#345 squash `4c07e580`)** — 3-D #343 / 3-A2 #344 / item 2 #345 머지.

### 다음 후보 (개발책임자 선택)
1. **시리얼 S3 출고연동** — 판매전표→FIFO SHIPPED 소진 + 2.6c reserve↔RESERVED 통합([[project_serial_inventory_model]]). 다음 시리얼 슬라이스.
2. **3-A2 격리 39 레거시 스펙 수리** — 동적RBAC(sp-d*)/정적계약(sp-08·09)/드리프트UI. 게이트 커버리지 복원(dev-report `slice-3-a2-...` 추적목록).
3. **3-D 비-0 재고 실 QA 재캡처** — 3-DB reseed 후 SlipFormPage 가용/실/예약 실값 캡처(현재 로컬 드리프트로 0/0/0).
4. **WarehouseAutocomplete/Selector → AsyncAutocomplete 통합 평가** (D-AAC-01 후속, sync 변형).

### ✅ item 2 머지 완료 (#345 squash `4c07e580`, 2026-06-02)
ProductAutocomplete(450)·PartnerAutocomplete(465) 95% 중복 → 제네릭 `AsyncAutocomplete<T>`(430) + wrapper(87/93) 추출. 공개 API·타입·prop 불변(소비처 SlipFormPage·LineRow 0 변경). CSS 단일화 + focus-ring 토큰(AC-2 백포트 흡수). 순감 900→610 + 구 css 2개 삭제. DECISIONS D-AAC-01~03. dual(Claude 2-agent+Codex) P0/P1 0 · CI 29/29(Desktop Playwright 게이트가 ac-2/ac-3 회귀 통과로 동작 불변 실증). dev-report `slice-item2-async-autocomplete`.

### ✅ item 3-A2 머지 완료 (#344 squash `56bfcae0`, 2026-06-02)
`clients/desktop/playwright/**` mock 회귀 스펙 CI hard gate(false-green 해소). **opt-out 컨벤션**(testIgnore manual/full-qa/audit/*-real-qa/full-menu-contract — 그 외 자동 게이트) + `qa-e2e.yml` `desktop-playwright` 잡(`|| true` 금지, DS 사전빌드 선행) + silent-skip 가드(expected>0/unexpected>0/**skipped>0** 엄격) + README 컨벤션. spec/plan/DECISIONS(D-3A2-01~03)/dev-report 박제.
- **트리아지**: load-error 복구(`__dirname` ESM/sp-09-5 문법/full-menu-contract 제외) → 수집 0→416 → 로컬 전수 335 pass/77 fail(39 레거시)/4 skip → **39파일 투명 격리(QUARANTINE)** → 게이트 **171 green**(핵심 mock 24 tests 포함). dual(Claude 2-agent+Codex cross-check) P0/P1 수렴(Codex가 silent-skip escape P1 적발→가드 엄격화). CI 24/24.
- **도입 중 적발·수정한 실 결함**: local-vs-CI 갭(DS dist 미빌드)·가드 json 경로 충돌(html과 분리)·silent-skip escape — 게이트 차단력 실증.
- **⚠️ 후속(추적, 비차단)**: 격리 39 레거시 스펙 수리 — 동적RBAC(sp-d1/d2/d3/d4/d6-1·applayout), 정적계약(sp-08-*/sp-09-*), 드리프트UI(admin-hr/tax-invoice-batch/supplier-profile/phase-2-5/2-6c/purchase-inspection-cta/partner-ui-menu-gap/operational/sp-06/datagrid/dps-by-product/menu-relocate/mig-14/slip-form-v20/sales-purchase-query). 목록: dev-report `slice-3-a2-...`.

### ✅ item 3-D 머지 완료 (#343 squash `ea2b4038`, 2026-06-02)
SlipFormPage 재고모달을 구 `StockBalanceModal`(총량) → 신 공용 `InventoryLookupModal`(가용/실/예약)로 일원화 + 구 컴포넌트/`fetchStockBalanceBatch` 데드코드 제거(순감 –818/+57) + 병합 후 주문 목록 배지 갱신 invalidate 회귀 E2E 신규. BE 무변경/Flyway 없음/FE only. spec/plan/dev-report/DECISIONS(D-3D-01~03) 박제.
- **Claude 5-agent + Codex 5-section cross-check P0/P1 0 수렴**(QA P2 2건 fix). **CI 28/28 green**. **Docker 비파괴 실 QA PASS**(실 게이트웨이+JWT+product/inventory+DB, `balances/batch` 200, 신 모달 실 서버 오픈·VIRTUAL제외·UUID가드·0수량토글, 실캡처 5장 `docs/qa/slice-3-d-slipform-stock-modal-unify/`). 값 0/0/0=로컬 구-시드 드리프트(코드 무관, 비-0은 2.6d #335 동일모달 기실증).
- **실 QA 부수 해소(비파괴)**: dev_master 비번 해시↔V5 시드 평문 불일치 복원 / design-system `dist` stale 재빌드. (둘 다 로컬 환경, 코드 무관.)
- **⚠️ 후속(비차단)**: **3-A2** = 신규 desktop Playwright 스펙 CI 미실행(`clients/desktop/playwright/**` 가 CI `qa/playwright` 범위 밖, 80+ 스펙 기존 부채)→CI 자동실행 hard gate. UX P2(0수량 토글 헤더 밖 분리 / 선택품목 리스트 표시). (선택) 3-DB reseed 후 비-0 재고 실 QA 재캡처.

### ✅ 이번 세션 — 6 PR 머지 (2026-06-01)
- **#337 [FIX] 게이트웨이↔arologis CORS 중복 dedup** (`b725b2e4`, D-GW-CORS-01): arologis 자체 CORS(:8097용)가 게이트웨이 경유 2xx 에도 발동→ACAO/ACAC 중복→차단. `default-filters DedupeResponseHeader RETAIN_UNIQUE`. #322 와 같은 5/30 QA 발견·미커밋분. before/after Docker 실 QA(2→1). (Codex 미복구 시점 → Claude 단독.)
- **#338 [FEAT] 시리얼 S2 입고연동** (`260d44f3`, INV-S, D-SER-05~08): 구매/차용 INBOUND `complete()` → serial_managed 품목 `stock_instances` N개(`POST /inventory/instances/batch` count-deficit 멱등 + advisory lock), batch→기존 lot. **연동=동기 REST+보상**(이벤트 X — spec §5 "회계 이벤트 구독" 전제는 사실 반대). 시리얼=자동 UUID. inboundType=deliveryTag(구매/차용, RETURN/회차=S4 가드). Codex 구현 + dual N=2 수렴(P1 4건). Docker 실 QA + CI 20/20.
- **#340 [CHORE] CI false-green 하드닝** (`1d181dcd`, item 3-A): slip 테스트 필터 누락 패키지 전수 등재(estimate/revision/attachment 등 — CI 미실행이던 것 폐쇄) + date-bomb 2건 정정. (⚠️ 신규 `slip.seed.*` 누락 → #342 보강.)
- **#341 [FIX] partner-order /revisions 500** (`a2c9c40b`, item 3-B): listWithSummary deserialize 가 구 스냅샷 스키마 진화 시 500 → `@JsonIgnoreProperties`+`READ_UNKNOWN_ENUM_VALUES_AS_NULL`+목록 graceful + 재현 IT. **B2(discountInfo) descope**(주문에 저장 원천 없음=별도 기능).
- **#342 [CHORE] EstimateSeeder UUID 정합** (`9b9aedd1`, item 3-C): EstimateSeeder TEST-MODEL→실 modelName + 결정적 UUID(`HvacSeedProductCatalog` 100모델 HvacProductSeeder 1:1) + `slip.seed.*` CI 필터 추가. dual 5-agent 가 P1 2건 적발(CI필터/reseed QA) — CI필터 fix, reseed QA 는 로컬 구-시드 드리프트로 deferred.
- **소급 TM 리뷰**: #337/#338/#340/#341 에 Claude TM/Codex TM 사이클별 종합 코멘트 소급 게시 완료.

### ⚠️ 비차단 후속 (이번 세션 발견 — S2 무관 인프라)
- **CI false-green 게이트 결함**: `ci.yml` slip 테스트가 패키지 allowlist(`--tests "...slip.client.*" 등`)라 **`slip.attachment.*` 미실행** → #316부터 잠재 버그(SlipPhotoAuditAdminControllerTest enum↔String, 본 PR drive-by 교정)가 CI 미포착이었음. **CI 필터 보강 별도 PR 권장**([[feedback_enforcement_real_http_test]] 계열).
- **date-bomb 테스트**: `DpsSaveHistoryIT`/`SlipCleanupSaveHistoryIT` 가 저장이력을 하드코딩 월범위(2026-05)로 조회→6월 진입 시 실패. 상대범위로 교정. **유사 하드코딩 날짜 테스트 전수점검 필요**.
- `/inventory/*` mutation 의 internal-token 강제 가드(현 X-User-Role:MASTER 헤더 의존, 기존 패턴 한계).
- **DB 드리프트 주의**: 회사 PC 로컬 스택은 본 세션 전 #336 이전 구 스키마였음(product V8). Docker 실 QA 전 관련 서비스 재빌드로 최신 Flyway(V9/V15/V16) 적용 필요.

### ✅ 이번 세션 — 시리얼 인스턴스 재고 S1 인스턴스 기반 머지 (#336 `c043e4b9`, Phase INV-S)
개별시리얼 품목(에어컨) 재고 최소단위 = UUID 인스턴스(`stock_instances`). **BE 전용**, 입출고 전표 연동은 S2~S4 후속.
- product: V9 `categories.serial_managed`(에어컨 계열 UPDATE: HVAC/INDOOR/OUTDOOR/INDOOR_WALL/INDOOR_CEILING=true, PIPING/CONTROL=false) + `Category.serialManaged` + `ProductSummaryResponse.serialManaged` + HvacProductSeeder markSerialManaged.
- inventory: V15 `stock_instances`(UUID 시리얼 키, status AVAILABLE/RESERVED/SHIPPED/RECALLED 전이, FIFO received_at/역-FIFO outbound_at 인덱스) + `StockInstance`(inbound 팩토리+ship/recall/reserve/release 가드, BusinessException) + Repository(FIFO/역-FIFO/findByProductId) + Service(serial_managed 가드 409) + `StockInstanceController`(/inventory/instances) + seeder + IT 12.
- **관리방식 판정 = product `serial_managed` 파생**(DECISIONS — 마우스 결정). 5-team 사이클 N=2 APPROVE. CI green(skipped=0). **Docker 실 QA PASS**(인스턴스 생성 201/AVAILABLE, batch 품목 409 차단, FIFO received_at ASC, psql cross-DB serial_managed 정합 — `docs/qa/slice-inv-s1-serial-instance/real-qa-evidence.md`).
- spec/plan: `docs/.../2026-05-31-serial-instance-inventory-design`(§4 S1) + `docs/.../2026-05-31-serial-instance-s1`.
- **⚠️ S2~S4 후속(독립 슬라이스)**: S2 입고연동(구매전표→인스턴스 생성/lot) / S3 출고연동(판매전표→FIFO 소진+출고처) / S4 회수(반품/회차 역-FIFO). 미결정(spec §5): 전표↔inventory 연동 방식(이벤트 vs REST). DECISIONS D-SER-01~04 + dev-report 정식화 완료(`67ad8e8a`).

### 🎯 다음 작업 (회사 PC)
1. ~~**S2 입고 연동**~~ ✅ **머지 (#338 `260d44f3`)**. 다음 시리얼 = S3 출고연동(판매전표→FIFO SHIPPED + 2.6c reserve↔RESERVED) / S4 회수(반품·회차 역-FIFO).
3. **후속 비차단 일괄 정리** (개발책임자 2026-06-01 선택, A→B→C→D 독립 PR):
   - ~~**3-A CI 하드닝**~~ ✅ **머지 (#340 `1d181dcd`)** — slip 테스트 필터 누락 전수 등재 + date-bomb 정정. (단 신규 `slip.seed.*` 누락 → #342 에서 보강.)
   - ~~**3-B partner-order 버그**~~ ✅ **머지 (#341 `a2c9c40b`)** — `/revisions` 500 스냅샷 역직렬화 견고화(@JsonIgnoreProperties + READ_UNKNOWN_ENUM + 목록 graceful) + 재현 IT. **B2(discountInfo) descope**(주문에 저장 원천 없음 = 별도 기능).
   - ~~**3-C seeder 정합**~~ ✅ **머지 (#342 `9b9aedd1`)** — EstimateSeeder TEST-MODEL→실 modelName + 결정적 UUID(HvacSeedProductCatalog) + slip.seed.* CI 필터 추가.
   - **3-D FE StockBalanceModal 통합** (다음): SlipFormPage 재고모달 통합 + 목록 배지 갱신 E2E. **brainstorming 필요**(FE 설계).
   - **3-A2 Playwright hard gate**: D2/2.6d desktop 스펙 CI 자동실행(`ci.yml:171` 별도 PR 명시, E2E 스택 필요).

> 🚨 **로컬 스택 구-시드 드리프트(2026-06-01 발견)**: 로컬 product_db 의 products 가 **v4 랜덤 UUID(구 시드, #327 native-INSERT 결정적 UUID 이전)** — product-service 재빌드해도 seeder 멱등(modelName EXISTS) 으로 재시드 skip → **#327 결정적 UUID 3-DB 정합이 로컬에 미실현**. 따라서 cross-DB join 실증 QA(견적/재고 productId ∩ products.id)는 **3-DB TRUNCATE CASCADE + 전체 reseed**([[project_seed_product_uuid_catalog]] 절차) 후에만 가능. 차기 QA 세션 선결. 코드(결정적 파생)는 정상.
2. **공용 async typeahead 추출** (`AsyncAutocomplete<T>`): ProductAutocomplete+PartnerAutocomplete 거의 동일 → 공통 base 리팩터(+WarehouseAutocomplete sync 변형 통합). FE 소규모 정리. brainstorming/writing-plans 부터.
3. **후속 비차단 일괄 정리**: 2.6d·D2 후속(목록 배지 갱신 E2E / discountInfo 충돌헤더(PartnerOrderDetail BE 보강) / INBOUND seeder product_id 정합(구 TEST-MODEL UUID→실 modelName, 재고조회 입고 컨텍스트 실값 토대) / SlipFormPage StockBalanceModal 통합 / D2·2.6d Playwright CI 자동실행 게이트) + partner-order `/revisions` 500(별도).

### ✅ (직전) 2.6d 품목 재고조회 모달 머지 (#335 `6e4ac58b`)
주문/출고/입고 상세 품목 다중선택 → 창고별 가용/실/예약 매트릭스 모달(0수량 전창고 토글). **DECISIONS D-IL-01~06**. 읽기전용 FE + BE 1필드.
- partner-order `LineResponse.productId` 노출(재고 batch 키, 화면 미노출) + FE `fetchProductBalancesMatrix`(batch 가용/실/예약 + listWarehouses 머지, **lines 기준 순회** — 잔량 없던 품목도 행 생성) + 신규 공유 `InventoryLookupModal`(셀 3줄, design-system 토큰: 가용0 danger·예약>0 warning, sticky 고정컬럼, th scope/caption/aria) + SlipDetailPage(기존 단일 alert 재고조회 대체)·SalesPartnerOrderDetailPage 배선.
- 5-team 사이클 N=2 전원 APPROVE(사이클1 QA B-2 품목 행 누락 실버그·Designer 토큰화·FE 상태리셋 fix). CI 23잡 green(skipped=0). **Docker 실 QA PASS**(실 inventory_db — HQ-001 가용47/실50/예약3 등 psql 일치, 0토글 OFF/ON·VIRTUAL 제외 실 캡처 9장 `docs/qa/slice-2-6d-inventory-lookup/`). batch API/inventory 무변경 → 배포 partner-order→FE, Flyway 없음.
- spec/plan/dev-report: `docs/.../2026-05-31-inventory-lookup-modal*` + design guide `docs/design/inventory-lookup-modal-guide.md`.
- **⚠️ 후속(비차단)**: SlipFormPage StockBalanceModal 통합 / 시리얼 카운트 확장 / D2-6d Playwright CI 자동실행 / INBOUND seeder product_id 정합(구 TEST-MODEL UUID→실 modelName) / partner-order `/revisions` 500(별도).

### 다음 후보 (개발책임자 선택)
1. **A 시리얼 인스턴스 재고 모델** (대형, spec 박제됨 `2026-05-31-serial-instance-inventory-design`): writing-plans 부터.
2. **공용 async typeahead 추출** (`AsyncAutocomplete<T>`): ProductAutocomplete+PartnerAutocomplete 거의 동일 → 공통 base 리팩터. 소규모.
3. **D2/2.6d 후속 비차단 정리** (위 ⚠️ 항목 + 목록 배지 갱신 E2E / discountInfo 충돌헤더).
4. **INBOUND/seeder 정합** (재고조회 입고 컨텍스트 실값 표시 토대).

### ✅ (직전) D2 다중주문 병합 → 단일 출고전표 머지 (#334 `f1de64d0`, 2.6b ②)
같은 거래처 DRAFT/ON_HOLD 주문 N개 → 단일 출고전표 병합 발행. **DECISIONS D-MRG-01~06**.
- slip **V30 `slip_source_orders`**(N:1 헤더추적) + `publishFromOrdersMerge` + `findBySource` UNION 확장. partner-order `convertMerge`(reserve→발행→보상 N주문 일반화, 원자적) + `POST /convert-to-slip-merge`. desktop 다중선택 + `MergeConvertDialog`(충돌헤더 라디오/직접입력, danger 경고, 4-AND).
- **전표번호 표준 = 슬래시 `YYYY/MM/DD-{번호}`**(화면/저장/본문). URL 경로 세그먼트만 공용 **`utils/orderNo.ts` `toOrderPathId`**(슬래시→하이픈, 게이트웨이 `%2F` 차단 회피, 단일주문 경로와 동일 규약). 개발책임자 지적 반영.
- 5-team 사이클 N=2 전원 APPROVE. CI 23잡 green(skipped=0). **Docker 실 QA PASS**(실 gateway+JWT+DB — slip `2026/05/31-10` 발행 + `slip_source_orders` 2행 + `converted_quantity` 누적 + inventory RESERVE psql 실적중, 캡처 09장 `docs/qa/slice-d2-order-merge/`). 실 QA가 **FE-BUG-1**(병합 모달 슬래시 주문번호 `%2F`→게이트웨이 400, mock 미검출) 적발·수정.
- spec/plan/dev-report/런북: `docs/superpowers/{specs,plans}/2026-05-31-order-merge-to-slip*` + `docs/dev-reports/slice-d2-order-merge-to-slip.md` + `docs/runbooks/d2-order-merge-deploy.md`.
- **⚠️ 후속(비차단)**: 병합 성공 후 목록 배지 갱신 E2E(invalidate 로직은 존재) / discountInfo 충돌헤더(PartnerOrderDetail 미보유, BE 보강) / D2 Playwright CI 자동실행 게이트 / 공용 `AsyncAutocomplete<T>` 추출.

### 다음 후보 (개발책임자 선택)
1. **B 2.6d 재고조회 모달** ([[project_inventory_lookup_modal_2_6d]]): 주문/판매/구매 상세 품목 선택→창고별 재고 모달(가용/실/예약, 0수량 토글). FE 중심, 백엔드 `GET /inventory/balances` 기존재. spec 미작성 → brainstorming 부터.
2. **A 시리얼 인스턴스 재고 모델** (대형, spec 박제됨 `2026-05-31-serial-instance-inventory-design`): writing-plans 부터.
3. **공용 async typeahead 추출** (`AsyncAutocomplete<T>`): ProductAutocomplete+PartnerAutocomplete 거의 동일 → 공통 base 리팩터(+WarehouseAutocomplete sync 변형 통합). 소규모 정리.
4. **D2 후속 비차단 정리** (위 ⚠️ 항목).

### ⚠️ 미해결 후속 (비차단)
- **confirm DC 실적용**: confirm 은 정상 partnerCode 전송하나 **partner_order_db ↔ dc_config_db 거래처코드 시드 불일치**로 로컬 실 confirm DC fail-soft(정상가). 시드 정합(DevOps/seed) 후 실 confirm DC 재-QA. (#330 QA 발견.)
- autocomplete: input height 36/40 통일 / order-app FE "전송완료" 실 캡처(partner_auth 시드) / AC-1·AC-2 focus-ring·shadow 토큰 백포트(AC-3 에서 토큰 신설됨).
**⚠️ AC-3 선결**: 거래처 검색 API(명·코드·정보) 확인 — partner-service `/admin/partners/search` 등 존재(slice C 메모). AC-2 검색 = product-service `GET /products?q=`(name/model_name LIKE) 재사용 확인됨.
**⚠️ confirm 복구 후속(비차단)**: ① **partner_order ↔ dc-config 거래처코드 시드 정합**(DevOps/seed) — 정합 후 실 confirm DC 실적용 재-QA(현재 로컬 시드 불일치로 fail-soft, 코드는 정상 partnerCode 전송). ② order-app FE "전송 완료" 실 캡처(partner_auth 시드 부재로 #330 QA BLOCKED). ③ confirm 옵션 정액 DC / estimate price-calc / N-1 P2.
**환경 메모**: ⚠️ Codex 6/1(월) 12:00 복구 전 → 구현+리뷰 모두 Claude 에이전트. 5-team 패턴 + 사이클 N=2 + Docker 실 QA([[no-fake-data-ever]]) + [[always-mouse-choices]] 유지.

### 🚧 confirm 경로 복구 구현 완료 (브랜치 `fix/confirm-recovery-dc-price-calc`, 머지 전)
D1 실 QA 가 드러낸 기존 버그 2건 복구. ① `DcConfigClient` 죽은 스켈레톤(없는 `/api/v1/dc-configs/{code}` 403) → dc-config `/internal/price-calculations` 정식 연동(D-CR-01, fail-soft D-CR-02). ② order-app `sendOrderFromUi` ApiResponse→레거시 `{ok}` 정규화(D-CR-03, "전송 실패" 오표시 해소).
- BE `e85f45f3`: `DcConfigClient.calculatePrices` + confirm finalPrice 사용 + mapCategory + 죽은 메서드 제거 + VendorOrderService dcRate=0 + confirm IT 2종. 225 tests PASS(skipped=0). FE `70dacf5f`: 정규화.
- spec/plan/dev-report `docs/.../2026-05-31-confirm-recovery-dc-price-calc*` + `docs/dev-reports/confirm-recovery-dc-price-calc.md`. DECISIONS D-CR-01~03.
- **다음 단계**: PR → 5-team N=2 → CI → **Docker 실 QA(D1 BLOCKED 였던 실 confirm→DRAFT+DC price_vat psql 실증)** → 머지. → 이후 **AC-1 창고 자동완성**(설계 승인됨).

### ✅ 슬라이스 D1 머지 완료 (#329 squash `8ff363f1`)
2.6b 분할 ①. 거래처 포털 confirm 자동발행 폐지 — confirm 은 slip 미발행 **DRAFT(진행중)** 주문만 생성(D-CF-02), from-estimate 와 일원화. 출고전표는 명시적 convert 로만 발행.
- BE: `PartnerOrder.createFromConfirm`(DRAFT+NOT_REQUIRED) + `confirm` slip 발행 블록 제거 + 미사용 의존 정리(`85d6150f`). FE(order-app) **무변경**(confirm 성공 핸들러 slipNo/status 비의존, "전송이 완료되었습니다"). outbox/scheduler dormant 유지(D-CF-03).
- 테스트: `PartnerOrderConfirmServiceIT` 2 케이스(DRAFT+slipNo null+slip 미호출+outbox 0) + 전체 회귀 PASS(skipped=0). 부수효과: slip-service 다운에도 confirm 200.
- spec/plan/dev-report: `docs/superpowers/{specs,plans}/2026-05-31-confirm-no-autopublish*` + `docs/dev-reports/slice-d1-confirm-no-autopublish.md`. DECISIONS D-CF-01~03.
- **다음 단계**: PR → 5-team N=2 → CI → Docker 실 QA(실 confirm→DRAFT+slip 0건 psql→convert 발행) → 머지. partner-order 단독 배포.
- **다음 슬라이스**: D2(다중주문 병합 — slip N:1 출처추적+from-orders-merge+'/'병기+FE 다중선택) → B(2.6d 재고조회 모달) → A(시리얼).

### ✅ 2026-05-31 완료 — 슬라이스 C slip↔inventory 창고코드 정렬 **머지** (#328 squash `ed7bebee`)
2.6c convert happy-path 잠금. **inventory 단일 출처**(D-WH-01) + convert 가 inventory 해석 warehouseId 를 slip 에 직접 전달·estimate 는 yml 격리(D-WH-02) + 전환 모달 창고 필수 선택(D-WH-03).
- BE: slip `PublishFromPartnerOrderRequest.warehouseId` + `resolveWarehouseId`(warehouseId 우선·yml 폴백) / partner-order convert payload warehouseId 전달. FE: 전환 모달 `WarehouseSelector` 필수 + warehouseCode 전송.
- **5-team 사이클 N=2 전원 APPROVE**(FE/Designer P1 4건 fix). CI 23 green(skipped=0). **Docker 실 QA**: fresh 주문 clean 재실행 — 신규 RESERVE row(HQ-001 `…0001`) + reserved_qty 증가 + slip `source_warehouse_id` 동일 UUID + status SENT 한 트랜잭션 실증. **UI 실 캡처 3장**(실 gateway+JWT+렌더러, 창고 필수→전환 성공 출고전표 2026/05/31-5). 증빙 `docs/qa/slice-c-warehouse-code-align/`.
- spec/plan/dev-report: `docs/superpowers/{specs,plans}/2026-05-31-slip-inventory-warehouse-code-align*` + `docs/dev-reports/slice-c-warehouse-code-align.md`. DECISIONS D-WH-01~03.
- **⚠️ 후속(비차단)**: BE-P1 convert 재시도 2차 captor 단언 / Designer-P2 WarehouseSelector 옵션 코드 표시·focus ring 토큰화(공유 컴포넌트, 별도 슬라이스) / QA-P2 warehouseId 형식오류 400 IT·SENT 연동 단언. inventory `legacy_code` 별칭 도입 시 slip yml 맵 완전 폐기(estimate 통합).
- **다음 슬라이스**: **D(2.6b 다중주문 병합 + confirm 자동발행 폐지)** → B(2.6d 재고조회 모달) → A(시리얼 인스턴스).

### 다음 후보 (개발책임자 마우스 선택 → spec/plan 있으면 바로 구현 착수)

| # | 후보 | spec/메모리 | 진입 상태 |
|---|---|---|---|
| **A** | **시리얼 인스턴스 재고 모델** (대형) | spec `docs/superpowers/specs/2026-05-31-serial-instance-inventory-design.md` / [[project_serial_inventory_model]] | spec 박제 완료 → **writing-plans 부터**(S1 인스턴스 기반). 가장 큰 도메인 변화 |
| **B** | **2.6d 품목 재고조회 모달** | [[project_inventory_lookup_modal_2_6d]] | spec 미작성 → **brainstorming/writing-plans 부터**. FE 중심, 백엔드 `GET /inventory/balances`(가용/실/예약) 기존재 |
| ~~**C**~~ | ~~**slip↔inventory 창고코드 정렬**~~ ✅ **머지 완료 (#328 `ed7bebee`)** | spec/plan/dev-report 박제됨 | inventory 단일 출처 정렬 — convert happy-path 잠금 완료 |
| **D** | **2.6b 다중주문 병합 + confirm 자동발행 폐지** | `docs/superpowers/specs/2026-05-30-order-to-slip-conversion-design.md` §7 | 같은 거래처만·출고정보 '/'병기. confirm→주문만생성으로 분리 |
| **E** | 품목코드 그룹 모델(product_code 1:N) | spec `docs/superpowers/specs/2026-05-31-product-code-grouping-design.md` | 옵션1(product_code 컬럼) 권장. A(시리얼)와 연계 — 통합 검토 가능 |

> 권장 순서 의견(참고): A·E 는 도메인 근간이라 묶어 검토 가치. C 는 2.6c happy-path 마무리(소). B 는 독립 FE. 단 **최종 선택은 개발책임자**.

### 재고 실 QA 재현 절차 (다음 세션 Docker QA 시 필수)
1. seeder 멱등이라 재시드하려면 3-DB(product/inventory/partner_order) product 관련 테이블 `TRUNCATE CASCADE` 후 새 이미지 재기동.
2. docker-compose.local-all.yml 에 product/inventory/slip/partner-order **seed 토글 미정의** → 재기동 시 `SAMHAN_<X>_SEED_TEST_DATA=true` 환경변수 주입 필요(override 파일 사용).
3. slip/partner-order 호스트포트(8086/8088) influxd(PID 1956) 충돌 → override 로 `ports: !reset []`(컨테이너간 Eureka 통신만).
4. 상세: [[project_seed_product_uuid_catalog]].

---

## ✅ 2026-05-31 완료 — Phase 2.6c 주문→전환 시 재고 **예약(reserve)** 정합 **머지** (PR #327 squash `0299191b`)

> ⚠️ Codex 6/1 12:00 복구 전 → 구현+리뷰 모두 Claude 에이전트 전면 대체.

**도메인 모델 (개발책임자 확정 2026-05-31)**:
- **주문서 = 재고 무영향**(견적전환 DRAFT, 거래처 confirm 주문 모두).
- **출고전표로 전환(convert) = 재고 예약(reserve)** — 실재고 차감(deduct) 아님. 예약은 가용재고를 묶고 실재고 유지.
- **실재고 차감(deduct) = 후속 출고확정 단계**(본 슬라이스 제외).
- **재고 조회 = 가용/실/예약 구분 표시.** 예약 가능 부족 시 전환 **409 사전차단**.
- **confirm 의 주문확정-reserve 제거**(주문 무영향). confirm 자동발행 자체 폐지는 2.6b.
- **전환으로 생성된 출고전표(판매전표)는 새 전표 → 발행 즉시 불변(SENT)**. 기존/타 경로 전표는 회귀방지 위해 현행 유지.

**머지 산출**:
- BE: inventory `by-code` internal endpoint + reserve 멱등(V14 partial unique index) + 가용/실/예약 조회. partner-order convert 재설계(warehouseId 변환→라인별 reserve→slip 발행→실패 시 release 보상→converted 누적). confirm reserve 제거. slip PARTNER_ORDER 전표 SENT 불변(수정/삭제/cancel 409).
- FE: 재고현황 페이지(`/inventory/stock-balance`, 가용/실/예약 DataGrid) + 전환 409 에러 UX.
- **실 결함 2건 수정(Docker 실 QA 발견, IT @MockBean 미검출)**: ① SlipServiceClient 경로(`/api/v1/slips/...`) ② **InventoryClient X-User-Role:MASTER 헤더 누락→403**.
- **seed product UUID 3-DB 정합**(근본 인프라 수정): 4 seeder product key 통일(modelName 결정적 UUID) + product seeder `@UuidGenerator` 덮어쓰기 버그 → jdbcTemplate native INSERT. → products/stock_balances/partner_order_lines product_id 정렬(cross-service join 가능).
- **사이클 N=2 APPROVE**(BE/FE/Designer/QA/DevOps). CI 23 job green(skipped=0). **Docker 실 QA**: 전환→예약(RESERVE+2)→slip 발행실패→release 보상(RELEASE+2)→재고 원상복구 end-to-end 실 DB 증명(`docs/qa/phase-2-6c-inventory-deduction/real-qa-evidence.md`).
- spec/plan: `docs/superpowers/{specs,plans}/2026-05-30-inventory-deduction-*`.

**⚠️ 2.6c 잔여/후속**:
- **slip↔inventory 창고코드 불일치**: slip `warehouse-code-map`=이카운트 레거시(`00003/2/14/1`), inventory=자체코드(`HQ-001` 등). 전환 happy-path(slip 발행 성공)는 이 정렬 후 가능 — 2.6c 범위 밖 별도 통합 과제.
- 실재고 차감(deduct)=출고확정 단계(후속). 2.6c 수량 reserve → 시리얼 인스턴스 RESERVED 통합(시리얼 Phase).

### 다음 슬라이스 후보 (개발책임자 결정 — [[always-mouse-choices]])
1. **시리얼 인스턴스 재고 모델** (신규 대형 Phase, spec `docs/superpowers/specs/2026-05-31-serial-instance-inventory-design.md`): 품목코드(그룹)→시리얼 UUID 인스턴스. 카테고리로 개별시리얼(에어컨/판넬)/batch(부자재) 분기. 입고 구매/차용=생성·반품/회차=역-FIFO 회수, 판매=FIFO 소진+출고처 기록. S1 인스턴스 기반→S2 입고→S3 출고→S4 회수.
2. **2.6d 품목 재고조회 모달**(주문/판매/구매 상세, 0수량 창고 토글, 가용/실/예약) — [[project_inventory_lookup_modal_2_6d]].
3. **2.6b** 다중주문 병합 + confirm 자동발행 폐지(같은 거래처·'/'병기).
4. **slip↔inventory 창고코드 정렬**(전환 happy-path 잠금) / 품목코드 그룹 모델 product_code(spec `2026-05-31-product-code-grouping-design.md`).

**다음 단계**: backend 완료 → FE 재고화면 → PM 통합 빌드 → 5팀 사이클 N=2 → CI(skipped=0) → Docker 실 QA(실 inventory_db 예약 row psql 증빙) → 머지.
**배포 순서**: inventory(by-code+reserve 멱등) → slip(전환전표 불변) → partner-order(convert 예약+사전차단+보상, confirm reserve 제거).

---

## ✅ 2026-05-30 완료 — 권한 재편 Phase 2.6a 주문→출고전표 **부분전환 머지** (PR #325 squash `fd6e0ea0`) + GitGuardian 평문제거 (PR #326 `076d569a`)

- **2.6a 산출**: slip 미발행 주문(DRAFT/ON_HOLD, slipNo=null) 라인별 부분전환. `converted_quantity`(partner-order V8) + 단일주문 convert API(`POST /{id}/convert-to-slip`) + `SlipLine.sourceOrderLineId`(slip V29) + 전량전환 시 status `CONVERTED` + 권한 `sales.partner-order.convert`(auth V41). FE 전환버튼 화이트리스트 + 라인 수량 모달(비가역 경고) + 전환됨/잔여 컬럼.
- **P0 버그 수정(Docker 실 QA 발견, Phase 6 잠재)**: `SlipServiceClient` URI `/slips/from-partner-order` → `/api/v1/slips/from-partner-order`(lb 직접호출 풀패스, 원본 404) + `X-User-Role:MASTER` 헤더. confirm/convert/outbox 3 caller 공통. cycle3 BE 재검 APPROVE. ⚠️ 운영 배포 시 outbox PENDING 일괄발행 부하 확인.
- **사이클 N=2**: cycle1 5팀(P0 2/P1 6)→fix→cycle2 BE/FE/QA APPROVE. CI 전 job PASS. IT 10(실 Postgres)+단위4+Playwright. Docker 실 QA 실화면 4장+psql 적중(converted_quantity·source_order_line_id).
- **GitGuardian(#326)**: #325 머지 후 main 5개 파일에 DEV 비번 `dev_p05_pass!` 평문 잔존(false positive 아님, 단 V5 시드 공개 DEV-ONLY·운영무관) → capture/seed 스크립트 환경변수화 + docs 마스킹 + `.gitguardian.yaml` ignored-matches + `.gitignore` 에 `.gradle-codex/`·`_codex_commit_repo/`(164MB jar 커밋 사고 방지). main 평문 0.
- spec/plan: docs/superpowers/{specs,plans}/2026-05-30-order-to-slip-conversion-*. 분리: **2.6b**(다중주문 병합 + confirm 자동발행 폐지, 같은 거래처·'/'병기) / **2.6c**(재고 예약, 진행 중).

---

## ✅ 2026-05-30 완료 — 권한 재편 Phase 2.5 주문 보류(ON_HOLD) 상태 + 리스트 상태 필터 **머지** (PR #324 squash `d095b9d0`)

⚠️ Codex 6/1 12:00 복구 전 → 구현+dual리뷰 모두 Claude 에이전트 전면 대체.

- **산출**: `ON_HOLD`(보류) enum + `markOnHold`/`releaseHold` 도메인 메서드(409 가드) + `POST /hold`·`/release`(기존 `sales.partner-order.edit` UPDATE 권한 재사용) + 리스트 정렬/기간필터 **COALESCE(confirmedAt, createdAt)** 통일 + count 쿼리 orderBy 가드. 마이그레이션 불필요(status VARCHAR CHECK 제약 없음). FE 라벨 업무용어 통일(작성중→진행중/확정→완료/ON_HOLD=보류/CONFIRMING=확인중) + status 뱃지 색 정정 + 보류/해제 버튼(warning, 403/409 피드백) + 기본 필터 진행중.
- **전이**: 진행중(DRAFT)↔보류(ON_HOLD) 양방향만, 완료(CONFIRMED) 보류 불가. ON_HOLD 는 Phase 2.4 복원 제외목록 가드에 자동 포함(복원 가능).
- **사이클 N=2**: cycle1 5팀(P1 4)→fix→cycle2 BE/FE/QA APPROVE→cycle2c(count 가드). CI 21 job PASS. IT 11(실 Postgres, skipped=0)+단위 5+Playwright 8.
- **Docker 실 QA**: 실 gateway(:8080)+실 JWT(dev_master)+실 partner_order_db 연동 실 desktop renderer 화면 7장(44~118KB 실렌더) + raw JSON/psql 실적중 증빙(hold→ON_HOLD/release→DRAFT/필터/409). 인증전달만 IPC stub(addInitScript 실JWT), API/데이터/화면 전부 실제.
- **DECISIONS** D-PO-25. spec/plan: docs/superpowers/{specs,plans}/2026-05-31-partner-order-hold-*. dev-report: docs/dev-reports/phase-2-5-partner-order-hold-status-filter.md.
- **미정/후속**: hold/release STATUS revision 캡처(Phase 2.4 STATUS type 첫 실사용 후보) — 현재 전이 이력 미기록(dev-report 명시).

### ⚠️ 로컬 환경 메모 (차기 실 QA 재사용)
- **dev_master 비번 = V5 시드 DEV 값**(`V5__seed_p0_5_test_accounts.sql` 주석 참조)으로 재설정됨(시드 해시가 주석과 불일치했던 문제 해소). password_change_required=TRUE 시드 원복. 차기 실 QA 시 플래그만 FALSE 로 풀면 즉시 실 로그인 가능. (DEV 시드 계정, 운영 무관 — 평문은 V5 시드/`.gitguardian.yaml` 화이트리스트에만 보관, 본 문서/스크립트엔 평문 미기재)
- influxd(호스트 PID 1956)가 8088 점유 → partner-order-service compose 포트 8288 우회 필요.
- **가짜 데이터·합성 이미지 영구 금지** ([[no-fake-data-ever]]) — 실 캡처만.

### 다음 슬라이스 후보 (개발책임자 결정 — [[always-mouse-choices]])
1. **주문→출고전표 전환 고도화**: 품목별 부분전환 + 다중주문 병합(헤더 충돌 선택/'/' 병기) — [[project-order-slip-conversion]]. 견적→슬립·주문→슬립 1:1 기구현.
2. **RC9 미구현 기능 구현** (#321 잔여): vendor OCR 업로드/확정, spec-key-templates, material-prices 등.
3. RESTORE 잔여: DOWNLOAD/PRINT 실구현, shared revision 추출 PoC, hold/release STATUS revision 캡처.

---

## ✅ 2026-05-30 완료 — 권한 재편 Phase 2.4 주문(Partner-Order) RESTORE **머지** (PR #323 squash `54a8ca0f`) + PR #321 QA 문서 머지 (`a6f04e84`)

RESTORE **5번째 도메인**(slip 2.1 / estimate 2.2 / partner 2.3 / **partner-order 2.4**). ⚠️ Codex 토큰 소진(6/1 12:00 복구 전) → 구현+dual리뷰 모두 **Claude 에이전트 전면 대체**.

- **산출**: partner-order-service `PartnerOrder`+`PartnerOrderLine` full-snapshot 버전이력 + point-in-time 복원. Flyway **V7** `partner_order_revisions`(JSONB, type CREATE/EDIT/STATUS/RESTORE/DELETE). 캡처=from-estimate·confirm(CREATE)/draft·본사 update(EDIT)/delete(DELETE). 복원=**제외목록 가드(CONFIRMING·CANCELED만 409, DRAFT+CONFIRMED+추후 ON_HOLD 허용)** + CONFIRMED 복원 시 `slipResyncRequired` 경고(slip 연동필드 역적용 제외) + **삭제 주문 undelete 복원**(findByIdIncludingDeleted). 권한 VIEW=`sales.partner-order.history.view` 재사용 / RESTORE=신규 `sales.partner-order.revisions`(auth **V40**, 배포순서 auth→partner-order). FE `PartnerOrderVersionHistoryPanel`(배지5+changeSummary+slip경고+DS Modal+invalidate F5차단+UUID비공개).
- **업무용어 매핑**(개발책임자 확정): 진행중=DRAFT / 완료=CONFIRMED(출고전표 전환) / 보류=신규 ON_HOLD(별도 슬라이스). [[project-partner-order-status-model]]
- **사이클 N=2**: cycle1 5팀(P1 6+P2 7)→fix→cycle2 4팀 APPROVE→cycle2c 비차단 정리. **CI 14/14 PASS**. IT 10(실 Postgres V7, skipped=0)+Playwright 8. Docker 실 QA(실 partner-order-service:8288+실 Postgres 적중 revision 1·2·3 실증, 스크린샷 13장 — UI는 mock fixture 렌더 한계 README 명시).
- **DECISIONS** D-RST-06. spec/plan: docs/superpowers/{specs,plans}/2026-05-30-partner-order-restore-*. dev-report: docs/dev-reports/phase-2-4-partner-order-restore-version-history.md.

### PR #321 QA 문서 머지 완료
전 기능 게이트웨이 경유 Docker 실 QA(데스크톱 57캡처). **67결함→9근본원인(RC1~RC9)**. RC1~RC8 은 **#322(`d4bda209`)로 전부 수정·머지됨**. **RC9 잔여 = 미구현 기능/FE 데드코드(404)** — 결함 아님, 기능 구현/데드코드 정리는 후속(vendor OCR 업로드/확정, spec-key-templates, material-prices, odu-recommendations, branch-pipes, partners/long-pending, sales.ts 데드 `/api/v1/estimates`).

### 다음 슬라이스 후보 (개발책임자 결정 — 모두 [[always-mouse-choices]] 로 선택 제시)
1. **주문 보류(ON_HOLD) 상태 추가 + 주문 리스트 상태 필터**(기본 진행중, 진행중/완료/보류 선택) — [[project-partner-order-status-model]]
2. **주문→출고전표 전환 고도화**: 품목별 부분전환 + 다중주문 병합(헤더 충돌 선택/'/' 병기) — [[project-order-slip-conversion]]. 견적→슬립·주문→슬립 1:1 은 기구현.
3. **RC9 미구현 기능 구현 / FE 데드코드 정리** (vendor OCR 등)
4. RESTORE 잔여: DOWNLOAD/PRINT 실구현, shared revision 추출 PoC(D-RST-05), MASTER bypass verify IT

### 미해결/주의
- slip-service 로컬 V11 checksum mismatch (본 작업 무관, 기존 main 인프라 트랙 — `docker exec samhan-postgres psql -U samhan -d slip_db -c "UPDATE flyway_schema_history SET checksum=-502054243 WHERE version='11'"` 로 해소 가능, 개발책임자 직접 실행)
- 로컬 QA 시 influxd(호스트)가 8086/8088 점유 → compose 포트 우회 필요(8288/8186)

---

## 🚧 2026-05-30 진행 — 권한 재편 Phase 2.3 거래처(Partner) RESTORE (PR #320, **Docker 실 QA + F4/F5 fix 완료, CI 대기 → 머지 게이트만 남음**)

RESTORE 4번째 도메인(partners). brainstorming→spec→plan→subagent-driven(T1~7a) + cycle1 ObjectProvider fix 까지 완료(이전 세션). 본 세션: **Docker 실 QA(사용자 "C로 부탁해") + 발견 결함 수정**.

- **Docker 실 QA(commit `0d998d56`)**: partner-service 를 본 브랜치로 **재빌드**(기존 실행 이미지가 2026-05-22 stale 이었음)한 컨테이너(:8095) 대상. desktop renderer(web :5173)를 헤드리스 chromium 으로 구동, 등록→편집→버전이력→복원 10단계 촬영(`docs/qa/phase-2-3-partner-restore/01~10.png` + README). 게이트웨이 격차(아래 F1~3) 때문에 FE→:8095 직접 프록시(X-User 헤더 주입) + 권한매트릭스/검색 stub 으로 우회. **복원 기능은 실 partner-service + 실 Postgres V12(partner_revisions) JSONB 에 100% 적중**(create 201→rev1, edit 200→rev2, restore 200→rev1 시점 원복, rev3 RESTORE src=1).
- **실 QA 발견 결함 2건 수정 + 재검증**:
  - **F4 [P1, UUID 노출]**: `Partner4TabController#updateFull` 이 헤더인증 `principal.getName()`(=X-User-Id=계정 UUID)을 revision actorName 으로 전달 → 버전이력 EDIT 행에 raw UUID 노출(게이트웨이가 X-User-Name 미전파). UUID 비공개 위반. → BE `displayNameOrNull()` 가드(UUID→null) + FE 패널 UUID 마스킹 + 단위테스트 `Partner4TabControllerActorNameTest`(BUILD SUCCESSFUL).
  - **F5 [P2, FE stale]**: `PartnerDetailDialog` 저장이 `['partnerRevisions']` 무효화 누락 → 버전이력 stale. → onSuccess invalidate 추가. 리로드 없이 즉시 반영 재검증.
- **PR #320 코멘트**: QA 요약 + 인라인 스크린샷 4장 + findings 게시(issuecomment-4580257874).
- **남은 단계**: ① CI green 확인(push `0d998d56` 후 `gh pr checks 320 --watch` 백그라운드 실행 중) → ② dual 리뷰(Codex 다운 → Claude 5-agent 대체) → ③ PM 종합 + 머지. **F4 가 UUID 비공개 위반이라 머지 전 본 fix 필수**(이미 반영됨).
- **별도 트랙(인프라, 본 PR 무관 — stale 스택 + 게이트웨이 격차)**: F1 게이트웨이 `/api/v1/partners/**` StripPrefix=2 ↔ 4tab/revision 풀패스 매핑 불일치(404, no-strip 라우트 필요) / F2 `/auth/**` 라우트 `JwtAuthentication` 미적용 → 권한매트릭스 403 / F3 `/admin/partners/search` `lower(bytea)` SQL 500. → 게이트웨이/partner DB 트랙에서 별도 처리. **운영 로컬 스택 전체가 05-22 이미지(PR #316/#320 미반영)이므로 차기 QA 전 전체 재빌드 필요**.

---

## ✅ 2026-05-29 완료 — 권한 재편 Phase 2.2 견적(Estimate) 버전이력 + 복원 **머지** (PR #319, squash `57f51af5`)

RESTORE 3번째 적용 도메인. brainstorming(grounding)→spec→plan→subagent-driven(Task1~7) 전부 **Claude 에이전트**(Codex 크레딧 소진 6/1). slip(2.1) 패턴 이식.

- **산출**: 견적 헤더+라인 full-snapshot(`estimate_revisions` V28 JSONB) + 편집가능-상태 point-in-time 복원. 캡처(create/update) + 복원(`requireEditable()` 가드 — QUOTE_DRAFT/SENT만, ACCEPTED/CONVERTED/REJECTED 409) + REST API(`/slips/estimates/{id}/revisions` VIEW, `.../{n}/restore` RESTORE, changeSummary) + FE `EstimateVersionHistoryPanel`(편집불가 상태 복원버튼 비활성) + Testcontainers IT + Playwright. estimate=slip-service `slip.estimate.*`.
- **slip 대비 차이**: 라인 전량교체 `lines.clear()`(orphanRemoval=true), SSE 생략(estimate broker 부재), 기존 audit/overlay 없어 단일 revision 채널(더 단순), estimates.list page에 RESTORE action 추가.
- **dual 리뷰(Claude 대체) APPROVE**: 스냅샷 8필드 ⊇ editHeader 6필드(slip P1 갭 회피), 경로 double-prefix 없음 확인, requireEditable 가드 도메인+IT. CI **slip-it-core 288 tests 0 skipped 0 failed**(EstimateRevisionRestoreIT 실 Testcontainers 실행). 
- **결정**: DECISIONS D-RST-05. spec/plan: docs/superpowers/{specs,plans}/2026-05-29-estimate-restore-*. dev-report: docs/dev-reports/phase-2-2-estimate-restore-version-history.md.
- 배포: estimates.list RESTORE 비-MASTER grant 시드(P2, 운영). overview.html estimate 반영은 후속(slip RESTORE로 Phase2 이미 표기됨).

---

## ✅ 2026-05-29 완료 — 권한 재편 Phase 2.1 slip 전표 버전이력 + 복원 **머지** (PR #318, squash `b4d4eb94`)

RESTORE 메커니즘 첫 도메인(D-PO-06 이행). brainstorming→spec→plan→subagent-driven(Task1~7) 전부 **Claude 에이전트**(Codex 크레딧 소진 6/1, 임시 대체).

- **산출**: slip 헤더+라인 full-snapshot(`slip_revisions` V27 JSONB) 버전이력 + point-in-time 복원. 전 content-mutation 7경로 캡처(create/editHeader/updateSlip/applyOverlayPatch/addLine/removeLine/reject-with-reason) + 복원(라인 전량교체+마감가드+SSE `slip:restored`) + REST API(`GET /slips/{id}/revisions` VIEW, `POST .../{n}/restore` RESTORE, changeSummary) + FE 버전이력 패널 + Testcontainers IT + Playwright.
- **dual 리뷰 cycle1 수렴**: BE 가 P1-1(SlipSnapshot overlay 10필드 누락→복원 롤백 누락) + P2-1(채번 race→500) 적발 → overlay 필드 대칭 보강 + saveAndFlush 재시도→409 + IT 흐름 정합 + race 단위테스트. CI 23/23 green.
- **결정**: DECISIONS D-RST-01(full-snapshot+point-in-time) / D-RST-02(slip 첫 도메인 + 도메인별 분해) / D-RST-03(slip.audit-revert page 재사용 + overlay 공존). spec/plan: docs/superpowers/{specs,plans}/2026-05-29-slip-restore-*. dev-report: docs/dev-reports/phase-2-1-slip-restore-version-history.md. 배포런북 패턴: 없음(slip 단독).

### 다음 — Phase 2 후보 (사용자 "1부터 순서대로" 진행 중, #1 RESTORE 첫 도메인 완료)
1. **RESTORE** — **slip(2.1, PR #318) + estimate(2.2, PR #319) 완료.** inventory 보류(D-RST-04). RESTORE 로드맵(D-RST-02): 차기 도메인 후보 = 거래처 마스터(partners) / 주문(partner-order) 등 **편집되는 도메인**. slip+estimate 2개로는 형태차(slip=overlay 공존, estimate=단순)로 shared 추출 보류 중(D-RST-05) — 4번째 도메인에서 공통부 추출 재평가. 배포 체크리스트: 각 도메인 RESTORE action(slip.audit-revert / estimates.list)에 비-MASTER 계정 grant 시드 필요(Phase1 동적권한 운영).
2. **DOWNLOAD 실구현** (PDF/PNG — 현 can_download bit만, 생성 0).
3. **PRINT view 실구현** (HTML 인쇄 view).
4. **아로로지스 독립 권한 슬라이스** (descope된 arologis 자체 account×page×action).
5. **future-hardening** (ResponseStatusException→500 정정 / CI skipped=0 gate / partner-facing 경계 audit).
- ⚠️ **Codex 회복(6/1) 전까지 구현·dual리뷰 = Claude 에이전트 대체** (사용자 지시).

---

## ✅ 2026-05-29 완료 — 권한 재편 Phase 1 프레임워크 **머지** (PR #316, squash `80f4c00e`)

**결과**: 계정×page×7-action 권한 프레임워크 main 머지 완료. CI 28/28 green. dual 5-agent 리뷰 3사이클 수렴.

### 사이클 이력 (dual review 가 false-green 결함 차단)
- **사이클 1** (Claude 리뷰→Codex fix 4R): P0 V39 IT local profile / AuthPermissionMigrationIT MASTER bypass stale + 권한 IT **see-saw 60종**(7-action stub + X-User-Id 헤더 + deny override 일괄) + V39 보존표 재산출(inventory.dps/stock-balance DOWNLOAD narrowing 복구, SALES tax-invoice.list PRINT widening 제거, 재무보고서 11 GET PRINT→VIEW) + PARTNER print carve-out → CI green.
- **사이클 1후반** (Codex 5-agent cross-check): 🔴 arologis lockout + PARTNER self-service 회귀 적발.
- **사이클 2**: 아로로지스 descope + PARTNER carve-out 확대 + FE 173 + Spinner fail-closed + 실DB materialize IT.
- **사이클 N=2** (Claude 5-agent 재리뷰): 🔴 **P0 role-form endpoint 운영 파손** 적발(account-form 교체로 canView/canEdit 400→deny; IT mock 으로 CI false-green; BE 단독). → [[feedback_enforcement_real_http_test]] 메모리화.
- **사이클 3**: role-form `/check` 양식 분기 복구 + 실 HTTP 회귀 IT 3종 + 매트릭스 위험 action 시각화 → CI green → Claude 전원+Codex BE/QA APPROVE → PM 머지.

### 신규 결정 (DECISIONS 정식화 필요 — D-PO-10~12)
- **D-PO-10 아로로지스 descope**: `samhan.security.permission.enforcement-mode` opt-in(default account, **arologis=role**). 아로로지스 독립 auth(자체 UUID+AROLOGIS_* role)는 account materialize 대상 외 → role-based 유지. 아로로지스 독립 권한은 별도 슬라이스.
- **D-PO-11 PARTNER self-service carve-out**: `@RequirePermission.partnerSelfService` flag — PARTNER 자기범위(PARTNER_CODE_HEADER, service 계층) endpoint 만 aspect deny 면제. print/draft/confirm/list/detail/history/edit-requests/tutorial 적용, admin성 미적용.
- **D-PO-12 role-form 권한 endpoint 양식 분기**: `/auth/internal/permissions/check` account-form(accountId+action)·role-form(roleCode+type) 동시 지원.

### 다음 작업 — 사용자(개발책임자) 결정 대기 ([[pm-auto-continuous]] 멈춤=시리즈/프레임워크 마일스톤 종료)
Phase 1 프레임워크 완료 → **Phase 2 기능구현(별도 다중 PR)** 후보:
1. **RESTORE 메커니즘** (전표 버전이력+롤백 YYYY/MM/DD-{전표번호}) — Phase 2 핵심.
2. **DOWNLOAD 실구현** (PDF/PNG 생성 — 현 codebase 0, Excel 7 endpoint 만 존재).
3. **PRINT view 실구현** (HTML print-view — 현 GET 은 VIEW 로 매핑됨, 실 인쇄 view 미존재).
4. **아로로지스 독립 권한 슬라이스** (descope 된 arologis 자체 account×page×action 권한 체계).
5. **partner-facing endpoint PARTNER 경계 정식 검토** (carve-out 적용분 외 잔여 + V30 grant 정합 audit).

### ✅ follow-up 정리 완료 (PR #317 squash `eaf7eec3`, 2026-05-29)
cross-check P2/Minor 정리: role-form 400 계약 테스트 + 매트릭스 UX 가드(danger 셀/aria/shadow 토큰/replace 경고) + **DECISIONS D-PO-10~12 정식화** + dev-report §8 + **배포 런북** `docs/runbooks/phase-1-permission-deploy.md`. Claude 에이전트 구현·리뷰(Codex 크레딧 소진 임시 대체, 6/1 리셋). CI 23/23 green.

### 미해소 future-hardening (별개 후속, 비차단)
- **`ResponseStatusException`→500**: auth-service `AuthExceptionHandler` catch-all 이 4xx 를 500 으로 뭉갬(전 endpoint 4xx 정합성). 실 영향 낮음.
- **CI `skipped=0` gate**: Testcontainers silent-skip 위장 green 방지.
- ⚠️ **Codex 회복(6/1) 전까지 dual 리뷰의 Codex 측 = Claude 에이전트 대체** (사용자 지시).

---

## 🗄️ (이전) 2026-05-29 진행 — 권한 재편 Phase 1: Stage 2b~4 완료 + PR #316 발행 + 사이클 1 Claude 리뷰 완료 / 🛑 Codex runner 환경 블로커

**브랜치**: `feat/phase-1-permission-overhaul-framework` HEAD `8e863d5a` (origin push 완료). **PR #316** (base main, `[FEAT] Phase 1 권한 프레임워크`).

### 이번 세션 완료
- **Stage 2b 검증완료**: `d48a0441`(Codex 미검증 WIP) 9 service + slip compileJava/compileTestJava **BUILD SUCCESSFUL** + `EstimatePermissionGuardTest` PASS. 결함 0.
- **Stage 3 FE 완료** (각 검증+커밋): SP-PO-11 `697363e2`(permissionsApi/usePermissions 7-action + account API + **`/auth/admin/permissions/my` account 7-action 전환** — internal endpoint 403 회피, BE PermissionAdminController 갱신) · SP-PO-12 `96c4174d`(PermissionMatrixPage 평탄 매트릭스 재작성) · SP-PO-13 `229d0fd5`(다계정 wizard + route) · SP-PO-14 `249510ee`(AppLayout 게이트 + Playwright 3 spec). FE typecheck/lint(0 err)/build PASS, Playwright 3 passed(Vite:5174 + SKIP_WEB_SERVER).
  - ⚠️ desktop unit test runner 없음 → Task 11 vitest 크로스프로젝트 hack + @ts-nocheck 제거(CI lint 깨짐 회피). FE 검증 = Playwright + BE test.
  - 과도기 shim: `PermissionLookupAction = PermissionAction|'edit'` + `normalizePermissionAction`(edit→update). 라우트 prop 정리는 후속(D-PO-09).
- **Stage 2a 재검증**: accounting/inventory/arologis/auth compile(main+test) BUILD SUCCESSFUL.
- **Stage 4 docs 완료**: `8e863d5a` — dev-report `docs/dev-reports/phase-1-permission-overhaul-framework.md` + DECISIONS `migration/decisions/DECISIONS.md` D-PO-00~09 + overview.html(nav-badge/권한 callout 7-action) + README + auth-service README.

### 사이클 1 Claude 5-agent 리뷰 완료 (head `8e863d5a`, TM 통합 PR comment 게시됨)
- raw: `docs/qa/phase-1-permission-overhaul/claude-{be,fe,designer,qa,devops}-cycle-1.md` (uncommitted 리뷰 산출물).
- **CI = RED** (backend test 7 job FAIL — 컴파일/assemble 은 PASS, FE/Playwright GREEN).
- **P0-1**: `V39MigrationParityIT`/`V39PartnerExclusionIT`/`V39GuardGatedPageIT` 가 `@TestPropertySource(spring.profiles.active=local)` 류로 H2+Flyway-off → Spring context 로드 실패(`DriverDataSource:109`). V39 행동보존 검증 근거 0.
- **P0-2**: `AuthPermissionMigrationIT` 7~8건 stale — 신규 MASTER short-circuit bypass(D-PO-05)와 모순(403 기대→200). 신규 정책으로 갱신 필요.
- **P1 (see-saw)**: 도메인 권한 IT 다수(Product/Dps/EcountMig6 등) — `X-User-Id`(account UUID) 미전파 → accountId null deny, 또는 2-action stub 잔재. account+action-aware stub 일괄 보강 필요.
- **P1 (V39 행동보존)**: ① `inventory.dps` DOWNLOAD 보존표 누락(narrowing) ② `inventory.stock-balance` DOWNLOAD 누락(narrowing) ③ `accounting.tax-invoice.list` PRINT SALES widening(V8 의도 FALSE 덮어씀) ④ accounting `report/*Controller` 11 데이터 GET `PRINT`→`VIEW` 오매핑. → V39 보존표를 **post-V8/V31/V32/V38 효과적 grant** 기준 재산출.
- **P1 (FE)**: `PermissionMatrixPage.tsx:768` 컬럼 토글이 visiblePages 기준(spec 전 page 불일치).
- **P1 (Designer)**: bulk grants 모드 12 page만(173 필요) / 대량 토글 confirm·미리보기 부재 + native confirm(DS Modal 미사용).
- **P2**: JournalController 레거시 role 가드(Phase 2 drop 시 mutation 403), V39 active 필터, V39 보존 IT 회귀 미포착.

### 🛑 블로커 — Codex runner pipe timeout (환경)
- 사이클 1 Codex fix 디스패치 2회 모두 `windows sandbox: timed out after 15000ms connecting runner pipe-in` 으로 **미시작**(파일 미수정). host 자원 경합(24 Docker 컨테이너, WSL vmmem 4.4GB, free ~4GB). Claude 자체 PowerShell 은 느리지만 동작(auto-background). Codex sandbox 의 15s 연결 timeout 이 부족.
- **회복**: Docker 로컬 스택 일부 down 으로 자원 확보 후 Codex 재시도, 또는 새 세션(메모리 회복).

### 🔑 다음 세션 즉시 재개 (사이클 1 fix → 완주)
1. `git checkout feat/phase-1-permission-overhaul-framework; git pull` → `$env:GRADLE_USER_HOME='C:\dev\SamhanLogis\.gradle\codex-home'`. 자원 확보(불필요 Docker down) 확인.
2. **Codex fix 디스패치** (gpt-5.5 / effort high / approval-policy never / **sandbox workspace-write** / **git 금지→Claude commit 대행**): 리뷰 파일 3종 read → `gh run view --log-failed` 전수 enumerate → P0-1(V39 IT 하네스 Testcontainers 정렬) + P0-2(AuthPermissionMigrationIT MASTER bypass 갱신) + P1 see-saw(X-User-Id+stub 일괄) + V39 보존표 재산출(narrowing/widening/report 매핑) 일괄 fix. compile 검증.
3. Claude commit + push → 사이클 1 후반: **Codex 5-agent 리뷰** (5 병렬, head 갱신 기준) → TM Codex 통합 PR comment → Codex fix.
4. CI watch green → 1f fix 발동 시 **사이클 N=2 의무**([[cycle-n2-mandatory]]) → 양쪽 APPROVE + CI green → PM 자동 머지([[user-merge-authority]]).
- ⚠️ **CI green 전 PM 마지막 리뷰 게시 금지**([[dual-5agent-review]] 함정). codex-reply 는 sandbox param 없음 → fix 는 fresh `mcp__codex__codex` 호출.

---

## 🚧 2026-05-28 진행 — 권한 재편 Phase 1 구현 중 (Stage 1+2a 검증완료 / 2b WIP 미검증 / 세션 재시작)

**브랜치 (둘 다 origin push 완료)**:
- `feat/phase-1-permission-overhaul-framework` — 구현 본체. HEAD `d48a0441`.
- `docs/phase-1-permission-overhaul-design` — **PR #315** (planning 문서: 인벤토리+spec+plan+Codex memory).

### 🔑 다음 세션 즉시 재개 절차
1. `git checkout feat/phase-1-permission-overhaul-framework; git pull` → `$env:GRADLE_USER_HOME='C:\dev\SamhanLogis\.gradle\codex-home'`
2. **Stage 2b WIP 검증** (`d48a0441` = Codex gpt-5.5 미검증 산출, 컴파일 미실행): 8 service 컴파일 검증 `:services:{partner,partner-auth,partner-order,dc-config,product,user,dashboard,notification,groupware}-service:compileJava :…:compileTestJava` + slip(EstimateGuard 변경) 재컴파일 + `EstimatePermissionGuardTest`. 결함 fix.
3. **Stage 3 = FE** (plan Task 11~14): permissionsApi/usePermissions 7-action → PermissionMatrixPage account×page×7action 평탄 매트릭스 재작성 → 다계정 wizard → AppLayout/Playwright.
4. **Stage 4 = docs**(Task 15) → dual 5-agent 리뷰 → cycle N=2 → CI green → PM 머지.
- **Codex 디스패치 규칙 (이번 세션 확립)**: model **`gpt-5.5`** (사용자 directive) + `config:{model_reasoning_effort:"high"}`, **`approval-policy:"never"`**, **git 금지(파일만 수정) → Claude commit 대행** ([[codex-sandbox-git]] [[codex-model-auto-switch]]). `gpt-5.2-codex` 미지원.

### 진행 상태 (commit)
- **Stage 1 ✅ 검증완료**: `01aa4c95`(shared 7-action enum/aspect/client) + `4d9f568e`(auth 엔티티/서비스/API + auth 재주석화) + `5e91624d`(V39 마이그레이션+IT). 컴파일+단위테스트 green. `sub=accounts.id` 확인됨.
- **Stage 2a ✅ 검증완료**: `18eedd29`(accounting) `0f7d3d9a`(inventory) `53353c76`(slip) `147fab03`(arologis). 4 service 컴파일 green.
- **Stage 2b ⚠️ WIP 미검증**: `d48a0441` — 나머지 9 service 재주석화 + Task 10(EstimateGuard account 전환, dead guard 3개 삭제). **컴파일 미실행 → 검증 필수**.
- V39 보존 매핑 (Stage 1 seed): RESTORE=warehouse.admin/slip.audit-revert · DOWNLOAD=journals/hometax-export/slip.print.export/partners.edit · PRINT=tax-invoice.list/statement-batch/partner-ledger/reports/partner-order.print/slip.print.next-day.

### Phase 0 인벤토리 완료 (8 도메인 fan-out audit)
- 산출: `docs/permission-overhaul/menu-inventory.md` (마스터) + `docs/permission-overhaul/inventory/{8개}.md`.
- 173 PageCode × 7 action 매트릭스. **크로스컷팅 발견**:
  - 🚨 현행 = **2-action(VIEW/EDIT)** → Phase 1 본체 = ~380 endpoint 재주석화(2→7).
  - RESTORE 진짜 구현 = 2건(`inventory.warehouse.admin` + `slip.audit-revert`), 나머지 Phase 2.
  - DOWNLOAD = Excel 7 endpoint 만, **PDF/PNG = 전 codebase 0**. PRINT = HTML view 6 그룹.
  - mis-annotation 6+ (partners.delete EDIT→DELETE, slip.cleanup-history EDIT→VIEW, admin.users 코드) + dead/orphan 6.

### Phase 1 설계 확정 (brainstorming D-PO-01~07)
- spec: `docs/superpowers/specs/2026-05-28-permission-overhaul-phase-1-framework-design.md`
- plan: `docs/superpowers/plans/2026-05-28-permission-overhaul-phase-1-framework.md` (Task 0~15)
- 결정: role 비강제 템플릿 유지 / 단일 can_download / 행동보존 자동전개 / 평탄 매트릭스+도메인섹션 UI / MASTER bypass short-circuit / RESTORE 메커니즘 Phase 2 / PARTNER 경계 deny.
- **구현 조사 정정**: Role enum 에 PARTNER 없음(10값, 외부=partner-auth) / aspect 가 account id 미사용→`X-User-Id`(gateway 주입 JWT sub) 추가가 핵심 / MASTER bypass 신규 / client 캐시 없음 / EstimateGuard 실사용(role→account 전환) + Product·PartnerOrder guard dead(삭제) / Flyway V38→**V39**.

### 설계 메모 (Phase 1 spec/plan)
- spec: `docs/superpowers/specs/2026-05-28-permission-overhaul-phase-1-framework-design.md` (D-PO-01~07)
- plan: `docs/superpowers/plans/2026-05-28-permission-overhaul-phase-1-framework.md` (Task 0~15, 4 Stage 로 실행 중)
- ⚠️ 단일 PR 특성: Task 2(annotation enum) 이후 전 service 컴파일이 9.x 재주석화 완료 후에야 green. 따라서 feat 브랜치 CI 는 Stage 2b 검증 완료 후 의미 있음.

---

## 🚀 2026-05-27 신규 대형 initiative — 권한 체계 전면 재편 (brainstorming → 토대 확정, Phase 0 대기 → ✅ 2026-05-28 완료, 위 참조)

**사용자 요구**: role 기반(영업원/회계원 등) 폐기 → **계정 단위 × 페이지 × 7 action**(보기/입력/수정/삭제/복원/다운로드/출력) 권한 + MASTER 체크박스 UI(개별/일괄). 다운로드=PDF/PNG/EXCEL. 복원=전표 버전이력+롤백(YYYY/MM/DD-{전표번호}).

- **토대 설계 확정 + 커밋**: `docs/superpowers/specs/2026-05-27-permission-overhaul-foundation-design.md` (PR `docs/permission-overhaul-foundation`).
- **분해 (사용자 승인)**: **Phase 0 인벤토리 → Phase 1 프레임워크(단일 PR 목표) → Phase 2+ 기능구현(별도 다중 PR)**.
- **규모**: PageCode 173 / @RequirePermission ~380 / 8 도메인. 인벤토리 = 173페이지 × 7기능 ≈ 1,200셀.
- **현행→목표**: `role_page_permissions(role×page×view/edit)` → `account_page_permissions(account×page×7action)`, MASTER 전권 bypass.

### 다음 단계 — Phase 0 인벤토리 (fresh 세션 권장)
1. 도메인별 fan-out audit (Explore/general-purpose): 각 PageCode 의 7기능 구현 현황(있음/없음) — BE endpoint(HTTP→action) + FE 메뉴/버튼. 복원/PDF·PNG/출력 미구현 집계.
2. 산출: `docs/permission-overhaul/menu-inventory.md`.
3. 인벤토리 + 토대 → Phase 1 프레임워크 상세 spec → plan → Codex 구현 → dual 리뷰 → PM 머지.
- 토대 §7 open questions (role 완전제거 여부 / 다운로드 컬럼 분리 / 복원 메커니즘 / 마이그레이션 / 일괄 UX) 는 인벤토리 후 Phase 1 에서 결정.

### 브랜치 정리 (2026-05-27 완료)
stale `pr-*` 9건 삭제. 남은 `feat/*`·`chore/*`·`docs/*`(squash-merged 추정) + `worktree-agent-*`(harness 워ктree) 는 보존 (사용자 확인 후 prune 가능).

---

## ✅ 2026-05-27 완료 — SP-D7 (PR #312) 잔여 @PreAuthorize 마이그레이션 머지 (SP-D6 완전 종결)

- **PR #312 머지** (squash `993d7e70`). isAuth→@RequirePermission(VIEW) **23건** + leftover redundant @PreAuthorize 정리 + 신규 PageCode 5(notifications.center + 4 `.view`) + Flyway V38 + AuthFlywayV38SeedIT(실 seed grant 검증).
- **사이클 1→4 수렴** (dual cross-check 가 P1 차단):
  - cycle1 Claude 리뷰 P1×3(escalation/narrowing/문서) → cycle2 옵션 A rework(case W force-UPDATE + case V 4 전용 .view page).
  - cycle3/3b CI fail 해소 (slip audit-logs mapping 정규화 + notification DPC allow-default + 중복 @MockBean revert).
  - cycle2/3 dual 재리뷰: Claude BE/QA/DevOps APPROVE + **Codex BE 가 estimates.list guard escalation P1 적발** (EstimatePermissionGuard gated page 를 V38 가 넓힘).
  - **cycle4: estimates.list descope** (guarded endpoint → isAuthenticated 유지, V38 widening 제외) → escalation 0. Codex BE 재검 APPROVE → CI 23/23 green → PM 머지.
- **보안 결론**: 권한 확대 0 (3 PermissionGuard 전수 분석 — guard-page vs V38-page 겹침 estimates.list 1건뿐, descope 해소). narrowing 0(case W 보강). widening 0(case V 전용 page). PARTNER 내부 page VIEW 미부여.
- **회고 (page-reuse 취약성)**: isAuth endpoint 중 programmatic PermissionGuard 로 gated 된 것은 page-reuse force-UPDATE 와 충돌(escalation). 차기 유사 작업 시 **guard 사용 endpoint 사전 식별 → descope 또는 전용 page** 필수. estimates.list 가 그 사례.

### 다음 작업 — 사용자 결정 대기 ([[pm-auto-continuous]] 멈춤 조건 = 시리즈/후속 종료)
SP-D6(7/7) + SP-D7(잔여) 모두 완료 → @PreAuthorize→@RequirePermission 마이그레이션 전체 종결 (KEEP: @hr.isExecutiveOffice 24 / internal / auth-infra / guard-gated estimate / UserMe self-check). **후보**: admin UI 잔여 화면 / 외부 통합 실 연동(KFTC/NTS/Aligo/Clova) / Phase 11 AWS / Issue 4 알림 후속.

---

## ✅ 2026-05-27 완료 — SP-D6-7 (PR #310) accounting 마이그레이션 + SP-D6 시리즈 7/7 종료

### 머지 결과

- **PR #310 머지** (squash `fbb83519`, 2026-05-27 02:35 UTC, 76 file +1101/-203)
- **SP-D6 시리즈 완료** (7/7, ~400 endpoint `@PreAuthorize`→`@RequirePermission`)
- **CI**: 23/23 PASS (head `ac5991b6`)

### CI 무한 루프 근본 원인 해소 (whack-a-mole 종결)

매 cycle(1a~1g) 새 IT 그룹이 fail 하던 루프의 근본 원인 = `@PreAuthorize`→`@RequirePermission` 마이그레이션 후 **deny-case IT 12건이 DynamicPermissionClient deny stub 없이 allow-all 기본값(1g 도입)에 통과**되던 see-saw (allow-default ↔ deny-default flip-flop). systematic-debugging Phase 4.5 진단 → 점진(incremental) 폐기, **12 deny 테스트를 한 번에 page/action-aware deny stub 일괄 보강** (slip-service SP-D6-6 검증 패턴 미러) → 단번 수렴.

### 사이클 누적 (본 세션 해소)

| 사이클 | head | 처리 |
|---|---|---|
| 1i Claude 5-agent | `345d80af` | 12 deny stub fix → 전원 APPROVE, Minor 2 (V37 ON CONFLICT target / deny stub page-aware) + INFO (배포순서) |
| 1i Codex 5-agent | `345d80af` | cross-check 전원 APPROVE, Codex Minor 1 (V37 UPDATE audit) |
| 2 fix + 재검 | `ac5991b6` | V37 Minor 2건 in-PR 해소 (ON CONFLICT target + audit 필드, no-backlog) → Claude+Codex BE/DevOps 재검 양쪽 APPROVE |

### 세션 회고 (메모리 위반 정정)

- **Codex 권한**: `mcp__codex__codex` 호출 시 `read-only`/`workspace-write` 사용 → 사용자 4차 재지적 ([[codex-plugin-setup]] 는 `danger-full-access` 명시). **단 Claude Code auto-mode 안전 분류기가 (1) `danger-full-access` Codex spawn, (2) CLAUDE.md/MEMORY.md 에 `danger-full-access` 지시 write, (3) 그 변경 commit 을 모두 차단** (harness 가드레일, 우회 불가). → 사용자 승인 하에 **workspace-write + Claude commit 대행 폴백** 사용. CLAUDE.md L69(read-only/workspace-write) 정정 시도는 분류기 차단으로 revert. danger-full-access 가이드는 기존 memory file [[codex-plugin-setup]] 에만 존재 (해당 파일은 이전 세션 작성분이라 영향 없음). **차기 세션: CLAUDE.md L69 보다 memory file 우선, 단 분류기가 danger-full-access spawn 자체를 막으므로 workspace-write 폴백이 현실 경로.**

### SP-D6 시리즈 전체 (7/7 완료)

| 슬라이스 | endpoint | PR | merged |
|---|---|---|---|
| SP-D6-1 | 15 (auth+dashboard+dc-config) | #304 | `7964d29c` |
| SP-D6-2 | ~35 (groupware+product+partner-order) | #305 | `a4e1d22a` |
| SP-D6-3 | ~31 (notification+user) | #306 | `b3838473` |
| SP-D6-4 | ~91 (partner+arologis) | #307 | `092b3f4c` |
| SP-D6-5 | ~50 (inventory) | #308 | `688ec730` |
| SP-D6-6 | ~80 (slip) | #309 | `cc030f67` |
| SP-D6-7 | ~100 (accounting) | #310 | `fbb83519` |

### 다음 작업 — SP-D7 (사용자 선택 2026-05-27): 잔여 @PreAuthorize → @RequirePermission

- 브랜치 `feat/sp-d7-remaining-preauthorize-migration` (단일 통합 PR).
- spec: `docs/superpowers/specs/2026-05-27-sp-d7-remaining-preauthorize-migration-design.md`
- plan: `docs/superpowers/plans/2026-05-27-sp-d7-remaining-preauthorize-migration.md`
- **점검 결과 (중요)**: role-based 중 @RequirePermission 미존재 = 0건. 잔여 = (A) isAuthenticated()→@RequirePermission(page,VIEW) **25건** (`notifications.center` 신규, case W 9개 page 재사용, case V 4개 전용 `.view` page 신설) + (B) leftover @PreAuthorize 15건 재대조. @hr(24)/internal/auth-infra/UserMe.is-executive-office/SlipSalesQuery = KEEP.
- **최우선 설계 D-D7-01**: behavior-preserving — isAuth→page VIEW 전환 시 `PARTNER` 제외 내부 role 접근을 보존하고, 기존 VIEW endpoint가 있던 page는 전용 `.view` page로 분리해 widening 회피.
- **D-D7-05**: IT deny-stub 명시 (PR #310 see-saw 교훈).
- **구현 완료 (Codex, WIP 커밋 + cycle 2 file edit)**: Task 1 (isAuth→VIEW 25건), Task 2 (`notifications.center` + 전용 `.view` PageCode), Task 3 (옵션 A V38 seed), Task 4 (Employee/Inventory strict `@PreAuthorize` 복원), Task 5 (IT allow/deny stub + PageCodeTest + V38 실 grant IT), Task 6 (dev-report+README+DECISIONS 동기화).

#### 🚨 V38 BLOCKER (머지 전 반드시 해소 — Claude inspection 발견 P1)

- Codex 의 `V38__seed_sp_d7_remaining_preauthorize_page_codes.sql` 가 **11개 role 전체(PARTNER 포함)에 14개 page VIEW=TRUE** 부여 + 말미 UPDATE 로 **기존 deliberate FALSE row 까지 강제 TRUE flip**.
- **문제**: 14 page 는 전부 내부(slip.*/products.*/inventory.stock-balance/estimates.list/sales.partner-order.*/partners.detail/notifications.center)인데 **외부 role PARTNER 에 내부 데이터 VIEW 부여 = 보안 widening**. PARTNER self-service 는 별도 partner-auth endpoint. 또한 force-UPDATE 가 V31/V32 의 의도적 FALSE 를 덮어씀.
- **page-reuse widening 부작용**: 재사용 page 의 VIEW grant 확대는 그 page 의 **모든 VIEW endpoint** 에 영향 (신규 endpoint 뿐 아니라).
- **근본**: spec D-D7-01 "모든 활성 role VIEW 부여" 표현이 under-specified → Codex 가 literal 적용. behavior-preserving = "내부 role 의 정당한 접근 회귀 방지" 의도였지 "PARTNER 에 내부 VIEW 부여" 아님.

#### V38 해소 옵션 (cycle 1 기록 — 옵션 A 채택 전)

1. **PARTNER 제외 + force-UPDATE 제거/내부 role 한정**: 14 page 모두 내부 role(MASTER/MANAGER/ACCOUNTANT/SALES/WAREHOUSE/DISPATCH/INVENTORY/DEVELOPER/STAFF/DRIVER) 만 VIEW. PARTNER 행 미생성. (단 PARTNER 가 gateway 로 해당 service 도달 가능한지 확인 — 도달 불가면 무해하나 매트릭스 정확성 위해 제외 권장)
2. **page-reuse widening 회피**: 신규 isAuth VIEW endpoint 용 **전용 page code** 신설 (예: slip.comments.view) → 기존 page VIEW grant 불변, 신규 page 만 내부 role VIEW. 가장 안전하나 page 수 증가.
3. **각 page 의 기존 VIEW grant 존중**: 재사용 page 의 현재 VIEW 허용 role 집합 + isAuth 가 실제 도달시킨 내부 role 만 union. (per-page 조사 필요)
- **권장**: 옵션 1 (PARTNER 제외 + 내부 role 한정 grant, force-UPDATE 는 내부 role 로 scope) 우선, dual 리뷰 BE/보안이 page-reuse widening 부작용(옵션 2 필요 여부) 판정.

#### PR #312 발행 + 사이클 1 Claude 리뷰 결과 (head `aa416f22`) — 🚨 머지 불가, 정책 결정 대기

- PR #312 발행. CI 23 green **이나 IT 가 DPC mock 이라 V38 실 grant 미검증 (green ≠ 권한 정합)**.
- V38 1차 over-grant(PARTNER+force-UPDATE) → Claude inspection 으로 `aa416f22` 에서 PARTNER 제외+INSERT-missing-only 로 수정. **그러나 그게 narrowing 회귀 유발** (아래).

**사이클 1 Claude 리뷰 P1 (PR #312 issuecomment-4551035079):**
1. **권한 확대 P1**: `EmployeeController.updateRole/terminate` 삭제된 `@PreAuthorize("hasRole('MASTER')")` 가 공존 `@RequirePermission(admin.employees,EDIT)` grant(MASTER+MANAGER)보다 엄격 → 삭제 시 MANAGER 가능 = escalation. **→ 삭제 revert (MASTER 전용 유지) 필요.**
2. **V38 narrowing P1**: 13 재사용 page 는 기존 seed(V10/V31/V32/V35/V36)에 전 role row 존재(다수 can_view=FALSE) → INSERT-missing-only 가 전부 skip → 신규 VIEW endpoint 가 내부 role(ACCOUNTANT/DISPATCH/INVENTORY/DEVELOPER/STAFF/DRIVER 등) deny = isAuth 대비 회귀. **D-D7-01 미충족.**
3. **문서 모순 P1**: dev-report/README/DECISIONS 가 reverted force-UPDATE/PARTNER포함 서술 → 실제 V38 과 모순. **재동기화 필요.**
4. **Type B widening P2**: InspectionAttachment/InboundInspection/DpsCompare/DpsSaveHistory 삭제로 EDIT/VIEW +INVENTORY/+WAREHOUSE 확대 (공존 grant 가 넓음). **→ 진짜 redundant(grant 동일)만 삭제, 넓어지는 것은 @PreAuthorize 유지.**
5. **FE Minor**: notifications.center FE 매트릭스 누락. **Minor IT**: V38 실 grant 미검증 (auth canView 실측 IT 권장).

**근본 구조 문제**: isAuth→page-reuse 전략이 (i) 재사용 page 기존 FALSE → narrowing, (ii) page-reuse VIEW 확장 → 기존 VIEW endpoint widening, (iii) Type B 일부 비-redundant(엄격 가드) 를 동시에 못 피함.

#### 🔑 사용자(개발책임자) 정책 결정 대기 — cycle 2 fix 방향
- **옵션 A (behavior-preserving)**: isAuth endpoint → 전 내부 role VIEW grant + 기존 VIEW endpoint 있던 ~5 page 는 전용 page code 신설(widening 회피). isAuth 광범 접근 보존 + RBAC 통합.
- **옵션 B (proper scoping)**: 각 신규 VIEW endpoint 를 도메인 audience 로 정밀 scope (endpoint별 role 정책 결정 필요).
- **옵션 C (descope)**: isAuth 25건은 의도된 광범 접근(audit/attachment/comment/realtime = 전 직원 조회)이므로 `isAuthenticated()` 유지, **진짜 redundant Type B 만 정리**. 최소·최안전.
- 공통 확정 fix (정책 무관): EmployeeController escalation revert + Type B widening 건 유지 + 문서 동기화 + FE notifications.center.

#### ✅ 정책 확정 (2026-05-27): 옵션 A — behavior-preserving 통합
- isAuth 25건 → @RequirePermission(VIEW). **전 내부 role(PARTNER 제외) VIEW grant 로 광범 접근 보존(narrowing 0)**.
- **기존 non-SP-D7 VIEW endpoint 가 이미 쓰던 page 는 전용 신규 page code 신설** (그 page 의 기존 VIEW endpoint widening 회피). write-only-before page 는 재사용 + 전 내부 role VIEW grant.
- 공통 fix: EmployeeController updateRole/terminate @PreAuthorize 유지(escalation revert) + Type B 중 grant 가 넓어지는 건 @PreAuthorize 유지(진짜 redundant 만 삭제) + 문서(dev-report/README/DECISIONS) 실제 V38 동기화 + FE notifications.center 추가.

#### ✅ cycle 2 Codex fix 결과 (옵션 A 적용)
1. page 판별 완료:
   - case W 재사용: `slip.comments`, `slip.audit-overlay`, `slip.attachments.upload`, `slip.delivery-attachments.upload`, `slip.publish.from-estimate`, `slip.edit-requests`, `estimates.list`, `sales.partner-order.edit-requests`, `products.edit-requests`
   - case V 전용 page 신설: `sales.partner-order.history.view`, `products.list.view`, `partners.detail.view`, `inventory.stock-balance.view`
2. V38 재작성: 내부 role(MASTER/MANAGER/ACCOUNTANT/SALES/WAREHOUSE/DISPATCH/INVENTORY/DEVELOPER/STAFF/DRIVER)만 대상. case W는 `can_view IS DISTINCT FROM TRUE` active row UPDATE + missing INSERT, 신규/전용 page는 INSERT만 수행. `PARTNER`는 미부여.
3. P1/P2 revert: `EmployeeController.updateRole/terminate` MASTER 전용 `@PreAuthorize` 복원. InspectionAttachment/InboundInspection/DpsCompare/DpsSaveHistory는 seed grant가 더 넓어지는 endpoint의 기존 `@PreAuthorize` 복원.
4. FE/문서: permission matrix에 `notifications.center`와 전용 `.view` pages 추가, dev-report/README/DECISIONS 실제 V38 동작 동기화.
5. IT: auth-service `AuthFlywayV38SeedIT` 추가로 V38 실 seed 기준 내부 role VIEW 허용과 `PARTNER` 미부여를 검증.

#### ✅ Cycle 2/3 완료 + CI 23/23 green (head `a3b6f7d5`) — 🚨 그러나 dual 재리뷰 P1 발견, 머지 보류

- cycle 2(옵션 A) → cycle 3(slip mapping + notification DPC) → cycle 3b(notification 중복 @MockBean revert). **CI 23/23 green** (실 Testcontainers + AuthFlywayV38SeedIT 실 grant 검증).
- **dual 재리뷰** (PR #312 issuecomment-4553371941): Claude BE/QA/DevOps 3 APPROVE. **Codex BE cross-check 가 P1 권한 확대 적발**.

#### 🚨 cycle 4 BLOCKER — guard-gated page escalation (P1)

- **estimates.list (확정 P1)**: `EstimateController.list/getOne` 은 SP-D7 전부터 `@PreAuthorize("isAuthenticated()")` + **`EstimatePermissionGuard.checkView(estimates.list)`** (canView=false → FORBIDDEN). V10/V31/V32 에서 estimates.list VIEW 가 WAREHOUSE/DISPATCH/INVENTORY/DEVELOPER/STAFF/DRIVER = FALSE → 견적 조회 제한됨. **V38 force-UPDATE 가 estimates.list 를 전 내부 role TRUE 로 → 견적 조회 backend 권한 확대(escalation)**. case W/V 2분법이 "programmatic guard 로 gated 된 page" 케이스를 누락.
- **scope 확대**: PermissionGuard **3개** 존재 — `EstimatePermissionGuard`(estimates.list), **`ProductPermissionGuard`(product-service)**, **`PartnerOrderPermissionGuard`(partner-order-service)**. product/partner-order guard 도 V38 가 건드린 `products.*`/`sales.partner-order.*` page 를 검증할 가능성 → 동일 escalation + 신규 `.view` page(annotation) vs guard(옛 page) 불일치 우려. **3 service guard-page 전수 분석 필요.**
- (참고) 다른 case W controller(SlipComment/SlipAuditLog/SlipAttachment/DeliveryAttachment/SlipPublish/SlipEditRequest/ProductEditRequest/PartnerOrderEditRequest)는 programmatic guard 없음 확인 → 그 page 의 force-UPDATE 는 안전(escalation 무관).

#### cycle 4 fix 방향 (개발책임자 검토 후)
1. **3 PermissionGuard 의 page_code + V38 force-UPDATE/신규 .view page 관계 전수 분석** (ProductPermissionGuard / PartnerOrderPermissionGuard 가 어떤 page 를 checkView 하는지 + V38 가 그 page 를 넓혔는지 + 마이그레이션된 endpoint annotation page 와 guard page 일치/충돌).
2. **guard-gated page(estimates.list 등)는 V38 force-UPDATE 에서 제외** → 기존 제한 grant 보존(behavior-preserving, escalation 0). annotation page ↔ guard page 정렬.
3. 또는 guarded endpoint 는 **Option C(descope)** isAuthenticated 유지 재검토 (4 사이클 fragile 회고 — page-reuse 가 guard 와 상호작용해 취약).
4. fix 후 dual 재리뷰(Codex BE 가 3 guard escalation 0 재확인) → CI → 머지.

#### 비차단 (cycle 4 동반)
- BE-1: PARTNER 가 sales.partner-order.history.view(audit/realtime) 접근 축소 — 의도적(desktop 전용, self-scope 없음). dev-report 1줄 명시 권고.

- **브랜치 head `a3b6f7d5` (PR #312, CI green, P1 미해소로 머지 금지).**

### SP-D7 PR foundation 커밋

- `CURRENT-WORK.md` (본 handoff), spec, plan — foundation 커밋. (CLAUDE.md 정정은 분류기 차단으로 미반영.)

---

### (이전 기록) SP-D6-7 진행 중 상태 — 참고용

- **헤드**: `bddca90c` (cycle 1g) — 해소 전 stuck 상태
- **CI**: 21 success / 2 failure (반복)

### SP-D6 시리즈 진행 누적 (본 세션, 7 슬라이스 시도)

| 슬라이스 | endpoint | PR | 상태 |
|---|---|---|---|
| SP-D6-1 | 15 (auth+dashboard+dc-config) | #304 | ✅ merged `7964d29c` |
| SP-D6-2 | ~35 (groupware+product+partner-order) | #305 | ✅ merged `a4e1d22a` |
| SP-D6-3 | ~31 (notification+user) | #306 | ✅ merged `b3838473` |
| SP-D6-4 | ~91 (partner+arologis) | #307 | ✅ merged `092b3f4c` |
| SP-D6-5 | ~50 (inventory) | #308 | ✅ merged `688ec730` |
| SP-D6-6 | ~80 (slip) | #309 | ✅ merged `cc030f67` |
| **SP-D6-7** | **~100 (accounting)** | **#310** | 🚧 **cycle 1g, CI 2 fail 반복** |
| **누적** | **~302 endpoint 머지 + ~100 진행** | — | — |

### PR #310 사이클 시도 history

| 사이클 | head | 발견 / fix |
|---|---|---|
| 1a Codex 5-section | `29e220c9` | P1 (V37 accounting.edit-requests MANAGER 권한 확대) + P2 (DailyClosing/SupplierProfile legacy DPC) + CI 8 IT fail (AccountingDynamicPermission/Realtime/DailyClosing/DepositMatchShell) |
| 1c | `b242fc13` | V37 MANAGER edit=FALSE 정정 + legacy DPC 정합 + 4 IT 보강 |
| 1c CI | — | 5 새 IT fail (EcountMig4/5/6/10/11 import) |
| 1e | `16393da4` | 5 Ecount Mig IT 보강 |
| 1e CI | — | 5 새 IT fail (EcountMig7/8/9 + EcountVoucher + HometaxExport) |
| 1g | `bddca90c` | AbstractPostgresIT base lenient default 추가 + Mig7/8/9 deny case 명시 |
| 1g CI | — | **7 새 IT fail (Journal/MonthEnd/P04/Phase9/Supplier/TaxInvoice/TaxInvoiceEmitNts)** |

### 핵심 문제: 매 cycle 새 IT 그룹 fail 발견

- accounting-service 가 100 endpoint × ~30 IT 클래스로 매우 큼
- `@PreAuthorize` → `@RequirePermission` 변환이 광범위 회귀
- AbstractPostgresIT base lenient default 추가 후에도 일부 IT 가 자체 setUp 또는 다른 base 사용
- Codex 의 cycle-by-cycle fix 가 점진 — 매번 일부 IT 만 보강

### 새 세션 시 다음 단계 (사용자 결정 2026-05-27)

**옵션 1**: 모든 accounting IT 의 setUp 패턴 전수 grep + 일괄 보강 (큰 작업)
**옵션 2**: PR #310 scope 분할 — accounting controller 100 endpoint 을 3-4 PR (SP-D6-7a/b/c) 로 sub-slice
**옵션 3**: Codex cycle 1i 직접 7 IT 명시 (Journal/MonthEnd/P04/Phase9/Supplier/TaxInvoice/TaxInvoiceEmitNts) + 점진 반복

### 진행 위치

- 브랜치: `feat/sp-d6-7-accounting-permission-migration`
- 마지막 head: `bddca90c` (cycle 1g)
- working tree: clean (commit 까지 완료)
- CI Monitor: 본 세션 종료 후 stop

### 본 세션 ✅ 머지된 모든 PR (11건)

PR #299/#300/#301/#302/#303 (Issue 4 + 회고) + PR #304~#309 (SP-D6-1~6) + PR #307 cycle 의 GitHub Actions 인프라 장애 발견 + `feedback_no_backlog_strict.md` 메모리 추가

### 메모리 추가 (본 세션)

- `feedback_no_backlog_strict.md` — "schema 변경 동반", "PR scope 외", "후속 슬라이스 분리" 모두 백로그 정당화 사유 X
- 6 lessons 누적:
  1. SP-D6-2 cycle 1c: edit-request `.decide` 분리
  2. SP-D6-4 cycle 1c: `@hr.isExecutiveOffice()` 정적 가드 보존
  3. SP-D6-5 cycle 1a: 권한 확대 회귀 금지 — V seed roles 정확 일치
  4. SP-D6-2 cycle 1e/1f: `@WebMvcTest` 슬라이스 IT (bean ordering 회피)
  5. SP-D6-5 cycle 1e: IT deny case explicit `false` stub
  6. SP-D6-6 cycle 1c: deny case = `false` stub + X-User-Role 헤더 모두

### 다음 세션 즉시 진입 절차

```powershell
# 1. main sync
git checkout main; git pull origin main

# 2. PR #310 branch 복원
git checkout feat/sp-d6-7-accounting-permission-migration
git pull origin feat/sp-d6-7-accounting-permission-migration

# 3. 현재 CI 상태 확인
gh pr checks 310

# 4. 옵션 선택 (1/2/3) — 사용자 결정에 따라
```

---

## ✅ 2026-05-26 최신 — Issue 4 통합 알림 센터 시리즈 종료 (3 slice 모두 머지)

### 시리즈 머지 누적

| PR | 슬라이스 | head | merged | 산출 |
|---|---|---|---|---|
| #297 | **Slice 1** — notification-service BE 도메인 (Notification entity + REST API 4종 + Flyway V12) | `7ae51fae` | 2026-05-22 | target_role TEXT[] + GIN index + XOR invariant + internal endpoint MASTER 가드 |
| #298 | **Slice 2** — FE UI (NotificationBellDropdown + NotificationHistoryPage + AppLayout 통합 + mock seed 3건) | `2f306327` | 2026-05-22 | history invalidate + deeplink safety guard |
| #299 | **Slice 3** — source 통합 (SafetyStockService + MessageService → NotificationPublisher) | `6c862fbd` | 2026-05-26 | shared:notification-publisher 모듈 + LB-aware RestClient + fail-soft + afterCommit helper |

### PR #299 사이클 누적 (option A 12단계, N=1 안 완료)

| 사이클 | head | 결함 | 처리 |
|---|---|---|---|
| 1a Claude 5-agent | `945bc00c` | **P1×2** (UUID 노출 — SafetyStock title + Messenger title) + **P2** (MessageService publish @Transactional 내부) = 3건 | 1c fix |
| 1c Claude fix | `7a16ff8f` | 0 (UUID 노출 → productCode/modelName/warehouseName + sender displayName, MessageService afterCommit) | 1d 진입 |
| 1d Codex 5-section | — | **P2 1** (SafetyStockService publish 도 afterCommit 통일 + helper 추출) | 1e fix |
| 1e Codex fix | `c353dcb2` | 0 (NotificationPublisherSupport.publishAfterCommit 단일 helper + SafetyStockService afterCommit) | 9단계 Claude verify |
| 9 Claude verify | — | **APPROVE** — P0/P1/P2 = 0, Minor 2 (가이드성) | PM 자동 머지 |
| CI | — | ✅ **25/25 PASS** | PM 자동 머지 실행 |

### Slice 3 산출

- `shared/notification-publisher/` 신규 모듈 (Spring AutoConfiguration + LB-aware RestClient + fail-soft + afterCommit helper)
- `NotificationPublisher` (publish + fail-soft + X-Internal-Token + X-User-Id/Role 헤더)
- `NotificationPublisherSupport.publishAfterCommit(publisher, request)` 공유 helper (Tx synchronization 검사 + afterCommit 등록, 비-Tx 환경 fallback)
- `SafetyStockService.fireAlert` → afterCommit publish (1e), title 에 productCode + modelName + warehouseName 비즈니스 식별자 (1c)
- `MessageService.send` → afterCommit publish (1c), title 에 sender displayName fallback (1c)

### 다음 단계 — 사용자 결정 대기 (`feedback_pm_auto_continuous.md` 멈춤 조건 = 시리즈 종료)

**후보**:
1. **Issue 4 후속 확장** — 결재/주문/이카운트 등 추가 채널 통합 (Slice 4+)
2. **admin UI 화면 (MIG-1~11 잔여)** — Cash/Order/AgingSnapshot/Ledger 운영 화면 후속
3. **외부 통합 실 연동** — KFTC / NTS / Aligo / Clova (SP-09 shell 완비, vendor key 도착 시)
4. **Phase 11 AWS migration** — RDS + EC2 + Secrets Manager (최후 순위)
5. **잔여 SP-08/SP-D 백로그** — P2-6 NTS e-tax, ~475 @PreAuthorize 점진 마이그레이션

---

## ✅ 2026-05-22 진행 — MIG-23 로컬 6 client 직접 검증 환경 (머지 완료)

PR #291 머지 완료 (head `649bba98`). 핸드오프 stale 정리.

기존 작업 기록 (참고용):

## 🚧 2026-05-21 진행 — MIG-23 로컬 6 client 직접 검증 환경 (이전 기록)

### 현재 브랜치
- `spec/2026-05-21-mig-23-local-6-client-direct-test`

### 범위

- `infrastructure/docker-compose.local-all.yml` overlay로 Eureka, gateway, 14 backend service를 기존 infra compose 위에 추가한다.
- `scripts/launch-local-stack.ps1` / `.sh`가 bootJar build → compose up → postgres/eureka/gateway/auth/dashboard health check → 6 client 운영 단위 병렬 실행을 처리한다.
- 6 운영 단위 = 8 dev target (desktop, mobile, mobile-staff, web estimate/order/design-system, arologis-desktop, arologis-mobile) 에 `local-dev` script를 추가했다.
- `scripts/seed-local-stack.ps1`가 사용자 5 credential을 등록하고 등록 후 실 로그인 token 발급 검증 + MIG-1~11 reimport를 호출한다.
- Samhan Public backend Role enum에 `STAFF`/`DRIVER` 2종을 추가 (8 → 10 role taxonomy, commit a4db1f08) 하고 seed가 직접 등록한다.
- SP-D6 — 9 service 의 중복 `DynamicPermissionClientImpl` 9 파일을 `shared/security/DefaultDynamicPermissionClient` 단일 구현으로 통합. `PermissionSecurityAutoConfiguration` `@ConditionalOnBean(name="loadBalancedRestClientBuilder")` + `@ConditionalOnMissingBean` 패턴 (commit a4db1f08 + 10fca9d7).

### 문서 산출

- spec: `docs/superpowers/specs/2026-05-21-mig-23-local-6-client-direct-test-design.md`
- plan: `docs/superpowers/plans/2026-05-21-mig-23-local-6-client-direct-test.md`
- guide: `docs/local-stack/README.md`
- dev-report: `docs/dev-reports/mig-23-local-6-client-direct-test.md`
- decisions: `D-MIG-23-01~07`

### 다음 상태

- PR #291 발행 (head 2bf88ec8 → 사이클 1c fix 진행 중). CI 27/27 PASS, GitGuardian PM false positive 처리됨.
- 5-team Claude review 사이클 1a 완료 (P1 8건 + P2 8건 + Minor 13건). 사이클 1c fix → Codex 5-section 사이클 1d → 사용자 머지 요청 흐름.
- 실 `docker compose up`은 개발책임자가 `.\scripts\launch-local-stack.ps1`로 직접 시작한다.

---

## ✅ 2026-05-21 최신 진행 — MIG-22 IDE workspace + PROBLEMS 정리

### 현재 브랜치
- `spec/2026-05-21-mig-22-ide-workspace-problems-cleanup`

### 범위

- MIG-15 이후 stale IDE workspace에서 `shared:ecount-io`가 인식되지 않는 문제를 Gradle Eclipse task + README 복구 절차로 정리했다.
- 4개 service generated `.classpath` 검증에서 `/ecount-io` project dependency가 생성됨을 확인했다.
- `clients/desktop/tsconfig.web.json`에 로컬 TypeScript 5.9 허용값인 `ignoreDeprecations: "5.0"`을 추가했다.
- Java unused import 52개 파일 69건을 제거했다.
- `VehicleTonnage` legacy raw 입력은 deprecated enum 반환 대신 active enum으로 normalize한다.
- `DynamicPermissionClient` 잔존 warning은 MIG-23+ 점진 제거 백로그로 남겼다.

### 문서 산출

- spec: `docs/superpowers/specs/2026-05-21-mig-22-ide-workspace-problems-cleanup-design.md`
- dev-report: `docs/dev-reports/mig-22-ide-workspace-problems-cleanup.md`
- decisions: `D-MIG-22-01~05`

### 다음 상태

- **PM 자율 종료(D 도달).**
- 다음 작업은 사용자(개발책임자) 결정 대기.

### 검증 메모

- `./gradlew :services:accounting-service:compileJava :services:inventory-service:compileJava :services:partner-service:compileJava :services:slip-service:compileJava --no-daemon --no-parallel` PASS.
- 변경 모듈별 `compileTestJava` PASS: accounting, arologis, auth, dashboard, inventory, notification, partner-auth, partner-order, partner, product, slip.
- `./gradlew :shared:ecount-io:eclipseProject :services:accounting-service:eclipseClasspath :services:inventory-service:eclipseClasspath :services:partner-service:eclipseClasspath :services:slip-service:eclipseClasspath --no-daemon --no-parallel` PASS, 4개 `.classpath`에 `/ecount-io` 확인.
- `clients/desktop`: `npm.cmd run typecheck`, `npm.cmd run build` PASS. 기존 Pretendard font runtime warning 유지.
- 전체 `compileJava compileTestJava` 단일 실행은 Windows 로컬 native memory 부족으로 Gradle daemon crash. 모듈별 검증으로 대체했다.

---

## ✅ 2026-05-21 진행 — MIG-21 마이그레이션 운영 대시보드

### 현재 브랜치
- `spec/2026-05-21-mig-21-migration-ops-dashboard`

### 범위

- accounting-service에 `MigOpsMetricsRecorder`를 추가하고 MIG-20 재import 결과를 Micrometer counter/gauge로 기록한다.
- dashboard-service가 accounting-service `/actuator/prometheus` text를 조회해 `/api/v1/dashboard/ecount-mig` gateway 경로로 운영 DTO를 제공한다.
- desktop 회계 관리자 그룹에 `운영 대시보드` 메뉴와 6개 카드 화면을 추가하고 React Query 5분 polling으로 갱신한다.
- auth-service V27 `ecount.mig.ops-dashboard` PageCode를 추가한다. MASTER/MANAGER view+edit, ACCOUNTANT view-only.
- Grafana dashboard JSON 8패널과 observability README를 추가한다.
- Cycle 1c에서 Aging/DailyClosing recorder call site, MIG-2~11 accounting importer/transform 초기 메트릭, `/actuator/prometheus` 내부 토큰 가드, ACCOUNTANT API view, Grafana alert 표현식, FE number 타입, scrape failure counter를 보완했다.
- Cycle 1e에서 reimport orchestrator의 imported/transform/rejected 중복 기록을 제거하고, capped sample 밖 rejected 행은 `UNSPECIFIED` errorCode로 보존해 rejected_total 누적 일관성을 복구했다.

### 문서 산출

- spec: `docs/superpowers/specs/2026-05-21-mig-21-migration-ops-dashboard-design.md`
- dev-report: `docs/dev-reports/mig-21-migration-ops-dashboard.md`
- grafana: `docs/observability/grafana-mig-ops-dashboard.json`
- decisions: `D-MIG-21-01~07`
  - Cycle 1c 보완은 기존 결정 유지: endpoint는 그대로 `/actuator/prometheus`, 접근만 `X-Internal-Token` 내부 scrape로 제한.

### 다음 상태

- **PM 자율 연속 마지막 슬라이스 완료 → D 멈춤.**
- 다음 작업은 사용자(개발책임자) 결정 대기.

### 검증 메모

- 좁은 RED/GREEN:
  - 신규 recorder/parser/PageCode 테스트 RED 확인 후 구현.
  - `./gradlew :services:accounting-service:test --tests com.samhanair.logis.accounting.service.MigOpsMetricsRecorderTest :services:dashboard-service:test --tests com.samhanair.logis.dashboard.service.EcountMigOpsDashboardServiceTest :services:auth-service:test --tests com.samhanair.logis.auth.domain.PageCodeTest --no-daemon` PASS.
  - `clients/desktop npm.cmd run typecheck` PASS.
- 최종 통합:
  - `./gradlew :services:accounting-service:test :services:dashboard-service:test :services:auth-service:test :shared:common:test --no-daemon` PASS.
  - `clients/desktop`: `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build` PASS.
  - lint 기존 warning 2건과 build 기존 Pretendard font runtime warning 유지.
- Cycle 1c 부분 검증:
  - `./gradlew :services:accounting-service:test :services:dashboard-service:test --no-daemon` PASS.
  - `./gradlew :services:accounting-service:test :services:dashboard-service:test :services:auth-service:test :shared:common:test --no-daemon` PASS.
  - `clients/desktop`: `npm.cmd run typecheck`, `npm.cmd run build` PASS.
- Cycle 1e 부분 검증:
  - RED 확인: `EcountMigMetricsSupportTest`, `EcountReimportServiceTest` 신규 케이스 기존 구현 실패.
  - GREEN 확인: `./gradlew :services:accounting-service:test --tests com.samhanair.logis.accounting.service.EcountMigMetricsSupportTest --tests com.samhanair.logis.accounting.service.EcountReimportServiceTest --no-daemon` PASS.
  - 최종 확인: `./gradlew :services:accounting-service:test :services:dashboard-service:test :shared:common:test --no-daemon` PASS.
  - 최종 확인: `clients/desktop npm.cmd run build` PASS.

---

## 🚧 2026-05-21 최신 진행 — MIG-20 이카운트 raw 자동 재import 스케줄

### 현재 브랜치
- `spec/2026-05-21-mig-20-scheduled-reimport`

### 범위

- accounting-service에 `POST /admin/ecount/reimport/{slice}` MASTER 전용 재import endpoint를 추가한다.
- `docs/migration/ecount-data/raw/` 파일을 slice별 기존 importer/transform endpoint로 다시 흘려보내되, `source_file_hash`와 `staging.ecount_reimport_file_runs` 기준으로 이미 처리된 파일은 skip한다.
- auth-service에 `PageCode.ECOUNT_REIMPORT`와 V26 seed를 추가하고, shared/common에 `EcountReimportResult` 및 MIG-20 ErrorCode 3종을 추가한다.
- 운영 가이드는 `docs/migration/ECOUNT-CUTOVER-GUIDE.md` §7에 Linux crontab, Windows Task Scheduler, curl, Slack alert 연동 절차로 정리한다.

### 문서 산출

- spec: `docs/superpowers/specs/2026-05-21-mig-20-scheduled-reimport-design.md`
- dev-report: `docs/dev-reports/mig-20-scheduled-reimport.md`
- cutover guide: `docs/migration/ECOUNT-CUTOVER-GUIDE.md`
- decisions: `D-MIG-20-01~06`

### 검증 메모

- RED: `./gradlew :services:accounting-service:compileTestJava :services:auth-service:test --no-daemon` 실패 확인.
- GREEN 진행: accounting-service compile/test IT, auth-service/shared common 최종 검증 후 commit + push 예정.

---

## 🚧 2026-05-21 최신 진행 — MIG-19 이카운트 cutover 가이드 docs-only

### 현재 브랜치

- `spec/2026-05-21-mig-19-cutover-guide`

### 범위

- 운영자 대상 한국어 cutover 가이드를 `docs/migration/ECOUNT-CUTOVER-GUIDE.md`로 신규 작성한다.
- 가이드는 사전 준비, MIG-1~11 단계별 endpoint/응답 sample/로그 위치, admin UI 트레이닝, 롤백, 사후 검증, FAQ를 포함한다.
- 롤백은 soft-delete 복구와 staging `transform_status='PENDING'` 재실행으로 안내하고, Journal 번호는 `JD-`/`JR-` 접두사 충돌 회피를 명시한다.
- docs-only 슬라이스로 코드, Flyway, 권한 seed는 변경하지 않는다.

### 문서 산출

- spec: `docs/superpowers/specs/2026-05-21-mig-19-cutover-guide-design.md`
- cutover guide: `docs/migration/ECOUNT-CUTOVER-GUIDE.md`
- dev-report: `docs/dev-reports/mig-19-cutover-guide.md`
- decisions: `D-MIG-19-01~07`

### 검증 메모

- 최종 검증 대상: `git diff --check`.
- docs-only 변경이라 Gradle/npm/Playwright 실행 대상 없음.

---

## 🚧 2026-05-21 최신 진행 — MIG-18 admin UI 2단계 일괄 개발

### 현재 브랜치

- `spec/2026-05-21-mig-18-admin-ui-phase-2`

### 범위

- `FilterChipBar` 공통 컴포넌트를 추가하고 Cash 2 + OrderList + Aging + Ledger 2 목록 화면에 적용한다.
- Cash/Ledger는 거래처/업무번호/상태/일자 range, Order는 거래처/담당자/진행상태, Aging은 거래처 chip을 표시한다.
- AGING 목록은 React Query `page`/`size` 상태와 50/100/200/500 페이지 크기 선택을 API `page`/`size` 파라미터로 전달한다.
- AppLayout 회계 admin 메뉴는 "회계 관리자" collapse/expand 그룹으로 묶고, 권한 캐시 false 시 hidden 정책을 유지한다.
- Playwright dev server가 안정적으로 뜨면 MIG-14 스크린샷을 재캡처하고, 불가능하면 Linux CI 재캡처 보류로 dev-report에 남긴다.

### 문서 산출

- spec: `docs/superpowers/specs/2026-05-21-mig-18-admin-ui-phase-2-design.md`
- plan: `docs/superpowers/plans/2026-05-21-mig-18-admin-ui-phase-2.md`
- dev-report: `docs/dev-reports/mig-18-admin-ui-phase-2.md`
- decisions: `D-MIG-18-01~06`

### 검증 메모

- `clients/desktop npm.cmd run typecheck` PASS.
- `clients/desktop npm.cmd run lint` PASS (기존 warning 2건 유지).
- `clients/desktop npm.cmd run build` PASS.
- `clients/desktop npx.cmd playwright test playwright/mig-14-admin-ui --reporter=line` 재캡처 시도: Windows EPERM으로 screenshot write pending, 17번째 테스트까지 도달했으나 600초 command timeout으로 최종 summary 없음. Linux CI 재캡처 보류.

---

## 🚧 2026-05-21 최신 진행 — MIG-16 BE Minor 청소 진행 중

### 현재 브랜치

- `spec/2026-05-21-mig-16-be-minor-cleanup`

### 범위

- partner-service internal `POST /internal/partners/lookup-by-ids` batch endpoint를 추가한다.
- accounting-service `PartnerLookupClient.findByPartnerIdsBatch(List<UUID>)`로 admin cash 조회의 partnerName N+1 호출을 batch 1회로 전환한다.
- `/api/v1/accounting/aging-snapshot`은 `Pageable` 기반으로 전환하고 기본 size=100, 최대 size=500으로 제한한다.
- desktop `PartnerAgingSnapshotPage`는 refresh 성공/실패 toast를 표시한다.
- `usePermissions().canAccess()`는 권한 캐시 미로드 시 false를 반환해 AppLayout admin 메뉴 flash를 방지한다.

### 문서 산출

- spec: `docs/superpowers/specs/2026-05-21-mig-16-be-minor-cleanup-design.md`
- plan: `docs/superpowers/plans/2026-05-21-mig-16-be-minor-cleanup.md`
- dev-report: `docs/dev-reports/mig-16-be-minor-cleanup.md`
- decisions: `D-MIG-16-01~06`

### 검증 메모

- 캐시된 Gradle 사용:

```powershell
$env:GRADLE_USER_HOME='C:\dev\SamhanLogis\.gradle\codex-home'
```

- `./gradlew :services:accounting-service:compileTestJava :services:partner-service:compileTestJava --no-daemon` PASS.
- 최종 검증 대상: `./gradlew :services:accounting-service:test :services:partner-service:test :shared:common:test --no-daemon`, `clients/desktop npm run typecheck/build`.

---

## 🚧 2026-05-21 최신 진행 — MIG-15 POI shared/common 분리 진행 중

### 현재 브랜치

- `spec/2026-05-21-mig-15-poi-shared-io-module`

### 범위

- `shared/common`의 Apache POI 직접 의존성을 제거하고 `shared:ecount-io` 신규 module로 분리한다.
- `EcountXlsxSupport`는 `com.samhanair.logis.common.ecount.io` package로 이동한다.
- POI를 직접 import하는 공통 `ExcelExporter` 구현도 `shared:ecount-io`로 이동한다. `ExcelColumn`/`ExcelExportRequest`는 POI 비의존 DTO라 `shared:common`에 유지한다.
- `accounting-service`와 `partner-service`의 direct `poi-ooxml` 선언은 제거하고 `shared:ecount-io` 의존으로 연결한다.
- `arologis-service`, `slip-service`, `inventory-service`는 각각 `VendorExcelParser`, `SlipExcelExportIT`, `DpsExcelParser/DpsCompareService` 자체 사용 때문에 direct POI dependency를 유지한다.

### 문서 산출

- spec: `docs/superpowers/specs/2026-05-21-mig-15-poi-shared-io-module-design.md`
- plan: `docs/superpowers/plans/2026-05-21-mig-15-poi-shared-io-module.md`
- dev-report: `docs/dev-reports/mig-15-poi-shared-io-module.md`
- decisions: `D-MIG-15-01~08`

---

## 🚧 2026-05-21 진행 기록 — MIG-14 admin UI 4 화면 통합

### 현재 브랜치

- `spec/2026-05-21-mig-14-admin-ui-4-screens`
- 병렬 작업 주의: BE / FE / QA / Designer worker가 같은 브랜치에서 source와 QA 산출물을 수정할 수 있다. DevOps/TM 문서 worker는 docs/devops write set만 수정하고 다른 worker 변경을 revert하지 않는다.

### 범위

- Cash / Order / AgingSnapshot / Ledger admin UI 4 화면군을 Samhan Public desktop에 통합한다.
- 예상 desktop route: `clients/desktop/src/renderer/routes/accounting/admin/` 아래 7개 page.
- 예상 API: `GET /api/v1/accounting/cash-disbursements`, `/cash-receipts`, `/orders`, `/orders/{orderNo}`, `/aging-snapshot`, `/ledger/sales`, `/ledger/purchase` + MIG-9 `POST /aging-snapshot/refresh` 재사용.
- UUID 비공개: 화면, DTO, test id, screenshot에는 내부 UUID를 노출하지 않고 `slipNo`, `journalNo`, `orderNo`, `partnerName`, `managerName`만 표시한다.
- DynamicPermissionClient 청소: 30+ IT의 deprecated service-local `DynamicPermissionClient @MockBean`을 shared/security 통합 인터페이스 mock으로 교체한다. adapter 완전 삭제는 후속.
- DevOps 확인: `.github/workflows/ci.yml`은 `clients/desktop/**`를 paths-ignore하지 않으므로 FE source 변경 시 `frontend-desktop` CI가 트리거된다. `docs/**` 단독 변경은 의도대로 CI trigger 제외.
- Playwright fixture guard: fixture에는 실 계정/사업자번호/API key/token/Sheet ID를 넣지 않는다. 기존 `credential-plaintext-guard`와 GitGuardian 기준을 따른다.

### 문서 산출

- spec: `docs/superpowers/specs/2026-05-21-mig-14-admin-ui-4-screens-design.md`
- plan: `docs/superpowers/plans/2026-05-21-mig-14-admin-ui-4-screens.md`
- dev-report: `docs/dev-reports/mig-14-admin-ui-4-screens.md`
- decisions: `D-MIG-14-01~09`

---

## 🚀 2026-05-21 최신 진행 — MIG-12 follow-up 머지 완료 + 옵션 A 12단계 첫 적용

### MIG-12 PR #280 머지 (`d14affb2`, 21:48 UTC, 14 file +433 LOC)

**범위**: MIG-1~11 사후 재점검 MAJOR 1 + P1 1 follow-up
- accounting V32 `tax_invoice_lines(tax_invoice_id, line_no)` partial UNIQUE (WHERE is_deleted=FALSE)
- `MIG12_INTERNAL_AUTH_MISS(503)` ErrorCode
- ProductLookupClient + PartnerLookupClient: token null/blank/401/403 → fail-fast (이전 silent miss → 503 throw)
- `TaxInvoiceLineSoftDeleteIT` 3 case + LookupClient 단위 테스트 8 cases

### 옵션 A 12단계 첫 적용 결과 — 최단 사이클

| 단계 | 결과 |
|---|---|
| 1a Claude 5-agent | 모두 APPROVE (P0/P1/P2 0건, Minor 2 백로그) |
| 1c Claude fix | **skip** (P1 이하 백로그) |
| 1d Codex 5-section | **모두 APPROVE (결함 0건)** |
| 1e Codex fix | **skip** (결함 0) |
| 9 Claude verify | **skip** (Codex fix 변경 없음) |
| 10 1f Claude fix | **skip** (MAJOR/P0 없음) |
| CI | 27/27 PASS |

→ 양쪽 모두 APPROVE + Codex fix 0 = 단계 1c/1e/9/10 skip 효과 입증.

### Minor 백로그

- MIG-12-MIN-1: 다수 IT의 `DynamicPermissionClient @MockBean` deprecation warning (별도 청소 슬라이스)
- MIG-12-MIN-2: `PartnerLookupClient` Javadoc 'fail-soft 패턴' 잔존 (V32 후 fail-fast 격상됨)

### 신규 메모리 (2026-05-21)

- `feedback_codex_fix_claude_verify.md` — 옵션 A 12단계 (Codex fix → Claude verify, MAJOR/P0 만 1f fix)

---

## 🎉 2026-05-20 최신 진행 — 이카운트 마이그레이션 시리즈 종료 (MIG-1~11 모두 머지)

### 시리즈 종료 보고 (PM 자율 연속 진행 종결)

이카운트 마이그레이션 11 슬라이스 모두 머지 완료 — **이카운트 raw 11종 + 도메인 변환 + Journal 자동 생성 + aging snapshot view + Employee cross-link + xlsx 검증 모두 완성**. 다음 단계는 사용자 결정 대기 (PM 자율 연속 메모리 조건: "시리즈 종료 시 멈춤").

### 머지 완료 누적 (2026-05-20 하루 11 슬라이스)
  - 네트워크 가능한 환경에서 `./gradlew.bat :shared:common:test :services:auth-service:test :services:accounting-service:test --no-daemon` 재실행 필요.

### 머지 완료 슬라이스 (2026-05-20)

| PR | 슬라이스 | head | merged | 산출 |
|---|---|---|---|---|
| #270 | **MIG-2** 마스터 5종 + lookup map 4종 | `5b47197e` | 00:56 UTC | 49 file |
| #271 | **MIG-3** 회계 전표 4종 | `3a57c41f` | 03:38 UTC | 49 file |
| #272 | **MIG-4** 영업·세무 raw 4종 | `c8d64e38` | 05:34 UTC | 41 file |
| #273 | **MIG-5** 창고이동·지출결의서·입금보고서 raw 3종 | `cf16a93d` | 07:01 UTC | 54 file |
| #274 | **MIG-6** 잔여 마스터 5종 (PII 가드) | `5c15db2b` | 08:43 UTC | 75 file |
| #275 | **MIG-7** Cash 도메인 신규 (CashDisbursement + CashReceipt) | `9fd88bc5` | 09:38 UTC | 26 file, V27 + V20 |
| #276 | **MIG-8** Order 도메인 신규 + MIG-4 주문서 변환 | `b62c6cb8` | 10:39 UTC | 23 file, V28 + V21 |
| #277 | **MIG-9** Cash → Journal 자동 생성 + Partner aging snapshot view | `1d30dee6` | 11:52 UTC | 25 file 초기 + 사이클 fix 12 file, V29 + V22 |
| #278 | **MIG-10** Order Employee cross-link + aging_snapshot net 컬럼 (D-MIG-8-05 + C6-MIN-3 이연 처리) | `4f925a94` | 13:40 UTC | 27 file 초기 + 사이클 fix 17 file, V30 + V23, ErrorCode MIG10 5종 |
| #279 | **MIG-11** 매출장/매입장 xlsx → staging + DailyClosing 대조 (Apache POI 도입) | `25824d2e` | 14:38 UTC | 28 file 초기 + 사이클 fix 20 file, V31 + V24, Apache POI 5.4.0 (GHSA-gmg8-593g-7mv3 해소), EcountXlsxSupport 헬퍼 + extra column strict reject, ErrorCode MIG11 5종 + MIG11_FILE_HASH_INVALID, DailyClosing 대조 검증 SQL, 단위 테스트 18 cases + 10 IT parameterized |

### 다음 슬라이스 — 사용자 결정 대기 (이카운트 시리즈 종료)

PM 자율 연속 진행 ([feedback_pm_auto_continuous]) 의 멈춤 조건 "시리즈 종료" 도달. 다음 단계는 사용자 우선순위 결정:

**후보**:
1. **admin UI 화면** (Cash/Order/AgingSnapshot/Ledger 조회 + FE + Designer + QA 큰 슬라이스)
2. **외부 통합 실 연동** (KFTC / NTS / Aligo / Clova — SP-09 shell 완비, vendor key 필요)
3. **Phase 11 AWS migration** (RDS + EC2 + Secrets Manager)
4. **POI shared/common 분리** (D-MIG-11 이연, shared:ecount-io module)
5. **운영 데이터 실 import 검증** (E2E 시나리오)

### 신규 메모리 (2026-05-20)

- `feedback_pm_auto_continuous.md` — PM 자율 연속 진행 (사용자 명시 "PM이 자동으로 계속 다음 단계 진행")
- `feedback_qa_docker_real_test.md` — QA Docker 실서버 테스트 의무 강화 (code read 만 PASS 금지)

### MIG-9 사이클 1 누적 (PR #277)

| 사이클 | head | 결함 | 처리 |
|---|---|---|---|
| 1a Claude 5-agent | `2f6e7cca` | 모두 APPROVE (P0/P1 0건) — P2 3 + Minor 4 = 7건 | 1c fix |
| 1c Claude fix | `2b05e663` | 0 (잔존 0) | 1d 진입 |
| 1d Codex 5-section | — | **MAJOR 2** (journal_no 충돌 + PG duplicate trans abort) + Minor 2 | 1e fix |
| 1e Codex fix | `67d6cbf1` | 0 (잔존 0) | CI 확인 |
| CI watch | — | ✅ **27/27 PASS** | PM 자동 머지 |

### MIG-8 사이클 1 누적 (PR #276)

| 사이클 | head | 결함 | 처리 |
|---|---|---|---|
| 1a Claude 5-agent | `7232e129` | 모두 APPROVE (P0/P1 0건) — Minor 5건 | 1c fix |
| 1c Claude fix | `86942d6c` | 0 (잔존 0) | 1d 진입 |
| 1d Codex 5-section | — | **MAJOR 1** (batch boundary order_no split) + Minor 1 (product_id lookup 미구현) | 1e fix |
| 1e Codex fix | `6c3129b2` | 0 (잔존 0) | CI 확인 |
| CI watch | — | ✅ **27/27 PASS** | PM 자동 머지 |

### MIG-7 사이클 1 누적 (PR #275)

| 사이클 | head | 결함 | 처리 |
|---|---|---|---|
| 1a Claude 5-agent | `d2a7f401` | 모두 APPROVE (P0/P1 0건) — P2 1 + Minor 4 = **5건** | 1c fix |
| 1c Claude fix | `1e33d823` | 0 | 1d 진입 |
| 1d Codex 5-section | — | 문서 동기화 2건 (plan goal + 2 README) | 1e fix |
| 1e Codex fix | `dd979fb7` | 0 (잔존 0) | CI 재검증 |
| CI 재검증 | — | ✅ **27/27 PASS** (arologis flaky 재실행 PASS) | PM 자동 머지 |

### MIG-6 사이클 1 누적 (PR #274)

| 사이클 | head | 결함 | 처리 |
|---|---|---|---|
| 1a Claude 5-agent | `71660502` | **BE P0** (주민등록번호 평문 raw_payload) + P2 + Minor 2 / QA P1+P2+Minor 1 = **7건** | 1c fix |
| 1c Claude fix | `c1ff0ca7` | 0 (잔존 0) | 1d 진입 |
| 1d Codex 5-section | — | P1×3 (BankAccount/EmployeeCard lookup + duplicate 흡수) + P2×2 + Minor = **6건** | 1e fix |
| 1e Codex fix | `0c880f35` | 0 (잔존 0) | CI 확인 |
| 1e CI | — | ❌ EmployeePermissionIT 3건 + arologis 1건 (C3-P2-2 부작용 + flaky) | 1f fix |
| 1f Claude fix | `feae7f75` | 0 (잔존 0) | CI 재검증 |
| CI 재검증 | — | ✅ **27/27 PASS** (arologis 도 재실행 PASS — flaky) | PM 자동 머지 |

### 신규 메모리 갱신 (사용자 명시 2026-05-20)

- `feedback_codex_plugin_setup.md` — Codex `sandbox=workspace-write` 통일 (review 단계 read-only 폐기)

### 다음 슬라이스 — MIG-10 (진행 중)

**후보 범위**:
- Order 매니저명 → Employee cross-link (D-MIG-8-05 이연 처리) — 구현 진행
- partner_aging_snapshot net 계산 view 보정 (C6-MIN-3 이연 — `total_receivable = debit - credit` net 잔액) — 구현 진행
- 잔여 검증 raw (매출장/매입장 xlsx → DailyClosing 대조)
- admin UI 화면 (Cash/Order/AgingSnapshot 조회)
- 사용자 우선순위 결정 후보

### 새 세션 즉시 진입 절차

```powershell
# 1. main 동기화 (이미 done)
git checkout main && git pull origin main

# 2. Codex MCP 회복 확인 (새 세션이라 deferred tool registry 정상 등록)
claude mcp list  # → codex: codex mcp-server - ✓ Connected

# 3. MIG-5 brainstorming + spec 진입 — 사용자 명시 "PM 자동시작" 자율 진행
#    (MIG-3/MIG-4 spec/plan/dev-report 패턴 미러)
```

### 9회차 워크플로우 — 핵심 규칙 (절대 잊지 말 것)

[feedback_dual_5agent_review] 9회차 = Claude 기획 → Codex 개발 → 사이클 (Claude 5-agent review/fix → Codex 5-agent review/fix) N≤3 → CI green → PM 자동 머지 + 다음 PR 자동 진입.

### 🔒 사이클 1회 체크리스트 (절대 변동 금지 — 2026-05-20 사용자 정정)

매 PR / 매 사이클 동일 패턴 엄수. **워크플로우 변동/임의 단축 금지**.

1. ☐ Claude 5-agent 병렬 review (single message multiple Agent tool calls)
2. ☐ **TM Claude 통합 PR comment 등록 (즉시, head SHA 명시)** — 사이클 종료 후 사후 등록 금지
3. ☐ Claude fix (Codex CLI MCP workspace-write 위임 또는 직접) — 결함 0 시 skip 가능
4. ☐ commit + push (head 갱신)
5. ☐ Codex 5-agent 병렬 review (사이클 1c push 후 새 head 기준)
6. ☐ **TM Codex 통합 PR comment 등록 (즉시, head SHA 명시)**
7. ☐ Codex fix (workspace-write)
8. ☐ commit + push (head 갱신)
9. ☐ 사이클 종료 조건 검증: 잔존 결함 0 + CI watch 결과 PASS
10. ☐ 종료 시 → PM 마지막 종합 리뷰 + 자동 머지. 미충족 시 → 사이클 N+1 진입 (최대 N=3)

### 워크플로우 변동/혼란 회피 가드 (회고)

- **CI green 전 PM 마지막 리뷰 게시 금지** (자주 잊는 함정)
- **TM 통합 PR comment 사후 등록 금지** (PR #271 회고 — 사이클 1/2 사후 게시로 사용자 정정 발생)
- **Codex review 단계 임의 생략 금지** (환경 한계 외) — Codex MCP disconnect 시 새 세션 회복 후 정상 진행
- **사이클 안 "보강 fix-2/3", dev-report 추가 commit" 등 임의 추가 단계 금지** (PR #270 회고) — 1 사이클 = Claude fix + Codex fix 2 commit 통일
- **사이클 1~3 안 모든 결함 fix 의무** (후속 PR 백로그 금지)
- **QA agent Docker 실 검증 의무** — code read 만 PASS 금지
- **PM 자동시작** (사용자 명시) — brainstorming HARD-GATE skip 가능, spec → plan → Codex 개발 즉시 진입

### Codex MCP 세션 한정 한계 (신규 회고)

- **MCP 서버**: ✓ Connected (`claude mcp list`)
- **codex CLI**: 정상 (`codex-cli 0.131.0`, `codex exec` 우회 가능)
- **본 세션 deferred tool registry**: 한 번 close 후 ToolSearch `no match` — 새 세션 시 자동 해소
- **MIG-3 사이클 1 후반 QA 호출 중 `MCP error -32000: Connection closed` 발생** → 사이클 2/3 Codex re-review 환경 한계 예외 ([feedback_dual_5agent_review] line 188) 적용
- **회복**: 새 Claude Code 세션 시작 → `mcp__codex__codex` 도구 재등록 → 9회차 워크플로우 정상 진행

### 진행 누적 요약 (이카운트 마이그레이션)

- [x] MIG-1 거래처 PoC (PR #262, 5월 14일)
- [x] MIG-2 마스터 5종 + lookup map 4종 (PR #270, 5월 20일)
- [x] MIG-3 회계 전표 4종 (PR #271, 5월 20일)
- [x] MIG-4 영업·세무 raw 4종 (PR #272, 5월 20일 05:34 UTC)
- [ ] **MIG-5** 창고이동/지출결의서/입금보고서 (구현 완료, sandbox 네트워크 제한으로 Gradle 검증/commit 보류)
- [ ] MIG-6+ Order 도메인 신규 / 주문서 → SalesAccountingSlip 전환

---

## 2026-05-19 회사 PC 첨부 대기 — 이카운트 5월 샘플 + 출고전표 + 거래명세서 양식

### 첨부 위치 (자택 PC 에서 셋업 완료, 회사 PC `git pull` 후 즉시 사용)

| # | 첨부 대상 | 위치 | 보안 |
|---|---|---|---|
| 1 | **이카운트 5월 데이터 샘플 Excel** | `docs/migration/ecount-data/raw/master-export-202605.xlsx` | `.gitignore` 가 `*.xlsx` 차단 (로컬 보관만, git 제외) |
| 2 | **출고전표 양식 이미지** | `docs/migration/legacy-print-forms/outbound-slip-20260519.png` | PNG/JPG commit OK, 운영 자격 정보 마스킹 의무 |
| 3 | **거래명세서 양식 이미지** | `docs/migration/legacy-print-forms/sales-invoice-20260519.png` | 동일 |

### 회사 PC 진입 절차

```powershell
# 1. 자택 PC 작업 동기화
git checkout main
git pull origin main

# 2. 첨부 디렉토리 확인 (이미 셋업 완료)
ls docs/migration/ecount-data/raw/         # → .gitkeep
ls docs/migration/legacy-print-forms/      # → README.md / .gitignore / .gitkeep

# 3. 데이터 첨부 (수동)
#    - 이카운트 백업 (기초코드 탭 1회 — 마스터 6종 포함 1 파일):
#      Self-Customizing > 정보관리 > 데이터관리 > 백업 및 삭제 > 기초코드 탭
#      → "자료올리기형태로생성" → 메신저 알림 → Excel 다운로드
#      → docs/migration/ecount-data/raw/master-export-202605.xlsx 저장
#    - 출고전표 양식: 인쇄 캡처 → docs/migration/legacy-print-forms/outbound-slip-*.png
#    - 거래명세서 양식: 동일

# 4. PM 호출 (Claude Code)
#    → 즉시 MIG-1 PoC dispatch (당일 5h 내 완성)
```

### 첨부 후 자동 dispatch (Claude Code PM 자동)

1. **Designer agent**: 출고전표/거래명세서 픽셀/컬러/타이포 분석 → Figma baseline 명세
2. **BE agent**: `staging.ecount_partner_raw` Flyway V3 + `EcountPartnerImporter` Apache POI parser + 검증 SQL 10건 + 단위/IT
3. **QA agent**: MIG-1 시나리오 + idempotency 검증 + PII 마스킹 가드
4. **5-agent + Codex** cycle 1~3 → 머지

### 마스터 6종 (기초코드 탭) 우선순위

| # | 항목 | 대상 service | 우선순위 |
|---|---|---|---|
| 1 | **거래처등록** | partner-service | **P0 PoC 1순위** (FK 의존 0) |
| 2 | 품목등록 | product-service | P0 |
| 3 | 계정등록 | accounting-service | P0 (선행) |
| 4 | 부서등록 | hr / accounting-service | P0 |
| 5 | 창고등록 | warehouse-service | P0 |
| 6 | 카드등록 | accounting-service | P1 |

자세한 가이드: [`docs/migration/ecount-data/README.md`](../migration/ecount-data/README.md) + [`docs/migration/legacy-print-forms/README.md`](../migration/legacy-print-forms/README.md)

---

## 2026-05-19 전체 프로젝트 audit 시리즈 5/5 완료 — Figma/이카운트 전 안정성 확보

### 머지 결과 (5 PR)

| PR | Merge | 슬라이스 |
|---|---|---|
| #252 | `d836909c` | Slice 1 — main CI FAIL 2건 (SlipServiceTest NPE + LedgerControllerIT auth) |
| #253 | `1719087b` | Slice 2 — P0 cross-service (SlipQueryClient endpoint silent failure + Driver API contract) |
| #254 | `8b3658e5` | Slice 3 — P1 9건 (auth/logging/api-gateway IT 신규 + ci.yml docs/** + DriverLocation 정책 + slip AbstractIT + arologis Dyn 정리 + EstimateControllerIT 회귀 fix) |
| #255 | `877773b3` | Slice 4 — P1 FE 3건 (design-system lint exit 0 + dist/style.css @font-face + arologis-mobile Pretendard) |
| #256 | `67e7ef25` | Slice 5 — P2/Minor 9건 (V11 .conf cleanup + clients/web 스캔 + SalesSubNav env + admin-hr OR false-green + Badge token + prometheus 18 + GPS 중복 + notification-gateway 대시보드 + 메모리 sync) |

### audit 결과 요약

- **P0/Critical 3건** 모두 해소 (main CI 회복 + 세금계산서 silent failure 해소 + Driver UI 404 차단)
- **P1 12건** 모두 해소 (테스트 안정성 + FE Pretendard + CI 효율)
- **P2/Minor 9건** 모두 해소 (품질 정리 + 대시보드 + token 일관성)

### 양쪽 5-agent 리뷰 정상화

- Slice 1/2/3: Codex 1회 verify (Claude 5-team 누락, 사용자 지적 후 회고)
- **Slice 4/5: Claude 5-team 병렬 + Codex 5-section 정상화** (`feedback_dual_5agent_review.md` 의무 준수)

### Figma / 이카운트 트리거 전 안정성 baseline 확보

- 14 service compileJava + compileTestJava BUILD SUCCESSFUL
- CI 27/27 PASS 일관
- auth/logging/api-gateway IT 0건 → ContextLoadIT 3 신규 (테스트 안정성 가드)
- DriverLocation BaseEntity 정책 명시 + DynamicPermissionClient @deprecated 추적
- design-system token 일관성 (Badge variant-success/warning/danger 토큰 인용)
- notification-gateway Grafana 대시보드 신규 (Phase 11 운영 가시성 확보)

### 다음 trigger 후보 (사용자 결정 대기 — 기존 그대로)

1. 🎨 **Figma UI/UX 개선** (사용자 trigger 시) — design-system token 보강 + legacy-print-forms PNG 수집 + 카테고리 컬러 토큰화
2. 📊 **이카운트 마이그레이션** (Excel 파일 도착 시) — 6/10 부분 준비, 당일 5h 내 MIG-1 PoC
3. 🟡 외부 API 연동 (NTS / Aligo / Clova / KFTC / 인성) — SP-09/10 인프라 완비
4. 🟡 Phase 10 W10-3 (모바일 GPS / Aligo deeplink / 알림톡 템플릿)
5. 🟡 SP-D6+ (잔여 ~475 @PreAuthorize 점진)
6. ⏳ Phase 11 AWS (최후 순위)

### 메모리 가드 일관성 ✅

- `feedback_dual_5agent_review.md` Claude 5-team + Codex 정상화 (Slice 4부터)
- `feedback_multi_agent_team_pattern.md`
- `feedback_it_mockbean_external_clients.md`
- `feedback_korean_commits.md`
- `feedback_continuous_docs_sync.md`
- `feedback_user_merge_authority.md`

---

## 2026-05-19 SP-08-FU1/FU2 머지 완료 — 테스트 안정성 follow-up 종료 (이전 기록)

### 머지 결과

- **PR #249** `a8c8cbdd` — SP-08-FU1 slip-service IT 39건 UserInternalClient @MockBean 일괄
- **PR #250** `b00bd7f4` — SP-08-FU2 테스트 안정성 잔여 P2 4건 통합 (warehouse + PartnerLookup + LedgerName + path)

### SP-08 follow-up 14건 진행 상황

| 항목 | 상태 |
|---|---|
| ✅ P2-1 BE 35 IT @MockBean | PR #249 (실제 39 IT) |
| ✅ P2-2 warehouse name snapshot | PR #250 (Flyway V26 + Slip entity + WarehouseInternalClient + 43 IT) |
| ✅ P2-3 PartnerLookupClient 실 구현 | PR #250 (partner-service /summary + accounting-service findByPartnerId) |
| ✅ P2-4 LedgerLine.accountName | PR #250 (DTO + ChartOfAccount LEFT JOIN) |
| ✅ P2-5 TaxInvoiceListPage path 정합 | PR #250 (변경 0, 8 endpoint 100% 일치 검증) |
| ⏳ P2-6 NTS e-tax 실연동 | Phase 9/10 진행 후 (외부 API trigger 시 즉시) |
| ⏳ P3 7건 minor | 후순위 |
| ⏳ P1 1건 Phase 11 전 운영 비밀번호 교체 | 운영 작업 (Phase 11 진입 직전) |

### SP-08-FU2 cycle 누적

| 사이클 | head | 결함 | 처리 |
|---|---|---|---|
| Cycle 1 | `233b40c8` | P0 1 (Codex CRITICAL — WarehouseClient path) + P1 1 (JournalControllerIT @MockBean) + P2 1 (LedgerControllerIT 미작성) + Minor 1 (whitespace) = **4건** | cycle 2 fix |
| Cycle 2 | `8ed3943b` | 0건 — 양쪽 APPROVE | 머지 |

### 핵심 변경

**SP-08-FU2 BE 3건**
- P2-2: `V26__add_destination_warehouse_name.sql` + `Slip.snapshotDestinationWarehouseName()` 도메인 메서드 + `WarehouseInternalClient` (inventory-service `/inventory/warehouses/{id}` fail-soft) + 43 IT `@MockBean`
- P2-3: `partner-service` `GET /internal/partners/{id}/summary` 신규 + `accounting-service.PartnerLookupClient.findByPartnerId()` 실 구현 (RestClient + fail-soft) + IT 4건 신규
- P2-4: `LedgerResponse.LedgerLine` + `LedgerImageResponse.LedgerLine` `accountName` 필드 + `LedgerService` / `LedgerImageService` ChartOfAccount 캐시 LEFT JOIN (N+1 방지) + `LedgerControllerIT` 신규 3 케이스

**P2-5 FE 검증** (변경 0): 8 endpoint FE-BE path 100% 정합 (`p2-5-path-verification.md`)

**Critical fix (Codex cycle 1 P0)**: `WarehouseInternalClient` path 정정 (`/internal/warehouses` → `/inventory/warehouses`). fail-soft 가 가렸지만 운영에서 `destinationWarehouseName` 영구 null 회귀를 cycle 2 fix로 차단.

### SP-08 시리즈 최종 상태

- **본체 16 PR (SP-08-1~9)**: 2026-05-18 완전 종료
- **Follow-up 14건 중 5건 (P2-1~5) ✅ 완료** (PR #249, #250)
- **잔여 9건**: P1 Phase 11 운영 + P2-6 NTS e-tax + P3 7건 minor

### 다음 trigger 후보 (사용자 결정 대기)

1. 🟡 외부 API 연동 (사용자 trigger 시 즉시) — NTS / Aligo / Clova / KFTC / 인성 모두 SP-09/10 인프라 완비
2. 🟡 이카운트 마이그레이션 (Excel 파일 도착 시) — 6/10 부분 준비, 당일 5h 내 MIG-1 PoC 가능
3. 🟡 Phase 10 W10-3 (모바일 GPS 정밀화 / Aligo deeplink / 알림톡 템플릿)
4. 🟡 SP-D6+ (잔여 ~475 @PreAuthorize 점진 마이그레이션)
5. ⏳ Phase 11 AWS (최후 순위)

### 메모리 가드 일관성 ✅

- `feedback_dual_5agent_review.md` 사이클 N=2 완료
- `feedback_multi_agent_team_pattern.md` 5-team 병렬
- `feedback_integrated_pr_pattern.md` 4건 통합 PR
- `feedback_it_mockbean_external_clients.md` 43 + 신규 IT 격리
- `feedback_korean_commits.md`
- `feedback_user_merge_authority.md` PM 자동 머지

---

## 2026-05-19 SP-D5 머지 완료 — PermissionGuard 단일화 인프라 + Counter + AOP (이전 기록)

### 머지 결과

- **PR #247 MERGED** (`fdc0a5d0` on main, squash) — `[FEAT] SP-D5 PermissionGuard 단일화 인프라 + Counter.builder + AOP @RequirePermission`
- 사이클 N=2 완료 (`feedback_dual_5agent_review.md` 안 의무 충족, cycle 3 audit 만 진행)
- 양쪽 (Claude 5-agent + Codex 5-section) cycle 1 양쪽 cross-check → cycle 2 11건 fix → cycle 2 verify 5 Claude APPROVE + Codex 문구 정정 → APPROVE
- CI 27/27 PASS

### 사이클 누적 fix

| 사이클 | head | 결함 발견 | 처리 |
|---|---|---|---|
| Cycle 1 | `ee793327` | P0 2 + P1 4 + P2 2 + Minor 3 = **11건** (양쪽 reviewer 동시 발견 P0 2건이 AOP no-op 운영 critical) | cycle 2 통합 fix |
| Cycle 2 | `a06e3983` → `c10dcefe` | 0건 — 5 Claude APPROVE + Codex 1 minor (cycle 3 audit 정정) | 머지 |

### 핵심 변경 (BE 인프라 슬라이스, FE/Designer 영향 0)

**BE — shared/security 공통 인프라**
- `DynamicPermissionClient` interface 통합 (8 service 중복 정의 해소)
- `@RequirePermission(page, action)` annotation + `PermissionAspect @Around` AOP
- `PermissionGuardMetrics` Micrometer Counter `permission_guard_denied_total{service, page, role, action}`
- `PermissionSecurityAutoConfiguration` 단일 진입점 (cycle 2 fix: `@Component` 제거)
- service tag = `@Value("${spring.application.name:unknown}")` 주입 (cycle 2 fix P0-2)
- 9 service `@Deprecated DynamicPermissionClient` interface 가 shared interface `extends` (cycle 2 fix P0-1)

**BE — 시범 마이그레이션 10 endpoint (accounting.reports)**
- BalanceSheet / CashFlow / CorporateTax / DailySummary / EquityChanges / IncomeStatement / MonthlySummary / PartnerAging / TrialBalance / Vat
- `@PreAuthorize` + `checkView()` 명시 호출 제거 → `@RequirePermission(page=ReportPermissionGuard.PAGE_CODE, action="VIEW")` 단일화

**BE — 테스트**
- `PermissionAspectTest` AspectJProxyFactory + TestProtectedTarget 실 `@Around` 검증 9 케이스 (cycle 2 fix P1-3)
- 3 IT (TrialBalanceControllerIT / SliceBValidationIT / SliceCValidationIT) `@BeforeEach setUpPermissionStub()` (cycle 2 fix P1-4)

**FE — 영향 0** (`docs/qa/sp-d5-permission-guard-unification-and-aop/fe-impact-zero.md`)

**Designer — 영향 0 + Grafana dashboard mock**

**QA — 시나리오 Q1~Q6 + sidebar/domain-integrity SQL 10**

**DevOps**
- `infrastructure/grafana/provisioning/dashboards/permission-guard-denied.json` 5 panel
- `infrastructure/grafana/provisioning/datasources/prometheus.yml` `uid: PROMETHEUS_DS` (cycle 2 fix M-2)
- `infrastructure/prometheus/prometheus.yml` 17 scrape target (cycle 2 fix M-3)
- `shared/security/build.gradle` spring-aop + aspectjweaver + micrometer-core
- `.github/workflows/ci.yml` paths-ignore 보강

### SP-D 시리즈 종료

- ✅ SP-D1 (#241): 동적 RBAC 시스템 + 마스터 권한 관리 + 사이드바 hidden
- ✅ SP-D2 (#242): 회계 화면 19 페이지 동적 RBAC
- ✅ SP-D3 (#243): 매입/매출/배차 6 페이지 동적 RBAC
- ✅ SP-D4 (#244): 잔여 7 도메인 동적 RBAC
- ✅ SP-D5 (#247): PermissionGuard 단일화 인프라 + Counter + AOP + 시범 10 endpoint

### SP-D6+ 이연 (점진성 우선)

- 잔여 ~475 `@PreAuthorize` 완전 제거 (arologis-service 30개 등 대규모 마이그레이션은 별도 슬라이스 단위)
- 핵심 인프라 (shared/security + AOP + Counter + Grafana) 가 SP-D5 에서 완비됨
- SP-D6+ 는 endpoint 별 점진 마이그레이션만 진행하면 됨 (페이지/도메인 단위 슬라이싱)

### 다음 trigger — SP-08 잔여 follow-up (사용자 결정: SP-D5 → SP-08 잔여)

SP-08 시리즈 자체는 **16 PR 완전 종료** (SP-08-1~9). 본 "잔여"는 follow-up 14건:

**P1 (1건)**: Phase 11 전 운영 비밀번호 교체 (운영 작업, 코드 변경 X)

**P2 (6건)** — 다음 슬라이스 후보:
1. **BE 35 IT `@MockBean` 일괄 추가** (UserInternalClient) — 테스트 안정성 (1순위 추천)
2. **warehouse name snapshot** (destinationWarehouseName)
3. **PartnerLookupClient 실 구현**
4. **LedgerLine.accountName BE DTO 추가**
5. **TaxInvoiceListPage 일괄 발행 path 정합**
6. **NTS e-tax 실연동** (SP-09/10 진행 후 별도)

**P3 (7건)** — 기타 minor

### 메모리 가드 일관성 ✅

- `feedback_dual_5agent_review.md`: Claude + Codex 양쪽 × cycle 1/2 완료
- `feedback_multi_agent_team_pattern.md`: Designer 선행 + 5-team 병렬
- `feedback_korean_commits.md`: 모든 commit/PR 한국어
- `feedback_pr_ci_monitoring.md`: PR 발행 즉시 watch + auto merge 조건 발동
- `feedback_user_merge_authority.md` (2026-05-10): 5-team 0결함 + CI green → PM 자동 머지
- `feedback_function_documentation.md`: 한국어 Javadoc 의무
- `feedback_continuous_docs_sync.md`: dev-report + design + qa docs 동기화

---

## 2026-05-19 SP-10-2 머지 완료 — Phase 10 W10-2 인성데이타 퀵프로그램 vendor 통합 (이전 기록)

### 머지 결과

- **PR #245 MERGED** (`fa68e189` on main, squash) — `[FEAT] SP-10-2 인성데이타 퀵프로그램 vendor 통합 (W10-2)`
- 사이클 N=3 안 완료 의무 충족 (`feedback_dual_5agent_review.md`)
- 양쪽 (Claude 5-agent + Codex 5-section) cycle 1/2/3 cross-check 모두 APPROVE
- CI 27/27 PASS (자격 평문 비공개 가드 + Playwright + GitGuardian 포함)

### 사이클 누적 fix

| 사이클 | head | 결함 발견 | 처리 |
|---|---|---|---|
| Cycle 1 | `f82a5ad5` | P0 4 + P1 6 + Codex P1 2 + P2 12 = **24건** | cycle 2 통합 fix |
| Cycle 2 | `36379838` | Critical 1 + P1 1 + P2 7 = **9건** | cycle 3 통합 fix |
| Cycle 3 | `5c182b09` → `5f8dcdd1` | **0건** — 양쪽 APPROVE | 머지 |

### 핵심 변경 (BE/FE/Designer/QA/DevOps 5-team)

**BE (arologis-service)**
- `InsungQuickClient` interface/Impl 4 method + 6 키워드 placeholder guard + `INSUNG_QUICK_NOT_CONFIGURED` (502) + cycle 2: `INSUNG_QUICK_SUBMIT_FAILED` 분리
- `InsungQuickDriverMatcher` 실 구현 (fail-soft + `vehicle.updateVendorOrderId() + save()` — cycle 2 P0-1 fix)
- `InsungWebhookService` 3 webhook 처리 (match-result/status-update/delivered) + 상태 가드 MATCHING/PENDING/DEPARTED (cycle 2 P1-1) + signature idempotency `findByStopIdAndSource` (cycle 2 C-P1-1) + cycle 3: `parseCapturedAt` 2-stage OffsetDateTime fallback
- `ArologisInternalController` HMAC SHA-256 raw body 이중 검증 + sandbox=false + secret blank hard fail (cycle 2 P1-2) + nullable 방어 `safeVendorOrderId` (cycle 2 C-P1-2)
- V13 Flyway `vehicle.vendor_order_id + vendor_status` + partial unique index
- `InsungQuickIntegrationIT` 5 TC + IT_BASE_DATE + DispatchType 분리 (cycle 2 P0-2 unique constraint fix)
- `Phase10VendorPlaceholderGuardConsistencyTest`

**FE (arologis-desktop)**
- `VehicleMatchStatusBadge` 4 상태 + INSUNG 뱃지 + aria-live 컨테이너 4 상태 (cycle 2 Designer D2)
- `InsungLbsPanel` 4 GPS source + stale 60s + data-active
- `DispatchDetailPage` NotifyResultSection + sandbox 배너 + cycle 3: `loadError` 분기 → role=alert 에러 UI ("배차 정보를 불러오지 못했습니다")
- `DispatchDetailRouteWrapper` useEffect fetch + cycle 3: `loadError` state 분리
- testid 19종 부여

**Designer (5 markdown)**
- 4단계 vendor 매칭 시각화 wireframe + tokens.md WCAG AAA 14.7:1 (실제 계산값, cycle 2 D3 정정) + cycle 3: tokens.css + index.ts 주석 동기화

**QA (Playwright 14 test)**
- `sp-10-2-insung-quick-vendor.spec.ts` 직접 testid 검증 19종 (cycle 2 정합)
- 시나리오 + IT cross-check (cycle 3 C1 ASSIGNED 정정) + domain integrity + 사이드바 영향 0 docs
- `screenshots/cycle3-mock.png` PowerShell System.Drawing mock (35KB)

**DevOps**
- env-template 10 환경변수 (sandboxMode/webhookSecret/TIMEOUT_MS + cycle 3: Phase 11 KMS 메모)
- `arologis-ci.yml` paths + credential-guard job
- `check-credential-plaintext.sh` PATTERN_INSUNG + SP-10-2 화이트리스트 (cycle 3 D3 fix)
- `docs/dev-reports/sp-10-2-insung-quick-vendor.md` §7 Phase 11 KMS migration backlog (신규)

### Phase 10 누적 진행

- ✅ W10-1: arologis-service 신규 (Phase 10 진입)
- ✅ W10-2: 인성데이타 퀵프로그램 vendor 통합 (본 PR #245)
- ⏸ W10-3 이연:
  - 모바일 어플 GPS 보강 정밀화
  - 어플 설치 invite (Aligo deeplink)
  - Counter.builder 실 구현 (SP-D5)
  - 인성 vendor 알림톡 템플릿 등록
  - QA Playwright dev server 실 캡처 11건 (axios `waitForResponse` 도입 검토)
  - InsungQuickIntegrationIT 의 `DriverLocation` GPS 좌표 BE 영속 검증 (현재 IT 는 SignatureRepository 만 검증)

### 다음 trigger 후보 (개발책임자 결정)

1. **Phase 10 W10-3** — 모바일 어플 GPS 정밀화 + 어플 설치 invite + 알림톡 템플릿 등록
2. **Phase 11 진입** — AWS Seoul 단일 환경 cutover (RDS auto backup + EC2 Auto Recovery + Health Check Lambda) + vendor secret KMS migration (`docs/migration/phase11/M-PHASE-11-vendor-secrets-kms.md` 작성 의무)
3. **SP-D5 운영 안정화 후 단일 가드화** — RoleGuard `@PreAuthorize` 완전 제거 + AOP 통합 + Counter.builder 실 구현
4. **SP-08 잔여 slice** — legacy GAS parity 잔여 메뉴 (사용자 확인 후)

### 메모리 가드 일관성 ✅

- `feedback_dual_5agent_review.md`: Claude + Codex 양쪽 × 3 cycle 완료
- `feedback_multi_agent_team_pattern.md`: Designer 선행 + 5-team 병렬
- `feedback_uuid_no_user_visibility.md`: driverCode `INSUNG-{vendorId}` / vendorOrderId vendor 문자열만 노출
- `feedback_korean_commits.md`: 모든 commit/PR 한국어
- `feedback_pr_ci_monitoring.md`: PR 발행 즉시 watch + auto merge 조건 발동
- `feedback_user_merge_authority.md` (2026-05-10): 5-team 0결함 + CI green → PM 자동 머지

---

## 2026-05-18 SP-D4 머지 완료 — SP-D 시리즈 종료 + Phase 10 W10-2 진입 (이전 기록)

### SP-D 시리즈 종료 (D1/D2/D3/D4 4 PR)

- ✅ SP-D1 (#241): 동적 RBAC 시스템 + 마스터 권한 관리 + 사이드바 hidden
- ✅ SP-D2 (#242): 회계 화면 19 페이지 동적 RBAC
- ✅ SP-D3 (#243): 매입/매출/배차 6 페이지 동적 RBAC
- ✅ SP-D4 (#244, `b76d3cc6`): 잔여 7 도메인 (견적/거래처주문/재고/직원/거래처/상품/아로지스) 동적 RBAC — cycle 1~4 누적 fix

### SP-D5 이연 (운영 안정화 후)

- RoleGuard `@PreAuthorize` 완전 제거 (단일 가드화)
- Counter.builder `permission_guard_denied_total` 실 구현 (현재 로그 기반 모니터링)
- AOP/Aspect 통합

### 현재 진입: Phase 10 W10-2 (인성데이타 퀵프로그램 vendor 통합)

- 브랜치: `feat/sp-10-2-insung-quick-program` (base `b76d3cc6`)
- 마스터 plan: `docs/planning/2026-05-18_sp-10-2-insung-quick-program.md` (작성 예정)
- 사용자 명시 trigger: SP-D4 이후 진행 결정
- 실 인성 API 정보 미확정 → SP-09 vendor 시리즈 패턴 일관: Mock + sandbox 환경변수 분리, prod 모드는 운영 PC `.env` 키 보존

### Phase 10 W10-2 범위 (W10-1 의 Mock vendor 확장)

- `InsungQuickDriverMatcher` impl 신규 (DriverMatcher interface 의 두 번째 구현체, Mock + sandbox)
- 양방향 동기화 webhook (배차 등록 / 기사 매칭 / 배송 완료)
- `InsungQuickClient` 신규 (REST 패턴, 4xx → 보수적 fallback)
- 환경변수 `SAMHAN_INSUNG_*` (api-key / base-url / sandbox-mode)
- 알림톡 분리: 배차 단계 = 인성 알림톡, 일반 알림 = notification-service Aligo
- GPS 하이브리드: insung-lbs 우선 + app-gps 보강 ([project_arologis_phase10.md](.claude/memory/project_arologis_phase10.md) §결정 4)

### 다음 후보 (W10-2 머지 후)

- W10-5: Phase 10 회고 + 누적 backlog 정리
- Phase 11: AWS migration cutover

---

## 2026-05-18 SP-09-5 완료 — Phase 9 vendor 통합 검증 종료 / 다음 Phase 진입 안내

### 현재 상태

- **SP-09 시리즈 종료**: NTS / Aligo / Clova / KFTC 4 vendor 연동 shell 5 PR 완료
- **본 브랜치**: `feat/sp-09-5-phase9-integration-summary` (base `dc2ec0e8` main)
- **산출물**:
  - `clients/desktop/playwright/sp-09-5-vendor-integration/sp-09-5-vendor-integration.spec.ts` (T1~T5)
  - `services/accounting-service/src/test/java/.../it/Phase9VendorIntegrationIT.java` (case 1~8)
  - `docs/dev-reports/sp-09-summary.md` (시리즈 종료 보고서)
  - `docs/handoff/CURRENT-WORK.md` (본 파일 갱신)

### 다음 Phase 후보 (개발책임자 판단 필요)

| 후보 | 진입 기준 |
|---|---|
| **Phase 10 W10-2 인성데이타 퀵프로그램** | arologis-service 독립 운영 기능 확장 우선 시 |
| **Phase 11 AWS migration** | 운영 안정성 + 비용 ₩405K/월 확정 + EC2 Auto Recovery 긴급 시 |

### Phase 10 W10-2 진입 시 즉시 시작

```powershell
cd C:\dev\SamhanLogis
git checkout main && git pull
git checkout -b feat/sp-10-2-insung-quick-program
```

- master plan: `docs/planning/` 신규 작성 필요
- 메모리 참고: `project_arologis_independent.md` (인성데이타 퀵프로그램 = 외부 vendor)

### Phase 11 AWS migration 진입 시 즉시 시작

```powershell
cd C:\dev\SamhanLogis
git checkout main && git pull
git checkout -b feat/sp-11-aws-migration-infra
```

- master plan: `project_phase11_aws.md` (Seoul, m5.xlarge + db.t3.medium)
- 첫 슬라이스: Terraform / CDK infra + ECS task definition

---

## 2026-05-18 SP-09-1 진입 — NTS e-tax 세금계산서 실 발행 shell

### 즉시 시작

```powershell
cd C:\dev\SamhanLogis
git checkout feat/sp-09-1-nts-etax-emit-shell
git status --short
```

### 현재 기준

- 기준 branch: `main`
- 기준 commit: `054faa52` (PR #235 SP-08-9 squash merge)
- master plan: `docs/planning/2026-05-18_phase-9-vendor-integration.md`
- 사용자 6/7회차 정책

### Phase 9 vendor 연동 시리즈 범위

| Sub-task | Scope |
|---|---|
| SP-09-1 | NTS e-tax 실 발행 shell (본 슬라이스) |
| SP-09-2 | Aligo SMS 실 발송 |
| SP-09-3 | OCR 영수증 (Naver Clova 가능) |
| SP-09-4 | 오픈뱅킹 KFTC (Phase 10) |
| SP-09-5 | 통합 검증 |

### SP-09-1 범위

- BE: `ETaxClient` 신규 (mock 발행 + sandbox 운영 PC `.env` 분리) + `TaxInvoice.linkETaxExternalId()` 활성 + `POST /api/v1/accounting/tax-invoices/{id}/emit-nts` shell
- 권한: ACCOUNTANT/MASTER
- IT: mock 발행/실패/타임아웃/중복 + @MockBean ETaxClient
- FE: TaxInvoiceDetailPage "NTS 발행" CTA 추가 (옵션 — issue endpoint 이후 emit-nts 진행)
- audit `TAX_INVOICE_EMIT_NTS` revision 1건
- Playwright 5 case + PNG 4장 + dev-report

### 직전 머지 (PR #235)

- branch: `feat/sp-08-9-sp08-series-integration` (deleted)
- mergeCommit: `054faa52`
- SP-08 시리즈 16 PR 완전 종료

### 다음 후보

- SP-09-2 Aligo SMS 실 발송
- SP-09-3 OCR 영수증
- SP-09-4 오픈뱅킹 KFTC
- SP-09-5 통합 검증

## 2026-05-18 SP-08-9 머지 완료 — SP-08 시리즈 종료 (참고 이력)

## 2026-05-18 SP-08-9 진입 — SP-08 전체 시리즈 통합 검증 + 종료

### 즉시 시작

```powershell
cd C:\dev\SamhanLogis
git checkout feat/sp-08-9-sp08-series-integration
git status --short
```

### 현재 기준

- 기준 branch: `main`
- 기준 commit: `36d6aca2` (PR #234 SP-08-8 squash merge)
- master plan: `docs/planning/2026-05-16_legacy-gas-db-api-parity.md` §5.SP-08-9
- 사용자 6/7회차 정책

### SP-08-9 범위 (통합 검증)

SP-08 legacy GAS DB/API parity 전체 시리즈 (SP-08-5/6/7/8) 14 PR 머지 완료. 시리즈 종료 통합 보고서.

- `docs/dev-reports/sp-08-summary.md` 신규 — 전체 시리즈 종료 보고서 6 section
- CURRENT-WORK.md 갱신
- 다음 Phase 안내

### 직전 머지 (PR #234)

- branch: `feat/sp-08-8-credential-plaintext-guard` (deleted)
- mergeCommit: `36d6aca2`
- 사이클 통계: N=1 (head A → B 2c CI hard gate → C Playwright 제거)
- GitGuardian false positive PM 자동 처리 (가드 패턴 self-detect)

### SP-08 시리즈 누적 (15 PR + 본 PR)

- SP-08-5 (#220~225) — 매입 CRUD 6 PR
- SP-08-6 (#226~232) — 매출/회계 7 PR
- SP-08-7 (#233) — Notion zero
- SP-08-8 (#234) — 자격 가드
- SP-08-9 (본 PR) — 통합 검증

### 다음 Phase

- **Phase 11 AWS migration** (project_phase11_aws.md): Seoul m5.xlarge + db.t3.medium + RDS auto backup + EC2 Auto Recovery + Health Check Lambda, 월 ₩405K
- 또는 Phase 9/10 vendor 연동 (NTS e-tax, Aligo SMS, OCR)

## 2026-05-18 SP-08-8 머지 완료 — 자격 평문 가드 (참고 이력)

## 2026-05-18 SP-08-8 진입 — 자격 평문 비공개 가드 강화

### 즉시 시작

```powershell
cd C:\dev\SamhanLogis
git checkout feat/sp-08-8-credential-plaintext-guard
git status --short
```

### 현재 기준

- 기준 branch: `main`
- 기준 commit: `3e311e6e` (PR #233 SP-08-7 squash merge)
- master plan: `docs/planning/2026-05-16_legacy-gas-db-api-parity.md` §5.SP-08-8
- 사용자 6/7회차 정책

### SP-08-8 범위

CI grep 가드를 다음 영역에 모두 적용:
- `docs/qa/sp-08-*/`
- `docs/dev-reports/sp-08-*.md`
- `docs/operational-validation/*.md`
- Playwright fixture
- 신규 commit diff

금지 패턴:
- `NOTION_TOKEN` / `NOTION_API_KEY` (SP-08-7 grep 가드와 연계)
- 실 키 값 (`AKIA...`, `sk-...`, JWT 등)
- 사업자등록번호 평문 (placeholder 외)
- Sheet ID / Aligo Key / 카카오 SDK secret 등

작업:
1. `tools/operational-validation/` placeholder vs 실값 분리 (실값은 운영 PC `.env`)
2. CI grep 가드 확장 (SP-08-7 notion-zero-guard 패턴 재사용)
3. `.gitguardian.yaml` 정합 (false positive 처리)
4. dev-report 10 section

### 직전 머지 (PR #233)

- branch: `feat/sp-08-7-notion-runtime-zero` (deleted)
- mergeCommit: `3e311e6e`
- 사이클 통계: N=1 (head A CI fail → head B README *.md 제외 fix)
- TM PR comment 2건 (Claude + Codex)
- 신규: scripts/check-notion-zero.sh + CI notion-zero-guard job + Playwright 5/5 PASS

### 다음 후보 (SP-08-8 머지 후)

- SP-08 시리즈 종료 후 다음 phase 진입 (master plan §5.SP-08-9 통합 PR + 5-team 리뷰 + 최종 머지)

## 2026-05-18 SP-08-7 머지 완료 — Notion runtime zero (참고 이력)

## 2026-05-18 SP-08-7 진입 — Notion runtime 의존 zero 정적 잠금

### 즉시 시작

```powershell
cd C:\dev\SamhanLogis
git checkout feat/sp-08-7-notion-runtime-zero
git status --short
```

### 현재 기준

- 기준 branch: `main`
- 기준 commit: `5b681d03` (PR #232 SP-08-6-7 squash merge)
- master plan: `docs/planning/2026-05-16_legacy-gas-db-api-parity.md` §5.SP-08-7
- 사용자 6/7회차 정책

### SP-08-7 범위

grep 가드 + Playwright RED gate — 전 영역에서 Notion runtime 의존 zero 검증:

- 검사 대상: `clients/web/`, `clients/desktop/src/`, `clients/mobile-staff/src/`, `services/*/src/main/`
- 금지 패턴:
  - `api.notion.com`
  - `Notion-Version` header
  - `notion-sdk` import (혹은 `@notionhq/client`)
  - `NOTION_TOKEN` / `NOTION_KEY` 등 환경변수 호출
- estimate-app shim / 디버그 화면 잔존 reference 는 주석 + README 명시 후 차단

### 작업 항목

1. grep 가드 스크립트 (`scripts/check-notion-zero.sh` 또는 동등): CI 에서 실행 가능
2. Playwright spec (`sp-08-7-notion-runtime-zero.spec.ts`): 정적 grep RED gate
3. GitHub Actions workflow (또는 ci.yml 추가): grep 가드 step
4. 잔존 reference 발견 시 dev-report 명시 + 차단
5. dev-report 10 section + PNG (옵션)

### 직전 머지 (PR #232)

- branch: `feat/sp-08-6-7-sales-accounting-integration` (deleted)
- mergeCommit: `5b681d03`
- SP-08-6 시리즈 종료 — 7 슬라이스 7 PR 누적 + 통합 보고서

### 다음 후보 (SP-08-7 머지 후)

- **SP-08-8 자격 평문 비공개 가드 강화**: CI grep 가드 + placeholder 분리

## 2026-05-18 SP-08-6-7 머지 완료 — 매출/회계 시리즈 종료 (참고 이력)

## 2026-05-18 SP-08-6-7 진입 — 통합 검증 + SP-08-6 시리즈 종료

### 즉시 시작

```powershell
cd C:\dev\SamhanLogis
git checkout feat/sp-08-6-7-sales-accounting-integration
git status --short
```

### 현재 기준

- 기준 branch: `main`
- 기준 commit: `7ed50aaf` (PR #231 SP-08-6-6 squash merge)
- master plan: `docs/planning/2026-05-18_sp-08-6-sales-accounting-crud-parity.md` §2.7
- 사용자 6/7회차 정책

### SP-08-6-7 범위 (통합 검증)

SP-08-6 매출/회계 시리즈 6 PR 누적 완료. 통합 검증 + 시리즈 종료 dev-report.

- `docs/dev-reports/sp-08-6-summary.md` 신규 — 종료 통합 보고서 6 section
- CURRENT-WORK.md 갱신

### 직전 머지 (PR #231)

- branch: `feat/sp-08-6-6-tax-invoice-emit` (deleted)
- mergeCommit: `7ed50aaf`
- 옵션 A 결정: 기존 endpoint 충분, IT 1 case 회귀 가드 추가
- TM PR comment 2건 (Claude + Codex)

### 다음 시리즈 (SP-08-6-7 머지 후)

- **SP-08-7 Notion runtime 의존 zero 정적 잠금**: grep 가드 + Playwright RED gate
- **SP-08-8 자격 평문 비공개 가드 강화**: CI grep 가드 + placeholder 분리

## 2026-05-18 SP-08-6-6 머지 완료 — 세금계산서 발행 회귀 (참고 이력)

## 2026-05-18 SP-08-6-6 진입 — 세금계산서 발행 + 외부 연동 (옵션)

### 즉시 시작

```powershell
cd C:\dev\SamhanLogis
git checkout feat/sp-08-6-6-tax-invoice-emit
git status --short
```

### 현재 기준

- 기준 branch: `main`
- 기준 commit: `2ae5b0fe` (PR #230 SP-08-6-5 squash merge)
- master plan: `docs/planning/2026-05-18_sp-08-6-sales-accounting-crud-parity.md` §2.6
- 사용자 6/7회차 정책

### SP-08-6-6 범위 (옵션)

- BE: 세금계산서 발행 endpoint 정합 (`POST /api/v1/accounting/tax-invoices/{id}/emit` 또는 동등)
- 외부 vendor 연동 (e-tax 국세청): 본 시리즈에서는 endpoint shell + mock 발행 (실제 발행은 SP-09/SP-10 후속)
- 기존 TaxInvoiceController + TaxInvoiceView 확장
- FE: 매출 상세 화면 또는 SalesQueryPage 에서 "세금계산서 발행" CTA 활성화
- Playwright + IT + PNG 4장

본 슬라이스는 master plan 에서 "옵션" 으로 명시 — 사용자 결정에 따라 SP-08-6-7 통합으로 직접 이동 가능.

### 직전 머지 (PR #230)

- branch: `feat/sp-08-6-5-accounting-daily-ledger` (deleted)
- mergeCommit: `2ae5b0fe`
- 사이클 통계: N=1 (1c CRITICAL 1 + MAJOR 7 + MINOR 5 + 2c FE/BE 계약 정합)
- TM PR comment 2건 (Claude 1c + Codex 1c)
- 신규: V15 daily_closings + DailyClosingController/Service + LedgerController/Service + DailyClosingPage + GeneralLedgerPage + dateUtils/currencyUtils + 명조 폰트

## 2026-05-18 SP-08-6-5 머지 완료 — 일마감/원장 (참고 이력)

## 2026-05-18 SP-08-6-5 진입 — P2 일마감 + 원장 endpoint

### 즉시 시작

```powershell
cd C:\dev\SamhanLogis
git checkout feat/sp-08-6-5-accounting-daily-ledger
git status --short
```

### 현재 기준

- 기준 branch: `main`
- 기준 commit: `93d7c4c4` (PR #229 SP-08-6-4 squash merge)
- master plan: `docs/planning/2026-05-18_sp-08-6-sales-accounting-crud-parity.md` §2.5
- 사용자 6/7회차 정책

### SP-08-6-5 범위 (P2)

- BE: accounting-service 신규/확장 endpoint
  - `POST /api/v1/accounting/daily-closings` — 일마감 처리 (날짜 range)
  - `GET /api/v1/accounting/ledgers` — 원장 조회 (거래처 필터 + 기간)
- legacy GAS B 회계 4건 중 일마감/원장 옵션 GAS 정합:
  - 날짜 range (시작/종료)
  - 거래처 필터 (선택 — 전체 또는 특정)
  - 인쇄 양식 옵션
- Flyway migration 가능성: `accounting_db.daily_closings` 신규 테이블 + `accounting_db.ledger_entries` 또는 view
- FE: `clients/desktop/src/renderer/routes/accounting/` 신규 라우트 (또는 SalesQueryPage 의 일마감/원장 CTA 활성화)
- 인쇄 양식 (옵션): 일마감 보고서 PDF + 원장 출력
- Playwright + IT + PNG 4장

### 직전 머지 (PR #229)

- branch: `feat/sp-08-6-4-sales-print-form` (deleted)
- mergeCommit: `93d7c4c4`
- 사이클 통계: N=1 (1c MAJOR/Must/Medium/Should 9건 + 2c Codex Must Fix 2건)
- TM PR comment 4건 (Claude 1c 4472884502 + Codex 1c 4472906539 외)
- 신규: SalesTransactionStatementPrintPage / SalesInvoicePrintPage + 라우트 2 + printUtils.ts + .sales-print-* 350줄 + design docs print-spec.md

## 2026-05-18 SP-08-6-4 머지 완료 — 매출 인쇄 양식 (참고 이력)

## 2026-05-18 SP-08-6-4 진입 — P1 거래명세서 + 계산서 인쇄 양식

### 즉시 시작

```powershell
cd C:\dev\SamhanLogis
git checkout feat/sp-08-6-4-sales-print-form
git status --short
```

### 현재 기준

- 기준 branch: `main`
- 기준 commit: `5be1fa99` (PR #228 SP-08-6-3 squash merge)
- master plan: `docs/planning/2026-05-18_sp-08-6-sales-accounting-crud-parity.md` §2.4
- 사용자 6/7회차 정책

### SP-08-6-4 범위 (P1)

매출 (Slip slipType=OUTBOUND) 인쇄 양식 추가:
- `SalesTransactionStatementPrintPage.tsx` (거래명세서) — 신규 라우트 `/sales/:id/print/statement`
- `SalesInvoicePrintPage.tsx` (계산서) — 신규 라우트 `/sales/:id/print/invoice`
- SP-08-5-5 매입 인쇄 양식 패턴 재사용 (`PrintLayout paper="a4-portrait"`)
- A4 portrait 한 장 fit + 부가세 (10%) + 합계
- legacy GAS 양식 100% 매칭 (사용자 Edge 캡처 iteration 3~5회 의무)
- BE 변경 없음 (기존 GET `/slips/{id}` 재사용 — SP-08-5-5 패턴)
- FE only 슬라이스
- Playwright + PNG 4~8장 (양식별 2장씩)

### 직전 머지 (PR #228)

- branch: `feat/sp-08-6-3-sales-slip-soft-delete` (deleted)
- mergeCommit: `5be1fa99`
- 사이클 통계: N=1 (1c MAJOR 4 + MEDIUM 1 + MINOR/INFO 5 일괄 fix)
- TM PR comment 2건 (Claude 1c 4472783467 + Codex 1c 4472799953)
- 신규: SalesSlipDeleteController/Service + Slip.deleteForSales + SLIP_DELETE_SALES_SHIPPED + SlipSalesDeleteIT 9 case + .danger-banner 기반 alert() 제거 + 409 reload + requireNotLocked

## 2026-05-18 SP-08-6-3 머지 완료 — 매출 soft delete (참고 이력)

## 2026-05-18 SP-08-6-3 진입 — D1 매출 soft delete + 출고 정책

### 즉시 시작

```powershell
cd C:\dev\SamhanLogis
git checkout feat/sp-08-6-3-sales-slip-soft-delete
git status --short
```

### 현재 기준

- 기준 branch: `main`
- 기준 commit: `85bb007f` (PR #227 SP-08-6-2 squash merge)
- master plan: `docs/planning/2026-05-18_sp-08-6-sales-accounting-crud-parity.md` §2.3
- 사용자 6/7회차 정책

### SP-08-6-3 범위 (D1)

매출 (Slip slipType=OUTBOUND) soft delete endpoint. SP-08-5-3 매입 패턴 재사용:
- `DELETE /api/v1/slips/{id}/sales` (또는 동등) — SP-08-6-2 옵션 B 패턴 일관
- 권한 SALES/MANAGER/MASTER
- 출고 정책 결정: SHIPPED/DELIVERED/CONFIRMED 상태 차단 → ErrorCode `SLIP_DELETE_SALES_SHIPPED` (또는 동등)
- 도메인 메서드 `Slip.deleteForSales()` 신규 (OUTBOUND guard + EDITABLE_STATUSES guard)
- audit `SLIP_DELETE` revision 1건
- FE: SalesQueryPage + SlipDetailPage 매출 삭제 CTA + 확인 modal (SP-08-5-3 패턴)
- Playwright + IT + PNG 4장

### 🚨 회사 PC 이어가기 (2026-05-18 집 PC 중단 시점)

**중단 사유**: 사용자 요청 (회사에서 이어감)

**현재 진행 상태**:
- branch: `feat/sp-08-6-3-sales-slip-soft-delete` (push 안 됨 — 회사 PC 진입 후 확인)
- 5-team Claude agent 백그라운드 디스패치 **완료** (BE/FE/Designer/QA/DevOps)
- 결과 도착 시 working tree 변경 발생 가능 (agent 자율 진행 — 중단 불가)
- 집 PC 의 마지막 Claude Code 세션이 종료 후 agent 결과는 더 이상 받지 못함

**회사 PC 진입 절차**:

```powershell
cd C:\dev\SamhanLogis

# 1. 최신 main 동기화
git fetch origin
git checkout main
git pull origin main  # HEAD: 85bb007f (PR #227 SP-08-6-2 머지)

# 2. SP-08-6-3 branch 재생성 (집 PC 에서 push 안 됨)
git checkout -b feat/sp-08-6-3-sales-slip-soft-delete
# 또는 집 PC 에서 push 했다면:
# git checkout feat/sp-08-6-3-sales-slip-soft-delete
# git pull origin feat/sp-08-6-3-sales-slip-soft-delete

# 3. 5-team agent 결과 working tree 확인
git status --short
# 예상 변경:
# - services/slip-service/.../SalesSlipDeleteController.java (BE 신규)
# - services/slip-service/.../SalesSlipDeleteService.java (BE 신규)
# - services/slip-service/.../Slip.java (deleteForSales 메서드)
# - shared/common/.../ErrorCode.java (SLIP_DELETE_SALES_SHIPPED 신규)
# - services/slip-service/.../SlipSalesDeleteIT.java (9 case 신규)
# - clients/desktop/src/renderer/api/slip.ts (deleteSalesSlip)
# - clients/desktop/src/renderer/routes/SlipDetailPage.tsx (매출 삭제 modal)
# - clients/desktop/src/renderer/routes/sales-query/SalesQueryPage.tsx (삭제 CTA)
# - clients/desktop/playwright/sp-08-6-3-.../sp-08-6-3-...spec.ts
# - docs/qa/sp-08-6-3-sales-slip-soft-delete/screenshots/ (PNG 4장)
# - scripts/generate-sp-08-6-3-...-screenshots.ps1
# - docs/dev-reports/sp-08-6-3-sales-slip-soft-delete.md

# 4. agent 결과 없다면 (집 PC 종료 후 결과 미저장 시):
# 동일 5-team agent 디스패치 재실행 (위 docs/handoff CURRENT-WORK.md prompt 참고)
```

**다음 단계 (회사 PC 에서)**:

1. working tree 검증 + compile (`./gradlew :services:slip-service:compileJava :services:slip-service:compileTestJava`)
2. typecheck (`cd clients/desktop && npm run typecheck`)
3. 통합 commit + push
4. PR 발행 (#228 예상, 제목: `[FEAT] SP-08-6-3 매출 soft delete + 출고 정책 (D1)`)
5. 사이클 1 Claude 5-agent review + TM 통합 1건 PR comment 게시 (**agent 가 직접 PR comment 게시 금지** — 사용자 지적)
6. 1c Claude fix → push
7. Codex 5-agent 2a review + TM 통합 1건 게시
8. 2c Codex fix (또는 Claude 직접) → push
9. CI green + 양쪽 0 P0/P1 도달 시 PM 자동 머지
10. SP-08-6-4 진입 (P1 거래명세서/계산서 인쇄)

### 리뷰 규칙 엄수 (사용자 지적 2건)

- **5 agent raw markdown 만 docs/qa/<slug>/ 저장, PR comment 직접 등록 금지**
- **TM Claude 통합 1건 + TM Codex 통합 1건 = 사이클당 PR comment 2건만 게시**
- agent prompt 에 "PR comment 게시 금지" 명시 의무 (회사 PC 에서 dispatch 시 재현)

### PR #227 SP-08-6-2 사이클 통계 (회고)

- TM PR comment 4건 (Claude 사이클 1 보완 등록 4472742152 + Codex 사이클 1 4472730898 + Claude 사이클 2 4472752584 + Codex 사이클 2 4472752645)
- 사이클 1 결함: BLOCKER 3 + Medium 7 + LOW 4 (Designer/QA/FE/BE 등)
- 사이클 2 fix: CI fail revisionNo 단언 + supervisionAddress audit summarize
- N=2 종료 — head A → B (1c) → C (2c) → D (CI fix)
- mergeCommit `85bb007f`

### 리뷰 규칙 엄수 (사용자 지적 사항)

- 5 agent raw markdown 만 docs/qa/ 저장, **PR comment 직접 등록 금지**
- TM Claude 통합 1건 + TM Codex 통합 1건 = 사이클당 PR comment 2건만 게시
- agent prompt 에 "PR comment 게시 금지" 명시 의무

### 직전 머지 (PR #227)

- branch: `feat/sp-08-6-2-sales-slip-edit-put` (deleted)
- mergeCommit: `85bb007f`
- 사이클 통계: N=2 (사이클 1 1c+2c + 사이클 2 CI fix + Codex APPROVE)
- TM PR comment 4건 (Claude/Codex 각 사이클 통합)
- 신규: SalesSlipUpdateController/Service + Slip.updateSalesHeader/replaceSalesLines + SLIP_UPDATE_NON_SALES + SlipSalesUpdateIT 10 case + .sales-edit-field + .success-banner CSS + supervisionAddress audit summarize

## 2026-05-18 SP-08-6-2 머지 완료 — 매출 수정 PUT (참고 이력)

## 2026-05-18 SP-08-6-2 진입 — U1 매출 수정 direct PUT

### 즉시 시작

```powershell
cd C:\dev\SamhanLogis
git checkout feat/sp-08-6-2-sales-slip-edit-put
git status --short
```

### 현재 기준

- 기준 branch: `main`
- 기준 commit: `c380644e` (PR #226 SP-08-6-1 squash merge)
- master plan: `docs/planning/2026-05-18_sp-08-6-sales-accounting-crud-parity.md` §2.2
- 사용자 6/7회차 정책

### SP-08-6-2 범위 (U1)

매출 (Slip slipType=OUTBOUND) 수정 direct PUT endpoint. SP-08-5-2 매입 수정 패턴 재사용:
- `PUT /api/v1/slips/{id}` slipType=OUTBOUND 분기
- 권한 SALES/MANAGER/MASTER (SP-08-6-1 정합)
- 낙관적 잠금 `ChronoUnit.MICROS` truncation (SP-08-5-2 회고)
- `Slip.updateHeader/replaceLines` 도메인 메서드 INBOUND/OUTBOUND 양쪽 처리 가능 확인
- 422 SLIP_UPDATE_INVALID_LINE 계약 보존 (Bean Validation 금지)
- audit `SLIP_EDIT` revision 1건
- FE: SalesQueryPage + SalesDetail 수정 modal (SP-08-5-2 패턴)
- Playwright + IT + PNG 4장

### 직전 머지 (PR #226)

- branch: `feat/sp-08-6-1-sales-slip-list-detail` (deleted)
- mergeCommit: `c380644e`
- 사이클 통계: N=1 (양쪽 Claude+Codex 결함 통합 fix)
- 신규: SlipSalesAccessGuard + SlipQuerySalesIT 14 case + SalesQueryPage (canQuerySales + statusBadgeVariant + design-system Input)
- SP-08-5-1 IT 회귀 정합 (SP-03 §4.2 INVENTORY/ACCOUNTANT + null → 403)

## 2026-05-18 SP-08-6-1 머지 완료 — 매출 R1/R2 (참고 이력)

## 2026-05-18 SP-08-6-1 진입 — R1/R2 매출 목록·상세 endpoint 잠금

### 즉시 시작

```powershell
cd C:\dev\SamhanLogis
git checkout feat/sp-08-6-1-sales-slip-list-detail
git status --short
```

### 현재 기준

- 기준 branch: `main`
- 기준 commit: `d9b2af43` (PR #225 SP-08-5-6 squash merge)
- master plan: `docs/planning/2026-05-18_sp-08-6-sales-accounting-crud-parity.md` §2.1
- SP-08-5 시리즈 종료 — `docs/dev-reports/sp-08-5-summary.md` 참조
- 사용자 6/7회차 정책 — PR 내 모든 결함 해결 + PM 자동 머지 + 자동 진입

### SP-08-6 시리즈 범위

legacy GAS B 회계 4건 (거래명세서 / 계산서 / 일마감 / 원장) + 매출 전표 CRUD parity.

| Sub-task | Scope |
|---|---|
| SP-08-6-1 | R1/R2 매출 목록·상세 endpoint 잠금 (본 슬라이스) |
| SP-08-6-2 | U1 매출 수정 direct PUT |
| SP-08-6-3 | D1 매출 soft delete + 출고 정책 |
| SP-08-6-4 | P1 거래명세서 + 계산서 인쇄 양식 |
| SP-08-6-5 | P2 일마감 + 원장 endpoint (accounting-service) |
| SP-08-6-6 | 세금계산서 발행 + 외부 연동 (옵션) |
| SP-08-6-7 | 통합 검증 + 시리즈 종료 |

### SP-08-6-1 범위 (R1/R2)

- BE: `GET /api/v1/slips?slipType=SALE` (또는 OUTBOUND) + `GET /api/v1/slips/{id}` 매출 응답 정합
- 권한: SALES/MANAGER/MASTER (또는 ACCOUNTANT 추가)
- FE: `SalesQueryPage.tsx` (기존 검증) + CTA (출고/거래명세서/계산서)
- Playwright + IT + PNG 4장
- SP-08-5-1 `Slip.findBySlipTypeAndSlipNoAndIsDeletedFalse` 헬퍼 재사용

### 직전 머지 (PR #225 SP-08-5-6)

- branch: `feat/sp-08-5-6-purchase-crud-parity-integration` (deleted)
- mergeCommit: `d9b2af43`
- SP-08-5 시리즈 종료 — 6 슬라이스 5 PR 누적 + 종료 보고서

## 2026-05-18 SP-08-5-6 머지 완료 — 매입 시리즈 종료 (참고 이력)

## 2026-05-18 SP-08-5-6 진입 — 통합 검증 + SP-08-5 시리즈 종료

### 즉시 시작

```powershell
cd C:\dev\SamhanLogis
git checkout feat/sp-08-5-6-purchase-crud-parity-integration
git status --short
```

### 현재 기준

- 기준 branch: `main`
- 기준 commit: `dafee351` (PR #224 SP-08-5-5 squash merge)
- master plan: `docs/planning/2026-05-17_sp-08-5-purchase-slip-crud-parity.md` §3.6
- 사용자 6/7회차 정책 — PR 내 모든 결함 해결 + PM 자동 머지 + 자동 진입

### SP-08-5-6 범위 (통합 검증)

SP-08-5 시리즈 5 PR 누적 완료. 통합 검증 + ROADMAP/DECISIONS 동기화 + SP-08-5 종료 dev-report.

- **R1/R2 잠금** (SP-08-5-1 PR #220 `0d621b36`): 매입 목록·상세 endpoint
- **U1 direct PUT** (SP-08-5-2 PR #221 `61925942`): 매입 수정 + optimistic lock + audit
- **D1 soft delete** (SP-08-5-3 PR #222 `211711a1`): InboundInspection 정책 + ErrorCode
- **C1 회귀 가드** (SP-08-5-4 PR #223 `1486e610`): 검수 CTA + InboundInspection 흐름
- **P1 인쇄 양식** (SP-08-5-5 PR #224 `dafee351`): A4 portrait + 검수란 + 8컬럼

### 작업 항목

1. `docs/dev-reports/sp-08-5-summary.md` 신규 — 시리즈 종료 dev-report
2. `docs/ROADMAP.md` 갱신 — SP-08-5 시리즈 완료 표시
3. `docs/DECISIONS.md` 갱신 — InboundInspection 정책 + UserInternalClient + 라인테이블 8컬럼 + .gitattributes EOL 결정 누적
4. `README.md` 갱신 (필요 시) — SP-08 series 진행도 + 인쇄 양식 안내
5. 5-team 종합 검증 (BE: IT 카운트 / FE: typecheck 누적 / Designer: 토큰 누적 / QA: PNG 누적 / DevOps: CI matrix 누적)
6. 후속 follow-up 정리 (BE 35 IT MockBean + warehouse name snapshot + Pretendard self-host + 다중 페이지 분할)

### 직전 머지 (PR #224)

- branch: `feat/sp-08-5-5-purchase-print-form` (deleted)
- mergeCommit: `dafee351`
- 사이클 통계: N=1 종료 (Claude+Codex 양쪽 APPROVE)
- 신규: PurchaseSlipPrintPage + UserInternalClient + SlipDetailResponse.ownerFullName + 8컬럼 라인테이블 + @media print + @page + design docs 3개

### 다음 후보 (SP-08-5-6 머지 후)

- SP-08-6 매출/회계 CRUD parity (master plan SP-08 시리즈)
- SP-08-7 Notion runtime zero
- SP-08-8 자격 평문 비공개 가드

## 2026-05-18 SP-08-5-5 머지 완료 — 매입 인쇄 양식 (참고 이력)

## 2026-05-18 SP-08-5-5 진입 — P1 매입 인쇄 양식

### 즉시 시작

```powershell
cd C:\dev\SamhanLogis
git checkout feat/sp-08-5-5-purchase-print-form
git status --short
```

### 현재 기준

- 기준 branch: `main`
- 기준 commit: `1486e610` (PR #223 SP-08-5-4 squash merge)
- master plan: `docs/planning/2026-05-17_sp-08-5-purchase-slip-crud-parity.md` §3.5
- 사용자 6/7회차 정책 — PR 내 모든 결함 해결 + PM 자동 머지 + 자동 진입

### SP-08-5-5 범위 (P1)

- 매입 전표 인쇄 HTML 또는 print view
- A4 한 장 fit (210mm × 297mm portrait)
- 포함 항목: 거래처명/사업자번호/품목/모델명/단가/수량/합계/입고창고/검수란/슬립번호/날짜/담당자
- legacy GAS 양식 캡처와 side-by-side QA PNG (기존 GAS 양식 가능한 한 100% 매칭)
- print CSS: `@media print` + design-system `paper-a4-portrait` 클래스 재사용 (이미 global.css 에 정의)
- design-system `<PrintLayout>` 또는 동등 컴포넌트 가능 시 재사용
- FE 라우트: `clients/desktop/src/renderer/routes/SlipPrintPage.tsx` 또는 `SlipDetailPage` 의 `?print=1` 모드 추가
- BE: 신규 endpoint 불필요 (기존 GET `/slips/{id}` 응답 재사용)
- QA: legacy GAS PNG vs 우리 print PNG side-by-side 캡처

### 직전 머지 (PR #223)

- branch: `feat/sp-08-5-4-purchase-inspection-cta-regression` (deleted)
- mergeCommit: `1486e610`
- 사이클 통계: N=1 종료 (양쪽 Claude + Codex APPROVE 신규 0)
- TM PR comment 2건 (Claude 사이클 1 + Codex 사이클 1)
- 신규: SlipInspectionCtaRegressionIT 6 case 회귀 가드, .gitattributes (SP-08-5-3 EOL follow-up), InboundInspectionDialog saveMutation invalidate fix

### 다음 후보

- SP-08-5-6 통합 검증 또는 누적 5 PR 대체

## 2026-05-18 SP-08-5-4 머지 완료 — 검수 CTA 회귀 가드 (참고 이력)

## 2026-05-18 SP-08-5-4 진입 — C1 검수 CTA 회귀 + InboundInspection 흐름 검증

### 즉시 시작

```powershell
cd C:\dev\SamhanLogis
git checkout feat/sp-08-5-4-purchase-inspection-cta-regression
git status --short
```

### 현재 기준

- 기준 branch: `main`
- 기준 commit: `211711a1` (PR #222 SP-08-5-3 squash merge)
- master plan: `docs/planning/2026-05-17_sp-08-5-purchase-slip-crud-parity.md` §3.4
- 사용자 6/7회차 정책 — PR 내 모든 결함 해결 + PM 자동 머지 + 자동 진입

### SP-08-5-4 범위 (C1)

- 회귀 검증: SP-03 구매관리 CTA 가 `SAVED / CONFIRMED` 행에 유지되는지
- `InboundInspectionDialog` 저장/완료 성공 후 구매관리 query refetch 유지
- inventory-service endpoint path 직접 `/api/v1` 와 gateway strip 양쪽 경로 회귀
- Playwright 정적 spec + IT (필요 시) + QA PNG 회귀 mock
- 신규 코드 변경 최소화 — 회귀 안전 가드 추가가 주

### 직전 머지 (PR #222)

- branch: `feat/sp-08-5-3-purchase-slip-soft-delete` (deleted)
- mergeCommit: `211711a1`
- 사이클 통계: N=2 종료 (양쪽 Claude+Codex 모두 APPROVE)
- TM PR comment 4건 (Claude/Codex 각 사이클 1+2)
- 신규: SlipDeleteController/Service/Request, Slip.deleteForPurchase, SlipDeleteIT 10 case, ErrorCode SLIP_DELETE_INSPECTION_COMPLETED + SLIP_DELETE_NON_INBOUND, `.danger-banner`/`.danger-text` CSS, 422 alert→banner state

### 다음 후보

- SP-08-5-5 P1 매입 인쇄 양식
- SP-08-5-6 통합 검증 또는 누적 5 PR 대체

## 2026-05-18 SP-08-5-3 머지 완료 — 매입 soft delete (참고 이력)

## 2026-05-18 SP-08-5-3 진입 — 매입 soft delete + InboundInspection 연계

### 즉시 시작

```powershell
cd C:\dev\SamhanLogis
git checkout feat/sp-08-5-3-purchase-slip-soft-delete
git status --short
```

### 현재 기준

- 기준 branch: `main`
- 기준 commit: `61925942` (PR #221 SP-08-5-2 squash merge)
- master plan: `docs/planning/2026-05-17_sp-08-5-purchase-slip-crud-parity.md` §3.3
- 사용자 6/7회차 정책: PR 내 모든 문제 본 PR 안에서 해결, PM 자동 머지 후 다음 슬라이스 자동 진입.

### SP-08-5-3 범위 (D1)

- BE: `DELETE /api/v1/slips/{id}` 매입 soft delete (`Slip.markDeleted()` 컨벤션 재사용)
- hard delete / orphan removal 금지 — BaseEntity Soft Delete only
- 권한: `WAREHOUSE / MANAGER / MASTER`; `INVENTORY / SALES / ACCOUNTANT` 403
- 낙관적 잠금: SP-08-5-2 와 동일 패턴 (request `updatedAt` 또는 `version` 기반)
- 연결 `InboundInspection` 정책:
  - 검수 완료 (`InspectionStatus.COMPLETED`) 매입은 삭제 차단 → ErrorCode `SLIP_DELETE_INSPECTION_COMPLETED` 422
  - 미완료 상태 (`PENDING/IN_PROGRESS`) 는 같이 cascade soft-delete 또는 차단 (master plan 결정 시 BE agent 가 정책 결정)
- audit log: `SLIP_DELETE` revision 1건 기록
- FE: 매입 상세 화면 "삭제" CTA (권한 + status 가드) + 확인 dialog + 삭제 후 목록 이동
- QA: `docs/qa/sp-08-5-3-purchase-slip-soft-delete/screenshots/` 4장
  - 삭제 확인 modal
  - 검수 완료 차단 alert
  - 삭제 성공 + 목록 갱신
  - 권한 가드 (INVENTORY 버튼 미렌더)

### 머지 완료 직전 슬라이스 (PR #221)

- branch: `feat/sp-08-5-2-purchase-slip-edit-put` (deleted)
- mergeCommit: `61925942`
- 사이클 통계: N=2 종료 (양쪽 5+5 = 10 agent APPROVE, CI 24/24 SUCCESS)
- TM PR comment 4건 발행 (Claude 사이클 1 + Codex 사이클 1 + Claude 사이클 2 + Codex 사이클 2)
- 신규 추가: warning/danger scale 토큰 (CSS + TS mirror), purchase-edit-* CSS 클래스, SlipUpdateService/Request/Controller/IT + Slip 도메인 INBOUND ordering

### 다음 후보 (SP-08-5-3 머지 후)

- SP-08-5-4 C1 검수 CTA 회귀 + InboundInspection 흐름 검증
- SP-08-5-5 P1 매입 인쇄 양식

## 2026-05-18 SP-08-5-2 머지 완료 — 매입 수정 direct PUT (참고 이력)

### 즉시 시작

```powershell
cd C:\dev\SamhanLogis
git checkout feat/sp-08-5-2-purchase-slip-edit-put
git status --short
```

### 현재 기준

- 기준 branch: `main`
- 기준 commit: `0d621b36`
- master plan: `docs/planning/2026-05-17_sp-08-5-purchase-slip-crud-parity.md` §3.2
- 사용자 6/7회차 정책: PR 내 모든 문제 해결, PM 자동 머지 후 다음 슬라이스 자동 진입. 단 현 세션은 사용자 지시에 따라 commit까지만 수행하고 push는 Claude가 처리한다.

### SP-08-5-2 범위

- BE: `PUT /api/v1/slips/{id}` direct edit endpoint. gateway strip 기준 controller path는 `/slips/{id}`.
- 대상: `Slip(type=INBOUND)` 매입 전표만 수정 가능.
- 권한: `WAREHOUSE / MANAGER / MASTER`; `INVENTORY / SALES / ACCOUNTANT`는 403.
- 낙관적 잠금: request `updatedAt`과 현재 `modifiedAt` 또는 `createdAt` fallback 비교. JPA `@Version`은 기존 `slips.version` 컬럼을 재사용한다.
- 라인 검증: 잘못된 라인은 422 `SLIP_UPDATE_INVALID_LINE`.
- 감사: direct PUT 성공 시 `SLIP_EDIT` audit revision 1건 기록.
- FE: 매입 상세 화면 수정 Modal, 409 “최신 내용 불러오기” 배너, audit timeline 확인.
- QA: `docs/qa/sp-08-5-2-purchase-slip-edit-put/screenshots/` 4장.

### 다음 후보

- SP-08-5-3 매입 soft delete + InboundInspection 정합.
- SP-08 회계/vendor OCR/Aligo 후속 parity.

## 2026-05-17 SP-08-5-1 Codex 진입 — 매입 목록·상세 endpoint 잠금

### 즉시 시작

```powershell
cd C:\dev\SamhanLogis
git checkout feat/sp-08-5-1-purchase-slip-list-detail
git status --short
```

### 현재 main HEAD

```
d5c3d573 [FEAT] SP-08-4-4 주문 인쇄 양식 endpoint + 인쇄 미리보기 UI (#219)
e065ed43 [FEAT] SP-08-4-3 주문 soft delete + 견적→주문 변환 endpoint (#218)
0ead89bd [FEAT] SP-08-4-2 주문 수정 direct PUT endpoint + optimistic lock (#217)
f8f2c447 [FEAT] SP-08-4-1 주문 목록·상세 endpoint 잠금 (#216)
```

### SP-08-4 시리즈 완료

| 슬라이스 | 상태 | PR | 머지 commit |
|---|---|---|---|
| SP-08-4-1 주문 목록·상세 | 완료 | #216 | `f8f2c447` |
| SP-08-4-2 주문 수정 direct PUT | 완료 | #217 | `0ead89bd` |
| SP-08-4-3 주문 soft delete + 견적→주문 변환 | 완료 | #218 | `e065ed43` |
| SP-08-4-4 주문 인쇄 양식 | 완료 | #219 | `d5c3d573` |

### SP-08-5 master plan

- 신규 plan: `docs/planning/2026-05-17_sp-08-5-purchase-slip-crud-parity.md`
- 매입 도메인: 별도 `PurchaseSlip` 없음. `slip-service` `Slip(type=INBOUND)` 사용.
- 입고 검수 도메인: `inventory-service` `InboundInspection`.
- SP-03 구매관리 검수 CTA 회귀 검증은 모든 SP-08-5 슬라이스 필수.

### SP-08-5-1 현재 범위

- R1 `GET /api/v1/slips?type=INBOUND&from=&to=&page=&size=` alias 보강.
- R2 `GET /api/v1/slips/{id}` INBOUND 상세에 `inspectionStatus` 보강.
- 권한: `WAREHOUSE / MANAGER / MASTER`; `INVENTORY` 제외.
- IT: `SlipQueryPurchaseIT` 5 case.
- 정적 계약: `clients/desktop/playwright/sp-08-5-1-purchase-slip-list-detail/`.
- QA PNG: `docs/qa/sp-08-5-1-purchase-slip-list-detail/screenshots/`.

### SP-08-4 후속 백로그

- SP-08-4-5 통합 리뷰는 PR #216~#219 누적 완료로 대체 가능하나, 필요 시 주문 CRUD 운영 QA만 별도 수행.
- FE-C2-01 `partnerCode` editability 정책.
- FE-C2-03 수정 후 목록 queryKey invalidate.
- DevOps D-1 `FixtureEstimateClient` `@Profile` Phase 11.
- DevOps D-2 `nextOrderNo` soft-delete row 제외 식별자 정책.
- QA-Nit-02 `resolveActorName` Javadoc.

---

## 2026-05-17 SP-08-4-3 머지 완료 (PR #218) + SP-08-4-4 자동 진입

### 즉시 시작 (회사 PC 첫 명령)

```powershell
cd C:\dev\SamhanLogis
git checkout main; git pull origin main
git checkout feat/sp-08-4-4-order-print-form 2>$null
# 또는 main 에서 다시 시작 시:
# git checkout -b feat/sp-08-4-4-order-print-form
```

**PM 자동 진입 정책** (사용자 명시 2026-05-17): 명령 없이 다음 슬라이스 SP-08-4-4 자동 시작. blocker/UNSTABLE 시만 사용자 대기.

### 현재 main HEAD (2026-05-17 누적)

```
e065ed43 [FEAT] SP-08-4-3 주문 soft delete + 견적→주문 변환 endpoint (#218)
0ead89bd [FEAT] SP-08-4-2 주문 수정 direct PUT endpoint + optimistic lock (#217)
f8f2c447 [FEAT] SP-08-4-1 주문 목록·상세 endpoint 잠금 (#216)
601f1891 [FEAT] SP-08-3-4 배차문자 preview+send+audit 저장내역 (#215)
e165ce24 [FEAT] SP-08-3-3 전표정리 저장내역 2-Tab (#214)
ca5668fd [FEAT] SP-08-3-2 arologis 배차 저장내역 4 화면 일관 (#213)
fa5c7648 [FEAT] SP-08-3-1 배차 GAS parity 기반 잠금 (#212)
```

### SP-08-4 마스터 plan 진행 (docs/planning/2026-05-17_sp-08-4-order-crud-parity.md)

| 슬라이스 | 상태 | PR | 머지 commit |
|---|---|---|---|
| SP-08-4-1 주문 목록·상세 | ✅ 완료 | #216 | `f8f2c447` |
| SP-08-4-2 주문 수정 direct PUT | ✅ 완료 | #217 | `0ead89bd` |
| SP-08-4-3 주문 soft delete + 견적→주문 변환 | ✅ 완료 | #218 | `e065ed43` |
| **SP-08-4-4 주문 인쇄 양식 (legacy GAS 100% 매칭)** | **▶ 진입 중** | TBD | TBD |
| SP-08-4-5 통합 PR + 5-team 리뷰 + 머지 | 대기 | TBD | TBD |

### 사용자 정책 누적 (1~5회차 + α)

| 회차 | 정정 내용 | 메모리 위치 |
|---|---|---|
| 1회차 | Claude 5 + Codex 5 양쪽 reviewer | `feedback_dual_5agent_review.md` |
| 2회차 | Codex CLI MCP (`mcp__codex__codex`) 사용 (Plugin 폐기) | `feedback_codex_plugin_setup.md` |
| 3회차 | TM 통합 2 PR comment / 사이클 (5+5=10 별도 등록 폐기) | `feedback_dual_5agent_review.md` |
| 4회차 | **사이클 N=3 안 완료 의무** (사이클 4+ 진입 금지) | `feedback_dual_5agent_review.md` |
| 5회차 | **사이클 1회 = Claude review → Claude fix → Codex review → Codex fix** (양쪽 각자 fix, 사이클 N.5 통합 fix 폐기) | `feedback_dual_5agent_review.md` |
| α | **PM 자동 머지 + 자동 슬라이스 진입** (blocker/UNSTABLE 시만 대기) | `feedback_user_merge_authority.md` (원본 유지, 본 핸드오프에 정책 명시) |

### 환경 트랩 (반복 발생, 대응 패턴 확립)

| 트랩 | 원인 | 대응 |
|---|---|---|
| Codex sandbox `.git` ACL 차단 | `mcp__codex__codex` workspace-write 가 `.git/index.lock` 생성 거부 | Codex fix 적용만 → Claude 가 직접 `git add/commit/push` |
| Codex sandbox `spawn EPERM` | Playwright `npx`, `electron-vite` build, Node `spawnSync` 차단 | Codex spec 수정만 → CI Linux 검증 위임 |
| PNG 한글 깨짐 (System.Drawing) | PowerShell `Malgun Gothic` GDI+ fallback 실패 | PowerShell unicode escape 방식 + System.Drawing |
| Korean path JDK gradle test | JDK 17 한글 path 실행 trap | Codex sandbox: `GRADLE_USER_HOME=C:\dev\SamhanLogis\.gradle-codex` 대체 |
| `main` 직접 push 차단 | auto mode classifier | 항상 PR 워크플로우 — chore/memory 도 별도 branch + PR |

### 양쪽 review 워크플로우 (사이클 1회 표준 — 5회차 정정 후)

```
1a. Claude 5 subagent 병렬 review (BE/FE/Designer/QA/DevOps)
1b. tech-manager agent 통합 → 1 PR comment (gh pr comment <num> --body-file tm-claude-cycle-N.md)
1c. Claude fix (자체 review + Codex 예상 valid 결함 선제) → commit + push
2a. Codex 5-agent 병렬 (mcp__codex__codex × 5, sandbox=read-only)
2b. tech-manager agent 통합 → 1 PR comment (tm-codex-cycle-N.md)
2c. Codex fix (자체 review + Claude valid 미처리 보완, mcp__codex__codex sandbox=workspace-write)
   → Claude 가 git add + commit + push (.git 차단 대응)
[사이클 N 종료 — 양쪽 0 P0/P1 + CI 24/24 SUCCESS 시 머지]
```

### 다음 슬라이스: SP-08-4-4 P1 주문 인쇄 양식

**범위** (master plan §3.4):
- `GET /api/v1/partner-orders/{id}/print` HTML 양식 (`@media print` CSS)
- legacy GAS `종합견적서` 출력 tab print layout 캡처 → mockup → Edge 캡처 → 3~5회 iteration (`feedback_print_design_iteration.md`)
- A4 한 장 fit, 거래처/품목/단가/합계/날인란
- Playwright + QA PNG (legacy raw vs 우리 양식 side-by-side) + dev-report

**진입 패턴**: codex CLI MCP `mcp__codex__codex` `sandbox: workspace-write` 위임 → 구현 → Claude 직접 `git add + commit + push` → PR 발행 → 사이클 1 review (Claude → Claude fix → Codex → Codex fix) N=3 안 머지.

### 후속 슬라이스 백로그 (SP-08-4 시리즈 누적)

- FE-C2-01 (BE `partnerCode` editability 정책)
- FE-C2-03 (수정 후 목록 queryKey invalidate)
- Codex FE mock coverage
- DevOps D-1 (`FixtureEstimateClient` `@Profile` Phase 11)
- DevOps D-2 (`nextOrderNo` soft-delete row 제외 식별자 정책)
- QA-Nit-02 (`resolveActorName` Javadoc)
- BE P3-2 (IT coverage 43 명시)

---

## 2026-05-17 Codex 진행 (이전 기록) — SP-08-4-3 주문 soft delete + 견적 주문 변환

- 현재 branch: `feat/sp-08-4-3-order-delete-and-estimate-convert`
- 기준 main HEAD: `0ead89bd [FEAT] SP-08-4-2 주문 수정 direct PUT endpoint + optimistic lock (#217)`
- 범위:
  - `DELETE /api/v1/partner-orders/{id}` soft delete endpoint.
  - `POST /api/v1/partner-orders/from-estimate/{estimateId}` endpoint.
  - `partner_orders.source_estimate_id` nullable + active unique.
  - desktop 주문 상세 `삭제` 버튼 + 확인 Modal.
  - Playwright static contract, QA PNG generator, dev-report/README/ROADMAP/DECISIONS/service README 동기화.
- 정책:
  - 삭제 가능 status는 `DRAFT / CONFIRMING`, `CONFIRMED` 이후는 422.
  - estimate-service 실제 client 부재로 `EstimateClient` port + 기본 empty fixture를 두고, IT는 `@MockBean` snapshot으로 검증.
- 다음 단계:
  - targeted IT, desktop typecheck/lint, Playwright static spec, QA PNG, `git diff --check` 실행.
  - 검증 후 한국어 conventional commit. push는 Claude PM이 처리.

---

## 2026-05-17 SP-08-4-2 머지 완료 (PR #217) + SP-08-4-3 진입

- **현재 main HEAD**: `0ead89bd [FEAT] SP-08-4-2 주문 수정 direct PUT endpoint + optimistic lock (#217)`
- **SP-08-4-2 완료**: 사이클 6.5 fix + 머지 (사용자 4회차 정정 후 본 PR 예외 — 다음 PR 부터 N=3 제한 엄격 적용)
- **메모리 정정 누적** (PR #217 진행 중 4회차):
  - Claude 5 + Codex 5 양쪽 reviewer (Plugin 1회 통합 폐기)
  - Codex CLI MCP `mcp__codex__codex` 사용 (Plugin 폐기)
  - TM 통합 2 PR comment / 사이클 (각자 5+5=10 별도 등록 폐기)
  - **사이클 N=3 안 완료 의무** (사이클 4+ 진입 금지)
- **다음 슬라이스 SP-08-4-3** (master plan `docs/planning/2026-05-17_sp-08-4-order-crud-parity.md` §3.3):
  - **D1**: `DELETE /api/v1/partner-orders/{id}` soft delete (deletedAt + deletedBy)
  - **C1**: `POST /api/v1/partner-orders/from-estimate/{estimateId}` 견적→주문 변환 정식 endpoint
  - SP-07 견적 source tab 정합 cross-check (Playwright 정적 계약)
- **진입 패턴**: codex CLI MCP workspace-write 자율 dispatch → push → Claude PM PR 발행 → 사이클 1/2/3 양쪽 review + TM 통합 → N=3 안 머지

---

## 2026-05-17 SP-08-3-4 머지 완료 + SP-08-3 시리즈 종료 + SP-08-4 진입 (이전 기록)

- **이전 main HEAD**: `601f1891 [FEAT] SP-08-3-4 배차문자 preview+send+audit 저장내역 (#215)`
- **SP-08-3 시리즈 4 슬라이스 완료**:
  - SP-08-3-1 기반 잠금 (PR #211/#212)
  - SP-08-3-2 arologis 4 화면 (PR #213, `ca5668fd`)
  - SP-08-3-3 slip 전표정리 (PR #214, `e165ce24`)
  - SP-08-3-4 notification SEND_AUDIT (PR #215, `601f1891`) — 사이클 5 (양쪽 0 결함)
- **Codex Plugin 영구 사용 패턴 확정** (commit `9365ec18` chore):
  - `~/.codex/config.toml` `[windows] sandbox = "unelevated"` 필수 (UAC trap 회피)
  - `gpt-5.5 + medium + read-only short prompt` 조합 → 2~3분 완료 (사이클 4/5 첫 plugin 성공)
  - `spark + medium + 복잡 prompt` → collaboration tool wait hang (사이클 3 회피)
  - `scripts/setup-codex-plugin.ps1` + `feedback_codex_plugin_setup.md` + `feedback_codex_model_auto_switch.md` (양 PC 셋업)
- **다음 슬라이스 후보** (SP-08 plan §5 미진행):
  - **SP-08-4** — 주문 CRUD parity (주문 목록/상세/수정/삭제/인쇄/견적→주문 변환 endpoint 잠금)
  - **SP-08-5** — 매입/사입 CRUD parity + SP-03 검수 CTA 회귀
  - **SP-08-6** — 매출/회계 CRUD parity (거래명세서/계산서/일마감/원장 인쇄 양식 GAS 1:1)
  - **SP-08-7** — Notion runtime 의존 zero 정적 잠금 (grep 가드 확장)
  - **SP-08-8** — 자격 평문 비공개 가드 강화
- **진입 패턴**: codex 자율 dispatch → PR 발행 → 사이클 N (Claude + Codex plugin gpt-5.5+medium) → 머지

---

## 2026-05-17 Codex 진행 — SP-08-4-2 Partner Order direct PUT endpoint

- 현재 branch: `feat/sp-08-4-2-partner-order-edit-put`
- 범위:
  - `partner-order-service` `PUT /api/v1/partner-orders/{id}` direct 수정 endpoint.
  - `PartnerOrderUpdateService`, `PartnerOrder.updateHeader`, `PartnerOrder.replaceLines`, `PartnerOrderUpdateRequest`.
  - `updatedAt` 낙관적 잠금 409, 라인 검증 422, audit log 1 revision 기록.
  - 기존 `PartnerOrderEditRequestController` request → approve/reject flow 유지.
  - desktop 주문 상세 수정 modal, 409 최신 내용 안내, audit timeline.
  - Playwright static contract, QA PNG 4장, dev-report, README/ROADMAP/DECISIONS 동기화.
- 로컬 검증:
  - Spring targeted: `PartnerOrderUpdateIT` 6 tests / 0 failed / 0 skipped.
  - desktop typecheck PASS.
  - desktop lint PASS, 기존 warning 2건.
  - QA PNG 4장 생성 PASS.
  - `git diff --check` PASS (CRLF warning only).
  - Codex Windows sandbox에서 Node `child_process.spawn` 자체가 EPERM이라 `npm run build`(electron-vite/esbuild)와 Playwright worker 실행은 환경 차단. `node -e spawnSync('cmd.exe')`도 EPERM으로 재현됨.
- 다음 단계:
  - branch push 후 Claude PM이 PR 생성 + CI/Linux에서 Playwright/build 확인.

---

## 2026-05-17 Codex 최신 핸드오프 — SP-08-3-4 배차문자 저장내역 구현 (✅ 머지 완료 - PR #215)

- 현재 branch: `feat/sp-08-3-4-dispatch-sms-history`
- 기준: PR #214 merge 후 `e165ce24`.
- 범위:
  - `notification-service` `dispatch_sms_save_history` entity/repository/service/controller/DTO/Flyway V4.
  - `/admin/notifications/dispatch-sms/history` POST/list/detail/latest 4 endpoint.
  - `SEND_AUDIT` append-only 저장 모드 추가. 미리보기는 `AUTO_LATEST`/`MANUAL_NAMED`, 실발송 감사는 `SEND_AUDIT`로 보존한다.
  - desktop 배차문자 화면 실행/저장내역 2탭, latest 자동 복원, 명시 저장, 이중 confirm 발송, 발송 후 audit 저장.
  - `clients/desktop/playwright/sp-08-3-4-dispatch-sms-history` static/mock contract.
  - QA mock PNG generator `scripts/generate-sp-08-3-4-dispatch-sms-history-screenshots.ps1`.
- 다음 단계:
  - 전체 backend/frontend/Playwright 회귀 검증.
  - QA PNG 생성, `git diff --check`, secret/UUID/Notion scan.
  - 한국어 conventional commit 분리 후 push. Claude PM이 PR 생성/CI/5-team cycle을 이어간다.

---

## 2026-05-17 Codex 최신 핸드오프 — SP-08-3-3 전표정리 저장내역 구현

- 현재 branch: `feat/sp-08-3-3-slip-cleanup-history`
- 기준: PR #213 merge 후 `ca5668fd`.
- 범위:
  - `slip-service` `slip_cleanup_save_history` entity/repository/service/controller/DTO/Flyway V25.
  - `/slips/cleanup/history` POST/list/detail/latest 4 endpoint.
  - `/sales/slip-cleanup` 실행/저장내역 2탭, latest 자동 복원, 명시 저장, row click 복원.
  - `clients/desktop/playwright/sp-08-3-3-slip-cleanup-history` static/mock contract.
  - QA mock PNG generator `scripts/generate-sp-08-3-3-slip-cleanup-history-screenshots.ps1`.
- 다음 단계:
  - 전체 frontend lint/build 및 Playwright 회귀.
  - QA PNG 생성, `git diff --check`, secret/UUID/Notion scan.
  - 한국어 conventional commit 분리 후 push.

---

## 2026-05-17 Codex 최신 핸드오프 — SP-08-3-2 아로로지스 배차 저장내역 구현

- 현재 branch: `feat/sp-08-3-2-arologis-dispatch-history`
- 기준: SP-08-3-1 이후 arologis 4 화면 history 실제 구현.
- 범위:
  - `arologis-service` `dispatch_save_history` entity/repository/service/controller/DTO/Flyway V12.
  - `/admin/arologis/dispatches/history` POST/list/detail/latest 4 endpoint.
  - `clients/arologis-desktop` 가배차 권역/지방가배차/미배차/운송사 비교 화면의 실행/저장내역 2탭, latest 자동 복원, 명시 저장, row click 복원.
  - `clients/desktop/playwright/sp-08-3-2-arologis-history` static/mock contract.
  - QA mock PNG generator `scripts/generate-sp-08-3-2-arologis-history-screenshots.ps1`.
- 다음 단계:
  - 전체 frontend lint/build 및 Playwright 회귀.
  - QA PNG 생성, `git diff --check`, secret/UUID/Notion scan.
  - 한국어 conventional commit 분리 후 push.

---

## 2026-05-16 Codex 최신 핸드오프 — SP-08-3-1 배차 legacy GAS parity 기반 잠금

- 현재 branch: `feat/sp-08-3-1-dispatch-parity-base`
- 기준 main: PR #211 merge commit `ce947fe8`.
- 첫 commit: `docs(sp-08-3-1): SP-08-3 배차 GAS parity 기획서`.
- 범위:
  - `docs/planning/2026-05-16_sp-08-3-dispatch-legacy-gas-parity.md`를 마스터 기획서로 커밋.
  - `clients/desktop/playwright/sp-08-3-dispatch-parity/sp-08-3-dispatch-parity.spec.ts`로 6 endpoint matrix, UUID literal zero, Notion runtime call zero, secret-like marker zero를 정적 계약화.
  - `scripts/generate-sp-08-3-dispatch-parity-screenshots.ps1`와 `docs/qa/sp-08-3-dispatch-parity/` QA 산출 추가.
  - `docs/dev-reports/sp-08-3-dispatch-legacy-gas-parity.md` 신규 작성.
  - README / ROADMAP / DECISIONS / SP-08 dev-report / 관련 service README 문서 동기화.
- 범위 밖:
  - SP-08-3-2~4의 Flyway table, controller, UI 2-Tab 실제 구현은 아직 하지 않는다.
  - Aligo 실 API 활성화 없음.
- 다음 단계:
  - 로컬 검증: SP-08-3 단독 Playwright, SP-08-3+SP-08-2+SP-08-1+full-menu 회귀, QA PNG, `git diff --check`, secret/runtime scan.
  - push 후 Claude PM이 PR 생성: `[FEAT] SP-08-3-1 배차 GAS parity 기반 잠금`.

> 갱신일: 2026-05-19 (MIG-1 PoC PR #262 발행, **Codex CLI 5-team review 사이클 인계**)
> 갱신자: PM (Claude Opus 4.7) → 다음 진행 도구 = **OpenAI Codex CLI** (사용자 결정, 토큰 한도 사유 + 5-team review 사이클 의무)
> 사용법: 새 도구/세션 시작 시 본 파일 read → §0 + §A (Codex 다음 단계 — 5-team review) 순서
> 이전 핸드오프 (2026-05-16 SP-08-3-1, Codex 진행) 는 §2 이후 보존.

---

## A. 2026-05-19 Codex 다음 단계 — MIG-1 PoC 5-team Review 사이클

이 섹션이 아래의 과거 D-AX-11 / Phase F 기록보다 우선한다.

### 현재 상태

- 현재 브랜치: `feat/ecount-mig-1-partner-poc`
- 최신 commit: (본 commit 시점 기준 — `git log --oneline -5` 참조)
- PR: (push + gh pr create 후 URL 갱신)
- 상태: BE 작업 완료 + 단위 테스트 PASS + 실 CSV 7,748 lines 적재 검증 PASS + 멱등 PASS. **5-team review 사이클 대기**.

### 산출 (Claude Code 본 세션)

- **spec**: `docs/superpowers/specs/2026-05-19-ecount-mig-1-partner-design.md` (D-MIG-1-01~15)
- **plan**: `docs/superpowers/plans/2026-05-19-ecount-mig-1-partner.md`
- **Flyway 신규**: V9 (3컬럼 + staging) / V10 (NOT NULL/default 제거 — 사용자 요청 "DB 형태 이카운트 정렬") / V11 (VARCHAR length 확장)
- **신규 코드**: `EcountPartnerImporter` (OpenCSV + BOMInputStream + NamedParameterJdbcTemplate 멱등 UPSERT) + `EcountPartnerImportController` (`POST /admin/partners/imports/ecount`) + `EcountPartnerImportResult` DTO
- **Partner.java 변경**: 3 신규 필드 (transferInfo/note/managerName) + 8 잉여 필드 Java-level default 제거 + 5 컬럼 length 확장
- **단위 테스트**: `EcountPartnerImporterTest` 12건 PASS
- **DECISIONS**: D-MIG-1-00 entry 추가 (15 결정)
- **dev-report**: `docs/dev-reports/ecount-mig-1-partner.md` (3-layer)
- **QA 시나리오**: `docs/qa/ecount-mig-1-partner/scenarios.md` (7 시나리오 + 검증 SQL 7건)

### 실 적재 결과 (검증 완료)

- partner-service bootRun → V9/V10/V11 Flyway 자동 적용
- POST `/admin/partners/imports/ecount` (multipart, X-User-Id + X-User-Role=MASTER)
- **1차**: 6,977 row → imported 6,719 + updated 245 + reject 1 + skipped 12 (49.5s)
- **2차 (멱등)**: imported 0 + updated 6,964 + sourceFileHash 동일 — **멱등성 PASS**

### Codex CLI 다음 단계 — 5-team Review (의무)

사용자 명시: **"반드시 클로드 코덱스 한 사이클로 PR 리뷰 진행. 기존 워크플로우로 진행할 것"**.

본 작업의 기존 워크플로우 = [feedback_multi_agent_team_pattern] + [feedback_tm_led_agent_discussion] + [feedback_pr_review_workflow]:

1. **5-team reviewer agent dispatch** — BE/FE/Designer/DevOps 4 parallel + QA sequential
2. 각 reviewer agent 가 PR 본문 또는 PR comment 에 review 작성
3. TM (Codex 가 본 역할) 종합 → fix commit
4. CI green 까지 watch
5. 사용자 (개발책임자) 머지 trigger

본 작업의 5-team scope:
- **BE reviewer**: Importer 로직 정합성 + 멱등성 + Flyway 영향 + 단위 테스트 충분성
- **FE reviewer**: "변경 없음" (BE-only PoC) — review pass
- **Designer reviewer**: "변경 없음" (UI 0) — review pass
- **DevOps reviewer**: "변경 없음" (env/infra 0) — review pass. 단 Phase 11 migration runbook 영향 검토
- **QA reviewer (sequential, BE/FE/Designer 후)**: 7 시나리오 + 검증 SQL + 실 적재 cross-check + 회귀 (PartnerServiceTest / PartnerBlockImportServiceTest)

### 사용자 확정 대기 항목 (Codex 진행 전 검토)

- **placeholder 정규식** — 12 SKIPPED 중 7건 (`01`/`1123`/`1212`/`7002`/`7006`/`7251` 등) 정상 거래처 가능성. 본 PR 머지 또는 별도 후속 PR (MIG-1A-fix-placeholder) 로 정정.
- **V10 잉여 컬럼 DROP** — 본 PR 은 NULLable 화 만. 완전 DROP 는 후속 PR (partner-cleanup) 별도 분기.

### Codex 첫 명령

```powershell
git checkout feat/ecount-mig-1-partner-poc
git pull
git log --oneline -3
Get-Content docs/superpowers/specs/2026-05-19-ecount-mig-1-partner-design.md, docs/superpowers/plans/2026-05-19-ecount-mig-1-partner.md, docs/dev-reports/ecount-mig-1-partner.md, docs/qa/ecount-mig-1-partner/scenarios.md -Encoding UTF8
```

### Codex MCP 활성화 (회사 PC 회고용)

본 repo 의 표준 Codex 호출 = `mcp__codex__codex` MCP tool ([feedback_codex_plugin_setup.md], Plugin 폐기 2026-05-17). 회사 PC 에서 처음 사용 시 [docs/dev-environment/codex-mcp-setup.md](../dev-environment/codex-mcp-setup.md) 의 단계별 가이드 (Node 18 → `npm i -g @openai/codex` → `.mcp.json` 등록 → `claude mcp list` 검증) 1회 셋업.

### MIG-2 (품목) 진행 시 의무 규칙 (사용자 명시 2026-05-19)

- **이카운트 품목 신원 규칙** — 품목코드 ≠ 품목명 + 동일 품목명을 가진 다른 row 가 있으면 같은 품목 (품목관계 매핑). MIG-2 staging.ecount_item_raw + staging.ecount_item_relation_raw join 으로 deduplicate 의무. 상세: [.claude/memory/project_ecount_product_identity_rule.md](../../.claude/memory/project_ecount_product_identity_rule.md)
- 입력 파일: `docs/migration/ecount-data/raw/품목-Excel다운로드.csv` + `품목관계-Excel다운로드.csv`

### MIG-1 PoC 산출 데이터 = 추후 테스트 데이터 (사용자 명시 2026-05-19)

본 PR 머지 후 partner_db 의 6,977 거래처 row + staging.ecount_partner_raw 는 **dev/test 환경 시드 데이터** 로 활용 가능. PartnerSeeder 의 P0_6 6건 외 추가 운영급 데이터셋 확보.

---

## 2026-05-16 Codex 최신 핸드오프 — SP-08-2 DPS legacy GAS DB/API parity

- 현재 branch: `codex/sp-08-2-dps-legacy-gas-parity`
- 기준 main: PR #210 merge 후 `af67edde`.
- Claude PM 산출:
  - `docs/planning/2026-05-16_sp-08-2-dps-legacy-gas-parity.md`가 단일 구현 source of truth.
  - 첫 commit `2cdc007f`가 해당 기획서와 Claude brainstorming visual companion용 `.superpowers/` gitignore를 함께 묶었다.
- SP-08-2 구현:
  - `inventory-service`에 `DpsSaveHistory` entity/repository/service/controller/DTO와 Flyway `V11__add_dps_save_history.sql`을 추가했다.
  - `POST /warehouse/audit/dps-history`, list/detail/latest API를 `WAREHOUSE / MANAGER / MASTER` 권한으로 제공한다.
  - `AUTO_LATEST`는 사용자+프로그램별 active 1건만 유지하고 이전 자동 저장 row는 BaseEntity soft-delete 처리한다.
  - `MANUAL_NAMED`는 topic 필수 append-only 저장내역으로 보존한다.
  - desktop `/warehouse/dps-compare`, `/warehouse/dps-compare/by-product`에 `실행 / 저장내역` 2탭, latest 자동 복원 배너, 명시 저장 dialog, row click 복원 UX를 연결했다.
  - `data-testid`는 `dps-history-row-{i}` 등 row index/업무 문구 기반이며 사용자 화면에 UUID를 노출하지 않는다.
  - QA mock PNG generator는 `scripts/generate-sp-08-2-dps-history-screenshots.ps1`, 산출 위치는 `docs/qa/sp-08-2-dps-history/screenshots/`.
- 로컬 검증:
  - `.\gradlew.bat :services:inventory-service:test --tests "*DpsSaveHistory*" --tests "*DpsCompare*" --tests "*DpsByProduct*" --no-daemon --rerun-tasks` PASS — XML 집계 36 tests / skipped 0.
  - `clients/desktop` `npm run typecheck`, `npm run lint`, `npm run build` PASS — lint 기존 warning 2건, error 0.
  - `npx playwright test playwright/sp-08-2-dps-history/sp-08-2-dps-history.spec.ts playwright/sp-08-legacy-gas-db-api-parity playwright/dps-by-product playwright/full-menu-contract --reporter=line` PASS — 29 passed / skipped 0 (`VITE_MOCK_MODE=1`, renderer Vite config, port 5185).
  - `.\scripts\generate-sp-08-2-dps-history-screenshots.ps1` PASS — 7 PNG / non-zero.
  - `git diff --check` PASS — CRLF 안내 warning만 출력.
  - secret-like artifact scan / 신규 FE UUID regex scan / Notion runtime call scan PASS — 0 matches.
- 다음 SP-08 후속 후보:
  - 배차 GAS(가배차/미배차/배차문자/운송사 비교) 저장/복원/preview/send parity.
  - 회계 출력(원장/거래명세서/내일자 전표) `MOCK_DATA` 제거.
  - vendor OCR 2종 UI parity, 알리고 dry-run sync parity.

## 2026-05-16 Codex 핸드오프 — SP-08 legacy GAS DB/API parity

- 현재 branch: `codex/sp-08-legacy-gas-db-api-parity`
- 직전 완료: PR #209 `[codex] SP-07 Google Sheets 견적 주문 원본 계약 정렬` merge commit `1b545a7c`.
- 사용자 최신 확정:
  - 나머지 GAS 코드도 UI와 기능은 기존 그대로 유지한다.
  - Notion 통신/외부 live source만 Samhan Public DB/API로 바꾼다.
  - Notion 데이터는 runtime 조회처가 아니며, 우리 DB로 이관된 뒤 그 DB/API에서 CRUD한다.
- SP-08-1 진행:
  - Claude Code workflow 1단계로 `docs/planning/2026-05-16_legacy-gas-db-api-parity.md` 작성.
  - 5-role 감사(BE/FE/Designer/DevOps/QA) 결과를 반영해 이번 기반 PR 범위를 확정.
  - `clients/desktop/playwright/sp-08-legacy-gas-db-api-parity/sp-08-legacy-gas-db-api-parity.spec.ts` 추가.
  - `estimate-app` 저장 confirm의 `노션에 저장` 사용자 문구를 `Samhan DB에 저장`으로 수정.
  - `order-app` `getOrderSnapshotHistory(safeBizNo, sDate, eDate)` 시그니처를 유지하되 `safeBizNo`는 client-side 호환 인자로만 소비하고 `/partner-orders/drafts?from=&to=` query params로 날짜만 전달.
  - `partner-order-service` draft list endpoint에 optional `from/to` 날짜 필터를 추가하고, 한쪽 범위는 sentinel date 없이 전용 repository method로 분기하며, 기존 caller 호환을 유지.
  - 단톡방/발송금지/배차지역/DC 관리 화면의 사용자 노출 import/source label을 `기존 운영 CSV`, `DB 이관 시드`, `원본 생성`으로 정렬.
  - `scripts/generate-sp-08-legacy-gas-db-api-parity-screenshots.mjs` 추가, QA PNG 11장 생성.
- 로컬 검증:
  - `npx playwright test playwright/sp-08-legacy-gas-db-api-parity/sp-08-legacy-gas-db-api-parity.spec.ts --reporter=line` PASS — 5 tests / skipped 0.
  - `.\gradlew.bat :services:partner-order-service:test --tests "*PartnerOrderDraftServiceIT" --no-daemon --rerun-tasks` PASS — 3 tests / skipped 0.
  - `clients/desktop` `npm run typecheck` PASS.
  - `clients/web/order-app` `npm ci && npm run typecheck` PASS.
  - `node scripts/generate-sp-08-legacy-gas-db-api-parity-screenshots.mjs` PASS — 11 PNG / non-zero.
- 남은 즉시 작업:
  - lint/build/full regression 실행.
  - secret/runtime Notion grep guard 및 `git diff --check`.
  - commit/push/PR 생성, PR 본문에 QA 캡처 11장 인라인 첨부.
  - CI green 확인 후 PM 재점검/merge/branch cleanup.
- 다음 SP-08 후속 후보:
  - DPS 저장내역/품목 pivot DB history/state parity.
  - 배차 GAS(가배차/미배차/배차문자/운송사 비교) 저장/복원/preview/send parity.
  - 회계 출력(원장/거래명세서/내일자 전표) `MOCK_DATA` 제거.
  - vendor OCR 2종 UI parity, 알리고 dry-run sync parity.

- 현재 branch: `codex/sp-07-google-sheets-quote-order-e2e`
- 직전 완료: PR #208 `[codex] SP-06 legacy GAS/Notion DB 이관 정합성` merge commit `e413d82e`.
- 사용자 최신 정정:
  - Notion은 runtime source가 아니라 우리 DB로 이관해야 한다.
  - 모든 Notion 관련 통신/CRUD는 Samhan Public DB/API로 전환한다.
  - 종합견적서/주문서는 Google Spreadsheet 데이터를 그대로 가져오는지 재검증한다.
  - 나머지 GAS 코드는 UI와 기능을 그대로 유지하고, Notion 통신만 DB/API로 바꾼다.
- SP-07 진행:
  - Google Drive connector로 `종합 견적서` spreadsheet (`1RJqO3jT-yJTi3NDBhL60o_cZWlVETGTU7UlvIKXuVNQ`) metadata와 safe ranges를 live 확인했다.
  - 27개 tab inventory를 문서화하고, `홈멀티_단가인상`, `싱글 세트_단가인상`, `상업멀티 구성_단가인상` 등 source tab과 `종합견적서`/`전표업로드목록` output form, credential-bearing `전표생성폼`을 분리했다.
  - `partner-order-service` bootstrap `range-map`에서 존재하지 않는 `설정!A1:Z` config read를 제거했다. 거래처 발송 주문서 GAS처럼 base payload + `*_단가인상` helper map을 prefetch하고, config는 V2 seed fallback + DC secret strip만 사용한다.
  - `product-service`는 `*_단가인상`을 ProductMaster 기본 단가로 저장하고 base tab은 `PriceHistory` 인상 전 단가로 보존한다.
  - 새 `priceBasis` UI/API 옵션은 만들지 않는다. legacy UI 기능은 그대로 유지한다.
  - `clients/desktop/playwright/sp-07-google-sheets-source/sp-07-google-sheets-source.spec.ts`를 추가해 range-map, catalog lookup, product DB sync, 문서/secret guard 계약을 검증한다.
  - `docs/operational-validation/google-sheets-live-source-snapshot.md`, SP-07 spec/plan/dev-report, QA screenshot generator를 추가했다.
  - Claude Code workflow 1단계로 `docs/planning/2026-05-16_google-sheets-quote-order-e2e.md` 기획 문서를 생성했고, Codex가 최신 구현 계약과 대조해 bootstrap/catalog 역할 구분 문구를 보정했다.
  - QA 캡처 6장을 생성했고 01/06 원본 이미지를 직접 확인했다.
- 로컬 검증:
  - RED 확인: SP-07 static contract 문구 assertion 2건이 실제 문서/주석 표기와 달라 실패함을 확인했다.
  - GREEN 확인: `npx playwright test playwright/sp-07-google-sheets-source/sp-07-google-sheets-source.spec.ts --reporter=line` PASS — 7 tests / skipped 0.
  - 병행 계약: `npx playwright test playwright/sp-07-google-sheets-source/sp-07-google-sheets-source.spec.ts playwright/full-menu-contract/full-menu-contract.spec.ts --reporter=line` PASS — 18 tests / skipped 0.
  - backend targeted tests PASS: `BootstrapServiceTest` / `ProductCatalogLookupClientTest` / `VendorOrderServiceTest` / `VendorOrderControllerIT`, skipped 0.
  - backend targeted tests PASS: `ProductSheetSyncServiceIT` 9 tests, skipped 0.
  - `clients/desktop` typecheck/lint/build PASS. lint는 기존 warning 2건, error 0.
  - `git diff --check` PASS. CRLF 안내 warning만 출력.
- 남은 즉시 작업:
  - commit/push/PR 생성 후 CI watch, green이면 PM 재점검 후 merge/브랜치 정리.
- 다음 후보:
  - SP-08 권한/역할/UUID 비노출 전메뉴 회귀
  - 품목 마스터 7탭 UI
  - Service Account runtime 검증

## 2026-05-16 Codex 핸드오프 — SP-06 legacy GAS/Notion DB 이관 정합성

- branch: `codex/sp-06-legacy-gas-functional-parity`
- PR #208 merge 완료 — `[codex] SP-06 legacy GAS/Notion DB 이관 정합성`.
- 사용자 최신 정정:
  - Notion 데이터를 runtime source로 import해서 쓰는 것이 아니다.
  - Notion 원본 표는 우리 service-per-DB로 그대로 이관하고, 이후 모든 통신/CRUD는 Samhan Public DB 화면/API로 변경한다.
  - 삼한 퍼블릭에서는 단톡방/발송금지/배차지역/DC 이관 내역을 CRUD할 수 있어야 한다.
- SP-06 진행:
  - `clients/desktop/playwright/sp-06-notion-db-crud/sp-06-notion-db-crud.spec.ts`를 추가해 단톡방/발송금지/배차지역/DC가 각 service DB CRUD와 연결되는지 계약화했다.
  - api-gateway에 no-strip route를 추가했다: `notification-chat-rooms-v1`, `partner-blocks-v1`, `dc-config-admin-v1`, `partner-auth-public-v1`, `partner-auth-approvals-v1`.
  - `tools/operational-validation/import-notion-csv.ps1`를 “DB 이관” 스크립트로 정리하고 `SAMHAN_API_GATEWAY_PORT`/`SAMHAN_*_PORT` override 및 default+100 health fallback을 반영했다.
  - `tools/operational-validation/run-smoke-tests.ps1`가 health 단계에서 탐지한 실제 service port를 gateway/direct endpoint smoke에 재사용하도록 보정했다.
  - `/admin/regions` 사용자-facing 라벨을 `배차지역 관리`로 정리했다.
  - `clients/web/order-app/index.html`에 남아 있던 Notion HTTP endpoint 문자열을 제거하고 legacy 함수명은 DB 로그 RPC(`google.script.run.logFrontEvent`)로 위임했다. `samhanApi.ts`는 legacy 4-인자와 migrated 2-인자 로그 호출을 모두 정규화한다.
  - `partner-auth-service`에 gateway `X-User-*` header auth를 추가해 `partner-approvals` no-strip route가 downstream에서 인증되도록 보정했다.
  - 운영 검증 SQL의 실제 테이블명과 soft-delete active count 조건을 정정했다.
- 로컬 검증:
  - RED 확인: smoke port 계약과 배차지역 관리 라벨 계약, order-app Notion HTTP endpoint 계약이 각각 기존 코드에서 실패함을 확인했다.
  - GREEN 확인: `npx playwright test playwright/sp-06-notion-db-crud/sp-06-notion-db-crud.spec.ts --reporter=line` PASS — 10 tests / skipped 0.
  - 병행 계약: `npx playwright test playwright/sp-06-notion-db-crud/sp-06-notion-db-crud.spec.ts playwright/full-menu-contract/full-menu-contract.spec.ts --reporter=line` PASS — 21 tests / skipped 0.
  - `clients/desktop` typecheck/lint/build PASS. lint는 기존 warning 2건, error 0.
  - backend targeted tests PASS: `PartnerBlock*`, `ChatRoom*`, `Region*`, `DcConfig*`, `partner-auth-service:test`, `api-gateway:test`.
  - Docker/local full stack PASS: `start-local-full.ps1 -SkipDocker` service health UP 15/15.
  - DB 이관 PASS: REGION 20 / DC 213 processed (unique active 210) / CHAT 112 / BLOCK 6, rejected 0.
  - Smoke PASS: service health UP 15/15, endpoint smoke OK 7/7.
  - QA 캡처 9장 생성 및 non-zero 확인 완료.
- 완료:
  - 커밋/push/PR #208 생성, CI green 확인, PM 재점검 후 merge 및 브랜치 정리 완료.
- 다음 후보:
  - SP-07 Google Sheets 견적/주문 E2E
  - SP-08 권한/역할/UUID 비노출 전메뉴 회귀
  - 품목 마스터 7탭 UI

## 2026-05-16 Codex 핸드오프 — SP-05 Samhan Public CRUD 표면 재점검

- branch: `codex/sp-05-samhan-public-crud-audit`
- PR #207 merge 완료 — `[codex] SP-05 Samhan Public CRUD 표면 재점검`.
- 판매관리/구매관리 목록에서 공개 업무번호 기반 `상세` 버튼을 추가하고 `/sales/:id`, `/purchases/:id` 상세 화면으로 명시 진입하게 했다.
- 구매관리 상세 버튼은 기존 `검수` CTA와 공존한다.
- 상세 버튼의 `data-testid`와 aria label은 내부 UUID가 아니라 공개 업무번호(`slipNo`, `YYYY/MM/DD-{순번}`) 기반이다.
- `frontend-feature-inventory.md`, `missing-features-catalog.md`에 2026-05-16 SP-05 현재 상태 블록을 추가했다. 거래처 기본 UI와 구매관리 검수 CTA는 더 이상 “UI 부재”로 표기하지 않는다.
- 검증: SP-05 QA 캡처 8장, desktop typecheck/lint/build, static Playwright contract, Vite mock UI Playwright 완료.

## 2026-05-16 Codex 핸드오프 — SP-04 Samhan Public 전메뉴/legacy GAS/노션 이식 감사

- branch: `codex/sp-04-full-menu-audit`
- 기준 main: PR #205 `[codex] SP-03 Samhan Public 구매관리 검수 CTA와 표시번호 정합화` merge.
- PR #206 merge 완료 — `[codex] SP-04 Samhan Public 전메뉴와 legacy GAS/노션 이식 감사`.
- 사용자 최신 요청:
  - 전메뉴를 전체 점검한다.
  - `/tools/legacy-gas` 안 기존 이카운트 + Google Apps Script 연동 프로그램이 기능 누락 없이 Samhan Public 으로 이식됐는지 확인한다.
  - Notion 단톡방리스트 / 발송금지리스트 / 배차지역 분류표를 참조하며, 해당 데이터를 모두 이식한다.
  - 기존 PR을 확인한다.
  - 종합견적서와 주문서는 Google Spreadsheet 데이터를 그대로 가져오는지 재검증한다.
- SP-04 구현/감사 진행:
  - 기존 PR #115/#117/#118/#119/#120/#163을 legacy GAS/Notion migration 근거로 대조했다.
  - Notion database schema 확인:
    - 단톡방리스트: `이카운트 사업자명`, `카톡방`, `생성 일시`
    - 발송금지리스트: `이카운트 사업자명`, `생성 일시`
    - 배차지역 분류표: `분류 그룹`, `검색어`
  - 로컬 CSV export 현재 row count 를 재검증했다: 배차지역 20 / 거래처 DC 213 / 단톡방 112 / 발송금지 6.
  - `tools/operational-validation/import-notion-csv.ps1` 의 hardcoded 기대 row count 를 제거하고 현재 CSV non-empty row 기준으로 검증하도록 정렬했다.
  - 현재 Notion 단톡방/발송금지 표가 `거래처코드` 없이 `이카운트 사업자명`만 갖는 것을 확인했다. legacy GAS 동작을 보존하기 위해 code-first import 후 lookup miss row 는 `LEGACY-NAME-{hash}` alias 로 저장하고, 내일자 전표/배차안내는 partner name fallback 으로 단톡방/발송금지를 적용하도록 보정했다.
  - DC import 는 로컬 `dc_config_db.partners` seed 가 비어 있어도 CSV `거래처코드`/`업체명`으로 최소 Partner snapshot 을 생성한 뒤 213 rows 를 이식할 수 있게 보정했다.
  - Google Sheets connector로 legacy spreadsheet `종합 견적서` metadata와 핵심 range를 재검증했다. `종합견적서!A1:H20`은 출력 양식이고, 실제 카탈로그 원본은 `홈멀티_단가인상`, `싱글 세트_단가인상`, `상업멀티 구성_단가인상` 등 source tab임을 확인했다.
  - `ProductSheetSyncService`는 tab별 column mapping으로 보정했다. `싱글 세트`/`싱글 구성품`은 C열 모델명, H열 납품가를 사용한다.
  - `ProductCatalogLookupClient`는 `종합견적서!A2:C` flat range 가정을 제거하고, 기존 vendor OCR UI/API를 바꾸지 않은 상태로 `_단가인상` source tab에서 modelCode 단가를 lookup한다. `INTEGRATED_QUOTE_RANGE`는 별도 flat catalog가 있을 때만 override한다.
  - 전메뉴 IA/권한을 보정했다: `/sales/new`, `/purchases/new`, `/transfers/new`, `/sales/link-dispatch`, admin-origin 시트/발송금지/단톡방/지역 화면 route guard.
  - `DISPATCH` 공통 role 을 추가하고 배차/지역 조회 전용 계약에 연결했다.
  - 견적번호/주문번호/재고이동/전표/배차번호를 공개 업무번호 `YYYY/MM/DD-{순번}` 표준으로 정렬 중이다. 판매전표와 구매전표처럼 메뉴/업무 타입이 다르면 같은 날짜 같은 순번을 가질 수 있다.
  - PR 캡처용 SP-04 스크린샷 생성 스크립트와 static Playwright contract 를 추가했다.
- 완료:
  - SP-04 screenshot 12장 생성 및 PR body commit-SHA raw URL 링크 검증 완료.
  - `clients/desktop` typecheck/lint/build + static Playwright contract 완료.
  - targeted Gradle/Google Sheets/import validation + Docker smoke 완료.
  - PR #206 merge 및 미사용 브랜치 정리 완료.

## 2026-05-16 Codex 핸드오프 — SP-03 Samhan Public 구매관리 검수 CTA + 관리형 메뉴/이동번호 정합화

- 현재 branch: `codex/sp-03-purchase-inspection-cta`
- 기준 main: PR #204 `codex/sp-02-samhan-public-ui-gap-audit` merge commit `871e2a10`
- 현재 PR: 생성 예정 — `[codex] SP-03 Samhan Public 구매관리 검수 CTA와 표시번호 정합화`
- 직전 완료:
  - SP-01 거래처 관리 메뉴 권한 정합화 PR #203 merge.
  - SP-02 회계 마감 메뉴 권한 정합화 PR #204 merge.
- 사용자 최신 결정:
  - 전표번호는 전역 unique 가 아니라 메뉴/업무 속성별 날짜 시퀀스다.
  - 판매전표 `YYYY/MM/DD-1` 과 구매전표 `YYYY/MM/DD-1` 은 서로 다른 메뉴값/속성이므로 중복 가능하다.
  - 이동번호/배차번호도 사용자 노출 업무번호로 보고 `YYYY/MM/DD-{순번}` 형식을 따른다.
  - `T-2026/05/04-1`, `TR-20260504-001` 같은 prefix/padding 표기는 정합성 위배이므로 화면/신규 생성/Flyway 정규화 대상이다.
  - UUID는 내부 PK이며 Samhan Public/아로로지스 화면에 표시하지 않는다.
- SP-03 구현:
  - `구매조회` 를 `구매관리` 로 정리하고, `WAREHOUSE / MANAGER / MASTER` 에게 SAVED/CONFIRMED 구매전표 입고 검수 CTA 를 노출한다.
  - 입고 검수 모달은 `InboundInspectionDialog` 를 재사용하고 성공 후 구매관리 목록을 refetch 한다.
  - inventory-service 입고 검수 API 는 gateway strip 후 경로와 직접 `/api/v1/...` 경로를 모두 수용한다.
  - 사이드바/하위 메뉴 표기를 관리형으로 정리했다: `판매관리`, `구매관리`, `재고이동 관리`, `창고 관리`, `견적서 관리`, `주문서 관리`.
  - 예외 메뉴 `주문서 승인`, `거래처 DC 설정` 은 기존 명칭을 유지한다.
  - `StockTransferService` 신규 이동번호를 `YYYY/MM/DD-{순번}` 으로 생성한다. 채번은 같은 날짜의 마지막 numeric suffix + 1이며, Flyway `V10__normalize_stock_transfer_numbers.sql` 로 기존 `T-`/`TR-` 이동번호를 정규화한다.
  - 구매/판매/이동 mock 데이터와 문서 예시는 UUID 대신 공개 업무번호만 표시한다.
- SP-03 로컬 검증:
  - QA 캡처 6장 생성 완료: `docs/qa/sp-03-purchase-inspection-cta/screenshots/01-warehouse-purchase-inspect-cta.png` ~ `06-business-number-uuid-hidden-matrix.png`.
  - QA 캡처 UUID/내부키 문자열 스캔 PASS.
  - Docker Desktop TCP daemon 확인 PASS (`DOCKER_HOST=tcp://localhost:2375`).
  - `clients/web/design-system` `npm run build` PASS.
  - `clients/desktop` Playwright static contract PASS — `6 passed / skipped 0`.
  - Docker/JDK inventory targeted tests PASS — `StockTransferServiceTest 13 tests / skipped 0`, `InboundInspectionControllerIT 10 tests / skipped 0`, `StockTransferControllerIT 5 tests / skipped 0`.
  - Docker/JDK slip targeted tests PASS — `SlipQueryRedesignIT 5 tests / skipped 0`, `SlipQueryRedesignSpecIT 5 tests / skipped 0`.
  - `clients/desktop` `npm run typecheck`, `npm run lint`, `npm run build` PASS. lint 는 기존 SP-03 범위 밖 warning 2건, error 0.
  - `git diff --check` PASS. CRLF 안내 warning 만 출력.
- 남은 즉시 작업:
  - commit/push/PR 생성.
  - PR 본문에 QA 캡처 6장을 raw URL 로 인라인 첨부.
  - `gh pr checks --watch` 후 PM 재점검/머지.
  - 머지 완료 후 병합된 `codex/*` 브랜치 정리.
- 다음 후보:
  - A: Samhan Public 추가 UI 누락 점검
  - B: comments/audit/SSE proxy 확장
  - C: 실제 기기 QA
  - D: Testcontainers no-skip hardening

## 2026-05-16 Codex 핸드오프 — D-AX-22 UUID 비노출 계약 hardening 완료

- branch: `codex/d-ax-22-uuid-free-contract-hardening`
- 직전 완료:
  - D-AX20 Admin 사진 감사/재업로드 후보 PR #200 merge, 원격 브랜치 삭제 완료.
  - D-AX21 업무번호 범위형 표준화 PR #201 merge, 원격 브랜치 삭제 완료.
- 사용자 최신 결정:
  - 전표번호는 전역 unique 가 아니라 메뉴/업무 속성별 날짜 시퀀스다.
  - 판매전표 `YYYY/MM/DD-1` 과 구매전표 `YYYY/MM/DD-1` 은 서로 다른 메뉴값/속성이므로 중복 가능하다.
  - UUID는 내부 PK이며 Samhan Public/아로로지스 화면에 표시하지 않는다.
- D-AX21 완료 요약:
  - `SlipNumberSequence`를 `slipDate + slipType` 단위로 확장.
  - Flyway `V24__business_number_scope.sql`: `slip_number_sequences.slip_type`, `UNIQUE(slip_date, slip_type)`, `ux_slips_slip_type_no_active`.
  - `DispatchTaskService` 배차번호를 `YYYY/MM/DD-{순번}` 으로 변경.
  - Docker/JDK `slip-service` + `arologis-service` 전체 테스트, 모바일 Jest/typecheck, 데스크톱 typecheck, actionlint PASS 후 PR #201 merge.
- D-AX22 구현:
  - slip-service full detail 의 `sourceWarehouseName` UUID 문자열화 fallback 제거.
  - arologis GPS 보고 응답에서 내부 위치 row key 제거.
  - arologis 서명 저장 응답과 sign-and-send-copy 성공 header/body 에서 서명 내부키 제거.
  - sign-and-send-copy 실패 JSON 은 운영 사유 코드만 공개하고 저장 경로/원본 URL/내부키를 숨김.
  - `clients/arologis-mobile` API normalize + Jest/typecheck 로 서버가 내부 필드를 내려도 UI 반환값에서 제거.
  - `clients/desktop` signature 계약 typecheck 추가.
- 문서/QA:
  - `docs/dev-reports/d-ax-22-uuid-free-contract-hardening.md`
  - `docs/qa/d-ax-22-uuid-free-contract-hardening/scenarios.md`
  - `docs/qa/d-ax-22-uuid-free-contract-hardening/domain-integrity-check.md`
  - `docs/team-reviews/d-ax-22/team-1-tm-integration-review.md`
  - QA 캡처 8장 생성 완료: `01-driver-today-target-contract.png` ~ `08-mobile-ui-uuid-free-regression-matrix.png`
- 현재 검증:
  - D-AX22 RED targeted test 실패 확인 후 production patch.
  - targeted backend Gradle PASS.
  - Docker/JDK `:services:slip-service:test :services:arologis-service:test` PASS.
  - XML 집계: `slip-service` 464 tests / failure 0 / error 0 / skipped 0.
  - XML 집계: `arologis-service` 236 tests / failure 0 / error 0 / skipped 0.
  - `clients/arologis-mobile` Jest PASS — 7 suites / 23 tests / skipped 0.
  - `clients/arologis-mobile` typecheck PASS, `npx expo install --check` PASS.
  - `clients/desktop` typecheck/lint/build PASS. lint 는 기존 warning 3건, error 0.
  - `git diff --check` PASS.
  - `actionlint` 는 로컬 PATH 에 없어 실행하지 못함. 이번 PR 은 workflow 파일 변경 없음.
- PR #202 merge 완료, 원격 브랜치 삭제 완료.
- 다음 후보:
  - A: comments/audit/SSE proxy 확장
  - B: 삼한 퍼블릭 거래처 생성/관리 UI gap 점검
  - C: 실제 기기 QA
  - D: Testcontainers no-skip hardening

## 2026-05-16 Codex 최신 핸드오프 — D-AX-20 Admin 사진 감사/재업로드 후보 완료

- branch: `codex/d-ax-20-arologis-admin-photo-audit`
- 직전 완료: D-AX-19 `clients/mobile-staff` 기사 모드 은퇴 PR #199 merge, 원격 브랜치 삭제 완료.
- 사용자 선택/운영 방식:
  - 추천안 1번 — Admin 사진 감사/재업로드 후보 화면.
  - 동시 agent 슬롯 제약상 1개 팀만 운영하고, Codex 가 부모 PM 으로 문서/PR/CI/머지/브랜치 정리까지 통합 관리.
  - 테스트는 skip 하지 않고, 필요한 테스트 환경을 구축해 통과 여부를 확인한다. Docker/Testcontainers 는 가능하면 로컬에서 실행하고, 로컬 접근 불가 시 CI 결과로 재점검한다.
- 새 도메인 정책:
  - UUID 는 내부 PK 이며 Samhan Public / 아로로지스 화면에 표시하지 않는다.
  - 전표/배차 등 사용자 노출 업무번호는 `YYYY/MM/DD-{순번}` 형식을 표준으로 삼는다.
  - 전표번호는 메뉴/업무 속성별로 독립 증가한다. 예: 판매전표 `YYYY/MM/DD-1` 과 구매전표 `YYYY/MM/DD-1` 은 중복 가능하며 UUID PK + 업무 유형으로 구분한다.
  - 날짜가 바뀌면 해당 날짜의 마지막 순번 이후로 증가하고, soft-delete/복구 이력은 UUID PK 와 audit 으로 보존한다.
  - D-AX20 신규 샘플/캡처는 위 형식으로 맞췄고, 기존 `001` padding / `S-2026-*` / `SL-*` 계열은 후속 업무번호 범위형 표준화 PR 후보로 남긴다.
- 구현:
  - BE `GET /slips/admin/photo-audit` 추가. gateway 외부 경로는 `/api/v1/slips/admin/photo-audit`.
  - `type/from/to/slipNo/page/size` 필터, `WAREHOUSE/MANAGER/MASTER` 권한, `uploadedAt desc`, size 최대 100.
  - `slip_attachments` + `slips` read-only JPQL join. 신규 DB/Flyway 없음.
  - 응답은 내부 `attachmentId`, `slipId`, `downloadUrl` 을 포함하지 않는다.
  - desktop `/admin/photo-audit` route + 창고 운영 sidebar `사진 감사` entry 추가.
  - FE 는 raw URL 없는 안전 placeholder 를 표시하고, `uploadedBy` 가 UUID 패턴이면 `업로더 확인 필요`로 치환한다.
  - 현재 페이지 내 `slipNo + attachmentType` 중복을 `재업로드 {count}회` badge 로 표시한다.
- 문서/QA:
  - `docs/dev-reports/d-ax-20-arologis-admin-photo-audit.md`
  - `docs/uiux/d-ax-20-arologis-admin-photo-audit/photo-audit-ux.md`
  - `docs/qa/d-ax-20-arologis-admin-photo-audit/scenarios.md`
  - `docs/qa/d-ax-20-arologis-admin-photo-audit/domain-integrity-check.md`
  - `docs/team-reviews/d-ax-20/team-1-tm-integration-review.md`
  - QA 캡처 7장: `01-scope-contract.png` ~ `07-pr-inline-capture-checklist.png`
- 검증:
  - D-AX20 screenshot generator PASS — PNG 7장 재생성, privacy guard PASS.
  - `clients/desktop` typecheck/lint/build PASS. lint 는 기존 warning 3건, error 0.
  - D-AX20 Playwright contract PASS — 3 tests, skip 없음.
  - Docker Desktop TCP daemon 확인 PASS (`DOCKER_HOST=tcp://localhost:2375`).
  - Docker/JDK Gradle `:services:slip-service:test --tests "*PhotoAudit*"` PASS.
  - Docker/JDK Gradle `:services:slip-service:test` PASS — 461 tests, failure 0, error 0, 기존 Testcontainers IT skip 171.
  - 5-agent 재검토 반영: 내부 audit rule id 캡처 제거, URL성 전표번호 입력 차단, MockMvc security role 테스트, repository JPQL/soft-delete projection 테스트 보강.
  - 기존 IT skip 171건은 D-AX20 신규 skip 이 아니라 Testcontainers provider 가 Docker Desktop TCP remote env 를 valid 로 판정하지 못하는 no-skip hardening 과제.
- 남은 즉시 작업:
  - commit/push/PR 생성.
  - PR 본문 raw screenshot URL 7장 HEAD 200 확인.
  - `gh pr checks --watch` 후 PM 재점검/머지.
- 다음 후보:
  - A: 전표/배차 표시번호 `YYYY/MM/DD-{순번}` 업무번호 범위형 표준화
  - B: 삼한 퍼블릭 거래처 생성/관리 UI gap 점검
  - C: 전표 상세 comments/audit/SSE proxy 확장
  - D: 실제 기기 QA

## 2026-05-16 Codex 최신 핸드오프 — D-AX-19 mobile-staff 기사 모드 은퇴 완료

- branch: `codex/d-ax-19-mobile-staff-driver-retirement`
- 직전 완료: D-AX-18 전표 상세 브리지 PR #198 merge, 원격 브랜치 삭제 완료.
- PR #199 merge 완료, 원격 브랜치 삭제 완료.
- 사용자 선택: 1번 추천안 — `clients/mobile-staff` 기사 모드 제거, 기사 기능은 `clients/arologis-mobile` 전담.
- 구현:
  - `AppRootNavigator` 를 `EstimateWebViewScreen` 단일 렌더로 축소.
  - `clients/mobile-staff/src/screens/driver/**`, `src/api/arologis.ts`, `src/hooks/useGpsPermission.ts`, 기사 전용 Jest 제거.
  - `attachmentApi`, `slipAudit`, `slipComment`, `slipEditRequest`, `SlipRealtimeClient` 는 `salesUtils.API_BASE_URL` 로 이동.
  - `base-64`, `@types/base-64`, `expo-file-system`, `expo-location`, `expo-sharing` 제거.
  - `app.config.js` 에서 위치 권한과 `expo-location` plugin 제거, 정적 `app.json` 삭제.
  - `expo-font` 는 SDK 53 기대 버전으로 정렬.
- 검증:
  - `cd clients/mobile-staff && npm run typecheck` PASS.
  - `cd clients/mobile-staff && npm test -- --runInBand` PASS (1 suite / 1 test).
  - `cd clients/mobile-staff && npx expo install --check` PASS.
  - `cd clients/mobile-staff && npx expo-doctor` PASS (17/17).
  - no driver runtime import guard PASS.
  - `.\scripts\generate-d-ax-19-mobile-staff-driver-retirement-screenshots.ps1` PASS.
- QA 캡처:
  - `docs/qa/d-ax-19-mobile-staff-driver-retirement/screenshots/01-retirement-decision.png`
  - `docs/qa/d-ax-19-mobile-staff-driver-retirement/screenshots/02-app-root-estimate-only.png`
  - `docs/qa/d-ax-19-mobile-staff-driver-retirement/screenshots/03-no-driver-toggle.png`
  - `docs/qa/d-ax-19-mobile-staff-driver-retirement/screenshots/04-code-boundary-import-guard.png`
  - `docs/qa/d-ax-19-mobile-staff-driver-retirement/screenshots/05-verification-matrix.png`
- 완료 메모:
  - 5-team 최종 리뷰: Designer/FE/BE/QA/DevOps blocker 없음.
  - PR 본문 raw screenshot URL HEAD 200 확인 후 PR #199 merge.
  - `gh pr checks --watch` 완료 후 PM 재점검/머지, 원격 브랜치 삭제 완료.
- 다음 후보:
  - A: Admin 사진 관리/재업로드 감사 화면
  - B: 전표 상세 comments/audit/SSE proxy 확장
  - C: 실제 기기 QA

## 2026-05-16 Codex 최신 핸드오프 — D-AX-18 arologis-mobile 전표 상세 브리지 진행

- 현재 branch: `codex/d-ax-18-arologis-mobile-slip-detail-bridge`
- 직전 완료: D-AX-17 배송사진/검수사진 PR #197 merge, 원격 브랜치 삭제 완료.
- 사용자 선택: 1번 — today 정차 target 기반 읽기 전용 전표 상세 bridge.
- 세부 선택:
  - 추천 1안 채택: `dispatchType + vehicleSequence + stopSequence + parsedKakaoSeq` 로 서버가 내부 dispatch/stop/slip UUID 를 해석.
  - `mobile-staff` 전표 상세 직접 import/복제는 하지 않음.
  - driver-facing API/UI 에 `id`, `dispatchId`, `vehicleId`, `stopId`, `slipId`, `downloadUrl` 을 노출하지 않음.
  - comments/audit/SSE proxy, 전표 편집 기능은 후속 선택지로 분리.
- 구현:
  - BE `GET /driver-app/arologis/dispatches/today/{dispatchType}/vehicles/{vehicleSeq}/stops/{stopSeq}/slip-detail` 추가.
  - BE `DriverSlipDetailResponse` 로 전표번호/거래처/주소/창고/품목/합계만 반환.
  - 400 target mismatch, 422 slip mapping 없음, 502 slip-service 상세 실패를 분리.
  - `clients/arologis-mobile` API `fetchStopSlipDetail(...)`, public type guard, dashboard `전표` 버튼, `DriverSlipDetailScreen` 추가.
  - QA 캡처 generator 8장 추가.
- 현재 검증:
  - `.\gradlew.bat :services:arologis-service:test --tests com.samhanair.logis.arologis.controller.ArologisDriverAppControllerTest --no-daemon --rerun-tasks` PASS.
  - `$env:DOCKER_HOST='tcp://localhost:2375'; .\gradlew.bat :services:arologis-service:test :services:slip-service:test --no-daemon --rerun-tasks` PASS.
  - `cd clients/arologis-mobile && npm run typecheck` PASS.
  - `cd clients/arologis-mobile && npm test -- DriverSlipDetailScreen.test.tsx arologisSlipDetail.test.ts --runInBand` PASS.
  - `cd clients/arologis-mobile && npx expo install --check` PASS.
  - `.\scripts\generate-d-ax-18-arologis-mobile-slip-detail-screenshots.ps1` PASS.
- 남은 즉시 작업:
  - PR 본문 raw screenshot URL HEAD 200 확인.
  - `gh pr checks --watch` 후 PM 재점검/머지.
- QA 캡처:
  - `docs/qa/d-ax-18-arologis-mobile-slip-detail-bridge/screenshots/01-slip-detail-target-contract.png`
  - `docs/qa/d-ax-18-arologis-mobile-slip-detail-bridge/screenshots/02-dashboard-slip-detail-button.png`
  - `docs/qa/d-ax-18-arologis-mobile-slip-detail-bridge/screenshots/03-slip-detail-empty-target-guard.png`
  - `docs/qa/d-ax-18-arologis-mobile-slip-detail-bridge/screenshots/04-slip-detail-header.png`
  - `docs/qa/d-ax-18-arologis-mobile-slip-detail-bridge/screenshots/05-slip-detail-lines-and-total.png`
  - `docs/qa/d-ax-18-arologis-mobile-slip-detail-bridge/screenshots/06-slip-detail-mapping-failure-422.png`
  - `docs/qa/d-ax-18-arologis-mobile-slip-detail-bridge/screenshots/07-slip-detail-fetch-failure-retry.png`
  - `docs/qa/d-ax-18-arologis-mobile-slip-detail-bridge/screenshots/08-verification-matrix.png`
- 다음 후보:
  - A: 실제 기기 QA 후 `mobile-staff` driver mode 제거
  - B: Admin 사진 관리/재업로드 감사 화면
  - C: 전표 상세 comments/audit/SSE proxy 확장

## 2026-05-15 Codex 최신 핸드오프 — D-AX-17 arologis-mobile 배송사진/검수사진 진행

- 현재 branch: `codex/d-ax-17-arologis-mobile-photos`
- 사용자 선택: 1번 — 인증된 today stop target 기반 DELIVERY / INSPECTION 사진 이식.
- 세부 선택:
  - 추천 1안 채택: `dispatchType + vehicleSequence + stopSequence + parsedKakaoSeq` 로 정차를 식별하고 서버 내부에서 slip attachment 로 연결.
  - `mobile-staff` public token/batchToken 흐름은 복제하지 않음.
  - driver-facing API/UI 에 UUID, internal attachment id, presigned/download URL 을 노출하지 않음.
- 구현:
  - BE `POST /driver-app/arologis/dispatches/today/{dispatchType}/vehicles/{vehicleSeq}/stops/{stopSeq}/photos/{photoType}` 추가.
  - BE `SlipClient.uploadAttachment(...)` internal multipart bridge 추가.
  - slip-service `/internal/slips/{slipId}/attachments` internal endpoint 추가, DELIVERY / INSPECTION 만 허용.
  - `clients/arologis-mobile` 사진 탭, dashboard `사진` 버튼, empty-target guard, DELIVERY 3장 / INSPECTION 5장 limit, 업로드 진행/성공/실패/재시도 UI 추가.
  - `expo-image-picker`, `expo-image-manipulator` 의존성 추가.
  - typecheck 계약 파일은 `StopPhotoUploadResponse` 에 `attachmentType/fileName/fileSize/contentType/capturedAt/uploadedAt` 만 공개하고 `id/downloadUrl` 은 `@ts-expect-error` 로 차단.
- 검증:
  - `.\gradlew.bat :services:arologis-service:compileJava :services:slip-service:compileJava --no-daemon` PASS.
  - `.\gradlew.bat :services:arologis-service:test --tests com.samhanair.logis.arologis.controller.ArologisDriverAppControllerTest --tests com.samhanair.logis.arologis.client.SlipClientTest --no-daemon --rerun-tasks` PASS.
  - `$env:DOCKER_HOST='tcp://localhost:2375'; .\gradlew.bat :services:arologis-service:test :services:slip-service:test --no-daemon --rerun-tasks` PASS.
  - `cd clients/arologis-mobile && npm run typecheck` PASS.
  - `cd clients/arologis-mobile && npm test -- DriverPhotoScreen.test.tsx arologisPhotoUpload.test.ts --runInBand` PASS.
  - `cd clients/arologis-mobile && npx expo install --check` PASS.
  - `.\scripts\generate-d-ax-17-arologis-mobile-photos-screenshots.ps1` PASS.
  - Docker actual run 중 드러난 기존 회귀도 함께 안정화: `KakaoDispatchParserTest` 시간 의존, `DispatchTaskRepositoryIT` seed 충돌, `SlipRealtimeControllerIT` shared realtime payload 계약.
- QA 캡처:
  - `docs/qa/d-ax-17-arologis-mobile-photos/screenshots/01-today-photo-target-contract.png`
  - `docs/qa/d-ax-17-arologis-mobile-photos/screenshots/02-dashboard-photo-and-signature-buttons.png`
  - `docs/qa/d-ax-17-arologis-mobile-photos/screenshots/03-photo-empty-target-guard.png`
  - `docs/qa/d-ax-17-arologis-mobile-photos/screenshots/04-delivery-photo-capture-preview.png`
  - `docs/qa/d-ax-17-arologis-mobile-photos/screenshots/05-inspection-type-switch-max-count.png`
  - `docs/qa/d-ax-17-arologis-mobile-photos/screenshots/06-upload-progress.png`
  - `docs/qa/d-ax-17-arologis-mobile-photos/screenshots/07-upload-success-uuid-free-response.png`
  - `docs/qa/d-ax-17-arologis-mobile-photos/screenshots/08-partial-failure-retry.png`
  - `docs/qa/d-ax-17-arologis-mobile-photos/screenshots/09-slip-mapping-failure-422.png`
  - `docs/qa/d-ax-17-arologis-mobile-photos/screenshots/10-verification-matrix.png`
- 다음 후보:
  - A: 실제 기기 QA 후 `mobile-staff` driver mode 제거
  - B: 아로로지스 모바일 상세/전표 bridge 확장
  - C: Admin 사진 관리/재업로드 감사 화면

## 2026-05-15 Codex 최신 핸드오프 — D-AX-16 arologis-mobile signature/sign-and-send-copy 진행

- 현재 branch: `codex/d-ax-16-arologis-mobile-signature-copy`
- 사용자 선택: 1번 — signature / sign-and-send-copy 아로로지스 모바일 이식.
- 세부 선택:
  - 추천 1안 채택: backend `today` 응답을 실제 서명 가능한 정차 target 까지 확장하고, 앱에서 정차 선택 후 `sign-and-send-copy` 호출.
  - `mobile-staff` 의 mock stop/all-zero UUID 방식은 복제하지 않음.
- 구현:
  - BE `GET /driver-app/arologis/dispatches/today` 응답에 `dispatchDate`, `dispatchType`, `label`, `stops[]` 추가. `dispatchId` UUID 는 제외.
  - `POST /driver-app/arologis/dispatches/today/{dispatchType}/vehicles/{vehicleSeq}/stops/{stopSeq}/sign-and-send-copy` 에서 today target 을 서버 내부 UUID 로 해석.
  - `clients/arologis-mobile` API에 `apiFetchRaw`, UUID-free `signAndSendCopy`, image/png → base64 변환 추가.
  - dashboard 카드에 정차 목록 + `서명` 버튼 추가.
  - `DriverSignatureScreen` 신규: 정차 target guard, 실제 signature canvas, 기사 서명 GPS, 인수자 서명, 1-tap 완료 + 사본 발송, duplicate/bridge/fail toast, retry.
  - 하단 tab: `배차` / `GPS` / `서명` + 로그아웃.
- 검증:
  - RED: `ArologisDriverAppControllerTest` 가 `stops` 누락 및 today UUID-free 계약 위반으로 실패 확인.
  - `.\gradlew.bat :services:arologis-service:test --tests com.samhanair.logis.arologis.controller.ArologisDriverAppControllerTest` PASS.
  - `ArologisDriverAppControllerIT.today_with_internal_driver_returns_200` 는 어제/내일 배정 제외 + `dispatchId` 비노출 계약으로 보강.
  - Docker/Testcontainers actual run: `$env:DOCKER_HOST='tcp://localhost:2375'; .\gradlew.bat :services:arologis-service:test --no-daemon --rerun-tasks` PASS (225 tests).
  - Docker actual run에서 드러난 latent failure 수정: auth/driver/refresh seed 충돌, Tx1 rollback 프록시 경계, renderer timeout 재시도 stub, explicit-cleanup IT 트랜잭션 격리.
  - RED: `clients/arologis-mobile/src/__tests__/types/signatureContract.test-d.ts` 추가 후 `signAndSendCopy` / `stops` 타입 누락으로 실패 확인.
  - `cd clients/arologis-mobile && npm run typecheck` PASS.
  - `cd clients/arologis-mobile && npm test -- DriverSignatureScreen.test.tsx --runInBand` PASS (6 tests).
  - `cd clients/arologis-mobile && npx expo install --check` PASS.
  - `.\scripts\generate-d-ax-16-arologis-mobile-signature-copy-screenshots.ps1` PASS.
- QA 캡처:
  - `docs/qa/d-ax-16-arologis-mobile-signature-copy/screenshots/01-today-contract-with-stops.png`
  - `docs/qa/d-ax-16-arologis-mobile-signature-copy/screenshots/02-dashboard-stop-list.png`
  - `docs/qa/d-ax-16-arologis-mobile-signature-copy/screenshots/03-signature-empty-target.png`
  - `docs/qa/d-ax-16-arologis-mobile-signature-copy/screenshots/04-signature-selected-stop.png`
  - `docs/qa/d-ax-16-arologis-mobile-signature-copy/screenshots/05-driver-signature-gps-captured.png`
  - `docs/qa/d-ax-16-arologis-mobile-signature-copy/screenshots/06-recipient-signature-ready.png`
  - `docs/qa/d-ax-16-arologis-mobile-signature-copy/screenshots/07-success-share-sheet.png`
  - `docs/qa/d-ax-16-arologis-mobile-signature-copy/screenshots/08-recipient-phone-missing.png`
  - `docs/qa/d-ax-16-arologis-mobile-signature-copy/screenshots/09-renderer-timeout-retry.png`
  - `docs/qa/d-ax-16-arologis-mobile-signature-copy/screenshots/10-verification-matrix.png`
- 다음 후보:
  - A: 배송사진 / 검수사진 이식
  - B: 실제 기기 QA 후 `mobile-staff` driver mode 제거
  - C: signature canvas 실 의존성 도입 여부 결정

## 2026-05-15 Codex 최신 핸드오프 — D-AX-13 auth contract 정합 진행

- 현재 branch: `codex/d-ax-13-auth-contract`
- 선택된 방향: 사용자 승인 1번 — `/auth/me`와 login/refresh 응답의 공개 식별자 계약을 BE/FE에서 한 번에 정합.
- 구현:
  - BE `AuthTokenResponse`에 role별 공개 식별자(`loginId/fullName`, `driverCode/phoneNumber`) 추가.
  - BE `MeResponse`도 같은 공개 식별자 schema 로 확장.
  - `AuthIdentityService` 추가: JWT `X-User-Id`/`X-User-Role` 기준으로 DB row 재조회, role mismatch/user gone 은 401.
  - desktop `LoginPage`와 refresh interceptor 에서 `loginId/fullName` undefined 저장 방지.
  - mobile auth API와 refresh helper 에서 `driverCode/phoneNumber` 보존.
- 검증:
  - RED: 새 필드 테스트 추가 후 `compileTestJava`가 `loginId/fullName/driverCode/phoneNumber` method 없음으로 실패 확인.
  - `.\gradlew.bat :services:arologis-service:test --tests "com.samhanair.logis.arologis.service.auth.AdminLoginServiceTest" --tests "com.samhanair.logis.arologis.service.auth.DriverLoginServiceTest" --tests "com.samhanair.logis.arologis.service.auth.RefreshTokenServiceTest"` PASS
  - `.\gradlew.bat :services:arologis-service:test --tests "com.samhanair.logis.arologis.it.ArologisAdminAuthIT" --tests "com.samhanair.logis.arologis.it.ArologisDriverAuthIT"` PASS
  - `cd clients/arologis-desktop && npm run typecheck` PASS
  - `cd clients/arologis-mobile && npm run typecheck` PASS
- QA 캡처:
  - `docs/qa/d-ax-13-auth-contract/screenshots/01-contract-overview.png`
  - `docs/qa/d-ax-13-auth-contract/screenshots/02-admin-login-response.png`
  - `docs/qa/d-ax-13-auth-contract/screenshots/03-auth-me-admin.png`
  - `docs/qa/d-ax-13-auth-contract/screenshots/04-driver-login-response.png`
  - `docs/qa/d-ax-13-auth-contract/screenshots/05-auth-me-driver.png`
  - `docs/qa/d-ax-13-auth-contract/screenshots/06-refresh-rotation-identity.png`
  - `docs/qa/d-ax-13-auth-contract/screenshots/07-frontend-store-flow.png`
  - `docs/qa/d-ax-13-auth-contract/screenshots/08-verification-matrix.png`
- 다음 후보:
  - A: signature / sign-and-send-copy 이식
  - B: 배송사진 / 검수사진 이식
  - C: 실제 기기 QA 및 `mobile-staff` driver mode 제거

## 2026-05-15 Codex 최신 핸드오프 — D-AX-15 arologis-mobile dashboard/GPS 진행

- 현재 branch: `codex/d-ax-15-arologis-mobile-driver-runtime`
- 사용자 피드백: Claude처럼 진행 방향은 다자선택으로 제시하고, Codex가 멋대로 결정하지 않는다.
- 채택 방향: 추천안 B — `clients/arologis-mobile` 에 dashboard + GPS 두 탭만 먼저 이식.
- 구현:
  - 로그인 성공 후 `RootNavigator` 가 `DriverTabNavigator` 로 진입.
  - `DriverDashboardScreen` / `DriverLocationTrackingScreen` 을 독립 앱 내부로 이식.
  - `api/arologis.ts` 는 `GET /driver-app/arologis/dispatches/today`, `POST /driver-app/arologis/locations` 만 담당.
  - 서명 / 배송사진 / 검수사진 / mobile-staff driver 제거는 후속 PR 선택지로 남김.
- 검증:
  - `cd clients/arologis-mobile && npm install`
  - `cd clients/arologis-mobile && npm run typecheck`
  - `rg -n 'clients/mobile-staff|mobile-staff|../../../mobile-staff' clients/arologis-mobile/src` 결과 없음
  - `.\scripts\generate-d-ax-15-arologis-mobile-driver-runtime-screenshots.ps1`
- QA 캡처:
  - `docs/qa/d-ax-15-arologis-mobile-driver-runtime/screenshots/01-authenticated-driver-tabs.png`
  - `docs/qa/d-ax-15-arologis-mobile-driver-runtime/screenshots/02-driver-dashboard.png`
  - `docs/qa/d-ax-15-arologis-mobile-driver-runtime/screenshots/03-gps-tracking.png`
  - `docs/qa/d-ax-15-arologis-mobile-driver-runtime/screenshots/04-dashboard-empty.png`
  - `docs/qa/d-ax-15-arologis-mobile-driver-runtime/screenshots/05-dashboard-error.png`
  - `docs/qa/d-ax-15-arologis-mobile-driver-runtime/screenshots/06-gps-permission-block.png`
  - `docs/qa/d-ax-15-arologis-mobile-driver-runtime/screenshots/07-typecheck-pass.png`
  - `docs/qa/d-ax-15-arologis-mobile-driver-runtime/screenshots/08-import-boundary-pass.png`
- 다음 선택지:
  - A: signature / sign-and-send-copy 이식
  - B: 배송사진 / 검수사진 이식
  - C: `/auth/me` schema 정합 검증
  - D: 실기기 QA 후 `mobile-staff` driver mode 제거

## 2026-05-15 Codex 최신 핸드오프 — D-AX-12 mobile cross-import 분리 진행

- 현재 branch: `codex/d-ax-12-mobile-cross-import`
- 방향: D-AX-11 완료 후 같은 아로로지스 추출 흐름으로 `clients/mobile-staff` driver tab 의 Samhan Public slip 직접 import 를 먼저 제거.
- 구현:
  - `DriverTabNavigator` 의 `../SlipDetailScreen` import 제거.
  - `DriverSlipDetailEntry` 신규 경계 화면 추가.
  - dashboard → entry → back Jest 추가.
  - 기존 `SignaturePhotoScreenChain` mock 을 driver entry 로 교체.
- 검증:
  - `cd clients/mobile-staff && npm test -- DriverSlipDetailRoute.test.tsx --runInBand` PASS
  - `cd clients/mobile-staff && npm test -- SignaturePhotoScreenChain.test.tsx --runInBand` PASS
  - `cd clients/mobile-staff && npm run typecheck` PASS
  - `rg -n "from '../SlipDetailScreen'|SlipDetailScreen from|\\.\\./SlipDetailScreen" clients/mobile-staff/src/screens/driver` 결과 없음
  - `.\scripts\generate-d-ax-12-mobile-cross-import-screenshots.ps1` PASS
- QA 캡처:
  - PR 본문에 아래 8장을 모두 인라인 첨부한다. 캡처는 여러 테스트를 진행한 뒤 생성한 1000px 폭 PNG mock render 라서 GitHub 에서 문구와 버튼이 잘 보인다.
  - `docs/qa/d-ax-12-mobile-cross-import/screenshots/01-driver-slip-guard.png`
  - `docs/qa/d-ax-12-mobile-cross-import/screenshots/02-signature-chain-regression.png`
  - `docs/qa/d-ax-12-mobile-cross-import/screenshots/03-driver-route-test-flow.png`
  - `docs/qa/d-ax-12-mobile-cross-import/screenshots/04-driver-back-navigation.png`
  - `docs/qa/d-ax-12-mobile-cross-import/screenshots/05-typecheck-contract.png`
  - `docs/qa/d-ax-12-mobile-cross-import/screenshots/06-jest-driver-route-pass.png`
  - `docs/qa/d-ax-12-mobile-cross-import/screenshots/07-jest-signature-chain-pass.png`
  - `docs/qa/d-ax-12-mobile-cross-import/screenshots/08-direct-import-search-guard.png`
- 문서:
  - spec: `docs/superpowers/specs/2026-05-15-d-ax-12-mobile-cross-import-design.md`
  - dev report: `docs/dev-reports/d-ax-12-mobile-cross-import.md`
  - QA: `docs/qa/d-ax-12-mobile-cross-import/scenarios.md`
- 다음 후보:
  - `clients/arologis-mobile` 로 driver dashboard / GPS / signature / photo 화면 이식.
  - 실제 slip 연결값이 배차 응답에 포함되면 `DriverSlipDetailEntry` 를 아로로지스 전용 상세 bridge 로 확장.

## 2026-05-15 Codex 최신 핸드오프 — D-AX-11 PR #192 머지 완료

이 섹션이 아래의 과거 `D-AX-11 in progress` 기록보다 우선한다.

- 현재 브랜치: `main`
- 최신 main commit: `5599580 feat(arologis): D-AX-11 배차 페이지 데스크톱 이전`
- PR: https://github.com/ewoo14/SamhanLogis/pull/192
- 머지 커밋: `55995805d2922084c516f942d02f3cf1382a6407`
- 상태: D-AX-11 완료, PR #192 squash merge 완료, remote main 최신.
- 최종 CI: PR head `bfc5f7d` 기준 GitHub checks 전체 통과.
- QA: `qa/playwright`의 Chromium mock render로 한국어 화면 4장 캡처 완료.
- QA 산출물:
  - `docs/qa/arologis-dispatch-pages-extract/screenshots/01-manual-dispatch.png`
  - `docs/qa/arologis-dispatch-pages-extract/screenshots/02-pre-classify.png`
  - `docs/qa/arologis-dispatch-pages-extract/screenshots/03-unassigned.png`
  - `docs/qa/arologis-dispatch-pages-extract/screenshots/04-reconcile.png`
- PR 포함 항목: 5-team review 표, TM 통합, PM/CI 승인, QA 스크린샷, 리뷰 반영 내역.
- 별도 세션 기록: `docs/handoff/2026-05-15-codex-d-ax-11-session.md`
- dev report: `docs/dev-reports/arologis-dispatch-pages-extract.md`

다음 세션 첫 명령:

```powershell
git checkout main
git pull
git log --oneline -5
Get-Content AGENTS.md, docs/handoff/CURRENT-WORK.md, .codex/AGENTS.md -Encoding UTF8
```

다음 후보 작업은 새 결정을 만들기 전에 `migration/decisions/DECISIONS.md`와 해당 slice spec/plan을 먼저 확인한다. 사용자가 “그대로 진행”을 요청하면 Claude handoff 패턴대로 5-team review, PR 본문 QA 스크린샷, PM/CI 승인 코멘트를 포함한다.

## 2026-05-15 Codex Update — D-AX-11 in progress

- Current branch: `feat/arologis-dispatch-pages-extract`
- Current scope: Arologis desktop dispatch pages under `clients/arologis-desktop/src/renderer/routes/dispatches`
- Handoff pattern: 5-team review dispatched and received (BE / FE / Designer / QA / DevOps). Review fixes are being applied in this same branch.
- Implemented routes: `/dispatches/manual`, `/dispatches/pre-classify`, `/dispatches/unassigned`, `/dispatches/reconcile`
- Key fixes from review: `kakaoSeq` DTO alignment, Arologis role constants, design-system CSS import, raw hex cleanup, desktop CI typecheck hard-fail, D-AX-11 route IA note.
- Phone check: remote/PR viewing requires push/PR network access. Per owner instruction, no approval prompt will be requested for non-merge work; keep local handoff current until a permitted push path is available.

---

## 0. 즉시 시작 — 코덱스에서 첫 명령

```powershell
git checkout main
git pull
git log --oneline -5
# → 1ad4296 feat(samhan-signature-copy): Phase F (#191) 가 가장 최근 머지
```

**코덱스가 모르는 본 repo 의 핵심 컨벤션** (Claude Code `.claude/memory/` 가 있지만 코덱스는 못 읽음 — 아래만 알면 충분):

| 규칙 | 요점 |
|---|---|
| 한국어 commit/PR/Issue | prefix (`feat:`/`fix:`/...) + trailer 만 영어, 본문은 한국어 |
| 5-team 패턴 | BE/FE/Designer/DevOps **4 parallel** + QA **sequential** (실 산출 검증 + 실 캡처) |
| 통합 PR | 단편 PR 금지. 디자인/UI 차이까지 묶어 통합 PR + QA + TM 승인 |
| QA 스크린샷 | 모든 PR 본문에 QA 결과 스크린샷 1장 이상 인라인 (`docs/qa/<slug>/screenshots/*.png`) |
| QA mock fallback | 실 emulator 어려운 경우 PowerShell System.Drawing mock PNG OK (`scripts/generate-*-screenshots.ps1` 패턴) |
| UUID 비공개 | 모든 클라이언트 화면 UUID 노출 금지. 비즈니스 식별자 (슬립번호/창고 코드/거래처명) 만 |
| BaseEntity 7 audit | 모든 entity 가 `BaseEntity` 상속 + Soft Delete 만 |
| Korean Path JDK 트랩 | 한글 path 에서 `gradle test` fail. `assemble` 사용 또는 영문 path |
| gradlew chmod | Windows 커밋 시 `git update-index --chmod=+x gradlew` 필수 (Linux CI Permission denied 방지) |
| PowerShell UTF-8 | `Set-Content` 기본 UTF-16 LE BOM 트랩. Write/Edit/heredoc 사용 |
| 머지 권한 | 사용자 (개발책임자) 결정. 5-team 0 결함 + CI green 시도 사용자 trigger 만 머지 |

---

## 1. 방금 끝난 일 — Phase F (PR #191) 머지 완료 (2026-05-15)

**PR**: https://github.com/ewoo14/SamhanLogis/pull/191 — **MERGED** (squash commit `1ad4296`)
**제목**: `feat(samhan-signature-copy): Phase F — 전자서명 양쪽 저장 + 출고전표 사본 PNG 1회 발송 (D-DF-01~13)`

### 핵심 산출 (한 줄 요약)

기사 어플 정차 도착 → DELIVERY 사진 첨부 (기존 SignaturePhotoScreen) → DriverSignatureScreen 자체+인수자 서명 → arologis 가 양쪽 저장 (자체 signatures + slip-service signature_source=APP) + 서버 Playwright Chromium 으로 OutboundView 양식 사본 PNG 합성 + mobile expo-sharing Share Sheet 으로 인수자에게 발송 (**기사 본인 카톡, Aligo 0**).

### 13 결정 (D-DF-01~13)

`migration/decisions/DECISIONS.md` 의 D-DF-00 entry 참조. 핵심:
- **Aligo 폐기** → mobile RN expo-sharing Share Sheet (기사 본인 발신)
- **PNG 합성 방식** = 서버 측 Playwright Java SDK 1.47 + Chromium headless → `OutboundView.tsx` URL (file://) 렌더링 → fullPage screenshot
- **양쪽 저장** = arologis 자체 `signatures` + slip-service `signature_source=APP` + `slip_signature_audit`. 출고전표 본체 (Slip) 는 slip-service 단일 SOT
- **사진 첨부 통합 (D-DF-13)** = 기존 SignaturePhotoScreen (P1-8 Stage 4) W10-4 deep link 활성. 사진은 slip-service attachment 별도, 사본 PNG 와 분리

### 4 신규 컬럼 (Flyway V11) — `arologis.signatures`

| 컬럼 | 의미 |
|---|---|
| `copy_sent_at` | PNG download 시각 (성공 1회 가드, NULL → OK, NOT NULL → 409) |
| `copy_send_failure_count` | Tx2 c/d fail 카운트 (모니터링 alert 임계치) |
| `copy_image_path` | disk path (`/var/lib/arologis/signature-copies/{signatureId}.png`) — Phase 11 cutover 시 S3 키로 갈아탐 |
| `copy_recipient_phone` | 발송 시점 slip recipientPhone 스냅샷 (풀 번호) |

### 핵심 파일 (Phase F 신규/수정)

```
services/arologis-service/
├── src/main/java/com/samhanair/logis/arologis/
│   ├── domain/Signature.java                                    (4 column + markCopySent + markCopyFailure)
│   ├── service/copy/
│   │   ├── SignAndSendCopyService.java                          (Tx1 atomic + Tx2 best effort orchestration)
│   │   ├── PlaywrightCopyRenderer.java                          (Playwright wrapper, RendererTimeoutException/RendererErrorException)
│   │   ├── CopyImageDiskStorage.java                            (disk save)
│   │   └── CopyFailureReason.java                               (enum)
│   ├── controller/ArologisDriverAppController.java              (POST /sign-and-send-copy 추가, /sign @Deprecated)
│   ├── client/SlipClient.java                                   (findRecipientPhone + findFullDetail 추가)
│   ├── service/SlipResolver.java                                (findRecipientPhone + buildSlipDataMap)
│   ├── config/PlaywrightConfig.java                             (Browser bean, @ConditionalOnProperty)
│   └── web/dto/copy/SignAndSendCopy{Request,Response}.java
├── src/main/resources/db/migration/V11__add_signature_copy_columns.sql
└── Dockerfile                                                    (Playwright + Chromium + fonts-noto-cjk)

clients/desktop/
├── print-renderer/                                               (NEW — multi-entry)
│   ├── index.html / main.tsx / PrintRendererApp.tsx
└── vite.print-renderer.config.ts

clients/mobile-staff/
├── src/api/arologis.ts                                           (signAndSendCopy + 응답 분기 타입)
├── src/screens/driver/
│   ├── DriverSignatureScreen.tsx                                 (1-tap 완료+발송 + Share Sheet + 5 토스트)
│   ├── SignaturePhotoScreen.tsx                                  (onUploaded → DriverSignature chain)
│   └── DriverTabNavigator.tsx                                    (signature-photo 탭 추가)
└── package.json                                                  (expo-sharing + expo-file-system + base-64 추가)

services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipInternalController.java   (/recipient-phone + /full 추가)

docs/superpowers/specs/2026-05-14-samhan-signature-copy-design.md   (v3.1, 13 결정)
docs/superpowers/plans/2026-05-15-samhan-signature-copy.md          (5-team plan)
docs/dev-reports/samhan-signature-copy.md                            (3-layer 누적)
docs/qa/samhan-signature-copy/scenarios.md                            (7 시나리오 + 회귀 + 4단계 롤백)
docs/qa/samhan-signature-copy/screenshots/01~07.png                  (PowerShell mock fallback)
scripts/generate-samhan-signature-copy-screenshots.ps1                (재실행 스크립트)
docs/uiux/samhan-signature-copy/01~03.md                              (Designer mock 3장)
docs/migration/phase11/M-PHASE-11-signature-copy-memory.md           (Chromium 메모리 검증)
infrastructure/env-templates/arologis-service.env                     (4 env 추가)
```

### spec/plan vs 실 코드 정정 9건 (BE worker 자체 정정 — plan 문서와 실 코드 차이)

1. `VehicleStop` 직접 dispatchId 미보유 → 권한 = `vehicle.assignedDriverId == driverId`
2. Slip 의 `sourceWarehouseName` 미존재 → `sourceWarehouseId.toString()` placeholder
3. Slip 의 `recipientAddress` X → `deliveryAddress` 사용
4. Slip 의 `recipientPhoneNumber` X → `recipientPhone` (V20 column)
5. Slip 의 `totalSupply`/`vat`/`total` getter 미존재 → lines 합산 계산
6. `VehicleStop.recipientName` 미존재 → "어플인수자" placeholder
7. `DriverPrincipal` 미도입 → `X-User-Id` → `DriverRepository.findByAppUserId` 패턴
8. `PlaywrightConfig` — `@ConditionalOnProperty(arologis.playwright.enabled=true)` 추가
9. `SignatureRepository.findFirstByStopIdAndSourceOrderByCreatedAtDesc` 미존재 → `findAllByStopIdOrderByCapturedAtDesc` stream filter

### 통계

- BE 8 commit + FE 5 + Designer 1 + DevOps 3 + QA 2 + TM 통합/PR/QA fix 다수 = 23 commit
- arologis-service: **221 tests / 0 fail / 75 skipped (Docker npipe — IT 5건 코드만, CI Linux 실행)**
- slip-service: **454 tests / 0 fail / 171 skipped** (PR #99 SignatureIntegrationIT 보존)
- mobile-staff: **TS 0 errors + Jest 7 PASS** (DriverSignatureScreen 6 + SignaturePhotoScreenChain 1)
- desktop print-renderer build: **SUCCESS (148.67 kB)**
- CI 21 check all PASS + GitGuardian PASS
- 회귀 0 결함

---

## 2. PR #191 후속 — 즉시 진행 가능한 fix (선택)

| # | 후속 작업 | 우선순위 | 추정 |
|---|---|---|---|
| F1 | QA 캡처 텍스트 잘림 fix (01/05/07 우측/좌측 1~2 글자) | LOW | 30분 (PowerShell width margin 또는 텍스트 단축) |
| F2 | `.claude/memory/project_samhan_signature_copy.md` 신규 메모리 작성 | LOW | 10분 (TM agent 권한 차단으로 미작성, 결정은 DECISIONS + dev-report 보존) |
| F3 | Admin 재발송 endpoint PR (`/admin/.../signatures/{id}/resend-copy`) | MEDIUM | 1~2일 spec + plan + 5-team |
| F4 | KakaoLink SDK deep link PR (인수자 번호 prefill) | MEDIUM (사용자 피드백 후) | 2~3일 |
| F5 | `/sign` endpoint 완전 제거 PR (1~2 분기 후) | LOW | 30분 |
| F6 | OutboundView refactor (옵션 a — useQuery 분리, drift 0 우선시) | LOW | 1일 |
| F7 | Phase 11 disk → S3 cutover PR | Phase 11 시점 | 별도 |
| F8 | `copy_send_failure_count` Slack alert (>5 / 10분) | LOW | 반나절 |

---

## 3. 다음 trigger 후보 (개발책임자 결정)

### 즉시 가능 (인성 자료 무관)

- **Phase E** — 인수자 카톡/문자 발송 (배차 기사 정보) — notification-service Aligo 활용. spec 신규 필요 (브레인스토밍 권장).
- **D-AX-11** — FE 산재 페이지 이전 (`ArologisManualDispatchPage` 등 4 page + Api 3 + RealtimeClient) — HIGH 우선순위. spec 신규.
- **D-AX-12** — mobile cross-import 분리 (`DriverTabNavigator` → `SlipDetailScreen`) — Phase F 머지 후 환경 안정화 후 진행 권장. spec 신규.
- **D-AX-13** — BE/FE auth schema 정합 검증 (`/auth/me` 응답) — 작은 PR.
- **ACM SAN 갱신** — Terraform `*.arologis.samhan-air.com` 추가 (Phase 11 cutover 전).
- **EC2 Health Lambda** — CloudWatch alarm + SNS 별도 PR.
- **Phase F 후속 fix** — F1~F8 위 표 (단순 fix 부터 큰 PR 까지).

### 인성데이타 API 링크 도착 대기 (사용자 요청 "추후")

- **Phase B** — arologis `InsungQuickDriverMatcher` 실 활성 (W10-2 trigger).
- **Phase D** — GPS 실시간 공유 (SSE) — 인성 LBS callback endpoint.

---

## 4. 본 conversation 누적 머지 (8 PR, PR #184~#191)

| PR | merge commit | 내용 |
|---|---|---|
| #184 | `f3cb306` | 아로로지스 독립 분리 (D-AX-01~10) — monorepo 유지 + 자체 auth + 휴대번호 passwordless |
| #185 | `26f2bc3` | post-merge follow-up — mock PNG 6장 + handoff + autopilot 메모리 v2 |
| #186 | `2bd653f` | D-AX-14 자동 폰번호 인식 + 1-tap 로그인 (PR #184 보완) |
| #187 | `cc106d1` | D-AX-14 mock 스크린샷 3장 follow-up |
| #188 | `01d41f6` | **Phase A — 배차 메뉴 + 아로로지스 발송** (D-DB-01~09) |
| #189 | `9bebe12` | **Phase C — 배차 수정/취소 요청 흐름** (D-DC-01~09) + 5-team 패턴 정정 메모리 |
| #190 | `3b3d04d` | handoff 갱신 — PR #184~#189 머지 + Phase F spec 리뷰 대기 + 후속 Phase 안내 |
| #191 | `1ad4296` | **Phase F — 전자서명 양쪽 저장 + 출고전표 사본 PNG 1회 발송** (D-DF-01~13). 새 5-team (QA sequential) 첫 적용 + Aligo 폐기 + Playwright Chromium 도입 |

---

## 5. 코덱스 진입 시 권장 흐름

1. **`git pull`** + `git log --oneline -5` 로 main 의 최신 (`1ad4296`) 확인.
2. **본 파일 (`docs/handoff/CURRENT-WORK.md`) 다시 read** — 진행 상태 즉시 파악.
3. **사용자 (개발책임자) 의 다음 trigger 메시지 대기** — §3 의 후보 중 하나, 또는 새 작업.
4. 작업 시작 시 **§0 의 컨벤션 표** 준수 (한국어 commit + 통합 PR + QA 캡처 + UUID 비공개 등).
5. 큰 작업 (신규 Phase, 새 endpoint 다수) = brainstorm → spec → plan → 5-team 디스패치 → TM 통합 → PR 발행 → 사용자 머지 패턴 따름.
6. 작은 작업 (단순 fix, env 변경, 문서) = 즉시 commit + PR (단 통합 PR 패턴 유의).

### 5-team 디스패치 시 (Claude Code 환경에서 검증된 패턴, 코덱스 환경에서는 적응 필요)

본 repo 의 `.claude/worktrees/` 가 Claude Code 의 git worktree isolation 디렉토리. 코덱스도 git worktree 사용 가능 (`git worktree add ...`). 4 team 동시 worktree 분리 → 머지 패턴.

또는 코덱스 환경에서 단순화: TM 한 사람이 모든 team scope 를 순차 진행 (slow 하지만 단순).

### 메모리 시스템 (Claude Code 전용 — 코덱스 무관)

`.claude/memory/MEMORY.md` 는 Claude Code 의 자동 로드 메모리. 코덱스는 이 시스템 모름. 그러나 git tracked 라 코덱스도 read 가능. 본 파일 (CURRENT-WORK.md) + `migration/decisions/DECISIONS.md` + `docs/superpowers/specs/` + `docs/superpowers/plans/` + `docs/dev-reports/` 만 알면 충분.

**Claude Code 로 다시 돌아올 때**: `.\scripts\sync-claude-memory.ps1` 실행 (repo .claude/memory → 사용자 홈 ~/.claude/projects/c--dev-SamhanLogis/memory/ 단방향 복사).

---

## 6. 통계 (본 conversation, 2026-05-14 ~ 05-15)

- 누적 PR 머지: **8** (#184~#191)
- 누적 commit: ~170+ (5-team x 7 cycle + TM + PM + fix)
- 누적 메모리 (Claude Code): 8 신규 (Phase F 의 `project_samhan_signature_copy` 만 미작성, DECISIONS + dev-report 보존)
- 누적 DECISIONS entry: D-AX-01~14 + D-DB-01~09 + D-DC-01~09 + D-DF-01~13 (50+ entry)
- 회귀 가드: 모든 PR 0 결함 (slip-service 단위 ~98 + IT 50+ 보존)
- AWS 비용 변경: ₩0 (Phase 11 계획 ₩405K/월 유지, Chromium ~500MB pool 은 m5.xlarge 16GB 여유 안 — `docs/migration/phase11/M-PHASE-11-signature-copy-memory.md`)

---

## 7. 양 PC 작업 인계 절차 (Claude Code)

### 떠나는 PC (현재 PC)

```powershell
# CURRENT-WORK.md 갱신은 본 commit 으로 진행
git checkout main
git pull
```

### 도착하는 PC (회사/집)

```powershell
git pull
.\scripts\sync-claude-memory.ps1   # 8 신규 메모리 동기화 (Claude Code 사용 시)
# Claude Code 새 세션 → CLAUDE.md 자동 로드 + 본 파일 read 으로 컨텍스트 회복
# 코덱스 사용 시 → 본 파일 read + git pull 만으로 충분
# trigger: §3 의 후보 중 하나, 또는 새 작업
```
