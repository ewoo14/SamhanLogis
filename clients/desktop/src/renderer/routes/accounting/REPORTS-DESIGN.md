# P0-1 Slice A — 손익계산서 / 재무상태표 인쇄 양식 + 화면 디자인 가이드

> Designer 산출물 (Phase 12 step-7 P0-1 Slice A). Frontend agent 가 본 spec 을 토대로 `IncomeStatementPrintLayout.tsx` / `BalanceSheetPrintLayout.tsx` 구현.

---

## 1. 범위 및 전제

| 항목 | 내용 |
| --- | --- |
| 보고서 종류 | 손익계산서 / 재무상태표 |
| 기준 | 한국 일반기업회계기준 (K-GAAP) — 종목별 분류 표시법 |
| 용지 | A4 portrait (210mm × 297mm) |
| 여백 | 상하좌우 12mm — 기존 PrintLayout 패턴 일치 (`@page { margin: 12mm; }`) |
| 인쇄 발행 | `window.print()` — 기존 `PrintLayout` wrapper 재사용 |
| 권한 | ACCOUNTANT / MASTER (`canAccessAccounting` 함수) |
| 회사 정보 | (주)삼한공조시스템 / 사업자등록번호 214-87-20659 |

---

## 2. 컬러 토큰 (raw hex 직접 사용 금지)

| 용도 | CSS 토큰 |
| --- | --- |
| 합계 행 텍스트 | `var(--color-neutral-900)` |
| 합계 행 배경 | `var(--color-neutral-100)` |
| 카테고리 헤더 텍스트 | `var(--color-neutral-700)` |
| 라인 항목 텍스트 | `var(--color-neutral-800)` |
| 음수 금액 | `var(--color-danger)` |
| balanced=false 배너 배경 | `var(--state-danger-bg)` |
| balanced=false 배너 텍스트 | `var(--state-danger)` |
| 구분선 | `var(--color-neutral-200)` |
| 당기순이익 / 자산합계 최종행 배경 | `var(--color-neutral-900)` |
| 당기순이익 / 자산합계 최종행 텍스트 | `var(--color-neutral-0)` |
| balanced=true 텍스트 | `var(--color-success)` |

인쇄 폰트 크기는 기존 `tokens.css` 의 `--print-text-sm`(11pt) / `--print-text-md`(12pt) / `--print-text-lg`(18pt) 토큰 그대로 인용.

---

## 3. 타이포그래피 스케일

| 요소 | 화면 token | 인쇄 token | weight |
| --- | --- | --- | --- |
| 보고서명 | `--font-size-2xl` (22px) | `var(--print-text-lg)` 18pt | bold 700 |
| 회사명 | `--font-size-xl` (18px) | 16pt | semibold 600 |
| 기간/작성일 | `--font-size-sm` (13px) | `var(--print-text-sm)` 11pt | regular 400 |
| 카테고리 헤더 | `--font-size-base` (14px) | `var(--print-text-md)` 12pt | semibold 600 |
| 라인 항목 | `--font-size-sm` (13px) | `var(--print-text-sm)` 11pt | regular 400 |
| 금액 (tabular-nums) | `--font-size-sm` (13px) | `var(--print-text-sm)` 11pt | regular 400 |
| 합계/소계 금액 | `--font-size-base` (14px) | `var(--print-text-md)` 12pt | bold 700 |
| 푸터 주석 | `--font-size-xs` (12px) | 9pt | regular 400 |

금액 컬럼: `text-align: right`, `font-variant-numeric: tabular-nums` 의무. 음수: `(1,234,567)` 괄호 표기 + `var(--color-danger)`.

---

## 4. 손익계산서 인쇄 양식 spec

**계정 분류 매핑** (BE `category` → 섹션):

| BE category | 섹션명 | 로마자 번호 |
| --- | --- | --- |
| `400` 매출 | 매출액 | I |
| `500` 매출원가 | 매출원가 | II |
| (계산) | 매출총이익 = I - II | III |
| `800` 판관비 | 판매비와관리비 | IV |
| (계산) | 영업이익 = III - IV | V |
| `900` 영업외 | 영업외수익·비용 | VI |
| (계산) | 법인세차감전순이익 | VII |
| `991` 법인세 | 법인세비용 | VIII |
| (계산) | 당기순이익 | IX |

**ASCII Mockup** (이카운트/더존 패턴 참조):

```
==============================================================
            (주)삼한공조시스템
         사업자등록번호: 214-87-20659

              손  익  계  산  서

  기간: 2026년 01월 01일 ~ 2026년 05월 31일
  작성일: 2026년 05월 10일                (단위: 원)
==============================================================
  과                    목                   금          액
==============================================================
I. 매출액
   상품매출  (4100)                       12,000,000
   제품매출  (4200)                        8,000,000
                                      ---------------
   매출액 합계                            20,000,000
==============================================================
II. 매출원가
   상품매출원가 (5100)                     7,000,000
                                      ---------------
   매출원가 합계                           7,000,000
==============================================================
III. 매출총이익                           13,000,000
==============================================================
IV. 판매관리비
   급여       (8100)                       3,000,000
   임차료     (8200)                         500,000
   접대비     (8300)                         200,000
                                      ---------------
   판관비 합계                             3,700,000
==============================================================
V. 영업이익                               9,300,000
==============================================================
VI. 영업외수익 / 비용
   이자수익   (9100)                          50,000
   이자비용   (9200)                        (100,000)
                                      ---------------
   영업외 순액                               (50,000)
==============================================================
VII. 법인세비용차감전순이익               9,250,000
==============================================================
VIII. 법인세비용                                  —
==============================================================
IX. 당기순이익                            9,250,000
==============================================================
  본 보고서는 한국 일반기업회계기준(K-GAAP)에 따라 작성됨
                                                   1 / 1
```

