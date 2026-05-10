# P0-1 Slice C — 현금흐름표 / 자본변동표 / 일계표 / 월계표 인쇄 양식 + 화면 디자인 가이드

> Designer 산출물 (P0-1 Slice C). Frontend agent 가 본 spec 을 토대로
> CashFlowPrintLayout.tsx / EquityChangesPrintLayout.tsx /
> DailySummaryPrintLayout.tsx / MonthlySummaryPrintLayout.tsx 구현.
> Slice A/B 패턴 100% 계승. 신규 CSS 클래스 0건 — 기존 `.report-total-row` / `.report-grand-total-row` 재사용.

---

## 1. 범위 및 전제

| 항목 | 내용 |
| --- | --- |
| 보고서 종류 | 현금흐름표 / 자본변동표 / 일계표 / 월계표 |
| 기준 | 한국 일반기업회계기준 (K-GAAP) — 직접법 현금흐름표 |
| 용지 | A4 portrait |
| 여백 | 12mm |
| 인쇄 발행 | `window.print()` — 기존 `PrintLayout` wrapper 재사용 |
| 권한 | ACCOUNTANT / MANAGER / MASTER |
| 회사 정보 | (주)삼한공조시스템 / 사업자등록번호 214-87-20659 |

---

## 2. 컬러 토큰 (Slice A/B 재사용)

### Slice C 전용 — 현금흐름 부호 색상

| 용도 | CSS 토큰 | 기준 |
| --- | --- | --- |
| 현금 유입 (양수 금액) | `var(--color-neutral-800)` | amount > 0 |
| 현금 유출 (음수 금액) | `var(--color-danger)` | amount < 0 — 괄호 표기 |
| 현금 순증감 양수 | `var(--color-success)` | netCashChange > 0 |
| 현금 순증감 음수 | `var(--color-danger)` | netCashChange < 0 |
| cashReconciled=true chip | `var(--color-success)` | 검증 통과 |
| cashReconciled=false 배너 | `var(--state-danger-bg)` / `var(--state-danger)` | 인라인 style |

신규 클래스 0건 — Slice A/B 클래스 100% 재사용.

---

## 3. 타이포그래피 스케일 (Slice A §3 인용)

생략 — Slice A REPORTS-DESIGN.md §3 그대로.

---

## 4. 현금흐름표 인쇄 양식 spec

### 4-1. 섹션 구성 (K-GAAP 직접법)

| 섹션 | BE 필드 | 표시 |
| --- | --- | --- |
| I. 영업활동 (CFO) | `operatingAdjustments[]` + `cashFromOperating` | 유입(+)/유출(-) 개별 + 소계 |
| II. 투자활동 (CFI) | `investingActivities[]` + `cashFromInvesting` | 동상 |
| III. 재무활동 (CFF) | `financingActivities[]` + `cashFromFinancing` | 동상 |
| IV. 현금 순증감 | `netCashFlow` | I + II + III |
| V. 기초 현금 | `beginningCash` | — |
| VI. 기말 현금 | `endingCash` | beginningCash + netCashFlow |
| 검증 chip | `cashReconciled` | true → green / false → red 배너 |

각 섹션 소계: `.report-total-row` 재사용. 최종 (현금 순증감 / 기말 현금): `.report-grand-total-row`.

### 4-2. ASCII Mockup

```
==============================================================
            (주)삼한공조시스템
              현 금 흐 름 표 (직접법)
  기간: 2026-01-01 ~ 2026-05-31    작성일: 2026-05-10
==============================================================
I. 영업활동 현금흐름 (CFO)
  당기순이익                             8,000,000
  매출채권 감소                          2,000,000
  매입채무 증가                          1,500,000
  영업활동 합계                         11,500,000   ← .report-total-row
==============================================================
II. 투자활동 현금흐름 (CFI)
  유형자산 매입                         (3,000,000)
  투자활동 합계                         (3,000,000)
==============================================================
III. 재무활동 현금흐름 (CFF)
  단기차입금 차입                          500,000
  배당금 지급                           (1,000,000)
  재무활동 합계                           (500,000)
==============================================================
IV. 현금 순증감                          8,000,000   ← 양수→success
==============================================================
V. 기초 현금                             2,000,000
VI. 기말 현금                           10,000,000   ← .report-grand-total-row
==============================================================
[검증 일치 — 기말현금 = 재무상태표 현금 10,000,000]
```

