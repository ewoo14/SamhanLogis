# FE 코드 리뷰 — Phase 2.6b D2 다중주문 병합 전환 (사이클 2)

헤드 커밋: `acc28984` (feat(desktop): 다중주문 병합 전환 UI (D2))
리뷰어: Claude FE (2026-05-31)
대상 브랜치: feat/d2-order-merge-to-slip
판정: **CHANGES_REQUESTED**

---

## 사이클 1 결함 해소 판정

### P0-1: sales.ts `partnerOrderId` 주석 정정 — X (미해소)

**원 결함:** `MergeConvertOrderItems.partnerOrderId` 주석이 "UUID 문자열" 이라고 명시하나 실제로는 `orderNumber`(주문번호)를 전달.

**현재 코드 (`sales.ts` L517):**

```typescript
/**
 * 병합 전환 대상 주문 1건 + 선택 라인.
 * partnerOrderId 는 UUID 문자열이지만 사용자 화면에 미노출 (orderLineId 도 동일).
 */
export interface MergeConvertOrderItems {
  /** 주문 UUID — API 전송 전용, 사용자 노출 금지. */
  partnerOrderId: string
```

인터페이스 상단 JSDoc과 필드 주석 모두 "UUID" 라고 명시한 상태 그대로다. `MergeConvertDialog.tsx` 의 `mutationFn` 에는 "BE 확정 (2026-05-31): partnerOrderId 필드 = 주문번호(orderNo) 를 받는다." 주석이 추가되었으나, 타입 정의 파일(`sales.ts`)에서는 주석이 수정되지 않았다. **타입 정의와 실제 전달 값의 모순은 여전히 존재한다.** 다음 개발자가 `sales.ts` 인터페이스 주석만 보고 UUID를 전달하도록 변경할 위험이 남아있다.

---

### P0-2: mock.ts 병합 응답 `orderNo` pass-through — X (부분 해소, 핵심 문제 잔존)

**원 결함:** mock이 `o.partnerOrderId` 값을 `orderNo` 에 그대로 반환 — FE가 `orderNumber`를 전달하면 우연히 올바르지만, BE 실동작(DB `orderNumber` 반환)과 명시적으로 일치함을 코드에서 보장하지 않음.

**현재 코드 (`mock.ts`):**

```typescript
return envelope({
  slipNo: 'SL-20260531-MERGE-001',
  convertedOrders: orders.map((o) => ({
    orderNo: o.partnerOrderId,  // mock: 요청의 partnerOrderId 값을 orderNo 로 그대로 반환
    orderStatus: 'CONVERTED',
    fullyConverted: true,
  })),
})
```

주석이 "partnerOrderId(UUID) 는 요청 전용 — 응답에는 orderNo(사용자 식별자) 반환." 으로 개선되었으나, 실제 코드는 `o.partnerOrderId` pass-through 로 그대로다. 사이클 1 결함에서 제시한 수정 방향("고정된 `orderNo` 값 반환")을 채택하지 않았다.

FE가 `partnerOrderId`에 `orderNumber`(예: `2026/05/04-1`)를 전달하므로, 현재 코드에서는 mock 응답의 `orderNo` 값도 `2026/05/04-1`이 되어 결과적으로 옳다. 그러나 `sales.ts` P0-1 주석이 "UUID" 라고 명시하므로, P0-1이 수정되어 UUID를 전달하는 개발자가 생기면 mock이 UUID를 `orderNo`로 반환하는 버그로 즉시 전환된다. **P0-1과 P0-2는 쌍으로 얽힌 미해소 결함이다.**

---

### P1-1: 렌더 단계 `setState` (`qtyInitialized`) — X (미해소)

**원 결함:** 렌더 함수 본체에서 `setQtyMap` / `setQtyInitialized` 직접 호출 — React 18 StrictMode 이중 실행 불안정.

**현재 코드 (`MergeConvertDialog.tsx` L151-165):**

