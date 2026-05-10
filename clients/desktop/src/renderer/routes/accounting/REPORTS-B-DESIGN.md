# P0-1 Slice B — 부가세 신고서 / 법인세 신고서 / 거래처별 미수미지급 인쇄 양식 + 화면 디자인 가이드

> Designer 산출물 (P0-1 Slice B). Frontend agent 가 본 spec 을 토대로
> VatReportPrintLayout.tsx / CorporateTaxPrintLayout.tsx / PartnerAgingPrintLayout.tsx 구현.
> Slice A (REPORTS-DESIGN.md) 패턴 100% 계승 — 신규 컴포넌트 추가 자제, 기존 CSS 클래스 재사용.

---

## 1. 범위 및 전제

| 항목 | 내용 |
| --- | --- |
| 보고서 종류 | 부가세 신고서 / 법인세 신고서 / 거래처별 미수·미지급 현황 |
| 기준 | 부가세: 국세청 부가가치세 신고서 (일반과세자 간소형) / 법인세: 법인세법 별지 제3호 서식 단순화 |
| 용지 | A4 portrait (210mm × 297mm) |
| 여백 | 상하좌우 12mm (`@page { margin: 12mm; }`) |
| 인쇄 발행 | `window.print()` — 기존 `PrintLayout` wrapper 재사용 |
| 권한 | ACCOUNTANT / MASTER (BE @PreAuthorize ACCOUNTANT/MANAGER/MASTER 일치) |
| 회사 정보 | (주)삼한공조시스템 / 사업자등록번호 214-87-20659 |
| 재사용 대상 | `PrintLayout`, `COMPANY`, `krw`, `krDate` (`../../print/PrintLayout`) |

---

## 2. 컬러 토큰

### 2-1. Slice A 공통 토큰 (재사용)

| 용도 | CSS 토큰 |
| --- | --- |
| 합계 행 텍스트 | `var(--color-neutral-900)` |
| 합계 행 배경 | `var(--color-neutral-100)` |
| 카테고리 헤더 텍스트 | `var(--color-neutral-700)` |
| 라인 항목 텍스트 | `var(--color-neutral-800)` |
| 음수 금액 | `var(--color-danger)` |
| 에러 배너 배경 | `var(--state-danger-bg)` |
| 에러 배너 텍스트 | `var(--state-danger)` |
| 구분선 | `var(--color-neutral-200)` |
| 최종 합계행 배경 | `var(--color-neutral-900)` |
| 최종 합계행 텍스트 | `var(--color-neutral-0)` |
| 성공/균형 텍스트 | `var(--color-success)` |

### 2-2. Slice B 신규 — 미수/미지급 연체 단계

| 연체 단계 | 클래스 | 배경 토큰 | 텍스트 토큰 | 기준 |
| --- | --- | --- | --- | --- |
| 정상 (0~29일) | (없음) | `var(--color-neutral-200)` | `var(--color-neutral-800)` | overdueDays < 30 |
| 주의 (30~59일) | `.aging-overdue-warning` | `var(--state-warning-bg)` | `var(--state-warning)` | 30 ≤ overdueDays < 60 |
| 위험 (60일+) | `.aging-overdue-danger` | `var(--state-danger-bg)` | `var(--state-danger)` | overdueDays ≥ 60 |

### 2-3. 신고 기한 강조

| 용도 | CSS 토큰 |
| --- | --- |
| 신고 기한 배너 배경 | `var(--state-warning-bg)` |
| 신고 기한 배너 텍스트 | `var(--state-warning)` |
| 신고 기한 배너 border | `var(--color-warning)` |

---

## 3. 타이포그래피 스케일 (Slice A §3 인용)

