# Print Spec — SP-08-5-5 매입 전표 인쇄 양식

**결정일**: 2026-05-18
**담당 에이전트**: Designer
**슬라이스**: SP-08-5-5 P1 매입 인쇄 양식

---

## 0. legacy GAS 양식 캡처 조사 결과

`docs/legacy/` 와 `docs/migration/legacy-print-forms/` 디렉토리 **존재하지 않음**.
`docs/migration/ecount-reference/` 16장 PNG 전수 열람 — 메뉴 캡처 (거래처등록/품목등록/구매입력/판매입력/창고이동입력/사원등록) 이며, **매입 전표 인쇄 양식 캡처 없음**.

결론: GAS 인쇄 양식 캡처 미존재. SP-08-5-5 는 이카운트 구매입력 화면 (20260509_091652.png) + 기존 `InboundView` 구조 + sales-polish-2-slice print-spec.md 패턴을 기준으로 **신규 spec 결정**.

`feedback_print_design_iteration` 준수: 본 spec 은 1차 mock 기준이며 사용자 Edge 캡처 → 3-5회 iteration 의무.

---

## 1. A4 portrait 영역 분할

```
@page: A4 portrait (210mm × 297mm), margin: 12mm
본문 영역: 186mm × 273mm
```

| 영역 | 높이 | CSS 변수 | 비고 |
|------|------|----------|------|
| 헤더 | 30mm | `--print-budget-purchase-header` | 회사명 + 양식 제목 + 슬립번호/날짜 |
| 거래처 정보 | 25mm | `--print-budget-purchase-partner` | 테이블 형식 좌우 2열 분할 |
| 라인 테이블 | 150mm | `--print-budget-purchase-table` | 행 높이 8mm 기준 약 18행 fit |
| 합계 | 20mm | `--print-budget-purchase-totals` | 공급가액/부가세/합계 3행 |
| 검수란 | 30mm | `--print-budget-purchase-inspection` | 검수일자/검수자/결과/비고 수기 |
| 푸터 | 12mm | `--print-budget-purchase-footer` | 비고 + 출력일시 |

**A4 budget 검산:**
```
30 + 4(gap) + 25 + 4 + 150 + 4 + 20 + 4 + 30 + 4 + 12 = 287mm > 273mm
```
라인 테이블을 가변 처리 (10행 이하 약 90mm, 18행 최대 150mm). 기본 10행 spec:
```
30 + 4 + 25 + 4 + 90 + 4 + 20 + 4 + 30 + 4 + 12 = 227mm (여유 46mm)
```

---

## 2. 헤더 (30mm)

### 2.1 layout

```
┌──────────────────────────────────────────┐
│ [로고/회사명 좌]  [매 입 전 표 중앙]       │ 10mm
├──────────────────────────────────────────┤
│ 전표번호: SP-2026-XXXXX   전표일자: YYYY년 MM월 DD일 │ 8mm
├──────────────────────────────────────────┤
│ 담당자: 홍길동               인쇄일시: YYYY-MM-DD HH:mm │ 6mm
└──────────────────────────────────────────┘
```

### 2.2 CSS spec

```css
.purchase-print-header {
  height: var(--print-budget-purchase-header); /* 30mm */
  border-bottom: 2px solid #000;
  padding-bottom: 3mm;
  margin-bottom: 4mm;
}

.purchase-print-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 10mm;
}

.purchase-print-company-name {
  font-size: 11pt;
  font-weight: 700;
  color: #000;
}

.purchase-print-form-title {
  font-size: 20pt;
  font-weight: 700;
  letter-spacing: 6px;
  color: #000;
  text-align: center;
  flex: 1;
}

.purchase-print-meta-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 10pt;
  margin-top: 2mm;
}

.purchase-print-meta-row .slip-no {
  font-weight: 700;
  font-size: 11pt;
  border: 1px solid #000;
  padding: 1mm 3mm;
  display: inline-block;
}
```

---

## 3. 거래처 정보 (25mm)

이카운트 구매입력 화면 (20260509_091652.png) 기준 필드 정렬:
- 좌열: 거래처명, 사업자번호, 대표자, 전화번호
- 우열: 입고창고, 담당자, 주소

