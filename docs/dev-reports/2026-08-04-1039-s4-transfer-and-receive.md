# S4 전송(⑤) + 아로로지스 수신 전환

## 시작 기록

- 작업 디렉터리: `C:/dev/Samhan-Public/.claude/worktrees/t1039`
- 브랜치: `feat/1039-provisional-dispatch`
- 시작 HEAD: `731840701e3206aceef2fd796e363624e3f38ad1`
- 범위: `slip-service → arologis-service` 아로로지스 운송사 그룹 전송 계약, 삼한 전송 UI, 아로로지스 수신 전용 표시, 필요 시 legacy 8모드 UI 되돌림
- 커밋/푸시: 이번 작업에서 수행하지 않음 (PM 대행)

## 확정 RED 원문

```text
RED-A1  is_arologis=true 그룹을 전송하면 아로로지스에 그 그룹이 나타난다
RED-A2  is_arologis=false 그룹은 전송되지 않고 삼한에 기록만 남는다
RED-A3  같은 그룹을 두 번 전송해도 아로로지스에 중복 생성되지 않는다
RED-B1  S1~S3b 가 세운 것이 그대로 동작한다
        (그룹 CRUD · 전표 편입/제외 · 운송사 지정 · 활성 행 기준 지목 · @Version 충돌)
RED-B2  가배차 8모드 판정 결과가 변하지 않는다
```

## 설계·구현 기록

개발책임자 승인 설계: 삼한의 `POST /admin/dispatch-groups/{groupNo}/transfer`가 전송 대상을 검증하고 아로로지스 수신 계약을 호출한다. `groupNo`를 멱등 키로 사용하되 삼한의 활성 그룹 유일 인덱스가 보장하는 현재 활성 그룹만 전송하며, 삼한에서 그룹을 soft-delete한 뒤 같은 `groupNo`로 새 활성 그룹을 만든 경우에는 새 그룹의 현재 내용을 아로로지스가 대체 수신한다. 전송 성공은 `SENT`, 네트워크·수신 장애는 `FAILED`로 기록하고 재시도 가능하게 하며, 아로로지스는 이미 같은 활성 `groupNo`를 수신한 경우 중복 생성 없이 기존 수신 결과를 반환한다. `is_arologis=true`이면서 활성 운송사가 지정된 그룹만 전송 대상이고, 그 외 그룹은 호출 자체를 하지 않는다. 전송 성공 후 삼한 그룹은 수정·삭제·전표 편입/제외·운송사 변경을 막고 사유를 표시하며, 아로로지스 수신 화면은 표시 전용이다. 기존 가배차 판정 규칙은 변경하지 않고 legacy 8모드 되돌림은 마지막에 계약·Playwright 영향 확인 후 결정한다.

## 구현 계획

1. 삼한 전송 계약과 멱등/실패 상태를 RED→GREEN으로 구현하고 아로로지스 수신 저장·조회 계약을 연결한다.
2. 삼한 배차 그룹 화면에 대상 판정, 확인 단계, 전송/재시도, 전송 후 잠금 사유를 추가한다.
3. 아로로지스 데스크톱을 수신 전용 그룹 표시 화면으로 추가하고 mock·계약·Playwright를 동기화한다.
4. 마지막에 legacy 8모드 되돌림의 영향 테스트를 확인해 안전할 때만 제거한다.

## 구현 결과

### 전송 계약·멱등 수단

- 삼한 endpoint: `POST /admin/dispatch-groups/{groupNo}/transfer`
- 아로로지스 내부 수신 endpoint: `POST /internal/arologis/dispatch-groups`
- 아로로지스 조회 endpoint: `GET /admin/arologis/dispatch-groups?dispatchDate=...`
- 전송 대상: 활성 운송사 지정 + `is_arologis=true` + 활성 전표 1건 이상 + `transferStatus != SENT`.
- 비대상 그룹은 client 호출 전에 삼한 서비스에서 거절한다.
- `FAILED`는 네트워크/수신 오류를 저장하고 재시도 버튼을 노출한다.
- 아로로지스 `received_dispatch_groups`의 active unique `group_no`가 중복 생성을 막는다. 같은 번호가 삼한에서 soft-delete 후 재생성되면 수신 endpoint가 기존 snapshot을 최신 snapshot으로 교체하여 새 활성 그룹을 보게 한다.
- `SENT` 그룹은 수정·삭제·운송사 변경·전표 편입/제외·순서 변경을 BE와 UI 양쪽에서 잠근다.

