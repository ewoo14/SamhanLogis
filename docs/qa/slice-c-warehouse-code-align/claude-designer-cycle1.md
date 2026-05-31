# Designer Review — Slice C 출고 창고 선택 UI
## claude-designer-cycle1

**리뷰 대상**
- `clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx` (출고전표 전환 모달, 969~981번 라인)
- `clients/web/design-system/src/components/WarehouseSelector/WarehouseSelector.tsx`
- `clients/web/design-system/src/components/WarehouseSelector/WarehouseSelector.module.css`

**결론: CHANGES_REQUESTED**

---

## Findings

### [P1] 미선택 시 에러 텍스트 부재 — 제출 시도 후 이유 불명확

**위치**: `SalesPartnerOrderDetailPage.tsx` 911~919번 라인 (footer 버튼), `WarehouseSelector.tsx` 116~162번 라인

**문제**:
전환 버튼이 `disabled={!convertWarehouse || ...}` 로 비활성화되지만, 사용자가 창고를 선택하지 않은 상태에서 버튼이 왜 눌리지 않는지 알 수 없다. `WarehouseSelector` 에 `error` prop이 존재하고 `FormField`가 에러 텍스트를 `role="alert"`로 표출하는 인프라가 갖춰져 있음에도(FormField.tsx 66번 라인), 이 흐름에서 `error` prop이 전혀 전달되지 않는다. disabled 버튼만으로는 "창고를 선택해야 한다"는 명시적 안내가 없다.

이카운트 판매입력 레퍼런스(`20260509_091636.png`)에서 "출하창고" 필드는 헤더 영역에 독립 필드로 배치되어 있고, 필수값 미입력 시 별도 경고(이카운트 패턴: 빨간 테두리 + 인라인 경고 메시지)를 제공한다. 현재 구현은 이 패턴 절반(disabled)만 채택하고 인라인 에러 메시지를 누락했다.

**제안**: 전환 버튼 클릭 시도 시(또는 모달 내 첫 유효성 검사 시점에) `convertWarehouse === null` 이면 `WarehouseSelector`에 `error="출고 창고를 선택해 주세요"` 를 전달하여 FormField 에러 텍스트가 표출되도록 한다. 버튼 disabled 해제 조건은 유지하되, 에러 메시지를 병행 제공해야 한다.

---

### [P1] `warehousesQuery` 로딩/에러 상태 처리 부재 — 빈 드롭다운 무방비

**위치**: `SalesPartnerOrderDetailPage.tsx` 970~981번 라인

**문제**:
```tsx
warehouses={warehousesQuery.data ?? []}
```
창고 목록 API 로딩 중(`warehousesQuery.isLoading === true`)이거나 에러 발생 시 `[]` 빈 배열이 전달된다. WarehouseSelector는 빈 배열이면 placeholder option 하나만 렌더링하며, 사용자에게 "로딩 중"인지 "창고가 없음"인지 "오류"인지 구분할 수 없다. 현재 `disabled` prop은 `convertMutation.isPending` 만 보고 있어 창고 데이터 미준비 상태에서도 드롭다운이 활성 상태다.

`WarehouseSelector.tsx`에는 loading/error 상태를 받는 prop이 없고, CSS에도 skeleton/loading indicator 처리가 없다.

**제안**: `disabled={convertMutation.isPending || warehousesQuery.isLoading}` 으로 확장하고, `warehousesQuery.isError` 시 `error="창고 목록을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요."` 를 전달한다. 또는 `WarehouseSelector`에 `loading?: boolean` prop을 추가하여 "로딩 중…" placeholder를 표출한다.

---

### [P2] WarehouseSelector 배치 위치 — 경고 배너와 품목 테이블 사이 marginBottom 단독 적용

**위치**: `SalesPartnerOrderDetailPage.tsx` 970번 라인

