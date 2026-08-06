# PR #1077 / Issue #1069 — R25 거래처 전환 세트 부모 정액DC

## 1. 판정과 원인

결함은 함수·설정·품목이 아니라 세트 재전개 배선이었다.

- 거래처 전환 bulk 계산(기존 `SlipFormPage.tsx:1500`)은 부모 `fixedDiscountRate`와 `hasVariableDiscount`를 이미 전달하고 있었다.
- 그러나 그 직후 호출되는 `expandSelectedBundle`의 부모 재계산(`SlipFormPage.tsx:924`)은 `category: 'OTHER'`를 하드코딩하고 `hasVariableDiscount: false`를 전달했으며, `fixedDiscountRate`는 누락했다.
- 따라서 전환 계산에서 산출한 부모 단가가 재전개 때 다시 원단가로 계산되어 화면 행과 저장 payload가 함께 오염됐다.
- `delivery_price`는 기존처럼 BUNDLE의 `catalogUnitPrice`로 사용된다. `getModelFlags`와 백엔드는 변경하지 않았다.

## 2. 수정 내용

`slipDiscount.ts`에 `calculateBundleParentDiscount` 어댑터를 추가했다. 이 어댑터는 부모의 `categoryKey`, `fixedDiscountRate`, `hasVariableDiscount`, 모델코드와 카탈로그 단가를 기존 `calculateSlipDiscount` 입력으로 정규화한다.

초기 세트 전개와 거래처 전환 후 재전개가 같은 어댑터를 사용하도록 연결했다. 이에 따라:

- `AC060CS6PBH1SY`, `delivery_price=1,660,000`, `threeSixty=₩70,000` → `1,590,000`, source `OPTION`
- `AM360AXVGHC1SY` → 레거시 플래그 없음, 원단가 유지
- 고정DC 품목 → 기존 고정DC 우선 계산 유지
- 구성행 삭제 상태 → 기존 `excludedComponentKeys` 보존 경로 유지
- 저장 payload → 재전개 후 화면 단가와 동일한 단가 전송

## 3. 새로 열린 조합 표면 점검

아래 16개 조합을 `calculateBundleParentDiscount` 단위 회귀와 `SlipFormPage` 통합 하네스로 점검했다. 결과는 모두 PASS다. `정액`은 레거시 모델 플래그와 해당 거래처 정액 설정의 조합, `고정`은 `fixedDiscountRate>0`, `전역`은 HOMEMULTI/COMMERCIAL_MULTI 변동DC를 뜻한다. OTHER 세트에서는 전역DC가 적용 대상이 아니며 원단가를 유지한다.

| 정액 | 고정 | 전역 | 삭제 상태 | 결과 |
|---|---|---|---|---|
| 있음 | 없음 | 없음 | 전 | 정액 차감 PASS |
| 있음 | 없음 | 없음 | 후 | 정액 차감·삭제 보존 PASS |
| 있음 | 없음 | 있음 | 전 | 정액/카테고리 규칙 PASS |
| 있음 | 없음 | 있음 | 후 | 정액/카테고리 규칙·삭제 보존 PASS |
| 있음 | 있음 | 없음 | 전 | 고정DC 우선 + 정액 결합 PASS |
| 있음 | 있음 | 없음 | 후 | 고정DC 우선·삭제 보존 PASS |
| 있음 | 있음 | 있음 | 전 | 고정DC 우선·전역 무시 PASS |
| 있음 | 있음 | 있음 | 후 | 고정DC 우선·전역 무시·삭제 보존 PASS |
| 없음 | 없음 | 없음 | 전 | 원단가 유지 PASS |
| 없음 | 없음 | 없음 | 후 | 원단가 유지·삭제 보존 PASS |
| 없음 | 없음 | 있음 | 전 | OTHER는 전역 비대상, 원단가 유지 PASS |
| 없음 | 없음 | 있음 | 후 | OTHER는 전역 비대상·삭제 보존 PASS |
| 없음 | 있음 | 없음 | 전 | 고정DC만 적용 PASS |
| 없음 | 있음 | 없음 | 후 | 고정DC·삭제 보존 PASS |
| 없음 | 있음 | 있음 | 전 | 고정DC 우선 PASS |
| 없음 | 있음 | 있음 | 후 | 고정DC 우선·삭제 보존 PASS |

### RED-first 원문

수정 전 신규 회귀 테스트 실행 결과:

```text
src/renderer/utils/slipDiscount.bundle-parent.test.ts (3 tests | 3 failed)
→ calculateBundleParentDiscount is not a function
```

수정 후 RED-A/B 및 고정DC 회귀가 GREEN으로 전환됐다.

## 4. 식별자 grep 전수

- 신규 식별자 `calculateBundleParentDiscount`: 정의 1곳, 호출 2곳, 테스트 1곳에서만 확인.
- 기존 `calculateSlipDiscount`: 일반 품목 경로와 어댑터 내부에서 유지.
- 제거·이동·개명한 기존 식별자는 없음.
- 기존 결함 패턴인 세트 재계산 경로의 `category: 'OTHER'` 하드코딩 및 `hasVariableDiscount: false` 전달은 제거됐다.
- `getModelFlags`, `parseAmount`, `fixedDiscountRate`의 기존 정본·계산 규칙은 변경하지 않았다.

## 5. 검증

변경 파일을 참조하는 테스트 전부 실행:

```text
npm exec vitest run \
  src/renderer/routes/SlipFormPage.test.tsx \
  src/renderer/utils/slipDiscount.bundle-parent.test.ts \
  src/renderer/utils/slipDiscount.test.ts \
  src/renderer/utils/usePartnerPriceRefresh.test.ts

4 test files passed, 132 tests passed
```

추가 검증:

```text
npm run typecheck
→ exit code 0
```

