# 2026-08-12 #1143 라이브QA 결함 수정 — CODEX LUNA

## 범위

- 대상: `feat/1111-1143-bundle-component`
- 공유 DB 쓰기: 0건. 이번 라운드에서 격리 DB를 새로 기동하지 않았다.
- 기존 라이브QA 보고서와 스크린샷 10장을 선행 확인했다.
- 활성 수치 기준: `UI_HOME_MULTI_AM052BN6PBH1` 활성 target **3건**. 전체 26건 중 소프트삭제 23건은 대상에서 제외한다.

## RED 원문

### 1. 견적품목 관리 무한 재렌더

재현 테스트: `clients/desktop/src/renderer/routes/EstimateItemsCatalogPage.test.ts`

```text
EstimateItemsCatalogPage live-QA regressions
  × 모달이 열린 뒤 렌더 횟수가 20회를 넘지 않아 입력 경로가 도달 가능하다
    → useStableEstimateCatalogRows is not a function
```

원인 좌표는 라이브QA와 동일했다.

```text
const rows = rawRows.filter((row) => row.usageScope !== 'NONE')
useEffect(() => {
  if (!orderDirty) setSortableRows(rows)
}, [rows, orderDirty])
```

`filter()`가 매 렌더 새 배열을 만들고 effect가 상태를 다시 써 `Maximum update depth exceeded`로 진입했다.

재현 harness 원문(기존 구현의 identity loop를 렌더 함수로 축약):

```text
RED_RENDER_COUNT=26
✓ 1 test passed
```

렌더 횟수 26회에서 guard가 발동하도록 단정해 무한 증가를 수치로 재현했다.

### 2. 제품·분류 API UUID 응답

초기 계약 테스트:

```text
ProductAndClassificationUuidFreeContractTest > publicProductAndClassificationDtos_doNotExposeUuidRecordFields() FAILED
Expecting actual: java.util.UUID
not to be equal to: java.util.UUID
```

### 3. 활성 target 3건 유지

초기 FE 방어 계약 테스트:

```text
EstimateItemsCatalogPage live-QA regressions
  × 규칙 응답에 섞인 소프트삭제 target 23건을 저장 draft에서 제외하고 활성 3건만 유지한다
    → preserveActiveQuantitySyncTargets is not a function
```

## 수정

1. `useStableEstimateCatalogRows`에서 `useMemo`로 노출 행 배열을 원천 안정화했다. `orderDirty=false` 상태에서 새 배열 identity가 effect를 재호출하지 않아 모달 입력·칩 추가/삭제·특징/형상 설정·저장 경로가 도달 가능하다.
2. 공개 제품·분류 응답의 UUID 직렬화를 URL-safe opaque token으로 바꾸고, 기존 UUID와 opaque token을 요청 경로/query/body에서 모두 내부 UUID로 해석하도록 보강했다. 모델코드·분류 동작 계약은 유지한다.
3. `preserveActiveQuantitySyncTargets`를 모달 초기화·규칙 재진입·저장 draft에 적용했다. `isDeleted=true` 23건은 저장 대상이 되지 않는다.

## GREEN 원문

```text
npx vitest run src/renderer/routes/EstimateItemsCatalogPage.test.ts
✓ 10 tests passed

npm run typecheck
✓ exit 0

./gradlew :services:product-service:test
✓ BUILD SUCCESSFUL
✓ 787 tests completed, failures=0, errors=0
```

새 계약 결과:

```text
ProductAndClassificationUuidFreeContractTest
✓ BUILD SUCCESSFUL
```

활성 target 단위 결과:

```text
input=3 active + 23 isDeleted=true
output=ACTIVE-1, ACTIVE-2, ACTIVE-3
output_count=3
```

## Playwright

기존 저장소 Playwright 스펙 `product-catalog-enhance-real-qa/t2-bundle-components-modal-real-qa.spec.ts`를 실행했다.

```text
Running 2 tests using 1 worker
2 failed
page.goto: net::ERR_CONNECTION_REFUSED
http://localhost:5175/#/products/estimate-items
http://localhost:5175/#/sales/new
```

renderer `5175`가 기동되어 있지 않아 GUI 왕복 검증은 완료하지 못했다. gateway `8080`만 listen 중이었으며, 공유 DB 쓰기를 피하기 위해 서버/DB를 임의 기동하지 않았다. Playwright가 생성한 `clients/desktop/test-results`는 종료 점검에서 제거했다.

## 종료 점검

```text
git diff --name-status origin/main...HEAD | Select-String '^D'
출력 없음

tools/.s24-build-only/build/deep/tracked-writer.mjs
존재함

Playwright/Gradle 잔류 작업 프로세스 없음
공유 DB/격리 컨테이너/임시 디렉터리 신규 생성 없음
```

참고: 작업 시작 전 존재하던 미추적 `docs/qa/2026-08-12-1143-reconv/` 파일 2개는 사용자 산출물로 판단해 보존했다.
