# P0-9 입고 검수 UI 디자인 가이드

> branch: `feature/p0-9-warehouse-inspection-ui`
> 작성일: 2026-05-11
> 담당: Designer (SamhanLogis 디자인 시스템 기준)

---

## 0. 원칙

- **raw hex 금지**: 모든 색상은 design-system CSS 변수 토큰만 사용.
- **UUID 비공개**: 화면 어디에도 UUID 노출 금지. 식별자는 `slipNo` / `modelCode` 등 비즈니스 키만 표시 (`feedback_uuid_no_user_visibility.md`).
- **Role 풀네임**: `MASTER` / `MANAGER` / `WAREHOUSE` 등 — 약어 금지.
- **Pretendard 9 weight 자동 상속**: `body { font-family: var(--font-family-sans) }` 선언으로 전체 화면 자동 적용.
- **한국어 타이포**: 본문 14px Regular / 헤더 18px SemiBold / 서브헤더 16px Medium.
- **이카운트 참조**: `docs/migration/ecount-reference/` 16 캡처 — 입고/검수 화면 필드 구성 준용.
- **인쇄 양식 반복 정정**: `feedback_print_design_iteration.md` 가드 준수 — 단번 완성 금지, 3~5회 iteration 의무.

---

## 1. 모달 개요

| 항목 | 내용 |
|---|---|
| 컴포넌트명 | `InboundInspectionDialog` |
| 모달 크기 | `size="xl"` — `min(980px, 92vw)` |
| 라우트 | 슬립 상세 페이지(`/purchases/:slipId`) 에서 [검수 입력] 버튼으로 진입 |
| 접근 권한 | `MASTER` / `MANAGER` / `WAREHOUSE` |
| data-testid 루트 | `inbound-inspection-dialog` |

### 1.1 전체 레이아웃 ASCII Mockup

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ [입고 검수]  전표번호: IN-2026-00123   입고일: 2026-05-11   창고: 서울 본창고     ✕ │
│ ─────────────────────────────────────────────────────────────────────────────── │
│ 공급처: (주)삼성에어컨   검수자: 홍길동 (WAREHOUSE)                               │
│ ─────────────────────────────────────────────────────────────────────────────── │
│                                                                                  │
│  품목코드        예정 수량   검수 수량       불량 수량                            │
│ ──────────────  ─────────  ──────────────  ──────────────────────────────────── │
│  AHU-220V-4HP      100     [  100  ▼]      [   0  ]                             │
│  AHU-380V-6HP       50     [   48  ▼]      [   2  ]  ← 불량 수량 > 0            │
│  ▶ 불량 사유: [_________________________] (불량 수량 > 0 시 행 확장)            │
│  FCU-220V-2HP       30     [   35  ▲]      [   0  ]  ← 초과 입고                │
│ ──────────────  ─────────  ──────────────  ──────────────────────────────────── │
│                                                                                  │
│ ─────────────────────────────────────────────────────────────────────────────── │
│                                              [검수 저장]   [검수 완료]            │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 헤더 영역

### 2.1 타이틀 행

```
┌──────────────────────────────────────────────────────────────────┐
│ [h2] 입고 검수                                                  ✕ │
│                                                                  │
│  전표번호: IN-2026-00123  |  입고일: 2026-05-11  |  창고: 서울 본창고  │
│  공급처: (주)삼성에어컨                검수자: 홍길동 (WAREHOUSE)   │
└──────────────────────────────────────────────────────────────────┘
```

| 요소 | 표시 데이터 | 비고 |
|---|---|---|
| 제목 | "입고 검수" | `font-size: var(--font-modal-title)` (18px) / `font-weight: var(--font-weight-semibold)` |
| 전표번호 | `slipNo` (예: `IN-2026-00123`) | UUID 미노출 — 비즈니스 식별자만 |
| 입고일 | `slipDate` YYYY-MM-DD 표시 | |
| 창고명 | `destinationWarehouseName` | 창고 코드 + 이름 표시 |
| 공급처명 | `partnerName` | UUID 미노출 |
| 검수자 | 로그인 사용자 `fullName` + `(ROLE)` | 세션에서 자동 주입 |
| ✕ 버튼 | 닫기 | `aria-label="검수 다이얼로그 닫기"` |

