# #1092 견적서 관리 분리 목록 구현 보고서

작성일: 2026-08-13  
담당: CODEX LUNA

## #1092 원문에서 뽑은 잃으면 안 되는 계약

이슈 원문(`gh issue view 1092`)의 개발책임자 정의에서 다음 계약을 보존했다.

1. 견적서 메뉴는 웹 종합견적서와 웹 주문서가 저장한 견적을 표시한다.
2. 웹 저장 데이터는 웹에서 해당 데이터를 근거로 미리보기하고 다시 불러올 수 있어야 한다.
3. 종합견적서를 사용하는 직원과 주문서를 사용하는 외부 거래처의 저장분을 모두 조회할 수 있다.
4. 담당 축은 `requester_id`로 관리하고 담당 변경이 가능해야 한다.
5. 웹에서는 자신이 담당인 견적만 조회·복구할 수 있다.
6. 종합견적서 계열과 주문서 계열 사이에는 담당 변경을 허용하지 않는다.
7. 견적서를 판매전표로 전환할 수 있다.
8. 웹 저장분을 불러온 뒤 종합견적서→판매전표 또는 주문서→주문서 생성 흐름으로 이어질 수 있어야 한다.

이번 변경은 이 계약의 저장·웹 왕복·담당 권한 API를 재설계하지 않고, 데스크톱 메뉴의 표시 축만 개발책임자 확정 구조로 분리했다. 기존 담당 변경 API와 웹 자기 담당/복구 API 계약은 삭제하지 않았다.

## RED 원문 → GREEN

### RED

새 화면 계약 테스트를 먼저 추가하고 정확한 워크트리에서 실행했다.

```text
× 견적서 관리에는 종합견적서와 주문서 탭만 있고 통합 목록 토글은 없다
  Unable to find role="tab" and name "종합견적서"
× 종합견적서 탭은 ...
× 주문서 탭은 ...
```

분리 모델 테스트도 구현 전에는 다음처럼 실패했다.

```text
× 검색은 각 탭의 데스크톱·웹 행 모두에 적용되고 페이지네이션은 검색 결과를 자른다
  TypeError: filterSeparatedRows is not a function
```

### GREEN

다음 명령이 통과했다.

```text
npx vitest run src/renderer/routes/EstimateListPage.test.tsx \
  src/renderer/routes/estimateSourceSeparatedListModel.test.ts
  Test Files 2 passed
  Tests 15 passed
```

검증한 동작은 탭 존재·통합 UI 제거, 종합견적서의 데스크톱+웹 견적, 주문서의 웹 주문서, 교차 출처 0건, 출처 칼럼, 검색·페이지네이션, 탭별 상태 초기화, 웹 opaque 상세 경로다.

## 불변식 8개 근거

1. `EstimateListPage`에서 통합 목록 섹션, `통합 목록 보기` 체크박스, 출처 드롭다운 렌더링을 제거했다.
2. 종합견적서 쿼리는 `listEstimates`와 `listWebQuoteSnapshotSummaries`를 함께 호출하고, 주문서 쿼리는 `listWebPartnerOrderDraftSummaries`를 호출한다.
3. `mergeEstimateRows`와 `mergeOrderRows`의 입력을 탭별로 고정했다. 데스크톱 `order`는 견적서 관리에 더 이상 호출하지 않으며 `/sales/partner-orders`는 변경하지 않았다.
4. `requesterName`은 종합견적서 행의 담당 칼럼으로 유지했다. 기존 `changeEstimateOwner` 및 웹 담당 범위 API는 변경하지 않았다.
5. 웹 저장분 목록 API는 요약 목록 경로를 유지했고, 웹 행은 기존 opaque snapshot/draft key 상세 경로로 이동한다. 웹 왕복 자체의 저장·복구 API를 삭제하지 않았다.
6. 화면 칼럼에는 UUID가 없고 문서번호·거래처·담당·금액만 표시한다. 웹 목록 DTO도 UUID/payload 제외 계약을 그대로 사용한다.
7. 각 탭은 전체 데스크톱 페이지를 `fetchAllPages`로 수집하고 웹 저장분과 합친 뒤 `filterSeparatedRows`와 `paginateSeparatedRows`를 적용한다.
8. query key에 `activeTab`을 포함하고 탭·검색·기간·삭제 포함 상태가 바뀌면 page를 0으로 초기화한다. 이전 탭 목록이 새 탭에 남지 않도록 했다.

## 지운 것과 기능의 귀속

- 하단 `통합 목록` 표: 삭제. 종합견적서 탭 또는 주문서 탭의 주 표가 대체한다.
- `통합 목록 보기` 체크박스: 삭제. 두 탭이 항상 하나의 명시적 출처 조합을 표시한다.
- 출처 드롭다운 필터: 삭제. 탭 자체가 출처 경계를 보장한다.
- 견적서 화면의 데스크톱 주문서 조회: 삭제. 데스크톱 주문서는 기존 `/sales/partner-orders` 메뉴에 남겼다.
- 웹 종합견적서 조회 경로: 삭제하지 않음. 종합견적서 탭의 두 번째 출처로 이동했다.
- 웹 주문서 조회 경로: 삭제하지 않음. 주문서 탭의 유일한 출처로 이동했다.
- 기존 견적 상세·담당 변경·협업 경로: 삭제하지 않음. 기존 `EstimateDetailPage`와 opaque ID 계약을 유지했다.

`SalesSubNav.tsx`와 `SalesPartnerOrderListPage`는 변경하지 않았다.

## 검증하지 못한 것

- `npm test` 전체 명령은 저장소 pretest 가드에서 중단됐다. actor-display mutation 가드 자체는 통과했지만 오래된 `clients/web/design-system/dist`가 소스보다 오래됐다는 신선도 검사로 Vitest까지 도달하지 못했다.
- `npx tsc -p tsconfig.web.json --noEmit`은 이번 변경 파일이 아닌 기존 `productApi.ts`, `AccountTreePage.tsx`, `SlipFormPage.tsx`의 타입 오류로 실패했다. 우회하거나 통과한 것으로 기록하지 않는다.
- desktop 전체 Vitest는 `262`개 파일 중 `257`개 성공, `5`개 실패였다. 실패는 `out/main/index.js` 부재 1건, `@testing-library/jest-dom/vitest` 해석 실패 3 suite, 기존 `api/mock.test.ts` 문서번호 가드 1건이다. 변경 관련 테스트와 `EstimateDetailPage` 협업 계약 테스트는 통과했다.
- 공유 DB/공유 Docker 스택을 사용한 라이브 QA는 수행하지 않았다. 따라서 웹 저장분 상세의 실제 `collab/comments`, `presence`, `edits`, `stream`, `revision` HTTP 상태는 측정하지 못했다. 이번 화면은 웹 저장분을 기존 opaque source-detail 경로로 열며, 실제 persisted estimate 상세에서 사용하는 기존 협업 계약 테스트만 통과시켰다.

## 라운드 종료 점검

`tools/.s24-build-only/build/deep/tracked-writer.mjs`는 현재 워크트리에서 삭제 상태이며, 복구하지 않았다. `docs/qa` 아래에 이번 라운드 드라이버 스크립트는 추가하지 않았다.