cashReconciled=false 시: 배너 inline `style={{backgroundColor:'var(--state-danger-bg)', color:'var(--state-danger)'}}`.

---

## 5. 자본변동표 인쇄 양식 spec

### 5-1. 섹션 구성 (K-GAAP §2-3)

| 항목 | BE 필드 |
| --- | --- |
| 자본금 (310) | `beginningCapitalStock` / `capitalStockIncrease` / `capitalStockDecrease` / `endingCapitalStock` |
| 이익잉여금 (343) | `beginningRetainedEarnings` / `netIncome` / `dividends` / `endingRetainedEarnings` |
| 자본 총계 | `beginningTotalEquity` / `totalChange` / `endingTotalEquity` |

열: 항목(30%) / 기초잔액(23%) / 증가(23%) / 기말잔액(24%). 감소 열은 데이터 있을 때만.

### 5-2. ASCII Mockup

```
==================================================================
              (주)삼한공조시스템
                 자 본 변 동 표
  기간: 2026-01-01 ~ 2026-05-31    작성일: 2026-05-10
==================================================================
 항          목       기초잔액      증가         기말잔액
==================================================================
 자본금               8,000,000        —      8,000,000
------------------------------------------------------------------
 이익잉여금
   이월이익잉여금     2,000,000        —      2,000,000
   당기순이익                —  9,250,000     9,250,000
   배당                      —  (500,000)     (500,000)
   이익잉여금 소계   2,000,000  8,750,000    10,750,000   ← .report-total-row
==================================================================
 자본 총계         10,000,000  8,750,000    18,750,000   ← .report-grand-total-row
==================================================================
```

---

## 6. 일계표 인쇄 양식 spec

### 6-1. 구성

특정 일자 단일 날짜의 모든 분개 + 계정별 차/대변/잔액 요약.

| 섹션 | 내용 |
| --- | --- |
| 헤더 | 회사 / 기준일 / 작성일 |
| 요약 배너 | 분개 건수 / 총 차변 / 총 대변 / balanced |
| 계정별 표 | 계정코드 / 계정명 / 차변 / 대변 / 잔액 |
| 합계 행 | `.report-grand-total-row` |

balanced=false: 인라인 style 배너 (신규 클래스 X).

열: 계정코드(12%) / 계정명(38%) / 차변(18%) / 대변(18%) / 잔액(14%).

잔액 부호:
- 자산(100·) / 비용(500·800·900·): 차변 잔액 양수 정상
- 부채(200·) / 자본(300·) / 수익(400·): 대변 잔액 양수 정상
- 반대 부호 → 괄호 표기 + `var(--color-danger)`

### 6-2. ASCII Mockup

```
==============================================================
            (주)삼한공조시스템
                 일      계      표
  기준일: 2026-05-09    작성일: 2026-05-10
==============================================================
  분개 건수: 12건  |  총 차변: 18,500,000  |  총 대변: 18,500,000
  [균형 (Balanced)]
==============================================================
 계정코드  계  정  명         차  변       대  변      잔  액
--------------------------------------------------------------
  102    보통예금          5,000,000   3,000,000   2,000,000
  110    외상매출금        3,500,000          —   3,500,000
  201    외상매입금               —   4,000,000  (4,000,000)
  401    상품매출                 —   8,000,000  (8,000,000)
  501    상품매출원가      5,000,000          —   5,000,000
  ...
  합  계               18,500,000  18,500,000        ← .report-grand-total-row
==============================================================
```

---

## 7. 월계표 인쇄 양식 spec

일계표 구조 + `showDailyBreakdown: boolean` prop. 기본 false (화면 간소형), 인쇄 시 true 권장.

추가 섹션:
- 일별 breakdown 표 (일자 / 분개건수 / 차변 / 대변 / 잔액)
- 일별 소계: `.report-total-row`

### ASCII Mockup

```
==============================================================
            (주)삼한공조시스템
                월      계      표
  기준월: 2026-05    작성일: 2026-05-10
==============================================================
  분개 87건 | 총 차변: 120M | 총 대변: 120M | [균형]
==============================================================
[일별 Breakdown — showDailyBreakdown=true]
 일자      분개건수    차변         대변         잔액
--------------------------------------------------------------
 05-01       6      12,000,000   12,000,000        0
 05-02       8      15,000,000   15,000,000        0
 ...
 월 합계     87    120,000,000  120,000,000        0  ← .report-total-row
==============================================================
[계정별 월간 요약]
 (일계표와 동일 구조)
 합  계              120,000,000 120,000,000        ← .report-grand-total-row
==============================================================
```