### RED 원문 및 결과

```text
RED-A1  is_arologis=true 그룹을 전송하면 아로로지스에 그 그룹이 나타난다
RED-A2  is_arologis=false 그룹은 전송되지 않고 삼한에 기록만 남는다
RED-A3  같은 그룹을 두 번 전송해도 아로로지스에 중복 생성되지 않는다
RED-B1  S1~S3b 가 세운 것이 그대로 동작한다
        (그룹 CRUD · 전표 편입/제외 · 운송사 지정 · 활성 행 기준 지목 · @Version 충돌)
RED-B2  가배차 8모드 판정 결과가 변하지 않는다
```

- 도메인 RED: `DispatchGroupTransferContractTest`가 메서드 부재로 컴파일 실패 확인.
- GREEN: 동일 테스트 통과. `:services:slip-service:test --tests '*DispatchGroupTransferContractTest'` 성공.
- RED-A1~A3는 수신 endpoint·active unique·snapshot 교체 계약으로 구현했으나 실제 DB 간 왕복 IT는 Docker 금지 조건으로 수행하지 않았다.
- RED-B1: `DispatchGroupContextIT` 성공 및 기존 arologis `DispatchReceiveServiceTest` 성공.
- RED-B2: 기존 slip/arologis pre-classify 테스트 계약을 변경하지 않았고 관련 service 테스트 집합이 유지된다.

### 새 조합 열거 및 결과

| 조합 | 결과 |
|---|---|
| 운송사 미지정 그룹 전송 | 삼한에서 호출하지 않고 `CONFLICT`; UI 전송 버튼 없음 |
| 전송 후 운송사 변경 | `SENT` mutation 잠금, 사유 표시 |
| 전송 후 전표 제외 | `SENT` 현장 mutation 잠금, 사유 표시 |
| 아로로지스 운송사 비활성화 후 전송 | BE가 `isActive=false`를 다시 검증해 호출하지 않음 |
| 전송 실패 후 재시도 | `FAILED` 저장 후 재시도 가능; 수신측 active unique로 중복 생성 방지 |

### legacy 8모드 되돌림

`clients/arologis-desktop/.../dispatches/PreClassifyPage.tsx`의 분류 UI를 수신 전용 화면 export로 교체했다. 기존 mode 저장·복원 계약 테스트는 수신 전용 계약으로 교체했고 2/2 통과했다. 가배차 판정 BE/API와 삼한 desktop의 S2 판정 코드는 건드리지 않았다.

### 종료조건 명령·출력 원문

```text
.\gradlew.bat :services:slip-service:compileJava :services:arologis-service:compileJava --no-daemon
BUILD SUCCESSFUL

.\gradlew.bat :services:slip-service:test --tests '*DispatchGroupTransferContractTest' :services:arologis-service:test --tests '*DispatchReceiveServiceTest' --no-daemon
BUILD SUCCESSFUL

.\gradlew.bat :services:slip-service:test --tests '*DispatchGroupContextIT' --no-daemon
BUILD SUCCESSFUL

clients/desktop: npm run typecheck
clients/desktop: npm test -- --run
exit 0

clients/arologis-desktop: npm run typecheck
exit 0

clients/arologis-desktop: npm run test -- --run src/renderer/routes/dispatches/PreClassifyPage.contract.test.ts
Test Files 1 passed · Tests 2 passed

clients/desktop: npx playwright test playwright/1039-s3-dispatch-group-mock.spec.ts --reporter=line
2 failed: both pages rendered "접근 권한이 없습니다" (actual role MANAGER), so testids were absent.
```

### Playwright 실패 원인 재수렴

초기 실패 당시 화면은 `현재 role: MANAGER`와 `접근 권한이 없습니다`를 보였다. 소스 전수 확인 결과 `mockLocationParams()`는 hash query의 `mockRole=MASTER`를 정상 해석하고, `dispatch.board`·`hr.carriers` 모두 MASTER/MANAGER 권한 fixture에 등록되어 있어 제품 권한 가설 B가 아니었다. Playwright 설정의 `reuseExistingServer: !CI` 때문에 다른 실행에서 남은 5173 Vite 서버가 재사용된 환경/mock harness 문제(A측)였다.

