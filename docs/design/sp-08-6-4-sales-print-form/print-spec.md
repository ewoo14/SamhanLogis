# Print Spec — SP-08-6-4 매출 인쇄 양식 (거래명세서 + 계산서)

**결정일**: 2026-05-18
**담당 에이전트**: Designer
**슬라이스**: SP-08-6-4 P1 매출 인쇄 양식

---

## 0. legacy GAS 양식 캡처 조사 결과

`docs/migration/legacy-print-forms/` 디렉토리 **존재하지 않음**.
`docs/migration/ecount-reference/` 16장 PNG 전수 열람:
- `20260509_091636.png` — 이카운트 **판매입력** 화면 (필드: 거래처/출하창고/전화번호/대표이사/배송주소/인수자번호/특이사항/할인율 + 라인: 품목코드/품목명/규격/수량/단가(VAT포함)/공급가액/부가세/적요)
- `20260509_091813.png` — 이카운트 메뉴 구조: 판매 > 거래명세서인쇄 항목 확인

결론: GAS 인쇄 양식 PNG 미존재. 이카운트 판매입력 화면 필드 구조 + 기존
`sales-polish-2-slice` 인보이스 mock (13_invoice_hotfix_v3.html) + SP-08-5-5
매입 전표 패턴을 기준으로 **신규 spec 결정**.

`feedback_print_design_iteration` 준수: 본 spec 은 1차 mock 기준.
사용자 Edge 캡처 → 3-5회 iteration 의무.

---

## 1. 양식 구조 비교

| 항목 | 거래명세서 | 계산서 |
|------|-----------|--------|
| 용지 | A4 portrait (210×297mm) | A4 portrait (210×297mm) |
| 여백 | 12mm 사방 | 12mm 사방 |
| 본문 영역 | 186mm × 273mm | 186mm × 273mm |
| 레이아웃 | 6분할 | 2-panel (공급자/공급받는자) + 라인 |
| 제목 | 거래명세서 22pt 700 | 거래명세서 (세금계산서) 18pt 700 |
| 라인 테이블 | 8컬럼 | 7컬럼 (날짜포함) |
| 부가세 명시 | 컬럼 포함 | 10% 별도 명시 박스 |
| 인수란 | O | X (서명란 대체) |
| 계좌 정보 | O | O |

---

## 2. 양식 1 — 거래명세서 A4 portrait 영역 분할

```
@page: A4 portrait (210mm × 297mm), margin: 12mm
본문 영역: 186mm × 273mm
```

| 영역 | 높이 | CSS 변수 | 비고 |
|------|------|----------|------|
| 헤더 | 40mm | `--print-sales-statement-header` | 회사명 + 수신처 box + 공급자 정보 4행 |
| 금액/배송 | 16mm | `--print-sales-statement-meta` | 총금액(한글+숫자) + 배송지 |
| 라인 테이블 | 140mm | `--print-sales-statement-table` | 행 높이 8mm, 기본 10행 fit |
| 합계 | 14mm | `--print-sales-statement-totals` | 수량/공급가액/VAT/합계/인수 5셀 |
| 계좌 정보 | 10mm | `--print-sales-statement-bank` | 예금주/은행/계좌번호 |
| 푸터 | 12mm | `--print-sales-statement-footer` | 비고 + 출력일시 |

**A4 budget 검산 (기본 10행):**
```
40 + 4 + 16 + 4 + 80(10행) + 4 + 14 + 4 + 10 + 4 + 12 = 192mm (여유 81mm)
최대 18행: 40 + 4 + 16 + 4 + 144(18행×8mm) + 4 + 14 + 4 + 10 + 4 + 12 = 256mm (여유 17mm)
```

---

## 3. 거래명세서 헤더 (40mm)

이카운트 판매입력 화면 기준 + sales-polish-2-slice 거래명세서 v3 패턴:

```
┌──────────────────────────────────────────────────────────────┐
│ [회사명 11pt 700 좌]         거래명세서  (22pt 700 중앙)       │ 8mm
├────────────────────────┬─────────────────────────────────────┤
│ 수신처 box             │ ┌───────────────────────────────────┐│
│ 거래처명 13pt 700      │ │공│ 일련번호 │ SS-2026-05-001      ││
│ 주소 10pt              │ │급│ 사업자번호│ 214-87-20659        ││
│ 전화번호 10pt          │ │자│ 상호     │ (주)삼한공조시스템  ││
│                        │ │ │ 주소     │ 서울시 서초구...     ││
│                        │ └───────────────────────────────────┘│
└────────────────────────┴─────────────────────────────────────┘
```

