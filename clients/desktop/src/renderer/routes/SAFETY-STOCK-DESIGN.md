# P1-3 안전재고 알림 UI 디자인 가이드

> branch: `feature/p1-3-safety-stock-alerts-ui`
> 작성일: 2026-05-11
> 담당: Designer (SamhanLogis 디자인 시스템 기준)

---

## 0. 원칙

- **raw hex 금지**: 모든 색상은 design-system CSS 변수 토큰만 사용.
- **UUID 비공개**: 화면 어디에도 UUID 노출 금지. 식별자는 `productCode` / `warehouseCode` / `productName` 등 비즈니스 키만 표시 (`feedback_uuid_no_user_visibility.md`).
- **Role 풀네임**: `MASTER` / `MANAGER` / `WAREHOUSE` 등 — 약어 금지.
- **Pretendard 9 weight 자동 상속**: `body { font-family: var(--font-family-sans) }` 선언으로 전체 화면 자동 적용.
- **한국어 타이포**: 본문 14px Regular / 헤더 18px SemiBold / 서브헤더 16px Medium.
- **이카운트 참조**: `docs/migration/ecount-reference/` 16 캡처 — 재고 조회/알림 화면 필드 구성 준용.
- **인쇄 양식 반복 정정**: 인쇄 산출물 없음 (알림 전용 화면). 단, iteration 가드는 2차 FE mock 이후 Edge 캡처 의무 준수.

---

## 1. 화면 구성 개요

| 화면 / 컴포넌트 | 설명 | 섹션 |
|---|---|---|
| `SafetyStockAlertsPage` | 안전재고 미달 품목 전체 목록 | §2 |
| `UrgencyBadge` | 긴급도 4단계 Badge | §3 |
| 헤더 알림 배지 (count chip) | AppLayout 헤더 우측 — 미달 품목 수 | §4 |
| 임계값 설정 input | 제품 상세 페이지 (ProductDetailPage) 하단 섹션 | §5 |

---

## 2. SafetyStockAlertsPage

### 2.1 전체 레이아웃 ASCII Mockup

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  안전재고 알림                                       [엑셀 내보내기]              │
│  ─────────────────────────────────────────────────────────────────────────────── │
│  창고 [전체 ▼]   긴급도 [전체 ▼]   [🔍 제품코드 / 제품명 검색...]               │
│  ─────────────────────────────────────────────────────────────────────────────── │
│                                                                                  │
│  ┌──────────────┬──────────┬──────────┬──────────┬──────────┬──────────────┐    │
│  │ 제품코드     │ 제품명   │ 현재재고  │ 임계값   │ 부족수량  │ 긴급도       │    │
│  ├──────────────┼──────────┼──────────┼──────────┼──────────┼──────────────┤    │
│  │ AHU-220V-4HP │ 에어핸들… │      0   │    10    │    10    │ ● CRITICAL   │    │
│  │ FCU-380V-6HP │ 팬코일…  │      5   │    20    │    15    │ ● DANGER     │    │
│  │ AHU-110V-2HP │ 소형에어… │     16   │    30    │    14    │ ● WARNING    │    │
│  │ CHW-220V-3HP │ 냉수코일… │     50   │    60    │    10    │ ● NOTICE     │    │
│  └──────────────┴──────────┴──────────┴──────────┴──────────┴──────────────┘    │
│                                                              총 4건               │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 페이지 헤더

```
┌────────────────────────────────────────────────────────────────┐
│ [h1] 안전재고 알림                      [엑셀 내보내기]         │
└────────────────────────────────────────────────────────────────┘
```

| 요소 | 내용 | 스펙 |
|---|---|---|
| 페이지 제목 | "안전재고 알림" | `font-size: var(--font-page-title)` (24px) / `font-weight: var(--font-weight-semibold)` |
| 엑셀 내보내기 버튼 | `variant="secondary"` | 우측 정렬 / `data-testid="safety-stock-export-button"` |

### 2.3 필터 바 구성

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  창고 [전체 ▼]     긴급도 [전체 ▼]     [검색 아이콘 제품코드 / 제품명 입력]  │
└──────────────────────────────────────────────────────────────────────────────┘
```

| 필터 요소 | 종류 | data-testid | 비고 |
|---|---|---|---|
| 창고 선택 | `<select>` | `safety-stock-filter-warehouse` | 옵션: 전체 + 창고 목록 (warehouseCode + 이름) |
| 긴급도 선택 | `<select>` | `safety-stock-filter-urgency` | 옵션: 전체 / CRITICAL / DANGER / WARNING / NOTICE |
| 검색 input | `<input type="text">` | `safety-stock-search-input` | placeholder: "제품코드 / 제품명 입력" / 300ms debounce |

#### 필터 바 CSS spec

```css
.safety-stock-filter-bar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4) 0;
  flex-wrap: wrap;
}

.safety-stock-filter-bar select,
.safety-stock-filter-bar input[type="text"] {
  height: 36px;
  padding: 0 var(--space-3);
  border: 1px solid var(--line-default);
  border-radius: var(--radius-input);
  font-size: var(--font-size-sm);
  font-family: var(--font-family-sans);
  color: var(--ink-primary);
  background: var(--surface-card);
}

.safety-stock-filter-bar select {
  min-width: 120px;
  cursor: pointer;
}

