# FE 코드 리뷰 — Phase 2.6b D2 다중주문 병합 전환 (사이클 1)

헤드 커밋: `acc28984` (feat(desktop): 다중주문 병합 전환 UI (D2))
리뷰어: Claude FE (2026-05-31)
판정: **CHANGES_REQUESTED**

---

## 결함 목록

### P0 — 배포 차단

#### FE-D2-C1-P0-1: `partnerOrderId` 필드에 UUID 대신 `orderNumber` 전달 — BE 계약과 주석이 상충

**위치:** `MergeConvertDialog.tsx` L251-253

```typescript
// BE 확정 (2026-05-31): partnerOrderId 필드 = 주문번호(orderNo) 를 받는다.
// UUID 가 아닌 orderNumber(사용자 식별자) 를 전달 — 이미 정상 동작.
partnerOrderId: detail.orderNumber,
```

**분석:**

BE `MergeConvertToSlipRequest.OrderItems` 의 `partnerOrderId` 파라미터 Javadoc 은 "FE 는 주문번호를 전송한다. 서버 내부에서 `PartnerOrderIdResolver` 를 통해 주문번호 또는 UUID 모두 허용한다" 라고 명시하고 있으며, `orderNumber`(예: `2026/05/31-1`) 전달은 실동작상 유효하다. 이 자체는 P0 버그가 아니다.

그러나 FE `MergeConvertOrderItems` 인터페이스(`api/sales.ts`) 의 `partnerOrderId` 필드 주석은 "UUID 문자열이지만 사용자 화면에 미노출" 이라고 설명되어 있어 실제 전달 값(`orderNumber` = 문자열 주문번호)과 모순된다. **인터페이스 주석과 실제 전달 값이 불일치하면 다음 개발자가 UUID 를 전달하도록 변경할 위험이 있다.**

**수정 방향:** `MergeConvertOrderItems.partnerOrderId` 필드 주석을 "주문번호(`orderNumber`) 또는 UUID — BE `PartnerOrderIdResolver` 양용 허용. FE 는 `orderNumber` 를 전달한다" 로 정정.

---

#### FE-D2-C1-P0-2: `mock.ts` 병합 응답에서 UUID(`partnerOrderId`)가 `orderNo` 로 노출

**위치:** `api/mock.ts` L3896-3900

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

FE 는 `partnerOrderId` 에 `orderNumber`(예: `2026/05/31-1`) 를 전달하므로, mock 이 이 값을 `orderNo` 에 그대로 반환하는 것은 현재 코드에서는 결과적으로 올바른 사용자 식별자가 돌아온다. 그러나 이 코드는 "FE 가 항상 orderNumber 를 전달한다" 는 암묵적 가정에 의존하며, 주석이 "요청의 partnerOrderId 값을 orderNo 로 그대로 반환" 이라고 설명함으로써 실제 BE 동작(항상 `orderNo` = 사용자 주문번호)과의 차이를 모호하게 처리하고 있다.

**실제 BE 는 `PartnerOrderIdResolver` 로 주문을 찾은 뒤 응답에는 반드시 `orderNo`(DB 의 `orderNumber` 컬럼) 를 반환한다.** mock 응답도 고정된 `orderNo` 값(예: 목록 mock 의 `orderNumber`)을 반환하도록 수정하는 것이 BE 동작과 일관된다.

**수정 방향:** mock 에서 `orders` 배열 인덱스를 매핑하여 미리 정의한 고정 `orderNumber` 를 `orderNo` 에 반환하거나, 최소한 주석을 "실제 BE 는 DB orderNumber 를 반환 — 이 mock 은 FE 가 orderNumber 를 partnerOrderId 로 전달하므로 pass-through 가 일치함" 으로 명확히 기술.

---

### P1 — 기능 결함 / 심각한 UX 문제

#### FE-D2-C1-P1-1: 렌더 단계 `setState` — React 18 StrictMode 이중 실행 시 `qtyMap` 초기화 불일치

**위치:** `MergeConvertDialog.tsx` L154-168

```typescript
const [qtyInitialized, setQtyInitialized] = useState(false)
if (!qtyInitialized && orderDetails.length === selectedOrders.length && !isLoadingDetails) {
  // ...
  setQtyMap(initMap)
  setQtyInitialized(true)  // 렌더 중 setState
}
```

이 패턴은 렌더 함수 본체에서 `setState` 를 직접 호출하는 것으로, React 공식 문서가 "render 중 상태 초기화(derived state)" 패턴으로 언급하지만 **`useState` setter 를 렌더 바깥이 아닌 렌더 중 호출하는 것은 불안정하다.** 특히 `main.tsx` 에서 `StrictMode` 가 활성화되어 있으므로, React 18 StrictMode 개발 모드에서 render 를 두 번 실행한다. `qtyInitialized` 가 첫 번째 렌더에서 `true` 로 업데이트되기 전에 두 번째 렌더가 실행될 수 있어, `setQtyMap` 이 두 번 호출되거나 중간 상태가 화면에 잠깐 깜빡일 수 있다.