---

## 8. CSS @media print 지침

신규 CSS 클래스 0건. Slice A/B 기정의 클래스 완전 재사용.

```css
@page { size: A4 portrait; margin: 12mm; }

/* Slice A 기정의 — 재선언 X */
/* .report-total-row, .report-grand-total-row */

/* cashReconciled=false / balanced=false 경고: 인라인 style */
/* style={{ backgroundColor: 'var(--state-danger-bg)', color: 'var(--state-danger)' }} */
```

---

## 9. Props spec

### CashFlowStatementData

```typescript
interface CashFlowStatementResponse {
  period: string
  fromDate: string
  toDate: string
  netIncome: string
  operatingAdjustments: CashFlowLine[]
  cashFromOperating: string
  investingActivities: CashFlowLine[]
  cashFromInvesting: string
  financingActivities: CashFlowLine[]
  cashFromFinancing: string
  netCashFlow: string
  beginningCash: string
  endingCash: string
  cashReconciled: boolean
  generatedAt: string
}

interface CashFlowLine {
  accountCode: string
  accountName: string
  activityType: 'OPERATING' | 'INVESTING' | 'FINANCING'
  amount: string
  flowDirection: 'INFLOW' | 'OUTFLOW'
}
```

### EquityChangesData

```typescript
interface EquityChangesResponse {
  fromDate: string
  toDate: string
  beginningCapitalStock: string
  capitalStockIncrease: string
  capitalStockDecrease: string
  endingCapitalStock: string
  beginningRetainedEarnings: string
  netIncome: string
  dividends: string
  endingRetainedEarnings: string
  beginningTotalEquity: string
  endingTotalEquity: string
  totalChange: string
  generatedAt: string
}
```

### DailySummaryData

```typescript
interface DailySummaryResponse {
  date: string
  journalCount: number
  totalDebit: string
  totalCredit: string
  balanced: boolean
  accountSummary: DailyAccountLine[]
  generatedAt: string
}

interface DailyAccountLine {
  accountCode: string
  accountName: string
  debit: string
  credit: string
  balance: string
  sortOrder: number
}
```

### MonthlySummaryData

```typescript
interface MonthlySummaryResponse {
  period: string
  fromDate: string
  toDate: string
  journalCount: number
  totalDebit: string
  totalCredit: string
  balanced: boolean
  accountSummary: DailyAccountLine[]
  dailyBreakdown: DailyTotalRow[]
  generatedAt: string
}

interface DailyTotalRow {
  date: string
  totalDebit: string
  totalCredit: string
  journalCount: number
}
```

---

## 10. 라우트 등록

```typescript
{ path: '/accounting/reports/cash-flow/print',
  element: <RoleGuard allow={['ACCOUNTANT','MANAGER','MASTER']}><CashFlowPrintLayout /></RoleGuard> },
{ path: '/accounting/reports/equity-changes/print',
  element: <RoleGuard allow={['ACCOUNTANT','MANAGER','MASTER']}><EquityChangesPrintLayout /></RoleGuard> },
{ path: '/accounting/reports/daily-summary/print',
  element: <RoleGuard allow={['ACCOUNTANT','MANAGER','MASTER']}><DailySummaryPrintLayout /></RoleGuard> },
{ path: '/accounting/reports/monthly-summary/print',
  element: <RoleGuard allow={['ACCOUNTANT','MANAGER','MASTER']}><MonthlySummaryPrintLayout /></RoleGuard> },
```

---

## 11. 검증 체크리스트

- raw hex 0건 (PR #134/#136 회고)
- Pretendard
- @page A4 portrait 12mm
- font-variant-numeric: tabular-nums
- 음수 괄호 표기 + var(--color-danger)
- cashReconciled=false / balanced=false 경고 (인라인 style)
- UUID 화면 노출 0건 (accountCode 만)
- RoleGuard ACCOUNTANT/MANAGER/MASTER (BE @PreAuthorize 일치)
- 신규 CSS 클래스 0건 (Slice A/B 클래스 재사용)
- BE record 필드명 1:1 정확 (PR #136 회고)
- showDailyBreakdown 기본값 false / 인쇄 시 true 권장 주석
