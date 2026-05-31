# Designer 리뷰 — D2 MergeConvertDialog (사이클 2)

> 리뷰어: Designer
> 대상 파일:
> - `clients/desktop/src/renderer/routes/components/MergeConvertDialog.tsx`
> - `clients/desktop/src/renderer/routes/SalesPartnerOrderListPage.tsx`
> - `clients/desktop/src/renderer/components/sales/sales.module.css`
> 참조 가이드: `docs/design/d2-merge-convert-dialog-guide.md`
> 날짜: 2026-05-31
> 사이클 1 결함 기준: `docs/qa/slice-d2-order-merge/claude-designer-cycle1.md`

---

## 판정: APPROVE

P1 결함 4건 전부 해소. P2 결함 7건 중 5건 해소, 2건 잔존 (P2-3 타이틀, P2-6 discountInfo — 모두 허용 수준으로 판단, 아래 상세 기술).

---

## P1 검증 결과

### P1-1. 비가역 경고 배너 — danger 토큰 격상 O

`sales.module.css` 1085-1094행:
```css
/* 병합 전환 모달: 비가역 경고 배너 (다중주문 — danger 빨강으로 격상, 가이드 §2.1) */
.mergeConvertWarningBanner {
  margin-bottom: var(--space-4, 16px);
  padding: var(--space-3, 12px) var(--space-4, 16px);
  border: 1px solid var(--color-danger-200, #fecaca);
  border-radius: var(--radius-md, 4px);
  background: var(--color-danger-50, #fff1f1);
  color: var(--color-danger-700, #991b1b);
  font-size: var(--font-size-sm, 13px);
}
```

가이드 §2.1 토큰 명세(background `--color-danger-50` / border `--color-danger-200` / color `--color-danger-700` / padding `--space-3 --space-4` / radius `--radius-md` / margin-bottom `--space-4` / font-size `--font-size-sm`)와 전항 일치.

`MergeConvertDialog.tsx` 396행에서 `styles['mergeConvertWarningBanner']` 참조. 기존 `.convertWarningBanner`(warning 오렌지)와 완전 분리 확인.

**해소 O**

---

### P1-2. 충돌 섹션 — 라디오+직접입력 혼합 패턴 + 4-AND 비활성 O

`MergeConvertDialog.tsx` 구현 확인:

1. 직접입력 세 번째 라디오 (`value="__custom__"`, `data-testid="merge-convert-conflict-{key}-radio-custom"`) — 508-531행 구현됨.
2. 직접입력 텍스트 인풋은 `disabled={!isCustomSelected || mergeMutation.isPending}` — 직접입력 라디오 선택 시에만 활성, 정상.
3. 타이핑 시 `setShippingFields((prev) => ({ ...prev, [key]: '__custom__' }))` 자동 라디오 선택 유지 — 라디오 해제 버그 수정됨.
4. `hasUnresolvedConflict` 계산(225-233행):
   - `selected === undefined` → 미선택 true
   - `selected === '__custom__' && !customInputs[key]?.trim()` → 직접입력 빈값 true
5. `canSubmitBase = !isLoadingDetails && hasSomeQty && !!selectedWarehouse && !hasUnresolvedConflict` — 4-AND 조건 모두 포함(271-275행).

`data-testid="merge-convert-conflict-{key}-radio-custom"` QA testid도 확인됨.

**해소 O**

---

### P1-3. 버튼 텍스트 O

`MergeConvertDialog.tsx` 388행:
```tsx
{mergeMutation.isPending ? '병합 발행 중…' : '병합 발행 →'}
```

가이드 §2.7 지정 레이블 `"병합 발행 →"` / `"병합 발행 중…"` 정확 일치.

**해소 O**

---

### P1-4. 비가역 경고 카피 — "재고 예약" + {M}개 품목 O

`MergeConvertDialog.tsx` 394-405행:
```tsx
<strong>주의:</strong> 병합 발행 후에는 출고전표가 즉시 생성되며 재고가 예약됩니다.{' '}
이 작업은 되돌릴 수 없습니다.
{convertItemCount > 0
  ? ` (${selectedOrders.length}개 주문, ${convertItemCount}개 품목 전환 예정)`
  : null}
```

