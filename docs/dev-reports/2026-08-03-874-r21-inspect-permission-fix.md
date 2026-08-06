# PR #1057 fix 라운드 — `PROCESSING → INSPECTING` 실사용 경로

## 작업 목표

- OUTBOUND 전표가 `PROCESSING → INSPECTING`으로 진행 가능한 실사용 경로를 확보한다.
- INBOUND 전표의 `inbound.inspection` 권한 가드는 유지한다.
- 403의 실제 출처를 코드 원문과 실패 테스트로 확정한다.

## 진행 로그

### 시작

- `git pull`: `Already up to date.`
- 커밋·푸시 및 Docker 조작은 수행하지 않는다.

### RED

실패 테스트: `clients/desktop/src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts`

실행 명령:

```text
npx vitest run src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts
```

RED 원문:

```text
❯ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts (1 test | 1 failed)
× SlipDetailPage lifecycle contract > PROCESSING action calls the backend complete transition to enter INSPECTING
  → expected '...' to match /case 'PROCESSING':\s*return \['complete'\].*PROCESSING → INSPECTING/

Test Files  1 failed
Tests       1 failed
```

현재 프런트 원문은 `case 'PROCESSING': return ['inspect']`이므로 의도한 계약을 잡아내며 실패했다.

### 원인 확정

백엔드 원문:

```text
services/slip-service/src/main/java/.../SlipController.java:501
@PostMapping("/{id}/process")
public ... process(...) { return ... slipService.process(id); }

services/slip-service/src/main/java/.../SlipController.java:519
@PostMapping("/{id}/inspect")
public ... inspect(...) { ... return ... slipService.inspect(id, ...); }
```

도메인/서비스 테스트 원문:

```text
SlipServiceTest.java:307  complete (출고 완료) = PROCESSING → INSPECTING
SlipServiceTest.java:687  PROCESSING 에서 inspect 시도 → 409
SlipDomainTest.java:384  inspectFromProcessing_throwsConflict_inspectingRequired
SlipDomainTest.java:399  completeFromProcessing_movesToInspecting
```

따라서 `PROCESSING → INSPECTING` 실사용 경로가 없었던 실제 원인은 프런트의 `PROCESSING → inspect` 잘못된 전이 선택이다. 현재 소스에서 OUTBOUND `inspect`의 403을 낼 수 있는 지점은 공통 `@RequirePermission` AOP(게이트웨이에서 주입된 계정/권한 헤더 포함)뿐이며, `inspect` 내부의 `inbound.inspection` 가드는 `SlipType.INBOUND`일 때만 실행되어 OUTBOUND에서는 도달하지 않는다. 이 작업 환경에서는 라이브 7차의 원시 HTTP 헤더/게이트웨이 로그를 재수집하지 않았으므로 “동일 계정·동일 헤더인데 AOP가 inspect만 403”인 배포 상태 자체는 단정하지 않는다. 다만 AOP를 통과해 `inspect` 본문까지 도달하면 현재 상태 `PROCESSING`에서는 서비스가 409를 반환한다는 도메인 테스트 원문이 있다. `inbound.inspection`은 수정하지 않는다.

### 수정 및 GREEN

수정 내용:

- `SlipDetailPage.actionsForStatus(PROCESSING)`의 다음 액션을 `inspect` → `complete`로 변경했다.
- `PROCESSING + complete`의 사용자 문구는 `검수 시작`으로 유지하고, `INSPECTING + complete`는 기존 `처리 완료`를 유지했다.
- `SlipController`의 `inspect`/`complete` Javadoc 및 OpenAPI 설명을 실제 도메인 전이와 맞췄다.
- `inbound.inspection` 추가 가드는 코드 변경 없이 유지했다.

GREEN 원문:

```text
npx vitest run src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts

✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts (2 tests)
Test Files  1 passed (1)
Tests       2 passed (2)
```

백엔드 상태 계약 회귀 GREEN 원문:

```text
& .\gradlew.bat :services:slip-service:test --tests 'com.samhanair.logis.slip.domain.SlipDomainTest' --tests 'com.samhanair.logis.slip.service.SlipServiceTest' --no-daemon

BUILD SUCCESSFUL in 46s
18 actionable tasks: 4 executed, 14 up-to-date
```

보조 검증:

```text
npx tsc -p tsconfig.node.json --noEmit  → Exit code 0
npx tsc -p tsconfig.web.json --noEmit   → Exit code 0
```

`npm run typecheck` 전체 명령은 코드 컴파일 오류가 아니라 기존 사용자 미추적 파일 때문에 real-QA 집합 게이트에서 중단됐다.

```text
✖ real-QA 공식 수집 집합은 현재 Git 추적 집합과 이름 단위로 일치한다
미추적: clients/desktop/playwright/874-riusage-real-qa.spec.ts
```

이 파일은 사용자 산출물이므로 삭제·추적 추가·수정하지 않았다.

### 역할별 실측

현재 저장소 권한 계약(V36 role seed 및 V39/V44 account materializer 경로) 기준 전이 가능 역할은 4개, 불가 역할은 3개다. 이 표는 DB 쓰기 없이 저장소에 있는 실제 권한 seed를 읽어 산출한 것이며, 라이브 DB를 조회하거나 기존 데이터를 변경하지 않았다.

| 역할 | `slip.transfer.process UPDATE` | OUTBOUND `PROCESSING → INSPECTING` | INBOUND `inbound.inspection UPDATE` | 근거 |
|---|---:|---:|---:|---|
| MASTER | 가능 | 가능 | 가능 | V36 84, system-master bypass |
| MANAGER | 가능 | 가능 | 불가(기본 seed) | V36 85, V7 89 |
| WAREHOUSE | 가능 | 가능 | 가능 | V36 86, V7 131 |
| INVENTORY | 가능 | 가능 | 가능 | V36 87, V7 159 |
| DEVELOPER | 불가 | 불가 | 불가 | V36 전이 grant 없음 |
| SALES | 불가 | 불가 | 불가 | V36 전이 grant 없음 |
| ACCOUNTANT | 불가 | 불가 | 불가 | V36 전이 grant 없음 |

중요한 경계: 이번 수정은 권한 seed나 `@RequirePermission`을 열지 않았다. 프런트가 OUTBOUND에서 이미 보유한 `slip.transfer.process UPDATE` 판정을 사용해 `complete` endpoint를 호출하도록 맞췄다. MANAGER의 INBOUND 검수는 기존 `inbound.inspection` 계정 가드가 없으면 계속 거부된다.

### INBOUND 가드 유지 확인

회귀 테스트는 다음 두 원문을 확인한다.

```text
if (SlipType.INBOUND.equals(slipType)) {
    requireAccountPermission(callerHeader, INBOUND_INSPECTION_PAGE_CODE, PermissionAction.UPDATE);
}
```

`process`/`complete`/`inspect`의 공통 `@RequirePermission(page="slip.transfer.process", action=UPDATE)`는 유지되며, INBOUND 전용 추가 가드도 제거하지 않았다.

### 새 파일 목록

- `docs/dev-reports/2026-08-03-874-r21-inspect-permission-fix.md`
- `clients/desktop/src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts`

### 최종 상태

- 수정 파일: `clients/desktop/src/renderer/routes/SlipDetailPage.tsx`, `services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipController.java`
- `git diff --check`: 통과
- 커밋·푸시: 미수행
- Docker build/up/restart: 미수행
- 기존 미추적 사용자 파일 2개(`docs/dev-reports/2026-08-03-874-live-qa-5.md`, `clients/desktop/playwright/874-riusage-real-qa.spec.ts`)는 변경하지 않음
