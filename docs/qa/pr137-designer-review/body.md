## Designer Reviewer — PR #137 (P0-1 Slice C) 검토 결과

검토자: Designer Agent
검토일: 2026-05-11
검토 대상 파일:
- `clients/desktop/src/renderer/routes/CashFlowStatementPage.tsx`
- `clients/desktop/src/renderer/routes/EquityChangesPage.tsx`
- `clients/desktop/src/renderer/routes/DailySummaryPage.tsx`
- `clients/desktop/src/renderer/routes/MonthlySummaryPage.tsx`
- `clients/desktop/src/renderer/routes/accounting/print/CashFlowStatementPrintLayout.tsx`
- `clients/desktop/src/renderer/routes/accounting/print/EquityChangesPrintLayout.tsx`
- `clients/desktop/src/renderer/routes/accounting/print/DailySummaryPrintLayout.tsx`
- `clients/desktop/src/renderer/routes/accounting/print/MonthlySummaryPrintLayout.tsx`
- `clients/desktop/src/renderer/routes/accounting/REPORTS-C-DESIGN.md`
- `clients/desktop/src/renderer/routes/index.tsx` (라우트 등록)

---

### 통과 항목 (9/10)

| 항목 | 결과 | 비고 |
|---|---|---|
| raw hex 0건 | PASS | 8개 신규 파일 전체 `#[0-9a-fA-F]` 패턴 검색 — 매칭 없음 |
| Pretendard (font-family-sans 토큰) | PASS | 4개 PrintLayout 헤더 모두 `var(--font-family-sans)` |
| `font-variant-numeric: tabular-nums` | PASS | PRINT_CSS 내 table 수준 선언, 화면 컴포넌트 금액 span 수준 선언 확인 |
| `.report-total-row` / `.report-grand-total-row` 재사용 | PASS | 신규 CSS 클래스 0건. cf-table/eq-table/ds-table/ms-table 은 **print-scope 전용** 신규 클래스이나, 기존 `.report-total-row`/`.report-grand-total-row` 의 색상 규칙을 각 PRINT_CSS 의 `@media print` 블록에서 동일하게 재선언하여 Slice A/B 패턴을 계승 |
| `@page A4 portrait 12mm` | PASS | 4개 PrintLayout PRINT_CSS 모두 `@page { size: A4 portrait; margin: 12mm; }` 확인 |
| `cashReconciled=false` 경고 인라인 style | PASS | `CashFlowStatementPage` L286-301, `CashFlowStatementPrintLayout` L176-179 — `background: var(--state-danger-bg)`, `color: var(--state-danger)` 인라인 style 사용. 신규 클래스 없음 |
| `balanced=false` 경고 인라인 style | PASS | `DailySummaryPage` L341-355, `MonthlySummaryPage` L487-502, 양 PrintLayout 동일 패턴 |
| UUID 화면 노출 0건 | PASS | 화면/인쇄 모두 `accountCode` (비즈니스 코드), `period`, `date` 만 노출. UUID 없음 |
| RoleGuard `ACCOUNTING_ROLES` = `['ACCOUNTANT','MANAGER','MASTER']` | PASS | `index.tsx` L222-222, 8개 라우트 전체 `ACCOUNTING_ROLES` 적용 확인 |
| BE record 필드명 1:1 | PASS | `CashFlowStatementResponse`, `EquityChangesResponse`, `DailySummaryResponse`, `MonthlySummaryResponse` Props spec 대비 누락/오탈자 없음 |

---

### 결함 1건 — 수정 필요 (MINOR)

#### D1: `netCashFlow` 양수 시 `var(--color-success)` 미적용

**위치:**
- `CashFlowStatementPage.tsx` L342-348 (`<CashFlowRow label="IV. 현금 순증감" ...>`)
- `CashFlowStatementPrintLayout.tsx` L248-251 (IV. 현금 순증감 td)

**현상:**
REPORTS-C-DESIGN.md §2 에 명시된 색상 spec:
```
현금 순증감 양수 → var(--color-success)
현금 순증감 음수 → var(--color-danger)
```

현재 구현에서 `CashFlowRow` 컴포넌트는 `isNeg` 여부로 `var(--color-danger)` 만 적용하고, 양수일 때는 `var(--color-neutral-900)` (기본값) 을 사용합니다. `netCashFlow` 는 현금흐름표의 핵심 결과값이므로 양수(=현금 순증가) 시 `var(--color-success)` 를 표시해야 K-GAAP 관행(녹색=호조) 과 design spec 이 일치합니다.

