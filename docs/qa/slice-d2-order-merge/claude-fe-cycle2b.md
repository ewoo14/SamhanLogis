# FE 코드 리뷰 — Phase 2.6b D2 다중주문 병합 전환 (사이클 2b 재리뷰)

헤드 커밋: `3be5a27e` (fix(d2): 5-team 사이클 1 리뷰 반영 (BE/FE/Designer/QA/DevOps))
기준: 현재 워킹트리 실제 파일 직접 읽기 (git diff origin/main...HEAD 대상 파일 전량 확인)
리뷰어: Claude FE (2026-05-31)

---

## 검증 기준

사이클 2 리뷰(커밋 `acc28984` 기준 stale 판정 — `3be5a27e` fix 미커밋 상태)가
CHANGES_REQUESTED 를 내렸던 항목들이 현재 워킹트리에 실제 반영되어 있는지
파일을 직접 읽어 교차 검증한다.

---

## 항목별 해소 여부

### ① sales.ts `partnerOrderId` 주석 정정

**검증 파일:** `clients/desktop/src/renderer/api/sales.ts` L519-526

```typescript
/**
 * 병합 전환 대상 주문 1건 + 선택 라인.
 * partnerOrderId 는 사용자 화면에 미노출 (orderLineId 도 동일).
 */
export interface MergeConvertOrderItems {
  /**
   * 주문번호 또는 UUID — FE 는 orderNumber 전달.
   * BE `PartnerOrderIdResolver` 양용 허용.
   * 사용자 화면 노출 금지.
   */
  partnerOrderId: string
```

사이클 2 결함(P0-1): "UUID 문자열" 주석이 그대로라서 다음 개발자가 UUID를 전달할 위험.

현재 파일 확인 결과: 인터페이스 상단 JSDoc 에서 "UUID 문자열" 표현이 제거되었고, 필드 주석이 "주문번호 또는 UUID — FE 는 orderNumber 전달. BE `PartnerOrderIdResolver` 양용 허용. 사용자 화면 노출 금지." 로 교체되었다. `MergeConvertDialog.tsx` 내 `mutationFn` 주석도 "BE 확정 (2026-05-31): partnerOrderId 필드 = 주문번호(orderNumber) 또는 UUID — BE PartnerOrderIdResolver 양용 허용. FE 는 orderNumber 를 전달한다." 로 일치.

**결과: O (해소)**

---

### ② mock.ts `orderNo` 고정값 반환

**검증 파일:** `clients/desktop/src/renderer/api/mock.ts` (해당 블록 검색)

```typescript
// BE 확정 응답 형태: orderNo(주문번호) + orderStatus + fullyConverted.
// 실 BE 는 PartnerOrderIdResolver 로 주문을 찾은 뒤 DB 의 orderNumber 컬럼을 orderNo 에 반환.
// mock 고정 주문번호 상수로 BE 동작을 모사 — '2026/05/04-1', '2026/05/31-3' (DRAFT mock rows).
const MOCK_ORDER_NOS = ['2026/05/04-1', '2026/05/31-3', '2026/05/05-2', '2026/05/31-4']
return envelope({
  slipNo: 'SL-20260531-MERGE-001',
  convertedOrders: orders.map((_, idx) => ({
    orderNo: MOCK_ORDER_NOS[idx] ?? `2026/05/31-${idx + 1}`,
    orderStatus: 'CONVERTED',
    fullyConverted: true,
  })),
})
```

사이클 2 결함(P0-2): `o.partnerOrderId` pass-through 였으나, 고정 상수 배열(`MOCK_ORDER_NOS`) 을 도입하여 인덱스 기반으로 실 주문번호를 반환하도록 변경. 요청 전달 값과 독립적으로 BE 실동작(DB `orderNumber` 컬럼 반환)을 모사. 고정값은 DRAFT mock 행의 `orderNumber`('2026/05/04-1', '2026/05/31-3') 와 정확히 일치.

**결과: O (해소)**

---

### ③ `qtyMap` `useEffect` 초기화

**검증 파일:** `clients/desktop/src/renderer/routes/components/MergeConvertDialog.tsx` L160-174

```typescript
// FE P1-1: qtyMap 초기화 — useEffect 로 React 18 StrictMode 안전하게 처리
useEffect(() => {
  if (isLoadingDetails || orderDetails.length !== selectedOrders.length) return
  const initMap: Record<string, number> = {}
  orderDetails.forEach((detail, oi) => {
    if (!detail) return
    detail.lines.forEach((line) => {
      const remaining = line.quantity - (line.convertedQuantity ?? 0)
      if (remaining > 0) {
        initMap[`${oi}-${line.lineId}`] = remaining
      }
    })
  })
  setQtyMap(initMap)
}, [isLoadingDetails, orderDetails.length])
```