React 공식 권장 패턴은 `useEffect` 를 사용하는 것이다.

**수정 방향:**

```typescript
useEffect(() => {
  if (isLoadingDetails || orderDetails.length !== selectedOrders.length) return
  const initMap: Record<string, number> = {}
  orderDetails.forEach((detail, oi) => {
    if (!detail) return
    detail.lines.forEach((line) => {
      const remaining = line.quantity - (line.convertedQuantity ?? 0)
      if (remaining > 0) initMap[`${oi}-${line.lineId}`] = remaining
    })
  })
  setQtyMap(initMap)
}, [isLoadingDetails, orderDetails.length])
// qtyInitialized state 제거
```

---

#### FE-D2-C1-P1-2: `discountInfo` 충돌 필드 — 항상 빈 문자열로 fallback, 사용자가 입력 불가

**위치:** `MergeConvertDialog.tsx` L105-111, L178-195

```typescript
case 'discountInfo':
  // PartnerOrderDetail 에는 discountInfo 필드가 없음 — ...
  return ''
```

충돌 감지 로직에서 `discountInfo` 의 모든 값이 `''` 로 추출되므로 `uniqueValues.size` 는 항상 1 이하, `conflictFields` 에 절대 포함되지 않는다. 그러나 `resolvedShippingInfo` 빌드 시 `discountInfo` 키를 순회하면서 `orderDetails[0]` 에서 추출한 빈 문자열을 넣지 않으므로(`val` 이 falsy → 조건 미충족), `discountInfo` 는 BE 에 전혀 전달되지 않는다.

이는 `PartnerOrderDetail` 에 `discountInfo` 필드가 없어서 발생한 구조적 문제다. `discountInfo` 를 사용자에게 입력받으려면:
- 충돌 감지와 무관하게 별도 입력 UI 를 제공하거나,
- 또는 `discountInfo` 를 `ShippingFieldKey` 에서 제거하고 BE 로 전달하지 않는 것을 명시.

현재 코드는 `discountInfo` 를 타입에 포함시켰으나 실질적으로 항상 누락된다. BE `ShippingInfo.discountInfo` 는 optional 이므로 기능 장애는 아니지만, 향후 혼란의 원인이 된다.

**수정 방향:** `ShippingFieldKey` 및 `SHIPPING_FIELD_LABEL` 에서 `discountInfo` 를 제거하거나, 충돌 감지와 독립된 별도 자유입력 필드를 제공.

---

#### FE-D2-C1-P1-3: `conflictFields` 에서 `discountInfo` 누락 + 충돌 없는 필드 자동 채움 로직의 `shippingFields[key]` 우선 분기 오작동

**위치:** `MergeConvertDialog.tsx` L197-225

```typescript
for (const key of keys) {
  if (shippingFields[key] !== undefined) {
    // 사용자가 직접 입력한 값 우선
    ;(result as Record<string, string | undefined>)[key] = shippingFields[key] || undefined
  } else if (orderDetails[0]) {
    // 충돌 없는 필드 — 첫 번째 주문 값 사용
    const val = extractShippingFieldValue(orderDetails[0], key)
    if (val) {
      ;(result as Record<string, string | undefined>)[key] = val
    }
  }
}
```

사용자가 충돌 필드에서 라디오를 선택하면 `shippingFields[key]` 가 설정된다. 이후 사용자가 선택을 취소하거나 빈 문자열로 직접 입력하면 `shippingFields[key] !== undefined` 이지만 `shippingFields[key] || undefined` 는 `undefined` 를 반환한다. 이 경우 `result[key]` 는 `undefined` 가 되어 "사용자가 빈 값으로 명시적으로 지운 것"인지 "충돌 없는 필드 자동 채움으로 복귀해야 하는 것"인지 구분 불가. 즉, 사용자가 라디오를 선택했다가 직접 입력으로 지우면 의도와 다른 결과가 나올 수 있다.

**수정 방향:** `shippingFields` 초기값에서 `undefined` 와 `''` 의 의미를 명확히 구분하거나, 사용자가 명시적으로 값을 입력한 경우와 미입력을 구분하는 별도 플래그 사용.

---

#### FE-D2-C1-P1-4: 병합 성공 후 `['partner-order', orderNumber]` 단건 캐시 미무효화

**위치:** `SalesPartnerOrderListPage.tsx` L158-162

