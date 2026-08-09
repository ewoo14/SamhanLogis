# PR #1148 R2 — 서버 금액 parity

검증 시각: 2026-08-09 KST  
작업 브랜치/HEAD: `fix/1144-p0a-vat-display` / `770461c3463cc298fd1dea4b24758f88ec5c9aa8`  
범위: 클라이언트 화면·mock만 수정. 서버, 저장 로직, migration, DB, Docker는 수정·실행하지 않았다.

## 1. 서버 정본 계산 규칙

서버 원문 근거는 다음과 같다.

| 규칙 | 근거 |
|---|---|
| `lineTotal = qty × unitPrice`를 먼저 계산 | `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/VatCalculator.java:25` |
| `TAXABLE`은 `lineTotal ÷ 1.10`을 원 단위 `DOWN`으로 공급가에 적용 | `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/VatCalculator.java:27-29`, `shared/common/src/main/java/com/samhanair/logis/common/financial/VatAmountCalculator.java:35-47` |
| `vat = lineTotal - supply`로 내부 정합 보존 | `shared/common/src/main/java/com/samhanair/logis/common/financial/VatAmountCalculator.java:46` |
| 수량은 scale 3, 단가·공급가·VAT·총액은 scale 2 | `services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain/SalesAccountingSlipLine.java:45-53` (매입 라인도 동일) |
| 응답 DTO가 `BigDecimal` 금액을 그대로 반환 | `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/dto/SalesAccountingSlipResponse.java:18-34` |

따라서 서버는 `34,783.04` 같은 원 미만 금액을 보존할 수 있다. 저장 컬럼과 DTO에 소수 2자리 근거가 있으므로 화면에서 원 단위로 절사하거나 `Math.round`해 정보를 잃지 않도록 했다.

## 2. 변경 내용

`clients/desktop/src/renderer/utils/vatRounding.ts:25-57`에 다음을 반영했다.

- `splitVatInclusive`가 총액을 정수로 먼저 절사하지 않고 cents로 보존한다.
- 공급가는 서버와 같은 `totalCents / 110n` 정수 나눗셈으로 산출한다.
- VAT는 `총액 - 공급가`로 산출해 `공급가 + VAT = 총액`을 유지한다.
- `splitVatInclusiveFromQtyUnitPrice(qty, unitPrice, taxable)`를 추가해 서버와 동일한 제출 입력 `qty × unitPrice`를 화면 preview와 mock이 공유한다.
- `formatVatAmount`가 서버 금액의 소수 둘째 자리까지 표시한다.

매출·매입 폼(`SalesAccountingSlipFormPage.tsx:43-56`, `PurchaseAccountingSlipFormPage.tsx:43-56`)은 배분액 합계를 그대로 표시 계산에 쓰지 않고, 실제 제출할 `submittedQty`와 `submittedUnitPrice`를 먼저 만들고 같은 값으로 preview를 계산한다. 제출 payload도 같은 변수(`Sales...:74-75`, `Purchase...:74-75`)를 사용한다.

mock은 이미 두 API에서 동일 helper를 호출하고 있다.

- `clients/desktop/src/renderer/api/salesAccountingSlipApi.ts:145-148,166-169`
- `clients/desktop/src/renderer/api/purchaseAccountingSlipApi.ts:133-136,154-157`

이번 변경으로 helper가 서버의 소수 총액을 보존하므로 mock도 서버와 일치한다.

## 3. RED-A / RED-B 동시 GREEN

### RED 실행

새 parity 테스트를 먼저 추가하고 운영 코드를 수정하기 전에 실행했다.

```text
npx vitest run src/renderer/utils/vatRounding.test.ts

❯ src/renderer/utils/vatRounding.test.ts (10 tests | 3 failed)
× 부분 배분 preview는 제출 qty×unitPrice인 서버 lineTotal과 일치한다
  → splitVatInclusiveFromQtyUnitPrice is not a function
× 330,000원 정수 경계는 공급가 300,000원과 VAT 30,000원을 유지한다
  → splitVatInclusiveFromQtyUnitPrice is not a function
× 소수 수량의 서버 lineTotal 소수 둘째 자리를 보존한다
  → splitVatInclusiveFromQtyUnitPrice is not a function
Tests 3 failed | 7 passed (10)
Exit code: 1
```

### GREEN 실행 원문

helper 구현 후 지정 경계와 mock을 함께 실행했다.

```text
npx vitest run src/renderer/utils/vatRounding.test.ts src/renderer/api/mock.test.ts

✓ src/renderer/utils/vatRounding.test.ts (11 tests)
✓ src/renderer/api/mock.test.ts (137 tests)
Test Files 2 passed (2)
Tests 148 passed (148)
Exit code: 0
```

핵심 계산 재현값:

```text
RED-A: qty=2.08, unitPrice=434775
server lineTotal = 2.08 × 434775 = 904332.00
server supply = DOWN(904332.00 ÷ 1.10) = 822120
server vat = 904332.00 - 822120 = 82212.00
화면 = 822,120 + 82,212 = 904,332

RED-B: qty=1, unitPrice=330000
화면/서버 = 공급가 300,000 · VAT 30,000 · 총액 330,000

소수 원: qty=0.08, unitPrice=434788
server lineTotal = 34,783.04
server supply = 31,620
server vat = 3,163.04
mock/화면 = 공급가 31,620 · VAT 3,163.04 · 총액 34,783.04
```