사이클 2 결함(P1-1): 렌더 단계 `setState` (`qtyInitialized` flag + 렌더 중 직접 호출) → React 18 StrictMode 이중 실행 불안정.

현재 파일 확인 결과: `qtyInitialized` state 완전 제거, `useEffect` + `[isLoadingDetails, orderDetails.length]` 의존 배열로 교체. 사이클 1 FE 리뷰가 제시한 수정 방향과 100% 일치.

**결과: O (해소)**

---

### ④ `discountInfo` `ShippingFieldKey` 제거

**검증 파일:** `MergeConvertDialog.tsx` L80-86 (ShippingFieldKey 타입), L88-94 (SHIPPING_FIELD_LABEL), L97-103 (SHIPPING_FIELD_PLACEHOLDER)

```typescript
type ShippingFieldKey =
  | 'partnerName'
  | 'shippingAddress'
  | 'receiverPhone'
  | 'paymentDueLabel'
  | 'memo'
```

`SHIPPING_FIELD_LABEL`, `SHIPPING_FIELD_PLACEHOLDER`, `extractShippingFieldValue`, `resolvedShippingInfo` 빌드 루프, `conflictFields` 계산 루프 모두 5개 키만 포함. `discountInfo` 키가 타입·라벨·빌드 루프 전체에서 제거됨.

사이클 2 결함(P1-2): `discountInfo` 가 `ShippingFieldKey` 타입·라벨·빌드 루프에 잔존하여 코드 의도 불명확. "제거하거나 별도 입력 UI 제공" 요구.

현재: 타입 정의·라벨·placeholder·빌드 루프 전체에서 `discountInfo` 완전 제거. 다만 L77-79 주석에 "NOTE: `discountInfo` 는 PartnerOrderDetail 에 미포함(BE 구조 제약)이므로 충돌 감지 대상에서 제외한다 (가이드 §9 미결 항목으로 추적)." 라고 명시하여 향후 추적 가능.

**결과: O (해소)**

---

### ⑤ 단건 캐시 `['partner-order', orderNo]` 무효화

**검증 파일:** `clients/desktop/src/renderer/routes/SalesPartnerOrderListPage.tsx` L154-170

```typescript
const handleMergeDialogSuccess = async (slipNo: string, convertedOrderNos: string[]) => {
  setMergeDialogOpen(false)
  // FE P2: 토스트 카피 — N개 주문 병합 전환 + 4초 소멸 (가이드 §2.7)
  setConvertSuccessMessage(
    `출고전표 ${slipNo} 발행 완료 — ${convertedOrderNos.length}개 주문 병합 전환`,
  )
  setSelectedOrderNumbers(new Set())
  // 4초 후 토스트 자동 소멸
  setTimeout(() => setConvertSuccessMessage(null), 4000)
  // FE P1-4: 목록 캐시 + 전환된 각 주문 단건 캐시 무효화
  await queryClient.invalidateQueries({ queryKey: ['partner-orders'] })
  await Promise.all(
    convertedOrderNos.map((orderNo) =>
      queryClient.invalidateQueries({ queryKey: ['partner-order', orderNo] }),
    ),
  )
}
```

사이클 2 결함(P1-4): `onSuccess` 시그니처 `(slipNo: string)` 로 `convertedOrderNos` 미전달, 단건 캐시 미무효화.

현재: 시그니처 `(slipNo: string, convertedOrderNos: string[])` 로 확장, `Promise.all` 로 각 주문 단건 캐시 `['partner-order', orderNo]` 무효화. `MergeConvertDialog.tsx` 의 `onSuccess` 콜백도 `result.convertedOrders.map((o) => o.orderNo)` 를 전달하도록 수정됨.

**결과: O (해소)**

---

### ⑥ Playwright `waitForTimeout` 제거 + 재고부족 409 시나리오 + testid 일치

#### (a) `waitForTimeout` 제거

**검증 파일:** `playwright/d2-order-merge/d2-order-merge.spec.ts` 전체 파일

`waitForTimeout` 키워드 검색 결과: 파일 전체에서 `waitForTimeout` 호출 0건. 시나리오 1 (L154), 시나리오 3 (L210) 모두 `await expect(checkboxes.first()).toBeVisible({ timeout: 10_000 })` 로 교체됨. 주석 "waitForTimeout → toBeVisible 단언으로 교체 (FE P1-5)" 포함.

**결과: O (해소)**

#### (b) 재고부족 409 시나리오(E-1) 추가