### 2.2 헤더 CSS spec

```css
.insp-header {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-5) var(--space-6);
  border-bottom: 1px solid var(--line-default);
  background: var(--surface-card);
}

.insp-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.insp-title {
  font-size: var(--font-modal-title);
  font-weight: var(--font-weight-semibold);
  color: var(--ink-primary);
  margin: 0;
}

.insp-meta-row {
  display: flex;
  gap: var(--space-5);
  font-size: var(--font-size-sm);
  color: var(--ink-secondary);
}

.insp-meta-row strong {
  color: var(--ink-primary);
  font-weight: var(--font-weight-medium);
}

.insp-inspector-row {
  display: flex;
  justify-content: space-between;
  font-size: var(--font-size-sm);
  color: var(--ink-secondary);
}
```

---

## 3. 본문 — 라인 테이블

### 3.1 컬럼 구성 (4 컬럼 기본 + 불량 사유 행 확장)

| 컬럼 인덱스 | 컬럼 헤더 | 데이터 필드 | 너비 | 정렬 | 비고 |
|---|---|---|---|---|---|
| 1 | 품목코드 | `modelCode` | `200px` | left | 읽기 전용 |
| 2 | 예정 수량 | `expectedQty` | `100px` | right | 읽기 전용 — `font-variant-numeric: tabular-nums` |
| 3 | 검수 수량 | `inspectedQty` | `140px` | center | 편집 가능 `<input type="number">` |
| 4 | 불량 수량 | `defectQty` | `140px` | center | 편집 가능 `<input type="number">` — `defectQty > 0` 시 불량 사유 행 확장 |

### 3.2 ASCII Mockup — 테이블 본문

```
┌──────────────┬───────────┬────────────────┬────────────────┐
│ 품목코드      │ 예정 수량  │ 검수 수량       │ 불량 수량       │
├──────────────┼───────────┼────────────────┼────────────────┤
│ AHU-220V-4HP │       100 │ [  100       ] │ [   0        ] │   ← 정상
├──────────────┼───────────┼────────────────┼────────────────┤
│ AHU-380V-6HP │        50 │ [   48       ] │ [   2        ] │   ← 불량 > 0
│ ▶ 불량 사유  │           │ [외관 파손_____________________] │   ← 확장 행
├──────────────┼───────────┼────────────────┼────────────────┤
│ FCU-220V-2HP │        30 │ [   35       ] │ [   0        ] │   ← 차이 (초과)
└──────────────┴───────────┴────────────────┴────────────────┘
```

### 3.3 테이블 CSS spec

```css
.insp-table-wrapper {
  padding: var(--space-5) var(--space-6);
  overflow-y: auto;
  max-height: calc(100vh - 280px);
}

.insp-table {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid var(--line-default);
  border-radius: var(--radius-card);
  overflow: hidden;
}

.insp-table thead th {
  background: var(--color-neutral-50);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--ink-secondary);
  padding: var(--space-2) var(--space-3);
  text-align: left;
  border-bottom: 1px solid var(--line-default);
  height: var(--row-h-thead);
  white-space: nowrap;
}

.insp-table thead th:nth-child(2),
.insp-table thead th:nth-child(3),
.insp-table thead th:nth-child(4) {
  text-align: right;
}

/* 기본 행 */
.insp-line-row {
  background: var(--surface-card);
  transition: background var(--duration-fast);
}

.insp-line-row td {
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--line-subtle, var(--line-default));
  vertical-align: middle;
  height: var(--row-h);
}

/* 불량 사유 확장 행 */
.insp-defect-reason-row td {
  padding: var(--space-2) var(--space-3) var(--space-3);
  border-bottom: 1px solid var(--line-default);
  background: var(--state-danger-bg);
}

.insp-defect-reason-label {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--state-danger);
  white-space: nowrap;
  padding-right: var(--space-3);
}
```

---

## 4. 검수 차이 시각화

### 4.1 행 상태 3가지 + 규칙