```css
.purchase-print-partner {
  height: var(--print-budget-purchase-partner); /* 25mm */
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 6mm;
  border: 1px solid #000;
  padding: 3mm 4mm;
  margin-bottom: 4mm;
}

.purchase-print-partner-field {
  display: flex;
  align-items: baseline;
  gap: 2mm;
  font-size: 9pt;
  line-height: 1.6;
}

.purchase-print-partner-field .label {
  font-weight: 700;
  font-size: 9pt;
  color: #000;
  flex-shrink: 0;
  min-width: 18mm;
}

.purchase-print-partner-field .value {
  font-size: 9pt;
  color: #000;
}

.purchase-print-partner-field .value.emphasis {
  font-weight: 700;
  font-size: 10pt;
}
```

---

## 4. 라인 테이블

### 4.1 컬럼 구성 (이카운트 구매입력 화면 기준)

| 컬럼 | 너비 | 정렬 | 비고 |
|------|------|------|------|
| No. | 8mm | center | 행 번호 |
| 품목명 | 60mm | left | modelName + (productName) |
| 규격 | 20mm | center | specification |
| 수량 | 14mm | right | tabular-nums |
| 단가 | 22mm | right | 원, tabular-nums |
| 공급가액 | 28mm | right | qty × unitPrice |
| 부가세 | 22mm | right | 10% |
| 적요 | 12mm (flex 1) | left | memo |

합계 너비: 8 + 60 + 20 + 14 + 22 + 28 + 22 + 12 = 186mm (본문 전체 사용)

### 4.2 행 높이

- 헤더 행 (thead): 8mm (회색 배경 `#F0F0F0`)
- 데이터 행 (tbody): 8mm 기준 (내용 많을 시 자동 확장)
- 패딩 행 (빈 행): 데이터 행 < 10 시 남은 자리 채움 (수기 가능)
- 합계 행 (tfoot): 8mm (진하게, `#FAFAFA` 배경)

### 4.3 CSS spec

```css
.purchase-print-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 9pt;
  line-height: 1.4;
}

.purchase-print-table th,
.purchase-print-table td {
  border: 1px solid #000;
  padding: 1.5mm 2mm;
  vertical-align: middle;
}

.purchase-print-table th {
  background: #F0F0F0;
  font-weight: 700;
  text-align: center;
  font-size: 9pt;
}

.purchase-print-table td.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.purchase-print-table td.center { text-align: center; }

.purchase-print-table tbody tr.pad-row td {
  height: 8mm;
  color: transparent; /* 빈 행 수기 가능 영역 */
}

.purchase-print-table tfoot td {
  font-weight: 700;
  background: #FAFAFA;
  font-size: 9pt;
}

/* 컬럼 너비 */
.purchase-print-table .col-no       { width: 8mm; }
.purchase-print-table .col-product  { /* flex */ }
.purchase-print-table .col-spec     { width: 20mm; }
.purchase-print-table .col-qty      { width: 14mm; }
.purchase-print-table .col-price    { width: 22mm; }
.purchase-print-table .col-supply   { width: 28mm; }
.purchase-print-table .col-vat      { width: 22mm; }
.purchase-print-table .col-memo     { width: 12mm; }
```

---

## 5. 합계란 (20mm)

```css
.purchase-print-totals {
  height: var(--print-budget-purchase-totals); /* 20mm */
  display: flex;
  flex-direction: column;
  justify-content: center;
  border: 1px solid #000;
  border-top: none;
  padding: 2mm 4mm;
  gap: 1mm;
}

.purchase-print-totals .total-row {
  display: flex;
  justify-content: flex-end;
  gap: 8mm;
  align-items: center;
  font-size: 9pt;
}

.purchase-print-totals .total-row.grand {
  font-weight: 700;
  font-size: 10pt;
  border-top: 1px solid #000;
  padding-top: 1mm;
  margin-top: 1mm;
}

.purchase-print-totals .total-label {
  min-width: 20mm;
  font-weight: 600;
}

.purchase-print-totals .total-value {
  min-width: 28mm;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
```

---

## 6. 검수란 (30mm) — 수기 작성 영역

```
┌──────────────────────────────────────────────────────┐
│  검수일자                                              │ 8mm (라벨+값 칸)
├──────────────────────────────────────────────────────┤
│  검수자         [인]                                   │ 8mm
├──────────────────────────────────────────────────────┤
│  검수결과       □ 정상  □ 부분  □ 반품                │ 8mm
├──────────────────────────────────────────────────────┤
│  비고                                                  │ 6mm
└──────────────────────────────────────────────────────┘
```

