# 모바일 상세 화면 클린 재설계 Spec

작성일: 2026-06-25  
담당: Design Agent (SamhanLogis UI/UX)  
대상: `SalesPartnerOrderDetailPage`, `SlipDetailPage`, `EstimateDetailPage`  
데스크탑 무회귀 원칙: 모든 변경은 `@media (max-width: 768px)` 스코프 또는 조건부 클래스 — 769px 이상은 현행 유지

---

## 0. 근본 문제 진단 (실 캡처 기반)

### 주문서 (최악)

캡처 `docs/qa/mobile-s4c-detail-responsive/mobile-partner-order.png` 에서 확인된 결함:

1. **버튼 7개 난립**: "인쇄 / 수정 / 정식 편집 / 보류 / 판매전표 전환 / 삭제 / 목록"이 한 행에 flex-wrap으로 3줄에 걸쳐 표시. 상태에 따라 일부는 숨겨지지만 최악의 경우 7개.
2. **품목표 10열 1글자 뭉개짐**: `estTable`의 `white-space:nowrap` + `overflow:hidden` + `text-overflow:ellipsis`가 좁은 열에서 1글자("품", "모", "수"...)만 보이게 만드는 근본 원인. `table-layout:fixed`가 이를 강화.
3. **formGrid 모든 필드 나열**: 거래처코드·연결전표·배송지·현장·연락처·납기 6개가 순차 나열. 대부분 '-'(빈 값)인데도 공간 차지.

### 전표

캡처 `mobile-slip.png` 에서:

1. 상단 "거래명세서 출력 / 계산서 출력 / 판매전표 출력 / 수정 / 삭제" 버튼이 ProgressBar와 겹쳐 모호한 레이아웃.
2. 전표 진행단계(ProgressBar)는 원형 아이콘 5개가 모바일에서 너무 작아 터치 미스.
3. 전표 라인은 현재 `slip-line-cards`로 개선 시도했으나 실 캡처에서 여전히 좁은 카드.

### 견적서

캡처 `mobile-estimate.png` 에서:

1. DataTable이 수평 스크롤로 처리되어 라인 열이 가려짐.
2. 상단 헤더카드(날짜·배지)는 비교적 양호하지만 하단 버튼(편집·발송·전표변환·인쇄)이 가로 4개 나열.

---

## 1. 설계 원칙 (재확인)

| 원칙 | 설명 |
|---|---|
| 정보 과부하 제거 | 모바일 진입 즉시 보여야 할 것 = 번호·거래처·상태·합계금액 4개뿐 |
| 표 절대 금지 | 품목행은 `<table>` 구조 대신 카드(1품목 = 1카드) |
| 버튼 최대 2개 노출 | Primary 1개 + 더보기(...) 드로워 패턴 |
| 터치타깃 44px | 모든 버튼·체크박스·링크의 최소 터치 높이 |
| Progressive Disclosure | 보조 섹션(협업·이력·배송·결제)은 기본 접힘(아코디언) |
| 데스크탑 무회귀 | `@media (max-width:768px)` 블록만 수정, 769px 이상 코드 불변 |

---

## 2. 공통 모바일 레이아웃 구조 (와이어 텍스트)

```
┌─────────────────────────────────────────┐
│ [앱 헤더: 화면명]            [알림 아이콘] │
├─────────────────────────────────────────┤
│ ┌─ SUMMARY CARD (요약 카드) ───────────┐ │
│ │  2026/06/08-1983        [진행중]  │ │
│ │  대구HVAC솔루션                     │ │
│ │  ────────────────────────────────── │ │
│ │  합계        1,560,000 원          │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ [수정]  [전표 전환]  [...]              │  <- 액션 바 (최대 2+더보기)
│                                         │
│ ┌─ ITEM CARD (품목 카드 × N) ─────────┐ │
│ │  삼성 윈드프리 6평형                  │ │
│ │  AR06TXEAAWKNEU-02                  │ │
│ │  수량 1     납품가 720,000          │ │
│ │  소계       792,000 원             │ │
│ └─────────────────────────────────────┘ │
│ ┌─ ITEM CARD ─────────────────────────┐ │
│ │  ...                                │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ▶ 주문 상세 정보          [접힘, 터치↓] │  <- 아코디언
│ ▶ 버전 이력                            │
│ ▶ 협업·코멘트                          │
│ ▶ 수정 이력                            │
└─────────────────────────────────────────┘
```

---

## 3. 요약 카드 (Summary Card) 설계

### 표시 필드

