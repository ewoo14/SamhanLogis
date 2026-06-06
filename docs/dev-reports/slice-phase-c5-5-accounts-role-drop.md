# Phase C5-5: auth-service accounts.role 컬럼 물리 DROP

## 요약

인가 와이어에서 role 완전 소멸 — accounts.role 컬럼을 물리 DROP하고
역할 표현을 account_groups 빌트인 그룹 배속으로 완전 이전한 슬라이스.

## Flyway 마이그레이션

- **V46__drop_accounts_role_column.sql** (신규)
  - `DROP INDEX IF EXISTS ix_accounts_role_active` (V1 생성)
  - `ALTER TABLE accounts DROP COLUMN IF EXISTS role`
  - 한국어 주석으로 C5-5 근거 + 락아웃 불변식 박제
  - Flyway 순서: V5(seed role INSERT) → V46(DROP) 보장

## Account entity 변경 (`Account.java`)

- `@Enumerated role` 필드 제거
- `changeRole(Role)` 도메인 메서드 제거
- `Account(String, String, String, Role)` 생성자 → `Account(String, String, String)` 재설계
- `Account.create(loginId, passwordHash, displayName)` — role 파라미터 제거
- `Account.createWithId(id, loginId, passwordHash, displayName)` — role 파라미터 제거
- Javadoc: C5-5 변경 + 락아웃 불변식 명시

## AuthService 변경 (`AuthService.java`)

### login role 파생 설계

```
activeGroups = accountGroupRepository.findBy...(account.getId())
role = activeGroups.stream()
    .map(ag -> BuiltinRoleGroupIds.fromGroupId(ag.getGroupId()))
    .filter(Optional::isPresent).map(Optional::get)
    .map(Role::name).findFirst().orElse("")
```

- 역매핑 실패(그룹 미매칭) 시 `""` 반환 — 인가 불변식 무영향
- JWT generate 에 전달되는 role 문자열은 표시용 전용

### registerWithId 변경

- `Account.createWithId(id, loginId, passwordHash, displayName)` — role 파라미터 제거
- `RegisterResponse.role` = role 파라미터 직접 전달 (accounts 컬럼 미경유)
- `syncBuiltinRoleGroup(managed.getId(), null, role)` 경로 유지 (역할 표현 그룹 배속)

### updateAccountRole 변경

- `account.getRole()` 제거
- `oldRole` = `accountGroupRepository.findBy...(id)` ∩ `BuiltinRoleGroupIds` 역산
- `account.changeRole(role)` 제거 — accounts 컬럼 없음
- `syncBuiltinRoleGroup(id, oldRole, role)` 유지

## AuthController 변경 (`AuthController.java`)

- `/me` 응답 role: `account.getRole().name()` → `AccountGroupRepository` 역매핑 파생

## AccountPermissionService 변경

- `listAccounts()`: `account.getRole().name()` → `AccountGroupRepository` 역매핑 파생
- 생성자에 `AccountGroupRepository accountGroupRepository` 추가

## 유지 항목 (변경 없음)

| 항목 | 이유 |
|---|---|
| `Role` enum (`common`) | provisioning / BuiltinRoleGroupIds 매핑 / arologis 사용 |
| user-service `role_snapshot` | HR 직무 도메인 (인가 아님) |
| user-service `RoleChangeHistory` | 감사 로그 (인가 아님) |
| `DynamicPermissionService` role-mode | roleCode 기반 permission template |
| `BuiltinRoleGroupIds` | 역매핑 상수 (C5-3 신규, C5-5 활용) |
| `AccountGroupService.syncBuiltinRoleGroup` | 그룹 배속 동기화 (C3a 경로) |
| internal endpoint `UpdateRoleInternalRequest` | 계약 유지 (role 파라미터는 그룹 배속용) |

## 테스트 결과

- **213 tests passed** (IT Testcontainers Docker 가용 + 단위 테스트 전부)
- RoleGroupSyncIT: accounts.role 없는 환경에서 그룹 동기화 정상 확인
- AuthServiceTest: login role 파생 (빌트인 그룹 역매핑) 검증
- AccountGroupOrderingIT, EffectivePermissionMaterializerIT: 시드 SQL role 컬럼 제거

## 락아웃 불변식

- login role 파생 실패(그룹 미매칭) 시 `LoginResponse.role = ""`
- 실제 인증·인가는 `X-User-Groups` / `X-Is-System-Master` 전담 — role 미사용
- MASTER 계정(group100): `X-Is-System-Master=true` → 전권 bypass, role 파생 무관
- 결론: role 컬럼 DROP 이 로그아웃/락아웃을 유발하지 않음을 불변식으로 박제

## 브랜치 / PR

- 브랜치: `feat/permission-groups-c5-5-accounts-role-drop`
- 계획서: `docs/superpowers/plans/2026-06-06-permission-groups-c5-cutover-execution-plan.md §2 PR-3`