**문제**:
```tsx
<div data-testid="partner-order-convert-warehouse" style={{ marginBottom: 'var(--space-3)' }}>
```
`style` 인라인 prop에 `marginBottom: 'var(--space-3)'`(= 12px) 만 단독 적용. `marginTop`이 없어 위 경고 배너(`.convertWarningBanner`, `margin-bottom: 12px`) 와의 간격이 12+0=12px이다. 반면 WarehouseSelector와 아래 테이블 사이는 WarehouseSelector 자체의 `marginBottom: 12px` 만 확보된다.

현재 배치 순서(에러배너 → 비가역 경고 → 창고선택 → 품목테이블)는 흐름상 적절하지만, 창고선택 위쪽 여백이 경고배너 `margin-bottom`에만 의존하여 간격이 구조적으로 명시되지 않는다. `convertWarningBanner`가 `marginBottom: 12px`를 갖고 있으므로 실제 렌더는 12px 이지만, 인라인 style 을 통한 단방향 여백 의존은 나중에 배너가 조건부 숨김될 때 여백이 사라지는 레이아웃 이탈을 유발할 수 있다.

**제안**: `style={{ marginTop: 'var(--space-3)', marginBottom: 'var(--space-3)' }}`로 양방향 여백을 명시하거나, 모달 바디에 `display: flex; flex-direction: column; gap: var(--space-3)` 레이아웃을 적용하여 모든 섹션 간격을 일관 처리한다.

---

### [P2] 옵션 텍스트 포맷 — 코드 노출 여부

**위치**: `WarehouseSelector.tsx` 149번 라인

**문제**:
```tsx
{`${w.code} · ${w.name} (${TYPE_LABEL[w.type]})`}
```
창고 코드(`HQ-001`, `VH-001` 등)가 옵션 텍스트 최전면에 노출된다. UUID 비공개 가드(`feedback_uuid_no_user_visibility.md`)는 UUID에 한정하지만, 이카운트 판매입력 레퍼런스(`20260509_091636.png`)의 "출하창고" 필드는 창고명만 표출(코드 미노출)한다. 출고 업무 담당자가 "HQ-001"과 같은 시스템 코드를 직접 인식해야 하는 상황이 아니라면, 코드 노출은 인지 부하를 높인다.

**제안**: 출고 맥락(hideVirtual=true 사용 시 또는 `mode="dispatch"` 별도 prop)에서 `w.name (${TYPE_LABEL[w.type]})` 형태로 코드를 숨기는 옵션을 제공한다. 단, 창고명 중복 가능성이 있으면 코드를 작은 보조 텍스트로 유지하는 것이 허용된다. 우선순위는 창고명이어야 한다.

---

### [P2] `WarehouseSelector.module.css` focus ring 색상 하드코딩

**위치**: `WarehouseSelector.module.css` 42번 라인

