# S10 운송사 권한 축 보고서

- 작업 브랜치: `feat/1039-provisional-dispatch`
- 기준 HEAD: `20eac9d0c3a7c996c8f98ac35bd934fd41af0c6b`
- 대상 PR: #1045
- 범위: 배차 화면의 운송사 조회·배차그룹 지정 권한 축만 수정

## 1. 진단 및 결정

기존 `CarrierAdminController`는 `/admin/carriers`의 목록·단건 조회와 등록·수정·비활성화·삭제를 모두 `hr.carriers`로 보호했다. 이 구조에서 `dispatch.board`만 가진 배차담당자는 운송사 조회 자체가 불가능했다.

두 권한을 하나의 게이트에 OR로 합치면 인사 운송사 마스터 화면과 CRUD가 배차담당자에게 열리므로 불변식 2·3을 깨뜨린다. 따라서 기존 인사 마스터 API는 그대로 두고, 같은 읽기 모델을 사용하는 배차 전용 조회 alias를 추가했다.

- `GET /admin/carriers` 및 `GET /admin/carriers/{code}`: `hr.carriers VIEW` 유지
- `POST /admin/carriers`: `hr.carriers CREATE` 유지
- `PATCH /admin/carriers/{code}`: `hr.carriers UPDATE` 유지
- `DELETE /admin/carriers/{code}`: `hr.carriers DELETE` 유지
- `GET /admin/carriers/dispatch-lookup` 및 `GET /admin/carriers/dispatch-lookup/{code}`: `dispatch.board VIEW`
- 배차그룹 운송사 지정: 기존 `dispatch.board UPDATE` 유지

현재 권한 구조와 불변식은 모순되지 않았다. 수정은 읽기 경로를 분리하는 것으로 한정했다.

## 2. RED-A / RED-B 사전 고정 결과

테스트 코드는 controller alias를 추가하기 전에 먼저 작성하고 실행했다. RED-A는 기존 보호가 유지되는지 확인하는 음성 회귀 묶음이며, 기존 게이트가 이미 정확했으므로 사전 실행에서 통과했다. RED-B는 배차 전용 조회가 기존 `hr.carriers` 게이트에 걸려 사전 실행에서 실패했다. 이를 숨기지 않고 원문을 남긴다.

### RED-A — 기존에 막혀 있어야 하는 경로

실행 명령:

```text
./gradlew.bat :services:slip-service:test --tests 'com.samhanair.logis.slip.it.dispatchgroup.CarrierPermissionAxisIT.A1_without_hr_carriers_cannot_register_update_or_delete' --tests 'com.samhanair.logis.slip.it.dispatchgroup.CarrierPermissionAxisIT.A2_without_hr_carriers_cannot_enter_hr_carrier_list' --tests 'com.samhanair.logis.slip.it.dispatchgroup.CarrierPermissionAxisIT.A3_without_both_permissions_cannot_lookup_carriers' --console=plain --no-daemon
```

사전 실행 원문:

```text
> Task :services:slip-service:test

2026-08-05T09:12:47.807+09:00  INFO 21360 --- [slip-service] [ionShutdownHook] j.LocalContainerEntityManagerFactoryBean : Closing JPA EntityManagerFactory for persistence unit 'default'
2026-08-05T09:12:47.811+09:00  INFO 21360 --- [slip-service] [ionShutdownHook] HikariPool-1 - Shutdown initiated...
2026-08-05T09:12:47.825+09:00  INFO 21360 --- [slip-service] [ionShutdownHook] HikariPool-1 - Shutdown completed.

BUILD SUCCESSFUL in 52s
18 actionable tasks: 1 executed, 17 up-to-date
OpenJDK 64-Bit Server VM warning: Sharing is only supported for boot loader classes that have been appended
```

확인한 내용은 다음과 같다.

- A1: `hr.carriers`가 없으면 등록·수정·삭제 모두 `403`
- A2: `hr.carriers`가 없으면 인사 운송사 목록 `403`
- A3: `hr.carriers`와 `dispatch.board`가 모두 없으면 배차 조회 `403`

### RED-B — 배차담당자에게 열려야 하는 경로

실행 명령:

