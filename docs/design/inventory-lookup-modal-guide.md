# InventoryLookupModal UX 디자인 가이드 — Phase 2.6d

> 작성: 2026-05-31 Designer
> 설계 출처: `docs/superpowers/specs/2026-05-31-inventory-lookup-modal-design.md` D-IL-01~06
> 계획 출처: `docs/superpowers/plans/2026-05-31-inventory-lookup-modal.md` Task 3
> 결정 근거: `docs/superpowers/specs/…` §2 설계 결정 표 (개발책임자 마우스 선택)

---

## 1. 목적 및 범위

주문서(`SalesPartnerOrderDetailPage`) / 출고전표 / 입고전표(`SlipDetailPage`) 상세 화면에서 담당자가 품목 라인을 다중 선택하여 즉시 창고별 가용/실/예약 재고를 확인하는 **읽기 전용 모달**이다.

- **신규 공유 컴포넌트** `InventoryLookupModal` — 기존 `StockBalanceModal`(SlipFormPage 전용·총량만)과 별개. 기존 무변경(회귀 0).
- UUID 비공개: `productId`/`warehouseId` 화면 미노출. `modelName`/`productName`/`warehouseCode`/`warehouseName`만 사용자 노출.

---

## 2. 모달 전체 레이아웃 (ASCII)

```
┌─────────────────────────────────────────────────────────────────────┐  ← border-radius: var(--radius-modal) = 8px
│  재고조회                              [☐ 0수량 창고도 표시]  [✕]   │  ← modal-header: 20px / weight 600 / ink-primary
│  선택 품목 N건 · 조회 창고 M개                                       │  ← subheader: 13px / ink-secondary
├─────────────────────────────────────────────────────────────────────┤  ← border: 1px line-default
│  ┌──────────────────┬──────────┬──────────┬──────────┬──────────┐   │
│  │  품목             │ 본사창고  │ 차량창고  │ 위탁창고  │ …       │   │  ← thead: row-h-thead=44px / surface-subtle / ink-primary 13px semibold
│  │  (고정 sticky)    │  WH-001  │  WH-002  │  WH-003  │ 가로스크롤│   │
│  ├──────────────────┼──────────┼──────────┼──────────┼──────────┤   │
│  │ 모델명            │ 가용  12 │ 가용   0  │ 가용   5 │          │   │
│  │ 품목명            │ 실   15  │ 실    0  │ 실    8 │          │   │  ← 셀 3줄 포맷 (각 row-h × 3 = 120px per 품목행)
│  │ [행 구분선]       │ 예약  3  │ 예약  0  │ 예약  3 │          │   │
│  ├──────────────────┼──────────┼──────────┼──────────┼──────────┤   │
│  │ 모델명2           │ 가용   7 │ 가용   0  │ 가용   0 │          │   │
│  │ 품목명2           │ 실    7  │ 실    0  │ 실    0 │          │   │
│  │                  │ 예약  0  │ 예약  0  │ 예약  0 │          │   │
│  └──────────────────┴──────────┴──────────┴──────────┴──────────┘   │
├─────────────────────────────────────────────────────────────────────┤
│                                                    [닫기]            │  ← modal-footer: 오른쪽 정렬, Button secondary
└─────────────────────────────────────────────────────────────────────┘
  최대 너비: max-w 860px (--modal-max-w 720px 기본보다 확장)
  최대 높이: max-h 80vh (--modal-max-h)
  overflow-y: auto (모달 전체)
  overflow-x: hidden (모달 전체), 내부 테이블만 overflow-x: auto
```

---

## 3. 모달 헤더

| 요소 | 토큰 / 값 |
|---|---|
| 배경 | `var(--surface-card)` = `#FFFFFF` |
| 제목 "재고조회" | `var(--font-modal-title)` = 18px / `var(--font-weight-semibold)` = 600 / `var(--ink-primary)` |
| 서브 "선택 품목 N건 · 조회 창고 M개" | 13px / `var(--ink-secondary)` |
| 하단 구분선 | 1px solid `var(--line-default)` |
| 닫기 버튼(✕) | 24×24px icon button, `var(--ink-tertiary)` hover `var(--ink-primary)` |
| 0토글 위치 | 헤더 우측, 닫기 버튼 왼쪽 — 인라인 `<label>` + `<input type="checkbox">` |

