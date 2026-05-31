# InventoryLookupModal — Designer 리뷰 Cycle 1

> 작성: 2026-05-31 / Designer agent  
> 대상: `clients/desktop/src/renderer/routes/components/InventoryLookupModal.tsx`  
> 기준: `docs/design/inventory-lookup-modal-guide.md`  
> 결론: **CHANGES_REQUESTED** (P1 5건 + P2 6건)

---

## P1 (필수 수정 — 릴리스 블로킹)

### P1-1. 색 토큰 미사용 — 하드코딩 색상 전면 위반

**가이드 §7 + 체크리스트 "하드코딩 색상 금지"**

구현 전 코드에서 `var(--state-danger)`, `var(--state-warning)`, `var(--ink-primary)` 등 **design-system 토큰을 단 한 곳도 사용하지 않고** 전부 독자 네임스페이스(`--color-neutral-*`, `--color-danger-*`, `--color-success-*`)로 작성되어 있다.

| 위치 | 구현값 | 가이드 요구 토큰 |
|---|---|---|
| 가용=0 danger 색 (L270) | `var(--color-danger-600, #DC2626)` | `var(--state-danger)` = `#EF4444` |
| 가용>0 색 (L273) | `var(--color-success-700, #15803D)` | `var(--ink-primary)` = `#1A1F2E` |
| 예약 숫자 색 (L282) | `var(--color-neutral-500)` | 예약>0 → `var(--state-warning)` / 예약=0 → `var(--ink-secondary)` |
| 실재고 색 (L279) | `var(--color-neutral-700)` | `var(--ink-secondary)` |
| 0셀 배경 (L254-255) | `var(--color-neutral-50, #F9FAFB)` | `var(--surface-subtle)` = `#F4F6F8` |
| 로딩 텍스트 색 (L109) | `var(--color-neutral-500)` | `var(--ink-secondary)` |
| 토글 라벨 색 (L95) | `var(--color-neutral-700)` | `var(--ink-secondary)` |

또한 가이드는 **가용>0이면 `var(--ink-primary)`(기본 묵색)**로 표시하도록 명시했으나, 구현은 `--color-success-700`(초록색)을 사용함 — 의미 오류.

**수정 필요**: 모든 색 참조를 `--state-danger`, `--state-warning`, `--ink-primary`, `--ink-secondary`, `--ink-tertiary`, `--surface-subtle` 토큰으로 대체.

---

### P1-2. 예약 셀 color 조건 누락 — warning 분기 없음

**가이드 §7 표 + §7.1**

구현 L282는 예약 셀에 무조건 `var(--color-neutral-500)` 단일 색상을 적용한다.  
가이드는 **예약>0이면 `var(--state-warning)` orange**, 예약=0이면 `var(--ink-secondary)`로 분기하도록 명시한다. 이 분기가 전혀 없다.

```tsx
// 현재 (잘못됨)
<span style={{ color: 'var(--color-neutral-500)' }}>
  예약 {cell.reserved.toLocaleString()}
</span>

// 요구 사항
<span style={{ color: cell.reserved > 0 ? 'var(--state-warning)' : 'var(--ink-secondary)' }}>
  예약 {cell.reserved.toLocaleString()}
</span>
```

---

### P1-3. 0수량 토글 위치 오류 — 모달 body 내 배치, 헤더 우측 아님

**가이드 §3 표 + §4.1**

가이드: 토글은 **모달 헤더 우측, 닫기 버튼 왼쪽 16px**에 인라인 배치.

구현: `Modal` 컴포넌트의 `title="품목별 재고 현황"` prop을 사용한 채 body 내부(children) 최상단에 토글을 별도 `<div>`로 삽입 (L83-99). Modal의 헤더 슬롯에 토글을 추가하지 않아, 토글이 헤더가 아닌 콘텐츠 영역에 위치한다.

또한 Modal 컴포넌트는 `title` prop 외 헤더 우측 추가 요소를 위한 slot이 없으므로, `title`을 JSX 요소(토글 포함 flex row)로 넘기거나 `hideCloseButton`과 별도 헤더를 구성하는 방식으로 재설계해야 한다.

---

### P1-4. `role="dialog"` + `aria-modal` + `aria-labelledby` 미구현

**가이드 §13 표**

Modal 컴포넌트 자체는 `role="dialog"`, `aria-modal="true"`, `aria-labelledby` 를 올바르게 제공한다(Modal.tsx L171-175).  
그러나 구현이 `Modal`의 `title` prop에 `"품목별 재고 현황"` 이라는 **가이드와 다른 제목**을 사용한다. 가이드 §3은 제목을 **"재고조회"**로 명시한다.