`convertItemCount = Object.values(qtyMap).filter((q) => q > 0).length` (267행) — 가이드 §2.1 `{M}` 계산식과 일치.

"재고가 예약됩니다" 문구 포함, `{N}개 주문, {M}개 품목 전환 예정` 동적 카피 적용, `convertItemCount === 0`이면 괄호 생략(가이드 §2.1 명시 규칙) 모두 충족.

**해소 O**

---

## P2 검증 결과

### P2-1. 충돌 섹션 색상 토큰화 O

`MergeConvertDialog.tsx` 430-436행 (충돌 섹션 background/border):
```tsx
background: 'var(--color-warning-50, #fef6e7)',
border: '1px solid var(--color-warning-200, #f8da9a)',
```

439-444행 (충돌 아이콘 텍스트 색):
```tsx
color: 'var(--color-warning-700, #b47a1f)',
```

468-471행 (필드 라벨 색):
```tsx
color: 'var(--color-warning-700, #b47a1f)',
```

596-599행 (그룹 헤더 거래처명 보조 텍스트):
```tsx
color: 'var(--color-neutral-500, #6b7280)',
```

664-666행 (합계 소자):
```tsx
color: 'var(--color-neutral-500, #6b7280)',
```

그룹 헤더 배경(587행) `'var(--color-neutral-50, #f7f8fa)'` — 가이드 §3.1 및 §D-UI-03 결정 준수.

사이클 1에서 지적한 `background: '#FFFBEB'`, `'#FDE68A'`, `'#1E40AF'`, `'#EFF6FF'` 하드코딩 전항 제거 확인.

**해소 O**

---

### P2-2. 상태 배지 — Badge 컴포넌트 + variant 매핑 O

`MergeConvertDialog.tsx` 572-573행:
```tsx
const statusVariant = order.status === 'ON_HOLD' ? 'neutral' : 'warning'
```
603-605행:
```tsx
<Badge variant={statusVariant}>
  {PARTNER_ORDER_STATUS_LABEL_LOCAL[order.status]}
</Badge>
```

가이드 §2.4 매핑(DRAFT → `"warning"`, ON_HOLD → `"neutral"`) 정확 준수. `Badge` 컴포넌트 import도 37-47행에서 확인됨.

DRAFT가 파란 span으로 잘못 표시되던 사이클 1 결함 수정됨.

**해소 O**

---

### P2-3. 모달 타이틀 — 잔존 (허용)

`MergeConvertDialog.tsx` 359행:
```tsx
title="출고전표 병합 전환"
```

가이드 §1.1 명세 `"출고전표 병합 전환"`과 **일치**. 사이클 1 리뷰 당시 구현값이 `"출고전표로 병합 전환"`(버튼 레이블 문구)이었으나, 이번 fix에서 `"출고전표 병합 전환"`으로 수정됨.

**해소 O**

---

### P2-4. 오류 배너 위치 O

`MergeConvertDialog.tsx` 본문 렌더링 순서 확인:
1. 394행: [A] 비가역 경고 배너 (`mergeConvertWarningBanner`) — 최상단
2. 407행: [B] 창고 선택 (`WarehouseAutocomplete`)
3. 427행: [C] 충돌 섹션
4. 567행: [D] 라인 그룹 표
5. 678행: [F] 오류 배너

가이드 §1.1 레이아웃 순서(A → B → C → D → F)와 정확 일치. 비가역 경고가 항상 최상단 위치 확인.

**해소 O**

---

### P2-5. autoFocus O

`MergeConvertDialog.tsx` 188-197행:
```tsx
const warehouseWrapRef = useRef<HTMLDivElement>(null)
useEffect(() => {
  const input = warehouseWrapRef.current?.querySelector<HTMLInputElement>('input[role="combobox"]')
  if (input) {
    const tid = setTimeout(() => input.focus(), 80)
    return () => clearTimeout(tid)
  }
}, [])
```

`autoFocus` prop 대신 `useRef + setTimeout(80ms)` 방식으로 구현. 이는 Modal 애니메이션 완료 후 포커스를 보장하는 패턴으로 결과는 동일하다. 가이드 §2.2 / §5.1 요건 충족.