### CSS spec

```css
.statement-header {
  height: var(--print-sales-statement-header); /* 40mm */
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 6mm;
  border-bottom: 2px solid #000;
  padding-bottom: 3mm;
  margin-bottom: 4mm;
}

.statement-title-row {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 10mm;
}

.statement-company-name {
  font-size: 11pt;
  font-weight: 700;
}

.statement-form-title {
  font-size: 22pt;
  font-weight: 700;
  letter-spacing: 8px;
  text-align: center;
  flex: 1;
}

.statement-receiver-box {
  border: 1px solid #000;
  padding: 3mm 4mm;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.statement-receiver-name {
  font-size: 13pt;
  font-weight: 700;
  margin-bottom: 1mm;
}

.statement-receiver-address,
.statement-receiver-phone {
  font-size: 10pt;
  color: #000;
}

.statement-supplier-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 9.5pt;
}

.statement-supplier-table td {
  border: 1px solid #000;
  padding: 1.5mm 2.5mm;
  vertical-align: middle;
}

.statement-supplier-side {
  background: #F0F0F0;
  font-weight: 700;
  text-align: center;
  width: 6mm;
  font-size: 10pt;
  writing-mode: vertical-rl;
  letter-spacing: 2px;
}

.statement-supplier-label {
  background: #F5F5F5;
  font-weight: 700;
  text-align: center;
  width: 20mm;
  font-size: 9pt;
}

.statement-supplier-value {
  font-size: 9.5pt;
}

.statement-seal {
  display: inline-block;
  margin-left: 5mm;
  border: 1.5pt solid #C00;
  border-radius: 50%;
  padding: 0.5mm 2.5mm;
  color: #C00;
  font-size: 8.5pt;
  font-weight: 700;
  transform: rotate(-8deg);
}
```

---

## 4. 거래명세서 금액/배송 영역 (16mm)

```css
.statement-meta {
  height: var(--print-sales-statement-meta); /* 16mm */
  display: flex;
  flex-direction: column;
  border: 1px solid #000;
  border-bottom: none;
}

.statement-shipping-row {
  padding: 2mm 4mm;
  border-bottom: 1px solid #000;
  font-size: 10pt;
  display: flex;
  align-items: center;
  gap: 4mm;
  min-height: 8mm;
}

.statement-shipping-row .meta-label {
  font-weight: 700;
  background: #FFF3CD;
  padding: 0 2mm;
  flex-shrink: 0;
}

.statement-amount-row {
  padding: 2mm 4mm;
  font-size: 10pt;
  display: flex;
  align-items: center;
  gap: 4mm;
  min-height: 8mm;
}

.statement-amount-row .meta-label {
  font-weight: 700;
  background: #FFF3CD;
  padding: 0 2mm;
  flex-shrink: 0;
}

.statement-amount-korean {
  font-weight: 600;
  flex: 1;
}

.statement-amount-number {
  margin-left: auto;
  font-weight: 700;
  font-size: 12pt;
  font-variant-numeric: tabular-nums;
}
```

---

## 5. 거래명세서 라인 테이블 — 8컬럼

이카운트 판매입력 화면 (20260509_091636.png) 기준:

| 컬럼 | 너비 | 정렬 | 비고 |
|------|------|------|------|
| 월/일 | 14mm | center | slipDate M/D |
| 품목명 | 58mm | left | modelName + (productName) |
| 규격 | 18mm | center | specification |
| 수량 | 12mm | right | tabular-nums |
| 단가 | 24mm | right | 원, tabular-nums |
| 공급가액 | 28mm | right | qty × unitPrice |
| 부가세 | 20mm | right | 10% |
| 적요 | 12mm (flex 1) | left | memo |

합계: 14 + 58 + 18 + 12 + 24 + 28 + 20 + 12 = 186mm (본문 전체 사용)