```typescript
const handleMergeDialogSuccess = async (slipNo: string) => {
  setMergeDialogOpen(false)
  setSelectedOrderNumbers(new Set())
  setConvertSuccessMessage(`출고전표 ${slipNo} 발행 완료`)
  setTimeout(() => setConvertSuccessMessage(null), 3000)
  await queryClient.invalidateQueries({ queryKey: ['partner-orders'] })
  // ['partner-order', orderNumber] 단건 캐시 미무효화
}
```

병합 전환 후 사용자가 즉시 전환된 주문의 상세 화면으로 이동하면, `['partner-order', orderNumber]` 캐시가 유효해서 기존 DRAFT 상태와 전환 전 `convertedQuantity` 값을 보여줄 수 있다. 단일주문 전환(`PartnerOrderVersionHistoryPanel.tsx` L160-161) 은 `invalidateQueries({ queryKey: ['partner-order', orderId] })` 를 함께 호출하는 패턴을 사용하고 있다.

**수정 방향:** `handleMergeDialogSuccess` 에서 변환된 각 주문의 `orderNumber` 를 인자로 받아 `['partner-order', orderNumber]` 를 각각 무효화. 또는 `onSuccess` 콜백 시그니처를 `(slipNo: string, convertedOrderNos: string[]) => void` 로 확장.

---

#### FE-D2-C1-P1-5: Playwright 시나리오 1 — `page.waitForTimeout(500)` 사용

**위치:** `d2-order-merge.spec.ts` L166, L210

```typescript
await page.waitForTimeout(500)
```

Playwright 공식 문서는 `waitForTimeout` 을 테스트 디버깅용으로만 권장하며, CI 에서는 네트워크/CPU 속도에 따라 불안정하다. 상태 필터 변경 후에는 `waitForTimeout` 대신 `await expect(page.locator(...)).toBeVisible()` 또는 네트워크 응답 대기를 사용해야 한다. 또한 이 스펙은 두 곳에서 `waitForTimeout` 을 사용해 불필요한 지연이 발생한다.

**수정 방향:** `waitForTimeout(500)` 을 `await expect(checkboxes.first()).toBeVisible({ timeout: 10_000 })` 또는 상태 변경 확인 단언으로 교체.

---

### P2 — 경미한 문제 / 개선 권고

#### FE-D2-C1-P2-1: 성공 토스트 및 액션 바 인라인 `style={{}}` 하드코딩 — 디자인 토큰 미사용

**위치:** `SalesPartnerOrderListPage.tsx` L172-185 (토스트), L278-290 (액션 바)

토스트의 `background: '#F0FDF4'`, `border: '1px solid #86EFAC'`, `color: '#166534'` 및 액션 바의 `background: '#F0F9FF'`, `border: '1px solid #BAE6FD'` 는 모두 하드코딩된 hex 색상이다. 기존 `sales.module.css` 에는 `--state-success-bg`, `--state-success`, `--state-success-text`, `--state-info-bg` 등 토큰이 정의되어 있으며, `errorBanner` 클래스는 CSS module + 토큰을 조합해 사용한다.

성공 토스트는 `.successBanner` CSS module 클래스가 `sales.module.css` 에 이미 존재(`L1006-1014`)하므로 인라인 스타일 대신 이 클래스를 활용해야 한다.

액션 바는 별도 `.mergeConvertActionBar` 클래스를 `sales.module.css` 에 추가하는 것이 바람직하다.

**수정 방향:**
- 토스트: `<div className={styles['successBanner']} ...>` 로 교체
- 액션 바: `sales.module.css` 에 `.mergeConvertActionBar` 클래스 신규 정의 + 토큰 사용

---

#### FE-D2-C1-P2-2: 충돌 필드 라디오 `key` 에 배열 인덱스 사용

**위치:** `MergeConvertDialog.tsx` L420

```typescript
{orderValues.map((val, vi) => (
  <label key={`${key}-radio-${vi}`} ...>
```

`orderValues` 는 주문 상세에서 추출한 값 배열로, 동일한 값이 중복될 수 있다(두 주문의 `shippingAddress` 가 동일 → `uniqueValues.size === 1` 이면 `conflictFields` 에 포함 안 됨). 충돌이 감지된 경우 각 값은 서로 달라야 하므로 `key={`${key}-radio-${val}`}` 이 더 안정적이다. 단, 동일 값이 중복 포함되는 경우는 현재 로직상 발생하지 않으므로 P2 수준.

---

#### FE-D2-C1-P2-3: `Warehouse` 타입 이중 import

**위치:** `MergeConvertDialog.tsx` L47, L54

```typescript
import type { Warehouse } from '@samhan/design-system'
// ...
import { listWarehouses } from '../../api/inventory'
```