.safety-stock-filter-bar input[type="text"] {
  min-width: 240px;
}

.safety-stock-filter-bar select:focus,
.safety-stock-filter-bar input[type="text"]:focus {
  outline: none;
  border-color: var(--line-focus);
  box-shadow: 0 0 0 2px var(--action-brand-subtle);
}
```

### 2.4 테이블 컬럼 구성

| 컬럼 인덱스 | 헤더 | 데이터 필드 | 너비 | 정렬 | 비고 |
|---|---|---|---|---|---|
| 1 | 제품코드 | `productCode` | `160px` | left | 읽기 전용 — 비즈니스 식별자 |
| 2 | 제품명 | `productName` | `flex 1` | left | 긴 이름 `text-overflow: ellipsis` |
| 3 | 현재재고 | `currentStock` | `100px` | right | `font-variant-numeric: tabular-nums` — 0이면 `var(--state-danger)` 컬러 |
| 4 | 임계값 | `thresholdQty` | `100px` | right | `font-variant-numeric: tabular-nums` |
| 5 | 부족수량 | `shortageQty` | `100px` | right | `thresholdQty - currentStock` — `font-variant-numeric: tabular-nums` / 항상 `var(--state-danger)` |
| 6 | 창고 | `warehouseName` | `140px` | left | warehouseCode 는 미노출 |
| 7 | 긴급도 | `urgencyLevel` | `130px` | center | `<UrgencyBadge>` 컴포넌트 |

> 컬럼 순서: 제품코드 → 제품명 → 현재재고 → 임계값 → 부족수량 → 창고 → 긴급도

### 2.5 테이블 ASCII Mockup

```
┌──────────────┬────────────────┬──────────┬──────────┬──────────┬──────────────┬──────────────┐
│ 제품코드      │ 제품명          │ 현재재고  │ 임계값   │ 부족수량  │ 창고          │ 긴급도       │
├──────────────┼────────────────┼──────────┼──────────┼──────────┼──────────────┼──────────────┤
│ AHU-220V-4HP │ 에어핸들링유닛  │        0 │       10 │       10 │ 서울 본창고   │ ● CRITICAL   │
├──────────────┼────────────────┼──────────┼──────────┼──────────┼──────────────┼──────────────┤
│ FCU-380V-6HP │ 팬코일유닛      │        5 │       20 │       15 │ 부산 물류센터 │ ● DANGER     │
├──────────────┼────────────────┼──────────┼──────────┼──────────┼──────────────┼──────────────┤
│ AHU-110V-2HP │ 소형에어핸들러  │       16 │       30 │       14 │ 서울 본창고   │ ● WARNING    │
├──────────────┼────────────────┼──────────┼──────────┼──────────┼──────────────┼──────────────┤
│ CHW-220V-3HP │ 냉수코일유닛    │       50 │       60 │       10 │ 대구 물류창고 │ ● NOTICE     │
└──────────────┴────────────────┴──────────┴──────────┴──────────┴──────────────┴──────────────┘
                                                                                총 4건
```

### 2.6 테이블 CSS spec

```css
.safety-stock-table-wrapper {
  overflow-x: auto;
  border: 1px solid var(--line-default);
  border-radius: var(--radius-card);
}

.safety-stock-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 900px;
}

.safety-stock-table thead th {
  background: var(--color-neutral-50);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--ink-secondary);
  padding: var(--space-2) var(--space-3);
  text-align: left;
  border-bottom: 1px solid var(--line-default);
  height: var(--row-h-thead);
  white-space: nowrap;
  user-select: none;
}

.safety-stock-table thead th:nth-child(3),
.safety-stock-table thead th:nth-child(4),
.safety-stock-table thead th:nth-child(5) {
  text-align: right;
}

.safety-stock-table thead th:nth-child(7) {
  text-align: center;
}

/* 정렬 가능 헤더 */
.safety-stock-table thead th[aria-sort] {
  cursor: pointer;
}

.safety-stock-table thead th[aria-sort]:hover {
  background: var(--color-neutral-100);
}

/* 본문 행 */
.safety-stock-row {
  background: var(--surface-card);
  transition: background var(--duration-fast);
  cursor: pointer;
}

.safety-stock-row:hover {
  background: var(--surface-hover);
}

.safety-stock-row td {
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--line-default);
  vertical-align: middle;
  height: var(--row-h);
  font-size: var(--font-size-sm);
  color: var(--ink-primary);
}

/* 마지막 행 하단 border 제거 */
.safety-stock-row:last-child td {
  border-bottom: none;
}

/* 현재재고 = 0 강조 */
.safety-stock-cell-zero {
  color: var(--state-danger) !important;
  font-weight: var(--font-weight-semibold);
}

/* 부족수량 셀 — 항상 danger 색상 */
.safety-stock-cell-shortage {
  color: var(--state-danger);
  font-weight: var(--font-weight-medium);
  font-variant-numeric: tabular-nums;
}

/* 숫자 셀 공통 */
.safety-stock-cell-num {
  font-variant-numeric: tabular-nums;
  text-align: right;
}