| 요소 | 화면 token | 인쇄 token | weight |
| --- | --- | --- | --- |
| 보고서명 | `--font-size-2xl` (22px) | `var(--print-text-lg)` 18pt | bold 700 |
| 회사명 | `--font-size-xl` (18px) | 16pt | semibold 600 |
| 기간/작성일 | `--font-size-sm` (13px) | `var(--print-text-sm)` 11pt | regular 400 |
| 카테고리 헤더 | `--font-size-base` (14px) | `var(--print-text-md)` 12pt | semibold 600 |
| 라인 항목 / 금액 | `--font-size-sm` (13px) | `var(--print-text-sm)` 11pt | regular 400 |
| 합계/소계 금액 | `--font-size-base` (14px) | `var(--print-text-md)` 12pt | bold 700 |
| 신고 기한 뱃지 | `--font-size-sm` (13px) | `var(--print-text-sm)` 11pt | semibold 600 |
| 푸터 주석 | `--font-size-xs` (12px) | 9pt | regular 400 |

금액 컬럼: `text-align: right`, `font-variant-numeric: tabular-nums` 의무. 음수: `(1,234,567)` 괄호 + `var(--color-danger)`.

---

## 4. 부가세 신고서 인쇄 양식 spec

섹션 구성 (국세청 일반과세자 간소형 기반):

| 섹션 | 내용 |
| --- | --- |
| 헤더 | 회사명 / 사업자등록번호 / 보고서명 / 신고 과세기간 / 작성일 |
| 신고 기한 배너 | `.deadline-banner` — 주의색 강조 |
| I. 매출 과세 | 세금계산서 발급분 (공급가액/세액) / 기타 과세매출 / 합계 |
| II. 매입 공제 | 세금계산서 수취분 / 기타 공제매입 / 합계 |
| III. 납부(환급) 세액 | 매출세액 - 매입공제세액 = 차감납부(환급) 세액 |
| 푸터 | 세법 준거 주석 / 생성일시 |

표 컬럼 비율: 과목(50%) / 공급가액(30%) / 세액(20%). 소계 행 `.report-total-row` 재사용. 최종 납부세액 행 `.report-grand-total-row` 재사용.

### ASCII Mockup

```
========================================================================
                   (주)삼한공조시스템
                사업자등록번호: 214-87-20659

               부 가 세 신 고 서 (간소형)
              일반과세자 — 1기 확정신고

  과세기간: 2026년 1기 (2026. 01. 01 ~ 2026. 06. 30)
  작성일:   2026년 05월 10일                       (단위: 원)
========================================================================
  [신고 기한: 2026년 07월 25일 (지연 시 가산세)]   ← 주의색 배너
========================================================================
  구                  분         공 급 가 액        세       액
------------------------------------------------------------------------
I. 매출 과세
  세금계산서 발급분                 50,000,000      5,000,000
  기타 과세 매출                     5,000,000        500,000
  매출 합계                         55,000,000      5,500,000
========================================================================
II. 매입 공제
  세금계산서 수취분                 30,000,000      3,000,000
  기타 공제 매입                     2,000,000        200,000
  매입 합계                         32,000,000      3,200,000
========================================================================
III. 납부(환급) 세액
  매출세액 (①)                                      5,500,000
  매입공제세액 (②)                                  3,200,000
  차감납부(환급)세액 (①-②)                         2,300,000
========================================================================
  본 신고서는 부가가치세법에 따라 작성됨                       1 / 1
```

---

## 5. 법인세 신고서 인쇄 양식 spec

섹션 구성 (법인세법 별지 제3호 서식 단순화):

| 섹션 | 내용 |
| --- | --- |
| 헤더 | 회사명 / 사업자등록번호 / 보고서명 / 사업연도 / 작성일 |
| 신고 기한 배너 | `.deadline-banner` — 사업연도 종료 후 3개월 이내 |
| I. 법인세차감전순이익 | 손익계산서 최종값 인용 |
| II. 세무조정 | 익금산입/손금불산입 + 손금산입/익금불산입 + 합계 |
| III. 과세표준 | I + II |
| IV. 세율 적용 | `.tax-rate-box` 세율 표 + 산출세액 |
| V. 기납부·공제 | 중간예납 / 원천징수 / 기타 / 합계 |
| VI. 차감납부세액 | 산출세액 - 기납부·공제 |
| 푸터 | 세법 준거 주석 / 생성일시 |

