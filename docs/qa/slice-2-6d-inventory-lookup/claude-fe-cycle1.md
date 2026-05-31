# FE 코드 리뷰 — Phase 2.6d 재고조회 모달 (사이클 1)

리뷰어: Claude FE
브랜치: feat/2-6d-inventory-lookup-modal
날짜: 2026-05-31
결과: **CHANGES_REQUESTED**

---

## P0 결함

### P0-1. mock.ts `parseMockBody` 교체 — 기존 `POST /inventory/balances/batch` 처리와 불일치 가능성

**파일:** `clients/desktop/src/renderer/api/mock.ts` L1789

**내용:**
기존 batch 핸들러는 `JSON.parse(config.data as string)` 로 처리했다. 이번 PR에서 `parseMockBody(config)` 로 교체했는데, `parseMockBody` 는 `config.data` 가 객체(object)이면 그대로 반환한다. Axios 가 `application/json` 요청 시 `config.data` 를 이미 직렬화된 JSON 문자열로 전달하는 경우와 객체 그대로 전달하는 경우가 혼재할 수 있다. 기존 코드는 문자열만 처리했고 객체 케이스는 누락했으므로, `parseMockBody` 로 교체하는 방향 자체는 올바르다.

그러나 2.6c 이전 슬라이스에서 `POST /inventory/balances/batch` 를 string으로 전달하도록 의존하던 다른 테스트(SlipFormPage StockBalanceModal 경로)가 있다면 `parseMockBody` 의 string → JSON.parse 경로가 동일하게 동작하는지 확인 필요하다. `parseMockBody` 구현을 보면 string이면 `JSON.parse`, object이면 그대로 반환하므로 기존 string 케이스는 **호환된다.** 회귀 없음 확인. **이 항목은 P0 우려에서 P2로 강등 — 실제 문제 없음.**

---

### P0-2. `PartnerOrderLine.productId` — 타입 선언 `string`이지만 BE 계약 변경에 따른 런타임 위험

**파일:** `clients/desktop/src/renderer/api/sales.ts` L362

**내용:**
`productId: string` 이 `PartnerOrderLine` 에 추가되었다. BE `PartnerOrderDetailResponse.LineResponse` 에도 `String productId` 가 추가되었고 `nullable = false` 엔티티와 일치한다. 그러나 이 필드는 **이번 배포 전 기존 주문 데이터에 productId 가 DB에 저장되어 있으므로** 런타임 누락 위험은 없다.

단, FE 가 `productId: string` 으로 선언했기 때문에, 구형 API 버전을 사용하는 연결 환경에서 이 필드가 없으면 TypeScript 런타임에서는 `undefined` 가 된다. `SalesPartnerOrderDetailPage` 의 `.filter((l) => checkedLineIds.has(l.lineId) && l.productId)` 는 truthy 체크로 `undefined`/`""` 를 방어하고 있다.

**진짜 P0 문제:** `PartnerOrderLine.productId: string` (non-optional) 임에도 `.filter(...&& l.productId)` 의 truthy 체크 결과 TypeScript strict 모드에서 `string` 은 항상 truthy 하다고 간주하지 않는다. 실제로 TypeScript는 `string` 타입 값에 대한 truthy narrowing을 수행하지 않으므로 `l.productId` 가 빈 문자열 `""` 인 경우 filter를 통과한 후 `fetchProductBalancesMatrix` 에 빈 `productId` 가 전달되어 BE에 404/400을 유발할 수 있다.

**권고:** `l.productId.length > 0` 또는 `!!l.productId` 로 명시적 guard 추가. 또는 타입을 `productId: string | null` 로 정정 후 null guard.

---

## P1 결함

### P1-1. `checkedLineIds` 상태 — 슬립 전환 시 미초기화

**파일:** `clients/desktop/src/renderer/routes/SlipDetailPage.tsx` L219

**내용:**
`checkedLineIds` 는 `useState<Set<string>>(new Set())` 로 선언되어 컴포넌트 마운트 시 초기화된다. 그러나 `/sales/:id` 라우트에 `key` prop이 없으므로, 사용자가 전표 A에서 전표 B로 `useNavigate()` 로 이동할 때 **SlipDetailPage 컴포넌트가 언마운트-재마운트 되지 않고** params만 변경된다(react-router `createHashRouter` 기본 동작). 이 경우 전표 A에서 체크한 `checkedLineIds` 가 전표 B에서도 유지되어, 전표 B의 `slip.lines` 에 존재하지 않는 lineId 가 `checkedLineIds` 에 남는다. `inventoryLookupLines` 필터(`checkedLineIds.has(l.id)`) 가 이를 제거하므로 화면 오동작은 없지만, 체크박스 상태가 의도치 않게 유지되는 UX 결함이다.

**권고:** `useEffect(() => { setCheckedLineIds(new Set()) }, [id])` 추가로 id 변경 시 초기화.

**동일 지적이 `SalesPartnerOrderDetailPage` 에도 적용됨:** 해당 페이지는 단일 주문 상세라 일반적으로 재방문이 드물지만 동일 패턴 적용 권고.