---

## 4. 0수량 창고 토글 UX

### 4.1 레이블 및 위치

```
[☐ 0수량 창고도 표시]
```

- 체크박스 16×16 + 라벨 텍스트 13px / `var(--ink-secondary)`
- 위치: 모달 헤더 오른쪽 영역(닫기 버튼 왼쪽 16px), 수직 중앙 정렬
- `data-testid="inventory-lookup-zero-toggle"`

### 4.2 토글 동작 규칙

| 상태 | 컬럼 표시 기준 | 설명 |
|---|---|---|
| **OFF (기본값)** | 전 품목행의 `total` 합산 > 0 인 창고만 | 실재고 있는 창고만 — 업무 기본 시야 |
| **ON** | 전 창고 마스터 목록 전부 (`GET /inventory/warehouses` 머지) | 한 번도 입고 안 된 창고 포함(0/0/0 표시) |

- VIRTUAL 창고는 ON 상태에서도 컬럼 제외(설계 D-IL-04 / 2.6c 관례)
- 토글 전환 시 애니메이션 없이 즉시 컬럼 재계산(클라이언트 필터)
- 토글 변경은 API 재호출 없음 — 이미 머지된 전 창고 데이터에서 필터만 변경

### 4.3 OFF 상태에서 모든 창고가 0일 때 (품목 선택 오류 등)

```
┌─────────────────────────────────────────────┐
│  재고조회              [☑ 0수량 창고도 표시] │
│                                             │
│  조회된 재고 창고가 없습니다.                 │  ← 13px / ink-tertiary / 중앙 정렬
│  "0수량 창고도 표시"를 켜면 전체 창고를       │
│  확인할 수 있습니다.                          │
│                                             │
└─────────────────────────────────────────────┘
```

---

## 5. 매트릭스 테이블 구조

### 5.1 `<table>` 시맨틱 마크업

```html
<div class="ilm-table-scroll" role="region" aria-label="재고 매트릭스">
  <table class="ilm-matrix" role="grid">
    <thead>
      <tr>
        <th scope="col" class="ilm-col-product">품목</th>
        <th scope="col" class="ilm-col-warehouse">WH-001 · 본사창고</th>
        <!-- 창고 컬럼 반복 -->
      </tr>
    </thead>
    <tbody>
      <tr data-testid="inventory-lookup-cell-{modelName}-{warehouseCode}">
        <td class="ilm-cell-product">
          <span class="ilm-model-name">모델명</span>
          <span class="ilm-product-name">품목명 전체</span>
        </td>
        <td class="ilm-cell-balance">
          <span class="ilm-avail">가용 12</span>
          <span class="ilm-total">실  15</span>
          <span class="ilm-reserved">예약  3</span>
        </td>
        <!-- 창고 셀 반복 -->
      </tr>
    </tbody>
  </table>
</div>
```

### 5.2 고정 컬럼(품목명) 처리

- `ilm-col-product` (첫 번째 `<th>`) → `position: sticky; left: 0; z-index: 2; background: var(--surface-card)`
- `ilm-cell-product` (각 행의 `<td>` 첫 열) → 동일 sticky 처리
- 오른쪽 창고 컬럼들만 `overflow-x: auto` 가로스크롤
- sticky 열 우측에 1px solid `var(--line-default)` 구분선(`box-shadow: inset -1px 0 0 var(--line-default)`)

```
CSS:
.ilm-table-scroll {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
.ilm-col-product,
.ilm-cell-product {
  position: sticky;
  left: 0;
  z-index: 2;
  min-width: 180px;
  max-width: 220px;
  background: var(--surface-card);
  box-shadow: inset -1px 0 0 var(--line-default);
}
thead .ilm-col-product {
  background: var(--surface-subtle);
}
```

---

## 6. 셀 3줄 포맷 상세

### 6.1 포맷 규칙

각 품목 × 창고 교차 셀에 3줄을 수직으로 표시:

```
가용  12
실   15
예약   3
```

- 라벨("가용" / "실" / "예약") + 오른쪽 정렬 숫자
- 숫자는 `font-variant-numeric: tabular-nums` (열 정렬 일관)
- 라벨 너비 고정(2em 정도)으로 숫자 정렬 맞춤

### 6.2 셀 크기