시나리오 E-1 (`mockMerge409=stock` 파라미터)이 L365-396 에 추가됨. mock.ts 에 `mock409 === 'stock'` 분기 → 409 `'재고 부족: 실외기(AJ040RXH4BC1) 요청 2, 가용 0'` 응답 존재. `MergeConvertDialog.tsx` `onError` 에도 `beMessage?.includes('재고 부족')` 분기 및 한국어 메시지 포맷(`재고 부족으로 병합 발행할 수 없습니다.\n${beMessage}\n수량을 줄이거나 담당자에게 재고 보충을 요청해 주세요.`) 구현됨.

**결과: O (해소)**

#### (c) testid 일치 확인 — `merge-convert-error` vs `merge-convert-modal-error`

사이클 2 신규결함(N1-P1): spec 에서 `page.getByTestId('merge-convert-error')` 를 사용하나 컴포넌트 실제 `data-testid` 는 `"merge-convert-modal-error"` 라고 판정.

현재 파일 교차 확인:
- `MergeConvertDialog.tsx` L683: `data-testid="merge-convert-error"` (실제 컴포넌트)
- `d2-order-merge.spec.ts` L355, L390: `page.getByTestId('merge-convert-error')` (spec)
- JSDoc 헤더 L34: `{@code merge-convert-modal-error}` (문서 — 사이클 2 당시 사용됐던 오래된 명칭)

결론: **컴포넌트 실제 testid = `merge-convert-error`, spec = `merge-convert-error` 로 일치한다.** JSDoc 헤더에만 `merge-convert-modal-error` 가 남아 있으나 이는 문서 불일치일 뿐이며 실제 테스트 실행에는 영향 없다. 사이클 2 리뷰 시점에서는 컴포넌트에 `merge-convert-modal-error` 가 있었고 spec 에 `merge-convert-error` 가 있어 불일치였으나, 현재는 컴포넌트 testid 가 `merge-convert-error` 로 정정되어 spec 과 일치.

**결과: O (해소)**

---

### ⑦ 비가역 danger 배너

**검증 파일:** `clients/desktop/src/renderer/components/sales/sales.module.css` L1085-1094, `MergeConvertDialog.tsx` L395-405

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

컴포넌트에서 `className={styles['mergeConvertWarningBanner']}` 사용. warning 오렌지 계열 `convertWarningBanner` 가 아닌 신규 `mergeConvertWarningBanner` 클래스를 danger 토큰(`--color-danger-50`, `--color-danger-200`, `--color-danger-700`)으로 정의하여 적용.

사이클 2 결함(Designer: danger 토큰): `convertWarningBanner`(warning 오렌지)를 그대로 사용.

**결과: O (해소)**

---

### ⑧ 4-AND 제출 조건 + 충돌 라디오/직접입력

**검증 파일:** `MergeConvertDialog.tsx` L224-275

4-AND 조건:
```typescript
const hasUnresolvedConflict = conflictFields.some((key) => {
  const selected = shippingFields[key]
  if (selected === undefined) return true
  if (selected === '__custom__') {
    return !customInputs[key]?.trim()
  }
  return false
})

const canSubmitBase =
  !isLoadingDetails &&
  hasSomeQty &&
  !!selectedWarehouse &&
  !hasUnresolvedConflict
```

충돌 필드 존재 + 미선택 시 `hasUnresolvedConflict = true` → `canSubmitBase = false` → 버튼 비활성. 직접입력 라디오 선택 후 텍스트 미입력 시도 차단 포함.

충돌 라디오 구조: 각 주문 값 라디오 + 3번째 "직접 입력 (/ 병기 등)" 라디오. 직접입력 라디오 선택 시에만 `Input` 활성화 (`disabled={!isCustomSelected || ...}`). 라디오 그룹 `name={conflict-${key}}` 로 단일 선택 보장.

사이클 2 결함(Designer: 4-AND 제출 조건, 라디오·직접입력 패턴): 두 항목 모두 구현됨.

**결과: O (해소)**

---

### ⑨ 버튼 텍스트 "병합 발행 →"

**검증 파일:** `MergeConvertDialog.tsx` L387-389

```typescript
{mergeMutation.isPending ? '병합 발행 중…' : '병합 발행 →'}
```

사이클 2 결함(Designer: 버튼 텍스트): "병합 발행" 에서 화살표 누락.

**결과: O (해소)**

---

### ⑩ 재고예약 카피 + N개 주문/M개 품목

**검증 파일:** `MergeConvertDialog.tsx` L399-405