```typescript
// (useEffect 없이 메모이제이션 — 상세 로드 완료 시 1회만 설정)
const [qtyInitialized, setQtyInitialized] = useState(false)
if (!qtyInitialized && orderDetails.length === selectedOrders.length && !isLoadingDetails) {
  // ...
  setQtyMap(initMap)
  setQtyInitialized(true)
}
```

`import { useState } from 'react'` — `useEffect` 는 import하지 않았다. 렌더 단계 `setState` 패턴이 그대로 유지되었고, 주석만 "useEffect 없이 메모이제이션" 으로 의도를 기술했다. React 18 StrictMode 개발 환경에서의 이중 실행 위험은 해소되지 않았다.

---

### P1-2: `discountInfo` `ShippingFieldKey` 잔류 — X (미해소)

**원 결함:** `discountInfo` 가 `ShippingFieldKey` 에 포함되어 있으나 `PartnerOrderDetail` 에 필드가 없어 항상 `''` 반환 → 충돌 감지 불가 + BE 전달 누락.

**현재 상태 분석:**

- 충돌 감지 루프(`conflictFields` 계산, L180-186)에서는 `discountInfo` 를 제거함 — 이 부분은 개선됨.
- 그러나 `ShippingFieldKey` 타입(L73-79)에는 여전히 `discountInfo` 포함.
- `SHIPPING_FIELD_LABEL`(L82-89)에도 `discountInfo: '할인 정보'` 포함.
- `resolvedShippingInfo` 빌드 루프(L201-207)에는 여전히 `discountInfo` 포함.

충돌 감지에서 제외했으므로 사용자에게 입력창은 더 이상 노출되지 않지만, 타입/라벨/빌드 루프에 불필요하게 남아 있어 코드 의도가 불명확하다. 사이클 1 결함이 "제거하거나 별도 입력 UI 제공" 두 방향을 제시했으나 어느 쪽도 완전히 채택되지 않았다.

---

### P1-4: 단건 캐시 `['partner-order', orderNo]` 무효화 미추가 — X (미해소)

**현재 코드 (`SalesPartnerOrderListPage.tsx` L154-160):**

```typescript
const handleMergeDialogSuccess = async (slipNo: string) => {
  setMergeDialogOpen(false)
  setSelectedOrderNumbers(new Set())
  setConvertSuccessMessage(`출고전표 ${slipNo} 발행 완료`)
  setTimeout(() => setConvertSuccessMessage(null), 3000)
  await queryClient.invalidateQueries({ queryKey: ['partner-orders'] })
  // ['partner-order', orderNumber] 단건 캐시 무효화 없음
}
```

`onSuccess` 콜백 시그니처가 `(slipNo: string)` 로 그대로라서 전환된 주문번호 배열을 전달받지 못한다. 병합 전환 후 사용자가 전환된 주문 상세를 즉시 열면 DRAFT 상태 캐시를 볼 수 있다. 단일주문 전환(`PartnerOrderVersionHistoryPanel.tsx`)에서의 `invalidateQueries({ queryKey: ['partner-order', orderId] })` 병행 호출 패턴과 불일치가 계속된다.

---

### P1-5: Playwright `waitForTimeout(500)` — X (미해소)

**원 결함:** 시나리오 1·3에서 `waitForTimeout(500)` 사용 — CI 불안정.

**현재 파일 (`d2-order-merge.spec.ts`):**

- L147: `await page.waitForTimeout(500)` — 상태 필터 변경 후
- L203: `await page.waitForTimeout(500)` — 상태 필터 변경 후

코드베이스(`git show HEAD`)에서 두 `waitForTimeout` 호출이 **그대로 잔존**한다. 현재 파일 시스템 파일에는 해당 라인에 "waitForTimeout → toBeVisible 단언으로 교체 (FE P1-5)" 주석이 있는 것으로 보이나, 이는 로컬 수정 사항일 뿐 HEAD 커밋에는 반영되지 않았다.

---

### Designer 결함 — 비가역 경고 배너: danger 토큰 — X (미해소)

**디자인 가이드 (`d2-merge-convert-dialog-guide.md` §2.1):**

