# PR #1133 R8 — 되돌림 측정 후 재설계·재수렴

- 라운드: `R8-1095-REVERT-COLLAB`
- 워크트리: `C:\dev\Samhan-Public\.claude\worktrees\t1095`
- 브랜치: `feat/1095-sheet-product-status`
- 기준 HEAD: `8b8f308e1`
- 커밋·push·main 병합: 하지 않음
- 실 QA 캡처: `docs/qa/2026-08-09-1095-r8/`

## 판정 요약

① R6 hydrate를 협업 경로에서 먼저 제거한 되돌림 상태를 3회 실행했다. 세 번 모두 B→A 비고 반영이 20초 안에 끝났고 끊김은 0회였다. 이 결과 R6의 조회가 협업 반영 경로와 결합된 것이 원인 후보로 확정됐다.

조회는 협업 provider 연결과 별도 effect로 분리해 다시 넣었다. 상태 조회가 완료되기 전에도 provider가 즉시 연결·반영되고, 완료 후에는 현재 라인의 `status`만 병합한다.

② 원인은 `ProductService.java:685-688`의 `reactivate()`가 이름 변경 여부와 무관하게 `assertNameAvailable()`을 호출한 것이었다. 부분 수정 경로 `ProductService.java:596-599`은 이미 이름이 실제로 바뀐 경우에만 검사하고 있었다. 이름 유일성 검사 자체는 유지하고 `reactivate()`의 무조건 검사를 제거했다.

## ① 되돌림 상태 측정 원문 — 3회

측정 스펙: `clients/desktop/playwright/1095-r8-collab-revert-real-qa/1095-r8-collab-revert-real-qa.spec.ts`

```json
{
  "qaRound": "R8-1095-REVERT-COLLAB",
  "estimateId": "<redacted-id>",
  "runs": [
    {"run":1,"durationMs":407,"calls":[],"syncedValue":"R8-1095-REVERT-COLLAB-1"},
    {"run":2,"durationMs":396,"calls":[],"syncedValue":"R8-1095-REVERT-COLLAB-2"},
    {"run":3,"durationMs":390,"calls":[],"syncedValue":"R8-1095-REVERT-COLLAB-3"}
  ]
}
```

원문 파일: [`r8-reverted-collab-3-runs.json`](../qa/2026-08-09-1095-r8/r8-reverted-collab-3-runs.json)

되돌림 상태에서의 첫 실행은 lookup 0회였고도 협업 반영은 407ms였다. 이후 재설계 후 같은 3회는 최초 hydrate lookup이 사용자 A/B 각 1회, 후속 2회는 추가 lookup 0회였으며 반영 시간은 405/389/397ms였다. 캡처는 [`01-reverted-collab-three-runs.png`](../qa/2026-08-09-1095-r8/01-reverted-collab-three-runs.png)이다.

## ② 원인 확정 및 RED/GREEN 원문

### fix 전 RED

회귀 테스트를 먼저 추가하고 fix 전 실행했다.

```text
ProductServiceTest > reactivate_existingDuplicateName_isAllowed_whenNameWasNotChanged() FAILED
    com.samhanair.logis.common.exception.BusinessException at ProductServiceTest.java:746
1 test completed, 1 failed
BUILD FAILED
```

### fix 후 관리자 API 원문

```json
{
  "tagsMutation": {"http": 200},
  "reactivateAfterFix": {"http": 204, "body": ""},
  "renameToDuplicate": {
    "http": 409,
    "body": "{\"success\":false,\"code\":\"CONFLICT\",\"message\":\"이미 사용 중인 품목명입니다: 한경희 선풍기 (충돌 품목 모델코드: 0000098)\",\"data\":null}"
  },
  "cleanup": {"statusAfterSync":"ACTIVE","discontinueHttp":204,"tagsHttp":200}
}
```

실제 이름이 같았던 `AR60F07C12WS`를 충돌 후보로 처음 사용한 시도는 이름 변경이 아니어서 200이었다. 그 원문은 `r8-admin-api-observations.json`에 보존되어 있으며, 다른 이름 `0000098 / 한경희 선풍기`로 재실행해 RED-B② 409를 확정했다.