| 항목 | 위치 | 타이포 |
|---|---|---|
| 전표번호 / 주문번호 | 좌상단 | 16px SemiBold, color-neutral-800 |
| 상태 배지 | 우상단 동일 행 | 12px Bold, 상태별 컬러칩 |
| 거래처명 | 2행 | 14px Regular, color-neutral-600 |
| 합계금액 | 하단 구분선 아래 | 22px Bold, color-brand-700 |
| 납기(주문)/전표일자(전표) | 합계 우측 | 12px Regular, color-neutral-500 |

### 상태 배지 컬러

| 상태 | 배경 | 텍스트 |
|---|---|---|
| 진행중(DRAFT) | #F3F4F6 | #4B5563 |
| 보류(ON_HOLD) | #FEF3C7 | #92400E |
| 전환됨(CONVERTED) | #EDE9FE | #5B21B6 |
| 완료(CONFIRMED) | #D1FAE5 | #065F46 |
| 취소(CANCELED) | #FEE2E2 | #991B1B |
| 작성중(QUOTE_DRAFT) | #F3F4F6 | #4B5563 |
| 수락(QUOTE_ACCEPTED) | #D1FAE5 | #065F46 |

### CSS 구조 (클래스명)

```css
/* global.css 또는 sales.module.css 내 @media (max-width:768px) 블록에 추가 */
.mobile-summary-card {
  background: #fff;
  border: 1px solid var(--color-neutral-200);
  border-radius: 16px;
  padding: 16px;
  margin-bottom: 12px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}
.mobile-summary-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 4px;
}
.mobile-summary-doc-no {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-neutral-800);
  font-variant-numeric: tabular-nums;
}
.mobile-summary-partner {
  font-size: 14px;
  color: var(--color-neutral-600);
  margin-bottom: 12px;
}
.mobile-summary-divider {
  height: 1px;
  background: var(--color-neutral-100);
  margin: 12px 0;
}
.mobile-summary-total-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.mobile-summary-total-amount {
  font-size: 22px;
  font-weight: 700;
  color: var(--color-brand-700, #1D4ED8);
  font-variant-numeric: tabular-nums;
}
.mobile-summary-date {
  font-size: 12px;
  color: var(--color-neutral-500);
}

/* 상태 배지 공통 (요약 카드 안) */
.mobile-status-badge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.4;
  flex-shrink: 0;
}
```

### 와이어 HTML 골격 (참조용, JSX 변환 대상)

```html
<div class="mobile-summary-card">
  <div class="mobile-summary-card-header">
    <span class="mobile-summary-doc-no">2026/06/08-1983</span>
    <span class="mobile-status-badge" style="background:#F3F4F6;color:#4B5563">진행중</span>
  </div>
  <div class="mobile-summary-partner">대구HVAC솔루션</div>
  <div class="mobile-summary-divider"></div>
  <div class="mobile-summary-total-row">
    <span class="mobile-summary-total-amount">1,560,000원</span>
    <span class="mobile-summary-date">납기 2026-06-15</span>
  </div>
</div>
```

---

## 4. 액션 바 (모바일 전용)

### 원칙

- Primary 액션 1개: 상태에 따라 가장 중요한 버튼 하나(수정, 판매전표 전환, 발송 등) — 44px 높이 full-width 또는 left-weight
- Secondary 최대 1개: 인쇄 또는 복사
- 나머지 전체: "더보기" 버튼(... 아이콘) → 바텀시트 또는 드로워

### 구조

```
┌────────────────────────────────────────────┐
│  [Primary: 수정 또는 전표 전환]  [인쇄] [...] │
└────────────────────────────────────────────┘
```

버튼 높이 = `min-height: 44px`  
Primary 버튼 = `flex: 1` (공간 차지)  
Secondary/더보기 = `flex: 0 0 auto`, `width: 44px`

### 주문서 상태별 Primary 버튼 매핑

| 상태 | Primary | Secondary | 더보기 포함 |
|---|---|---|---|
| DRAFT (canEdit) | 수정 | 인쇄 | 정식편집·보류·판매전표전환·삭제 |
| DRAFT (canConvert) | 판매전표 전환 | 인쇄 | 수정·보류·삭제 |
| ON_HOLD | 보류 해제 | 인쇄 | 삭제 |
| CONVERTED | (없음) | 인쇄 | - |
| CONFIRMED | (없음) | 인쇄 | - |

### CSS 클래스

