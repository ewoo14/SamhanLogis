## Designer Reviewer — PR #142 (P0-9 입고 검수 UI)

검토 기준: `INBOUND-INSPECTION-DESIGN.md` (self) + FE Dialog/Page 구현 대조

---

### 검토 결과 요약

| 항목 | 설계 spec | FE 구현 | 판정 |
|---|---|---|---|
| Modal size | `size="xl"` (min 980px, 92vw) | `size="lg"` | FAIL |
| data-testid 종수 | 8종 (라인별 포함) | 4종 (명명 불일치) | FAIL |
| 차이 시각화 DiffBadge | `▲+N / ▼-N` badge + noticed/danger 행 클래스 | 미구현 | FAIL |
| 불량 사유 행 확장 패턴 | `defectQty > 0` 시 별도 `<tr>` DOM 마운트 | 동일 행 인라인 — disabled 토글 | PARTIAL |
| 자동 포커스 | 첫 번째 inspectedQty mount 즉시 focus+select | 미구현 | FAIL |
| 창고명 헤더 표시 | `destinationWarehouseName` | 없음 | FAIL |
| 검수 완료 확인 다이얼로그 | `role="alertdialog"` 2단계 확인 | 바로 API 호출 | FAIL |

**전체 판정: CHANGES REQUESTED**

---

### 상세 지적 사항

#### [FAIL-1] Modal size `"xl"` → `"lg"` 불일치

설계 spec §1 Modal 크기: `size="xl"` (min 980px, 92vw). 구현은 `size="lg"` 적용.

라인 테이블이 모델코드(200px) + 예정수량(100px) + 검수수량(140px) + 불량수량(140px) + 정상수량 + 불량사유 6컬럼으로 구성되어 있으므로 xl 크기가 필수입니다. lg 에서는 수평 스크롤이 발생합니다.

```tsx
// 현재 (WRONG)
<Modal size="lg" ...>

// 수정 필요
<Modal size="xl" ...>
```

---

#### [FAIL-2] data-testid 8종 미충족 — 4종만 구현, 명명 불일치

설계 spec §6 전체 목록 vs 구현 비교:

| 설계 spec testid | 구현 상태 |
|---|---|
| `inbound-inspection-dialog` | 구현 (일치) |
| `inbound-inspection-line-{lineId}` | **없음** |
| `inbound-inspection-line-{lineId}-inspected-qty` | **없음** |
| `inbound-inspection-line-{lineId}-defect-qty` | **없음** |
| `inbound-inspection-line-{lineId}-defect-reason-row` | **없음** |
| `inbound-inspection-line-{lineId}-defect-reason` | **없음** |
| `inbound-inspection-save-button` | `inspection-save-btn` (명명 불일치) |
| `inbound-inspection-complete-button` | `inspection-complete-btn` (명명 불일치) |

QA 자동화 시나리오 및 E2E 테스트가 spec 기반 selector를 사용하므로 전원 수정 필요.

```tsx
// 각 라인 <tr> 에 추가
<tr
  key={line.lineId}
  data-testid={`inbound-inspection-line-${line.lineId}`}
  ...
>

// 검수 수량 input
<input
  data-testid={`inbound-inspection-line-${line.lineId}-inspected-qty`}
  ...
/>

// 불량 수량 input
<input
  data-testid={`inbound-inspection-line-${line.lineId}-defect-qty`}
  ...
/>

// 버튼 명명 수정
data-testid="inbound-inspection-save-button"
data-testid="inbound-inspection-complete-button"
```

---

#### [FAIL-3] 차이 시각화 DiffBadge 및 행 상태 클래스 미구현

설계 spec §4 핵심 기능:

- `inspectedQty !== expectedQty` → 행 배경 `var(--state-warning-bg)`, 좌측 border `3px solid var(--state-warning)` + `▲+N / ▼-N` badge
- `defectQty > 0` → 행 배경 `var(--state-danger-bg)`, 좌측 border `3px solid var(--state-danger)` (danger 우선)
- 우선순위: danger > noticed > 정상

현재 구현: 차이 badge 없음, 행 배경 변경 없음, `defectError` (defectQty > inspectedQty) 경계 입력 border만 변경.

