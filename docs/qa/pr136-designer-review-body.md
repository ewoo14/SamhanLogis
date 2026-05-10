## Designer Review — PR #136 (P0-1 Slice B)

검토자: Designer agent | 검토일: 2026-05-10

---

### 전제

본인 산출물(`REPORTS-B-DESIGN.md`) 대비 FE 구현 3개 파일을 코드 레벨에서 교차 검증하였습니다.
- `VatReportPrintLayout.tsx`
- `CorporateTaxReportPrintLayout.tsx`
- `PartnerAgingPrintLayout.tsx`

---

### 적합 항목 (통과)

| 항목 | 결과 |
| --- | --- |
| raw hex 0건 — 모든 색상 CSS 토큰 인용 (PR #134 회고) | PASS |
| `font-family: var(--font-family-sans)` (Pretendard) 최상위 div 선언 | PASS |
| `@page { size: A4 portrait; margin: 12mm; }` 3개 파일 전체 선언 | PASS |
| `font-variant-numeric: tabular-nums` 테이블 전체 적용 | PASS |
| 음수 금액 괄호 표기 + `var(--color-danger)` | PASS |
| `.report-total-row` / `.report-grand-total-row` Slice A 재사용 | PASS |
| `@media print { print-color-adjust: exact }` Slice A 재사용 클래스에 적용 | PASS |
| UUID 노출 0건 — `partnerCode` / `period` / `fiscalYear` 비즈니스 식별자만 노출 | PASS |
| `RoleGuard` ACCOUNTANT / MANAGER / MASTER 접근 제한 | PASS |
| `PrintLayout paper="a4-portrait"` 재사용 | PASS |
| `COMPANY` / `krw` 공통 헬퍼 import | PASS |

---

### 결함 목록 (수정 필수)

#### D1 — [Critical] `.deadline-banner` 미구현 (VatReportPrintLayout / CorporateTaxReportPrintLayout)

**spec** (REPORTS-B-DESIGN.md §4, §5, §7):
```css
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
@media print {
  .deadline-banner { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
```

**현 구현** (VatReportPrintLayout.tsx L314-316):
```tsx
<div style={{ marginTop: 12, fontSize: 'var(--print-text-sm)', color: 'var(--color-neutral-700)' }}>
  신고 기한: <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{data.dueDate}</strong>
</div>
```

- `.deadline-banner` 클래스 없음 — `var(--state-warning-bg)` 배경·`var(--color-warning)` 테두리 미반영
- 위치도 표 하단(푸터 직전)으로, spec 은 헤더 직후·표 전에 배치 요구
- CorporateTaxReportPrintLayout 동일 패턴

**수정**: PRINT_CSS 블록에 `.deadline-banner` 및 `@media print` 블록 추가, 헤더 `<div>` 직후에 `<div className="deadline-banner">신고 기한: {data.dueDate}</div>` 삽입.

---

#### D2 — [Critical] `.tax-rate-box` 미구현 (CorporateTaxReportPrintLayout)

**spec** (REPORTS-B-DESIGN.md §5, §7):
```css
.tax-rate-box {
  background-color: var(--color-neutral-50);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-sm);
  padding: 6pt 8pt;
  margin: 4pt 0 8pt 0;
}
@media print {
  .tax-rate-box { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
```

**현 구현** (CorporateTaxReportPrintLayout.tsx L264-274):
```tsx
<tr className="ct-section-header">
  <td colSpan={2}>세율 적용 (단계별 — 법인세법 제55조)</td>
</tr>
{taxBrackets.map((b) => (
  <CtPrintRow key={b.label} label={b.label} value={String(b.taxAmount)} indent />
))}
```

- 세율 단계 표가 일반 행으로만 표현됨. spec 의 박스형(`--color-neutral-50` 배경 + `--color-neutral-200` 테두리) UI 미반영
- `@media print` 강제 색상 블록 없음

**수정**: PRINT_CSS 에 `.tax-rate-box` 및 `@media print` 블록 추가. 세율 섹션 행을 `<tr>` 외부에서 `<div className="tax-rate-box">` 로 감싸거나, `<td>` 내부에 박스 div 삽입.

---

#### D3 — [Critical] `.aging-overdue-warning` / `.aging-overdue-danger` 행 배경 미구현 (PartnerAgingPrintLayout)

**spec** (REPORTS-B-DESIGN.md §2-2):
```css
.aging-overdue-warning { background-color: var(--state-warning-bg); color: var(--state-warning); }
.aging-overdue-danger  { background-color: var(--state-danger-bg);  color: var(--state-danger);  }
```

**현 구현** (PartnerAgingPrintLayout.tsx L89-96):
```css
.aging-badge-danger  { color: var(--color-danger);  font-weight: 700; }
.aging-badge-warning { color: var(--color-warning); font-weight: 700; }
```

그리고 행 렌더링 (L231-238):
```tsx
<span className={
  line.agingDays > 60 ? 'aging-badge-danger'
  : line.agingDays > 30 ? 'aging-badge-warning'
  : undefined
}>
```

세 가지 불일치:
1. 클래스명이 `.aging-overdue-*` 가 아닌 `.aging-badge-*` (글로벌 CSS 추가 불가 — 클래스명이 달라 공통 stylesheet 적용 시 누락)
2. 배경색 없음 — `<tr>` 레벨이 아닌 `<span>` 레벨만 처리하여 행 전체 하이라이트 미반영
3. `@media print { .aging-overdue-warning, .aging-overdue-danger { ... } }` 블록 없어 인쇄 시 색상 소실

**수정**:
- PRINT_CSS 내 `.aging-overdue-warning` / `.aging-overdue-danger` 및 `@media print` 블록으로 교체
- `<tr className={agingClass(line.agingDays)}>` 방식으로 행 전체에 배경 적용
- 연체일수 경계: spec `>= 60` / `>= 30`, 현 구현 `> 60` / `> 30` — **경계값 1일 오차** 별도 수정 (60일 당일 danger 미적용)

---

#### D4 — [Minor] VatReportPrintLayout 열 구조 spec 불일치

**spec** (REPORTS-B-DESIGN.md §4): 과목(50%) / 공급가액(30%) / 세액(20%) — **3열** 구성, 국세청 서식 기반.

**현 구현** (VatReportPrintLayout.tsx L207-210):
```tsx
<col style={{ width: '60%' }} />
<col style={{ width: '40%' }} />
```

2열(항목/금액) 구성. 매출세액·매입세액이 동일 금액 컬럼에 혼합되어 공급가액과 세액 구분 불가.

**수정**: `<colgroup>` 을 3열(과목 50% / 공급가액 30% / 세액 20%)로 변경. `VatReportResponse` 에 `salesSupplyAmount` / `salesVatAmount` 분리 필드가 이미 존재하므로 데이터 변경 없이 열 추가만 필요.

---

### 종합 판정

**추가 수정 필요** — Critical 3건(D1/D2/D3) 미해결 상태로 머지 불가.

D1~D3 은 spec 에 명시된 CSS 클래스(`deadline-banner` / `tax-rate-box` / `aging-overdue-*`)가 FE 구현에 전혀 존재하지 않아, 인쇄 시 신고 기한 강조·세율 박스·연체 행 하이라이트가 모두 누락됩니다. 이는 검증 체크리스트 §12 의 명시적 항목 위반입니다.

D4(Minor) 는 국세청 서식 시각 정합성 요구사항이므로 D1~D3 수정 커밋에 함께 반영 권장.

**수정 후 재검토 요청**: FE agent 가 4개 항목 수정 커밋 후 → Designer 재검토 → 2차 iteration 완료.