---

## 5. 재무상태표 인쇄 양식 spec

**계정 분류 매핑**: `100` = 자산 (좌단), `200` = 부채 (우단), `300` = 자본 (우단).
자산 유동/비유동: accountCode 110~119 = 유동, 120~199 = 비유동.

**ASCII Mockup**:

```
==================================================================
                 (주)삼한공조시스템
              사업자등록번호: 214-87-20659

                   재  무  상  태  표

  기준일: 2026년 05월 31일       작성일: 2026년 05월 10일
  (단위: 원)
==============================+===================================
        자          산         |      부  채  및  자  본
==============================+===================================
I. 유동자산                    | I. 유동부채
  현금및현금성자산  5,000,000  |   외상매입금     2,000,000
  외상매출금       3,000,000  |   단기차입금     1,000,000
  재고자산         2,000,000  |   유동부채 합계  3,000,000
  유동자산 소계   10,000,000  |
                              | II. 비유동부채
II. 비유동자산                 |   장기차입금     2,000,000
  유형자산         5,000,000  |   비유동부채 합계 2,000,000
  무형자산           500,000  |
  비유동자산 소계   5,500,000  |   부채 합계      5,000,000
                              |
                              | III. 자본
                              |   자본금          8,000,000
                              |   이익잉여금      2,500,000
                              |   자본 합계      10,500,000
==============================+===================================
자산 합계         15,500,000  | 부채+자본 합계   15,500,000
                              |         균형 (B/S Balanced)
==================================================================
  본 보고서는 한국 일반기업회계기준(K-GAAP)에 따라 작성됨  1 / 1
```

---

## 6. CSS @media print 지침 (핵심)

```css
@media print {
  .app-sidebar, .app-header, .no-print { display: none !important; }
  .app-shell { grid-template-columns: 1fr; }

  /* 합계 행 배경 인쇄 강제 */
  .report-total-row {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    background-color: var(--color-neutral-100) !important;
  }

  /* 당기순이익 / 자산합계 최종행 */
  .report-grand-total-row {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    background-color: var(--color-neutral-900) !important;
    color: var(--color-neutral-0) !important;
  }

  /* 재무상태표 2단 */
  .bs-two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4mm;
  }
}

@page { size: A4 portrait; margin: 12mm; }
```

---

## 7. IncomeStatementPrintLayout Props spec

```typescript
interface IncomeStatementData {
  period: string;        // "YYYYMM" 또는 "YYYYMM~YYYYMM"
  fromDate: string;      // "YYYY-MM-DD"
  toDate: string;        // "YYYY-MM-DD"
  revenue: ReportLine[]
  costOfSales: ReportLine[]
  grossProfit: string
  sga: ReportLine[]
  operatingProfit: string
  nonOperating: ReportLine[]
  incomeBeforeTax: string
  incomeTax: string
  netIncome: string
  generatedAt: string;   // ISO 8601
}

interface ReportLine {
  accountCode: string;   // "4019"
  accountName: string;   // "상품매출"
  category: string;
  amount: string;        // KRW 정수 string
  sortOrder: number;
}
```

## 8. BalanceSheetPrintLayout Props spec

```typescript
interface BalanceSheetData {
  asOfDate: string;          // "YYYY-MM-DD"
  assets: ReportLine[]
  totalAssets: string
  liabilities: ReportLine[]
  totalLiabilities: string
  equity: ReportLine[]
  totalEquity: string
  totalLiabilitiesAndEquity: string
  balanced: boolean
  generatedAt: string;       // ISO 8601
}
```

두 컴포넌트 공통 구현 주의사항:
- `../../print/PrintLayout` 에서 `PrintLayout`, `COMPANY`, `krw`, `krDate` import (기존 헬퍼 재사용)
- 라우트 `/accounting/reports/income-statement/print` / `/accounting/reports/balance-sheet/print` 등록 필요
- `RoleGuard` ACCOUNTANT / MASTER 접근 제한
- UUID 화면 노출 금지 — `accountCode`, `accountName`, `period` 만 표시

---

## 9. Iteration 계획

| 회차 | 내용 |
| --- | --- |
| 1차 | 본 spec 작성 (현재) |
| 2차 | FE mock 구현 후 Edge 캡처 → 사용자 검토 |
| 3차 | 헤더/합계 행 간격/폰트 CSS 미세 조정 |
| 4차 | 실 데이터 연결 후 긴 계정명/다페이지 처리 |
| 5차 | 사용자 최종 승인 + QA 캡처 첨부 |

---

## 10. 참조 파일

- 기존 인쇄 wrapper: `clients/desktop/src/renderer/print/PrintLayout.tsx`
- design-system 토큰: `clients/web/design-system/src/tokens/tokens.css`
- API client: `clients/desktop/src/renderer/api/accounting.ts`
- 기존 회계 인쇄 패턴: `clients/desktop/src/renderer/routes/TrialBalancePage.tsx`
