# 품목 재고조회 모달 (Phase 2.6d) 구현 계획

> **For agentic workers:** 본 repo 는 5-team 병렬 디스패치 + cycle N=2 패턴([[feedback_multi_agent_team_pattern]])으로 실행. FE 중심 슬라이스(BE 1건 최소). 각 Task checkbox 추적.

**Goal:** 주문/출고/입고 상세에서 품목 라인 다중선택 → 창고별 가용/실/예약 매트릭스 모달(0수량 전창고 토글)로 즉시 재고 확인.

**Architecture:** 읽기 전용. `POST /inventory/balances/batch`(전 role, 가용/실/예약 반환) + `GET /inventory/warehouses` FE 머지로 전 창고 0/0/0 채움. 신규 공유 `InventoryLookupModal`을 2개 상세 페이지(SlipDetailPage=출고·입고 공용, SalesPartnerOrderDetailPage)에 배선. 주문 라인 productId 노출 위한 BE 1건 최소 변경.

**Tech Stack:** React 18 + Electron(desktop) / @tanstack/react-query / design-system Modal / Playwright. BE Spring Boot(partner-order DTO 1건).

**설계 출처:** `docs/superpowers/specs/2026-05-31-inventory-lookup-modal-design.md` (D-IL-01~06).

---

## File Structure
- Modify: `services/partner-order-service/.../web/dto/PartnerOrderDetailResponse.java` (LineResponse productId)
- Modify: `clients/desktop/src/renderer/api/sales.ts` (PartnerOrderLine.productId 타입)
- Modify: `clients/desktop/src/renderer/api/inventory.ts` (fetchProductBalancesMatrix)
- Create: `clients/desktop/src/renderer/routes/components/InventoryLookupModal.tsx`
- Modify: `clients/desktop/src/renderer/routes/SlipDetailPage.tsx` (alert 재고조회 → 모달 + 다중선택)
- Modify: `clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx` (다중선택 + 버튼 + 모달)
- Modify: `clients/desktop/src/renderer/api/mock.ts` (balances/batch + warehouses mock 보강)
- Test: `clients/desktop/playwright/d2-6d-inventory-lookup/inventory-lookup.spec.ts`

---

## Phase 0 — BE 최소 (backend-engineer)

### Task 1: 주문 상세 LineResponse 에 productId 노출

**Files:**
- Modify: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/dto/PartnerOrderDetailResponse.java`
- Test: `services/partner-order-service/src/test/java/.../web/PartnerOrderDetailControllerIT.java` (기존 있으면 보강, 없으면 단위 단언)

- [ ] **Step 1: LineResponse 에 productId 추가**

`record LineResponse(...)` 의 첫 필드로 `String productId` 추가 + Javadoc + `from` 매핑:
```java
public record LineResponse(
        String productId,
        String lineId,
        String modelCode,
        String productName,
        String categoryKey,
        int quantity,
        BigDecimal deliveryPrice,
        BigDecimal subtotal,
        int convertedQuantity,
        String bundleMode,
        List<ComponentResponse> expandedComponents
) {
    static LineResponse from(PartnerOrderLine line) {
        return new LineResponse(
                line.getProductId().toString(),
                line.getId().toString(),
                line.getModelName(),
                line.getProductName(),
                line.getCategoryKey(),
                line.getQuantity(),
                line.getPriceVat(),
                line.getSubtotal(),
                line.getConvertedQuantity(),
                null,
                List.of());
    }
}
```
> productId Javadoc: "재고 batch 조회 키. 사용자 화면 미노출(UUID 비공개)."

- [ ] **Step 2: 컴파일 + 기존 IT 회귀**

Run: `./gradlew :services:partner-order-service:compileJava :services:partner-order-service:test --tests "*PartnerOrder*Detail*"`
Expected: BUILD SUCCESSFUL (productId 필드 추가만, 기존 단언 무영향). 기존 detail IT 가 LineResponse 필드 수를 단언하면 갱신.

- [ ] **Step 3: 커밋 금지(PM 통합).** 자체 검증만.

---

## Phase 1 — FE API (frontend-engineer)

### Task 2: inventory.ts `fetchProductBalancesMatrix` + sales.ts 타입

**Files:**
- Modify: `clients/desktop/src/renderer/api/sales.ts`
- Modify: `clients/desktop/src/renderer/api/inventory.ts`

- [ ] **Step 1: sales.ts `PartnerOrderLine` 에 productId 추가**

```typescript
export interface PartnerOrderLine {
  /** 재고조회 batch 키. 화면 미노출(UUID 비공개). */
  productId: string
  lineId: string
  modelCode: string
  // ...기존 필드 유지
}
```
그리고 `getPartnerOrder` 매핑이 `line.productId` 를 그대로 전달하는지 확인(BE 응답에 신규 필드 포함).

- [ ] **Step 2: inventory.ts 매트릭스 조회 함수**

기존 `fetchStockBalanceBatch`(총량 only) 는 무변경. 신규 함수 추가:
```typescript
/** 창고 컬럼 — 매트릭스 헤더. */
export interface BalanceWarehouseCol {
  warehouseId: string
  warehouseCode: string
  warehouseName: string
  warehouseType: WarehouseType
}
/** 품목 행 — 창고코드별 가용/실/예약 셀. */
export interface BalanceMatrixRow {
  productId: string
  modelName: string
  productName: string
  /** warehouseCode → {available, reserved, total}. 머지로 전 창고 채움(없으면 0/0/0). */
  cells: Record<string, { available: number; reserved: number; total: number }>
}
export interface BalanceMatrix {
  warehouses: BalanceWarehouseCol[]
  rows: BalanceMatrixRow[]
}