/* 제품명 ellipsis */
.safety-stock-cell-name {
  max-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 총 건수 표시 */
.safety-stock-count-row {
  display: flex;
  justify-content: flex-end;
  padding: var(--space-2) var(--space-3);
  font-size: var(--font-size-xs);
  color: var(--ink-secondary);
  border-top: 1px solid var(--line-default);
}
```

### 2.7 빈 상태 (Empty State)

재고 부족 품목이 없는 정상 상태:

```
┌────────────────────────────────────────┐
│                                        │
│   ✓  안전재고 미달 품목이 없습니다.     │
│      모든 품목의 재고가 임계값          │
│      이상입니다.                        │
│                                        │
└────────────────────────────────────────┘
```

```css
.safety-stock-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-16) var(--space-6);
  gap: var(--space-3);
  color: var(--ink-tertiary);
  font-size: var(--font-size-sm);
  text-align: center;
}

.safety-stock-empty-icon {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-full);
  background: var(--state-success-bg);
  color: var(--state-success);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
}
```

### 2.8 행 클릭 동작

행 클릭 → 해당 제품의 상세 페이지 이동 (`/products/{productCode}`). UUID 는 URL 에 미포함.

### 2.9 data-testid 전체 목록

| data-testid | 요소 | 조건 |
|---|---|---|
| `safety-stock-alerts-page` | 페이지 루트 `<div>` | 항상 |
| `safety-stock-filter-warehouse` | 창고 `<select>` | 항상 |
| `safety-stock-filter-urgency` | 긴급도 `<select>` | 항상 |
| `safety-stock-search-input` | 검색 `<input>` | 항상 |
| `safety-stock-export-button` | 엑셀 내보내기 `<button>` | 항상 |
| `safety-stock-table` | `<table>` | 항상 |
| `safety-stock-row-{productCode}` | 각 행 `<tr>` | 행별 — productCode 사용 (UUID 미사용) |
| `safety-stock-badge-{productCode}` | 긴급도 Badge | 행별 |
| `safety-stock-empty` | 빈 상태 `<div>` | 건수 = 0 |
| `safety-stock-count` | 총 건수 표시 | 항상 |

---

## 3. UrgencyBadge (긴급도 Badge)

### 3.1 긴급도 4단계 정의

긴급도는 **재고 충족률** (`currentStock / thresholdQty × 100`) 기준으로 산정.

| 긴급도 레벨 | 조건 | 레이블 | 의미 |
|---|---|---|---|
| `CRITICAL` | 충족률 = 0% (`currentStock === 0`) | ● CRITICAL | 재고 완전 소진 — 즉시 발주 필요 |
| `DANGER` | 충족률 1% 이상 50% 미만 (`0 < rate < 50`) | ● DANGER | 재고 심각 부족 |
| `WARNING` | 충족률 50% 이상 80% 미만 (`50 <= rate < 80`) | ● WARNING | 재고 주의 |
| `NOTICE` | 충족률 80% 이상 100% 미만 (`80 <= rate < 100`) | ● NOTICE | 임계 근접 — 모니터링 필요 |

> 충족률 = `Math.round((currentStock / thresholdQty) * 100)`.
> `currentStock >= thresholdQty` 인 경우 알림 목록에 표시되지 않음 (정상 상태).

### 3.2 Badge 시각 스펙

```
┌──────────────────────────────────────────────────────────────────────┐
│  ● CRITICAL   ← background: var(--state-danger-bg)                  │
│               ← color: var(--state-danger)                           │
│               ← border: 1px solid var(--state-danger)               │
│                                                                      │
│  ● DANGER     ← background: #FFF1F0  (--state-danger-bg 보다 연한)  │
│               ← color: #CF1322      (danger 계열 dark)              │
│               ← border: 1px solid #FFA39E                           │
│                                                                      │
│  ● WARNING    ← background: var(--state-warning-bg)                 │
│               ← color: var(--state-warning)                          │
│               ← border: 1px solid var(--state-warning)              │
│                                                                      │
│  ● NOTICE     ← background: var(--state-info-bg)                    │
│               ← color: var(--state-info)                             │
│               ← border: 1px solid var(--state-info)                 │
└──────────────────────────────────────────────────────────────────────┘
```

> 디자인 시스템 토큰 우선. DANGER 중간 단계는 토큰 미정의로 인라인 값 한시 허용.
> Phase 1-3 완료 후 design-system tokens.css 에 `--state-danger-dark` / `--state-danger-mid-bg` 추가 예정.

### 3.3 Badge CSS spec

```css
/* 공통 Base */
.urgency-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 3px var(--space-2);
  border-radius: var(--radius-chip);  /* 4px */
  font-size: var(--font-size-xs);     /* 12px */
  font-weight: var(--font-weight-semibold);
  white-space: nowrap;
  border: 1px solid transparent;
  line-height: 1.4;
}

/* 점(dot) — ● */
.urgency-badge::before {
  content: '●';
  font-size: 8px;
  display: inline-block;
  vertical-align: middle;
}

/* CRITICAL — 재고 0 */
.urgency-badge--critical {
  background: var(--state-danger-bg);
  color: var(--state-danger);
  border-color: var(--state-danger);
}

/* DANGER — 1%~49% */
.urgency-badge--danger {
  background: #FFF1F0;
  color: #CF1322;
  border-color: #FFA39E;
}

/* WARNING — 50%~79% */
.urgency-badge--warning {
  background: var(--state-warning-bg);
  color: var(--state-warning);
  border-color: var(--state-warning);
}