| 상태 | 조건 | 행 배경 (`background`) | 행 좌측 border | 비고 |
|---|---|---|---|---|
| 정상 | `inspectedQty === expectedQty && defectQty === 0` | `var(--surface-card)` | 없음 | 기본 |
| 수량 차이 (noticed) | `inspectedQty !== expectedQty` (defectQty 와 무관) | `var(--state-warning-bg)` | `3px solid var(--state-warning)` | 부족 / 초과 모두 해당 |
| 불량 있음 (danger) | `defectQty > 0` | `var(--state-danger-bg)` | `3px solid var(--state-danger)` | warning 보다 danger 우선 |

> 우선순위: `defectQty > 0` (danger) > `inspectedQty !== expectedQty` (noticed) > 정상.

### 4.2 CSS spec — 행 상태 클래스

```css
/* 수량 차이 (noticed) */
.insp-line-row.noticed {
  background: var(--state-warning-bg);
  border-left: 3px solid var(--state-warning);
}

/* 불량 있음 (danger) — noticed 보다 우선 */
.insp-line-row.danger {
  background: var(--state-danger-bg);
  border-left: 3px solid var(--state-danger);
}

/* 불량 사유 확장 행 — 항상 danger 배경 */
.insp-defect-reason-row {
  background: var(--state-danger-bg);
  border-left: 3px solid var(--state-danger);
}
```

### 4.3 시각화 badge — 수량 차이 표시

검수 수량 셀 우측에 차이 badge 표시:

```
inspectedQty > expectedQty → badge: "▲ +N" / variant=warning
inspectedQty < expectedQty → badge: "▼ -N" / variant=danger
inspectedQty = expectedQty → badge 없음
```

| badge variant | CSS | 사용 조건 |
|---|---|---|
| 초과 (warning) | `background: var(--state-warning-bg); color: var(--state-warning)` | 초과 입고 |
| 부족 (danger) | `background: var(--state-danger-bg); color: var(--state-danger)` | 부족 입고 |

```tsx
// 차이 badge — InspectionLineRow 내부
function DiffBadge({ expected, inspected }: { expected: number; inspected: number }) {
  const diff = inspected - expected
  if (diff === 0) return null
  const isOver = diff > 0
  return (
    <span
      aria-label={`예정 수량 대비 ${isOver ? '초과' : '부족'} ${Math.abs(diff)}`}
      style={{
        fontSize: 'var(--font-size-xs)',
        fontWeight: 'var(--font-weight-medium)',
        padding: '2px 6px',
        borderRadius: 'var(--radius-full)',
        background: isOver ? 'var(--state-warning-bg)' : 'var(--state-danger-bg)',
        color: isOver ? 'var(--state-warning)' : 'var(--state-danger)',
        marginLeft: 'var(--space-2)',
        whiteSpace: 'nowrap',
      }}
    >
      {isOver ? '▲' : '▼'} {isOver ? '+' : ''}{diff}
    </span>
  )
}
```

---

## 5. 라인별 입력 필드 spec

### 5.1 검수 수량 input (`inspectedQty`)

```tsx
<input
  type="number"
  min={0}
  step={1}
  value={line.inspectedQty}
  onChange={(e) => onInspectedQtyChange(line.lineId, Number(e.target.value))}
  data-testid={`inbound-inspection-line-${line.lineId}-inspected-qty`}
  aria-label={`${line.modelCode} 검수 수량`}
  style={{
    width: '100%',
    height: '32px',
    padding: '0 var(--space-3)',
    border: '1px solid var(--line-default)',
    borderRadius: 'var(--radius-input)',
    fontSize: 'var(--font-size-sm)',
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'right',
    background: 'var(--surface-card)',
    color: 'var(--ink-primary)',
  }}
/>
```

### 5.2 불량 수량 input (`defectQty`)

```tsx
<input
  type="number"
  min={0}
  step={1}
  value={line.defectQty}
  onChange={(e) => onDefectQtyChange(line.lineId, Number(e.target.value))}
  data-testid={`inbound-inspection-line-${line.lineId}-defect-qty`}
  aria-label={`${line.modelCode} 불량 수량`}
  style={{
    width: '100%',
    height: '32px',
    padding: '0 var(--space-3)',
    border: line.defectQty > 0
      ? '1px solid var(--state-danger)'
      : '1px solid var(--line-default)',
    borderRadius: 'var(--radius-input)',
    fontSize: 'var(--font-size-sm)',
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'right',
    background: line.defectQty > 0 ? 'var(--state-danger-bg)' : 'var(--surface-card)',
    color: line.defectQty > 0 ? 'var(--state-danger)' : 'var(--ink-primary)',
  }}
/>
```