```css
.statement-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 9pt;
  line-height: 1.4;
}

.statement-table th,
.statement-table td {
  border: 1px solid #000;
  padding: 1.5mm 2mm;
  vertical-align: middle;
}

.statement-table th {
  background: #F0F0F0;
  font-weight: 700;
  text-align: center;
  font-size: 9pt;
}

.statement-table td.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.statement-table td.center { text-align: center; }

.statement-table tbody tr.pad-row td {
  height: 8mm;
}

/* 컬럼 너비 */
.statement-table .col-date    { width: 14mm; }
.statement-table .col-product { /* flex */ }
.statement-table .col-spec    { width: 18mm; }
.statement-table .col-qty     { width: 12mm; }
.statement-table .col-price   { width: 24mm; }
.statement-table .col-supply  { width: 28mm; }
.statement-table .col-vat     { width: 20mm; }
.statement-table .col-memo    { width: 12mm; }
```

---

## 6. 거래명세서 합계/인수란 (14mm)

5셀 가로 배치 (이카운트 InvoiceView v3 패턴):

| 셀 | 내용 | 비고 |
|----|------|------|
| 수량 | 합계 수량 | tabular-nums |
| 공급가액 | 합계 | tabular-nums |
| VAT | 부가세 합계 | tabular-nums |
| 합계 | 최종 합계 | 700 강조 |
| 인수 | blank 서명란 | 수기 가능 |

```css
.statement-totals {
  height: var(--print-sales-statement-totals); /* 14mm */
  display: grid;
  grid-template-columns: 1fr 2fr 2fr 2fr 1fr;
  border: 1px solid #000;
  border-top: none;
}

.statement-total-cell {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  border-right: 1px solid #000;
  padding: 2mm 3mm;
  gap: 2mm;
}

.statement-total-cell:last-child {
  border-right: none;
}

.statement-total-cell .label {
  background: #F0F0F0;
  font-weight: 700;
  font-size: 9pt;
  padding: 1mm 2mm;
}

.statement-total-cell .value {
  text-align: right;
  font-weight: 600;
  font-size: 10pt;
  font-variant-numeric: tabular-nums;
}

.statement-total-cell.grand .value {
  font-weight: 700;
  font-size: 11pt;
}
```

---

## 7. 계좌 정보란 (10mm)

```css
.statement-bank {
  height: var(--print-sales-statement-bank); /* 10mm */
  background: #FFF3CD;
  border: 1px solid #000;
  border-top: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2mm 4mm;
  font-size: 10pt;
  font-weight: 600;
}

.statement-bank-amount {
  font-size: 12pt;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
```

내용: `예금주: (주)삼한공조시스템 / 국민은행 750627-01-002557 · 기업은행 010-3748-9937`

---

## 8. 양식 2 — 계산서 A4 portrait 영역 분할

세금계산서 형식 (legacy GAS 정합 + 이카운트 판매 구조 반영):

| 영역 | 높이 | CSS 변수 | 비고 |
|------|------|----------|------|
| 최상단 제목행 | 14mm | `--print-sales-invoice-title` | "거래명세서 (세금계산서)" 중앙 |
| 2-panel 상단 | 44mm | `--print-sales-invoice-panels` | 공급자(좌) / 공급받는자(우) |
| 작성일/공급가/세액/합계 | 20mm | `--print-sales-invoice-summary` | 4행 테이블 형식 |
| 라인 테이블 | 120mm | `--print-sales-invoice-table` | 7컬럼, 기본 10행 |
| 합계행 | 12mm | `--print-sales-invoice-totals` | tfoot 형식 |
| 계좌/서명 | 14mm | `--print-sales-invoice-bank` | 계좌 + 서명란 |
| 푸터 | 10mm | `--print-sales-invoice-footer` | 출력일시 |

**A4 budget 검산:**
```
14 + 4 + 44 + 4 + 20 + 4 + 120 + 4 + 12 + 4 + 14 + 4 + 10 = 258mm < 273mm (여유 15mm)
```

---

## 9. 계산서 최상단 (14mm)

```css
.invoice-title-area {
  height: var(--print-sales-invoice-title); /* 14mm */
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 2.5px solid #000;
  margin-bottom: 4mm;
}

.invoice-main-title {
  font-size: 18pt;
  font-weight: 700;
  letter-spacing: 4px;
}

.invoice-sub-title {
  font-size: 11pt;
  font-weight: 400;
  color: #333;
  margin-left: 6mm;
  letter-spacing: 1px;
}
```

