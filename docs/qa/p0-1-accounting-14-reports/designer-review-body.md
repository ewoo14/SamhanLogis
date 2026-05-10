## Designer Review (PR #134)

> 검토 범위: `REPORTS-DESIGN.md` (Designer 자체 spec) vs FE 구현 `IncomeStatementPage.tsx` / `BalanceSheetPage.tsx`

---

### 디자인 가이드 준수 현황

| 항목 | 판정 | 비고 |
|------|------|------|
| tabular-nums 금액 컬럼 | 통과 | 양 파일 `fontVariantNumeric: 'tabular-nums'` 적용 |
| 음수 괄호 표기 `(1,234,567)` | 통과 | `fmtKrw` 유틸 정상 구현 |
| 합계 행 fontWeight 700 굵게 | 통과 | `isSummary` prop 분기 |
| UUID 화면 노출 금지 | 통과 | accountCode/accountName/period 만 표시 |
| Pretendard 폰트 | 통과 | design-system `Button`, `Card`, `Spinner` import (폰트 상속) |
| 빈 카테고리 섹션 숨김 | 통과 | `StatementSection` 조건부 렌더 |
| balanced=false 배너 노출 | 통과 | `BalanceSheetPage` role="alert" div 존재 |
| 재무상태표 2단 레이아웃 | 통과 | flex 기반 좌/우 컬럼 |

---

### 결함 (7건)

#### [결함-1] raw hex 직접 사용 — spec §2 "raw hex 사용 금지" 위반 (심각)

`IncomeStatementPage.tsx` 및 `BalanceSheetPage.tsx` 전반에서 CSS 토큰 대신 raw hex 하드코딩:

- `#111827` → `var(--color-neutral-900)`
- `#374151` → `var(--color-neutral-700)`
- `#D1D5DB` → `var(--color-neutral-200)`
- `#6B7280` → `var(--color-neutral-500)`
- `#9CA3AF` → `var(--color-neutral-400)` (근사치 — 실제 토큰 확인 필요)
- `#DC2626` → `var(--color-danger)`
- `#1F2937` → `var(--color-neutral-800)` 근사

토큰 정의 기준: `clients/web/design-system/src/tokens/tokens.css`

---

#### [결함-2] balanced=false 배너 토큰 불일치 (심각)

spec §2:
- 배너 배경: `var(--state-danger-bg)` (#FEE2E2)
- 배너 텍스트: `var(--state-danger)` (#EF4444)

실제 구현 (`BalanceSheetPage.tsx` 229~239행):
```
background: '#FEF2F2'   ← var(--state-danger-bg) 아님 (다른 red 계열)
color: '#991B1B'        ← var(--state-danger) 아님
```
균형 여부 텍스트 (398행)도 `'#059669'` / `'#DC2626'` raw hex — `var(--color-success)` / `var(--color-danger)` 로 교체 필요.

---

#### [결함-3] 당기순이익 최종행 grand-total 스타일 미적용 (중요)

spec §2 / §6:
- 당기순이익 배경: `var(--color-neutral-900)`
- 당기순이익 텍스트: `var(--color-neutral-0)`
- CSS class `.report-grand-total-row` + `print-color-adjust: exact` 필수

실제 구현 (`IncomeStatementPage.tsx` 339~358행): `borderTop: '2px solid #111827'` 만 적용, 배경색 없음. 인쇄 시 dark row 누락.

---

#### [결함-4] `.report-total-row` / `.report-grand-total-row` CSS class 미부여 (중요)

spec §6 `@media print` 지침: 합계 행 배경 인쇄 강제를 위해 두 class 에 `print-color-adjust: exact` 필수. 양 파일 모두 해당 class 없이 inline style 만 사용 → 브라우저 인쇄 시 배경색 소실 위험.

---

#### [결함-5] 인쇄 전용 컴포넌트 미구현 (중요)

spec §7 / §8 / §10:
- `IncomeStatementPrintLayout.tsx` / `BalanceSheetPrintLayout.tsx` 별도 컴포넌트 + 라우트 `/accounting/reports/income-statement/print` 등록 필요
- 기존 `PrintLayout` wrapper (`clients/desktop/src/renderer/print/PrintLayout.tsx`) 재사용 명시

현재 양 파일 모두 인라인 `@media print` style 로 대체 — PrintLayout 미사용, 분리 컴포넌트 부재.
iteration 계획 §9 상 2차(FE mock → Edge 캡처) 단계이므로 구현 필요.

---

#### [결함-6] 인쇄 영역 font-size 토큰 미적용 (보통)

spec §3 인쇄 token 컬럼: `var(--print-text-sm)` (11pt) / `var(--print-text-md)` (12pt) / `var(--print-text-lg)` (18pt) 사용 명시.

현재 인쇄 헤더 영역 (`income-statement-print-header` / `balance-sheet-print-header`) 에서 `fontSize: 22` / `fontSize: 16` / `fontSize: 13` px 직접 사용 — pt 토큰 미적용.

토큰 실제 존재 확인: `tokens.css` 277~281행 정의됨.

---

#### [결함-7] 에러 상태 배너도 raw hex (경미)

조회 실패 에러 div (양 파일 공통):
```
background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B'
```
`var(--state-danger-bg)` / `var(--color-danger)` 토큰으로 통일 필요.

---

### 결론

추가 수정 필요.

7건 결함 중 결함-1(raw hex 전면) / 결함-2(배너 토큰 불일치) / 결함-3(grand-total 배경) / 결함-5(인쇄 전용 컴포넌트 분리) 4건은 spec 직접 위반이므로 머지 전 수정 필수. 결함-4(print class) / 결함-6(인쇄 pt 토큰) / 결함-7(에러 hex)은 인쇄 품질 및 토큰 일관성 영향으로 동일 PR 내 함께 수정 권고.

iteration §9 기준 현재 2차 단계 — Edge 캡처 첨부 및 위 결함 수정 후 3차 검토 진행.