**문제**:
```css
box-shadow: 0 0 0 3px rgba(45, 119, 168, 0.18);
```
focus ring 색상이 `var(--color-brand-500)` (#2D77A8) 의 RGB 값으로 하드코딩되어 있다. dark theme 오버라이드 시 `--color-brand-500`이 변경(tokens.css 424번 라인: dark에서 `#5093C0`로 역전)되어도 focus ring은 고정값이 유지된다.

hasError focus ring(55번 라인)의 `rgba(214, 80, 74, 0.18)` 도 동일 패턴.

**제안**: `box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-brand-500) 18%, transparent)` 또는 `rgba`를 CSS variable로 분리한다. 단기적으로는 `var(--focus-ring-brand, rgba(45,119,168,0.18))` 토큰 패턴을 적용한다.

---

### [P2] `convertQtyMap` 전체 0일 때 disabled — 창고 선택과 복합 disabled 원인 구분 불가

**위치**: `SalesPartnerOrderDetailPage.tsx` 915~919번 라인

**문제**:
```tsx
disabled={
  convertMutation.isPending ||
  !query.data ||
  !convertWarehouse ||
  Object.values(convertQtyMap).every((q) => q <= 0)
}
```
버튼이 비활성화되는 조건이 4가지이나 사용자는 어떤 조건 때문인지 알 수 없다. 특히 창고 미선택 + 수량 미입력이 동시 발생 시 우선순위 안내가 없다.

**제안**: 버튼 tooltip 또는 footer 영역 보조 텍스트로 미충족 조건 1가지를 우선 안내한다. 최소한 창고 미선택 시 버튼 바로 위에 "출고 창고를 선택하세요" 텍스트를 표출하는 것이 이카운트 ERP 패턴과 일관한다.

---

### [결함 없음] 항목 (양호 판정)

- **hideVirtual 맥락 적합성**: 출고 전표는 물리 재고 차감 대상이므로 가상창고 제외(`hideVirtual={true}`) 처리는 업무 관례상 정확하다. WarehouseSelector 주석(43번 라인)에도 "출고/이동 화면에선 true 권장" 명시.
- **창고명 단독 표출(UUID 비공개)**: `w.id`는 React `value`와 onChange 내부에서만 사용되고 화면 텍스트(`w.code · w.name`)로만 노출. UUID는 화면 미노출. P2 finding은 코드 노출 관련이며 UUID는 정상 처리.
- **isPending disabled**: `convertMutation.isPending` 시 WarehouseSelector `disabled={true}` 전달(979번 라인) — 전환 중 창고 변경 차단 적절.
- **토큰 일관성**: WarehouseSelector.module.css의 `var(--space-2)`, `var(--space-3)`, `var(--color-border)`, `var(--color-bg)`, `var(--color-text)`, `var(--color-bg-muted)`, `var(--color-text-muted)`, `var(--color-brand-500)`, `var(--color-danger)`, `var(--radius-md)`, `var(--duration-fast)` 모두 tokens.css 정의 토큰 사용. 하드코딩 px/색상 없음. (focus ring RGB 값 예외 — P2 finding으로 분리.)
- **배치 위계**: 비가역 경고 배너 → 창고 선택 → 품목 테이블 순서는 "먼저 주의 확인 → 필수 조건 선택 → 세부 수량 입력"의 업무 흐름과 일치. 적절.
- **label/placeholder 문구**: "출고 창고" / "출고 창고를 선택하세요" — 한국 ERP 관행(이카운트 "출하창고")과 충분히 정합하며 명확하다.
- **비활성 창고 처리**: `active: false` 창고는 `option disabled` + `.optionInactive` 회색+이탤릭 처리(WarehouseSelector.tsx 146~148번 라인). 단, `listWarehouses()`가 BE 응답에서 항상 `active: true`를 강제 주입(inventory.ts 66번 라인)하므로 실제로 비활성 창고가 드롭다운에 나타나는 경우는 없다. 이는 WarehouseSelector 단독 재사용성 측면에서 아키텍처 이슈이나 현재 출고 전환 맥락에서는 기능 결함 아님.

---

## 요약

| 번호 | 등급 | 위치 | 항목 |
|------|------|------|------|
| F-1 | P1 | SalesPartnerOrderDetailPage.tsx 911~919 | 미선택 시 에러 텍스트 부재 |
| F-2 | P1 | SalesPartnerOrderDetailPage.tsx 970~980 | 창고목록 로딩/에러 상태 미처리 |
| F-3 | P2 | SalesPartnerOrderDetailPage.tsx 970 | marginTop 누락 — 양방향 여백 미명시 |
| F-4 | P2 | WarehouseSelector.tsx 149 | 옵션 코드 노출 — 창고명 우선 표시 필요 |
| F-5 | P2 | WarehouseSelector.module.css 42 | focus ring 색상 하드코딩 |
| F-6 | P2 | SalesPartnerOrderDetailPage.tsx 915~919 | 복합 disabled 원인 구분 불가 |

**결론: CHANGES_REQUESTED** — P1 2건(에러 텍스트, 로딩 상태), P2 4건. 합계 finding 6건.