---

## 10. 계산서 2-panel — 공급자 / 공급받는자 (44mm)

세금계산서 표준 양식 (부가가치세법 시행규칙 별지 제11호 서식 참조):

```
┌─────────────────────────────┬─────────────────────────────┐
│ 공  급  자                  │ 공 급 받 는 자              │
├──────┬──────────────────────┼──────┬──────────────────────┤
│ 등록번호 │ 214-87-20659      │ 등록번호 │ 123-45-67890      │
├──────┼──────────────────────┼──────┼──────────────────────┤
│ 상호  │ (주)삼한공조시스템  │ 상호  │ (주)ABC거래처       │
├──────┼──────────────────────┼──────┼──────────────────────┤
│ 성명  │ 김미선 [인]          │ 성명  │ 홍길동              │
├──────┼──────────────────────┼──────┼──────────────────────┤
│ 주소  │ 서울 서초구...       │ 주소  │ 경기 수원시...      │
├──────┼──────────────────────┼──────┼──────────────────────┤
│ 업태  │ 도매 / 종목: 에어컨  │ 업태  │ 서비스업 / 종목: 냉방│
└──────┴──────────────────────┴──────┴──────────────────────┘
```

```css
.invoice-panels {
  height: var(--print-sales-invoice-panels); /* 44mm */
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 6mm;
  margin-bottom: 4mm;
}

.invoice-panel {
  border: 1px solid #000;
}

.invoice-panel-header {
  background: #F0F0F0;
  font-weight: 700;
  font-size: 11pt;
  text-align: center;
  padding: 2mm 0;
  border-bottom: 1px solid #000;
  letter-spacing: 4px;
}

.invoice-panel-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 9pt;
}

.invoice-panel-table td {
  border-bottom: 1px solid #000;
  padding: 1.5mm 2.5mm;
  vertical-align: middle;
}

.invoice-panel-table td:last-child {
  border-bottom: none;
}

.invoice-panel-table .field-label {
  background: #F8F8F8;
  font-weight: 700;
  width: 18mm;
  text-align: center;
  border-right: 1px solid #000;
}

.invoice-panel-table .field-value {
  font-size: 9pt;
}

.invoice-panel-table .field-value.seal-cell .seal {
  display: inline-block;
  margin-left: 4mm;
  border: 1.5pt solid #C00;
  border-radius: 50%;
  padding: 0.5mm 2mm;
  color: #C00;
  font-size: 8pt;
  font-weight: 700;
  transform: rotate(-8deg);
}
```

---

## 11. 계산서 작성일/공급가/세액/합계 요약 (20mm)

세금계산서 표준 필수 기재사항:

```css
.invoice-summary {
  height: var(--print-sales-invoice-summary); /* 20mm */
  width: 100%;
  border-collapse: collapse;
  border: 1px solid #000;
  border-bottom: none;
  margin-bottom: 0;
}

.invoice-summary td {
  border: 1px solid #000;
  padding: 1.5mm 3mm;
  vertical-align: middle;
  font-size: 9.5pt;
}

.invoice-summary .sum-label {
  background: #F0F0F0;
  font-weight: 700;
  text-align: center;
  width: 22mm;
}

.invoice-summary .sum-value {
  font-weight: 700;
  font-size: 10pt;
  font-variant-numeric: tabular-nums;
}
```

4행 구성:
- 작성일: YYYY년 MM월 DD일
- 공급가액: 금액 (tabular-nums)
- 세액 (부가세 10%): 금액
- 합계금액: 공급가액 + 세액 (강조 700 11pt)

---

## 12. 계산서 라인 테이블 — 7컬럼

세금계산서 법정 양식 기준:

| 컬럼 | 너비 | 정렬 | 비고 |
|------|------|------|------|
| 월/일 | 14mm | center | 날짜 |
| 품목명 | 68mm | left | modelName |
| 규격 | 18mm | center | specification |
| 수량 | 14mm | right | tabular-nums |
| 단가 | 26mm | right | tabular-nums |
| 공급가액 | 28mm | right | tabular-nums |
| 세액 | 18mm | right | VAT 10% |