```text
./gradlew.bat :services:slip-service:test --tests 'com.samhanair.logis.slip.it.dispatchgroup.CarrierPermissionAxisIT.B1_dispatch_board_view_can_lookup_carrier_list_and_detail_without_hr' --tests 'com.samhanair.logis.slip.it.dispatchgroup.CarrierPermissionAxisIT.B2_dispatch_board_view_can_assign_carrier_without_hr' --console=plain --no-daemon
```

수정 전 RED 원문:

```text
> Task :services:slip-service:test

CarrierPermissionAxisIT > B1_dispatch_board_view_can_lookup_carrier_list_and_detail_without_hr() FAILED
    java.lang.AssertionError at CarrierPermissionAxisIT.java:95

> Task :services:slip-service:test FAILED
18 actionable tasks: 1 executed, 17 up-to-date

2 tests completed, 1 failed

FAILURE: Build failed with an exception.

* What went wrong:
Execution failed for task ':services:slip-service:test'.
> There were failing tests. See the report at: file:///D:/dev/Samhan-Public/.claude/worktrees/w1045/services/slip-service/build/reports/tests/test/index.html

BUILD FAILED in 53s
```

B1의 목록 조회가 기존 `hr.carriers` 게이트에서 `403`이 되어 실패했다. B2의 배차그룹 지정은 원래부터 `dispatch.board UPDATE`였으므로 같은 사전 실행에서 통과했다. 즉 수정 전 전체 B 묶음은 2개 중 1개 실패였고, 실패 원인은 조회 경로에 배차 권한 축이 없었던 것이다.

## 3. 구현 및 GREEN 결과

### 백엔드

`services/slip-service/src/main/java/com/samhanair/logis/slip/web/dispatchgroup/CarrierAdminController.java`에 배차 전용 목록·단건 조회 alias를 추가했다. 두 메서드 모두 `@RequirePermission(page = "dispatch.board", action = PermissionAction.VIEW)`이며 실제 변경 서비스는 호출하지 않는다. 기존 HR 목록·단건·CRUD 가드는 변경하지 않았다.

### 데스크톱 FE

- `carrierApi`는 HR 운송사 마스터 화면에서 계속 `/admin/carriers`를 호출한다.
- 배차그룹 화면은 `dispatchCarrierApi.list()`를 통해 `/admin/carriers/dispatch-lookup`을 호출한다.
- API 계약 테스트에서 두 경로를 각각 고정했다.
- mock 응답과 Playwright 시나리오도 배차 조회 alias를 반영했다.
- 배차그룹 라우트의 FE 가드는 `dispatch.board VIEW`, HR 운송사 라우트의 FE 가드는 `hr.carriers VIEW` 그대로다.

### RED-B를 GREEN으로 전환한 원문

```text
> Task :services:slip-service:test

2026-08-05T09:20:29.590+09:00  INFO 22260 --- [slip-service] [ionShutdownHook] j.LocalContainerEntityManagerFactoryBean : Closing JPA EntityManagerFactory for persistence unit 'default'
2026-08-05T09:20:29.598+09:00  INFO 22260 --- [slip-service] HikariPool-1 - Shutdown initiated...
2026-08-05T09:20:29.647+09:00  INFO 22260 --- [slip-service] HikariPool-1 - Shutdown completed.

BUILD SUCCESSFUL in 1m 18s
18 actionable tasks: 2 executed, 16 up-to-date
OpenJDK 64-Bit Server VM warning: Sharing is only supported for boot loader classes that have been appended
```

## 4. 네 가지 권한 조합 표면 확인

추가한 `all_four_permission_combinations_keep_read_and_change_boundaries` 테스트가 같은 MockMvc 컨텍스트에서 네 조합을 순서대로 실행했다.

| `hr.carriers` | `dispatch.board` | HR 목록/CRUD | 배차 목록·단건 조회 | 배차그룹 운송사 지정 |
|---|---|---:|---:|---:|
| 없음 | 없음 | 403 | 403 | 403 |
| 있음 | 없음 | 200 | 403 | 403 |
| 없음 | 있음 | 403 | 200 | 200 |
| 있음 | 있음 | 200 | 200 | 200 |

이 표는 A1~A3, B1~B2의 불변식을 모두 포함하며, 운송사 변경은 네 조합에서 `hr.carriers`에만 남아 있다.

## 5. 세 층 일치 근거

### FE 키 및 화면 가드