/* NOTICE — 80%~99% */
.urgency-badge--notice {
  background: var(--state-info-bg);
  color: var(--state-info);
  border-color: var(--state-info);
}
```

### 3.4 TypeScript 컴포넌트 정의

```typescript
/** 긴급도 레벨 4단계. */
export type UrgencyLevel = 'CRITICAL' | 'DANGER' | 'WARNING' | 'NOTICE'

/** 긴급도 레벨 산출 — 충족률(%) 기반. */
export function calcUrgencyLevel(
  currentStock: number,
  thresholdQty: number,
): UrgencyLevel {
  if (thresholdQty <= 0) return 'NOTICE'  // 임계값 미설정 시 최저 등급
  const rate = (currentStock / thresholdQty) * 100
  if (currentStock === 0) return 'CRITICAL'
  if (rate < 50)  return 'DANGER'
  if (rate < 80)  return 'WARNING'
  return 'NOTICE'
}

const URGENCY_LABEL: Record<UrgencyLevel, string> = {
  CRITICAL: 'CRITICAL',
  DANGER:   'DANGER',
  WARNING:  'WARNING',
  NOTICE:   'NOTICE',
}

const URGENCY_CLASS: Record<UrgencyLevel, string> = {
  CRITICAL: 'urgency-badge--critical',
  DANGER:   'urgency-badge--danger',
  WARNING:  'urgency-badge--warning',
  NOTICE:   'urgency-badge--notice',
}

export interface UrgencyBadgeProps {
  level: UrgencyLevel
  /** aria-label 오버라이드 (기본: "{level} — 재고 {N}% 충족") */
  ariaLabel?: string
  /** data-testid */
  testId?: string
}

/** 안전재고 긴급도 Badge. */
export function UrgencyBadge({ level, ariaLabel, testId }: UrgencyBadgeProps) {
  return (
    <span
      className={`urgency-badge ${URGENCY_CLASS[level]}`}
      aria-label={ariaLabel ?? `긴급도: ${URGENCY_LABEL[level]}`}
      data-testid={testId}
      role="status"
    >
      {URGENCY_LABEL[level]}
    </span>
  )
}
```

### 3.5 UrgencyBadge 사용 예시

```tsx
// 테이블 행 내 사용
<td style={{ textAlign: 'center' }}>
  <UrgencyBadge
    level={calcUrgencyLevel(row.currentStock, row.thresholdQty)}
    ariaLabel={`${row.productCode} 긴급도: ${calcUrgencyLevel(row.currentStock, row.thresholdQty)}`}
    testId={`safety-stock-badge-${row.productCode}`}
  />
</td>
```

---

## 4. 헤더 알림 배지 (count chip)

### 4.1 배치 위치

AppLayout 헤더 우측 영역. 알림 아이콘(벨) 우상단에 count chip 오버레이.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  [삼한로지스 로고]          [대시보드] [재고] [출고] …            [🔔 ³] [👤] │
│                                                                              │
│                                                     ^^^ 알림 배지 (count=3)  │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 상세 ASCII Mockup

```
  ┌─────────────────────┐
  │   🔔                │  ← 벨 아이콘 (24×24)
  │      [3]            │  ← count chip (좌상단 오버레이)
  └─────────────────────┘

  count chip:
  - 형태: 원형 (raduis-full)
  - 크기: min 18×18px / 숫자 2자리 이상 시 가로 확장 (min-width: 18px)
  - 최대 표시: 99+ (100 이상 시 "99+" 표시)
  - 위치: position: absolute; top: -4px; right: -4px;
```

### 4.3 count chip CSS spec

```css
/* 헤더 알림 아이콘 래퍼 — position: relative 필수 */
.header-alert-icon-wrapper {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: var(--space-1);
  border-radius: var(--radius-md);
  color: var(--ink-secondary);
  transition: background var(--duration-fast), color var(--duration-fast);
}

.header-alert-icon-wrapper:hover {
  background: var(--surface-hover);
  color: var(--ink-primary);
}

/* count chip */
.header-alert-count-chip {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: var(--radius-full);
  background: var(--state-danger);
  color: var(--ink-on-primary);
  font-size: 10px;
  font-weight: var(--font-weight-bold);
  font-family: var(--font-family-sans);
  line-height: 18px;
  text-align: center;
  white-space: nowrap;
  display: flex;
  align-items: center;
  justify-content: center;
  /* 가독성 — 아이콘 위에 항상 표시 */
  z-index: 1;
  box-shadow: 0 0 0 2px var(--surface-card);
}

/* count = 0 시 숨김 */
.header-alert-count-chip[data-count="0"] {
  display: none;
}
```

### 4.4 TypeScript 컴포넌트 정의

```typescript
export interface SafetyStockAlertChipProps {
  /** 안전재고 미달 품목 수. 0이면 chip 미표시. */
  count: number
  /** 클릭 시 SafetyStockAlertsPage 로 이동 콜백. */
  onClick: () => void
}

