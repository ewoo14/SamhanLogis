# 모바일 S4c 상세 페이지 가독성 개선 스펙

작성일: 2026-06-25
작성자: Design agent
근거: docs/qa/mobile-s4c-detail-responsive/ 실 캡처 3장 분석
대상 파일: clients/desktop/src/renderer/styles/global.css, SlipDetailPage.tsx (판매전표), 그리고 동일 .detail-grid 패턴을 사용하는 견적·세금계산서 상세 페이지

---

## 1. 실 캡처에서 확인한 문제 목록

### 1-A. 판매전표 상세 (mobile-slip.png) — 가장 심각

스크롤 길이가 극단적으로 길다. 캡처 원본 5618px 높이, 실제 화면에서는 훨씬 더 길게 느껴진다.

확인된 세부 문제:

1. **빈 "—" 필드 8개가 나란히 전체 높이를 차지** — "배송 · 정산 정보 (V20)" 카드에서 배송주소, 감리주소, 프로젝트명, 인수자 번호, 입금예정일, 사업자번호가 모두 "—"(null). 각각 라벨+값 2줄 = 6개 필드 × 약 52px = 312px 순수 공백.
2. **기사 정보 카드(OUTBOUND 한정)도 기사명·기사 연락처 모두 "-"** — 60px 이상 공백 섹션.
3. **.detail-grid가 모바일에서 1열로 붕괴**(global.css line 401-405 에 이미 `grid-template-columns: 1fr` 적용됨)는 됐으나 각 항목이 `display:block`의 라벨 → `display:block`의 값 = 2줄 구조여서 1열 나열 시 라벨·값이 교대로 쌓이고 스캔이 어렵다.
4. **섹션 제목(`<h4>`)이 카드 안에 있어 시각 계층이 약함** — "전표 라인", "결재 정보", "전자서명 정보" 등 모든 섹션이 동일한 무게로 보여 어디가 무엇인지 한눈에 파악 안 됨.
5. **상단 액션 버튼 4개(거래명세서 출력·계산서 출력·판매전표 출력·수정)가 헤더에 줄바꿈 없이 밀집** — 터치 타깃 작음(현재 `size="sm"` = 약 32px 높이), 잘못 터치 가능성 높음.
6. **협업·버전 이력·배송정산·기사정보·전표라인·결재·전자서명 7개 섹션을 모두 세로 나열** — 모바일 사용자의 실 용도는 "전표 번호·거래처 확인" + "전표 라인 품목·수량 확인"인데, 보조 섹션(버전 이력·협업 코멘트·배송정산·전자서명)이 같은 weight로 먼저 보임.

### 1-B. 견적서 상세 (mobile-estimate.png) — 양호하나 개선 여지

