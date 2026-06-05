# slice: 동적 권한그룹 Phase B — 인사/권한 관리 위임

> PR #398. 개발책임자 요청 "인사권한 위임" 실현. PM 전권([[feedback_pm_permission_autonomy]]).
> spec `2026-06-05-permission-groups-phase-b-delegation-design.md`(D-PB-01~05), QA `docs/qa/permission-groups-phase-b/real-qa-evidence.md`.

## 1. 목적
MASTER 가 관리 권한(권한설정·권한그룹·인사 역할관리)을 다른 그룹에 **위임/회수**(선택). 위임받은 계정은 MASTER 없이 해당 관리 작업 수행. 위임은 MASTER 전용(재위임/자기상승 차단, §3A).

## 2. 모델
- **위임 = 페이지 권한 부여**(별도 엔티티 없음). MASTER 가 관리 page-code 를 그룹에 grant=위임 / soft-delete=회수.
- **관리 page-code(`PageCode.MANAGEMENT_PAGE_CODES`)**: `system.permission-admin`, `hr.role-management`, `admin.permission-groups`.
- **hr.role-management 분리**(신규): 역할변경/퇴사(고위험)를 `admin.employees`(일반 직원관리, MANAGER) 에서 분리. EmployeeController.updateRole/terminate 하드 `@PreAuthorize(MASTER)` 제거 → `@RequirePermission(hr.role-management)`. seed MASTER-only(V45) → behavior-preserving + 위임 가능.

## 3. 봉쇄 (§3A 위임=MASTER 전용 — dual 리뷰가 우회 4경로 적발, 공용 가드로 차단)
`ManagementPageMutationGuard.rejectManagementPageMutation(actorRole, pageCodes)` 공용화. 관리 page-code grant 는 caller MASTER(X-User-Role)만:
- 직접 매트릭스(updateAccountMatrix/applyTemplate/copyFromAccount/bulkApply, updateGroupMatrix)
- 그룹 배속(AccountGroupService.assign/unassign — 관리 page-code 보유 그룹)
- role override(PUT/POST batch/DELETE /auth/admin/permissions, DynamicPermissionService)
- template 주입(updateTemplate)
- 위임 API(updateDelegations) = requireMaster.
→ 위임자(system.permission-admin 보유 비-MASTER)가 자기/타인에게 관리권위 재부여 불가.

## 4. FE
- "권한 위임" 화면(PermissionDelegationPage, **RoleGuard MASTER 전용**): 그룹 선택→관리권위 3토글+저장+현황.
- 권한설정/권한그룹 운영 화면: `RoleGuard(['MASTER'])` → **`PermissionGuard(system.permission-admin)`** 전환 → 위임자도 사용 가능(usePermissions MASTER bypass 유지). 사이드바 show 권한 기반(위임 메뉴만 MASTER).

## 5. dual review + 실 QA 적발 결함 (정적 false-green 을 리뷰/CI/실QA 가 연속 차단)
- Claude/Codex 보안: 위임 봉쇄 우회 4경로(그룹배속·role override·template·직접) → 공용 가드 차단.
- Codex FE: 위임자가 운영화면 못 씀(RoleGuard 잔존) → PermissionGuard 전환.
- CI Playwright: sp-d1 T6 stale RoleGuard 단언 → PermissionGuard redirect 동작으로 갱신.
- **실서버 QA: 위임 회수가 행 soft-delete 안 함(active 잔존→관리그룹 오판정)** → markDeleted 수정.

## 6. QA (실서버·실데이터)
실 auth-service 위임 부여(활성1)→회수(활성0) 사이클 + V45 실증. 봉쇄 4경로 실 DB IT. 상세 real-qa-evidence.md.

## 7. 범위 밖
- **Phase C**: 고정역할 enum/accounts.role/X-User-Role/hasRole 잔여 완전제거, 다중그룹 토큰 반영.
- 시간제한 위임/위임 감사로그: 후속(YAGNI).