### 코드 근거

- 이름이 실제로 바뀔 때만 검사: `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductService.java:596-599`
- 이름 유일성 규칙 본체 유지: 같은 파일 `:639-652`
- 상태 복구는 이름 검사 없이 상태만 변경: 같은 파일 `:685-688`
- 협업 밖 비동기 상태 hydrate: `clients/desktop/src/renderer/routes/EstimateFormPage.tsx:907-926`

## RED 불변식 결과

| 항목 | 결과 |
|---|---|
| RED-A① 되돌림 협업 3회 끊김 0 | 통과, 407/396/390ms |
| RED-B① 상대 화면 상태 반영 | R6 helper 재사용 및 재설계 후 최초 lookup A/B 200, UI 협업 3회 통과 |
| RED-A② 이름 불변 tags/status 수정 | tags 200, reactivate 204 |
| RED-B② 실제 중복 이름 변경 거부 | PATCH 409, `CONFLICT`, 모델코드 `0000098` |
| RED-C 저장본/신규선택/복제 품절 잠금·안전재고 fail-soft | R6 코드 유지. FE 59 테스트와 ProductService 75 테스트 통과. SafetyStockService 테스트는 아래 환경 잠금으로 미완료 |

## 저장된 품절 견적 재열기 검증 및 DB 복구 상태

R8에서도 실제 표본 생성 전제인 “ACTIVE → 시트 sync로 OUT_OF_STOCK”을 완주할 수 없었다. 복구 시도 원문은 다음과 같다.

```text
POST /api/v1/products/admin/sync
HTTP 502
code=SYNC_FAILED
error=Service Account JSON 키가 존재하지 않습니다: /etc/samhan/sa-key.json
      — GOOGLE_SERVICE_ACCOUNT_KEY 환경변수 확인
```

따라서 저장된 품절 견적 재열기 캡처와 `stored_out_of_stock_estimate_lines` 생성은 못 했다. 공유 DB에 직접 UPDATE/INSERT는 하지 않았고, API 정리 후 현재 분포는 다음과 같다.

```text
    status    | count
--------------+-------
 ACTIVE       | 2984
 DISCONTINUED |   84
 NOT_FOR_SALE |   14
 OUT_OF_STOCK |    2
```

R7 기준선 `ACTIVE 2984 / DISCONTINUED 83 / NOT_FOR_SALE 14 / OUT_OF_STOCK 3`에서 R8 표본 `AR60F09C13WS`를 시트 sync로 원래 `OUT_OF_STOCK`으로 되돌릴 수 없었던 것이 차이다. 이 잔류 상태는 개발 API로 임의 조작하지 않았다. threshold-0 2건, soft-delete 표본 1건, `R5-TEMP-RESTORE-AC060CS6PBH1SY`는 판정·복구 대상에서 제외했다.

## 검증 명령 결과

- `npm test -- src/renderer/routes/EstimateFormPage.coedit.test.tsx src/renderer/utils/estimateLineStatus.test.ts`: **59/59 통과**
- `./gradlew :services:product-service:test --tests ...ProductServiceTest`: **75/75 통과**
- `npx eslint src/renderer/routes/EstimateFormPage.tsx src/renderer/utils/estimateLineStatus.ts`: **통과**
- R8 실 Playwright 협업 스펙: **1/1 통과**, 내부 3회 측정
- R8 실 관리자 API 스펙: **1/1 통과**
- `SafetyStockServiceTest`: 기존 `build/test-results/test/binary/output.bin` Windows 파일 잠금으로 Gradle이 결과 디렉터리를 삭제하지 못해 실행 미완료. 소스 변경 실패가 아니라 환경 오류다.
- `npm run typecheck`: `tsc` 단계는 통과했으나 real-QA scope가 새 미추적 R8 스펙을 공식 추적 집합에 넣지 않은 상태라 종료 1. PM이 신규 스펙을 stage한 뒤 공식 scope를 재실행해야 한다.