### 세율 단계 표 (법인세법 §55)

| 과세표준 구간 | 세율 |
| --- | --- |
| 2억 원 이하 | 9% |
| 2억 원 초과 ~ 200억 원 이하 | 19% |
| 200억 원 초과 ~ 3,000억 원 이하 | 21% |
| 3,000억 원 초과 | 24% |

### ASCII Mockup

```
========================================================================
                   (주)삼한공조시스템
                사업자등록번호: 214-87-20659

               법 인 세 신 고 서 (간소형)

  사업연도: 2025년 01월 01일 ~ 2025년 12월 31일
  작성일:   2026년 05월 10일                       (단위: 원)
========================================================================
  [신고 기한: 2026년 03월 31일 (사업연도 종료 후 3개월 이내)]    ← 주의색 배너
========================================================================
  구                         분               금              액
------------------------------------------------------------------------
I. 법인세차감전순이익                              85,000,000
========================================================================
II. 세무조정
  익금산입 / 손금불산입 합계                        3,000,000
  손금산입 / 익금불산입 합계                       (1,000,000)
  세무조정 합계                                    2,000,000
========================================================================
III. 과세표준 (I + II)                            87,000,000
========================================================================
IV. 세율 적용
  +------------------------------------------------------------+
  |  2억 이하 9% / 2억~200억 19% / 200억~3000억 21% / 초과 24%  |
  +------------------------------------------------------------+
  (과세표준 87,000,000 — 2억 이하 구간 9% 단일 적용)
  산출세액 (④)                                    7,830,000
========================================================================
V. 기납부 / 공제 세액
  중간예납                                         3,000,000
  원천징수                                           500,000
  기타 기납부세액                                          —
  기납부·공제 합계 (⑤)                             3,500,000
========================================================================
VI. 차감납부세액 (④ - ⑤)                           4,330,000
========================================================================
  본 신고서는 법인세법에 따라 작성됨 / 세무사 확인 권장        1 / 1
```

---

## 6. 거래처별 미수/미지급 인쇄 양식 spec

섹션 구성:

| 섹션 | 내용 |
| --- | --- |
| 헤더 | 회사명 / 사업자등록번호 / 보고서명 / 기준일 / 작성일 |
| 유형 배너 | "미수 (매출채권)" 또는 "미지급 (매입채무)" 구분 |
| 거래처 목록 표 | 거래처코드 / 거래처명 / 잔액 / 최초 미결제일 / 연체일수 |
| 합계 행 | 전체 거래처 수 / 총 잔액 — `.report-grand-total-row` 재사용 |
| 범례 주석 | 연체 단계 색상 설명 |
| 푸터 | 주석 / 생성일시 |

표 컬럼 비율: 코드(12%) / 거래처명(28%) / 잔액(22%) / 최초미결제일(20%) / 연체일수(18%).
`type = 'RECEIVABLE'` → "거래처별 미수 현황 (매출채권)", `type = 'PAYABLE'` → "거래처별 미지급 현황 (매입채무)".

### ASCII Mockup

```
========================================================================
                   (주)삼한공조시스템
                사업자등록번호: 214-87-20659

           거 래 처 별  미 수  현 황  (매출채권)

  기준일: 2026년 05월 10일        작성일: 2026년 05월 10일
  (단위: 원)
========================================================================
  유형: 미수 (매출채권)  — 총 거래처 5개
========================================================================
 거래처코드  거  래  처  명    잔         액   최초미결제일   연체일수
------------------------------------------------------------------------
  C001     삼성전자(주)        5,500,000    2026-03-20      51일  ← 주의(노랑)
  C002     (주)LG디스플레이   12,000,000    2026-01-15     115일  ← 위험(빨강)
  C003     현대자동차(주)      3,200,000    2026-04-22      18일
  C004     (주)SK하이닉스      8,800,000    2026-02-10      89일  ← 위험(빨강)
  C005     롯데케미칼(주)      1,500,000    2026-05-01       9일
------------------------------------------------------------------------
  합 계    거래처 5개         31,000,000
========================================================================
  * 정상(흰색): 0~29일 / 주의(노랑): 30~59일 / 위험(빨강): 60일 이상
  * 연체 기준: 최초 미결제일 기준 경과일수 (기준일: 2026년 05월 10일)
  본 현황은 회계 장부 기준이며, 실제 청구 여부와 다를 수 있음   1 / 1
```

