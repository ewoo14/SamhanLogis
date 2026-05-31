# FE 코드 리뷰 — 슬라이스 C (창고코드 정렬) claude-fe-cycle1

- **브랜치**: `feat/slice-c-slip-inventory-warehouse-align`
- **리뷰 대상**: `clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx` + `clients/desktop/playwright/phase-2-6a-order-convert/phase-2-6a-order-convert.spec.ts`
- **설계 기준**: `docs/superpowers/specs/2026-05-31-slip-inventory-warehouse-code-align-design.md` D-WH-03
- **결론**: **CHANGES_REQUESTED**

---

## findings

### [P1] SalesPartnerOrderDetailPage.tsx:482 — 모달 open 시 convertWarehouse 초기화 누락

**문제**

`partner-order-convert-open` 버튼의 onClick (라인 482) 에서 `setConvertWarehouse(null)`이 호출되지 않는다.

```tsx
// 현행 코드 (471~483)
onClick={() => {
  setConvertErrorMessage(null)
  const initQty: Record<string, number> = {}
  for (const line of query.data!.lines) { ... }
  setConvertQtyMap(initQty)
  setConvertOpen(true)  // ← setConvertWarehouse(null) 없음
}}
```

**영향**

같은 페이지 세션에서 창고를 선택한 뒤 모달을 닫고 다시 열면 이전에 선택한 창고가 `convertWarehouse`에 잔류한다. 다음 전환 시 의도치 않은 창고가 이미 선택된 상태로 전환 버튼이 활성화된다.

- `setConvertQtyMap({})` 은 onSuccess/onClose/취소 버튼 모두에서 호출되지만, `setConvertWarehouse(null)` 은 onSuccess · onClose · 취소 버튼에는 추가됐으나 **open 직전에는 없다**.
- onClose/취소에서 초기화되므로 정상 종료 후에는 영향이 없다. 그러나 예외적으로 컴포넌트 언마운트 없이 동일 세션에서 모달을 재오픈할 경우 상태가 의도치 않게 잔류할 가능성이 있다.

**제안**

`setConvertOpen(true)` 직전에 `setConvertWarehouse(null)` 추가.

---

### [P1] SalesPartnerOrderDetailPage.tsx:196 — mutationFn payload 타입과 ConvertToSlipRequest 타입 불일치 (미약한 안전 위험)

**문제**

`mutationFn`의 인라인 payload 타입은 `{ items: ConvertToSlipItem[]; warehouseCode: string }` (필수 string)이고, `convertPartnerOrderToSlip`이 받는 `ConvertToSlipRequest.warehouseCode`는 `string | null | undefined` (optional)이다.

```ts
// sales.ts L393-397
export interface ConvertToSlipRequest {
  items: ConvertToSlipItem[]
  warehouseCode?: string | null   // ← optional
}

// SalesPartnerOrderDetailPage.tsx L196
mutationFn: (payload: { items: ConvertToSlipItem[]; warehouseCode: string }) =>
  convertPartnerOrderToSlip(orderId, payload),
```

TypeScript는 이 방향(`필수 string → optional string | null`)의 할당을 허용하므로 **컴파일 오류는 없다**. 그러나 `ConvertToSlipRequest.warehouseCode`의 doc comment가 "nullable — slip-service 기본값 적용"으로 여전히 nullable임을 명시한다. 슬라이스 C의 결정(D-WH-03)에 따르면 FE는 반드시 창고를 선택한 뒤에만 mutate를 호출하므로 런타임에서는 항상 non-null이다. 하지만 `ConvertToSlipRequest` 타입 자체가 "창고코드를 optional로 허용"함을 문서화하고 있어 두 타입 선언 사이에 의미적 불일치가 존재한다.

**영향**

타입 수준에서는 안전하지만, 후속 개발자가 `ConvertToSlipRequest`를 직접 사용하여 warehouseCode 없이 mutate를 호출하면 FE가 BE의 2a 가드(409)에 걸린다. FE 타입 선언이 "이 경로에서는 창고 필수"라는 슬라이스 C 제약을 정확히 반영하지 않아 오용 가능성이 있다.

**제안**

`ConvertToSlipRequest`의 `warehouseCode`를 `string` (필수, non-nullable)으로 변경하거나, mutationFn 내부에서 명시적으로 타입을 `ConvertToSlipRequest`로 캐스팅하여 의도를 명확히 한다. (단, estimate 경로 등 하위호환 호출자가 있다면 분리된 타입을 사용하는 것이 더 적절할 수 있다.)

---

### [P2] phase-2-6a-order-convert.spec.ts — 시나리오 8의 게이트 검증 목적 희석

**문제**

시나리오 8 ("전환수량 모두 0 → 제출 버튼 disabled") 은 슬라이스 C 이전에는 수량 조건만으로 disabled를 검증했다. 슬라이스 C 이후 disabled 조건이 `!convertWarehouse || 수량 0` 으로 확장되었는데, 시나리오 8은 창고를 선택하지 않은 상태에서 disabled를 확인한다. 즉 disabled의 실제 원인이 "수량 0"인지 "창고 미선택"인지 시나리오 8만으로는 구별되지 않는다.

```ts
// 시나리오 8: 창고 선택 없음 → disabled (원인이 창고인지 수량인지 불명확)
await qtyInput.fill('0')
await expect(submitBtn).toBeDisabled()  // !convertWarehouse && 수량 0 — 둘 다 해당
```

**영향**

테스트가 약화(weakened assertion)되어 향후 수량 조건 버그를 놓칠 수 있다. 특히 "창고를 선택했을 때 수량 0 → disabled"를 검증하지 않으므로 수량 가드가 실수로 제거되어도 시나리오 8이 통과할 수 있다.