```css
@media (max-width: 768px) {
  .mobile-action-bar {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
    align-items: stretch;
  }
  .mobile-action-primary {
    flex: 1;
    min-height: 44px;
    font-size: 15px;
    font-weight: 600;
    border-radius: 12px;
    border: none;
    background: var(--color-brand-600, #2563EB);
    color: #fff;
    cursor: pointer;
    font-family: inherit;
  }
  .mobile-action-icon {
    width: 44px;
    min-height: 44px;
    border-radius: 12px;
    border: 1px solid var(--color-neutral-200);
    background: #fff;
    font-size: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
  }
  /* 더보기 바텀시트 오버레이 */
  .mobile-more-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.35);
    z-index: 200;
  }
  .mobile-more-sheet {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: #fff;
    border-radius: 20px 20px 0 0;
    padding: 20px 0 32px;
    z-index: 201;
  }
  .mobile-more-sheet-item {
    display: block;
    width: 100%;
    padding: 16px 24px;
    text-align: left;
    font-size: 16px;
    font-weight: 500;
    border: none;
    background: transparent;
    cursor: pointer;
    font-family: inherit;
    color: var(--color-neutral-800);
    min-height: 52px;
    /* 터치타깃 44px 초과 확보 */
  }
  .mobile-more-sheet-item.danger {
    color: var(--color-danger-700, #991B1B);
  }
  .mobile-more-sheet-handle {
    width: 40px;
    height: 4px;
    background: var(--color-neutral-200);
    border-radius: 2px;
    margin: 0 auto 16px;
  }
}
```

### 구현 가이드 (Codex 대상)

`SalesPartnerOrderDetailPage` 의 현행 `<div className={styles['topActions']}>` 블록을 아래 패턴으로 교체:

```tsx
// 모바일 판별 hook (SlipDetailPage의 MobileCollapsible 패턴 재사용)
const isMobile = useIsMobile()  // window.innerWidth <= 768, resize listener

// 더보기 시트 state
const [moreOpen, setMoreOpen] = useState(false)

{isMobile ? (
  <div className="mobile-action-bar">
    {/* Primary: 상태 우선순위에 따라 단 1개 */}
    {canConvert && CONVERTIBLE_STATUS.has(query.data.status) ? (
      <button className="mobile-action-primary" onClick={...}>판매전표 전환</button>
    ) : canCollabEdit && !collabEditMode ? (
      <button className="mobile-action-primary" onClick={...}>수정</button>
    ) : null}
    {/* Secondary: 인쇄 */}
    {canPrint ? (
      <button className="mobile-action-icon" onClick={handlePrint} aria-label="인쇄">🖨</button>
    ) : null}
    {/* 더보기 */}
    <button className="mobile-action-icon" onClick={() => setMoreOpen(true)} aria-label="더보기">···</button>
    {moreOpen ? (
      <>
        <div className="mobile-more-overlay" onClick={() => setMoreOpen(false)} />
        <div className="mobile-more-sheet" role="dialog" aria-label="추가 액션">
          <div className="mobile-more-sheet-handle" />
          {canEdit ? <button className="mobile-more-sheet-item" onClick={...}>정식 편집</button> : null}
          {canEdit && query.data.status === 'DRAFT' ? <button className="mobile-more-sheet-item" onClick={...}>보류</button> : null}
          {canDelete ? <button className="mobile-more-sheet-item danger" onClick={...}>삭제</button> : null}
          <button className="mobile-more-sheet-item" onClick={() => { setMoreOpen(false); navigate('/sales/partner-orders') }}>목록으로</button>
        </div>
      </>
    ) : null}
  </div>
) : (
  // 데스크탑: 현행 topActions 블록 유지 (변경 없음)
  <div className={`${styles['topActions']} detail-action-bar`}>
    {/* ...현행 코드 그대로... */}
  </div>
)}
```

---

## 5. 품목 카드 컴포넌트 (핵심 — 표 대체)

### 5-1. 설계 근거

현행 `<table className={styles['estTable']}>` 는 `table-layout:fixed` + `white-space:nowrap`으로 10열을 고정폭 분할 → 모바일에서 각 열 폭이 30~40px 수준으로 줄어 텍스트 1자 표시. 모바일에서 가로 스크롤도 없으므로 완전 판독 불가.

해결: `@media (max-width:768px)` 에서 표를 숨기고(`display:none`) 동일 데이터를 카드로 렌더링.

### 5-2. 카드 1개 구조 (단일 품목)

```
┌───────────────────────────────────────────────┐
│  삼성 윈드프리 6평형              [진행중 배지] │  <- 품목명 (prominent) + 상태배지(선택)
│  AR06TXEAAWKNEU-02                            │  <- 모델명 (secondary)
│ ─────────────────────────────────────────────  │
│  수량    1              납품가  720,000        │  <- 핵심 2열
│  소계             792,000 원                  │  <- 합계 강조
│ [구성품 펼침 배지: 구성품 2개]  (부차, 작게)    │  <- 옵션 표시 (비어있으면 생략)
└───────────────────────────────────────────────┘
```

### 5-3. 표시 필드 우선순위

**항상 표시 (Primary)**:
- 품목명 (`productName`) — 16px SemiBold
- 모델명 (`modelCode` / `modelName`) — 13px Regular, color-neutral-500
- 수량 (`quantity`) — 라벨 "수량", 값 14px Medium
- 소계 (`subtotal` / `lineTotal`) — 라벨 "소계", 값 16px Bold, color-brand-700