/**
 * 다건 품목의 창고별 가용/실/예약 매트릭스 — Phase 2.6d.
 * batch(가용/실/예약) + listWarehouses 머지로 전 창고 집합 확보(D-IL-01).
 * VIRTUAL 창고 제외(D-IL-04 / 2.6c 관례).
 */
export async function fetchProductBalancesMatrix(
  lines: StockBalanceLookupLine[],
): Promise<BalanceMatrix> {
  const productIds = lines.map((l) => l.productId)
  const [balRes, warehouses] = await Promise.all([
    apiClient.post<ApiEnvelope<ProductBalanceResponse[]>>(
      '/inventory/balances/batch', { productIds }),
    listWarehouses(),
  ])
  // 전 창고(비-VIRTUAL) 컬럼 — displayOrder ASC (listWarehouses 정렬 유지)
  const cols: BalanceWarehouseCol[] = warehouses
    .filter((w) => w.type !== 'VIRTUAL')
    .map((w) => ({ warehouseId: w.id, warehouseCode: w.code, warehouseName: w.name, warehouseType: w.type }))
  const metaById = new Map(lines.map((l) => [l.productId, l] as const))
  const rows: BalanceMatrixRow[] = balRes.data.data.map((p) => {
    const meta = metaById.get(p.productId)
    const cells: Record<string, { available: number; reserved: number; total: number }> = {}
    // 전 창고 0/0/0 초기화 후 balance 덮어쓰기
    for (const c of cols) cells[c.warehouseCode] = { available: 0, reserved: 0, total: 0 }
    for (const b of p.balances) {
      if (b.warehouseType === 'VIRTUAL') continue
      cells[b.warehouseCode] = { available: b.availableQty, reserved: b.reservedQty, total: b.totalQty }
    }
    return {
      productId: p.productId,
      modelName: meta?.modelName ?? '',
      productName: meta?.productName ?? '',
      cells,
    }
  })
  return { warehouses: cols, rows }
}
```
> `ProductBalanceResponse`(line 285) 는 이미 `availableQty/reservedQty/totalQty/warehouseType` 보유. `StockBalanceLookupLine`(line 304) 재사용.

- [ ] **Step 3: 타입체크 + 커밋 금지**

Run: `cd clients/desktop; npm run typecheck`

---

## Phase 2 — FE 공유 모달 (frontend-engineer + designer)

### Task 3: InventoryLookupModal

**Files:**
- Create: `clients/desktop/src/renderer/routes/components/InventoryLookupModal.tsx`

- [ ] **Step 1: 모달 구현**

```tsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Modal, Button } from '@samhan/design-system'
import { fetchProductBalancesMatrix, type StockBalanceLookupLine } from '../../api/inventory'

interface Props {
  open: boolean
  onClose: () => void
  lines: StockBalanceLookupLine[]   // {productId, modelName, productName}
}