```css
.purchase-print-inspection {
  height: var(--print-budget-purchase-inspection); /* 30mm */
  border: 1px solid #000;
  border-top: none;
  display: flex;
  flex-direction: column;
  margin-bottom: 4mm;
}

.purchase-print-inspection-row {
  display: flex;
  align-items: center;
  border-bottom: 1px solid #000;
  min-height: 8mm;
  padding: 1.5mm 3mm;
}

.purchase-print-inspection-row:last-child {
  border-bottom: none;
  flex: 1;
}

.purchase-print-inspection-row .label {
  font-size: 9pt;
  font-weight: 700;
  min-width: 16mm;
  flex-shrink: 0;
  color: #000;
}

.purchase-print-inspection-row .value {
  font-size: 9pt;
  flex: 1;
  /* 빈 공간 수기 가능 — 인쇄 시 blank */
}

.purchase-print-inspection-row .sign-mark {
  margin-left: 4mm;
  font-size: 9pt;
}
```

---

## 7. 푸터 (12mm)

```css
.purchase-print-footer {
  height: var(--print-budget-purchase-footer); /* 12mm */
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  border-top: 1px solid #000;
  padding-top: 2mm;
  font-size: 8pt;
  color: #555;
}
```

내용:
- 좌: 비고 (memo) 필드 값 또는 빈 문자열
- 우: `출력일시: YYYY-MM-DD HH:mm` (no-print 아닌 런타임 값)

---

## 8. @media print

```css
@media print {
  @page purchase-print {
    size: A4 portrait;
    margin: 12mm;
  }

  .purchase-print-page {
    page: purchase-print;
    width: 186mm;
    font-family: 'Pretendard', 'Pretendard Variable', 'Noto Sans KR', sans-serif;
    font-size: 9pt;
    color: #000;
    background: #FFF;
  }

  .purchase-print-table th,
  .purchase-print-inspection-row {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  tr { page-break-inside: avoid; break-inside: avoid; }
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }

  .purchase-print-inspection,
  .purchase-print-totals {
    page-break-inside: avoid;
    break-inside: avoid;
  }
}
```

---

## 9. design-system 컴포넌트 결정

### 결론: 신규 전용 컴포넌트 불필요

기존 패턴으로 충분:
- `PrintLayout` (`clients/desktop/src/renderer/print/PrintLayout.tsx`) — 이미 `paper-a4-portrait` 클래스 + no-print 액션바 포함
- `global.css` `.paper-a4-portrait` 패턴 그대로 사용
- 매입 전표 전용 CSS는 `PurchaseSlipView.module.css` 신규 파일로 분리 (InboundView.module.css 패턴)

신규 파일:
- `clients/desktop/src/renderer/print/PurchaseSlipView.tsx`
- `clients/desktop/src/renderer/print/PurchaseSlipView.module.css`

`PrintLayout` props 재사용:
```tsx
<PrintLayout paper="a4-portrait" backTo={`/purchases/${id}`}>
  <div className={styles.purchasePrintPage} data-testid="purchase-print-area">
    ...
  </div>
</PrintLayout>
```

---

## 10. 폰트 spec

```css
font-family:
  'Pretendard',
  'Pretendard Variable',
  'Noto Sans KR',
  -apple-system,
  BlinkMacSystemFont,
  'Segoe UI',
  Roboto,
  sans-serif;
```

크기 매핑:
| 역할 | pt | 비고 |
|------|-----|------|
| 양식 제목 | 20pt | `매 입 전 표` letter-spacing 6px |
| 회사명 | 11pt | 헤더 좌 |
| 전표번호 | 11pt | border box |
| 거래처명 강조 | 10pt 700 | emphasis 클래스 |
| 거래처 필드 | 9pt | 일반 |
| 테이블 기본 | 9pt | thead/tbody/tfoot |
| 합계 최종행 | 10pt 700 | grand total |
| 검수란 | 9pt | 라벨 700, 값 일반 |
| 푸터 | 8pt | secondary color #555 |

---

## 11. 색상 정책 (인쇄 흑백 안전)

- border: `#000`
- 텍스트 기본: `#000`
- 테이블 헤더 배경: `#F0F0F0`
- tfoot 배경: `#FAFAFA`
- 보조 텍스트 (푸터/날짜): `#555`
- 수기 영역 (검수란 blank): 배경 `#FFFFFF`, border `#000` 만

---

## 12. UUID 비공개 가드