1. 품목 라인이 카드 안에 키·값 테이블 형태여서 1라인 = 8행이 됨(#, 모델명, 품목명, 규격, 수량, 단가, 공급가액, 부가세, 소계). 라인이 여러 개이면 급격히 길어짐.
2. 합계 행이 `하단 고정`이 아닌 스크롤 중간에 위치해 파악하려면 끝까지 스크롤해야 함.
3. "버전 이력·협업·수정 이력"이 하단에 있어 접근하기 어렵지 않으나 순서가 "품목 라인 → 합계 → 버전 이력 → 협업 → 수정 이력"으로 모두 중요도 순임. 이 화면은 견적서 상세이므로 이 순서는 비교적 적절함.
4. 섹션 구분 카드 사이 여백이 충분해 desktop보다 가독성이 낫다. — 이것은 유지.

### 1-C. 세금계산서 상세 (mobile-tax-invoice.png) — 비교적 명확

1. 라인이 카드 분리형이라 스크롤은 길지만 구분이 명확함.
2. 라인 내부 키·값 행이 `라벨 : 우정렬 값` 패턴(#, 품명, 규격, 단위, 수량, 단가, 공급가액, 부가세) — 이 패턴이 판매전표의 `.detail-grid` 블록 쌓기보다 가독성이 훨씬 나음. 판매전표에 적용할 레퍼런스.
3. 합계가 화면 하단에 항상 붙어있어 파악이 쉬움 — 이것은 유지.

---

## 2. 개선안 (우선순위 P1 → P3)

모든 개선은 `@media (max-width: 768px)` 블록 안에서만 동작하도록 설계한다. 데스크탑(769px+)은 현행 유지. 공용 클래스 변경은 모든 상세 페이지에 자동 적용되므로 고임팩트.

---

### P1-1. 빈 필드 숨김 — 저위험 · 최고임팩트

**무엇을**: 모바일에서 값이 null/"—"/"-"인 `.detail-grid` 자식 div를 숨긴다.

**어디**: `clients/desktop/src/renderer/styles/global.css`

**어떻게**: CSS만으로는 내용이 "—"인지 구분 불가이므로 JSX 조건부 렌더가 필요하다.

`SlipDetailPage.tsx`의 "배송 · 정산 정보 (V20)" 카드(line 1417-1461)에서 각 `<div>` 를 `{slip.deliveryAddress ? <div>...</div> : null}` 패턴으로 전환한다. 단, data-testid가 있는 항목은 null 렌더 시 테스트가 깨질 수 있으므로 `data-testid`는 유지하되 래퍼를 `style={{ display: slip.deliveryAddress ? undefined : 'none' }}`으로 처리해도 무방하다.

모바일 전용으로 하려면 부모 컨테이너에 CSS class를 달고 미디어 쿼리로 숨기는 방식도 가능하다.

```css
/* global.css — @media (max-width: 768px) 블록에 추가 */
@media (max-width: 768px) {
  .detail-grid-item--hide-if-empty {
    display: none;
  }
  .detail-grid-item--hide-if-empty:has(.detail-value:not(:empty)):not(:has(.detail-value:empty)) {
    display: block;
  }
}
```

그러나 `:has()` 선택자는 내용이 문자 "—"인 경우 비어있지 않다고 판단한다. 따라서 **JSX 조건부 렌더가 더 신뢰성 있다**.

추천 구현: `SlipDetailPage.tsx`의 V20 카드 내 각 필드 div를 아래 헬퍼로 감싼다.

```tsx
// 파일 상단에 헬퍼 추가
function MobileHideIfEmpty({
  value,
  children,
}: {
  value: string | null | undefined
  children: React.ReactNode
}) {
  // 데스크탑: 항상 렌더 / 모바일: value 없으면 숨김
  // CSS로 제어 — SSR 없으므로 inline style으로 처리
  if (value == null || value === '' || value === '—' || value === '-') {
    return (
      <div style={{ '--mobile-hide': 1 } as React.CSSProperties} className="detail-grid-item-empty">
        {children}
      </div>
    )
  }
  return <>{children}</>
}
```

```css
/* global.css */
@media (max-width: 768px) {
  .detail-grid-item-empty {
    display: none;
  }
}
```

**적용 범위**: SlipDetailPage.tsx V20 카드(8개 필드), 기사 정보 카드(2개 필드). 결재 정보 카드의 "출고자/검수자 미수락·미검수"는 상태값이 의미있으므로 숨기지 않는다.

**기대 효과**: 모바일 스크롤 길이 30-40% 감소. 빈 V20 카드 전체가 사라지면 해당 섹션 헤더도 없애거나 조건부로 렌더할 것.

**데스크탑 무회귀 여부**: 완전 무회귀. @media 미디어쿼리 또는 클래스가 없으므로 데스크탑 렌더 동일.

---

### P1-2. .detail-grid 항목 — 인라인(라벨·값 한 줄) 레이아웃

**무엇을**: 현재 `.detail-label`이 `display:block`, `.detail-value`가 `display:block`이라 2줄 쌓임. 모바일에서 1줄 `라벨 ··· 값` 형태로 변경.

**어디**: `clients/desktop/src/renderer/styles/global.css` — `@media (max-width: 768px)` 블록(line 400-422)에 추가.

**어떻게**:

```css
@media (max-width: 768px) {
  /* 기존 .detail-grid 1열 붕괴는 유지 */
  .detail-grid > div {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 6px 0;
    border-bottom: 1px solid var(--color-neutral-100);
    min-height: 36px; /* 터치 안전 높이 */
  }
  .detail-grid > div:last-child {
    border-bottom: none;
  }
  .detail-label {
    flex: 0 0 auto;
    min-width: 80px;
    font-size: 12px;
    color: var(--color-neutral-500);
    margin-bottom: 0; /* 기존 margin-bottom:var(--space-1) 제거 */
  }
  .detail-value {
    flex: 1 1 auto;
    font-size: 14px;
    color: var(--color-neutral-800);
    text-align: right;
  }
}
```

세금계산서 상세 캡처에서 이미 이 패턴(라벨 좌 · 값 우)이 적용되어 있어 가독성이 판매전표보다 훨씬 낫다. 이것을 공용 `.detail-grid`에 통일 적용한다.

**기대 효과**: 동일 정보를 절반 높이로 표현. 6개 필드 기준 312px → 약 216px (32% 감소). 라벨·값을 좌우로 스캔하는 시선 흐름이 위→아래로 단순화됨.

**데스크탑 무회귀 여부**: `@media (max-width: 768px)` 블록 안 → 완전 무회귀.

**주의**: `.detail-label`과 `.detail-value`가 이 파일 외에 다른 컴포넌트에서도 사용되는지 Grep 확인 필요. `grep -r "detail-label" clients/desktop/src` 로 확인 후 다른 컨텍스트에서 2줄 형식이 의도적인 경우에는 해당 컴포넌트에 별도 클래스를 추가하거나, `detail-grid` 컨텍스트 선택자(`.detail-grid .detail-label`)를 사용.

---

### P1-3. 섹션 카드 — 시각 구분 강화

**무엇을**: 모바일에서 카드 간 구분이 약해 섹션 경계가 모호함. 카드 배경색과 섹션 헤더를 강화.

**어디**: `clients/desktop/src/renderer/styles/global.css`

**어떻게**:

```css
@media (max-width: 768px) {
  /* 카드 섹션 헤더 — 상단에 컬러 액센트 바 */
  .slip-section-header {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-neutral-500);
    padding: 4px 0 8px 0;
    border-bottom: 2px solid var(--color-brand-200, #BFDBFE);
    margin-bottom: 8px;
  }

  /* Card 컴포넌트가 감싸는 경우 — margin-top 조정으로 섹션 간격 확보 */
  /* SlipDetailPage의 각 Card style={{ marginTop: 16 }}은 유지, 추가 padding 없음 */
}
```

JSX에서 `<h4 style={{ marginTop: 0 }}>배송 · 정산 정보 (V20)</h4>` 를 `<div className="slip-section-header">배송 · 정산 정보</div>` 로 교체한다. "(V20)" 같은 기술 식별자는 모바일에서 제거해도 무방하다 — 사용자가 이해하기 어렵고 공간만 차지함.

**기대 효과**: 섹션 경계가 컬러 액센트 선으로 명확해지고, 소문자 캡션 스타일이 "지금 어느 섹션을 보는가"를 즉시 알려준다.

**데스크탑 무회귀 여부**: `@media` 블록 안이면 무회귀. `<h4>` → `<div>` 변경은 시맨틱 변경이므로 기존 CSS에서 `h4`를 직접 선택하는 규칙이 있는지 먼저 Grep 확인 필요(`grep "h4" global.css`). 현재 global.css에는 `h4` 직접 선택자 없음 — 안전.

---

### P1-4. 상단 액션 버튼 — 모바일 오버플로우 메뉴

**무엇을**: 헤더 영역(`.detail-action-bar`) 내 버튼이 4개(거래명세서 출력·계산서 출력·판매전표 출력·수정)로 좁은 화면에서 밀집됨. 모바일에서는 "출력" 3개를 "..." 드롭다운 또는 별도 시트로 접음.

**어디**: `clients/desktop/src/renderer/routes/SlipDetailPage.tsx` + `global.css`

**어떻게**:

CSS만으로 부분 해결 가능하다. 출력 버튼들을 `detail-action-bar`에서 별도 `<div className="detail-print-actions">` 로 묶고, 모바일에서는 이 그룹을 아래로 내린다.

```css
@media (max-width: 768px) {
  .detail-action-bar {
    flex-wrap: wrap;
    gap: 6px;
    /* 수정/삭제/목록으로 등 Primary 액션만 상단 유지 */
  }
  .detail-print-actions {
    /* 출력 버튼 그룹을 별도 행으로 내림 */
    width: 100%;
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    padding-top: 6px;
    border-top: 1px solid var(--color-neutral-100);
    margin-top: 4px;
  }
  /* 출력 버튼은 모바일에서 작게 — secondary 스타일 유지하되 폰트 축소 */
  .detail-print-actions .btn {
    font-size: 12px;
    padding: 6px 10px;
    height: 32px;
  }
}
```

JSX에서 거래명세서·계산서·판매전표 출력 버튼 3개를 `<div className="detail-print-actions">` 로 감싼다(line 1073-1110의 isOutbound 블록 내부). 수정·삭제·목록으로는 그대로 `detail-action-bar` 상단에 유지.

**터치 타깃 보완**: 수정/삭제/목록으로 버튼은 `size="sm"` → 모바일에서 `min-height: 44px` 적용.

```css
@media (max-width: 768px) {
  .detail-action-bar .btn--primary,
  .detail-action-bar .btn--danger,
  .detail-action-bar .btn--ghost {
    min-height: 44px;
    padding: 0 14px;
    font-size: 14px;
  }
}
```

단, `Button` 컴포넌트가 design-system 패키지에서 오므로 외부 CSS로 `.btn--primary` 등을 선택하려면 `data-variant="primary"` 또는 `className` 추가가 필요하다. design-system의 Button이 `data-variant` 속성을 출력하는지 확인 필요. 대안으로 `SlipDetailPage`에서 수정/삭제 버튼 주변을 `<div style={{ minHeight: 44, display:'flex', alignItems:'center' }}>` 로 감싸는 래퍼 방식도 가능.

**기대 효과**: 첫 번째 시선에 들어오는 버튼이 "수정 | 삭제 | 목록으로" 3개로 정리되고, 출력은 두 번째 행에 작게 위치. 터치 실수 감소.

**데스크탑 무회귀 여부**: @media 블록 + 클래스 추가 → 무회귀.

---

### P2-1. 보조 섹션 아코디언(접기) — 중위험 · 중임팩트

**무엇을**: "협업", "버전 이력", "배송 · 정산 정보 (V20)", "기사 정보", "전자서명 정보" 섹션을 모바일에서 기본 접힘(collapsed) 상태로 렌더한다.

**어디**: `SlipDetailPage.tsx`

**어떻게**: 각 섹션에 `<details>/<summary>` 네이티브 HTML 아코디언 적용. CSS만으로 동작하며 JS state 불필요. 접근성(keyboard, screen reader)도 네이티브 지원.

```tsx
// 예시 — 기사 정보 카드 래퍼
<Card padding={4} shadow="sm" style={{ marginTop: 16 }}>
  <details className="mobile-section-accordion">
    <summary className="mobile-section-summary">
      기사 정보 (배송)
    </summary>
    {/* 기존 카드 내용 */}
    ...
  </details>
</Card>
```

```css
@media (max-width: 768px) {
  .mobile-section-accordion {
    /* details 기본 스타일 제거 */
  }
  .mobile-section-summary {
    font-size: 13px;
    font-weight: 700;
    color: var(--color-neutral-700);
    cursor: pointer;
    list-style: none; /* 삼각형 제거 */
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 0;
    user-select: none;
  }
  .mobile-section-summary::before {
    content: '▸';
    font-size: 11px;
    color: var(--color-neutral-400);
  }
  details[open] .mobile-section-summary::before {
    content: '▾';
  }
}

/* 데스크탑에서는 details 항상 열림 처리 */
@media (min-width: 769px) {
  .mobile-section-accordion {
    /* 데스크탑에서는 open 없이도 내용 표시 */
    display: contents;
  }
  .mobile-section-summary {
    display: none; /* 데스크탑에서 토글 숨김 */
  }
  .mobile-section-accordion > *:not(summary) {
    display: block !important;
  }
}
```

**데스크탑 무회귀 주의사항**: `display: contents`가 Card 패딩·shadow에 영향을 줄 수 있다. 안전한 대안: `@media (min-width: 769px)` 에서 `details[open]` 가 아닌 `details` 자체에 `open` attribute를 JS로 강제 부여하거나, Card 안에서 `<details>` 대신 React state(`const [open, setOpen] = useState(window.innerWidth > 768)`)를 쓰는 방식. 단, 이 경우 SSR 무관 Electron 앱이므로 window 접근 안전.

더 안전한 구현:
```tsx
// 재사용 가능한 컴포넌트
function MobileCollapsible({
  title,
  children,
  defaultOpen = false,
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  // 768px 이하에서만 접히도록, 데스크탑은 항상 열림
  const [open, setOpen] = React.useState(() => {
    if (typeof window === 'undefined') return true
    return window.innerWidth > 768 || defaultOpen
  })
  // 데스크탑에서는 toggle UI를 렌더하지 않음
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768

  if (!isMobile) return <>{children}</>

  return (
    <div>
      <button
        type="button"
        className="mobile-section-summary"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="mobile-section-chevron">{open ? '▾' : '▸'}</span>
        {title}
      </button>
      {open ? children : null}
    </div>
  )
}
```

**적용 대상 섹션 및 defaultOpen 값**:

| 섹션 | defaultOpen | 이유 |
|---|---|---|
| 협업 (SlipCollaborationPanel) | false | 조회 시 불필요, 필요할 때만 열기 |
| 버전 이력 | false | 감사용, 일반 조회 불필요 |
| 배송 · 정산 정보 (V20) | false | 대부분 비어있음 |
| 기사 정보 (배송) | false | 배송 전 단계에서만 필요 |
| 결재 정보 | true | 출고자/검수자 확인이 실무적으로 자주 필요 |
| 전자서명 정보 | false | 서명 완료 단계에서만 의미있음 |

**기대 효과**: 접힌 섹션들이 약 600-800px의 스크롤을 줄임. 사용자가 "기본 정보 → 전표 라인 → 결재 정보"만 빠르게 확인 가능.

**위험도**: 중간. MobileCollapsible 컴포넌트를 추가하면 테스트에서 섹션 내용에 data-testid로 접근하는 부분이 `open=false`일 때 DOM에 없어짐 → 기존 Playwright E2E에서 false-RED 가능. 구현 시 반드시 desktop viewport(1280px)로 테스트 실행하거나 `defaultOpen=true`로 놓은 채 실QA.

---

### P2-2. 전표 라인 테이블 — 모바일 카드형 렌더

**무엇을**: 현재 `slip-line-table`은 `min-width: 702px`(global.css line 456) + `overflow-x: auto`로 처리됨. 모바일에서는 가로 스크롤이 필요해 UX 저하. 라인을 카드형(키·값 목록)으로 전환.

**어디**: `clients/desktop/src/renderer/styles/global.css` + `SlipDetailPage.tsx`

**어떻게**:

JSX에서 모바일용 대안 렌더를 조건부로 추가한다.

```tsx
// SlipDetailPage.tsx line 1647 근처 — .slip-line-table-scroll 래퍼 전
<>
  {/* 데스크탑: 기존 테이블 유지 */}
  <div className="slip-line-table-scroll desktop-only">
    <table className="slip-line-table">...</table>
  </div>

  {/* 모바일: 카드형 라인 */}
  <div className="mobile-only slip-line-cards">
    {slip.lines.map((l, idx) => (
      <div key={l.id} className="slip-line-card">
        <div className="slip-line-card-header">
          <span className="slip-line-card-no">#{idx + 1}</span>
          <span className="slip-line-card-model">{l.modelName ?? '-'}</span>
          <input
            type="checkbox"
            aria-label={`${l.modelName ?? `라인 ${idx + 1}`} 재고조회 선택`}
            checked={checkedLineIds.has(l.id)}
            onChange={() => handleLineCheckToggle(l.id)}
          />
        </div>
        <div className="slip-line-card-body">
          <div className="slip-line-card-row">
            <span>품목명</span><span>{l.productName ?? '-'}</span>
          </div>
          <div className="slip-line-card-row">
            <span>수량</span><span>{l.quantity.toLocaleString()}</span>
          </div>
          <div className="slip-line-card-row slip-line-card-row--total">
            <span>합계(VAT포함)</span>
            <span>{(supplyVal + vatVal).toLocaleString()}</span>
          </div>
        </div>
      </div>
    ))}
  </div>
</>
```

```css
/* global.css */
@media (min-width: 769px) {
  .mobile-only { display: none; }
}
@media (max-width: 768px) {
  .desktop-only { display: none; }

  .slip-line-cards {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 8px;
  }
  .slip-line-card {
    background: var(--color-neutral-0);
    border: 1px solid var(--color-neutral-200);
    border-radius: 8px;
    overflow: hidden;
  }
  .slip-line-card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    background: var(--color-neutral-50);
    border-bottom: 1px solid var(--color-neutral-200);
  }
  .slip-line-card-no {
    font-size: 12px;
    font-weight: 700;
    color: var(--color-neutral-500);
    min-width: 24px;
  }
  .slip-line-card-model {
    flex: 1;
    font-size: 13px;
    font-weight: 600;
    color: var(--color-neutral-800);
  }
  .slip-line-card-body {
    padding: 8px 12px;
    display: flex;
    flex-direction: column;
    gap: 0;
  }
  .slip-line-card-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 5px 0;
    font-size: 13px;
    border-bottom: 1px solid var(--color-neutral-100);
  }
  .slip-line-card-row:last-child {
    border-bottom: none;
  }
  .slip-line-card-row > span:first-child {
    color: var(--color-neutral-500);
    font-size: 12px;
  }
  .slip-line-card-row > span:last-child {
    font-weight: 500;
    color: var(--color-neutral-800);
    font-variant-numeric: tabular-nums;
  }
  .slip-line-card-row--total {
    padding-top: 8px;
    margin-top: 2px;
    border-top: 1px solid var(--color-neutral-200);
  }
  .slip-line-card-row--total > span:last-child {
    font-size: 15px;
    font-weight: 700;
    color: var(--color-brand-700);
  }
}
```

**기대 효과**: 가로 스크롤 없이 라인 정보를 세로로 읽을 수 있음. 합계가 라인별로 즉시 보임. 체크박스 인터랙션 유지.

**위험도**: 중간. 두 개의 DOM 트리를 유지하므로 체크박스 state가 두 곳에서 동일하게 동작하는지 검증 필요. `supplyVal` 계산 로직을 카드형 렌더 안으로도 복제해야 함 — 공통 함수로 추출할 것.

---

### P2-3. 모바일 타이포그래피 스케일 조정

**무엇을**: 현재 `.detail-label`은 `var(--font-size-sm)`(14px 추정), `.detail-value`는 `var(--font-size-base)`(14px). 모바일에서 라벨은 더 작게, 값은 충분히 크게 대비를 줘야 스캔이 쉬워진다.

**어디**: `clients/desktop/src/renderer/styles/global.css`

**어떻게**:

```css
@media (max-width: 768px) {
  .detail-label {
    font-size: 11px; /* 기존 ~14px에서 축소 */
    color: var(--color-neutral-500);
    letter-spacing: 0.02em;
  }
  .detail-value {
    font-size: 14px; /* 기존 유지 또는 약간 확대 */
    font-weight: 500; /* 기존보다 약간 굵게 — 값 강조 */
  }
}
```

P1-2의 flex inline 레이아웃과 결합 시 라벨(11px 회색)·값(14px semibold)의 대비가 생겨 한눈에 스캔 가능.

**데스크탑 무회귀 여부**: @media 블록 → 완전 무회귀.

---

### P3-1. 하단 고정 액션 바 (모바일 전용)

**무엇을**: "전표 복사 | 삭제 | 완료(저장)" 하단 액션이 현재 스크롤 끝에 위치. 모바일에서 가장 자주 누르는 "완료" 버튼에 접근하려면 전체 스크롤이 필요.

**어디**: `clients/desktop/src/renderer/styles/global.css`

**어떻게**:

```css
@media (max-width: 768px) {
  .slip-detail-footer-actions {
    position: sticky;
    bottom: 0;
    bottom: max(0px, env(safe-area-inset-bottom));
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    border-top: 1px solid var(--color-neutral-200);
    padding: 10px 16px;
    margin: 0 calc(var(--space-4) * -1); /* app-main padding 상쇄 */
    z-index: 100;
    justify-content: space-between; /* 전표복사 왼쪽, 삭제+완료 오른쪽 */
  }
  .slip-detail-footer-actions .btn--primary {
    min-height: 44px;
    min-width: 100px;
    font-size: 15px;
    font-weight: 700;
  }
  /* sticky 이후 스크롤 하단 여백 확보 — 하단 바가 콘텐츠 가리지 않도록 */
  .slip-detail-scroll-pad {
    height: 80px;
  }
}
```

JSX에서 `.slip-detail-footer-actions` 다음에 `<div className="slip-detail-scroll-pad" aria-hidden="true" />` 를 추가한다.

**기대 효과**: 어느 위치에서도 "완료" 버튼을 즉시 터치 가능. 판매전표처럼 스크롤이 긴 페이지에서 사용자 경험을 크게 개선.

**위험도**: 낮음. `position: sticky`는 CSS만이므로 JS 변경 없음. 단, `overflow: hidden` 부모가 있으면 sticky가 깨진다. `app-main`이 `overflow: auto`(global.css line 106)이므로 sticky는 app-main 내에서 동작하며 정상 작동.

**데스크탑 무회귀 여부**: @media 블록 → 완전 무회귀.

---

### P3-2. ProgressBar — 모바일 compact 모드

**무엇을**: 판매전표 상세 캡처에서 전표 진행 단계 ProgressBar가 가로로 이어지는 스테퍼 형태로 화면 너비를 넘어가는 것이 확인된다(작은 원 5개 + 텍스트가 가로로 배치). 모바일에서는 현재 단계만 큰 텍스트로 표시하거나, 스텝 축약 표시.

**어디**: `clients/packages/design-system/src/components/ProgressBar/` (design-system 컴포넌트)

**어떻게**: ProgressBar 컴포넌트 내부에 `compact` prop을 추가하고, SlipDetailPage에서 모바일 viewport 시 `<ProgressBar currentStatus={slip.status} branchReason={branchReason} compact />` 로 호출.

compact 렌더:
```tsx
// ProgressBar 내부 (design-system)
if (compact) {
  return (
    <div className="progress-bar-compact">
      <span className="progress-bar-compact-step">
        {currentStepIndex + 1} / {STEPS.length}
      </span>
      <span className="progress-bar-compact-label">{currentStepLabel}</span>
    </div>
  )
}
```

단, ProgressBar 컴포넌트 파일 경로와 현재 구현을 먼저 Grep 확인 필요.

```css
/* design-system 또는 global.css (cascade) */
@media (max-width: 768px) {
  .progress-bar-compact {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--color-brand-50);
    border-radius: 8px;
    border: 1px solid var(--color-brand-200);
  }
  .progress-bar-compact-step {
    font-size: 11px;
    color: var(--color-brand-600);
    font-weight: 700;
    white-space: nowrap;
  }
  .progress-bar-compact-label {
    font-size: 14px;
    font-weight: 700;
    color: var(--color-brand-800);
  }
}
```

**기대 효과**: 5단계 스테퍼가 차지하는 높이 약 80px → 36px로 감소. 현재 단계가 더 크게 보임.

**위험도**: 중간. design-system 컴포넌트 변경이므로 다른 화면에서 ProgressBar를 쓰는 경우 영향 없음을 확인(compact prop은 opt-in).

---

## 3. 공용 패턴 요약 (Codex 구현용 체크리스트)

| 작업 | 파일 | 변경 유형 | 우선순위 | 데스크탑 위험 |
|---|---|---|---|---|
| 빈 필드 숨김 헬퍼 `MobileHideIfEmpty` + `.detail-grid-item-empty { display:none }` | SlipDetailPage.tsx + global.css | JSX + CSS | P1 | 없음 |
| `.detail-grid > div` flex inline + `.detail-label` / `.detail-value` 모바일 재정의 | global.css | CSS | P1 | 없음 (@media) |
| 섹션 헤더 `<h4>` → `.slip-section-header` div + 액센트 바 | SlipDetailPage.tsx + global.css | JSX + CSS | P1 | 낮음 (h4 선택자 없음 확인 후) |
| `detail-print-actions` 그룹 + 모바일 secondary row | SlipDetailPage.tsx + global.css | JSX + CSS | P1 | 없음 (@media) |
| `MobileCollapsible` 컴포넌트 + `mobile-section-summary` | SlipDetailPage.tsx + global.css | JSX + CSS | P2 | 낮음 (desktop always-open) |
| 전표 라인 `.slip-line-cards` 모바일 카드형 + `.desktop-only / .mobile-only` | SlipDetailPage.tsx + global.css | JSX + CSS | P2 | 중간 (체크박스 state 검증) |
| `.detail-label` 11px / `.detail-value` 14px semibold 모바일 | global.css | CSS | P2 | 없음 (@media) |
| `.slip-detail-footer-actions` sticky bottom + `.slip-detail-scroll-pad` | SlipDetailPage.tsx + global.css | CSS + JSX(pad div) | P3 | 없음 (@media, sticky 부모 확인) |
| ProgressBar compact prop | design-system ProgressBar + SlipDetailPage.tsx | 컴포넌트 prop | P3 | 낮음 (opt-in prop) |

### 적용 범위 — 다른 상세 페이지 자동 수혜

`.detail-grid`, `.detail-label`, `.detail-value`, `slip-detail-footer-actions`를 사용하는 모든 상세 페이지(견적 상세, 세금계산서 상세, 입고전표 상세, 주문 상세 등)가 P1-1·P1-2·P2-3·P3-1 개선을 자동으로 얻는다.

페이지별 특수 처리:
- **판매전표 SlipDetailPage**: 모든 개선 적용, MobileCollapsible 우선 적용 섹션 많음
- **견적 상세 EstimateDetailPage**: P1-2 인라인 레이아웃 자동 수혜. 품목 카드형 렌더는 별도 확인 (이미 카드형이므로 skip 가능)
- **세금계산서 상세 TaxInvoiceDetailPage**: 이미 카드형 라인 렌더 → P2-2 skip, 나머지 P1 적용

---

## 4. 구현 금지 사항

- 데스크탑(769px+) 레이아웃을 건드리는 변경 금지 — 모든 추가 CSS는 `@media (max-width: 768px)` 블록 안
- 기존 data-testid 속성 제거 금지 — MobileHideIfEmpty가 숨겨도 DOM에 남아있어야 E2E 통과
- `.detail-grid` 데스크탑 `grid-template-columns: repeat(auto-fit, minmax(220px, 1fr))` 변경 금지
- ProgressBar 기존 desktop 렌더 변경 금지 (compact prop opt-in만)
- 인쇄 페이지(`@media print` 블록, `.dispatch-page`, `.invoice-page`) 무관 — 이 스펙은 화면 뷰어 전용