### 5.3 불량 사유 input (`defectReason`) — defectQty > 0 시 행 확장

```tsx
{line.defectQty > 0 && (
  <tr
    className="insp-defect-reason-row"
    data-testid={`inbound-inspection-line-${line.lineId}-defect-reason-row`}
  >
    <td colSpan={4} style={{ paddingLeft: 'var(--space-6)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <span className="insp-defect-reason-label">불량 사유</span>
        <input
          type="text"
          maxLength={200}
          placeholder="불량 사유를 입력하세요 (최대 200자)"
          value={line.defectReason ?? ''}
          onChange={(e) => onDefectReasonChange(line.lineId, e.target.value)}
          data-testid={`inbound-inspection-line-${line.lineId}-defect-reason`}
          aria-label={`${line.modelCode} 불량 사유`}
          style={{
            flex: 1,
            height: '32px',
            padding: '0 var(--space-3)',
            border: '1px solid var(--state-danger)',
            borderRadius: 'var(--radius-input)',
            fontSize: 'var(--font-size-sm)',
            background: 'var(--surface-card)',
            color: 'var(--ink-primary)',
          }}
        />
      </div>
    </td>
  </tr>
)}
```

---

## 6. data-testid 전체 목록

| data-testid | 요소 | 조건 |
|---|---|---|
| `inbound-inspection-dialog` | Dialog 래퍼 `<div role="dialog">` | Dialog 열림 시 항상 |
| `inbound-inspection-line-{lineId}` | 각 라인 행 `<tr>` | 라인별 — lineId 는 BE slipLineId (UUID 아닌 내부 key) |
| `inbound-inspection-line-{lineId}-inspected-qty` | 검수 수량 `<input>` | 라인별 |
| `inbound-inspection-line-{lineId}-defect-qty` | 불량 수량 `<input>` | 라인별 |
| `inbound-inspection-line-{lineId}-defect-reason-row` | 불량 사유 확장 `<tr>` | `defectQty > 0` 시 |
| `inbound-inspection-line-{lineId}-defect-reason` | 불량 사유 `<input>` | `defectQty > 0` 시 |
| `inbound-inspection-save-button` | [검수 저장] `<button>` | 항상 |
| `inbound-inspection-complete-button` | [검수 완료] `<button>` | 항상 |

> `lineId` 는 슬립 라인의 화면 내부 인덱스 (0-based 또는 1-based 일관 적용). UUID 를 lineId 로 직접 사용하는 경우 화면 노출 경로가 없으면 허용 — data-testid 값에만 사용.

---

## 7. 푸터 버튼 영역

```
┌──────────────────────────────────────────────────────────┐
│                           [검수 저장]   [검수 완료]        │
└──────────────────────────────────────────────────────────┘
```

### 7.1 버튼 스펙

| 버튼 | data-testid | variant | 동작 | 비활성 조건 |
|---|---|---|---|---|
| 검수 저장 | `inbound-inspection-save-button` | `secondary` | `PATCH /slips/{id}/inspection` (partial save, status 변경 없음) | 변경 사항 없을 시 disabled |
| 검수 완료 | `inbound-inspection-complete-button` | `primary` | `POST /slips/{id}/inspection/complete` (status → INSPECTED) | 필수 필드 미입력 / 저장 API pending 시 |

### 7.2 버튼 순서 규칙

- 데스크탑: 푸터 우측 정렬. `[검수 저장]` (secondary) 좌측 → `[검수 완료]` (primary) 우측.
- 검수 완료 클릭 시 확인 다이얼로그 표시:

```
┌────────────────────────────────────────┐
│  검수를 완료하시겠습니까?                │
│  완료 후에는 수정할 수 없습니다.          │
│                 [취소]  [검수 완료 확인] │
└────────────────────────────────────────┘
```