/** 헤더 알림 배지 — 안전재고 미달 count chip. */
export function SafetyStockAlertChip({ count, onClick }: SafetyStockAlertChipProps) {
  const displayCount = count > 99 ? '99+' : String(count)

  return (
    <button
      type="button"
      className="header-alert-icon-wrapper"
      onClick={onClick}
      aria-label={
        count === 0
          ? '안전재고 알림 없음'
          : `안전재고 미달 ${count}건 — 클릭하여 목록 보기`
      }
      data-testid="header-safety-stock-alert-button"
    >
      {/* 벨 아이콘 — SVG 또는 icon 컴포넌트 사용 */}
      <span aria-hidden="true" style={{ fontSize: 20, lineHeight: 1 }}>🔔</span>

      {count > 0 && (
        <span
          className="header-alert-count-chip"
          aria-hidden="true"
          data-count={count}
        >
          {displayCount}
        </span>
      )}
    </button>
  )
}
```

### 4.5 데이터 갱신 주기

- 헤더 count chip: React Query `refetchInterval: 60_000` (60초) — 폴링.
- `SafetyStockAlertsPage` 진입 시: 자동 refetch (staleTime: 0).
- 임계값 설정 저장 후: `queryClient.invalidateQueries(['safety-stock', 'alerts'])` 즉시 갱신.

### 4.6 data-testid

| data-testid | 요소 |
|---|---|
| `header-safety-stock-alert-button` | 헤더 벨 아이콘 `<button>` |
| `header-safety-stock-count-chip` | count chip `<span>` (count > 0 시 DOM 존재) |

---

## 5. 임계값 설정 input (제품 상세 페이지)

### 5.1 배치 위치 — ProductDetailPage 내 안전재고 섹션

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  [h1] 제품 상세 — AHU-220V-4HP                                               │
│  ─────────────────────────────────────────────────────────────────────────── │
│  [기본정보 탭]  [재고현황 탭]  [안전재고 설정 탭]                              │
│  ─────────────────────────────────────────────────────────────────────────── │
│                                                                              │
│  ▼ 안전재고 설정                                                              │
│  ─────────────────────────────────────────────────────────────────────────── │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  창고              │  임계값 (최소 재고)  │  현재 재고  │  충족률    │    │
│  ├────────────────────┼─────────────────────┼─────────────┼────────────┤    │
│  │  서울 본창고        │  [  10  ▲▼]         │          0  │  0%        │    │
│  │  부산 물류센터      │  [  20  ▲▼]         │          5  │  25%       │    │
│  │  대구 물류창고      │  [  15  ▲▼]         │         20  │  133%      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                               [저장]          │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 섹션 헤더

```
┌──────────────────────────────────────────────────┐
│  [h3] 안전재고 설정                    [수정] [저장] │
└──────────────────────────────────────────────────┘
```

| 요소 | 스펙 |
|---|---|
| 섹션 제목 | "안전재고 설정" — `font-size: 16px (--font-size-lg)` / `font-weight: var(--font-weight-semibold)` |
| [수정] 버튼 | `variant="ghost"` — 읽기 전용 상태에서 편집 모드 진입 |
| [저장] 버튼 | `variant="primary"` — 편집 모드에서 변경 사항 저장 / 변경 없으면 `disabled` |

### 5.3 임계값 테이블 컬럼

| 컬럼 | 데이터 | 너비 | 비고 |
|---|---|---|---|
| 창고 | `warehouseName` | `180px` | 읽기 전용 |
| 임계값 (최소 재고) | `thresholdQty` | `160px` | 편집 가능 `<input type="number">` |
| 현재 재고 | `currentStock` | `120px` | 읽기 전용 |
| 충족률 | `rate` (%) | `100px` | 읽기 전용 — 충족률 < 100% 이면 색상 강조 |

### 5.4 임계값 input spec

```
┌────────────────────────────────────────────────────────┐
│ 읽기 전용 상태: 임계값 숫자만 텍스트 표시              │
│                                                        │
│ 편집 모드:                                             │
│  ┌────────────────────────┐                            │
│  │  [  10               ] │  ← type="number" min=0    │
│  └────────────────────────┘                            │
│   * 0 입력 시 = 임계값 해제 (알림 제외)                │
│   * 음수 입력 불가 (min=0)                              │
└────────────────────────────────────────────────────────┘
```

```tsx
<input
  type="number"
  min={0}
  step={1}
  value={row.thresholdQty}
  onChange={(e) => onThresholdChange(row.warehouseCode, Number(e.target.value))}
  data-testid={`safety-stock-threshold-input-${row.warehouseCode}`}
  aria-label={`${row.warehouseName} 안전재고 임계값`}
  disabled={!isEditMode}
  style={{
    width: '100%',
    height: '32px',
    padding: '0 var(--space-3)',
    border: isEditMode
      ? '1px solid var(--line-default)'
      : '1px solid transparent',
    borderRadius: 'var(--radius-input)',
    fontSize: 'var(--font-size-sm)',
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'right',
    background: isEditMode ? 'var(--surface-card)' : 'transparent',
    color: 'var(--ink-primary)',
    cursor: isEditMode ? 'text' : 'default',
  }}