**수정 방향 (화면):**

```tsx
// CashFlowStatementPage.tsx — CashFlowRow 에 isNetChange prop 추가
interface CashFlowRowProps {
  label: string
  amount: string
  indent?: boolean
  isSummary?: boolean
  isGrandTotal?: boolean
  isNetChange?: boolean   // 추가
}

function CashFlowRow({ ..., isNetChange = false }: CashFlowRowProps) {
  const n = Number.parseInt(amount, 10)
  const isNeg = Number.isFinite(n) && n < 0
  const amountColor = isNetChange
    ? (isNeg ? 'var(--color-danger)' : 'var(--color-success)')
    : (isNeg ? 'var(--color-danger)' : 'var(--color-neutral-900)')
  ...
}

// 사용 측:
<CashFlowRow
  label="IV. 현금 순증감 (CFO + CFI + CFF)"
  amount={data.netCashFlow}
  isSummary
  isNetChange   // 추가
/>
```

**수정 방향 (인쇄):**

```tsx
// CashFlowStatementPrintLayout.tsx L248-251
<tr className="report-total-row">
  <td style={{ padding: '3pt 4pt', fontWeight: 700 }}>IV. 현금 순증감 (CFO + CFI + CFF)</td>
  <td className="amount" style={{
    fontWeight: 700,
    color: Number.parseInt(data.netCashFlow, 10) >= 0
      ? 'var(--color-success)'
      : 'var(--color-danger)',
  }}>
    {fmtAmount(data.netCashFlow)}
  </td>
</tr>
```

---

### 관찰 사항 (수정 불필요 — 설계 의도 인정)

#### O1: 자본변동표 "감소 열 조건부 렌더링" 미구현

REPORTS-C-DESIGN.md §5 에서 "감소 열은 데이터 있을 때만" 이라고 언급하나, 구현에서는 감소(감자) 행을 항상 렌더링합니다. `capitalStockDecrease = 0` 이면 `fmtAmount` 가 "—" 를 반환하므로 시각적으로 혼란은 없습니다. K-GAAP 양식상 열 구조 고정이 일반적이므로 이 구현이 오히려 안정적입니다. 스펙 문구를 "—" 표기로 대체한 것으로 수용합니다.

#### O2: 월계표 `print` 라우트 — `showDailyBreakdown` prop 불필요

REPORTS-C-DESIGN.md §7 에서 `showDailyBreakdown: boolean` prop 을 언급하나, 인쇄 레이아웃(`MonthlySummaryPrintLayout.tsx`) 에서는 계정별 합계 + 일별 breakdown 을 두 페이지로 **항상** 출력하는 방식으로 구현했습니다 (`ms-page-break` 클래스로 강제 페이지 구분). prop 없이도 완전한 인쇄가 이루어지며, Slice A/B 와 일관된 패턴입니다.

#### O3: `print-color-adjust: exact` — `@media print` 선언 중복

4개 PrintLayout PRINT_CSS 모두 `@media print` 내에서 `.report-total-row` / `.report-grand-total-row` 색상을 선언합니다. Slice A/B 의 전역 CSS 와 동일한 규칙이 다시 선언되어 있어 이론상 중복이나, print-scope 내 우선순위 보장을 위한 의도적 방어 코드로 판단합니다. 제거 불필요.

---

### 종합 판정

**조건부 승인 (Approved with Minor Fix Required)**

D1 (`netCashFlow` 양수 색상) 1건은 K-GAAP 시각 관행 + REPORTS-C-DESIGN.md spec 미충족으로 **수정 필요**합니다. 단, 기능적 오류(금액 계산 오차, UUID 노출, 권한 오류) 가 아닌 컬러 토큰 미적용이므로 FE agent 가 해당 행만 수정한 후 머지 진행 가능합니다.

나머지 9개 항목 전체 PASS — raw hex 0건, tabular-nums, 합계 행 굵게, cashReconciled/balanced 인라인 style, 신규 CSS 클래스 0건, RoleGuard 3-role 일치, UUID 비노출 모두 확인되었습니다.

> **Designer**: `netCashFlow` 양수 = `var(--color-success)` 적용 후 재검토 없이 머지 진행 동의합니다.
