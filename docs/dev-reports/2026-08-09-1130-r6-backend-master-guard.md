# PR #1130 R6 — 백엔드 MASTER 전권 단정 및 V98 라이브 확인

## 판정

- 백엔드 전권 계약은 두 실 경로에서 단정했다.
- SOL 변이(`PermissionAdminController#allPageActions()`에서 `inbound.inspection`의 `PRINT` 제거)는 백엔드 테스트에서 RED가 됐고, 원복 후 GREEN을 확인했다.
- auth-service 재기동으로 Flyway V98이 적용됐다. V98 파일은 수정하지 않았다.
- 현재 워크트리의 migration tree에는 V97 파일이 없고, auth DB도 재기동 전 V96이었다. 따라서 이번 기동에서 실제 적용된 것은 V98 1건이며, V97은 #1145 소관으로 임의 복원·수정하지 않았다.
- 발화 조건 `INBOUND + INSPECTING`은 slip DB에서 2건이다.
- 다만 inventory DB의 `inbound_inspections` PENDING 행과 실 목록 API가 0건이다. 따라서 완료 버튼 상태는 **판정 불가**다. 표본이 없는데 활성이라고 추정하지 않았다.

## 1. 백엔드 단정 위치와 적대 변이

### 컨트롤러 전권 map

- 생산 코드: `services/auth-service/src/main/java/com/samhanair/logis/auth/web/PermissionAdminController.java:322-325`
  - `allPageActions()`가 `PageCode.values()`의 모든 code에 `PermissionAction.values()`의 7개 이름을 넣는다.
- 단정 테스트: `services/auth-service/src/test/java/com/samhanair/logis/auth/web/PermissionAdminControllerTest.java:84-103`
  - 응답 key가 `PageCode.values()` 전체인지 확인한다.
  - 전 code마다 `VIEW, CREATE, UPDATE, DELETE, RESTORE, DOWNLOAD, PRINT` 7개인지 확인한다.

SOL 변이 재현:

```text
PermissionAdminController#allPageActions()에서 inbound.inspection에 PRINT 제거
→ PermissionAdminControllerTest > GET /my X-Is-System-Master=true — 모든 PageCode 에 7-action 전체 허용 map 반환 FAILED
→ java.lang.AssertionError at PermissionAdminControllerTest.java:103
→ 36 tests completed, 1 failed
→ BUILD FAILED
```

변이를 즉시 원복하고 같은 묶음을 다시 실행해 `BUILD SUCCESSFUL`을 확인했다.

### DynamicPermissionService 전권 경로

- 생산 코드: `services/auth-service/src/main/java/com/samhanair/logis/auth/service/DynamicPermissionService.java:199-205`
- 단정 테스트: `services/auth-service/src/test/java/com/samhanair/logis/auth/service/DynamicPermissionServiceTest.java:228-244`
  - `getMyPermissions("MASTER")` 결과 크기를 `PageCode.values().length`로 비교한다.
  - 반환된 모든 page code가 전부 포함되고, 모든 DTO가 MASTER / view=true / edit=true / override=true인지 확인한다.

mock 미러 단정은 유지했다.

- `clients/desktop/src/renderer/test-utils/inbound-permission-contract.test.ts`
- 결과: `1 test passed`

## 2. V98 적용 전후 및 라이브 권한

직접 DB INSERT/UPDATE/DELETE는 수행하지 않았다. auth-service 재기동만으로 적용했다.

재기동 명령:

```powershell
docker compose -f docker-compose.yml -f docker-compose.local-all.yml -f docker-compose.slip-port-override.yml up -d --build --no-deps auth-service
```

로그:

```text
Successfully applied 1 migration to schema "public", now at version v98
Started AuthServiceApplication
```

| 읽기 시점 | MANAGER template / group / dev_manager cache | MASTER template | SALES template/cache |
|---|---|---|---|
| 적용 전(V96) | inbound UPDATE=false | 전권 유지 | 거부 유지 |
| 적용 후(V98) | inbound UPDATE=true, 나머지 bit 보존 | 전권 유지 | 거부 유지 |

후판독의 `modified_by`는 MANAGER 대상 행만 `v98-manager-inbound-inspection`으로 바뀌었다. SALES 행은 기존 audit 값을 유지했다.

실 API(`GET /auth/admin/permissions/my`) 결과:

- MANAGER: `inbound.inspection = [VIEW, UPDATE]`
- MASTER: 200 page code, 각 7 action
- SALES: `inbound.inspection`에 UPDATE 없음

완료 mutation은 호출하지 않았다.

## 3. 발화 조건과 라이브 QA

읽기 전용 slip DB count:

```text
INBOUND + INSPECTING + is_deleted=false = 2
2026/08/08-3  d0bae4ad-cda1-431f-ba74-6135162d2f63
2026/08/08-4  8f2d7b99-4226-4f01-a901-68c8a1c85f39
```

하지만 inventory DB:

```text
inbound_inspections status=PENDING + is_deleted=false = 0
GET /api/v1/inventory/inbound-inspections?page=0&size=50 → totalElements=0
```

따라서 MANAGER/MASTER/권한 없는 역할의 완료 버튼은 UI 표본 자체가 없어 **판정 불가**다. MANAGER 화면의 빈 목록 캡처는 다음이다.

![MANAGER 입고 검수 표본 없음](../qa/1130-r6-backend-master-guard/_local/01-manager-inspection-sample-unavailable.png)

라이브 Playwright는 `clients/desktop` 패키지 안에서 실행했고, `vite.web.config.ts`의 실 API 경로(`VITE_MOCK_MODE` mock 미사용), `headless: true`, `resolveQaShotsDir`를 사용했다. 실행 결과는 `1 passed`이며, 종료 후 Vite 프로세스도 회수했다.

## 4. 검증 결과

```text
./gradlew :services:auth-service:test --tests '*Permission*' --rerun-tasks
BUILD SUCCESSFUL

npx vitest run src/renderer/test-utils/inbound-permission-contract.test.ts
1 test passed

npx playwright test --config=playwright/1130-r6-backend-master-guard-real-qa/playwright.config.ts --project=chromium --reporter=line
1 passed
```

## 신규 파일 경로

- `services/auth-service/src/test/java/com/samhanair/logis/auth/service/DynamicPermissionServiceTest.java` — MASTER service 경로 단정 추가
- `services/auth-service/src/test/java/com/samhanair/logis/auth/web/PermissionAdminControllerTest.java` — 컨트롤러 전 code 단정 강화
- `clients/desktop/playwright/1130-r6-backend-master-guard-real-qa/1130-r6-backend-master-guard-real-qa.spec.ts` — 실 API/라이브 QA
- `clients/desktop/playwright/1130-r6-backend-master-guard-real-qa/playwright.config.ts` — real-qa 전용 config
- `docs/qa/1130-r6-backend-master-guard/_local/01-manager-inspection-sample-unavailable.png` — 실 화면 캡처