/>
```

### 5.5 충족률 시각화

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ 충족률  │ 표시 방식                                                           │
├──────────────────────────────────────────────────────────────────────────────┤
│ 0%      │ "0%"  — color: var(--state-danger) / font-weight: semibold        │
│ 1~49%   │ "N%"  — color: #CF1322 (danger dark)                              │
│ 50~79%  │ "N%"  — color: var(--state-warning)                               │
│ 80~99%  │ "N%"  — color: var(--state-info)                                  │
│ ≥ 100%  │ "N%"  — color: var(--state-success)                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

```typescript
/** 충족률(%) 에 따른 표시 CSS color 토큰. */
export function getRateColor(rate: number): string {
  if (rate === 0)   return 'var(--state-danger)'
  if (rate < 50)    return '#CF1322'
  if (rate < 80)    return 'var(--state-warning)'
  if (rate < 100)   return 'var(--state-info)'
  return 'var(--state-success)'
}
```

### 5.6 저장 흐름

```
편집 모드 → 임계값 변경 → [저장] 클릭
  → PATCH /products/{productCode}/safety-stock-thresholds
    → body: { thresholds: [{ warehouseCode, thresholdQty }] }
    → 성공: 토스트 "안전재고 임계값이 저장되었습니다."
           + 읽기 전용 모드 복귀
           + queryClient.invalidateQueries(['safety-stock', 'alerts'])  ← 헤더 chip 즉시 갱신
    → 실패: 에러 토스트 "저장에 실패했습니다. 다시 시도해 주세요."
```

### 5.7 CSS spec — 섹션 레이아웃

```css
.safety-threshold-section {
  margin-top: var(--space-8);
  padding: var(--space-5) var(--space-6);
  border: 1px solid var(--line-default);
  border-radius: var(--radius-card);
  background: var(--surface-card);
}

.safety-threshold-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-4);
}

.safety-threshold-section-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--ink-primary);
  margin: 0;
}

.safety-threshold-section-actions {
  display: flex;
  gap: var(--space-2);
}

/* 임계값 테이블 */
.safety-threshold-table {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid var(--line-default);
  border-radius: var(--radius-card);
  overflow: hidden;
}

.safety-threshold-table thead th {
  background: var(--color-neutral-50);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--ink-secondary);
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--line-default);
  height: var(--row-h-thead);
  white-space: nowrap;
}

.safety-threshold-table thead th:nth-child(2),
.safety-threshold-table thead th:nth-child(3),
.safety-threshold-table thead th:nth-child(4) {
  text-align: right;
}

.safety-threshold-table tbody td {
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--line-default);
  vertical-align: middle;
  height: var(--row-h);
  font-size: var(--font-size-sm);
  color: var(--ink-primary);
}

.safety-threshold-table tbody tr:last-child td {
  border-bottom: none;
}

