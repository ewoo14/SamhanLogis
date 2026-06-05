# dev-report — Phase C3b(Option B): 직원 관리 그룹 배속 UX 전환

> 2026-06-06. 개발책임자 "123 순서" ①. PM 전권. C3a(role-group 동기화 #405) 후속.
> spec: `docs/superpowers/specs/2026-06-06-permission-groups-phase-c3b-group-assign-ux-design.md`

## 1. 무엇을 했나
`UsersPage` 의 "역할 변경"(RoleChangeModal, 단일 role 드롭다운)을 **GroupAssignModal(권한그룹 배속 모달)** 로 전환. 빌트인 role-group 이 primary 신원(=role 파생), 추가 커스텀 그룹 multi-assign.
- **기본 권한그룹 select**(9 빌트인): 선택 → 그룹→role 역매핑(`BUILTIN_GROUP_ROLE_MAP`, V43 `...01XX`) → 기존 `updateAdminUserRole(derivedRole)`(BE C3a 가 빌트인 그룹+role+materialize 동기화).
- **추가 권한그룹**(비-빌트인 커스텀): `permissionGroupsApi`(fetchAccountGroups/assignAccountGroup/unassignAccountGroup, Phase A) 재사용 — 배속/해제 + 현재 배속 표시. 0개 시 안내.
- DRIVER(107)/STAFF(108)는 FE AdminRole 미포함 → 저장 가드(역할 없음 시 disabled).

## 2. 호환 / 안전
- accounts.role = 기본 빌트인 그룹의 파생 스냅샷(C5 전 JWT 호환). multi-role 미지원(기본 그룹 1개, 단일 role 모델). 추가 그룹은 권한 가산.
- BE 무변경(기존 endpoint 재사용, role 파생 FE). UUID 사용자 비공개(그룹명/로그인ID 표시).

## 3. mock 보강
`mock.ts`: `_mockPermissionGroups` 빌트인 10(V43 UUID)+커스텀 3, `_mockAccountGroups` user-001~008 초기 빌트인 배속, `PATCH /admin/users/{id}/role` 핸들러가 role 업데이트+빌트인 그룹 동기화+AdminUser 반환.

## 4. 검증
- typecheck 0.
- 전체 mock suite: **417 passed / 1 flaky**(phase-2-6c 시나리오2 — load 타임아웃, **격리 8 passed/8.9s**, 본 변경 무관, CI retries:1). **UsersPage source-contract 실패 0**(GroupAssignModal 이 admin-hr 5·permission-groups 5 회귀 무파괴).

## 5. 잔여 / 다음
- Option B 의 full multi-role(기본 그룹 다중)은 C5(accounts.role 제거) 후 자연스러워짐 — 현재는 단일 primary.
- 다음 = **C4**(MASTER bypass 키 전환) → C5. 계획서 `plans/2026-06-06-...-c4-c5-execution-plan.md`.
