# 동적 권한그룹 Phase C3b(Option B) — 직원 관리 그룹 배속 UX 전환

> 2026-06-06. 개발책임자 "123 순서" 지시(①). PM 전권. C3a(role-group 동기화 #405) 후속.

## 1. 배경 / 결정
개발책임자 Option B 채택: 직원/계정 관리 화면의 **단일 role 드롭다운**을 **그룹 배속 중심 UX**로 전환. 빌트인 role-group(101~109)이 primary 신원, accounts.role 은 빌트인 그룹에서 **파생**하여 C5 전까지 JWT 호환 유지.

## 2. 현황 (정찰)
- `UsersPage.tsx` RoleChangeModal = 단일 role 드롭다운 → `updateAdminUserRole(id, {newRole})` → PATCH `/api/v1/admin/users/{id}/role`(C3a 가 빌트인 role-group 동기화).
- Phase A `PermissionGroupManagePage` + `permissionGroupsApi`(fetchAccountGroups/assignAccountGroup/unassignAccountGroup) = 계정↔그룹 배속 완비(빌트인 필터링).
- 빌트인 그룹↔role 1:1: `BuiltinRoleGroupIds`(V43 `...01XX`).

## 3. scope (FE 중심)
`UsersPage` 의 "역할 변경" 액션을 **권한그룹 배속 모달**로 전환:
1. **기본 권한그룹**(필수, 1개): 9 빌트인 role-group select(그룹명 표기 — 매니저/영업원/…). 선택 시 그룹→role 역매핑하여 `updateAdminUserRole(derivedRole)` 호출(C3a 가 빌트인 그룹+role+materialize 동기화).
2. **추가 권한그룹**(선택, N개): 비-빌트인 커스텀 그룹 multi-assign — `assignAccountGroup`/`unassignAccountGroup`. 기존 배속 표시.
- role 파생 = 빌트인 그룹 UUID/그룹명 → role 역매핑(FE 상수, BuiltinRoleGroupIds 반영). accounts.role 은 기본 그룹의 읽기전용 스냅샷.
- RoleChangeModal 제거/리네임, PermissionGroupManagePage 배속 패턴 재사용.

## 4. 비목표
- multi-role(다중 빌트인) 미지원 — 기본 그룹 1개(단일 role 모델, C5 전). 추가 그룹은 권한 가산만.
- accounts.role 물리 제거 = C5.
- BE 변경 최소(기존 endpoint 재사용). role 파생은 FE.

## 5. mock
- `/admin/users/{id}/role` PATCH mock + account-groups mock 핸들러 정합(role 변경 시 기본 그룹 동기화 반영). 빌트인 그룹 목록 mock(`/auth/admin/permission-groups`) select 옵션.

## 6. 검증
- typecheck 0, 전체 mock suite 0 fail([[feedback_fe_guard_removal_contract_tests]] — UsersPage 관련 source-contract 갱신). Playwright 신규/갱신 스펙(그룹 배속 모달). dual review(Claude TM·Codex TM 각각)+PM 종합. CI green. DECISIONS D-PGC-09.