서버 값의 내부 항등식은 세 경우 모두 유지된다.

## 4. 소수 원 처리 결정

결정: 서버 값의 scale 2를 클라이언트가 그대로 보존·표시한다.

근거는 서버 entity의 `vat_amount`, `line_total` `scale=2`와 DTO `BigDecimal` 타입이다. 서버의 `BigDecimal qty.multiply(unitPrice)`가 원 미만을 만들고, 공통 VAT 계산기는 supply만 원 단위 `DOWN`으로 만들며 VAT는 총액에서 차감한다. 따라서 클라이언트가 총액을 `Math.trunc`하거나 화면 포맷에서 `Math.round`하면 서버 정본과 달라진다.

별도 업무 근거 없이 원 단위로 절사하는 결정은 하지 않았다. 화면은 `3,163.04`를 표시한다.

## 5. (a) 금액 자체 계산 계열 전수

축: 클라이언트가 금액을 자체 계산하거나 VAT를 파생하는 코드.

| 계열 | 위치/판정 |
|---|---|
| 매출·매입 회계전표 작성 preview/제출 | `routes/accounting/SalesAccountingSlipFormPage.tsx`, `PurchaseAccountingSlipFormPage.tsx` — 이번에 서버 입력 parity로 수정 |
| 매출·매입 회계전표 mock draft | `api/salesAccountingSlipApi.ts`, `purchaseAccountingSlipApi.ts` — 공통 helper로 서버 parity, 소수 원 테스트 추가 |
| 회계전표 목록·상세·원장·마감 | 서버가 반환한 `totalSupplyAmount`, `totalVatAmount`, `totalAmount` 또는 저장 라인 값을 표시·합산. 이번 동형 결함의 자체 VAT 재가산 없음 |
| `lineVat.ts` / `SlipFormPage.tsx` | 기존 slip 도메인의 VAT 포함 정수 계약과 legacy/편집 fallback. `supplyFromVatInclusive`의 서버 DOWN mirror를 사용하며 이번 회계전표 배분 payload 경로와 분리됨 |
| 세금계산서 작성·인쇄 | `TaxInvoiceFormPage.tsx`, `TaxInvoiceView.tsx`, `InvoiceView.tsx` — 공급가 입력/저장 snapshot 계약 또는 legacy fallback. 회계전표의 VAT 포함 배분액을 재가산하는 경로가 아님 |
| 세금계산서·원장·마감 mock/API 합산 | 이미 응답된 supply/VAT/total을 합산하거나 복사. 새 VAT 분리 계산 없음 |
| `vatPrice.ts` | 단가 기억/legacy 변환 계약(×1.1 또는 ÷1.1)으로, 회계전표 VAT 포함 총액 표시와 다른 필드 도메인 |

결론: 이번 결함과 같은 도달 경로는 회계전표 두 폼의 “배분액 합계 preview vs 제출 qty×unitPrice” 및 두 mock draft였다. 세금계산서·원장·마감에서 동일한 회계전표 VAT 재가산 잔존은 확인하지 못했다.

## 6. (b) 서버 응답 직접 사용 가능성

가능하다. 저장 이후 목록·상세 화면은 서버 응답의 `totalSupplyAmount`, `totalVatAmount`, `totalAmount`, 라인 `supplyAmount`, `vatAmount`, `lineTotal`을 직접 사용한다. 실 모드 create API의 `apiClient.post('/admin/sales-slips', body)`와 매입 동등 경로는 변경하지 않았다.

작성 폼의 저장 전 preview는 아직 서버 왕복 전이라 응답을 직접 사용할 수 없다. 따라서 서버와 같은 입력·공식을 공유하는 것이 현재 구조에서 가능한 최소 parity 방식이다. 저장 성공 뒤에는 기존처럼 서버 응답/재조회 값이 정본이다. mock도 동일 helper를 사용해 테스트가 틀린 값을 고정하지 않게 했다.

## 7. 검증

```text
npx vitest run src/renderer/utils/vatRounding.test.ts
Test Files 1 passed (1)
Tests 11 passed (11)
Exit code: 0

npx vitest run src/renderer/api/mock.test.ts
Test Files 1 passed (1)
Tests 137 passed (137)
Exit code: 0

VITE_API_BASE_URL=http://127.0.0.1:1
npx vitest run src/renderer/routes/accounting/SalesPurchaseAccountingSlipAllocationContract.test.tsx
Test Files 1 passed (1)
Tests 14 passed (14)
Exit code: 0

npm run typecheck
Exit code: 0
node/web tsc 완료
real-QA cleanup: 2 pass / 0 fail
real-QA scope: 50 pass / 0 fail
```

typecheck 중 기존 미추적 로컬 real-QA 스펙 1건 경고가 출력됐지만 저장소 공식 집합 검증은 허용된 로컬 실행 모드로 완료됐다. 해당 로컬 스펙은 이번 변경이 만들지 않았다.

`git diff --check`도 오류 없이 종료했다. git status에는 아래 5개 수정 파일과 이 보고서만 남았다.

## 8. 신규 파일

- `docs/dev-reports/2026-08-09-1144-p0a-r2-server-parity.md`

커밋·push는 하지 않았다.
