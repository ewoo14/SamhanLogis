# PR #1148 R3 — VAT 표시 관례 통일

## 결론

작성 폼의 금액 표시만 앱 표준인 `fmtKrw()`로 통일했다. `splitVatInclusiveFromQtyUnitPrice()`가 계산한 내부 값과 저장 요청은 변경하지 않았다.

## 표시와 저장 분리

- 표시: `clients/desktop/src/renderer/routes/accounting/SalesAccountingSlipFormPage.tsx:154-156`
  - 공급가·부가세·합계 렌더링을 `fmtKrw(String(...))`로 변경했다.
- 표시: `clients/desktop/src/renderer/routes/accounting/PurchaseAccountingSlipFormPage.tsx:154-156`
  - 매출 작성 폼과 동일하게 `fmtKrw()`를 사용한다.
- 계산 보존: `clients/desktop/src/renderer/routes/accounting/SalesAccountingSlipFormPage.tsx:53`
  - `splitVatInclusiveFromQtyUnitPrice()` 호출과 반환값은 그대로다.
- 저장 보존: `clients/desktop/src/renderer/routes/accounting/SalesAccountingSlipFormPage.tsx:64-79`
  - `handleSubmit()`은 표시값이 아니라 `submittedQty`와 `submittedUnitPrice`를 요청에 넣는다.
- 매입 폼도 동일한 분리 구조다: `clients/desktop/src/renderer/routes/accounting/PurchaseAccountingSlipFormPage.tsx:53,64-79`.
- `fmtKrw()` 자체와 서버·DB·migration은 변경하지 않았다.

## RED-A / RED-B 동시 GREEN 실행 원문

### RED-A — 수정 전

실행:

```text
npx vitest run src/renderer/routes/accounting/SalesPurchaseAccountingSlipAllocationContract.test.tsx
```

```text
Test Files  1 failed (1)
Tests       2 failed | 14 passed (16)
sales ... expected ... not to contain '34,783.04'
purchase ... expected ... not to contain '34,783.04'
```

수정 전 두 작성 폼 모두 `합계 34,783.04`를 렌더링해 RED-A가 실패했다.

### RED-B — 수정 전 기준

기존 mock 계약 테스트가 저장 계산의 정확값을 고정하고 있다.

실행:

```text
npx vitest run src/renderer/api/mock.test.ts
```

기대 계약:

```text
{ supply: '31620', vat: '3163.04', total: '34783.04' }
```

### 동시 GREEN — 수정 후

화면 spec은 표시와 저장 요청을 함께 검증한다. 신규 회귀 테스트는 `...SalesPurchaseAccountingSlipAllocationContract.test.tsx:134-151`에 있다.

```text
npx vitest run src/renderer/routes/accounting/SalesPurchaseAccountingSlipAllocationContract.test.tsx
Exit code: 0
Test Files  1 passed (1)
Tests       16 passed (16)

npx vitest run src/renderer/api/mock.test.ts
Exit code: 0
Test Files  1 passed (1)
Tests       137 passed (137)
```

화면 테스트는 `34,783.04`를 표시하지 않고 `34,783`을 표시하는 것과 저장 요청의 `unitPrice: '434788'`를 함께 확인한다. mock 테스트는 `31620 / 3163.04 / 34783.04`를 그대로 통과한다.

## 지정 추가 검증

```text
npx vitest run src/renderer/utils/vatRounding.test.ts
Exit code: 0
Test Files  1 passed (1)
Tests       11 passed (11)
```

## (b) 계열 조사 결과

작성 폼 계열은 매출·매입 두 화면이며 둘 다 같은 불일치가 있었다. 두 화면을 함께 수정했다. `accounting` 경로의 다른 목록·보고서 화면은 이미 `fmtKrw()` 또는 별도 목록 표시 규약을 사용하고 있으며, `formatVatAmount()`를 사용하는 동일 작성 폼 계열의 추가 화면은 없었다.

## 변경 파일

- `clients/desktop/src/renderer/routes/accounting/SalesAccountingSlipFormPage.tsx`
- `clients/desktop/src/renderer/routes/accounting/PurchaseAccountingSlipFormPage.tsx`
- `clients/desktop/src/renderer/routes/accounting/SalesPurchaseAccountingSlipAllocationContract.test.tsx`
- `docs/dev-reports/2026-08-09-1144-p0a-r3-display-convention.md`

커밋·푸시는 수행하지 않았다.