**상황별 표시 (Secondary, 값이 의미 있을 때만)**:
- 납품가 / 단가VAT포함 — 값이 0 또는 소계와 동일하면 생략 가능
- 전환됨 수량 (`convertedQuantity`) — 0이면 생략, 있으면 "전환됨 N개" 칩
- 잔여 수량 — 전환됨이 있을 때만 표시

**생략 (모바일 제외 필드)**:
- 구분(categoryKey) — 모바일에서 불필요 (업무 컨텍스트)
- 구성품 펼침(`expandedComponents`) — 건수만 "구성품 2개" 요약 칩으로
- 창고(`warehouse`) — 전표 전환 시에만 필요, 전환 모달로 이동

### 5-4. CSS 클래스 정의

```css
/* sales.module.css 하단 또는 global.css @media 블록에 추가 */

/* 모바일: 기존 표 숨김 */
@media (max-width: 768px) {
  /* tableWrap 클래스가 붙은 div 안의 표 — 모바일에서 완전히 숨김 */
  .tableWrap table.estTable {
    display: none;
  }
  /* 모바일 품목 카드 목록 컨테이너 — 기본 데스크탑에서는 숨김 */
  .mobile-item-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
  }
}

@media (min-width: 769px) {
  .mobile-item-list {
    display: none;
  }
}

/* 품목 카드 기본 */
.mobile-item-card {
  background: #fff;
  border: 1px solid var(--color-neutral-200, #E5E7EB);
  border-radius: 14px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}

/* 카드 상단: 품목명 + 배지 행 */
.mobile-item-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}

/* 품목명 (가장 prominent) */
.mobile-item-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-neutral-800, #1F2937);
  line-height: 1.4;
  flex: 1;
  /* 2줄 말줄임 — 3줄 넘어가는 긴 이름 대비 */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* 모델명 (secondary) */
.mobile-item-model {
  font-size: 13px;
  color: var(--color-neutral-500, #6B7280);
  line-height: 1.3;
  font-variant-numeric: tabular-nums;
  word-break: break-all; /* 모델코드 줄바꿈 허용 */
}

/* 구분선 */
.mobile-item-divider {
  height: 1px;
  background: var(--color-neutral-100, #F3F4F6);
  margin: 0 -2px;
}

/* 수치 그리드: 수량·납품가·소계 등 */
.mobile-item-metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 16px;
}

/* 단일 메트릭 (라벨 + 값 세로) */
.mobile-item-metric {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mobile-item-metric-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-neutral-400, #9CA3AF);
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.mobile-item-metric-value {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-neutral-700, #374151);
  font-variant-numeric: tabular-nums;
}

/* 소계: 전체 폭 + 강조 */
.mobile-item-total-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 4px;
}

.mobile-item-total-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-neutral-500, #6B7280);
}

.mobile-item-total-value {
  font-size: 18px;
  font-weight: 700;
  color: var(--color-brand-700, #1D4ED8);
  font-variant-numeric: tabular-nums;
}

/* 하단 칩 영역 (전환됨·구성품 등 보조 정보) */
.mobile-item-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.mobile-item-chip {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  background: var(--color-neutral-100, #F3F4F6);
  color: var(--color-neutral-600, #4B5563);
}

.mobile-item-chip-converted {
  background: #EDE9FE;
  color: #5B21B6;
}

.mobile-item-chip-remaining {
  background: var(--color-warning-50, #FFFBEB);
  color: var(--color-warning-700, #92400E);
}

/* 재고조회 체크박스 — 카드 왼쪽 체크 (터치타깃 44px) */
.mobile-item-check-wrap {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.mobile-item-check {
  width: 22px;
  height: 22px;
  margin-top: 2px;
  flex-shrink: 0;
  cursor: pointer;
  /* iOS Safari 기본 스타일 override */
  -webkit-appearance: none;
  appearance: none;
  border: 2px solid var(--color-neutral-300, #D1D5DB);
  border-radius: 6px;
  background: #fff;
}

.mobile-item-check:checked {
  background: var(--color-brand-600, #2563EB);
  border-color: var(--color-brand-600, #2563EB);
}
```

### 5-5. JSX 구조 (Codex 구현 가이드)

`SalesPartnerOrderDetailPage` 의 `<div className={styles['tableWrap']}>` 블록 직후에 형제 요소로 삽입:

```tsx
{/* 모바일 품목 카드 목록 — 데스크탑에서는 CSS로 숨김(display:none) */}
<div className="mobile-item-list">
  {(query.data.lines ?? []).map((line, index) => {
    const converted = line.convertedQuantity ?? 0
    const remaining = line.quantity - converted
    const checked = checkedLineIds.has(line.lineId)

    return (
      <div
        key={`mobile-${line.lineId}-${index}`}
        className="mobile-item-card"
      >
        {/* 체크박스 + 카드 본문 */}
        <div className="mobile-item-check-wrap">
          <input
            type="checkbox"
            className="mobile-item-check"
            aria-label={`${line.productName} 재고조회 선택`}
            checked={checked}
            onChange={() => {
              setCheckedLineIds((prev) => {
                const next = new Set(prev)
                if (next.has(line.lineId)) next.delete(line.lineId)
                else next.add(line.lineId)
                return next
              })
            }}
          />
          <div style={{ flex: 1 }}>
            {/* 헤더: 품목명 */}
            <div className="mobile-item-name">{line.productName}</div>
            {/* 모델명 */}
            {line.modelCode ? (
              <div className="mobile-item-model">{line.modelCode}</div>
            ) : null}
          </div>
        </div>

        <div className="mobile-item-divider" />

        {/* 핵심 메트릭: 수량 + 납품가 */}
        <div className="mobile-item-metrics">
          <div className="mobile-item-metric">
            <span className="mobile-item-metric-label">수량</span>
            <span className="mobile-item-metric-value">{line.quantity}</span>
          </div>
          <div className="mobile-item-metric">
            <span className="mobile-item-metric-label">납품가</span>
            <span className="mobile-item-metric-value">{krw(line.deliveryPrice)}</span>
          </div>
        </div>

        {/* 소계 강조 */}
        <div className="mobile-item-total-row">
          <span className="mobile-item-total-label">소계</span>
          <span className="mobile-item-total-value">{krw(line.subtotal)} 원</span>
        </div>

        {/* 보조 칩: 전환됨·잔여·구성품 */}
        {(converted > 0 || line.expandedComponents.length > 0) ? (
          <div className="mobile-item-chips">
            {converted > 0 ? (
              <span className="mobile-item-chip mobile-item-chip-converted">
                전환됨 {converted}개
              </span>
            ) : null}
            {converted > 0 && remaining > 0 ? (
              <span className="mobile-item-chip mobile-item-chip-remaining">
                잔여 {remaining}개
              </span>
            ) : null}
            {line.expandedComponents.length > 0 ? (
              <span className="mobile-item-chip">
                구성품 {line.expandedComponents.length}개
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    )
  })}
</div>
```

---

## 6. 보조 섹션 — 아코디언 (Progressive Disclosure)

### 6-1. 섹션 목록 및 기본 상태

| 섹션 | 기본 상태 | 이유 |
|---|---|---|
| 주문 상세 정보 (거래처코드·배송지·현장·연락처·납기·요청사항) | 기본 접힘 | 요약 카드에서 주요 정보 확인 완료 |
| 버전 이력 | 기본 접힘 | 조회 빈도 낮음 |
| 협업·코멘트 | 기본 펼침 | 업무 협업 흐름상 자주 사용 |
| 수정 이력 | 기본 접힘 | 감사 목적, 일상적 미사용 |

### 6-2. 아코디언 CSS (현행 MobileCollapsible 컴포넌트 활용)

현행 `global.css`에 이미 `.mobile-section-accordion`, `.mobile-section-summary`, `.mobile-section-body`가 정의되어 있음. `SlipDetailPage`의 `MobileCollapsible` 컴포넌트를 `SalesPartnerOrderDetailPage`와 `EstimateDetailPage`에도 동일하게 적용.

추가 스타일 보강:

```css
@media (max-width: 768px) {
  /* 섹션 카드 컨테이너 (아코디언 래퍼) */
  .mobile-section-card {
    background: #fff;
    border: 1px solid var(--color-neutral-200);
    border-radius: 14px;
    margin-bottom: 10px;
    overflow: hidden;
  }

  /* 섹션 헤더 버튼: 48px 높이로 터치타깃 확보 */
  .mobile-section-card .mobile-section-summary {
    min-height: 48px;
    padding: 0 16px;
    font-size: 14px;
    font-weight: 600;
    color: var(--color-neutral-700);
    background: #FAFAFA;
    border: none;
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    cursor: pointer;
  }

  .mobile-section-card .mobile-section-summary::after {
    content: '열기';
    font-size: 12px;
    color: var(--color-neutral-400);
    font-weight: 600;
  }

  .mobile-section-card .mobile-section-summary[aria-expanded='true']::after {
    content: '접기';
  }

  .mobile-section-card .mobile-section-body {
    padding: 12px 16px 16px;
    border-top: 1px solid var(--color-neutral-100);
  }

  /* 섹션 내부 필드: 라벨-값 인라인 배치 */
  .mobile-field-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 8px 0;
    border-bottom: 1px solid var(--color-neutral-50, #F9FAFB);
    gap: 12px;
  }

  .mobile-field-row:last-child {
    border-bottom: none;
  }

  .mobile-field-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--color-neutral-400);
    flex-shrink: 0;
    min-width: 64px;
  }

  .mobile-field-value {
    font-size: 14px;
    color: var(--color-neutral-700);
    text-align: right;
    word-break: break-all;
  }

  .mobile-field-value-empty {
    color: var(--color-neutral-300);
  }
}
```