**해소 O**

---

### P2-6. discountInfo 충돌 감지 누락 — 잔존 (허용)

`MergeConvertDialog.tsx` 77-86행 주석 및 `ShippingFieldKey` 타입에 `discountInfo` 미포함.

이는 사이클 1 리뷰에서 이미 "BE 구조상 `PartnerOrderDetail`에 `discountInfo` 미포함이라 실질적 결함 없음"으로 분류됨. 구현 파일 주석(78행)에 `"가이드 §9 미결 항목으로 추적"` 명시. 가이드 §9 미결 항목 테이블에도 포함되어 있다.

BE 데이터 구조상 제약이므로 FE 단독으로 해소 불가. 가이드-구현 불일치는 추적 중이며 실 사용자 영향 없음.

**잔존 — 허용 (BE 구조 제약, 가이드 §9 추적 중)**

---

### P2-7. 성공 토스트 카피 / 4초 소멸 O

`SalesPartnerOrderListPage.tsx` 156-162행:
```tsx
setConvertSuccessMessage(
  `출고전표 ${slipNo} 발행 완료 — ${convertedOrderNos.length}개 주문 병합 전환`,
)
setSelectedOrderNumbers(new Set())
// 4초 후 토스트 자동 소멸
setTimeout(() => setConvertSuccessMessage(null), 4000)
```

가이드 §2.7 카피 `"출고전표 {slipNo} 발행 완료 — {N}개 주문 병합 전환"` 정확 일치.
소멸 타이머 4000ms (사이클 1: 3000ms → 4000ms 수정) 확인.

**해소 O**

---

## 추가 확인 — 사이클 1 미포함 항목

### 요약 합계 행 data-testid

가이드 §7 testid 목록에 `merge-convert-summary` 명시되어 있으나 구현에서 `data-testid="merge-convert-summary"` 래퍼 없음. 현재 합계는 주문별 하단 소자(`{krw(detail.totalAmount)}원`)만 있고 가이드 §2.5 "총 라인 수 + 전환 예정 수량 합계" 요약 행 자체가 미구현. 그러나 이는 사이클 1 지적 범위 밖이고 기능 흐름에 영향 없으므로 P3 수준 메모만 남김.

### data-testid 불일치 — merge-convert-modal-error vs merge-convert-error

Javadoc(34행)은 `merge-convert-modal-error`, 가이드 §7은 `merge-convert-error`, 실 구현(683행)은 `data-testid="merge-convert-error"`. 가이드 기준으로는 일치, Javadoc과 불일치. 실 QA 자동화는 가이드 §7 기준이므로 문제 없음.

---

## 종합 요약

| 번호 | 중요도 | 해소 여부 | 비고 |
|---|---|---|---|
| P1-1 | P1 | O | `.mergeConvertWarningBanner` 신규 클래스, danger 토큰 전항 적용 |
| P1-2 | P1 | O | 직접입력 세 번째 라디오 + 4-AND canSubmit 조건 구현 |
| P1-3 | P1 | O | `'병합 발행 →'` / `'병합 발행 중…'` 정확 일치 |
| P1-4 | P1 | O | "재고 예약" 문구 + {M}개 품목 동적값 포함 |
| P2-1 | P2 | O | 충돌 섹션 및 그룹 헤더 색상 전항 토큰화 |
| P2-2 | P2 | O | Badge 컴포넌트 + DRAFT=warning/ON_HOLD=neutral 매핑 |
| P2-3 | P2 | O | 타이틀 `"출고전표 병합 전환"` 가이드 §1.1 일치 |
| P2-4 | P2 | O | 오류 배너 렌더링 순서 가이드 §1.1 일치 |
| P2-5 | P2 | O | useRef+setTimeout(80ms) autoFocus 구현 |
| P2-6 | P2 | 잔존(허용) | BE 구조 제약, 가이드 §9 미결 추적 중 |
| P2-7 | P2 | O | 카피 + 4초 소멸 일치 |

**P1 결함 4건 전부 해소 확인. APPROVE.**