---

### P1-2. `InventoryLookupModal` `showZero` 상태 미초기화

**파일:** `clients/desktop/src/renderer/routes/components/InventoryLookupModal.tsx` L51

**내용:**
`showZero` 는 `useState(false)` 이며 모달이 닫혀도 리셋되지 않는다. 사용자가 0토글을 ON으로 켠 후 모달을 닫고, 다른 품목을 선택하여 다시 열면 0토글이 ON 상태로 유지된다. D-IL-03 에서 "기본 OFF" 를 명시하고 있으나 close-reopen 시 재적용이 명확하지 않다.

세부 분석:
- 동일 품목을 다시 열면 캐시 사용 + 이전 토글 상태 유지 → 일관성 유지(의도 가능).
- 다른 품목 선택 후 열면 새 queryKey → 새 fetch이지만 토글은 여전히 ON → 사용자가 혼동할 수 있음.

**권고:** `open` prop이 `false → true` 로 변경될 때 `showZero` 를 `false` 로 리셋하는 `useEffect` 추가.

```tsx
useEffect(() => {
  if (open) setShowZero(false)
}, [open])
```

---

### P1-3. `SalesPartnerOrderDetailPage` — 재고조회 모달 IIFE 패턴 불필요

**파일:** `clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx` L1127-L1146

**내용:**
`lookupLines` 계산을 IIFE(`(() => { ... })()`)로 JSX 내에서 수행하고 있다. `SlipDetailPage` 는 동일 로직을 컴포넌트 본문 최상위에서 계산한다. IIFE 패턴은 재렌더마다 동일 계산을 수행하며, 가독성이 떨어지고 테스트 단위 격리가 어렵다.

**권고:** `const inventoryLookupLines = useMemo(() => ...)` 또는 단순 상수 계산으로 본문 최상위로 이동.

---

### P1-4. Playwright 시나리오 12 — `stock-balance-modal` testid 검증 무효

**파일:** `clients/desktop/playwright/d2-6d-inventory-lookup/inventory-lookup.spec.ts` L274-L285

**내용:**
`StockBalanceModal` (design-system) 에는 `data-testid="stock-balance-modal"` 이 없다. 따라서 `getByTestId('stock-balance-modal').toHaveCount(0)` 는 항상 통과하며 "StockBalanceModal 이 열리지 않았음" 을 실질적으로 검증하지 못한다.

**권고:** `StockBalanceModal` 의 내부 구조(예: overlay 클래스명 또는 aria role) 를 기준으로 검증하거나, 또는 `[data-testid="stock-balance-modal"]` 을 `StockBalanceModal` 에 추가한 후 검증.

---

### P1-5. `SalesPartnerOrderDetailPage` aria-label 불일치 — `modelCode` 사용

**파일:** `clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx` L674

**내용:**
```tsx
aria-label={`${line.modelCode} 재고조회 선택`}
```
Playwright spec의 선택자는 `page.getByRole('checkbox', { name: /재고조회 선택/ })` 로 suffix만 매칭하므로 실제 테스트에는 영향이 없다. 그러나 `SlipDetailPage` 는 `l.modelName`을 사용한다. 주문 라인의 `modelCode` 는 실제로 모델명(AJ040RXH4BC1 등)이므로 aria-label로서의 의미는 동일하다. 일관성을 위해 `modelName` 으로 통일 권고 (주석에도 `modelCode = modelName 매핑` 이라고 기술되어 있음).

---

## P2 결함

### P2-1. `queryKey` — `lines` 참조 캡처 문제 (stale closure 위험)

**파일:** `clients/desktop/src/renderer/routes/components/InventoryLookupModal.tsx` L52-L57

**내용:**
```tsx
queryKey: ['inventory-lookup', lines.map((l) => l.productId).sort().join(',')],
queryFn: () => fetchProductBalancesMatrix(lines),
```
`queryKey` 는 productId 정렬 조합으로 정확히 캐시를 식별하고 있다. `queryFn` 은 클로저로 `lines` 를 캡처한다. 동일 productId 조합이지만 `modelName`/`productName` 메타가 다른 경우(실제로는 발생 불가), 캐시 히트 시 stale 메타가 노출될 수 있다. 현재 구조에서는 실제 문제가 아니지만, 미래 확장 시 유의.

### P2-2. 체크박스 컬럼 헤더 `th` 의 `className="col-no"` 중복

**파일:** `clients/desktop/src/renderer/routes/SlipDetailPage.tsx` L1587

**내용:**
```tsx
<th className="col-no" style={{ width: 28, textAlign: 'center' }}>
```
기존 `#` 번호 컬럼도 `col-no` 를 사용한다. 두 개의 `col-no` 가 존재하여 CSS 너비 지정이 혼선될 수 있다. 체크박스 컬럼에는 `col-check` 등 별도 class 사용 권고.

### P2-3. `p-pc1nw` (WIFI 판넬) 선택 시 모든 창고 0 → "실재고가 있는 창고가 없습니다" 표시

**파일:** `clients/desktop/src/renderer/api/mock.ts`