.safety-threshold-table tbody td:nth-child(2),
.safety-threshold-table tbody td:nth-child(3),
.safety-threshold-table tbody td:nth-child(4) {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
```

### 5.8 data-testid 목록

| data-testid | 요소 |
|---|---|
| `safety-threshold-section` | 섹션 루트 `<div>` |
| `safety-threshold-edit-button` | [수정] `<button>` |
| `safety-threshold-save-button` | [저장] `<button>` |
| `safety-threshold-table` | `<table>` |
| `safety-stock-threshold-input-{warehouseCode}` | 창고별 임계값 `<input>` |

---

## 6. 컬러 토큰 전체 목록

| 용도 | CSS 토큰 |
|---|---|
| CRITICAL badge 배경 | `var(--state-danger-bg)` |
| CRITICAL badge 텍스트 / border | `var(--state-danger)` |
| DANGER badge 배경 | `#FFF1F0` (한시 하드코드 — 토큰 추가 예정) |
| DANGER badge 텍스트 | `#CF1322` (한시 하드코드 — 토큰 추가 예정) |
| DANGER badge border | `#FFA39E` (한시 하드코드 — 토큰 추가 예정) |
| WARNING badge 배경 | `var(--state-warning-bg)` |
| WARNING badge 텍스트 / border | `var(--state-warning)` |
| NOTICE badge 배경 | `var(--state-info-bg)` |
| NOTICE badge 텍스트 / border | `var(--state-info)` |
| count chip 배경 | `var(--state-danger)` |
| count chip 텍스트 | `var(--ink-on-primary)` |
| 부족수량 셀 | `var(--state-danger)` |
| 현재재고 = 0 셀 | `var(--state-danger)` |
| 충족률 0% | `var(--state-danger)` |
| 충족률 1~49% | `#CF1322` (한시 하드코드) |
| 충족률 50~79% | `var(--state-warning)` |
| 충족률 80~99% | `var(--state-info)` |
| 충족률 ≥ 100% | `var(--state-success)` |
| 테이블 헤더 배경 | `var(--color-neutral-50)` |
| 테이블 헤더 텍스트 | `var(--ink-secondary)` |
| 행 기본 배경 | `var(--surface-card)` |
| 행 hover 배경 | `var(--surface-hover)` |
| 행 경계선 | `var(--line-default)` |
| 섹션 border | `var(--line-default)` |
| input border (기본) | `var(--line-default)` |
| input focus border | `var(--line-focus)` |
| input focus shadow | `var(--action-brand-subtle)` |
| 본문 텍스트 | `var(--ink-primary)` |
| 보조 텍스트 | `var(--ink-secondary)` |
| 빈 상태 텍스트 | `var(--ink-tertiary)` |
| 빈 상태 아이콘 배경 | `var(--state-success-bg)` |
| 빈 상태 아이콘 색상 | `var(--state-success)` |

> **design-system 토큰 추가 필요 항목** (Phase 1-3 FE 완료 후 `tokens.css` 갱신):
> - `--state-danger-dark: #CF1322`
> - `--state-danger-mid-bg: #FFF1F0`
> - `--state-danger-mid-border: #FFA39E`

---

## 7. 타이포그래피 스케일

| 요소 | 폰트 크기 토큰 | 폰트 굵기 토큰 | 비고 |
|---|---|---|---|
| 페이지 제목 | `var(--font-page-title)` (24px) | `var(--font-weight-semibold)` (600) | |
| 섹션 제목 | `var(--font-size-lg)` (16px) | `var(--font-weight-semibold)` (600) | |
| 테이블 헤더 | `var(--font-size-xs)` (12px) | `var(--font-weight-semibold)` (600) | |
| 테이블 본문 | `var(--font-size-sm)` (13px) | `var(--font-weight-regular)` (400) | |
| 숫자 셀 | `var(--font-size-sm)` (13px) | `var(--font-weight-regular)` (400) | `font-variant-numeric: tabular-nums` |
| Badge 텍스트 | `var(--font-size-xs)` (12px) | `var(--font-weight-semibold)` (600) | |
| count chip | 10px | `var(--font-weight-bold)` (700) | |
| 필터 레이블 | `var(--font-size-sm)` (13px) | `var(--font-weight-regular)` (400) | |
| 총 건수 | `var(--font-size-xs)` (12px) | `var(--font-weight-regular)` (400) | |

---

## 8. 스페이싱 규칙

| 요소 | 토큰 | 값 |
|---|---|---|
| 페이지 상단 padding | `var(--space-6)` | 24px |
| 필터 바 gap | `var(--space-3)` | 12px |
| 필터 바 하단 여백 | `var(--space-4)` | 16px |
| 테이블 헤더 cell padding | `var(--space-2) var(--space-3)` | 8px 12px |
| 테이블 본문 cell padding | `var(--space-2) var(--space-3)` | 8px 12px |
| 테이블 행 높이 | `var(--row-h)` | 40px |
| 테이블 헤더 높이 | `var(--row-h-thead)` | 44px |
| 섹션 padding | `var(--space-5) var(--space-6)` | 20px 24px |
| 섹션 상단 여백 | `var(--space-8)` | 32px |
| badge padding | `3px var(--space-2)` | 3px 8px |
| count chip 크기 | `min-width: 18px / height: 18px` | |
| count chip 오버레이 offset | `top: -4px; right: -4px` | |

---

## 9. UX 흐름 정의

### 9.1 SafetyStockAlertsPage 진입 흐름

```
헤더 벨 아이콘 클릭 (count chip > 0)
  → navigate('/safety-stock/alerts')
    → SafetyStockAlertsPage 렌더
      → GET /inventory/safety-stock/alerts?warehouseId=&urgency=&keyword=
      → 결과 테이블 표시
      → 행 클릭 → navigate('/products/{productCode}')
```

### 9.2 필터 동작 흐름

```
창고 select 변경 or 긴급도 select 변경 → 즉시 API 재조회
검색 input 입력 → 300ms debounce 후 API 재조회

필터 조합: AND 조건 (창고 AND 긴급도 AND 키워드)
```

### 9.3 임계값 설정 흐름

```
ProductDetailPage 진입 → 안전재고 설정 섹션 (읽기 전용)
  → [수정] 버튼 클릭 → 편집 모드 (input 활성화)
    → 임계값 변경
      → [저장] 버튼 활성화 (변경 감지 시)
    → [저장] 클릭
      → PATCH /products/{productCode}/safety-stock-thresholds
        → 성공: 토스트 + 읽기 전용 복귀 + 헤더 chip 갱신
        → 실패: 에러 토스트 (편집 모드 유지)
    → [취소] (변경 중 수정 버튼 재클릭) → 원복
```

### 9.4 에러 처리

| 시나리오 | UI 처리 |
|---|---|
| API 조회 실패 (5xx) | 페이지 에러 배너 `role="alert"` + [재시도] 버튼 |
| 임계값 음수 입력 | input `aria-invalid="true"` + border `var(--state-danger)` + 저장 버튼 disabled |
| 임계값 저장 실패 | 에러 토스트 (편집 모드 유지) |
| count chip 조회 실패 | chip 미표시 (silent fail — 헤더 UX 영향 최소화) |

---

## 10. API 연동 스펙 (Frontend agent 전달)

### 10.1 안전재고 알림 목록 조회

```
GET /inventory/safety-stock/alerts
  Query: warehouseId? / urgency? (CRITICAL|DANGER|WARNING|NOTICE) / keyword? / page / size
  Response: {
    content: SafetyStockAlert[]
    totalElements: number
    page: number
    size: number
  }
```

```typescript
export interface SafetyStockAlert {
  /** 제품코드 — 비즈니스 식별자, 화면 표시 */
  productCode: string
  /** 제품명 */
  productName: string
  /** 창고명 */
  warehouseName: string
  /** 현재 재고 수량 */
  currentStock: number
  /** 안전재고 임계값 */
  thresholdQty: number
  /** 부족 수량 (thresholdQty - currentStock) */
  shortageQty: number
  /** 긴급도 레벨 (BE 산출) */
  urgencyLevel: UrgencyLevel
  /** 충족률 % (BE 산출, 소수 없는 정수) */
  stockRate: number
}
```

### 10.2 헤더 count chip 조회

```
GET /inventory/safety-stock/alerts/count
  Response: { count: number }
```

### 10.3 임계값 설정 조회

```
GET /products/{productCode}/safety-stock-thresholds
  Response: {
    thresholds: SafetyStockThreshold[]
  }
```

```typescript
export interface SafetyStockThreshold {
  /** 창고코드 — 비즈니스 식별자, 화면 미노출 (data-testid 전용) */
  warehouseCode: string
  /** 창고명 — 화면 표시 */
  warehouseName: string
  /** 임계값 */
  thresholdQty: number
  /** 현재 재고 */
  currentStock: number
  /** 충족률 % */
  stockRate: number
}
```

### 10.4 임계값 저장

```
PATCH /products/{productCode}/safety-stock-thresholds
  Body: { thresholds: [{ warehouseCode: string; thresholdQty: number }] }
  Response: 204 No Content
```

---

## 11. 접근성 (A11y) 요구사항

| 항목 | 요구사항 |
|---|---|
| 페이지 제목 | `<h1>` 태그 사용, `usePageTitle('안전재고 알림')` |
| 테이블 | `<caption>` 또는 `aria-label="안전재고 미달 품목 목록"` |
| 정렬 가능 헤더 | `aria-sort="ascending" / "descending" / "none"` |
| Badge `role` | `role="status"` + `aria-label="긴급도: {level}"` |
| count chip | `aria-label="안전재고 미달 {N}건"` (N=0이면 `aria-label="안전재고 알림 없음"`) |
| input | `aria-label="{warehouseName} 안전재고 임계값"` + `aria-required="false"` |
| 충족률 셀 | `aria-label="{warehouseName} 충족률 {N}%"` |
| 키보드 | 테이블 행 Enter/Space 로 ProductDetailPage 이동 (`tabIndex={0}` + `onKeyDown`) |
| 빈 상태 | `role="status"` + 메시지 텍스트 |
| 에러 배너 | `role="alert"` + `aria-live="assertive"` |

---

## 12. TypeScript Props 정의 (Frontend agent 전달)

```typescript
/** SafetyStockAlertsPage props — 라우트에서 URL query 파라미터로 초기값 주입 가능. */
export interface SafetyStockAlertsPageProps {
  initialWarehouseId?: string
  initialUrgency?: UrgencyLevel | ''
  initialKeyword?: string
}

/** 임계값 설정 섹션 — ProductDetailPage 내 포함 컴포넌트. */
export interface SafetyThresholdSectionProps {
  /** 제품코드 — API 경로에만 사용, 화면 미노출 */
  productCode: string
  /** MASTER / MANAGER 역할만 편집 가능 */
  canEdit: boolean
}
```

---

## 13. Iteration 계획

메모리 가드 `feedback_print_design_iteration.md` 준수.

| 회차 | 내용 | 검토 방법 | 완료 기준 |
|---|---|---|---|
| 1차 (현재) | 본 spec 작성 | Designer 산출물 검토 | 레이아웃 + Badge 4단계 + chip + 임계값 input 정책 확정 |
| 2차 | FE 1차 mock 구현 후 Edge 캡처 | PR comment 이미지 첨부 | SafetyStockAlertsPage 테이블 + Badge 시각 확인 |
| 3차 | 헤더 chip + 임계값 섹션 CSS 미세 조정 | Edge 캡처 + 사용자 검토 | count chip 오버레이 / 충족률 색상 시각 확인 |
| 4차 | BE API 연결 후 실 데이터 기반 검증 | QA 에이전트 시나리오 검증 | 필터 / 저장 / chip 갱신 E2E 통과 |
| 5차 | 접근성 + 키보드 탐색 + 빈 상태 최종 확인 | QA 에이전트 + 개발책임자 승인 | 최종 QA 캡처 `docs/qa/p1-3-safety-stock/` 첨부 |

---

## 14. 관련 파일 경로

| 파일 | 역할 |
|---|---|
| `clients/desktop/src/renderer/routes/SafetyStockAlertsPage.tsx` | 신규 생성 대상 (FE 에이전트) |
| `clients/desktop/src/renderer/routes/index.tsx` | 라우트 `/safety-stock/alerts` 등록 (FE 에이전트) |
| `clients/desktop/src/renderer/api/inventoryApi.ts` | `getSafetyStockAlerts` / `getSafetyStockCount` / `getSafetyStockThresholds` / `patchSafetyStockThresholds` API 추가 (FE 에이전트) |
| `clients/desktop/src/renderer/routes/DashboardPage.tsx` | "저재고 알림" 카드 → count 실제 연결 (FE 에이전트) |
| `clients/web/design-system/src/tokens/tokens.css` | `--state-danger-dark` / `--state-danger-mid-bg` / `--state-danger-mid-border` 토큰 추가 예정 (4차 iteration 후) |
| `docs/qa/p1-3-safety-stock/` | QA 스크린샷 저장 경로 (PR 본문 첨부용 — 2차 iteration 생성) |
| `docs/migration/ecount-reference/` | 이카운트 재고 조회 화면 UX 참조 캡처 |