---

## 7. CSS @media print 지침

Slice A `.report-total-row` / `.report-grand-total-row` 완전 재사용. 신규 클래스는 글로벌 CSS 추가:

```css
@page { size: A4 portrait; margin: 12mm; }

.aging-overdue-warning {
  background-color: var(--state-warning-bg);
  color: var(--state-warning);
}
.aging-overdue-danger {
  background-color: var(--state-danger-bg);
  color: var(--state-danger);
}
.deadline-banner {
  background-color: var(--state-warning-bg);
  border: 1px solid var(--color-warning);
  border-radius: var(--radius-md);
  color: var(--state-warning);
  font-weight: var(--font-weight-semibold);
  padding: 8px 12px;
  margin-bottom: 12px;
  text-align: center;
}
.tax-rate-box {
  background-color: var(--color-neutral-50);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-sm);
  padding: 6pt 8pt;
  margin: 4pt 0 8pt 0;
}

@media print {
  .aging-overdue-warning,
  .aging-overdue-danger,
  .deadline-banner,
  .tax-rate-box {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}
```

---

## 8. Props spec (Frontend agent 전달)

### VatReportData

```typescript
interface VatReportData {
  period: string            // "20261" | "20262"
  fromDate: string          // "YYYY-MM-DD"
  toDate: string            // "YYYY-MM-DD"
  deadlineDate: string      // "YYYY-MM-DD" — 배너 강조

  // I. 매출 과세
  salesInvoiceSupplyAmount: string
  salesInvoiceVatAmount: string
  salesOtherSupplyAmount: string
  salesOtherVatAmount: string
  salesTotalSupplyAmount: string
  salesTotalVatAmount: string

  // II. 매입 공제
  purchaseInvoiceSupplyAmount: string
  purchaseInvoiceVatAmount: string
  purchaseOtherSupplyAmount: string
  purchaseOtherVatAmount: string
  purchaseTotalSupplyAmount: string
  purchaseTotalVatAmount: string

  // III. 납부(환급) 세액
  outputVatAmount: string     // 매출세액 합계 ①
  inputVatDeduction: string   // 매입공제세액 합계 ②
  netPayableVat: string       // 차감납부(환급)세액 ①-② (음수 = 환급)

  generatedAt: string         // ISO 8601
}
```

### CorporateTaxReportData

```typescript
interface CorporateTaxReportData {
  fiscalYear: string          // "YYYY"
  fromDate: string
  toDate: string
  deadlineDate: string

  incomeBeforeTax: string

  taxAdjustmentPlus: string   // 익금산입/손금불산입 합계 (양수)
  taxAdjustmentMinus: string  // 손금산입/익금불산입 합계 (양수 전달, 내부 음수 표시)
  taxAdjustmentTotal: string  // 세무조정 합계 (음수 가능)

  taxableIncome: string       // = incomeBeforeTax + taxAdjustmentTotal

  calculatedTax: string       // 산출세액
  effectiveRatePercent: string | null  // 단일 구간 "9"|"19"|"21"|"24"

  prepaidTax: string          // 중간예납
  withheldTax: string         // 원천징수
  otherPrepaidTax: string     // 기타
  totalPrepaidTax: string     // 기납부·공제 합계

  finalPayableTax: string     // = calculatedTax - totalPrepaidTax (음수=환급)

  generatedAt: string
}
```

### PartnerAgingData