export function InventoryLookupModal({ open, onClose, lines }: Props) {
  const [showZero, setShowZero] = useState(false)
  const query = useQuery({
    queryKey: ['inventory-lookup', lines.map((l) => l.productId).sort()],
    queryFn: () => fetchProductBalancesMatrix(lines),
    enabled: open && lines.length > 0,
  })
  // 0토글 OFF = 실재고(total) 합 > 0 인 창고만 컬럼 노출 (D-IL-03 기준 = 실재고)
  const matrix = query.data
  const visibleCols = !matrix ? [] : matrix.warehouses.filter((w) =>
    showZero || matrix.rows.some((r) => (r.cells[w.warehouseCode]?.total ?? 0) > 0))
  // ... Modal 렌더: 로딩/에러/빈, 매트릭스 표(행=품목, 열=창고, 셀 3줄 가용/실/예약),
  //     상단 [☐ 0수량 창고도 표시] 체크박스. UUID 미노출(modelName/productName/warehouseCode/warehouseName 만).
}
```
- 셀 렌더 = `가용 {available} / 실 {total} / 예약 {reserved}` 3줄(Designer 토큰·레이아웃 가이드).
- data-testid: `inventory-lookup-modal`, `inventory-lookup-zero-toggle`, `inventory-lookup-cell-{modelName}-{warehouseCode}`.
- design-system 컴포넌트 우선, 하드코딩 색 금지.

- [ ] **Step 2: 타입체크/lint/build + 커밋 금지**

Run: `cd clients/desktop; npm run typecheck && npm run lint`

---

## Phase 3 — FE 트리거 배선 (frontend-engineer)

### Task 4: SlipDetailPage — alert 재고조회 → 모달 + 다중선택

**Files:**
- Modify: `clients/desktop/src/renderer/routes/SlipDetailPage.tsx`

- [ ] **Step 1**: 기존 단일 라인 `selectedLineId` → `alert()` 재고조회(약 847~869행) 를 제거하고:
  - 라인 표에 **체크박스 다중선택**(productId 보유 라인) + "선택 품목 재고조회" 버튼(선택 0 시 비활성).
  - 클릭 → 선택 라인 `{productId, modelName, productName}` 배열로 `InventoryLookupModal` open.
  - 출고(OUTBOUND)·입고(INBOUND) 양 mode 공통 동작. 기존 라인 표/편집 기능 무변경.
- [ ] **Step 2**: typecheck. 커밋 금지.

### Task 5: SalesPartnerOrderDetailPage — 다중선택 + 버튼 + 모달

**Files:**
- Modify: `clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx`

- [ ] **Step 1**: 라인 표(약 610행 `lines.map`)에 체크박스 다중선택 + "선택 품목 재고조회" 버튼 + `InventoryLookupModal`. 라인 `productId`(Task 1·2 로 노출) + `modelCode`(=modelName) + `productName` 전달. 기존 부분전환/전환 버튼·표 무변경.
- [ ] **Step 2**: typecheck. 커밋 금지.

---

## Phase 4 — 테스트 (frontend-engineer + qa-tester)

### Task 6: mock 보강 + Playwright

**Files:**
- Modify: `clients/desktop/src/renderer/api/mock.ts`
- Create: `clients/desktop/playwright/d2-6d-inventory-lookup/inventory-lookup.spec.ts`

- [ ] **Step 1: mock** — `/inventory/balances/batch` 가 가용/실/예약 + warehouseType 포함 응답, `/inventory/warehouses` 가 batch 에 없는 창고 1개 이상 포함(전 창고 머지·0표시 검증용). 주문/슬립 상세 mock 라인에 productId 포함.
- [ ] **Step 2: Playwright** — ① 주문 상세 다중선택→모달→매트릭스 표시, ② 0토글 OFF=실재고>0 창고만 / ON=전 창고(0 셀 노출), ③ 셀 가용/실/예약 3줄, ④ 출고·입고 상세 동일. 회귀: 기존 SlipFormPage StockBalanceModal 무변경.
- [ ] **Step 3**: `cd clients/desktop; npm run test:e2e -- d2-6d-inventory-lookup` PASS, skip 0. 커밋 금지.

---

## Phase 5 — 문서 (PM/TM)

### Task 7: DECISIONS + dev-report + 핸드오프
- [ ] DECISIONS D-IL-01~06 + `docs/dev-reports/slice-2-6d-inventory-lookup-modal.md`(함수 3-layer) + 핸드오프 갱신.

---

## Self-Review

**1. Spec coverage:** D-IL-01(전창고 머지)→Task2. D-IL-02(다중품목)→Task3·4·5. D-IL-03(셀3줄)→Task3. D-IL-04(batch API)→Task2. D-IL-05(신규 모달)→Task3. D-IL-06(주문라인 productId)→Task1·2. §4.4 트리거 2페이지→Task4·5. §5 테스트→Task6. ✅

**2. Placeholder scan:** Task3 모달 렌더 본문은 골격+contract 명시(셀 포맷/testid/토글 로직 구체화). Task4/5 는 기존 파일 통합이라 동작 명세+전달 contract 제시. BE Task1 완전 코드. 플레이스홀더성 "..."는 모달 JSX 레이아웃부 한정(Designer 협업 영역).

**3. Type consistency:** `StockBalanceLookupLine{productId,modelName,productName}`(inventory.ts 기존) ↔ 트리거가 전달하는 라인 ↔ 모달 props 정합. `BalanceMatrix.rows[].cells[code]{available,reserved,total}` ↔ 셀 렌더 정합. 주문 라인 `modelCode`=modelName 매핑 주의(트리거에서 modelName 키로 전달).

> ⚠️ 구현 확인: SlipDetailPage 기존 `fetchStockBalanceBatch`/alert 제거 시 import 정리 / 주문 상세 라인 `modelCode`→`modelName` 명칭 매핑 / mock 라인 productId 추가.