- 확인 다이얼로그: `role="alertdialog"` + `aria-describedby`.
- `[취소]`: `variant="ghost"`. `[검수 완료 확인]`: `variant="primary"`.

### 7.3 푸터 CSS spec

```css
.insp-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-6);
  border-top: 1px solid var(--line-default);
  background: var(--surface-card);
}
```

---

## 8. 접근성 (A11y) 요구사항

### 8.1 자동 포커스 — 첫 번째 라인 `inspectedQty`

```tsx
// InboundInspectionDialog mount 시
useEffect(() => {
  const firstInput = document.querySelector<HTMLInputElement>(
    '[data-testid="inbound-inspection-dialog"] input[type="number"]'
  )
  firstInput?.focus()
  firstInput?.select()
}, [])
```

또는 `autoFocus` prop 을 첫 번째 검수 수량 input 에 직접 부여.

### 8.2 Tab 순서 — 라인 단위 순차 이동

```
라인 1: inspectedQty → defectQty → (defectQty > 0) defectReason
라인 2: inspectedQty → defectQty → (defectQty > 0) defectReason
...
라인 N: inspectedQty → defectQty → (defectQty > 0) defectReason
→ [검수 저장] → [검수 완료]
```

- `tabIndex` 는 DOM 순서 자연 흐름 유지 (별도 tabIndex 지정 불필요).
- 불량 사유 확장 행은 `defectQty > 0` 시에만 DOM 에 마운트 → Tab 흐름 자동 삽입.

### 8.3 접근성 체크리스트

- [ ] Dialog 래퍼: `role="dialog"` + `aria-modal="true"` + `aria-labelledby` (제목 h2 연결)
- [ ] 닫기 버튼: `aria-label="검수 다이얼로그 닫기"`
- [ ] 모든 `<input>` 에 `aria-label` 부여 (레이블 텍스트: `{modelCode} {필드명}`)
- [ ] 예정 수량 셀: `aria-label="{modelCode} 예정 수량 {N}"`  (읽기 전용 표시)
- [ ] 검수 수량 input: `aria-required="true"`
- [ ] 불량 수량 input: `aria-describedby` → defectReason input id (defectQty > 0 시)
- [ ] 차이 badge: `aria-label="예정 수량 대비 {초과/부족} {N}"`
- [ ] 확인 다이얼로그: `role="alertdialog"` + `aria-describedby`
- [ ] 첫 번째 검수 수량 input 자동 포커스 (mount 직후)
- [ ] `Escape` 키로 Dialog 닫기 (`onKeyDown` 핸들러)
- [ ] 키보드 포커스 트랩 — Dialog 내부로 한정 (`focus-trap-react` 또는 커스텀)

---

## 9. 컬러 토큰 전체 목록

모든 색상은 design-system CSS 변수 토큰만 사용. raw hex 금지.

| 용도 | CSS 토큰 |
|---|---|
| Dialog 배경 | `var(--surface-card)` |
| 헤더 배경 | `var(--surface-card)` |
| 헤더 경계선 | `var(--line-default)` |
| 테이블 헤더 배경 | `var(--color-neutral-50)` |
| 테이블 헤더 텍스트 | `var(--ink-secondary)` |
| 테이블 행 기본 배경 | `var(--surface-card)` |
| 행 경계선 | `var(--line-default)` |
| 정상 행 배경 | `var(--surface-card)` |
| 차이 행 배경 (noticed) | `var(--state-warning-bg)` |
| 차이 행 좌측 border (noticed) | `var(--state-warning)` |
| 불량 행 배경 (danger) | `var(--state-danger-bg)` |
| 불량 행 좌측 border (danger) | `var(--state-danger)` |
| 불량 사유 확장 행 배경 | `var(--state-danger-bg)` |
| 불량 사유 레이블 텍스트 | `var(--state-danger)` |
| 불량 수량 input border (defectQty > 0) | `var(--state-danger)` |
| 불량 수량 input 배경 (defectQty > 0) | `var(--state-danger-bg)` |
| 불량 수량 input 텍스트 (defectQty > 0) | `var(--state-danger)` |
| 초과 badge 배경 | `var(--state-warning-bg)` |
| 초과 badge 텍스트 | `var(--state-warning)` |
| 부족 badge 배경 | `var(--state-danger-bg)` |
| 부족 badge 텍스트 | `var(--state-danger)` |
| input border 기본 | `var(--line-default)` |
| input focus border | `var(--color-brand-600)` (또는 `var(--line-focus)`) |
| 본문 텍스트 | `var(--ink-primary)` |
| 보조 텍스트 | `var(--ink-secondary)` |
| 예정 수량 (읽기 전용) | `var(--ink-tertiary)` |
| 예정 수량 배경 (읽기 전용) | `var(--surface-subtle)` |
| 푸터 경계선 | `var(--line-default)` |
| 푸터 배경 | `var(--surface-card)` |
| 오버레이 배경 | `rgba(0, 0, 0, 0.4)` (토큰 없음 — 예외 허용) |