| 인쇄 표시 항목 | 원칙 |
|----------------|------|
| 전표번호 (slipNo) | O — 비즈니스 식별자 |
| 거래처명 (partnerName) | O — 비즈니스 식별자 |
| 사업자번호 (businessRegNo) | O — 한국 사업자 표준 |
| 품목명 (productName) | O — 비즈니스 식별자 |
| 모델명 (modelName) | O — 비즈니스 식별자 |
| 입고창고명 (warehouseName) | O — 비즈니스 식별자 |
| UUID (모든 internal ID) | X — 절대 노출 금지 |
| 사용자 UUID | X — 담당자 fullName 만 |

---

## 13. PNG 4장 mock spec (QA agent 생성용)

### 01-purchase-print-form-full.png
- A4 portrait 전체 미리보기
- 전표번호: `SP-2026-05-001`, 일자: `2026-05-18`
- 거래처: `(주)삼성공조`, 사업자번호: `123-45-67890`
- 입고창고: `A창고 (서울 양재)`
- 라인 5건: 에어컨 실내기 / 실외기 / 컨트롤러 / 냉매 / 배관키트
- 합계: 공급가액 5,000,000 / 부가세 500,000 / 합계 5,500,000
- 검수란 blank (수기 영역)

### 02-purchase-print-form-legacy-compare.png
- GAS 캡처 미존재로 이카운트 구매입력 화면 (좌) + 매입 전표 인쇄 양식 (우) side-by-side
- 이카운트 스크린샷: 20260509_091652.png 재활용
- 비교 목적: 필드 1:1 매핑 확인

### 03-purchase-print-form-multiline.png
- 라인 12건 (10행 초과)
- 테이블이 확장되어 검수란/합계가 다음 영역으로 밀리는 상황 표시
- `page-break-inside: avoid` 동작 시각화

### 04-purchase-print-form-blank-inspection.png
- 검수란만 클로즈업 (확대 뷰)
- 검수일자 / 검수자 / 검수결과 (체크박스 3개) / 비고 — 모두 blank
- 수기 작성용 충분한 여백 확인

---

## 14. 한국어 라벨 표

| 영문 enum / 필드명 | 한국어 라벨 | 비고 |
|-------------------|------------|------|
| `purchaseSlip` | 매입 전표 | 양식 제목 |
| `slipNo` | 전표번호 | 헤더 메타 |
| `slipDate` | 전표일자 | 헤더 메타 |
| `partnerName` | 거래처 | 거래처 정보 좌열 |
| `businessRegNo` | 사업자번호 | 거래처 정보 좌열 |
| `representativeName` | 대표자 | 거래처 정보 좌열 |
| `contactPhone` | 전화번호 | 거래처 정보 좌열 |
| `destinationWarehouse` | 입고창고 | 거래처 정보 우열, emphasis |
| `ownerFullName` | 담당자 | 거래처 정보 우열 |
| `address` | 주소 | 거래처 정보 우열 |
| `productName` | 품목명 | 테이블 컬럼 |
| `specification` | 규격 | 테이블 컬럼 |
| `quantity` | 수량 | 테이블 컬럼 |
| `unitPrice` | 단가 | 테이블 컬럼 |
| `lineTotal` (공급가) | 공급가액 | 테이블 컬럼 |
| `vat` | 부가세 | 테이블 컬럼 |
| `memo` (행) | 적요 | 테이블 컬럼 |
| `supplyTotal` | 공급가액 합계 | 합계란 |
| `vatTotal` | 부가세 합계 | 합계란 |
| `grandTotal` | 합계 | 합계란 (최종) |
| `inspectionDate` | 검수일자 | 검수란 |
| `inspectorName` | 검수자 | 검수란 |
| `inspectionResult` | 검수결과 | 검수란 |
| `inspectionMemo` | 비고 | 검수란 |
| `NORMAL` | 정상 | 검수결과 값 |
| `PARTIAL` | 부분 | 검수결과 값 |
| `RETURN` | 반품 | 검수결과 값 |
| `memo` (전표) | 비고 | 푸터 |
| `printedAt` | 출력일시 | 푸터 우측 |

---

## 15. Iteration 가드

본 spec 은 1차 결정 (GAS 캡처 미존재로 신규 기준). 의무 iteration:
1. 1차 mock HTML 생성 → Edge 캡처
2. 사용자 피드백 → CSS 미세 조정
3. 2차 Edge 캡처 → 정렬 확인
4. (필요 시) 3차 추가 조정

`feedback_print_design_iteration.md` 준수 — 단번 완성 가정 금지.