| 항목 | 값 |
|---|---|
| 셀 너비(창고 컬럼) | 최소 90px, 기본 96px |
| 셀 높이(3줄) | `auto` — padding `var(--space-2)` 상하 |
| 폰트 크기(라벨) | `var(--font-size-xs)` = 12px |
| 폰트 크기(숫자) | `var(--font-size-sm)` = 13px |
| 폰트 weight(숫자) | `var(--font-weight-medium)` = 500 |
| 행 구분선 | 1px solid `var(--line-default)` (품목 행 사이) |
| 셀 수직 정렬 | `vertical-align: top` + `padding-top: var(--space-2)` |

### 6.3 셀 3줄 CSS

```css
.ilm-cell-balance {
  padding: var(--space-2) var(--space-3);
  text-align: right;
  vertical-align: top;
}

.ilm-avail,
.ilm-total,
.ilm-reserved {
  display: flex;
  justify-content: space-between;
  gap: var(--space-2);
  font-size: var(--font-size-xs);   /* 12px */
  line-height: 1.6;
  font-variant-numeric: tabular-nums;
}

.ilm-avail    { color: var(--ink-primary); font-weight: var(--font-weight-medium); }
.ilm-total    { color: var(--ink-secondary); }
.ilm-reserved { color: var(--ink-secondary); }

/* 라벨 */
.ilm-avail::before    { content: "가용"; min-width: 2em; color: var(--ink-tertiary); font-size: 11px; }
.ilm-total::before    { content: "실";  min-width: 2em; color: var(--ink-tertiary); font-size: 11px; }
.ilm-reserved::before { content: "예약"; min-width: 2em; color: var(--ink-tertiary); font-size: 11px; }
```

---

## 7. 색 토큰 — 셀 상태별 강조

| 상태 | 대상 | 토큰 | 폴백 hex | 근거 |
|---|---|---|---|---|
| **가용 0 + 실재고 > 0** (예약 초과) | `.ilm-avail` 숫자 | `var(--state-danger)` | `#EF4444` | 가용 없음 = 주문전환 불가 → 빨간 경고 |
| **가용 > 0** (정상) | `.ilm-avail` 숫자 | `var(--ink-primary)` | `#1A1F2E` | 기본 |
| **예약 > 0** | `.ilm-reserved` 숫자 | `var(--state-warning)` | `#F59E0B` | 예약 잠김 인지 → 오렌지 강조 |
| **예약 = 0** | `.ilm-reserved` 숫자 | `var(--ink-secondary)` | `#5C6773` | 일반 |
| **0 셀 전체 (ON 토글 노출)** | 셀 배경 | `var(--surface-subtle)` | `#F4F6F8` | 0수량 창고 회색 배경 구분 |
| **0 셀 텍스트** | 3줄 숫자 전부 | `var(--ink-tertiary)` | `#8A95A4` | 시각적 deemphasis |
| **thead 배경** | `<thead>` | `var(--surface-subtle)` | `#F4F6F8` | 헤더 구분 |
| **odd row 배경** | `<tbody tr:nth-child(even)` | `var(--surface-subtle)` | `#F4F6F8` | 행 구분 stripe |

### 7.1 가용-실-예약 관계 시각 전달

"가용 = 실 - 예약" 관계를 사용자가 직관적으로 이해할 수 있도록:

- 셀 내 3줄 순서: `가용` (첫 줄, 주요 결정 지표) → `실` (둘째) → `예약` (셋째, 감산 이유)
- 가용이 0이고 예약이 양수일 때 두 줄 모두 컬러 강조: `가용 0`은 danger-red, `예약 N`은 warning-orange — "예약 때문에 가용이 없다"는 인과가 시각적으로 쌍을 이룸
- 별도 수식(가용 = 실 - 예약) 툴팁: 헤더 "가용" 옆 `ⓘ` 아이콘, hover 시 "가용재고 = 실재고 − 예약재고 (전환 가능 수량)" 표시

---

## 8. 창고 컬럼 헤더

```
본사창고
WH-001
```

- 상단: `warehouseName` — 13px / semibold / `var(--ink-primary)`
- 하단: `warehouseCode` — 12px / regular / `var(--ink-tertiary)`
- 가로 정렬: `text-align: center`
- 창고 타입 Badge 생략(헤더 밀도 고려 — 창고코드로 충분)

---

## 9. 품목 고정 컬럼 내 표시