### 6-3. 주문서 상세 정보 섹션 JSX (예시)

현행 `<div className={styles['formGrid']}>` 블록을 모바일에서 아코디언으로 대체:

```tsx
{isMobile ? (
  <div className="mobile-section-card">
    <MobileCollapsible title="주문 상세 정보" defaultOpen={false}>
      <div>
        {[
          { label: '거래처 코드', value: query.data.partnerCode },
          { label: '연결 전표', value: query.data.linkedSlipNo ?? '-' },
          { label: '배송지', value: query.data.deliveryAddress ?? '-' },
          { label: '현장', value: query.data.siteAddress ?? '-' },
          { label: '연락처', value: query.data.contactPhone ?? '-' },
          { label: '납기', value: query.data.dueDate ?? '-' },
          ...(query.data.memo ? [{ label: '요청사항', value: query.data.memo }] : []),
        ].map(({ label, value }) => (
          <div key={label} className="mobile-field-row">
            <span className="mobile-field-label">{label}</span>
            <span className={`mobile-field-value${value === '-' ? ' mobile-field-value-empty' : ''}`}>
              {value}
            </span>
          </div>
        ))}
      </div>
    </MobileCollapsible>
  </div>
) : (
  // 데스크탑: 현행 formGrid 유지
  <div className={styles['formGrid']}>...</div>
)}
```

---

## 7. 전표 상세 (SlipDetailPage) 모바일 적용

### 7-1. 현황과 개선 방향

전표는 현행 `slip-line-cards`(전표 라인 카드) 패턴이 이미 일부 적용됨(`global.css` 655-670줄). 그러나 요약 카드와 액션 바 미적용 상태.

### 7-2. 요약 카드 (전표 전용)

요약 카드 표시 필드:

| 항목 | 값 | 타이포 |
|---|---|---|
| 전표번호 | `slipDate / seqNo` 슬래시 형식 | 16px SemiBold |
| 진행 상태 | ProgressBar 대신 상태 배지 1개 | mobile-status-badge |
| 거래처명 | `slip.partnerName` | 14px Regular |
| 전표일자 | `slip.slipDate` | 12px Regular |
| 합계 | 라인 소계 합산 | 22px Bold |

모바일에서 `<ProgressBar>` 는 기본 5단계 원형 UI → 좁은 화면에서 원이 10px 이하로 축소됨.

해결: `@media (max-width:768px)` 에서 ProgressBar를 `display:none` 처리, 요약 카드의 상태 배지가 대체.

```css
@media (max-width: 768px) {
  /* ProgressBar 컴포넌트 모바일 숨김 — 상태 배지로 대체 */
  .progress-bar-container {
    display: none;
  }
}
```

(주의: `ProgressBar` 컴포넌트가 `progress-bar-container` 클래스를 루트에 적용하지 않는 경우, 래퍼 div에 해당 클래스를 추가하여 선택자 확보)

### 7-3. 전표 라인 카드 (출고전표 기준)

현행 `slip-line-cards` 클래스의 카드에 추가 표시 필드:

**표시 (Primary)**:
- 품목명 (`productName`) — 15px SemiBold
- 모델명 (`modelName`) — 13px, neutral-500
- 수량 — "수량" 라벨
- 단가(VAT포함) (`unitPriceWithVat`) — "단가" 라벨
- 합계(VAT포함) (`supply + vat`) — "합계" 18px Bold

**생략 (모바일)**:
- 규격(`specification`) — 빈 값이 대부분, 아코디언으로 이동
- 공급가액(`supplyAmount`) — 합계로 대체
- 부가세(`vatAmount`) — 합계로 대체

전표 라인 카드 CSS는 `§5-4`의 `.mobile-item-card` 패턴을 그대로 재사용. 전표 전용으로 다른 점은 소계 레이블을 "합계(VAT포함)"으로 변경.

### 7-4. 전표 액션 바 (상태별)

| 상태 | Primary | Secondary | 더보기 |
|---|---|---|---|
| DRAFT | 저장 | 거래명세서 출력 | 계산서출력·전표출력·삭제·수정 |
| SAVED | 전송 | 거래명세서 출력 | 계산서출력·전표출력·삭제 |
| SENT | 수락 | - | 반려·취소 |
| COMPLETED | 배송 시작 | - | - |
| CONFIRMED | (없음) | 거래명세서 출력 | 계산서출력·전표출력 |