---

## 10. 타이포그래피 스케일

| 요소 | 폰트 크기 토큰 | 폰트 굵기 토큰 | 비고 |
|---|---|---|---|
| 모달 제목 | `var(--font-modal-title)` (18px) | `var(--font-weight-semibold)` (600) | |
| 메타 레이블 | `var(--font-size-sm)` (13px) | `var(--font-weight-medium)` (500) | "전표번호:" 등 |
| 메타 값 | `var(--font-size-sm)` (13px) | `var(--font-weight-regular)` (400) | |
| 테이블 헤더 | `var(--font-size-xs)` (12px) | `var(--font-weight-semibold)` (600) | |
| 품목코드 | `var(--font-size-sm)` (13px) | `var(--font-weight-medium)` (500) | |
| 예정 수량 | `var(--font-size-sm)` (13px) | `var(--font-weight-regular)` (400) | `font-variant-numeric: tabular-nums` |
| 검수/불량 input | `var(--font-size-sm)` (13px) | `var(--font-weight-regular)` (400) | `font-variant-numeric: tabular-nums` |
| 불량 사유 input | `var(--font-size-sm)` (13px) | `var(--font-weight-regular)` (400) | |
| 불량 사유 레이블 | `var(--font-size-xs)` (12px) | `var(--font-weight-medium)` (500) | |
| 차이 badge | `var(--font-size-xs)` (12px) | `var(--font-weight-medium)` (500) | |

---

## 11. 스페이싱 규칙

| 요소 | 토큰 | 값 |
|---|---|---|
| Dialog 헤더 padding | `var(--space-5) var(--space-6)` | 20px 24px |
| 헤더 내부 gap | `var(--space-3)` | 12px |
| 테이블 wrapper padding | `var(--space-5) var(--space-6)` | 20px 24px |
| 테이블 헤더 cell padding | `var(--space-2) var(--space-3)` | 8px 12px |
| 테이블 본문 cell padding | `var(--space-2) var(--space-3)` | 8px 12px |
| 테이블 행 높이 | `var(--row-h)` | 40px |
| 테이블 헤더 높이 | `var(--row-h-thead)` | 44px |
| 불량 사유 행 padding | `var(--space-2) var(--space-3) var(--space-3)` | 8px 12px 12px |
| 불량 사유 들여쓰기 | `var(--space-6)` | 24px |
| 푸터 padding | `var(--space-4) var(--space-6)` | 16px 24px |
| 버튼 gap | `var(--space-3)` | 12px |
| input 높이 | 32px | 테이블 내 인라인 편집 |
| 모달 max-height | `calc(100vh - 80px)` | 오버플로우 시 본문 scroll |
| 모달 너비 | `min(980px, 92vw)` | |

---

## 12. UX 흐름 정의

### 12.1 검수 진입 흐름

```
슬립 상세 페이지 (/purchases/:slipId) — status = ACCEPTED
  → [검수 입력] 버튼 클릭
    → InboundInspectionDialog 열림
      → 슬립 라인 목록 조회 (GET /slips/{id})
      → 각 라인 inspectedQty 초기값 = expectedQty (자동 채움)
      → defectQty 초기값 = 0
      → 첫 번째 라인 inspectedQty input 자동 포커스
```

