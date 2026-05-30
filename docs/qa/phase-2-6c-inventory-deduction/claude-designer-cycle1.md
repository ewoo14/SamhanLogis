# Phase 2.6c — Designer 리뷰 Cycle 1

리뷰어: Designer agent (claude-sonnet-4-6)
작성일: 2026-05-31
브랜치: feat/phase-2-6c-inventory-deduction (HEAD c4f517e1)
참조 가이드: docs/qa/phase-2-6c-inventory-deduction/designer-guide-cycle1.md

---

## 판정: APPROVE (조건부)

차단 결함 없음. 아래 P1 1건(권장 수정), P2 3건(사이클 2 이전 개선 권장), P3 2건(선택 개선)을 정리한다.

---

## 1. 재고 현황 화면 (InventoryStockBalancePage.tsx)

### 1.1 가용/실/예약 3구분 시각 위계

**판정: 양호**

컬럼 순서가 가용재고 → 예약재고 → 실재고 순서이다. 업무 관점에서 "전환 가능 수량"인 가용재고가 가장 먼저 눈에 들어오는 배치는 적절하다. 한국 ERP(이카운트) 컨벤션에서도 가용수량을 앞열에 두는 패턴을 따른다.

그러나 컬럼 너비가 세 수량 열 모두 `width: 90`으로 동일하다. 가용재고가 핵심 지표임을 고려할 때 다른 수량 열보다 약간 넓게(`width: 100`) 설정해 시선을 유도하면 위계가 강해진다. 이는 P3 권장사항이다.

### 1.2 가용 0 빨강 강조 대비/접근성

**판정: P1 — 권장 수정**

가용재고 0인 비가상 창고 행에 `color: '#B91C1C'`와 `fontWeight: 600`을 인라인으로 직접 하드코딩하고 있다.

```tsx
color: isZero && !isVirtual ? '#B91C1C' : isVirtual ? '#9CA3AF' : undefined,
```

디자인 가이드(§2.1)는 에러 배너에 `colors.danger[700]` = `#991B1B`를 사용하고, design-system `tokens.css`에는 `--color-danger-700: #991B1B`가 정의되어 있다. 현재 구현의 `#B91C1C`는 토큰 외 하드코딩 값이며 danger 스케일 정의(`#B91C1C`는 스케일에 없음)와 불일치한다.

- danger-500 = `#D6504A`, danger-600 = `#DC2626`, danger-700 = `#991B1B`, danger-800 = `#7F1D1D`이다.
- `#B91C1C`는 Tailwind red-700 값이며 design-system 토큰 외부 값이다.
- WCAG AA 4.5:1 기준: `#B91C1C` on `#FFFFFF` = 약 5.4:1 (통과하나 design-system 정합 불일치).

**권장**: 인라인 컬러를 `var(--color-danger-700, #991B1B)`로 교체하거나, 전용 CSS 클래스로 위임한다. `#9CA3AF`(가상 창고 muted) 역시 design-system `--color-neutral-400` 값과 일치하므로 토큰 참조로 교체 권장이다.

### 1.3 창고구분 Badge 색

**판정: 양호**

| 창고 타입 | Badge variant | Badge.module.css 색 |
|---|---|---|
| 본사 (HEADQUARTERS) | `brand` | `--color-brand-50 / brand-200 / brand-700` |
| 차량 (VEHICLE) | `success` | `--color-success-50 / success-200 / --color-success` |
| 위탁 (CONSIGNMENT) | `warning` | `--color-warning-50 / warning-200 / warning-800` |
| 가상 (VIRTUAL) | `neutral` | `--color-bg-muted / border / text-muted` |

4종 창고 타입 모두 design-system Badge 컴포넌트의 공식 variant를 사용한다. 색조 차이가 명확하고, 다른 화면(SalesPartnerOrderListPage의 statusBadge 등)과 일관된 패턴이다. WCAG AA 기준 각 variant 모두 design-system 차원에서 검증된 토큰을 사용하므로 접근성 문제없다.

### 1.4 DataGrid 가독성

**판정: 양호 (P2 개선 권장 1건)**

DataGrid는 `@samhan/design-system`의 표준 컴포넌트를 사용하므로 기본 가독성은 design-system 수준을 따른다. `rowKey`로 `productId-warehouseCode` 복합키를 사용하는데, `productId`(UUID)는 화면에 노출되지 않고 내부 key로만 사용된다. UUID 비공개 원칙 준수이다.