---

## 8. 견적서 상세 (EstimateDetailPage) 모바일 적용

### 8-1. 현황과 개선 방향

견적서는 `DataTable` 컴포넌트를 사용하여 라인을 렌더링. `DataTable`은 내부적으로 `<table>` 구조로 모바일에서 동일하게 뭉개짐.

개선: `@media (max-width:768px)` 에서 DataTable의 테이블 요소를 숨기고 품목 카드 패턴 적용.

### 8-2. 견적서 품목 카드

표시 필드 (견적서 전용):

**Primary**:
- 품목명 (`productName`)
- 모델명 (`modelName`)
- 수량 (`quantity`)
- 단가VAT포함 (`unitPriceWithVat`)
- 소계 (`supply + vat`) = "합계(VAT포함)" 강조

**Secondary (칩으로)**:
- 규격 — 값이 있을 때만 회색 칩
- 공급가액 / 부가세 — "공급 720,000 / 부가세 72,000" 작은 텍스트 1줄

```
┌──────────────────────────────────────────────┐
│  삼성 윈드프리 6평형                           │
│  AR06TXEAAWKNEU-02                           │
│ ──────────────────────────────────────────── │
│  수량    1              단가  720,000         │
│  공급 720,000 · 부가세 72,000    (12px muted) │
│  합계(VAT포함)              792,000 원        │
└──────────────────────────────────────────────┘
```

### 8-3. 견적서 액션 바

| 상태 | Primary | Secondary | 더보기 |
|---|---|---|---|
| QUOTE_DRAFT | 발송 | 편집 | 인쇄 |
| QUOTE_SENT | 전표 변환 | - | 인쇄·거절 |
| QUOTE_ACCEPTED | 전표 변환 | 인쇄 | - |
| QUOTE_REJECTED | (없음) | 인쇄 | - |
| QUOTE_CONVERTED | (없음) | 인쇄 | - |

---

## 9. 공통 모바일 CSS 추가 블록 (global.css 추가 위치)

현행 `global.css` 의 `@media (max-width: 768px)` 블록들 이후, `@media print` 블록 이전에 아래 블록을 추가:

```css
/* ================================================================
 * 모바일 상세 화면 클린 재설계 — 2026-06-25
 * 대상: SalesPartnerOrderDetailPage / SlipDetailPage / EstimateDetailPage
 * 모든 규칙은 @media (max-width:768px) 스코프 — 데스크탑 무회귀
 * ================================================================ */

@media (max-width: 768px) {

  /* ------- 타이포그래피 기준 ------- */
  /* 본문: 14px Regular (Pretendard) */
  /* 섹션제목: 16px SemiBold */
  /* 라벨: 12px SemiBold, neutral-400, uppercase */
  /* 금액: 18~22px Bold, brand-700 */

  /* ------- 간격 기준 ------- */
  /* 카드 padding: 14px 16px */
  /* 카드 gap (목록): 10px */
  /* 섹션 gap: 12px */
  /* 필드 row padding: 8px 0 */

  /* ------- 요약 카드 ------- */
  .mobile-summary-card { ... }          /* §3 정의 */
  .mobile-summary-card-header { ... }
  .mobile-summary-doc-no { ... }
  .mobile-summary-partner { ... }
  .mobile-summary-divider { ... }
  .mobile-summary-total-row { ... }
  .mobile-summary-total-amount { ... }
  .mobile-summary-date { ... }
  .mobile-status-badge { ... }

  /* ------- 액션 바 ------- */
  .mobile-action-bar { ... }            /* §4 정의 */
  .mobile-action-primary { ... }
  .mobile-action-icon { ... }
  .mobile-more-overlay { ... }
  .mobile-more-sheet { ... }
  .mobile-more-sheet-item { ... }
  .mobile-more-sheet-item.danger { ... }
  .mobile-more-sheet-handle { ... }

  /* ------- 품목 카드 ------- */
  .mobile-item-list { ... }             /* §5-4 정의 */
  .mobile-item-card { ... }
  .mobile-item-card-header { ... }
  .mobile-item-name { ... }
  .mobile-item-model { ... }
  .mobile-item-divider { ... }
  .mobile-item-metrics { ... }
  .mobile-item-metric { ... }
  .mobile-item-metric-label { ... }
  .mobile-item-metric-value { ... }
  .mobile-item-total-row { ... }
  .mobile-item-total-label { ... }
  .mobile-item-total-value { ... }
  .mobile-item-chips { ... }
  .mobile-item-chip { ... }
  .mobile-item-chip-converted { ... }
  .mobile-item-chip-remaining { ... }
  .mobile-item-check-wrap { ... }
  .mobile-item-check { ... }

  /* ------- 아코디언 섹션 카드 ------- */
  .mobile-section-card { ... }          /* §6-2 정의 */
  .mobile-field-row { ... }
  .mobile-field-label { ... }
  .mobile-field-value { ... }
  .mobile-field-value-empty { ... }

  /* ------- 데스크탑 전용 요소 모바일 숨김 ------- */
  /* 기존 formGrid (주문서) — 모바일에서 아코디언으로 대체 */
  .detail-mobile-hide {
    display: none !important;
  }
  /* ProgressBar — 상태 배지로 대체 */
  .progress-bar-container {
    display: none;
  }
  /* 라인 표 (estTable) — 품목 카드로 대체 */
  .tableWrap table.estTable {
    display: none;
  }
  /* detail-action-bar (데스크탑 버튼 행) — 모바일 액션 바로 대체 */
  .detail-action-bar {
    display: none !important;
  }
}

@media (min-width: 769px) {
  /* 모바일 전용 요소 — 데스크탑에서 숨김 */
  .mobile-summary-card,
  .mobile-action-bar,
  .mobile-item-list,
  .mobile-more-overlay,
  .mobile-more-sheet {
    display: none !important;
  }
}
```