### 12.2 검수 저장 흐름 (임시 저장)

```
[검수 저장] 버튼 클릭
  → PATCH /slips/{id}/inspection
    → body: { lines: [{ lineId, inspectedQty, defectQty, defectReason }] }
    → 성공: 토스트 "검수 내용이 저장되었습니다." / Dialog 유지 (닫힘 없음)
    → 실패: 에러 배너 (role="alert") — Dialog 상단 표시
```

### 12.3 검수 완료 흐름

```
[검수 완료] 버튼 클릭
  → 확인 다이얼로그 표시 (role="alertdialog")
    → [취소] → 확인 다이얼로그 닫힘
    → [검수 완료 확인] → POST /slips/{id}/inspection/complete
      → 성공: Dialog 닫힘 + 슬립 상세 페이지 status 갱신 + 토스트 "검수가 완료되었습니다."
      → 실패: 에러 배너 표시 (Dialog 유지)
```

### 12.4 에러 처리

| 시나리오 | UI 처리 |
|---|---|
| 검수 수량 음수 입력 | input 즉시 검증 — border `var(--state-danger)` + `aria-invalid="true"` |
| 불량 수량 > 검수 수량 | 저장 시 에러 배너 "불량 수량은 검수 수량을 초과할 수 없습니다." |
| 불량 수량 > 0 이나 사유 미입력 | 저장 시 에러 배너 "불량 사유를 입력해 주세요." — 해당 input focus |
| API 오류 (5xx) | Dialog 상단 에러 배너 `role="alert"` |
| 네트워크 타임아웃 | 에러 배너 + [재시도] 버튼 |

**에러 배너 스타일**:

```css
.insp-error-banner {
  background: var(--state-danger-bg);
  border: 1px solid var(--state-danger);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  font-size: var(--font-size-sm);
  color: var(--state-danger);
  margin: 0 var(--space-6) var(--space-3);
}
```

---

## 13. TypeScript Props 정의 (Frontend agent 전달)

```typescript
/** 입고 검수 라인 1건 — 화면 state 용. */
export interface InspectionLineDraft {
  /** 내부 식별자 — data-testid 생성 전용, 화면 미노출. */
  lineId: string
  /** 품목코드 — 비즈니스 식별자, 화면 표시. */
  modelCode: string
  /** 예정 수량 — 읽기 전용 (슬립 라인 quantity). */
  expectedQty: number
  /** 검수 수량 — 사용자 입력. */
  inspectedQty: number
  /** 불량 수량 — 사용자 입력. */
  defectQty: number
  /** 불량 사유 — defectQty > 0 시 필수. */
  defectReason: string | null
}

/** InboundInspectionDialog Props. */
export interface InboundInspectionDialogProps {
  /** 슬립 ID (내부 전송용 — 화면 미노출). */
  slipId: string
  /** 전표번호 — 헤더 표시. */
  slipNo: string
  /** 입고일 YYYY-MM-DD. */
  slipDate: string
  /** 입고 창고명 — 헤더 표시. */
  destinationWarehouseName: string
  /** 공급처명 — 헤더 표시. */
  partnerName: string | null
  /** 검수자 이름 — 세션에서 주입. */
  inspectorName: string
  /** 검수자 권한 풀네임 — 헤더 표시. */
  inspectorRole: string
  /** 검수 라인 목록 — 슬립 라인에서 파생. */
  lines: InspectionLineDraft[]
  /** Dialog 닫기 콜백. */
  onClose: () => void
  /** 검수 완료 후 콜백 (슬립 상세 refetch 등). */
  onComplete: () => void
}

/** 검수 저장 요청 — BE PATCH /slips/{id}/inspection. */
export interface InspectionSaveRequest {
  lines: {
    lineId: string
    inspectedQty: number
    defectQty: number
    defectReason: string | null
  }[]
}
```

---

## 14. 모달 전체 구조 (JSX 스켈레톤)

