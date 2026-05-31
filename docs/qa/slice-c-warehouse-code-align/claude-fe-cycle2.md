# FE 코드 리뷰 — 슬라이스 C (창고코드 정렬) claude-fe-cycle2

- **브랜치**: `feat/slice-c-slip-inventory-warehouse-align`
- **fix 커밋**: `184da98f` (fix(fe): 슬라이스 C 사이클1 — 창고 필수 타입/초기화/에러 텍스트/로딩 상태)
- **결론**: **APPROVE** (잔여 P1 finding 0건, 신규 결함 없음 — 미해소 P2 찾기 1건 별도 기록)

---

## 사이클1 P1 finding 해소 판정

### FE-F1 [P1] 모달 open 시 convertWarehouse 초기화 누락 — **해소**

**확인 위치**: `SalesPartnerOrderDetailPage.tsx:482`

fix 커밋 diff 및 현재 파일 모두에서 `setConvertOpen(true)` 직전 `setConvertWarehouse(null)` 가 추가됐다.

```tsx
// SalesPartnerOrderDetailPage.tsx 라인 481-483 (현재 상태)
setConvertQtyMap(initQty)
setConvertWarehouse(null)   // ← 추가됨
setConvertOpen(true)
```

모달 open onClick 에서 초기화 호출이 올바르게 삽입되었다. 기존 onClose / 취소 버튼에도 `setConvertWarehouse(null)` 이 있으므로 재오픈 경로 3개 모두 초기화된다.

판정: **해소**

---

### FE-F2 [P1] ConvertToSlipRequest.warehouseCode optional/required 불일치 — **해소 (단, JSDoc 잔존 미해소 — P2 강등)**

**확인 위치**: `clients/desktop/src/renderer/api/sales.ts:393-396`

```ts
// 현재 상태
export interface ConvertToSlipRequest {
  items: ConvertToSlipItem[]
  /** 출고 창고 코드 (필수 — D-WH-03). */
  warehouseCode: string   // ← optional 제거, 필수 string으로 변경됨
}
```

`warehouseCode?: string | null` → `warehouseCode: string` 으로 변경되었다. 타입 레벨에서 FE-F2 의 핵심 요구사항(필수 선언)은 달성됐다.

**다른 호출처 영향 없음 확인**:
`convertPartnerOrderToSlip` 의 유일한 호출처는 `SalesPartnerOrderDetailPage.tsx:936` 이며, `convertWarehouse.code` (string) 를 전달한다. warehouseCode 없이 호출하는 다른 경로는 존재하지 않는다.

**typecheck 결과**: `npm run typecheck` (tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit) exit 0 확인.

**단, 미해소 항목 (P2 강등)**: `sales.ts:420` JSDoc 함수 주석이 여전히 `warehouseCode optional` 을 명시한다.

```ts
// sales.ts:420 — 수정되지 않은 상태
* @param request 전환 요청 (items: 수량>0 라인만, warehouseCode optional).
```

타입 선언은 `warehouseCode: string` (필수)로 변경됐으나 함수 수준 주석이 구 내용을 유지한다. 컴파일 오류·런타임 영향 없음. 후속 개발자 혼란 가능성만 있음 → P2 강등.

판정: **타입 핵심 해소 / JSDoc 잔존 P2**

---

## 신규 결함 점검

### 1. convertWarehouseError 파생 계산 — 렌더마다 올바르게 계산되는지

`convertWarehouseError` 는 IIFE 내부에서 매 렌더마다 재계산된다.

```tsx
// SalesPartnerOrderDetailPage.tsx 971-991
{(() => {
  const hasConvertQty = Object.values(convertQtyMap).some((q) => q > 0)
  const convertWarehouseError = warehousesQuery.isError
    ? '창고 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'
    : (!convertWarehouse && hasConvertQty ? '출고 창고를 선택하세요.' : undefined)
  return (...)
})()}
```

경우의 수별 동작:
- `isError=true` → 항상 에러 문자열 표시 (창고/수량 상관없이)
- `!convertWarehouse && hasConvertQty` → 품목 수량 > 0 이고 창고 미선택일 때만 에러
- 그 외 → `undefined` (에러 없음)

React 렌더 사이클마다 재계산되므로 stale state 없음. `hasConvertQty` 가 `convertQtyMap` 에 의존하고, `convertWarehouseError` 가 `convertWarehouse` / `warehousesQuery.isError` 에 의존하므로, 각 상태 변경 시 자동 재렌더되어 올바르게 갱신된다. 불필요 리렌더나 계산 오류 없음.

### 2. error/disabled prop 추가와 기존 게이트 로직 충돌 여부

submit 버튼 disabled 조건 (라인 916-920):

```tsx
disabled={
  convertMutation.isPending ||
  !query.data ||
  !convertWarehouse ||
  Object.values(convertQtyMap).every((q) => q <= 0)
}
```

WarehouseSelector 의 `disabled={convertMutation.isPending || warehousesQuery.isLoading}` 과 독립적으로 작동한다. 두 조건이 서로 충돌하는 경우 없음:
- `warehousesQuery.isLoading` 중에는 WarehouseSelector 자체가 비활성이므로 `convertWarehouse` 가 null 이 되어 submit 도 disabled 됨 (이중 보호).
- `warehousesQuery.isError` 일 때 `error` prop 표시 + `convertWarehouse = null` 유지 → submit disabled (정상).

### 3. 기존 P2 finding (mock.ts active 필드) — 해소 확인

FE-F2 (P2) 로 기록됐던 `MOCK_WAREHOUSES active 필드 누락` 은 fix 커밋에서 4개 항목 모두에 `active: true` 가 추가됐다. 해소 완료.

---

## 미해소 / 신규 P2 목록

| ID | 위치 | 내용 | 사이클1 판정 |
|---|---|---|---|
| P2-JSDoc | `sales.ts:420` | `@param request` JSDoc 에 `warehouseCode optional` 잔존 — 타입은 필수이나 주석 불일치 | 신규 발견 (FE-F2 연장) |
| P2-시나리오8 | spec.ts | 창고/수량 disabled 원인 구분 불명확 (사이클1 기존 P2) | 미해소 (수정 없음) |
| P2-시나리오11 | spec.ts | 성공 토스트 fullyConverted 분기 미검증 (사이클1 기존 P2) | 미해소 (수정 없음) |

P2 3건 모두 컴파일·런타임 영향 없음. 차기 리팩터링 사이클에서 처리 권장.

---

## 요약

| 구분 | 사이클1 | 사이클2 |
|---|---|---|
| P0 (배포 차단) | 0 | 0 |
| P1 (반드시 수정) | 2 | **0 (모두 해소)** |
| P2 (권장 수정) | 3 | 3 (1 해소 + 1 신규 = 3 유지) |
| 총 잔여 finding | 5 | **3 (전부 P2)** |

**결론: APPROVE**. P1 2건 모두 해소, typecheck 통과, 신규 P0/P1 결함 없음. P2 3건은 배포 차단 요인 아님.