```typescript
interface PartnerAgingData {
  asOfDate: string            // "YYYY-MM-DD"
  type: 'RECEIVABLE' | 'PAYABLE'
  partnerCount: number
  totalAmount: string         // 총 잔액 합계
  lines: PartnerAgingLine[]
  generatedAt: string
}

interface PartnerAgingLine {
  accountCode: string         // 거래처 코드 (UUID 아닌 비즈니스 코드)
  accountName: string         // 거래처명
  totalAmount: string         // 잔액 (양수)
  oldestUnpaidDate: string | null
  overdueDays: number         // 0 이상 정수
}

// FE 헬퍼
// function agingClass(overdueDays: number): string {
//   if (overdueDays >= 60) return 'aging-overdue-danger'
//   if (overdueDays >= 30) return 'aging-overdue-warning'
//   return ''
// }
```

---

## 9. 라우트 등록

```typescript
{ path: '/accounting/reports/vat/print',
  element: <RoleGuard allow={['ACCOUNTANT','MANAGER','MASTER']}><VatReportPrintLayout /></RoleGuard> },
{ path: '/accounting/reports/corporate-tax/print',
  element: <RoleGuard allow={['ACCOUNTANT','MANAGER','MASTER']}><CorporateTaxPrintLayout /></RoleGuard> },
{ path: '/accounting/reports/partner-aging/print',
  element: <RoleGuard allow={['ACCOUNTANT','MANAGER','MASTER']}><PartnerAgingPrintLayout /></RoleGuard> },
```

---

## 10. 구현 파일 위치

| 파일 | 내용 |
| --- | --- |
| `routes/accounting/print/VatReportPrintLayout.tsx` | 부가세 신고서 인쇄 컴포넌트 |
| `routes/accounting/print/CorporateTaxPrintLayout.tsx` | 법인세 신고서 인쇄 컴포넌트 |
| `routes/accounting/print/PartnerAgingPrintLayout.tsx` | 거래처별 미수·미지급 인쇄 컴포넌트 |
| `api/accounting.ts` | 신규 endpoint API client (Slice A 보강) |

---

## 11. Iteration 계획

| 회차 | 내용 |
| --- | --- |
| 1차 | 본 spec 작성 (현재) |
| 2차 | FE mock 구현 후 Edge 캡처 → 사용자 검토 |
| 3차 | 신고 기한 배너 / 세율 표 박스 / 연체 색상 CSS 미세 조정 |
| 4차 | 실 데이터 연결 후 다페이지 처리 |
| 5차 | 사용자 최종 승인 + QA 캡처 첨부 (`docs/qa/p0-1-slice-b/`) |

---

## 12. 검증 체크리스트

- raw hex 0건 — 모든 색상 CSS 토큰 인용 (PR #134 회고)
- Pretendard `var(--font-family-sans)` 선언
- `@page { size: A4 portrait; margin: 12mm; }` 선언
- `print-color-adjust: exact` + `-webkit-print-color-adjust: exact` 쌍 선언
- `.aging-overdue-warning` / `.aging-overdue-danger` 인쇄 강제 적용
- `.deadline-banner` / `.tax-rate-box` 인쇄 강제 적용
- `font-variant-numeric: tabular-nums` 금액 컬럼 전체
- 음수 금액 `(괄호 표기)` + `var(--color-danger)`
- UUID 화면 노출 0건 — `accountCode` / `accountName` / `period` / `fiscalYear` 만 노출
- `RoleGuard` ACCOUNTANT / MANAGER / MASTER 접근 제한 (BE 일치)
- Slice A `.report-total-row` / `.report-grand-total-row` 신규 CSS 미작성 (재사용)

---

## 13. 참조 파일

- Slice A 가이드: `clients/desktop/src/renderer/routes/accounting/REPORTS-DESIGN.md`
- 기존 인쇄 wrapper: `clients/desktop/src/renderer/print/PrintLayout.tsx`
- design-system 토큰: `clients/web/design-system/src/tokens/tokens.css`
- Slice A 인쇄 컴포넌트: `routes/accounting/print/IncomeStatementPrintLayout.tsx` / `BalanceSheetPrintLayout.tsx`
- API 클라이언트: `clients/desktop/src/renderer/api/accounting.ts`