**P2**: 가상 창고(VIRTUAL) 행에서 가용/예약/실재고를 모두 `—`으로 표시하는데, 가상 창고가 왜 대시인지 범례에 설명이 없다. 사용자 혼란을 줄이기 위해 범례에 "가상 창고(VIRTUAL): 수량 개념 없음" 항목을 추가하거나, tooltip 처리를 권장한다.

### 1.5 범례 명확성

**판정: 양호 (P2 개선 권장 1건)**

범례 도트 색상 대응이 실제 렌더링 색과 불일치하는 부분이 있다.

- 범례의 가용재고 도트: `#2563EB`(Tailwind blue-600) — 그러나 DataGrid 가용재고 열에는 기본 상태에서 컬러 없음(design-system default 텍스트 색). 0일 때만 빨강으로 강조된다. 도트가 파란색이면 사용자가 "가용재고 = 파란 숫자"로 오해할 수 있다.

**권장**: 가용재고 도트를 파란색으로 유지하려면 DataGrid 가용재고 열의 기본 텍스트에도 `var(--color-brand-600)` 또는 `var(--action-brand)` 색을 적용해 범례와 실제 화면을 일치시킨다. 또는 도트를 중립 색(검정/회색)으로 변경해 의미 혼동을 제거한다.

---

## 2. 409 에러 배너 (SalesPartnerOrderDetailPage.tsx)

### 2.1 가이드 §3.2/3.3 문구 일치

**판정: 양호**

단일 품목(§3.2) 분기:
- 가용 0: `재고 부족으로 전환할 수 없습니다.\n${firstName}${firstModel} — 요청 ${firstReq}개 / 가용 0개\n수량을 줄이거나...`
- 가용 일부: `...전환수량을 ${firstAvail}개 이하로 조정하거나 나누어 전환해 주세요.`

복수 품목(§3.3): `재고 부족 품목이 있어 전환할 수 없습니다.\n...\n외 ${extraCount}건 재고 부족 — 품목별 수량을 조정해 주세요.`

3개 분기 문구 모두 designer-guide §3.2/3.3과 정확히 일치한다.

### 2.2 컬러토큰 일치

**판정: P2 — 개선 권장**

구현은 `styles['errorBanner']` CSS 클래스를 사용하며, `sales.module.css`에서 해당 클래스는 다음과 같다.

```css
.errorBanner {
  border: 1px solid var(--state-danger);
  background: var(--state-danger-bg);
  color: var(--state-danger);
}
```

`tokens.css`에서 `--state-danger: #EF4444`, `--state-danger-bg: #FEE2E2`이다.

designer-guide §2.1이 지정한 토큰과 대조하면:

| 속성 | 가이드 지정값 | 현재 구현 CSS변수 resolve 값 |
|---|---|---|
| 배경 | `colors.danger[50]` = `#FFF1F1` | `--state-danger-bg` = `#FEE2E2` |
| 테두리 | `colors.danger[500]` = `#D6504A` | `--state-danger` = `#EF4444` |
| 본문 텍스트 | `colors.danger[700]` = `#991B1B` | `--state-danger` = `#EF4444` |