이것이 P0-9의 핵심 UX 가치(차이 한눈에 파악)이므로 반드시 구현 필요.

```tsx
// 행 상태 결정 함수 추가
function rowClass(line: LineState): string {
  if (line.defectQty > 0) return 'insp-line-row danger'
  if (line.inspectedQty !== line.expectedQty) return 'insp-line-row noticed'
  return 'insp-line-row'
}

// DiffBadge 컴포넌트 — 설계 spec §4.3 참조
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

#### [PARTIAL-4] 불량 사유 행 확장 패턴 — inline vs 별도 `<tr>`

설계 spec §5.3: `defectQty > 0` 시 별도 `<tr className="insp-defect-reason-row">` DOM 마운트 (Tab 흐름 자동 삽입 효과).

현재 구현: 같은 행의 마지막 `<td>`에 인라인 배치, `disabled` 토글. DOM에 항상 존재.

기능 동작은 유사하나 두 가지 문제:
1. `data-testid="inbound-inspection-line-{lineId}-defect-reason-row"` 별도 행 testid 충족 불가
2. Tab 순서가 설계 의도(라인 단위 순차)와 다를 수 있음

수정 방향: 별도 `<tr>` 확장 패턴으로 변경 권장.

---

#### [FAIL-5] 자동 포커스 미구현

설계 spec §8.1: Dialog mount 직후 첫 번째 `inspectedQty` input 자동 focus + select.

현재 구현: `useEffect` 자동 포커스 로직 없음.

```tsx
// InboundInspectionDialog 내 useEffect 추가
useEffect(() => {
  if (open && !detailQuery.isLoading) {
    const firstInput = document.querySelector<HTMLInputElement>(
      '[data-testid="inbound-inspection-dialog"] input[type="number"]'
    )
    firstInput?.focus()
    firstInput?.select()
  }
}, [open, detailQuery.isLoading])
```

---

#### [FAIL-6] 헤더 창고명(`destinationWarehouseName`) 미표시

설계 spec §2.1: 헤더 메타 행에 `창고: {destinationWarehouseName}` 표시 필수.

현재 구현: 전표번호 / 상태 / 거래처 / 입고일 / 검수자 — 창고명 없음.

BE `InboundInspectionDetailResponse` 에 `destinationWarehouseName` 필드 포함 여부 FE 팀과 확인 후 헤더에 추가 필요.

---

#### [FAIL-7] 검수 완료 확인 다이얼로그 미구현

설계 spec §7.2: [검수 완료] 클릭 → `role="alertdialog"` 2단계 확인 다이얼로그 표시 후 API 호출.

현재 구현: 클릭 즉시 `completeMutation.mutate()` 호출. 되돌릴 수 없는 재고 확정 작업이므로 2단계 확인 필수.

---

### 긍정 검토 사항 (유지)

- UUID 비공개 가드 완전 준수 — `slipId` 화면 미노출, `slipNo`/`modelCode` 등 비즈니스 키만 표시
- `aria-label` 전 input 부여 — 접근성 기본 충족
- 합계 행(`<tfoot>`) 자동 계산 — 설계 미정의 유용한 추가 기능, 유지 권장
- 30초 polling 갱신 (`refetchInterval: 30_000`) — InventoryAuditListPage 패턴 일관
- `role="alert"` 에러 배너 구조 — 올바름
- `role="status"` 성공 메시지 — 올바름
- 상태 Badge variant 매핑 (neutral/warning/success) — 토큰 일치

---

### 필수 수정 항목 (머지 전 완료 필수)

1. Modal `size="lg"` → `size="xl"` 변경
2. data-testid 8종 완전 구현 (라인별 + 버튼 명명 통일)
3. DiffBadge + noticed/danger 행 상태 클래스 구현
4. 불량 사유 별도 `<tr>` 확장 패턴 변경 + `defect-reason-row` testid 추가
5. 자동 포커스 `useEffect` 추가
6. 헤더 창고명 필드 추가
7. 검수 완료 `alertdialog` 2단계 확인 추가

---

**결론: 핵심 차이 시각화(DiffBadge/행 상태)와 data-testid 8종이 미구현되어 CHANGES REQUESTED — FE 팀 수정 후 재검토 요청.**
