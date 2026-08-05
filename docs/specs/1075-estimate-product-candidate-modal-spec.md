# #1075 견적 화면 품목 입력에 부분 문자열 후보 모달 — 기획

> 작성 2026-08-05 (집PC PM) · 이슈 `#1075`

## 1. 무엇이 문제인가

견적 작성 화면에서 모델명을 **부분 문자열**로 입력하면 후보를 못 찾고 `모델 미존재 또는 lookup 실패` 가 뜬다. 같은 입력이 판매전표에서는 후보 모달을 연다.

라이브QA(`#1063` R32, mock OFF · 실서버) 실측:

```
견적    "AJ" 입력  →  모델 미존재 또는 lookup 실패
        [참조 조회] → 품목 후보가 아니라 기준정보 조회 모달
판매전표 "AJ" 입력  →  품목 검색 결과 모달 · 후보 20건 (모델명 / 품목명 / 규격 / 단가)
```

## 2. 선재 결함이다 (범위 판정 근거)

`git show origin/main:clients/desktop/src/renderer/routes/EstimateFormPage.tsx` 에 `모델 미존재 또는 lookup 실패`·`참조 조회` 가 **이미 있었다**. `#1063` 은 견적의 lookup 경로를 바꾸지 않았다(빈행 계약 축만 변경). 그래서 그 PR 범위 밖으로 분리했다.

## 3. 해야 할 일

견적 라인 입력에도 판매전표와 같은 **부분 문자열 후보 모달**을 적용한다.

```
후보 2건 이상  →  품목 검색 결과 모달 (모델명 · 품목명 · 규격 · 단가)
후보 1건       →  모달 없이 자동 확정
후보 0건       →  현행 안내 유지
```

규격 열은 `ProductSummaryResponse.specification` 을 쓴다 — `#1063` 이 추가했고 **이미 main 에 있다**.

## 4. 불변식

1. 견적에서 부분 문자열로 품목 후보를 찾을 수 있다.
2. **판매전표의 동작이 기준이다** — 후보 다건 모달 · 후보 1건 자동 확정 · 규격 열 실값 · 단가 자동 반영.
3. **자체 컴포넌트를 새로 만들지 않는다.** 판매전표가 쓰는 공용 경로를 재사용한다(중복 구현 금지).
4. **견적의 기존 동작이 회귀하지 않는다** — `#1063` 이 세운 자동 빈행 규약(`autoBlankRow`), 버전 복원(`estimateRestoreFence`), coedit 중 라인 구조 잠금(`lineStructureLocked`).
5. **UUID 를 화면에 노출하지 않는다.**
6. `참조 조회`(기준정보 모달)는 **없애지 않는다** — 다른 용도다.

## 5. 양방향 RED

- **RED-A** 견적의 자동 빈행·버전 복원·coedit 잠금·기존 확정 흐름이 그대로 · 판매전표 동작 무회귀
- **RED-B** 견적에서 부분 문자열 입력이 여전히 `모델 미존재` 로 끝나면 RED · 후보 1건인데 모달이 뜨면 RED · 모달에 규격이 비면 RED · UUID 가 보이면 RED

## 6. 범위 밖

- 분개·(재고)이동 화면 (같은 비대칭이 있는지 **조사만** 하고 보고서에 적는다. 고치지 않는다.)
- 품목 검색 백엔드 API 변경
- 다른 트랙(`#1045` `#1057` `#1066` `#1069`)

## 7. 검증

```powershell
cd clients/desktop ; npx vitest run src/renderer/routes/EstimateFormPage
cd clients/desktop ; $env:CI="1"; node_modules\.bin\playwright.cmd test playwright/ac-2-product-autocomplete playwright/1062-line-input-ux --reporter=line
```

라이브QA — 실서버에서 견적 신규 작성에 `AJ` 를 넣어 모달과 규격 열을 캡처한다.