```tsx
<div
  role="dialog"
  aria-modal="true"
  aria-labelledby="insp-dialog-title"
  data-testid="inbound-inspection-dialog"
  style={{ width: 'min(980px, 92vw)', maxHeight: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column' }}
>
  {/* 헤더 */}
  <div className="insp-header">
    <div className="insp-title-row">
      <h2 id="insp-dialog-title" className="insp-title">입고 검수</h2>
      <button aria-label="검수 다이얼로그 닫기" onClick={onClose}>✕</button>
    </div>
    <div className="insp-meta-row">
      <span><strong>전표번호:</strong> {slipNo}</span>
      <span><strong>입고일:</strong> {slipDate}</span>
      <span><strong>창고:</strong> {destinationWarehouseName}</span>
    </div>
    <div className="insp-inspector-row">
      <span><strong>공급처:</strong> {partnerName ?? '—'}</span>
      <span><strong>검수자:</strong> {inspectorName} ({inspectorRole})</span>
    </div>
  </div>

  {/* 에러 배너 (오류 시) */}
  {errorMessage && (
    <div className="insp-error-banner" role="alert">{errorMessage}</div>
  )}

  {/* 본문 — 테이블 */}
  <div className="insp-table-wrapper">
    <table className="insp-table">
      <thead>
        <tr>
          <th style={{ width: '200px' }}>품목코드</th>
          <th style={{ width: '100px', textAlign: 'right' }}>예정 수량</th>
          <th style={{ width: '140px' }}>검수 수량</th>
          <th style={{ width: '140px' }}>불량 수량</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((line, idx) => (
          <>
            <InspectionLineRow
              key={line.lineId}
              line={line}
              isFirst={idx === 0}
              onInspectedQtyChange={...}
              onDefectQtyChange={...}
              onDefectReasonChange={...}
            />
          </>
        ))}
      </tbody>
    </table>
  </div>

  {/* 푸터 */}
  <div className="insp-footer">
    <Button
      variant="secondary"
      data-testid="inbound-inspection-save-button"
      onClick={handleSave}
      disabled={!isDirty || isSaving}
    >
      검수 저장
    </Button>
    <Button
      variant="primary"
      data-testid="inbound-inspection-complete-button"
      onClick={handleCompleteClick}
      disabled={isSaving || isCompleting}
    >
      검수 완료
    </Button>
  </div>
</div>
```

---

## 15. Iteration 계획

메모리 가드 `feedback_print_design_iteration.md` 준수.

| 회차 | 내용 | 검토 방법 | 완료 기준 |
|---|---|---|---|
| 1차 (현재) | 본 spec 작성 | Designer 산출물 검토 | 레이아웃 + 필드 + 시각화 정책 확정 |
| 2차 | FE 1차 mock 구현 후 Edge 캡처 | PR comment 이미지 첨부 | Dialog 열림 / 검수 수량 입력 / 차이 badge 동작 확인 |
| 3차 | 불량 행 확장 / 에러 상태 CSS 미세 조정 | Edge 캡처 + 사용자 검토 | noticed/danger 배경 시각 확인 |
| 4차 | BE API 연결 후 실 데이터 기반 검증 | QA 에이전트 시나리오 검증 | 저장 / 완료 E2E 통과 |
| 5차 | 접근성 + 키보드 Tab 순서 + 자동 포커스 최종 확인 | QA 에이전트 + 개발책임자 승인 | 최종 QA 캡처 `docs/qa/p0-9-inspection/` 첨부 |

---

## 16. 관련 파일 경로

| 파일 | 역할 |
|---|---|
| `clients/desktop/src/renderer/routes/SlipDetailPage.tsx` | [검수 입력] 버튼 진입 지점 |
| `clients/desktop/src/renderer/api/slip.ts` | 슬립 조회 + 검수 API 클라이언트 추가 대상 |
| `clients/desktop/src/renderer/routes/InventoryAuditDetailPage.tsx` | 유사 패턴 참조 (DataTable + Button + 상태 badge) |
| `clients/web/design-system/src/tokens/tokens.css` | 모든 CSS 변수 토큰 정의 |
| `docs/migration/ecount-reference/` | 이카운트 입고/검수 화면 UX 참조 캡처 |
| `docs/qa/p0-9-inspection/` | QA 스크린샷 저장 경로 (PR 본문 첨부용 — 2차 iteration 생성) |