```
모델명
품목명(전체)
```

- 상단: `modelName` — 13px / semibold / `var(--ink-primary)`
- 하단: `productName` — 12px / regular / `var(--ink-secondary)`, 말줄임(`text-overflow: ellipsis; max-width: 200px`)
- UUID(`productId`) 미노출
- 창고코드(`warehouseCode`) / 창고명(`warehouseName`) 만 창고 헤더 표시 — UUID(`warehouseId`) 미노출

---

## 10. 가로 스크롤 + 고정 컬럼 정책

### 10.1 창고 컬럼 수 기준

| 표시 창고 수 | 레이아웃 |
|---|---|
| 1~4개 | 자연 너비 — 스크롤 불필요 가능 |
| 5~8개 | 가로 스크롤 시작. 스크롤바 항상 표시(`overflow-x: scroll`) |
| 9개 이상 | 동일, 첫 컬럼(품목) sticky 효과 필수 |

### 10.2 모달 너비

- `max-width: 860px` — 기존 `--modal-max-w: 720px` 보다 확장(창고 컬럼 다수 대비)
- `min-width: 480px`
- 모달 자체 `overflow-x: hidden`, 내부 `ilm-table-scroll`만 `overflow-x: auto`

### 10.3 스크롤 접근성

- `role="region"` + `aria-label="재고 매트릭스"` — 스크린리더 영역 식별
- 키보드 Tab으로 테이블 영역 포커스 가능; 포커스 링 `outline: 2px solid var(--line-focus)` (= `#3B82F6`)

---

## 11. 로딩 / 에러 / 빈 상태

### 11.1 로딩

```
┌─────────────────────────────────────┐
│  재고조회                    [✕]    │
│                                     │
│   ◌  재고 정보를 불러오는 중…        │  ← 스피너 + 13px ink-secondary
│                                     │
└─────────────────────────────────────┘
```

- 스피너: design-system `Spinner` 컴포넌트(있으면), 없으면 CSS 애니메이션 24px
- 모달 최소 높이 200px 유지(레이아웃 점프 방지)

### 11.2 에러

```
┌─────────────────────────────────────┐
│  재고조회                    [✕]    │
│                                     │
│  재고 조회 중 오류가 발생했습니다.    │  ← state-danger 배경 토큰
│  [다시 시도]                         │
│                                     │
└─────────────────────────────────────┘
```

- 배경: `var(--state-danger-bg)` = `#FEE2E2`
- 텍스트: `var(--state-danger)` = `#EF4444`
- "다시 시도" 버튼: `react-query` `refetch` 연결

### 11.3 빈 결과 (선택 라인 0건 또는 토글 OFF 시 전 창고 0)

- 선택 라인 0건은 모달 오픈 불가(트리거 버튼 비활성화로 방지)
- 조회 결과 창고 0개(OFF 상태): 4.3항 안내 텍스트 표시

---

## 12. 트리거 UI (상세 페이지 라인 표 상단)

### 12.1 체크박스 다중선택

- 라인 표 첫 컬럼: 16×16 체크박스 — `border: 1.5px solid var(--line-default)` → checked: `background: var(--action-brand)` + 흰 체크
- 헤더 체크박스: 전체 선택 / indeterminate 상태 지원 (SlipFormPage 패턴 일관)
- 선택된 행: 배경 `var(--surface-selected)` = `#EFF6FF`, 좌측 2px 파란 띠 `var(--action-brand)`

### 12.2 "선택 품목 재고조회" 버튼

```
[선택 품목 재고조회]   (선택 N건)
```

- 위치: 라인 표 상단 툴바 우측 영역(기존 버튼들 옆)
- 상태:
  - 선택 0건: `disabled` — `var(--ink-tertiary)` + `cursor: not-allowed`
  - 선택 N건: `variant="secondary"` 활성 + 괄호 안 건수 표시 `(3건)`
- `data-testid`: `btn-inventory-lookup`

---

## 13. 접근성 (table semantics + aria)

