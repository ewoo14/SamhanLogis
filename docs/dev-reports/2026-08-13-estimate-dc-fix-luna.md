# 2026-08-13 견적 거래처 DC 적용 수정 — CODEX LUNA

## 결론

신규 견적 작성 경로에 주문 화면이 이미 사용하는 `getPartnerDcConfig` + `calculateSlipDiscount` 경로를 옮겼다. 기존 견적 hydrate/edit 경로에는 적용하지 않아 소급하지 않는다.

- 신규 견적 거래처 선택: `GET /api/v1/partner-dc-configs/{partnerCode}` 조회
- 신규 품목 단가: `calculateSlipDiscount`에 상품 `modelCode/categoryKey/hasVariableDiscount/fixedDiscountRate` 전달
- 거래처 변경 재가격: 기존 `usePartnerPriceRefresh.run(..., discountConfig)`에 동일 설정 전달
- DC 설정 없음: 기존 카탈로그/price-memory 동작 유지
- 신규 견적에서만 적용: `shouldApplyPartnerDcToEstimate(!isEdit)`로 편집 hydrate 차단

## RED → GREEN 원문

### RED-1 — 고객 증상 숫자

생산 코드 없이 신규 테스트를 먼저 실행했다.

```text
FAIL RED-C: new estimate applies the 50,000 KRW 1way discount to AC023BN1DBC1
TypeError: resolveEstimateNewLinePrice is not a function
```

기존 화면의 관찰값은 다음과 같다.

```text
AC023BN1DBC1
sellingPrice = 316,800원
partner 1way DC = 50,000원
기존 화면 = 316,800원
기대값 = 266,800원
```

GREEN 후 실제 EstimateFormPage 통합 테스트 원문:

```text
✓ new estimate applies the partner 1way DC to the displayed total
Tests 1 passed
displayed unitPrice = 266800
getPartnerDcConfig('P-A') called
```

### RED-2 — 기존 견적 소급 방지

신규 계산 함수가 없는 상태에서 다음 보호 테스트를 추가해 RED로 시작했다.

```text
FAIL RED-D: existing estimate hydration does not retroactively apply partner DC
TypeError: shouldApplyPartnerDcToEstimate is not a function
```

GREEN 후:

```text
✓ existing estimate hydration does not retroactively apply partner DC
expected shouldApplyPartnerDcToEstimate(false) = false
```

편집 화면의 기존 5건을 업데이트하거나 재저장하지 않았다. 이 슬라이스에서는 기존 데이터에 대한 DB 쓰기를 수행하지 않았다.

## 기존 5건 저장 금액 원문 대조

`docs/dev-reports/2026-08-13-estimate-dc-missing-recon.md`의 실측 원문을 before 기준으로 사용했다. 이번 라운드에는 공유 DB 쓰기가 없으므로 after는 동일 저장값이다.

| 견적번호 | before 총액 | after 총액 | 대조 |
|---|---:|---:|---|
| 2026/08/07-1 | 3,233,000원 | 3,233,000원 | 동일 |
| 2026/08/07-2 | 1,912,000원 | 1,912,000원 | 동일 |
| 2026/08/07-4 | 690,000원 | 690,000원 | 동일 |
| 2026/08/07-5 | 690,000원 | 690,000원 | 동일 |
| 2026/08/07-12 | 690,000원 | 690,000원 | 동일 |

실측 합계도 `7,215,000원 → 7,215,000원`, 5건·16라인 동일이다. 실제 DB before/after 재조회는 기존 데이터 변경을 피하기 위해 수행하지 않았다.

## 불변식 검증

1. 신규 DC 거래처: `316,800원 - 50,000원 = 266,800원` — 통합 화면 테스트 GREEN.
2. 기존 5건: 저장 금액 변경 없음 — 편집 hydrate에서 DC 적용 차단, 위 원문 대조 동일.
3. DC 없는 거래처: `316,800원` 유지 — `resolveEstimateNewLinePrice(..., null)` 테스트 GREEN.
4. 주문 화면: `SlipFormPage.test.tsx` **103/103 통과**.
5. 견적 → 전표: `EstimateToSlipConverter`가 `unitPriceWithVat`, 공급가액, VAT, 합계를 authoritative 값으로 복사하고 `sourceType=ESTIMATE`를 저장한다. 신규 견적의 `266,800원` 저장값이 변환 시 그대로 넘어가는 기존 계약을 확인했다. 변환 전용 실행 테스트는 별도 fixture 부재로 수행하지 못했다.

## 실행 결과

```text
desktop 관련 테스트
Test Files 4 passed (4)
Tests 175 passed (175)
- EstimateFormPage.coedit.test.tsx 57/57
- estimatePrice.test.ts 5/5
- usePartnerPriceRefresh.test.ts 10/10
- SlipFormPage.test.tsx 103/103
```

`npm run typecheck`는 코드 오류가 아니라 로컬 파생물 가드에서 실행 중단됐다.

```text
[로컬 파생물 신선도 확인 실패]
의존 design-system dist이 없습니다: ..\web\design-system\dist\index.d.ts
```

worktree 의존성 연결 후 직접 `tsc -p tsconfig.web.json --noEmit`을 실행한 결과, 변경 파일 오류는 없었고 기존 무관 오류 2건만 남았다.

```text
AccountTreePage.tsx(49,18): Property 'mappingLabel' does not exist on type 'Account'.
AccountTreePage.tsx(49,42): Property 'ecountCode' does not exist on type 'Account'.
```

관련 서비스 전체 테스트 및 DB 격리 복제는 이번 변경이 프런트엔드 신규 견적 계산에 한정되고 DB 쓰기가 없으므로 수행하지 않았다. 공유 Docker 스택도 중지하지 않았다.

## 라운드 종료 점검

- `docs/qa` 아래에 이번 라운드 드라이버 스크립트를 추가하지 않았다.
- `git ls-files --deleted`에서 `tools/.s24-build-only/build/deep/tracked-writer.mjs`가 추적 삭제 상태로 확인되었으며 이번 라운드에서 건드리지 않았다.
- git 변경 계열 명령은 실행하지 않았다.