## 신규 파일

- `clients/desktop/playwright/1095-r8-collab-revert-real-qa/playwright.config.ts`
- `clients/desktop/playwright/1095-r8-collab-revert-real-qa/1095-r8-collab-revert-real-qa.spec.ts`
- `docs/dev-reports/2026-08-09-1095-r8-revert-and-refix.md`
- `docs/qa/2026-08-09-1095-r8/01-reverted-collab-three-runs.png`
- `docs/qa/2026-08-09-1095-r8/r8-reverted-collab-3-runs.json`
- `docs/qa/2026-08-09-1095-r8/r8-admin-api-observations.json`

자격증명·Bearer·UUID는 캡처와 원문에서 `<redacted>` 또는 `<redacted-id>`로 처리했다. `tools/legacy-gas/**`는 변경하지 않았다.

## 별도 기존 변경

`services/inventory-service/src/test/java/com/samhanair/logis/inventory/it/SafetyStockControllerIT.java`에는 작업 시작 후에도 별도 변경이 보였으며, 본 R8 작업에서는 수정하지 않고 보존했다. 해당 diff는 `lookup()`을 `lookupAllowMissing()`으로 바꾸는 R6 계열 변경이다.

## 2026-08-10 PR #1133 CI 회귀 — SafetyStock R6 되돌림 판정

### 실패 원문

R6 상태에서 테스트를 먼저 실행했다.

```text
SafetyStockControllerIT > 알림 목록: 임계값 설정 후 재고 없으면 알림 포함 → 200 + 1건 이상 FAILED
    java.lang.AssertionError at SafetyStockControllerIT.java:284

12 tests completed, 1 failed
BUILD FAILED
```

`:284`는 알림 건수 단정이 아니다. 해당 productId의 `productCode`가 `TEST-CODE-`로 enrich되는지 확인하는 단정이다.
알림 row 자체와 `threshold=50`, `shortage>=1`은 통과했고, R6가 `lookup()`을 `lookupAllowMissing()`으로 바꾼 뒤 IT의 `lookup()` mock만 남아 정상 품목의 productCode/productName이 null이 된 것이 직접 원인이다.

### 되돌림 우선 원문

`SafetyStockService`의 R6 변경 한 줄만 임시로 `lookupAllowMissing(chunk)` → `lookup(chunk)`으로 되돌려 동일 테스트를 실행했다. 테스트 파일의 assertion은 변경하지 않았다.

```text
BUILD SUCCESSFUL in 1m 1s
18 actionable tasks: 2 executed, 16 up-to-date
SafetyStockControllerIT: 12 tests, 0 failed
```

따라서 R6 호출 변경이 CI 회귀의 원인임을 확정했다. 단, 운영 불변식인 “stale 항목이 batch에 섞여도 정상 항목의 코드·이름이 보인다”를 위해 production은 `lookupAllowMissing()`으로 복원했다.

### 최종 fix

테스트 assertion을 새 동작에 맞춰 바꾸지 않고, R6 collaborator 계약에 맞게 `SafetyStockControllerIT`의 기존 enrich stub 대상만 `lookupAllowMissing()`으로 연결했다.

- stale partial lookup 단위 테스트 유지: 정상 `ACTIVE-CODE`/`ACTIVE-MODEL` 보존, stale row만 null
- 임계값 설정 후 재고 없음 알림 불변식 유지
- `lookupAllowMissing()` production fail-soft 유지

### 최종 검증 원문

```text
SafetyStockServiceTest
BUILD SUCCESSFUL in 31s

SafetyStockControllerIT
BUILD SUCCESSFUL in 59s

:services:inventory-service:test
BUILD SUCCESSFUL in 2m 50s
```

전체 inventory-service 테스트는 실패 0건으로 종료됐다. 중간에 두 Gradle 프로세스를 병렬 실행해 compile output/file lock 오류가 발생했으나, Gradle daemon을 중지한 뒤 순차 실행으로 재검증했다. 해당 환경 오류는 최종 결과에 포함되지 않는다.