더불어 가이드 §13은 `aria-labelledby="ilm-title"` 연결을 위해 별도 `id`를 부여하도록 지시하나, `Modal` 컴포넌트가 내부에서 자동 생성한 id를 사용하므로 외부에서 `id="ilm-title"`를 추가할 수 없다. 이는 가이드의 id 명세와 불일치하지만, Modal이 이미 접근성을 처리하므로 이 항목의 실질적 접근성 결함은 제목 텍스트 오류에 한정된다.

**수정 필요**: `title="재고조회"` 로 수정. 서브헤더("선택 품목 N건 · 조회 창고 M개")는 `description` prop 또는 별도 JSX로 추가.

---

### P1-5. `scope="col"` / `scope="row"` th 시맨틱 누락

**가이드 §5.1 + §13**

구현 L174, L187-211의 `<th>` 요소에 `scope` 속성이 전혀 없다. 가이드는 `<th scope="col">`(창고 컬럼), `<th scope="row">`(품목 행) 를 명시하며 시맨틱 테이블 접근성을 의무화한다.  
또한 `<caption class="sr-only">품목별 창고 재고 매트릭스</caption>`도 누락됐다.

---

## P2 (권장 수정 — UX 품질)

### P2-1. 품목 고정 컬럼 sticky 미적용

**가이드 §5.2 + §10**

구현 L218-236의 품목 첫 열 `<td>`에 `position: sticky; left: 0` 처리가 없다.  
창고 컬럼 수 증가 시 가로 스크롤 발생할 때 품목명이 사라지는 UX 결함. 가이드는 `box-shadow: inset -1px 0 0 var(--line-default)` 구분선 shadow도 함께 요구한다.

---

### P2-2. 셀 3줄 포맷 — 라벨 prefix CSS `::before` 방식 미적용

**가이드 §6.1 + §6.3**

구현은 `가용 {N}`, `실 {N}`, `예약 {N}` 형태로 텍스트를 직접 렌더링한다(L277, L280, L283). 가이드 §6.3은 `::before` pseudo-element로 라벨을 분리하고 `min-width: 2em`으로 고정하여 숫자 정렬을 맞추도록 지시한다. `font-variant-numeric: tabular-nums`도 구현에 없다.

---

### P2-3. 0셀 텍스트 deemphasis 적용 불완전

**가이드 §7 표 "0셀 텍스트"**

구현 L253-256은 0셀에 배경만 지정(`--color-neutral-50`)하고 3줄 텍스트 색을 `var(--ink-tertiary)`로 변경하지 않는다. 가이드는 total=0인 셀의 모든 숫자 텍스트를 `var(--ink-tertiary)`로 deemphasis하도록 명시한다.

---

### P2-4. `data-testid="inventory-lookup-loading"` / `"inventory-lookup-error"` 미부여

**가이드 §15 testid 목록**

로딩 상태(L102-113)와 에러 상태(L117-131)에 `data-testid`가 없다. Playwright 테스트가 상태를 선택할 수 없다.

---

### P2-5. 빈 상태 문구 가이드와 불일치

**가이드 §4.3**

구현 L156-159의 창고 없음 안내 문구: `"실재고가 있는 창고가 없습니다. '0수량 창고도 표시'를 체크하면 모든 창고를 볼 수 있습니다."` → 가이드 문구: `"조회된 재고 창고가 없습니다." + "0수량 창고도 표시를 켜면 전체 창고를 확인할 수 있습니다."` (2줄 분리).  
사소하나 가이드 텍스트 일관성 유지 차원에서 교정 필요.

---

### P2-6. VIRTUAL 창고 필터 코드 없음

**가이드 §4.2 "VIRTUAL 창고는 ON 상태에서도 컬럼 제외"**

구현 L64-70의 `visibleCols` 필터 로직에 `w.warehouseType !== 'VIRTUAL'` 조건이 없다. 가이드 D-IL-04 및 2.6c 관례에 따라 VIRTUAL 창고는 토글 ON 시에도 반드시 제외되어야 한다.

---

## 종합 요약

| 구분 | 건수 | 주요 내용 |
|---|---|---|
| P1 (블로킹) | 5 | 색 토큰 하드코딩 전면 위반, 예약 warning 분기 누락, 토글 헤더 위치 오류, 모달 제목 오류, th scope 누락 |
| P2 (권장) | 6 | sticky 컬럼, 라벨 CSS 포맷, 0셀 deemphasis, testid, 문구, VIRTUAL 필터 |

**결론: CHANGES_REQUESTED**

P1-1 (색 토큰)과 P1-2 (예약 분기)은 비즈니스 의미 전달에 직접 영향(가용 정상인데 초록색 = 혼동, 예약 있어도 경고 없음). P1-3 (토글 위치)은 사용성 핵심. P1-5 (scope)는 접근성 의무. 5건 전부 수정 후 Cycle 2 재리뷰 요청.
