# #1111 S10 — 구성품 탭 실패 표시

## 결론

`SheetSyncPage`가 `summary.byTab`만 행으로 변환하던 결함을 수정했다. 이제 `byTab`과 `byComponentTab`을 하나의 표에 함께 표시하며, 구성품 행은 `구성품 · <탭 이름>`으로 구분한다.

구성품 결과의 백엔드 필드(`linked`, `bundlesMarked`, `softDeleted`, `skipped`, `error`)는 기존 표 열에 맞게 정규화한다. 따라서 구성품 성공 응답에서도 `undefined`가 표시되지 않고, 기존 일반 탭의 성공/처리 건수 표시도 유지된다.

## 선택한 표시 방식과 이유

일반 탭과 구성품 탭을 같은 표에 섞되, 구성품 탭 이름에 `구성품 · ` 접두어를 붙였다.

- 실패 항목 수를 한 표에서 직접 셀 수 있어 `failedTabs`와의 대조가 단순하다.
- 기존 표의 성공 탭·inserted·updated·softDeleted·remark 표시를 유지한다.
- 별도 절을 만들지 않아 `byComponentTab`이 비어 있을 때 빈 절이 남지 않는다.
- 구성품 탭의 처리 의미는 일반 탭과 다르므로 이름으로 출처를 구분한다.

## RED-A / RED-B

### RED-A

수정 전 행 변환은 `Object.entries(summary.byTab)`만 순회했다. 전체 실패 응답의 `byTab=9`, `byComponentTab=2`, `failedTabs=11` 조합에서 화면 행은 9개였다.

추가한 테스트를 첫 실행했을 때의 RED 원문은 다음과 같다.

```text
RED-A: expected [] to have a length of 11 but got +0
RED-B: expected [] to have a length of 5 but got +0
```

이는 미구현 행 변환 함수의 초기 상태에서 관찰한 RED이며, 기존 화면 로직의 실제 결함은 `byTab` 9행만 렌더하던 것이다.

### RED-B

다음 조합을 함께 고정했다.

- 일반 성공 1개 + manual skip 1개 + 일반 실패 1개
- 구성품 성공 1개 + 구성품 실패 1개
- 실패 결과 수는 `failedTabs=2`
- 전체 행은 성공/skip/실패를 포함해 5개, 오류가 있는 행은 2개
- `byComponentTab={}`이면 일반 탭 3개만 남고 빈 구성품 절은 생성되지 않음

수정 후 RED-A/RED-B가 동시에 GREEN이 됐다.

## 불변식 검증

1. 전체 실패 조합에서 9개 일반 탭 + 2개 구성품 탭 = 11행이며 오류 행 수가 `failedTabs=11`과 같다.
2. `skipped`는 기존 행의 remark로만 표시된다. 별도 실패 행이나 오류로 변환하지 않는다. `successfulTabs`와 `totalPreservedManual`의 백엔드 계약은 변경하지 않았다.
3. 성공(200)·부분 실패(207) 전용 분기나 HTTP 상태 의존 로직은 화면에 없다. `summary`가 있으면 동일한 `buildSheetSyncRows`가 성공/부분/전체 응답을 처리하고, 구성품 결과의 누락 숫자는 0으로 정규화한다. 따라서 발화 조건이 없는 200/207을 환경에서 실측하지 않고도 코드 경로로 확인했다.
4. 기존 `SummaryTotals`, 성공 탭 행, 처리 건수 열과 `formatTabRemark`를 유지했다. 일반 탭 결과도 정규화 후 기존 열 타입으로 전달한다.
5. `Object.entries(summary.byComponentTab ?? {})`를 사용하므로 필드 부재·빈 객체에서 구성품 절이나 행이 추가되지 않는다.

## 필수 3절

### ① 새로 가능해진 조합

| 조합 | 결과 |
|---|---|
| 전체 실패 | 일반 9 + 구성품 2 = 11 오류 행, `failedTabs=11` |
| 부분 실패 | 성공/skip/실패 일반 행과 구성품 행을 함께 표시, 오류 행 수만 `failedTabs`와 일치 |
| 성공 | 일반/구성품 성공 결과 모두 기존 처리 건수 열에 안전하게 표시 |
| `byComponentTab` 빈 객체·부재 | 일반 탭만 표시, 빈 구성품 절 없음 |
| manual skip 혼합 | 기존 행의 skip remark로만 표시, 실패 오류 행으로 집계하지 않음 |

### ② 제거·이동·개명한 식별자 grep 전수

- 제거한 식별자: 없음
- 개명한 식별자: 없음
- 이동한 식별자: 없음
- 기존 `rows` 생성 로직은 `SheetSyncPage.tsx`에서 `buildSheetSyncRows` 호출로 이동했다.
- 확인 명령: `rg -n "byComponentTab|buildSheetSyncRows|const rows|admin-sheetsync-tab-row" clients/desktop/src/renderer`
- `byComponentTab`의 백엔드 계약 확인: `git show origin/main:services/product-service/src/main/java/com/samhanair/logis/product/service/ProductSheetSyncService.java | Select-String byComponentTab` 결과 3건.

### ③ 바꾼 파일을 참조하는 테스트 전부 실행

- 신규 행 변환 테스트: `npm test -- --run src/renderer/routes/admin/sheetSyncRows.test.ts` — 2/2 PASS
- desktop 전체 Vitest: `npm test` — 전체 PASS
- web 타입체크: `npx tsc -p tsconfig.web.json --noEmit` — PASS
- 변경 파일 lint: `npx eslint src/renderer/routes/admin/SheetSyncPage.tsx src/renderer/routes/admin/sheetSyncRows.ts src/renderer/routes/admin/sheetSyncRows.test.ts src/renderer/api/sheetSyncApi.ts` — PASS

`sheetSyncApi.ts`를 직접 import하는 기존 테스트는 grep 결과 없었다. 전체 Vitest로 API 타입 변경에 따른 회귀 여부를 함께 확인했다.

## 신규 파일 목록

- `clients/desktop/src/renderer/routes/admin/sheetSyncRows.ts`
- `clients/desktop/src/renderer/routes/admin/sheetSyncRows.test.ts`
- `docs/dev-reports/2026-08-07-1111-s10-component-tab-failures-visible.md`

백엔드 응답 구조, SA key, DB, 컨테이너, commit/push는 변경하지 않았다.