| 항목 | 구현 |
|---|---|
| 테이블 제목 | `<caption class="sr-only">품목별 창고 재고 매트릭스</caption>` |
| 행/열 헤더 | `<th scope="col">` (창고), `<th scope="row">` (품목) |
| 모달 role | `role="dialog"` + `aria-modal="true"` + `aria-labelledby="ilm-title"` |
| 포커스 트랩 | 모달 open 시 첫 포커스 → 닫기 버튼 or 토글. Tab 순환은 모달 내부로 한정 |
| ESC 닫기 | `onKeyDown` ESC → `onClose()` |
| 닫기 버튼 | `aria-label="재고조회 닫기"` |
| 0토글 체크박스 | `aria-label="0수량 창고도 표시"` + `aria-checked` 반영 |
| 로딩 상태 | `aria-busy="true"` on `<table>` 또는 overlay |
| 셀 접근성 | 각 셀 `aria-label="{modelName} {warehouseName} — 가용 {N} 실 {N} 예약 {N}"` |
| 스크린리더 숫자 | `lang="ko"` 기본값으로 숫자 정상 읽힘; `localeString('ko-KR')` 포맷 사용 |

### 13.1 포커스 순서

```
[체크박스: 0수량 창고도 표시] → [닫기 ✕] → [테이블 scroll region] → [닫기 버튼(footer)]
```

---

## 14. 신규 CSS 토큰 (추가 정의 필요)

아래 토큰은 현재 `tokens.css`에 없으므로 `InventoryLookupModal.module.css` 내 `:root` fallback 또는 `design-system tokens.css` 추가 요청:

| 토큰 이름 | 값 | 용도 |
|---|---|---|
| `--modal-inventory-max-w` | `860px` | 재고조회 모달 최대 너비 (기존 720px 확장) |
| `--cell-balance-min-w` | `96px` | 창고 셀 최소 너비 |
| `--cell-product-min-w` | `180px` | 고정 품목 컬럼 최소 너비 |

> 기존 토큰(`--modal-max-w: 720px`)은 다른 모달에 영향을 주므로 별도 토큰으로 분리. 기존 무변경.

---

## 15. data-testid 목록

| testid | 위치 | 용도 |
|---|---|---|
| `inventory-lookup-modal` | 모달 root | Playwright open 확인 |
| `inventory-lookup-zero-toggle` | 토글 체크박스 | toggle 동작 테스트 |
| `inventory-lookup-cell-{modelName}-{warehouseCode}` | 각 셀 `<td>` | 셀 값 단언 |
| `inventory-lookup-loading` | 로딩 overlay | 로딩 상태 확인 |
| `inventory-lookup-error` | 에러 배너 | 에러 상태 확인 |
| `btn-inventory-lookup` | 트리거 버튼(상세 페이지) | 버튼 클릭 테스트 |

---

## 16. 기존 StockBalanceModal 차이 요약

| 항목 | 기존 `StockBalanceModal` | 신규 `InventoryLookupModal` |
|---|---|---|
| 진입 위치 | SlipFormPage (전표 입력 폼) | 주문·출고·입고 **상세** 페이지 |
| 데이터 | 총량(`total`)만 | 가용/실/예약 **3값** |
| 셀 내용 | 숫자 1줄 | 3줄 (`가용 N / 실 N / 예약 N`) |
| 0수량 토글 | 없음 | 있음 (D-IL-01 전창고 머지) |
| 창고 소스 | batch 결과만 | batch + `listWarehouses` 머지 |
| 기존 코드 변경 | 없음 (무변경) | 신규 분리 |

---

## 17. 구현 체크리스트 (Designer → FE 전달)

- `max-width: 860px`, `overflow-x: auto` 테이블 래퍼
- `position: sticky; left: 0` 품목 첫 컬럼 고정
- 셀 3줄: `가용 / 실 / 예약` 라벨 prefix + 오른쪽 tabular-nums 숫자
- 가용=0 → `var(--state-danger)` red, 예약>0 → `var(--state-warning)` orange
- 0셀(ON 토글 노출 시) → 배경 `var(--surface-subtle)`, 텍스트 `var(--ink-tertiary)`
- 헤더 0토글 체크박스 — OFF 기본, 변경 시 컬럼 즉시 필터(API 재호출 없음)
- VIRTUAL 창고 컬럼 무조건 제외(ON 토글에도)
- 품목 고정 컬럼 `box-shadow: inset -1px 0 0 var(--line-default)` 구분선
- `aria-modal`, `role="grid"`, `scope="col/row"` th, ESC 닫기 의무
- 하드코딩 색상 금지 — 모든 색 토큰 참조