```typescript
<strong>주의:</strong> 병합 발행 후에는 출고전표가 즉시 생성되며 재고가 예약됩니다.{' '}
이 작업은 되돌릴 수 없습니다.
{convertItemCount > 0
  ? ` (${selectedOrders.length}개 주문, ${convertItemCount}개 품목 전환 예정)`
  : null}
```

사이클 2 결함(Designer: 배너 카피): "재고가 예약됩니다" 누락, `{M}개 품목` 미표시.

현재: "재고가 예약됩니다" 문구 포함, `convertItemCount`(전환수량 > 0 라인 수)와 `selectedOrders.length`(주문 수) 모두 표시. 가이드 두 줄 구조 적용.

**결과: O (해소)**

---

## 성공 토스트 카피 + 소멸 시간

**검증:** `SalesPartnerOrderListPage.tsx` L156-162

- 카피: `출고전표 ${slipNo} 발행 완료 — ${convertedOrderNos.length}개 주문 병합 전환` (가이드 일치)
- 소멸: `setTimeout(() => setConvertSuccessMessage(null), 4000)` (4초, 가이드 일치)

사이클 2 결함(Designer: 성공 토스트 카피, 3초→4초): 모두 해소.

**결과: O (해소)**

---

## CSS 토큰 — 성공 토스트 및 액션 바

**검증 파일:** `sales.module.css` L1097-1121

```css
.mergeConvertActionBar {
  ...
  background: var(--color-brand-50, #eff6fb);
  border: 1px solid var(--color-brand-200, #bae6fd);
  ...
}

.mergeConvertSuccessToast {
  ...
  border: 1px solid var(--color-success-200, #a7f3d0);
  background: var(--color-success-50, #ecfdf5);
  color: var(--color-success-700, #047857);
  ...
}
```

사이클 2 결함(N2-P2): 하드코딩 hex 색상. 현재 CSS 모듈 클래스로 분리 + 디자인 토큰 사용.

`SalesPartnerOrderListPage.tsx` 에서 `className={styles['mergeConvertSuccessToast']}`, `className={styles['mergeConvertActionBar']}` 로 사용.

**결과: O (해소)**

---

## Typecheck / Lint 실행 결과

```
npm run typecheck → 오류 0건 (exit 0)
npm run lint      → 오류 0건 (warning 1건: PurchaseSlipPrintPage.tsx — D2 무관 기존 warning)
```

---

## 해소 요약

| 항목 | 내용 | 해소 |
|---|---|---|
| ① | sales.ts partnerOrderId 주석 정정 | O |
| ② | mock orderNo 고정값 반환 | O |
| ③ | qtyMap useEffect 초기화 | O |
| ④ | discountInfo ShippingFieldKey 전체 제거 | O |
| ⑤ | 단건 캐시 ['partner-order', orderNo] 무효화 | O |
| ⑥-a | Playwright waitForTimeout 제거 | O |
| ⑥-b | 재고부족 409 시나리오(E-1) 추가 | O |
| ⑥-c | testid 일치 (merge-convert-error) | O |
| ⑦ | 비가역 danger 배너 (mergeConvertWarningBanner) | O |
| ⑧ | 4-AND 제출조건 + 충돌 라디오/직접입력 패턴 | O |
| ⑨ | 버튼 텍스트 "병합 발행 →" | O |
| ⑩ | 재고예약 카피 + N개 주문/M개 품목 | O |
| 토스트 | 카피 "N개 주문 병합 전환" + 4초 소멸 | O |
| CSS | 성공 토스트/액션 바 디자인 토큰 교체 | O |

전체 14개 항목 해소 14건 / 미해소 0건.

---

## 잔존 문서 불일치 (실행에 영향 없음)

- `MergeConvertDialog.tsx` JSDoc 헤더 L34: `{@code merge-convert-modal-error}` — 현재 실제 `data-testid` 는 `merge-convert-error` 이므로 문서 불일치. 테스트 실행에 영향 없음.

---

## 최종 판정

**APPROVE**

`3be5a27e` 커밋에서 사이클 1 FE + Designer 리뷰 결함 전원 해소됨. 렌더 단계 `setState` → `useEffect` 교체(P1-1), `discountInfo` 전체 제거(P1-2), 단건 캐시 무효화(P1-4), `waitForTimeout` 제거(P1-5), danger 배너 토큰(Designer), 4-AND 조건(Designer), 라디오·직접입력(Designer), 버튼 텍스트(Designer), 재고예약 카피(Designer), 토스트 카피·소멸(Designer), CSS 토큰(Designer), testid 일치(N1-P1) 모두 현재 워킹트리 파일에서 반영 확인. typecheck 0건, lint 경고 1건(D2 무관) 통과.