재검증 명령:

```text
$env:CI='1'; npx playwright test playwright/1039-s3-dispatch-group-mock.spec.ts --reporter=line
Running 2 tests using 1 worker
2 passed (4.3s)
```

따라서 배차담당자 권한 설계를 변경하지 않았고, 전송은 기존 S1 권한 축인 `dispatch.board`를 그대로 사용한다.

### legacy 8모드 되돌림 영향 보강

기존 `PreClassifyPage.contract.test.ts`는 `saveDispatchHistory`, `DispatchExecutionMode`, `setExecutionMode` 등 8모드 저장·복원을 직접 단언했으므로 제거 후 실패했다. 이를 수신 전용 export와 “8모드 상태가 없음” 계약으로 교체해 `2 tests passed`로 맞췄다. 가배차 판정 서비스 테스트는 기존 mode 열거와 결과 단언을 유지해 S2 판정 권위를 보존했다.

### 참조 전수 조사

`rg -n "dispatch-groups/.*/transfer|ReceivedDispatchGroup|transferStatus|received-dispatch-groups|EXECUTION_MODES|DispatchExecutionMode" services clients docs/dev-reports/2026-08-04-1039-s4-transfer-and-receive.md` 실행 결과 신규 endpoint·상태·mock·계약·legacy 잔여 참조를 확인했다. 아로로지스 API 모듈의 기존 `DispatchExecutionMode`는 다른 legacy API/test가 공유하므로 제거하지 않았고, 화면 진입점은 수신 전용으로 교체했다.

## 변경 파일

### 신규 파일

- `docs/dev-reports/2026-08-04-1039-s4-transfer-and-receive.md`
- `docs/superpowers/plans/2026-08-04-1039-s4-transfer-receive.md`
- `services/slip-service/src/main/java/com/samhanair/logis/slip/client/ArologisDispatchGroupClient.java`
- `services/slip-service/src/main/java/com/samhanair/logis/slip/dto/dispatchgroup/DispatchGroupTransferRequest.java`
- `services/slip-service/src/test/java/com/samhanair/logis/slip/domain/dispatchgroup/DispatchGroupTransferContractTest.java`
- `services/arologis-service/src/main/java/com/samhanair/logis/arologis/domain/ReceivedDispatchGroup.java`
- `services/arologis-service/src/main/java/com/samhanair/logis/arologis/dto/dispatch/ReceivedDispatchGroupRequest.java`
- `services/arologis-service/src/main/java/com/samhanair/logis/arologis/repository/ReceivedDispatchGroupRepository.java`
- `services/arologis-service/src/main/java/com/samhanair/logis/arologis/service/dispatch/ReceivedDispatchGroupService.java`
- `services/arologis-service/src/main/java/com/samhanair/logis/arologis/web/ReceivedDispatchGroupController.java`
- `services/arologis-service/src/main/resources/db/migration/V25__received_dispatch_groups.sql`
- `clients/arologis-desktop/src/renderer/api/receivedDispatchGroups.ts`
- `clients/arologis-desktop/src/renderer/routes/dispatches/ReceivedGroupsPage.tsx`

### 기존 파일 수정

- `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/dispatchgroup/DispatchGroup.java`
- `services/slip-service/src/main/java/com/samhanair/logis/slip/service/dispatchgroup/DispatchGroupService.java`
- `services/slip-service/src/main/java/com/samhanair/logis/slip/web/dispatchgroup/DispatchGroupAdminController.java`
- `clients/desktop/src/renderer/api/dispatchGroupApi.ts`
- `clients/desktop/src/renderer/api/dispatchGroupApi.contract.test.ts`
- `clients/desktop/src/renderer/api/mock.ts`
- `clients/desktop/src/renderer/routes/DispatchGroupPage.tsx`
- `clients/desktop/playwright/1039-s3-dispatch-group-mock.spec.ts`
- `clients/arologis-desktop/src/renderer/api/mock.ts`
- `clients/arologis-desktop/src/renderer/routes/index.tsx`
- `clients/arologis-desktop/src/renderer/routes/dispatches/PreClassifyPage.tsx`
- `clients/arologis-desktop/src/renderer/routes/dispatches/PreClassifyPage.contract.test.ts`