`clients/desktop/src/renderer/api/permissionsApi.ts`의 `PageCode` union에 `dispatch.board`와 `hr.carriers`가 모두 존재한다. `PermissionMatrixPage.tsx`의 catalog group/label에도 각각 `배차 보드`와 `운송사 목록`으로 존재한다.

`clients/desktop/src/renderer/routes/index.tsx`는 다음을 유지한다.

- `/admin/carriers` → `PermissionGuard pageCode="hr.carriers" action="view"`
- `/admin/dispatch-groups` → `PermissionGuard pageCode="dispatch.board" action="view"`

배차 화면 API는 `dispatchCarrierApi`로 분리했고, HR 마스터 API인 `carrierApi`의 CRUD 경로는 건드리지 않았다.

### BE 가드

```text
GET    /admin/carriers                         hr.carriers VIEW
GET    /admin/carriers/{code}                  hr.carriers VIEW
GET    /admin/carriers/dispatch-lookup         dispatch.board VIEW
GET    /admin/carriers/dispatch-lookup/{code}  dispatch.board VIEW
POST   /admin/carriers                         hr.carriers CREATE
PATCH  /admin/carriers/{code}                  hr.carriers UPDATE
DELETE /admin/carriers/{code}                  hr.carriers DELETE
PUT    /admin/dispatch-groups/{groupNo}/carrier/{code}  dispatch.board UPDATE (기존)
```

### catalog 및 시드

두 page code와 action 집합은 이미 catalog에 등록되어 있어 새 migration은 필요하지 않았다.

- `services/auth-service/src/main/java/com/samhanair/logis/auth/domain/PageCode.java`: `DISPATCH_BOARD("dispatch.board", ...)`, `HR_CARRIERS("hr.carriers", ...)`
- `services/auth-service/src/main/resources/db/migration/V78__seed_dispatch_board_restore_permission.sql`: MASTER/MANAGER/DISPATCH의 `dispatch.board` action seed 보존
- `services/auth-service/src/main/resources/db/migration/V94__seed_hr_carriers_page_permission.sql`: MASTER/MANAGER의 `hr.carriers` CRUD seed 보존

따라서 FE 키·BE 가드·catalog의 page code가 모두 동일하며, 권한 seed를 새로 만들어 한 층만 어긋나게 하지 않았다.

## 6. 게이트웨이 라우트 근거

새 alias는 새 최상위 경로가 아니라 기존 `/admin/carriers/**` 아래에 추가했다. `services/api-gateway/src/main/resources/application.yml:672`의 `slip-dispatch-admin-noprefix` 라우트가 다음 두 패턴을 이미 포함한다.

```text
/admin/carriers
/admin/carriers/**
```

해당 라우트는 `uri: lb://slip-service`, `JwtAuthentication`, StripPrefix 없음이다. 따라서 `/admin/carriers/dispatch-lookup`와 `/admin/carriers/dispatch-lookup/{code}`는 기존 게이트웨이 보호 범위에 포함된다. `ApiGatewayContextLoadIT.provisionalDispatchAdminRoutes_areAuthenticatedNoStripAndReachable`가 위 두 패턴, no-strip, JwtAuthentication을 회귀 검증하며 통과했다.

게이트웨이 설정 파일은 이번 변경에서 수정하지 않았다. 기존 wildcard가 새 alias를 이미 포함하기 때문이다.

게이트웨이 라우트 테스트 원문:

```text
> Task :services:api-gateway:test

BUILD SUCCESSFUL in 41s
6 actionable tasks: 3 executed, 1 from cache, 2 up-to-date
```

## 7. 워크트리 전체 grep 전수 조사

수정한 권한 코드와 endpoint에 대해 워크트리 전체에서 다음 축을 조사했다.

```text
rg -n "dispatch-lookup|carrierApi\.list|dispatchCarrierApi|hr\.carriers|dispatch\.board|/admin/carriers" .
```

주요 결과:

- 신규 endpoint 호출 정의: `clients/desktop/src/renderer/api/dispatchGroupApi.ts:69,74`
- 신규 endpoint FE contract: `clients/desktop/src/renderer/api/dispatchGroupApi.contract.test.ts:12`
- 신규 endpoint mock: `clients/desktop/src/renderer/api/mock.ts:11512`
- 신규 endpoint BE mapping/guard: `CarrierAdminController.java:39-51`
- 배차 화면 호출부: `DispatchGroupPage.tsx:4,21`에 `dispatchCarrierApi.list`만 존재
- HR 화면 호출부: `CarrierListPage.tsx`의 `carrierApi.list`는 `/admin/carriers`를 유지
- FE page key union: `permissionsApi.ts:147-148`
- FE catalog: `PermissionMatrixPage.tsx:223,326,457,554`
- gateway wildcard: `application.yml:672`, gateway route test `ApiGatewayContextLoadIT.java:364`
- auth catalog/seed: `PageCode.java`, V78, V94에서 기존 두 page code를 확인

dispatch 화면이 옛날 HR master 목록 API를 계속 호출하는 stale call site는 발견하지 못했다. UUID를 운송사 식별자로 새로 노출하지 않았고, alias 단건 응답도 기존 business `code`를 사용한다.

## 8. 실행한 테스트 및 원문

### 백엔드 권한 축 + Spring 컨텍스트 IT

신규 `CarrierPermissionAxisIT`는 `@SpringBootTest(classes = SlipServiceApplication.class)`와 `@AutoConfigureMockMvc`로 실제 Spring 컨텍스트·AOP permission guard·빈 배선을 로드한다. 기존 `DispatchGroupContextIT` 및 `Carrier*` 테스트도 사용자 지정 filter로 함께 실행했다.

사용자 지정 명령:

```text
./gradlew :services:slip-service:test --tests '*Carrier*' --tests '*DispatchGroup*'
```

원문 마지막:

```text
2026-08-05T09:33:50.740+09:00  INFO 26708 --- [slip-service] [ionShutdownHook] j.LocalContainerEntityManagerFactoryBean : Closing JPA EntityManagerFactory for persistence unit 'default'
2026-08-05T09:33:50.740+09:00  INFO 26708 --- [slip-service] com.zaxxer.hikari.HikariDataSource       : HikariPool-3 - Shutdown initiated...
2026-08-05T09:33:50.744+09:00  INFO 26708 --- [slip-service] com.zaxxer.hikari.HikariPool-3 - Shutdown completed.

BUILD SUCCESSFUL in 46s
18 actionable tasks: 2 executed, 16 up-to-date
OpenJDK 64-Bit Server VM warning: Sharing is only supported for boot loader classes because bootstrap classpath has been appended
```

### FE API contract

```text
RUN v2.1.9 D:/dev/Samhan-Public/.claude/worktrees/w1045/clients/desktop
✓ src/renderer/api/dispatchGroupApi.contract.test.ts (3 tests)
Test Files 1 passed (1)
Tests 3 passed (3)
```

### mock Playwright

```text
Running 4 tests using 1 worker
4 passed (29.0s)
```

### TypeScript typecheck

처음 지정 시간 제한 180초 실행은 출력 없이 `Exit code 124`로 시간 초과되어 중단되었고, 같은 명령을 충분한 시간으로 재실행해 통과시켰다.

사용자 지정 명령:

```text
cd clients/desktop && npm run typecheck
```

성공 실행의 마지막 원문:

```text
ℹ tests 50
ℹ pass 50
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 155082.2297
```

typecheck 출력에는 기존 로컬 real-QA 추적 집합 차이(`clients/desktop/playwright/n1b-native-qa/r2fix-untracked-only-real-qa.spec.ts`)가 표시됐지만, 로컬 실행 모드에서 의도 실행으로 허용되었고 총 50개 검사가 모두 통과했다. 해당 파일은 이번 변경으로 만들거나 수정하지 않았다.

## 9. 안 본 것 및 범위 제한

- 컨테이너 재배포와 라이브QA는 요청대로 실행하지 않았다. PM이 별도로 수행할 영역이다.
- 아로로지스 GUI 로그인 후속 오류는 조사하지 않았다.
- 가배차 화면 2:1 레이아웃·드래그·차량 테두리는 조사하지 않았다.
- `docs/handoff/`는 수정하지 않았다.
- `git add`, `git commit`, `git push`는 실행하지 않았다.
- `git diff --check`는 통과했다.

## 10. 신규 파일

- `docs/dev-reports/2026-08-05-1039-s10-carrier-permission-axis.md`
- `services/slip-service/src/test/java/com/samhanair/logis/slip/it/dispatchgroup/CarrierPermissionAxisIT.java`