**내용:**
`p-pc1nw` 는 mock에서 VR-001(가상창고) 만 잔량 row가 있고, `fetchProductBalancesMatrix` 는 VIRTUAL을 제외하므로 모든 창고 `total=0` 이 된다. 0토글 OFF 기본 상태에서 "실재고가 있는 창고가 없습니다" 메시지가 표시된다. 이는 의도된 동작이지만 Playwright 시나리오 8 에서 `SAMPLE_LINES`의 첫 번째 라인(p-aj040)을 사용하므로 HQ-001이 표시된다 — 테스트 자체는 문제없다. 운영 환경에서 실제 WIFI 판넬 재고가 없는 경우 사용자가 혼란을 느낄 수 있다. 빈 메시지 문구 개선 고려.

### P2-4. `testid` 패턴 — `inventory-lookup-cell-{modelName}-{warehouseCode}` 특수문자 위험

**파일:** `clients/desktop/src/renderer/routes/components/InventoryLookupModal.tsx` L248

**내용:**
```tsx
data-testid={`inventory-lookup-cell-${row.modelName}-${w.warehouseCode}`}
```
`modelName` 에 공백·슬래시 등 특수문자가 포함된 경우(예: 실제 모델명 `AJ040 RXH4` 등) CSS 선택자·testid 매칭이 깨질 수 있다. 현재 모의 데이터에서는 문제가 없지만, 실 데이터에서는 위험하다.

**권고:** `data-testid` 에 `productId` 또는 `productId`의 slug를 사용하고, UUID 화면 미노출 원칙과 testid의 노출 범위(DOM attribute, 사용자 비노출)를 구분하여 허용하는 것이 안전하다. 또는 `row.modelName.replace(/\s+/g, '-')` 등 sanitization.

### P2-5. `SlipDetailPage` — `전체 선택` 체크박스 `key` 부재

**파일:** `clients/desktop/src/renderer/routes/SlipDetailPage.tsx` L1587-L1611

**내용:**
전체 선택 체크박스는 `<th>` 내의 고정 요소이므로 key가 불필요하다. 개별 라인 체크박스에는 key가 없지만 `<tr key={l.id}>` 내에 있으므로 문제없다. 단순 확인.

---

## 중점 항목 검토 요약

| 중점 | 결과 |
|---|---|
| D-IL-01 전창고 머지 (0/0/0 채움) | 통과. `fetchProductBalancesMatrix` 가 `listWarehouses` 결과 전체를 초기화 후 batch 덮어쓰기. VIRTUAL 제외. displayOrder ASC(listWarehouses 정렬 위임). |
| D-IL-03 0토글 클라이언트 필터 | 통과. API 재호출 없이 `visibleCols` 클라이언트 필터. 단, P1-2(초기화 미흡) 지적. |
| 셀 3줄 가용/실/예약 매핑 | 통과. `available`, `reserved`, `total` 올바르게 매핑. |
| UUID 비공개 | 통과. `productId`/`warehouseId` 화면 미노출. `data-testid` 에 modelName 사용(P2-4 주의). |
| 회귀 — SlipDetailPage alert 잔여 | 통과. `fetchStockBalanceBatch` import 및 `handleStockQuery` 완전 제거. StockBalanceLookupLine type-only import 정상. |
| 회귀 — SlipFormPage / StockBalanceModal | 통과. 변경 없음. |
| 주문 라인 modelCode→modelName 매핑 | 통과. `SalesPartnerOrderDetailPage` 주석으로 명시 (`modelCode = modelName 매핑`). |
| design-system 재사용 | 통과. Modal + Button 재사용. Checkbox DS 없음 → raw input 사용(허용). |
| react-query key/enabled | 통과. `enabled: open && lines.length > 0`. staleTime 30s 적절. |
| 로딩·에러·빈 상태 | 통과. 세 상태 모두 명시적 렌더링. |
| Playwright skipped=0 | 확인 필요. `test.skip()` 없음 확인. 단, 시나리오 12(P1-4) 검증 허점 있음. |
| mock `parseMockBody` 회귀 | 통과. string/object 양쪽 안전 처리 — 기존 케이스 호환. |

---

## 결론

**CHANGES_REQUESTED**

P0 수준 실제 결함은 없으나 다음 P1 항목은 머지 전 수정 필요:

1. **P1-1** `checkedLineIds` — `useEffect([id])` 초기화 누락 (SlipDetailPage + SalesPartnerOrderDetailPage).
2. **P1-2** `showZero` — `open` 변경 시 `useEffect` 리셋 누락 (`InventoryLookupModal`).
3. **P1-3** IIFE 패턴 — `SalesPartnerOrderDetailPage` lookupLines 계산을 본문 최상위로 이동.
4. **P1-4** Playwright 시나리오 12 — `stock-balance-modal` testid 검증 무효 (StockBalanceModal에 testid 없음).
5. **P1-5** aria-label 일관성 — `SalesPartnerOrderDetailPage` `modelCode` → `modelName` 통일.

P2 항목(P2-1~P2-5)은 별도 후속 이슈로 처리 가능.
