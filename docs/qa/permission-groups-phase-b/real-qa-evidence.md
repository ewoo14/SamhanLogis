# 동적 권한그룹 Phase B(위임) — Docker 실서버 QA 실증

> 2026-06-05. PR #398. 실 auth-service(Phase B 재배포) + 실 auth_db. 가짜 0([[feedback_no_fake_data_ever]]).

## 1. 재배포 + V45
auth-service bootJar→build→force-recreate, Up(healthy). Flyway **V45 hr.role-management** success=t(role_page_permission_templates MASTER-only 시드).

## 2. 실서버 위임 사이클 (auth-service:8081, X-User-Id=MASTER)
| 단계 | 호출 | 결과 |
|---|---|---|
| 그룹 생성 | POST /permission-groups | success id=… |
| **위임 부여** | PUT /permission-groups/{id}/delegations `{hrRoleManagement:true}` | success, `{hrRoleManagement:true}` |
| 부여 실측 | psql group_page_permissions | hr.role-management **can_view=t, can_update=t** (활성 1행) |
| **위임 회수** | PUT delegations `{hrRoleManagement:false}` | success |
| **회수 실측(수정 후)** | psql 활성 hr.role-management 행 | **0** (soft-delete) |

> 🐞 실서버 QA 가 적발한 버그: 최초 회수 시 행이 all-false 로 잔존(active=1) → `rejectManagementGroupAssignment`(활성행 존재 판정)가 회수된 그룹을 계속 관리그룹으로 오판정. → `upsertDelegation` 회수 시 markDeleted soft-delete 로 수정. 재배포 후 회수=0 확인.

## 3. 봉쇄(§3A) — CI Testcontainers 실-HTTP IT 로 검증
실 DB IT(PermissionAdminManagementMutationIT + PermissionGroupControllerIT)에서:
- 비-MASTER(system.permission-admin 보유 위임자)가 관리 page-code(system.permission-admin/hr.role-management/admin.permission-groups)를 **(a) 그룹 배속 (b) 그룹/계정 매트릭스 (c) role override (d) template 주입** 으로 부여 시도 → **전부 403**. MASTER → 허용.
- 회수 후 비-MASTER 배속 200(관리그룹 판정 해제).
- hr.role-management 분리: MANAGER 일반 직원관리 유지·역할변경 차단.

## 4. 결론
실서버 위임 부여/회수 사이클 + V45 실증. 봉쇄 4경로는 실 DB IT 로 회귀 박제(위임자 재위임/자기상승 차단). 실서버 QA 가 revoke soft-delete 버그를 단독 적발·수정.

## 5. 한계
- 위임→역할변경 cross-service(auth 위임 + user EmployeeController) live 전 경로는 user-service IT(UserPermissionControllerIT) + auth 실서버로 분리 검증(통합 live 는 gateway/user 동시기동 필요 — 미수행). 봉쇄 403 cross-account 시나리오는 실 DB IT 가 권위.