합계: 14 + 68 + 18 + 14 + 26 + 28 + 18 = 186mm

```css
.invoice-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 9pt;
}

.invoice-table th,
.invoice-table td {
  border: 1px solid #000;
  padding: 1.5mm 2mm;
  vertical-align: middle;
}

.invoice-table th {
  background: #F0F0F0;
  font-weight: 700;
  text-align: center;
}

.invoice-table .col-date    { width: 14mm; text-align: center; }
.invoice-table .col-product { text-align: left; font-weight: 600; }
.invoice-table .col-spec    { width: 18mm; text-align: center; }
.invoice-table .col-qty     { width: 14mm; text-align: right; font-variant-numeric: tabular-nums; }
.invoice-table .col-price   { width: 26mm; text-align: right; font-variant-numeric: tabular-nums; }
.invoice-table .col-supply  { width: 28mm; text-align: right; font-variant-numeric: tabular-nums; }
.invoice-table .col-vat     { width: 18mm; text-align: right; font-variant-numeric: tabular-nums; }
```

---

## 13. @media print

```css
@media print {
  @page sales-statement {
    size: A4 portrait;
    margin: 12mm;
  }

  @page sales-invoice {
    size: A4 portrait;
    margin: 12mm;
  }

  .statement-print-page,
  .invoice-print-page {
    width: 186mm;
    font-family: 'Pretendard', 'Pretendard Variable', 'Noto Sans KR', sans-serif;
    font-size: 9pt;
    color: #000;
    background: #FFF;
  }

  .statement-print-page { page: sales-statement; }
  .invoice-print-page   { page: sales-invoice; }

  .statement-table th,
  .invoice-table th,
  .statement-supplier-side,
  .invoice-panel-header {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  tr { page-break-inside: avoid; break-inside: avoid; }
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }

  .statement-totals,
  .statement-bank,
  .invoice-panels,
  .invoice-summary {
    page-break-inside: avoid;
    break-inside: avoid;
  }
}
```

---

## 14. design-system 컴포넌트 결정

### 결론: 신규 전용 컴포넌트 2종

| 파일 | 역할 |
|------|------|
| `clients/desktop/src/renderer/print/SalesStatementView.tsx` | 거래명세서 인쇄 View |
| `clients/desktop/src/renderer/print/SalesStatementView.module.css` | 거래명세서 전용 CSS |
| `clients/desktop/src/renderer/print/SalesInvoiceView.tsx` | 계산서 인쇄 View |
| `clients/desktop/src/renderer/print/SalesInvoiceView.module.css` | 계산서 전용 CSS |

SP-08-5-5 `PurchaseSlipView` 패턴 동일 적용:
```tsx
<PrintLayout paper="a4-portrait" backTo={`/sales/${id}`}>
  <div className={styles.page} data-testid="statement-print-area">
    ...
  </div>
</PrintLayout>
```

Route:
- `/sales/:id/statement/print` → `SalesStatementView`
- `/sales/:id/invoice/print` → `SalesInvoiceView`

---

## 15. 폰트 spec

| 역할 | pt | weight | 비고 |
|------|----|--------|------|
| 거래명세서 제목 | 22pt | 700 | letter-spacing 8px |
| 계산서 제목 | 18pt | 700 | letter-spacing 4px |
| 회사명 | 11pt | 700 | |
| 수신처명 (거래처) | 13pt | 700 | receiver-name |
| 공급자/수신자 라벨 | 10~11pt | 700 | panel-header |
| 패널 필드 | 9pt | 일반/700 | label 700, value 일반 |
| 금액 한글 | 10pt | 600 | |
| 금액 숫자 | 12pt | 700 | tabular-nums |
| 테이블 기본 | 9pt | 일반 | |
| 합계 강조 | 11pt | 700 | |
| 인장 [인] | 8.5pt | 700 | 빨간 원형 |
| 계좌 정보 | 10pt | 600 | 노란 배경 |
| 푸터 | 8pt | 일반 | #555 |

---

## 16. 색상 정책 (인쇄 흑백 안전 + 세금계산서 강조)