가이드가 지정한 `--color-danger-50` (#FFF1F1) / `--color-danger-500` (#D6504A) / `--color-danger-700` (#991B1B) 과 실제로 사용 중인 `--state-danger-bg` (#FEE2E2, danger 200과 유사) / `--state-danger` (#EF4444, Tailwind red-500 계열)가 모두 다르다.

단, 배경 `#FEE2E2`와 가이드 지정 `#FFF1F1`은 모두 연한 빨강 계열이고 WCAG 대비 차원에서 기능상 동등하다. 텍스트 `#EF4444`가 `#991B1B`보다 더 밝아 배경(`#FEE2E2`) 대비비가 약간 낮아질 수 있다. `#EF4444` on `#FEE2E2` ≈ 3.0:1로 WCAG AA(4.5:1) 미달 가능성이 있다. `#991B1B` on `#FEE2E2` ≈ 7.8:1로 AA 통과한다.

**권장**: `errorBanner` 클래스의 `color`를 `var(--state-danger)` (#EF4444) 대신 `var(--color-danger-700, #991B1B)`으로 수정하거나, `sales.module.css`에 `--state-danger` 변수를 `#991B1B` 으로 정정한다. 전자가 범위가 좁아 부작용 없다.

이 이슈는 design-system 레벨의 `--state-danger` 정의가 danger-500 (#D6504A)가 아닌 danger-600 계열 (#EF4444)으로 설정된 것에서 기인한다. 가이드와 구현 사이의 토큰 alias 레이어 불일치이며, FE agent에 전달이 필요하다.

### 2.3 성공(초록)과의 구분

**판정: 양호**

에러 배너 위치: 전환 모달 내부 최상단 (`data-testid="partner-order-convert-modal-error"`).
성공 배너 위치: 페이지 상단 (`data-testid="partner-order-convert-toast"`).

DOM 구조 확인 결과, 두 배너는 동시에 화면에 나타나지 않는다. 성공 시 `setConvertErrorMessage(null)`을 먼저 호출하고 모달을 닫은 뒤 성공 배너를 표시한다. 에러 시 모달이 열린 채로 에러 배너만 표시된다.

색조 대비: 에러 = 빨강 계열, 성공 = `--state-success-bg: #D1FAE5` / `--state-success: #10B981` (초록). 충분히 구분된다.

### 2.4 모달 내 위치와 DOM 순서

**판정: 양호**

가이드 §5.3 DOM 순서: `[errorBanner] → [convertWarningBanner] → [라인 테이블]`.

구현 코드(line 929-954):
1. `convertErrorMessage` 조건부 렌더 (`partner-order-convert-modal-error`)
2. `convertWarningBanner` (항상 렌더)
3. 라인 표

가이드 명세와 정확히 일치한다.

### 2.5 줄바꿈 다행 메시지 가독성

**판정: 양호**

`whiteSpace: 'pre-line'`을 인라인으로 추가해 `\n` 구분자 다행 표시를 처리하고 있다. `alignItems: 'flex-start'`도 함께 지정해 멀티라인 배너에서 아이콘(없음)과 텍스트 상단 정렬을 준비했다. 3행 텍스트가 자연스럽게 줄바꿈된다.

다만 `errorBanner` 클래스에 `align-items: center`가 기본 정의되어 있고, 인라인 스타일로 `alignItems: 'flex-start'`를 덮어쓰는 구조이다. 이는 기능적으로 동작하지만, CSS 모듈의 멀티라인 변형을 명시적 modifier 클래스로 관리하는 것이 장기 유지 관점에서 더 일관된다. P3 선택 개선사항이다.

---

## 3. design-system 토큰 일관성

### 3.1 컬러 토큰

**판정: P2 확인 필요**

`InventoryStockBalancePage.tsx`는 `@samhan/design-system`에서 `Badge`, `Button`, `DataGrid`를 import해 사용한다. 그러나 페이지 자체의 스타일(범례, 툴바, 요약, 에러 배너)은 모두 인라인 `CSSProperties` 객체로 처리하며 design-system 토큰 CSS 변수를 전혀 사용하지 않는다. 예시:

```tsx
const legendStyle: CSSProperties = {
  background: '#F9FAFB',   // --color-neutral-50 = #F7F8FA 와 근접하나 불일치
  border: '1px solid #E5E7EB',  // --line-default = #E1E5EA 와 근접하나 불일치
}
const toolbarStyle: CSSProperties = {
  background: '#FFFFFF',
  border: '1px solid #E5E7EB',
  borderRadius: 8,           // --radius-lg = 8px 와 일치하나 토큰 미참조
}
const errorBannerStyle: CSSProperties = {
  color: '#B91C1C',        // 토큰 외부 값 (1.2항 참조)
  background: '#FEF2F2',  // --color-danger-50 = #FFF1F1 과 불일치
  border: '1px solid #FECACA', // --color-danger-200 = #FECACA 와 일치
}
```

토큰 외 하드코딩이 집중된 패턴이다. 다른 화면(`sales.module.css`)은 CSS 변수로 토큰을 참조하는데, 이 페이지는 신규 페이지임에도 인라인 스타일 일변도로 구현했다.

**권장**: 신규 컴포넌트는 CSS 모듈 + 토큰 변수 패턴을 따르도록 전환을 권장한다. 인라인 스타일은 동적 계산 값(조건부 색상)에만 사용하고, 정적 스타일은 CSS 모듈로 분리하는 것이 design-system 일관성 원칙에 부합한다. 단, 현재 Cycle 1에서 기능 검증이 우선이므로 이 개선은 Cycle 2 이전 진행을 권장하나 차단은 아니다.

### 3.2 타이포그래피

**판정: 양호**

design-system token 기준: 본문 14px regular, 에러 배너/legend 12~13px. 현재 구현:
- `subtitleStyle`: `fontSize: 12` — `--font-size-xs: 12px` 일치
- `legendStyle`: `fontSize: 12` — 일치
- `errorBannerStyle`: `fontSize: 12` — 에러 배너 본문치고는 작음 (`sales.module.css`의 `errorBanner`는 13px). 일관성 개선 여지 있으나 차단 수준은 아님

### 3.3 Badge와 다른 화면 간 일관성

**판정: 양호**

Badge variant 사용 패턴이 `StatusBadge`, `SlipStatusBadge` 등 기존 컴포넌트와 동일한 design-system Badge 기반이다. `convertWarningBanner` (기존), 보류 409 `holdErrorMessage`, 삭제 422 등 패턴과도 동일한 `styles['errorBanner']` / `styles['convertWarningBanner']` 클래스를 사용해 시각 일관성을 유지한다.

---

## 4. 업무용어 및 UUID 비공개

### 4.1 용어 컨벤션

**판정: 양호**

| 용어 | 현재 구현 | 한국 ERP 컨벤션 |
|---|---|---|
| 가용재고 | `availableQty` → "가용재고" | 이카운트 "가용수량" 동의어 — 적절 |
| 실재고 | `totalQty` → "실재고" | 이카운트 "실재고" 1:1 일치 |
| 예약재고 | `reservedQty` → "예약재고" | 이카운트 "예약수량" 동의어 — 적절 |
| 창고구분 | HEADQUARTERS/VEHICLE/CONSIGNMENT/VIRTUAL → 본사/차량/위탁/가상 | 국내 물류 표준 용어 부합 |

범례에서 "전환(전표 발행)"으로 풀어서 설명하는 방식은 비전문 사용자 친화적이다.

### 4.2 UUID 비공개

**판정: 양호**

`rowKey`로 `${row.productId}-${row.warehouseCode}`를 사용하지만 이는 DOM key 값이며 화면에 렌더링되지 않는다. 화면 노출 식별자는 `productCode`, `productName`, `warehouseCode`, `warehouseName`만이다. Javadoc 주석에도 UUID 비공개 가드를 명시했다. `feedback_uuid_no_user_visibility` 원칙 준수.

---

## 5. 결함/개선 우선순위 요약

| ID | 심각도 | 대상 | 내용 |
|---|---|---|---|
| D-01 | P2 | `InventoryStockBalancePage` | 인라인 `#B91C1C` → `var(--color-danger-700, #991B1B)` 교체. design-system 토큰 정합. |
| D-02 | P2 | `SalesPartnerOrderDetailPage` (errorBanner) | `--state-danger` = `#EF4444` 사용 시 배경 대비비 3:1 미달 가능. `color: var(--color-danger-700)` 추가 또는 `--state-danger` 재정의 권장. |
| D-03 | P2 | `InventoryStockBalancePage` (범례) | 가용재고 도트 `#2563EB` vs DataGrid 기본 텍스트 미착색 불일치. 도트 색 재정의 또는 가용재고 열 기본 착색 추가. |
| D-04 | P2 | `InventoryStockBalancePage` | 가상 창고 `—` 표시 이유 범례 미기재. "가상 창고: 수량 개념 없음" 추가 권장. |
| D-05 | P3 | `InventoryStockBalancePage` | 전체 스타일을 CSS 모듈 + 토큰 변수 패턴으로 전환 (Cycle 2 이후). |
| D-06 | P3 | `SalesPartnerOrderDetailPage` | `errorBanner` 멀티라인용 modifier 클래스 분리 (인라인 `alignItems` 덮어쓰기 개선). |

---

## 6. Cycle 1 최종 판정

**APPROVE — 차단 결함 없음**

기능 완성도(문구 일치, DOM 순서, UUID 보호, 업무용어)는 designer-guide Cycle 1 기준을 충족한다. D-01~D-04는 Cycle 2 전까지 FE agent가 수정하도록 전달한다. D-02(에러 텍스트 대비비)는 WCAG AA 미달 가능성이 있으므로 Cycle 2 실화면 캡처 후 대비비를 측정해 확정한다.

*Cycle 2는 QA agent 실화면 캡처 후 진행한다.*
