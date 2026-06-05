# Permission Groups Phase C3a — 역할 변경 시 빌트인 role-group 자동 동기화

> 작성: 2026-06-06. 상위 Phase: C3 (C5 bridge). 연관 spec: `2026-06-06-permission-groups-phase-c3a-role-group-sync-design.md`

## 1. 목적

`AuthService.updateAccountRole` 이 `accounts.role` 만 변경하고 `account_groups` 를 동기화하지 않아
role ↔ group 배속이 발산하는 문제 해소. C5(role enum 물리 제거)의 선결 조건.

## 2. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `service/BuiltinRoleGroupIds.java` | 신규 — V43 결정적 UUID 매핑 상수 (`BUILTIN_ROLE_GROUP_IDS`, `of(Role)`) |
| `service/AccountGroupService.java` | `syncBuiltinRoleGroup(accountId, oldRole, newRole)` 내부 메서드 추가, `@Slf4j` 추가 |
| `service/AuthService.java` | `updateAccountRole` 확장 (sync + materialize), `registerWithId` 초기 role-group 배속 + `entityManager.flush()`, `AccountGroupService`/`EffectivePermissionMaterializer`/`EntityManager` 의존성 추가 |
| `it/RoleGroupSyncIT.java` | 신규 Testcontainers IT (6 시나리오) |
| `service/AuthServiceTest.java` | `AccountGroupService`/`EffectivePermissionMaterializer`/`EntityManager` Mock 추가, `updateAccountRole_changesRoleAndSyncsRoleGroup` 테스트 추가 |

## 3. 핵심 설계 결정

### BUILTIN_ROLE_GROUP_IDS

```
MASTER=100, MANAGER=101, SALES=102, WAREHOUSE=103, ACCOUNTANT=104
INVENTORY=105, DISPATCH=106, DRIVER=107, STAFF=108, DEVELOPER=109
```

UUID 형식: `00000000-0000-0000-0000-0000000001XX` (V43 SQL 과 1:1 대응).

### AccountGroupService.syncBuiltinRoleGroup (내부 전용 경로)

- 공개 `assign`/`unassign` 에서 `rejectSystemGroupAssignment` 가드가 빌트인 그룹을 차단하므로,
  role 변경 경로는 이 메서드를 통해 가드를 우회.
- `oldRole=null` → unassign 스텝 no-op (신규 계정 초기 배속에 재사용 가능).
- `newRole` 그룹이 이미 active 배속이면 중복 생성 없이 유지.
- `Propagation.REQUIRED` → 호출자 `AuthService` 트랜잭션에 참여.

### AuthService.registerWithId persist flush 이슈

- `Account.createWithId(id, ...)` 로 id 를 선세팅한 후 `accountRepository.save` 를 호출하면
  Hibernate 이 `merge()` 로 처리해 새 UUID 를 생성할 수 있음.
- `entityManager.flush()` 로 accounts INSERT 를 즉시 DB 에 반영해 `account_groups` FK 충족.
- IT assertion 에서 `registerWithId` 반환 `response.userId()` 를 사용 (merge 후 실제 UUID).

### MASTER bypass 보존

- `EffectivePermissionMaterializer.materializeForAccount` 는 `isSystemMaster=true` 그룹 배속 계정에 대해
  `account_page_permissions` 활성 행을 만들지 않음 (기존 MASTER bypass 유지).
- MASTER 그룹 sync 도 동일 내부 경로로 처리됨.

## 4. IT 시나리오 결과

| 시나리오 | 결과 |
|---|---|
| MANAGER→SALES: group101 soft-delete + group102 active | PASS |
| MANAGER→SALES: 수동 배속 그룹 보존 | PASS |
| MANAGER→SALES: account_page_permissions SALES grant 반영 | PASS |
| MASTER→MANAGER: group100 soft-delete + group101 active | PASS |
| MASTER→MANAGER: account_page_permissions active 행 생성 | PASS |
| 신규 계정 SALES 등록 → group102 배속 + permissions active | PASS |
| 신규 계정 MASTER 등록 → group100 배속 + permissions 없음 | PASS |

전체 208 테스트 모두 통과.

## 5. 컴파일/테스트 결과

```
./gradlew :services:auth-service:compileJava :services:auth-service:compileTestJava → BUILD SUCCESSFUL
./gradlew :services:auth-service:test → BUILD SUCCESSFUL (208 tests, 0 failed)
Docker: 가용, Testcontainers IT 정상 실행
```

## 6. 후속 과제

- C4: role enum 을 그룹 배속 시스템으로 완전 대체 (개발책임자 승인 후).
- `registerWithId` 의 merge/persist 이슈 근본 해소: `Account` 에 `Persistable<UUID>` 구현 검토
  (id 선세팅 시 항상 persist 사용). 현재는 `entityManager.flush()` 우회로 처리.