> 비가역 경고 배경: `var(--color-danger-50)` (#FFF1F1)
> 비가역 경고 테두리: `1px solid var(--color-danger-200)` (#FECACA)
> 비가역 경고 텍스트: `var(--color-danger-700)` (#991B1B)

**현재 구현 (`MergeConvertDialog.tsx` L351-360):**

```typescript
<div
  className={styles['convertWarningBanner']}
  role="note"
  style={{ marginBottom: 16 }}
>
```

`convertWarningBanner` CSS 클래스(`sales.module.css` L1075-1083)의 실제 토큰:

```css
.convertWarningBanner {
  border: 1px solid var(--state-warning, #92400e);
  background: var(--state-warning-bg, #fef3c7);
  color: var(--state-warning, #92400e);
}
```

**warning(오렌지) 토큰이 그대로 사용되고 있다.** Designer 가이드는 병합 전환이 재고 예약을 포함해 되돌리기 더 어려우므로 danger(빨강) 토큰으로 격상하도록 명시했다. `var(--color-danger-50)`, `var(--color-danger-200)`, `var(--color-danger-700)` 로 교체 필요.

---

### Designer 결함 — 비가역 배너 카피: "재고가 예약됩니다" + 품목수 — X (미해소)

**디자인 가이드 §2.1 경고 카피 (확정):**

```
주의: 병합 발행 후에는 출고전표가 즉시 생성되며 재고가 예약됩니다.
이 작업은 되돌릴 수 없습니다. ({N}개 주문, {M}개 품목 전환 예정)
```

**현재 구현:**

```typescript
<strong>주의:</strong> 병합 발행 시 출고전표가 즉시 발행됩니다. 이 작업은 되돌릴 수 없습니다.
{selectedOrders.length >= 2
  ? ` (${selectedOrders.length}개 주문을 단일 전표로 병합)`
  : null}
```

차이:
1. "재고가 예약됩니다" 문구 누락
2. `{M}개 품목` (전환수량 > 0 라인 수) 미표시 — `{N}개 주문` 만 표시
3. 가이드 두 줄 구조 미적용

---

### Designer 결함 — 4-AND 제출 조건: 충돌 미확정 시 비활성 — X (미해소)

**디자인 가이드 §2.7 "병합 발행" 비활성 조건:**

> - 충돌 필드가 있는데 미선택인 항목 존재

**현재 `canSubmit` 조건 (`MergeConvertDialog.tsx` L229):**

```typescript
const canSubmit = hasSomeQty && !!selectedWarehouse
```

충돌 필드(`conflictFields`) 중 사용자가 값을 확정하지 않은 항목이 있어도 창고+수량 조건만 충족하면 제출 버튼이 활성화된다. 가이드가 명시한 "충돌 필드 미선택 시 비활성" 조건이 누락되었다.

---

### Designer 결함 — 충돌 섹션 "직접 입력" 3번째 라디오 옵션 — X (미해소)

**디자인 가이드 §2.3 충돌 행 UX 패턴:**

```
(●) 주문 2026/05/31-1 값: "서울시 강남구 테헤란로 123"
( ) 주문 2026/05/31-2 값: "부산시 해운대구 센텀로 200"
( ) 직접 입력 (/ 병기 등)
    └─ [text input, 직접 입력 선택 시 활성화]
```

**현재 구현:** 라디오 선택(각 주문 값)과 직접 입력 `Input`이 별도로 나열되어 있으나, "직접 입력" 을 선택하는 3번째 라디오 옵션이 없다. 현재 텍스트 인풋에 직접 값을 입력하면 라디오 선택이 해제되지 않고 `shippingFields[key]` 를 덮어쓴다. 가이드의 명시적 3-라디오 구조("직접 입력 라디오 미선택 시 인풋 `disabled`")를 구현하지 않았다.

---

### Designer 결함 — 버튼 텍스트 "병합 발행 →" — X (미해소)

**디자인 가이드 §2.7:**

```
[ 병합 발행 → ]
```

**현재 구현:**

```typescript
{mergeMutation.isPending ? '발행 중…' : '병합 발행'}
```

화살표(`→`) 가 누락되었다.

---

### Designer 결함 — 성공 토스트 카피: "N개 주문 병합 전환" — X (미해소)

**디자인 가이드 §2.7 성공 처리:**

```
출고전표 {slipNo} 발행 완료 — {N}개 주문 병합 전환
```

**현재 구현 (`SalesPartnerOrderListPage.tsx` L157):**

```typescript
setConvertSuccessMessage(`출고전표 ${slipNo} 발행 완료`)
```

"N개 주문 병합 전환" 부분이 누락되었다. 또한 토스트 자동 소멸 시간이 3초(3_000ms)로, 가이드가 명시한 4초(4_000ms)와 다르다.

---

### Designer 결함 — 충돌 섹션 색상 하드코딩 — X (미해소)

**현재 구현 (`MergeConvertDialog.tsx` L396-403):**

```typescript
style={{
  background: '#FFFBEB',
  border: '1px solid #FDE68A',
  ...
  color: '#92400E',
}}
```

**디자인 가이드 §3.1 토큰:**

- 충돌 섹션 배경: `var(--color-warning-50)` (#FEF6E7)
- 충돌 섹션 테두리: `var(--color-warning-200)` (#F8DA9A)

하드코딩된 `#FFFBEB`, `#FDE68A`, `#92400E` 는 가이드 토큰과 실값 자체도 불일치한다(`#FFFBEB ≠ #FEF6E7`, `#FDE68A ≠ #F8DA9A`).

---

## 신규 결함 발견 (사이클 2)

### N1-P1: Playwright testid 불일치 — `merge-convert-error` vs `merge-convert-modal-error`

**위치:** `d2-order-merge.spec.ts` L355, L390

시나리오 6과 E-1에서 에러 배너 locator를 `page.getByTestId('merge-convert-error')` 로 참조하나, `MergeConvertDialog.tsx` L343의 실제 `data-testid` 는 `"merge-convert-modal-error"` 다. **이 불일치로 시나리오 6과 E-1은 실행 시 에러 배너 단언이 반드시 실패한다.**

또한 JSDoc 헤더(L39)에는 `{@code merge-convert-modal-error}` 로 올바르게 기재되어 있어, spec 본문 코드와 JSDoc이 서로 엇갈린 상태다.

---

### N1-P1: 재고부족 409 에러 메시지 분기 누락

**위치:** `MergeConvertDialog.tsx` L269-283

```typescript
if (beMessage?.includes('같은 거래처')) {
  setErrorMessage('병합은 같은 거래처 주문만 가능합니다.')
  return
}
if (beMessage?.includes('warehouseCode')) {
  setErrorMessage('출고 창고를 선택해 주세요.')
  return
}
setErrorMessage(
  beMessage ?? '병합 전환에 실패했습니다. 재고 부족이거나 전환 불가 상태를 확인해 주세요.',
)
```

mock.ts 는 재고 부족 409 응답에 `'재고 부족: 실외기(AJ040RXH4BC1) 요청 2, 가용 0'` 메시지를 반환한다. 현재 분기는 `warehouseCode` 키워드 이후 `beMessage ?? fallback` 으로 처리하므로 BE 메시지가 그대로 표시된다. Designer 가이드 §2.6에서 재고 부족 메시지 포맷("재고 부족으로 병합 발행할 수 없습니다. ... 수량을 줄이거나...")을 별도로 확정했으나 이 분기가 없다.

시나리오 E-1은 `toContainText('재고 부족')` 을 단언하므로 `beMessage` 가 반환되면 일치할 수 있지만, N1-P1의 testid 불일치로 인해 먼저 실패한다.

---

### N2-P2: 성공 토스트 색상 하드코딩 (사이클 1 P2-1 미해소 지속)

**위치:** `SalesPartnerOrderListPage.tsx` L199-201

```typescript
background: '#F0FDF4',
border: '1px solid #86EFAC',
color: '#166534',
```

사이클 1 P2-1에서 지적한 내용이다. 가이드의 `--color-success-50`(#ecfdf5), `--color-success-200`(#a7f3d0), `--color-success-700`(#047857) 토큰과 실값도 불일치한다.

---

### N2-P2: 액션 바 색상 하드코딩 (사이클 1 P2-1 미해소 지속)

**위치:** `SalesPartnerOrderListPage.tsx` L284-285

```typescript
background: '#F0F9FF',
border: '1px solid #BAE6FD',
```

사이클 1 P2-1에서 `.mergeConvertActionBar` CSS 클래스 신규 정의 + 토큰 사용을 권고했으나 반영되지 않았다.

---

### N2-P2: `Warehouse` 타입 이중 import (사이클 1 P2-3 미해소 지속)

**위치:** `MergeConvertDialog.tsx` L47

```typescript
import type { Warehouse } from '@samhan/design-system'
```

`listWarehouses()` 반환 타입은 `../../api/inventory` 의 `Warehouse[]` 이다. 사이클 1 P2-3에서 단일 출처로 통일을 권고했으나 반영되지 않았다.

---

## UUID 화면 노출 확인

- `data-testid`, 화면 표시값 전체에서 UUID 노출 없음 — 이상 없음.

## 단일주문 UI 회귀 확인

- `SalesPartnerOrderDetailPage.tsx` 변경 없음 — 회귀 없음.

## design-system 컴포넌트 재사용 확인

- `Button`, `Input`, `Modal`, `Spinner`, `WarehouseAutocomplete` 재사용 — 이상 없음.
- `Badge` 컴포넌트는 미사용(상태 배지를 인라인 `<span>` 으로 구현) — Designer 가이드 §3.4는 `Badge` 사용을 명시. 이 부분은 P2 수준.

---

## 결론

### 사이클 1 결함 해소 현황

| 결함 ID | 내용 | 해소 |
|---|---|---|
| P0-1 | sales.ts 주석 정정 | X |
| P0-2 | mock orderNo pass-through | X (주석만 개선, 코드 동일) |
| P1-1 | 렌더 단계 setState (StrictMode) | X |
| P1-2 | discountInfo ShippingFieldKey 제거 | X (충돌 감지만 제외, 타입/라벨/빌드 루프 잔존) |
| P1-4 | 단건 캐시 ['partner-order', orderNo] 무효화 | X |
| P1-5 | Playwright waitForTimeout | X (HEAD 커밋에 여전히 존재) |
| Designer: danger 토큰 배너 | convertWarningBanner warning→danger 교체 | X |
| Designer: 배너 카피 | "재고가 예약됩니다" + 품목수 | X |
| Designer: 4-AND 제출 조건 | 충돌 미확정 시 canSubmit false | X |
| Designer: 라디오·직접입력 패턴 | 3번째 "직접 입력" 라디오 | X |
| Designer: 버튼 텍스트 | "병합 발행 →" | X |
| Designer: 성공 토스트 카피 | "N개 주문 병합 전환" | X |

### 신규 결함

| 결함 ID | 등급 | 내용 |
|---|---|---|
| N1-P1 | P1 | Playwright testid 불일치 (`merge-convert-error` vs `merge-convert-modal-error`) — 시나리오 6·E-1 단언 실패 |
| N1-P1 | P1 | 재고부족 409 에러 메시지 분기 누락 (Designer 가이드 §2.6 포맷 미적용) |
| N2-P2 | P2 | 성공 토스트/액션 바 색상 하드코딩 지속 (사이클 1 P2-1) |
| N2-P2 | P2 | Warehouse 타입 이중 import 지속 (사이클 1 P2-3) |

### 최종 판정

사이클 1 결함 12건 중 해소 0건. 신규 P1 결함 2건 추가 발견.

특히 `Playwright testid 불일치(N1-P1)` 는 HEAD 커밋 기준으로 시나리오 6과 E-1이 반드시 실패하며, 렌더 단계 `setState(P1-1)` + 단건 캐시 무효화(P1-4) 미해소는 실서버 사용 시 사용자에게 노출될 수 있는 UX 결함이다.

판정: **CHANGES_REQUESTED**
