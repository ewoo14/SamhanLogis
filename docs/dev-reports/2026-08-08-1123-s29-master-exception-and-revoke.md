# S29 — MASTER 마감 예외 및 `slip.period-lock` 전수 회수

일자: 2026-08-08  
이슈: #1123  
PR: #1124

## 결함 1 원인 확정

원인은 MASTER 하나의 seed 누락이 아니다. `EffectivePermissionMaterializer`가
`is_system_master=true` 그룹 계정에 대해 기존 MASTER bypass 정책을 보존하려고
`account_page_permissions` 행을 만들지 않는다. 그런데 auth 내부 account-form 권한 조회는
그 캐시만 조회하고 시스템 MASTER 여부를 재확인하지 않아 `allowed=false`를 반환했다.

따라서 런타임과 seed가 어긋난 범위는 다음과 같다.

| 대상 | seed 선언 | 기존 런타임 판정 | S29 확인 |
|---|---|---|---|
| MASTER 계정, account-form 전 권한 | 시스템 MASTER bypass/전권 | 캐시 행 없음 → 모든 action `false` | MASTER 전역 경로 결함 |
| MANAGER·ACCOUNTANT 등 비MASTER 계정 | group seed → materialize | `account_page_permissions` 조회 | 기존 경로 유지 |
| role-form `role_page_permissions` | 역할별 명시 grant | `DynamicPermissionService`가 직접 조회 | MASTER 외 별도 불일치 증거 없음 |
| `slip.closed-date-exception` | MASTER/MANAGER CREATE | MASTER만 account-form 경로에서 false | S29 보정 |

수정은 `AccountPermissionService.check`가 시스템 MASTER 그룹 배속을 확인하면 cache row 없이
허용하도록 한 것이다. 비MASTER는 기존 cache 판정을 그대로 사용한다. direct PUT 경계에는
`X-User-Role: MASTER`를 closed-date guard까지 전달하는 overload도 추가했다.

## 결함별 RED-A

- 결함 1: `SlipUpdateIT`의 S2b 감리주소 단독 수정이 MASTER 헤더에서 `409`였다.
  auth account-form 경로는 seed의 MASTER 선언과 달리 `allowed=false`였다.
- 결함 2: `PermissionMatrixPage`는 account 축의 `slip.period-lock` 회수 UI만 제공했고,
  권한그룹 매트릭스와 역할 매트릭스에는 회수 표면이 없었다.
- 결함 3: 결함 1 보정 후 `SlipUpdateIT`를 다시 실행했을 때 MASTER guard는 통과했으나
  별도 `SLIP_OPTIMISTIC_LOCK_CONFLICT`가 재현됐다.

## 결함별 RED-B

- 비권한자 보호: `SlipUpdateIT`에서 SALES, INVENTORY, ACCOUNTANT direct PUT 차단 케이스가
  계속 유지됐다(차단 실측 3건). WAREHOUSE 정상 경로도 유지됐다. 기존 전표를 대상으로 한
  별도 live 상태전이 건수 조회는 데이터 무결성 지시 범위상 수행하지 않았다.
- 정상 경로: auth-service 전체 테스트와 desktop 전체 Vitest/typecheck가 통과했다.
- 기존 권한 집합: seed/migration 및 role-form 조회 경로는 변경하지 않았다. 기존 권한 행을
  DB에서 조작하거나 기존 전표를 변경하지 않았다.

## 동시 GREEN

- MASTER closed-date 단위 테스트: 통과.
- MASTER account-form 권한 cache-row 부재 bypass 단위 테스트: 통과.
- 계정 회수: 기존 UI 유지.
- 그룹 회수: `PermissionGroupMatrixPage`에 `slip.period-lock` hidden orphan 상태와 전체 회수 버튼 추가.
- 역할 회수: `PermissionMatrixPage`에 실제 grant가 있는 역할별 전체 회수 버튼 추가.

단, PR 머지 게이트 전체는 아직 green이 아니다. MASTER guard를 통과한 후 두 번째 PUT에서
현재 `modifiedAt=2026-08-08T23:19:49.311039900`, 요청 `updatedAt=2026-08-08T23:19:49.235227400`의
optimistic-lock 불일치가 발생했다. 이는 MASTER 권한과 별개의 기존 버전 토큰 문제이며, 사용자 지시대로
정상 경로의 stale 차단을 약화시키는 임의 수정은 하지 않았다.

## 필수 3절

### 1. 새로 가능해진 조합과 결과

| 조합 | 결과 |
|---|---|
| 시스템 MASTER 계정 + 닫힌 날짜 + CREATE | 권한 check 허용 |
| 시스템 MASTER 계정 + 닫힌 날짜 + direct PUT | closed-date guard 통과; 이후 별도 stale version에서 409 재현 |
| 권한그룹 + `slip.period-lock` revoke | 그룹 매트릭스 hidden orphan 버튼으로 회수 가능 |
| 역할(MASTER/MANAGER/ACCOUNTANT) + `slip.period-lock` revoke | 역할별 hidden orphan 버튼으로 회수 가능 |
| 비MASTER 비권한자 + 닫힌 날짜 | 기존 차단 유지 |

### 2. 런타임- seed 전수 대조표

전수 대조 결과, 이번 경로에서 확인된 seed-런타임 불일치는 MASTER의 account-form 전역
bypass뿐이다. MANAGER·ACCOUNTANT 등 비MASTER 그룹 materialize 경로와 role-form 경로는
기존 seed 집합을 유지한다. `slip.period-lock`의 role seed는 MASTER/MANAGER/ACCOUNTANT,
group seed는 해당 기본 그룹 3축이므로, S29는 권한 보유 주체를 추가하거나 변경하지 않고
회수 UI만 확장했다.

### 3. 바꾼 파일을 참조하는 테스트 실행

- `:services:auth-service:test` — BUILD SUCCESSFUL.
- `clients/desktop: npm run typecheck` — 성공.
- `clients/desktop: npm test` — 전체 통과.
- `SlipClosedDateGuardTest` — 전체 6건 통과.
- `SlipUpdateIT` — 12건 중 11건 통과, S2b 1건 실패. 실패 원문은 closed-date가 아니라
  `SLIP_OPTIMISTIC_LOCK_CONFLICT`.
- `:services:slip-service:test` 전체 — 120초 실행은 워커가 남아 결과를 마무리하지 못했고,
  후속 재실행은 test-results 파일 잠금으로 중단됐다. 이후 `SlipUpdateIT`를 직접 실행해
  위 결과를 확보했다.

## 신규/변경 파일 목록

- `services/auth-service/src/main/java/com/samhanair/logis/auth/service/AccountPermissionService.java`
- `services/auth-service/src/test/java/com/samhanair/logis/auth/service/AccountPermissionServiceTest.java`
- `services/slip-service/src/main/java/com/samhanair/logis/slip/service/closing/SlipClosedDateGuard.java`
- `services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipUpdateService.java`
- `services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipUpdateController.java`
- `services/slip-service/src/test/java/com/samhanair/logis/slip/service/closing/SlipClosedDateGuardTest.java`
- `clients/desktop/src/renderer/routes/PermissionMatrixPage.tsx`
- `clients/desktop/src/renderer/routes/PermissionGroupMatrixPage.tsx`
- `docs/dev-reports/2026-08-08-1123-s29-master-exception-and-revoke.md`

DB 직접 INSERT/UPDATE/DELETE, 재배포, Docker 재기동, 기존 QA 잔재 삭제는 수행하지 않았다.