**제안**

시나리오 8에 창고 선택 단계를 추가하여 "창고 선택 후 수량 0 → disabled"를 검증하도록 강화한다.

```ts
// 제안
await warehouseSelect.selectOption({ index: 1 })  // 창고 선택
await qtyInput.fill('0')
await expect(submitBtn).toBeDisabled()  // 이제 수량 0 만이 원인
```

---

### [P2] mock.ts MOCK_WAREHOUSES — `active` 필드 누락

**문제**

`MOCK_WAREHOUSES` (mock.ts L175-212) 의 각 객체에 `active` 필드가 없다. `listWarehouses` 는 `res.data.data.map((w) => ({ ...w, active: true }))` 로 강제 주입하지만, `/inventory/warehouses` mock 핸들러는 `envelope(MOCK_WAREHOUSES)` 를 직접 반환한다.

`listWarehouses`를 통해 mock 데이터를 가져오면 `active: true`가 주입되므로 실제 Playwright 실행에서는 문제가 없다. 그러나 mock fixture 자체가 design-system `Warehouse` 타입의 필수 필드(`active: boolean`)를 누락하고 있어 TypeScript strict 모드에서 타입 오류가 발생할 가능성이 있고, 향후 mock 데이터를 직접 참조하는 코드가 생기면 런타임 오류가 난다.

**제안**

`MOCK_WAREHOUSES` 각 항목에 `active: true`를 명시 추가한다.

---

### [P2] phase-2-6a-order-convert.spec.ts:410 — 시나리오 11 성공 토스트 검증 불완전

**문제**

시나리오 11 에서 전환 성공 후 토스트 문구를 `SL-20260530-001` 포함 여부만 단언하고, 부분전환(`fullyConverted=false`) 또는 전량전환(`fullyConverted=true`) 분기 문구("잔여 수량이 남아 있습니다" / "전체 수량 전환 완료")를 추가로 단언하지 않는다.

시나리오 2는 동일 경로에서 두 문구를 모두 검증하는 반면, 시나리오 11은 slipNo 포함 여부만 확인한다.

**영향**

창고 선택 → 전환 성공 흐름 자체의 정합성은 검증되지만, fullyConverted 분기 처리 누락 시 감지 범위가 좁아진다. 크리티컬하지는 않으나 보강이 권장된다.

**제안**

```ts
await expect(toast).toContainText('잔여 수량이 남아 있습니다')
```
단언을 추가하거나, mockConvertFully 분기를 포함한 별도 sub-test를 추가한다.

---

## 항목 없음 (양호 확인)

- **정합성 (mutation 시그니처)**: `convertMutation.mutate({ items, warehouseCode: convertWarehouse.code })` 와 `mutationFn(payload) => convertPartnerOrderToSlip(orderId, payload)` 흐름이 일치한다. warehouseCode는 `convertWarehouse.code` (string)로 전송된다.
- **게이트 조건**: disabled 조건에 `!convertWarehouse` 포함, onClick에 `if (!query.data || !convertWarehouse) return` 이중 방어가 정확히 구현됐다.
- **UUID 비공개**: WarehouseSelector의 `value`는 `convertWarehouse?.id` (내부 UUID)이고, convert API 본문에는 `warehouse.code` (HQ-001 형식)만 전송된다. 화면 노출 UUID 없음.
- **design-system 재사용**: `WarehouseSelector`를 `@samhan/design-system`에서 import하여 재사용. 자체 컴포넌트 신규 작성 없음.
- **props 정확성**: `warehouses`, `value`, `onChange`, `label`, `placeholder`, `hideVirtual`, `required`, `disabled` 모두 WarehouseSelector 명세와 정확히 일치.
- **타입 호환성**: inventory.ts `Warehouse`는 design-system `Warehouse`의 상위집합(`address`, `displayOrder`, `description`, `createdAt`, `modifiedAt` 추가 필드). `active`는 `listWarehouses`에서 주입. 할당 방향(상위집합 → 하위집합 기대)이 안전.
- **시나리오 2/3/9 창고 선택 추가**: 기존 시나리오에 창고 선택을 추가한 것은 슬라이스 C 필수 게이트 추가에 따른 정당한 보완이다. 테스트 목적(부분/전량전환 토스트, 409 에러) 자체는 변경되지 않았다.
- **시나리오 11 disabled→enabled 게이트 검증**: 수량 입력 후 disabled 확인 → 창고 선택 후 enabled 확인 → 성공 토스트 순서로 D-WH-03 핵심 요구사항을 직접 검증한다.
- **mock /inventory/warehouses 정합**: `MOCK_WAREHOUSES`의 4개 창고(HQ-001, VH-001, CS-001, VR-001)이 존재하고, `hideVirtual=true`이므로 VR-001은 드롭다운에서 제외된다. index 1 선택은 VH-001(VEHICLE 타입)에 해당하며 유효한 물리 창고다.
- **warehousesQuery queryKey**: `['warehouses']` — 기존 SafetyStockAlertsPage 등 다른 페이지에서 동일 키를 사용하는 경우 캐시 공유가 발생할 수 있지만, 창고 목록은 변경이 드물어 실제 영향은 미미하다.

---

## 요약

| 구분 | 개수 |
|---|---|
| P0 (배포 차단) | 0 |
| P1 (반드시 수정) | 2 |
| P2 (권장 수정) | 3 |
| 총 finding | **5** |

P0 결함은 없으나, P1 두 건 — 특히 **모달 재오픈 시 창고 상태 잔류** 는 사용자가 이전에 선택한 창고가 다음 전환에 자동 적용될 수 있으므로 반드시 수정이 필요하다.