`@samhan/design-system` 에서 `Warehouse` 타입을 import 하고, `../../api/inventory` 에서 `listWarehouses` 를 import 하는 구조다. `inventory.ts` 의 `Warehouse` 인터페이스와 design-system 의 `Warehouse` 인터페이스는 구조적으로 동일(덕 타이핑 호환)하지만, `listWarehouses()` 의 반환 타입은 `inventory.ts` 의 `Warehouse[]` 이다. TypeScript structural typing 으로 런타임 오류는 없으나, 타입 출처가 두 곳으로 분산되어 장기 유지보수 시 혼란이 생길 수 있다.

**수정 방향:** `import type { Warehouse } from '../../api/inventory'` 단일 출처로 통일. design-system `Warehouse` 는 삭제.

---

#### FE-D2-C1-P2-4: Playwright 시나리오 7 — `ord-draft` 하드코딩 ID

**위치:** `d2-order-merge.spec.ts` L357

```typescript
const DRAFT_ORDER_ID = 'ord-draft'
```

mock 에서 `ord-draft` 가 실제로 처리 가능한지 명시적 확인이 없다. 기존 Phase 2.6a 스펙에서도 동일 값을 사용한다면 일관성은 있으나, mock 데이터에서 `orderNumber = '2026/05/04-1'` 을 사용하고 있으므로 `toOrderPathId('2026/05/04-1') = '2026-05-04-1'` 을 사용하는 것이 더 명확하다. `ord-draft` 가 mock handler 에서 특수 처리되는지 확인 필요.

---

#### FE-D2-C1-P2-5: `convertedOrders` 결과가 FE 에서 사용되지 않음

**위치:** `MergeConvertDialog.tsx` `onSuccess` 콜백

BE 응답 `convertedOrders: [{orderNo, orderStatus, fullyConverted}]` 를 `MergeConvertResult` 타입에 포함하고 있으나, `onSuccess` 핸들러에서 `result.slipNo` 만 사용하고 `result.convertedOrders` 는 무시된다. 부분전환 시 일부 주문이 DRAFT 로 남는 경우 사용자에게 알려줄 수 없다(예: "3개 주문 중 2개 전환완료, 1개 일부만 전환됨"). 현재 MVP 요구사항이라면 P2 수준이지만 향후 대응 계획 수립 권고.

---

## 긍정 사항

- UUID 비공개 원칙 준수: 화면 및 `data-testid` 전체에서 UUID 미노출, `orderNumber`/`partnerCode`/`partnerName`/`modelCode` 만 사용.
- design-system 컴포넌트(`Button`, `Input`, `Modal`, `Spinner`, `WarehouseAutocomplete`) 재사용 — 자체 신규 컴포넌트 작성 없음.
- 같은 거래처 조건 + DRAFT/ON_HOLD 상태 조건 정확히 구현.
- 잔여수량 초과 차단(`Math.min(remaining, raw)`) 정확히 구현.
- `react-query invalidateQueries({ queryKey: ['partner-orders'] })` partial-match prefix 를 올바르게 활용.
- 409 에러 피드백 분기(거래처 불일치 / 재고 부족 / 기타) 한국어 메시지로 구현.
- Playwright 시나리오 8개 모두 `test.skip(false)` — skipped=0 (시나리오 3 의 skip 조건은 count < 4 시로 방어적 처리).
- BE `MergeConvertResultResponse` 응답 DTO(`{slipNo, convertedOrders:[{orderNo, orderStatus, fullyConverted}]}`)와 FE `MergeConvertResult` 타입 1:1 정합 확인.
- 단일주문 전환 `SalesPartnerOrderDetailPage` 무변경 확인 — 회귀 0.
- `CONFIRMING`/`CONFIRMED`/`CANCELED`/`CONVERTED` 행 체크박스 비활성 정확.
- 창고 필수 + 수량 0 시 제출 비활성 정확.

---

## 결론

P0 2건 (주석/타입 불일치가 미래 오용을 유발할 수 있는 계약 혼동), P1 5건 (React StrictMode 불안정 초기화, discountInfo 구조적 누락, 단건 캐시 미무효화, 자동 채움 로직 엣지케이스, Playwright waitForTimeout), P2 5건.

**P0-1 / P0-2** 는 향후 BE UUID 전달 오류나 mock-실서버 간극으로 이어질 수 있어 수정 후 재검토 필요.
**P1-1** 은 React 18 StrictMode 개발 환경에서 재현 가능하며 운영 빌드(StrictMode 비활성)에서는 발현되지 않지만, 코드 패턴 자체가 React 문서 권고에 반하므로 수정 권고.

판정: **CHANGES_REQUESTED**