---

## 10. 페이지별 적용 우선순위 및 Codex 구현 지시

### 구현 순서

1. **1순위 — SalesPartnerOrderDetailPage (주문서)**: 가장 심각. 품목 표 판독 불가 + 버튼 7개 난립. 이 페이지 완료 시 개선 효과 즉시 체감.
2. **2순위 — SlipDetailPage (전표)**: 부분 개선 필요. ProgressBar 모바일 처리 + 요약 카드 추가.
3. **3순위 — EstimateDetailPage (견적서)**: DataTable 교체.

### 공통 Hook 추출 (재사용)

`SlipDetailPage` 내 `MobileCollapsible` 컴포넌트를 별도 파일로 분리:

```
clients/desktop/src/renderer/hooks/useIsMobile.ts
clients/desktop/src/renderer/components/common/MobileCollapsible.tsx
```

`useIsMobile`:
```ts
import { useEffect, useState } from 'react'
export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= breakpoint
  )
  useEffect(() => {
    const handle = () => setIsMobile(window.innerWidth <= breakpoint)
    window.addEventListener('resize', handle)
    return () => window.removeEventListener('resize', handle)
  }, [breakpoint])
  return isMobile
}
```

---

## 11. 데스크탑 무회귀 검증 체크리스트 (QA 대상)

Codex 구현 완료 후 QA agent가 아래를 검증:

| 항목 | 기준 |
|---|---|
| 1280px 이상 — 주문서 formGrid | 현행 2열 그리드 유지 |
| 1280px 이상 — 주문서 품목표 | 현행 10열 estTable 정상 표시 |
| 1280px 이상 — 버튼 | 현행 topActions flex 행 유지 |
| 1280px 이상 — 전표 ProgressBar | 정상 표시 |
| 375px (iPhone SE) — 주문서 | 요약 카드 + 품목 카드만 표시, 표 없음 |
| 375px — 버튼 | Primary 1개 + 아이콘 2개(인쇄·더보기) |
| 375px — 품목명 | 전체 텍스트 2줄 이내 표시, 잘림 없음 |
| 375px — 소계 | 22px bold 금액 우측 표시 |
| 375px — 더보기 시트 | 바텀시트 열림·닫힘 정상 |
| 375px — 터치타깃 | 모든 버튼 min-height 44px |
| 375px — 아코디언 | 기본 접힘 → 터치 → 내용 표시 |
| 375px — 수정이력·협업 | 아코디언 정상 |

---

## 12. 설계 결정 로그

| 결정 | 이유 | 대안 제외 이유 |
|---|---|---|
| 표 대신 카드 | 10열을 375px에 배치 불가(1자 뭉개짐 근본 원인) | 가로 스크롤: 스크롤 방향 혼재로 UX 혼란 |
| 바텀시트 더보기 | 버튼 7개 → 모바일 터치 비효율 제거 | 드롭다운 메뉴: 터치 타깃 확보 어려움 |
| ProgressBar 숨김(배지 대체) | 5단계 원형 UI가 375px에서 원 10px 이하 | 텍스트 축소: 가독성 포기 |
| 아코디언 기본 접힘 (상세정보) | 요약 카드가 핵심 정보 커버 | 기본 펼침: 초기 스크롤 과다 |
| 협업 기본 펼침 | 일상 업무 흐름상 코멘트 확인이 주요 동선 | 기본 접힘: 클릭 추가로 업무 마찰 |
| CSS @media만 사용, JS 최소 | 데스크탑 무회귀 보장 | CSS-in-JS: 기존 sales.module.css 패턴 불일치 |