| 용도 | 색상 | 비고 |
|------|------|------|
| 기본 border | `#000` | |
| 텍스트 | `#000` | |
| 테이블 헤더 배경 | `#F0F0F0` | print-color-adjust: exact |
| 패널 헤더 배경 | `#F0F0F0` | print-color-adjust: exact |
| 필드 라벨 배경 | `#F8F8F8` / `#F5F5F5` | |
| 금액/배송 강조 배경 | `#FFF3CD` | 연노랑 (흑백 인쇄 시 밝은 회색) |
| 계좌 정보 배경 | `#FFF3CD` | 동일 |
| 인장 색상 | `#C00` (빨강) | -webkit-print-color-adjust: exact |
| tfoot/합계 | `#FAFAFA` | |
| 보조 텍스트 | `#555` | |

---

## 17. UUID 비공개 가드

| 인쇄 표시 항목 | 표시 여부 |
|----------------|-----------|
| 전표번호 (slipNo, SS-2026-XX-NNN) | O |
| 거래처명 (partnerName) | O |
| 사업자번호 (businessRegNo) | O |
| 대표자 (representativeName) | O |
| 전화번호 (contactPhone) | O |
| 주소 (address) | O |
| 출하창고명 (warehouseName) | O |
| 품목명 / 모델명 | O |
| 규격 (specification) | O |
| 담당자 fullName | O (슬립 담당자) |
| 업태/종목 | O |
| UUID (모든 internal ID) | X — 절대 노출 금지 |

---

## 18. 한국어 라벨 표

| 영문 필드명 | 한국어 라벨 | 양식 |
|------------|------------|------|
| `salesStatement` | 거래명세서 | 제목 |
| `salesInvoice` | 거래명세서 (세금계산서) | 제목 |
| `slipNo` | 일련번호 | 공급자 정보 |
| `slipDate` | 전표일자 / 작성일 | 헤더/요약 |
| `partnerName` | 거래처 / 상호 | |
| `businessRegNo` | 사업자등록번호 | |
| `representativeName` | 성명 | 공급자 정보 |
| `contactPhone` | TEL | |
| `address` | 주소 | |
| `businessType` | 업태 | 계산서 panel |
| `businessCategory` | 종목 | 계산서 panel |
| `warehouseName` | 출하창고 | |
| `deliveryAddress` | 배송지 | 거래명세서 meta |
| `productName` | 품목명 | 테이블 |
| `specification` | 규격 | 테이블 |
| `quantity` | 수량 | 테이블 |
| `unitPrice` | 단가 | 테이블 |
| `lineTotal` | 공급가액 | 테이블 컬럼 |
| `vat` | 부가세 / 세액 | 테이블 컬럼 |
| `memo` | 적요 | 거래명세서 |
| `supplyTotal` | 공급가액 | 합계 |
| `vatTotal` | VAT / 세액 | 합계 |
| `grandTotal` | 합계 | 합계 (강조) |
| `totalQuantity` | 수량 | 합계행 |
| `acceptSign` | 인수 | 거래명세서 합계 5셀 |
| `bankAccount` | 계좌 정보 | 하단 |
| `printedAt` | 출력일시 | 푸터 |

---

## 19. SP-08-5-5 회고 누적 (D-1 교훈)

1. **A4 budget 검산 필수**: 영역 합계가 273mm 초과 불가. 라인 테이블은 가변 처리.
2. **거래처 정보 2열 grid**: 좌/우 필드 분리. border 1px solid #000 박스 필수.
3. **8컬럼 너비 합 = 186mm**: mm 단위 직접 지정, % 혼용 금지.
4. **흑백 인쇄 안전**: `print-color-adjust: exact` 배경색 블록에만 적용.
5. **`page-break-inside: avoid`**: 합계/계좌/패널 영역 페이지 분리 방지.
6. **인장 [인]**: 세금계산서 법정 양식 — 빨간 원형 border-radius: 50%, transform: rotate(-8deg).
7. **연노랑 배경 (#FFF3CD)**: 흑백 인쇄 시 밝은 회색으로 출력 — 계좌/금액 강조에 안전.

---

## 20. Iteration 가드

본 spec 은 1차 결정. 의무 iteration:
1. mock HTML 4장 생성 → Edge 캡처
2. 사용자 피드백 → CSS 미세 조정
3. 2차 Edge 캡처 → 정렬 확인
4. (필요 시) 3~5차 추가 조정

`feedback_print_design_iteration.md` 준수 — 단번 완성 가정 금지.
