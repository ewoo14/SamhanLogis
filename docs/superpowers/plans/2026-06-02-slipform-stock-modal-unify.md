# SlipFormPage 재고모달 일원화 + 목록 배지 갱신 E2E — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **🚨 프로젝트 규칙**: 실제 코드/테스트 구현은 **Codex 디스패치**가 수행한다([[feedback_codex_implements_claude_reviews]]). 본 계획의 코드 블록은 **구현 명세(target)** 이며, Codex 가 이를 그대로 구현하고 Claude 5-agent + Codex 5-agent dual 리뷰가 검증한다([[feedback_dual_5agent_review]], 사이클 N=2 [[feedback_cycle_n2_mandatory]]). PR 은 1차 push 직후 즉시 발행([[feedback_open_pr_early]]).

**Goal:** 전표 작성 페이지(`SlipFormPage`)의 구 재고모달(총량만)을 상세 페이지와 동일한 가용/실/예약 모달(`InventoryLookupModal`)로 일원화하고, 분기된 구 컴포넌트/함수를 제거하며, 전환/병합 후 주문 목록 상태 배지 갱신을 검증하는 Playwright E2E 회귀 테스트를 추가한다.

**Architecture:** 데스크톱 렌더러 단일 라우트(`SlipFormPage`)의 모달 import 를 교체하고 자체-페치 모달에 맞게 폼의 페치 state/mutation 을 제거한다. 디자인시스템 공용 컴포넌트 1개와 api 함수 1개를 데드코드로 삭제한다. 배지 갱신 E2E 는 기존 `VITE_MOCK_MODE` mock.ts 를 **상태 보존(stateful)** 으로 확장하여 병합 후 목록 status 가 CONVERTED 로 바뀌는 것을 모사하고, react-query `invalidateQueries` 가 수동 새로고침 없이 목록을 갱신함을 단언한다.

**Tech Stack:** React 18 + TypeScript, @tanstack/react-query, @samhan/design-system, Playwright (VITE_MOCK_MODE in-app mock.ts), Vite.

**Spec:** `docs/superpowers/specs/2026-06-02-slipform-stock-modal-unify-design.md`

---

## File Structure

| 파일 | 책임 | 변경 |
|---|---|---|
| `clients/desktop/src/renderer/routes/SlipFormPage.tsx` | 전표 작성/편집 폼 | 모달 교체 + 데드 state/mutation/memo/import 제거 + 버튼 testid |
| `clients/desktop/src/renderer/routes/components/InventoryLookupModal.tsx` | 공용 가용/실/예약 모달 | 무변경 (재사용) |
| `clients/web/design-system/src/components/StockBalanceModal/` | 구 총량 모달 | **디렉토리 전체 삭제** |
| `clients/web/design-system/src/index.ts` | DS 배럴 export | StockBalanceModal export 제거 |
| `clients/desktop/src/renderer/api/inventory.ts` | 재고 API | `fetchStockBalanceBatch`+전용 타입 제거 (ProductBalanceResponse 유지) |
| `clients/desktop/src/renderer/api/mock.ts` | in-app mock | ① 구 함수 주석 정리 ② 병합 후 status 상태보존 추가 |
| `clients/desktop/playwright/d2-6d-inventory-lookup/inventory-lookup.spec.ts` | 재고모달 E2E | 시나리오 12(SlipFormPage 회귀) 갱신 |
| `clients/desktop/playwright/partner-order-list-badge-refresh/partner-order-list-badge-refresh.spec.ts` | 배지 갱신 E2E | **신규** |
| `docs/dev-reports/slice-3-d-slipform-stock-modal-unify.md` | dev-report | 신규 |

---

## Task 1: SlipFormPage 모달 일원화 + 데드 코드 제거

**Files:**
- Modify: `clients/desktop/src/renderer/routes/SlipFormPage.tsx`

배경: 현재 `SlipFormPage` 는 구 `StockBalanceModal`(@samhan/design-system, 총량+합계)을 `useMutation`+`fetchStockBalanceBatch` 로 페치해 렌더한다. 신 `InventoryLookupModal`(가용/실/예약, 자체 `useQuery`)로 교체하면 폼의 페치 state/mutation/컬럼 memo 가 불필요해진다. 스냅샷(`stockSelectedSnapshot`)은 유지하여 모달 열린 채 라인 편집 시 표 흔들림을 방지한다.

- [ ] **Step 1: import 교체**

`@samhan/design-system` import 블록(현 라인 30~47)에서 `StockBalanceModal`, `type StockBalanceRow`, `type WarehouseColumn` 3개 항목을 제거한다. 나머지(Card/DeliveryTagSelector/FormField/KOREAN_MOBILE_PHONE_PATTERN/LineRow/LineTableHeader/PartnerAutocomplete/PhoneInput/ProductAutocomplete/WarehouseSelector/type DeliveryTagOption/type LineDraft/type PartnerOption/type ProductOption)는 유지.

inventory api import(현 라인 66~70)를 다음으로 교체 — `fetchStockBalanceBatch` 제거, `listWarehouses`/`StockBalanceLookupLine` 유지:

```tsx
import {
  listWarehouses,
  type StockBalanceLookupLine,
} from '../api/inventory'
```

신 모달 import 를 routes import 인근에 추가:

```tsx
import { InventoryLookupModal } from './components/InventoryLookupModal'
```

- [ ] **Step 2: 페치 state 제거 (스냅샷은 유지)**

현 라인 237~243 의 재고조회 state 4개 중 `stockRows`, `stockError` 2개를 제거하고 `stockModalOpen`, `stockSelectedSnapshot` 만 남긴다. 스냅샷 타입은 `StockBalanceLookupLine` 으로 정리:

```tsx
  // 재고조회 모달 state — 신 InventoryLookupModal 은 자체 페치(useQuery).
  // 스냅샷은 모달 열린 채 라인 편집 시 표 흔들림 방지용으로 유지.
  const [stockModalOpen, setStockModalOpen] = useState(false)
  const [stockSelectedSnapshot, setStockSelectedSnapshot] = useState<
    StockBalanceLookupLine[]
  >([])
```

- [ ] **Step 3: 재고조회 mutation 제거**

현 라인 379~395 의 `stockMutation`(useMutation + fetchStockBalanceBatch) 전체를 삭제한다. (`useMutation` import 는 저장 mutation(현 라인 430)에서 계속 사용하므로 유지.) `openStockModal`(현 라인 407~412)에서 mutation 호출을 제거:

```tsx
  const openStockModal = () => {
    if (selectedProductLines.length === 0) return
    setStockSelectedSnapshot(selectedProductLines)
    setStockModalOpen(true)
  }
```

`closeStockModal`(현 라인 414)와 `selectedProductLines` memo(현 라인 397~405)는 무변경 유지.

- [ ] **Step 4: warehouseColumns memo 제거**

현 라인 263~270 의 `warehouseColumns` useMemo<WarehouseColumn[]> 전체를 삭제한다. (신 모달은 창고 컬럼을 자체적으로 `fetchProductBalancesMatrix`→`listWarehouses` 머지로 구성하므로 불필요. `warehousesQuery` 자체는 WarehouseSelector(현 라인 528/536)에서 계속 사용하므로 유지.)

- [ ] **Step 5: 재고조회 버튼에 testid 추가**

현 라인 984~991 버튼에 `data-testid` 를 추가(상세 페이지 패턴과 일관 + 회귀 E2E selector):

```tsx
            <Button
              variant="secondary"
              size="sm"
              data-testid="slip-form-inventory-lookup-btn"
              onClick={openStockModal}
              disabled={selectedProductLines.length === 0}
            >
              {stockButtonLabel}
            </Button>
```

> `Button` 컴포넌트가 `data-testid` passthrough 를 지원하는지 확인: 동일 파일에서 다른 testid 버튼 패턴이 없다면 `@samhan/design-system` `Button` props 가 rest-spread 로 DOM 에 전달되는지 점검(미지원 시 wrapping `<span data-testid=...>` 로 대체). 상세 페이지(`partner-order-inventory-lookup-btn` 등)가 동일 `Button` 으로 testid 를 노출하므로 지원될 가능성이 높음.

- [ ] **Step 6: 모달 렌더 교체**

현 라인 1123~1131 의 `<StockBalanceModal .../>` 를 신 모달로 교체:

```tsx
      {/* 재고조회 모달 — 신 공용 InventoryLookupModal (가용/실/예약 자체 페치) */}
      <InventoryLookupModal
        open={stockModalOpen}
        onClose={closeStockModal}
        lines={stockSelectedSnapshot}
      />
```

- [ ] **Step 7: 타입체크 + 빌드 검증**

Run:
```bash
cd clients/desktop && npx tsc --noEmit
```
Expected: 오류 0. (만약 `StockBalanceLookupLine` 미사용 경고가 나오면 Step 2 의 스냅샷 타입이 이를 사용하므로 정상 — 사용처 존재.)

- [ ] **Step 8: 커밋**

```bash
git add clients/desktop/src/renderer/routes/SlipFormPage.tsx
git commit -m "$(cat <<'EOF'
refactor(desktop): SlipFormPage 재고모달 신 InventoryLookupModal 로 일원화

- 구 StockBalanceModal(총량+합계) → 신 InventoryLookupModal(가용/실/예약) 교체
- 자체 페치 모달이라 stockRows/stockError state + stockMutation + warehouseColumns memo 제거
- 스냅샷(stockSelectedSnapshot) 유지로 모달 열린 채 라인 편집 시 표 흔들림 방지
- 재고조회 버튼 data-testid 추가(회귀 E2E selector)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 구 StockBalanceModal + fetchStockBalanceBatch 데드코드 제거

**Files:**
- Delete: `clients/web/design-system/src/components/StockBalanceModal/` (4 files)
- Modify: `clients/web/design-system/src/index.ts`
- Modify: `clients/desktop/src/renderer/api/inventory.ts`
- Modify: `clients/desktop/src/renderer/api/mock.ts` (주석만)

전제: Task 1 머지로 구 모달/함수의 마지막 사용처가 사라졌다. 사용처 재확인 후 제거한다.

- [ ] **Step 1: 잔존 사용처 0 확인**

Run:
```bash
cd clients/desktop && git grep -n "StockBalanceModal\|fetchStockBalanceBatch\|StockBalanceRow\|StockBalanceBatch" -- ':!*.spec.ts' ':!docs/**' clients/
```
Expected: `inventory.ts`(정의), `mock.ts`(주석), `design-system/StockBalanceModal/`(자기 자신), `design-system/index.ts`(export) 만 출력. SlipFormPage 등 소비처 0건. (소비처가 남아 있으면 Task 1 미완 — 중단.)

- [ ] **Step 2: 디자인시스템 컴포넌트 디렉토리 삭제**

```bash
git rm -r clients/web/design-system/src/components/StockBalanceModal/
```

- [ ] **Step 3: 디자인시스템 배럴 export 제거**

`clients/web/design-system/src/index.ts` 현 라인 27 `export * from './components/StockBalanceModal'` 한 줄을 삭제한다.

- [ ] **Step 4: inventory.ts 데드 함수/타입 제거**

`clients/desktop/src/renderer/api/inventory.ts` 에서 다음을 제거:
- `interface StockBalanceBatchRow { ... }` (현 라인 264~272)
- `interface StockBalanceBatchResponse { ... }` (현 라인 274~277)
- `export async function fetchStockBalanceBatch(...) { ... }` (현 라인 325~360)
- 해당 섹션 헤더 주석 `// StockBalance batch (sales-form-polish 슬라이스 신규)` 블록(현 라인 251~253)

**유지(삭제 금지)**: `interface ProductBalanceResponse`(현 라인 285~296 — `fetchProductBalancesMatrix` 가 사용), `interface StockBalanceLookupLine`(공용), `fetchProductBalancesMatrix`, `BalanceMatrix`/`BalanceMatrixRow`/`BalanceWarehouseCol`, `listStockBalances`/`StockBalanceListRow`.

- [ ] **Step 5: mock.ts 주석 정리 (기능 무변경)**

`clients/desktop/src/renderer/api/mock.ts` 현 라인 1800 의 주석 `(모델명/품목명은 BE 미포함 — FE fetchStockBalanceBatch 가 선택 라인 메타로 결합.)` 을 다음으로 교체(존재하지 않는 함수 참조 제거):

```ts
     * (모델명/품목명은 BE 미포함 — FE fetchProductBalancesMatrix 가 선택 라인 메타로 결합.)
```

**중요**: `POST /inventory/balances/batch` mock route(현 라인 1786~1851) 자체는 신 모달(`fetchProductBalancesMatrix`)도 사용하므로 **삭제 금지**.

- [ ] **Step 6: 양 패키지 타입체크/빌드 검증**

Run:
```bash
cd clients/web/design-system && npx tsc --noEmit
cd ../../desktop && npx tsc --noEmit
```
Expected: 양쪽 모두 오류 0. (DS 배럴에서 삭제한 export 를 어디선가 import 하면 desktop tsc 가 잡아냄 — 0 이어야 함.)

- [ ] **Step 7: 커밋**

```bash
git add clients/web/design-system/src/index.ts clients/desktop/src/renderer/api/inventory.ts clients/desktop/src/renderer/api/mock.ts
git rm -r clients/web/design-system/src/components/StockBalanceModal/ 2>/dev/null; true
git commit -m "$(cat <<'EOF'
chore(cleanup): 구 StockBalanceModal + fetchStockBalanceBatch 데드코드 제거

- design-system StockBalanceModal 컴포넌트 + 배럴 export 삭제(소비처 0 확인)
- inventory.ts fetchStockBalanceBatch + StockBalanceBatchRow/Response 제거
- ProductBalanceResponse / balances batch mock route 는 신 모달 사용으로 유지
- mock.ts 죽은 함수 참조 주석 정리

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: SlipFormPage 재고모달 E2E 회귀 갱신

**Files:**
- Modify: `clients/desktop/playwright/d2-6d-inventory-lookup/inventory-lookup.spec.ts`

전제: 기존 시나리오 12(현 라인 371~390)는 "SlipFormPage StockBalanceModal 무변경" 회귀였다. 이제 SlipFormPage 가 신 `InventoryLookupModal` 을 쓰므로 의도를 갱신한다 — 빈 폼(/sales/new)에서는 모달이 닫혀 있고(DOM 미존재), 재고조회 버튼이 비활성으로 렌더됨을 단언(라인 미선택 = disabled).

- [ ] **Step 1: 시나리오 12 블록 교체**

현 라인 371~390 의 `test.describe('회귀 — SlipFormPage StockBalanceModal 무변경', ...)` 블록 전체를 다음으로 교체:

```ts
// ============================================================
// 시나리오 12: SlipFormPage 신 InventoryLookupModal 일원화 회귀 (3-D)
// ============================================================

test.describe('회귀 — SlipFormPage 재고모달 일원화(InventoryLookupModal)', () => {
  test('시나리오 12: 빈 폼 — 재고조회 버튼 비활성 + 모달 미오픈', async ({ page }) => {
    await installAuthMock(page)
    // SlipFormPage 신규 작성 경로
    await page.goto(`${BASE_URL}/#/sales/new?mockRole=MASTER`, {
      waitUntil: 'domcontentloaded',
    })
    await expect(page.locator('body')).toBeVisible({ timeout: 10_000 })

    // 일원화: SlipFormPage 도 신 InventoryLookupModal 사용 → 닫힘 상태면 DOM 미존재
    await expect(page.getByTestId('inventory-lookup-modal')).toHaveCount(0)

    // 라인 미선택 → 재고조회 버튼 비활성 (모달 인프라 배선 확인)
    const btn = page.getByTestId('slip-form-inventory-lookup-btn')
    await expect(btn).toBeVisible({ timeout: 10_000 })
    await expect(btn).toBeDisabled()
  })
})
```

- [ ] **Step 2: 스펙 실행 (mock 서버 필요)**

별도 터미널:
```bash
cd clients/desktop
set VITE_MOCK_MODE=1 && npx vite src/renderer --host 127.0.0.1 --port 5174
```
테스트:
```bash
cd clients/desktop
set PLAYWRIGHT_SKIP_WEB_SERVER=1 && set AUDIT_BASE_URL=http://127.0.0.1:5174 && npx playwright test playwright/d2-6d-inventory-lookup --reporter=line
```
Expected: 전 시나리오 PASS(시나리오 12 포함). (`slip-form-inventory-lookup-btn` 미발견 시 Task 1 Step 5 미반영 — 점검.)

- [ ] **Step 3: 커밋**

```bash
git add clients/desktop/playwright/d2-6d-inventory-lookup/inventory-lookup.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e): SlipFormPage 재고모달 일원화 회귀 시나리오 갱신

- 구 StockBalanceModal 무변경 회귀 → 신 InventoryLookupModal 일원화 회귀로 교체
- 빈 폼에서 모달 미오픈(DOM 0) + 재고조회 버튼 비활성 단언

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: mock.ts 병합 후 status 상태보존 (배지 갱신 E2E 토대)

**Files:**
- Modify: `clients/desktop/src/renderer/api/mock.ts`

배경: 배지 갱신 E2E 는 "병합 성공 → `invalidateQueries(['partner-orders'])` → 목록 재페치 시 status 가 CONVERTED 로 바뀜"을 검증한다. 현 mock 은 무상태라 재페치해도 DRAFT 그대로다. 모듈 레벨 `Set` 으로 변환된 주문번호를 기억하고, 목록 핸들러가 이를 CONVERTED 로 덮어쓰도록 확장한다. (테스트마다 새 page = 새 모듈 인스턴스 → 자동 초기화, 격리 보장.)

- [ ] **Step 1: 모듈 레벨 변환 추적 Set 추가**

`mock.ts` 상단(다른 모듈 상수 인근)에 추가:

```ts
/**
 * 3-D 배지 갱신 E2E 토대 — 병합/전환된 주문번호를 기억하여 이후 목록 조회 시
 * status 를 CONVERTED 로 덮어쓴다. (테스트별 새 page = 새 모듈 → 자동 초기화)
 */
const mockConvertedOrderNos = new Set<string>()
```

- [ ] **Step 2: 병합 성공 시 변환 주문번호 기록**

병합 핸들러(현 라인 3893~3924)의 성공 분기에서 응답 직전에 `convertedOrders` 의 orderNo 를 Set 에 추가. 현 `return envelope({...})` 블록(현 라인 3916~3923)을 다음으로 교체:

```ts
    const convertedOrders = orders.map((_, idx) => ({
      orderNo: MOCK_ORDER_NOS[idx] ?? `2026/05/31-${idx + 1}`,
      orderStatus: 'CONVERTED' as const,
      fullyConverted: true,
    }))
    // 3-D: 변환된 주문번호 기억 → 이후 목록 재페치 시 CONVERTED 로 노출
    for (const co of convertedOrders) mockConvertedOrderNos.add(co.orderNo)
    return envelope({
      slipNo: 'SL-20260531-MERGE-001',
      convertedOrders,
    })
```

- [ ] **Step 3: 목록 핸들러가 변환 status 반영**

목록 핸들러(현 라인 2331~2414)에서 `content` 확정 직후(현 라인 2403 이후, `return envelope` 직전)에 변환 status 덮어쓰기 + DRAFT 필터에서 제외 로직을 추가:

```ts
    // 3-D: 병합/전환된 주문은 CONVERTED 로 표시. DRAFT 필터에서는 제외(BE 동작 모사).
    content = content
      .map((row) =>
        mockConvertedOrderNos.has(row.orderNumber)
          ? { ...row, status: 'CONVERTED' as const, linkedSlipNo: 'SL-20260531-MERGE-001' }
          : row,
      )
      .filter((row) => !(statusParam === 'DRAFT' && row.status === 'CONVERTED'))
```

> 타입 주의: `content` union 타입에 `status: 'CONVERTED'` 가 포함되도록, 위 map 의 객체 spread 결과 타입이 좁혀지면 `content` 선언을 `Array<{ orderNumber: string; partnerCode: string; partnerName: string; submittedAt: string; status: string; totalAmount: number; linkedSlipNo: string | null }>` 형태의 명시 타입으로 완화한다(현 `typeof DRAFT_ROW | ...` union 은 status 리터럴이 고정되어 재할당 불가). 가장 단순한 해법: 각 ROW 상수의 `status` 를 `as const` 가 아닌 명시 필드로 두거나, `content` 를 위 명시 인터페이스 배열로 선언.

- [ ] **Step 4: 타입체크**

Run:
```bash
cd clients/desktop && npx tsc --noEmit
```
Expected: 오류 0.

- [ ] **Step 5: 커밋**

```bash
git add clients/desktop/src/renderer/api/mock.ts
git commit -m "$(cat <<'EOF'
test(mock): 병합 후 주문 status CONVERTED 상태보존 (배지 갱신 E2E 토대)

- mockConvertedOrderNos Set 으로 변환 주문번호 기억
- 목록 핸들러가 변환분 CONVERTED 로 노출 + DRAFT 필터 제외(BE 동작 모사)
- VITE_MOCK_MODE 한정 — 실 QA 무관

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 목록 배지 갱신 Playwright E2E 신규

**Files:**
- Create: `clients/desktop/playwright/partner-order-list-badge-refresh/partner-order-list-badge-refresh.spec.ts`

검증: 병합 발행 성공 후 `invalidateQueries(['partner-orders'])` 가 **수동 새로고침 없이** 목록을 갱신함. ① 기본 DRAFT 필터: 변환된 행이 목록에서 사라짐(refetch 증거). ② 전체 필터: 변환된 행이 CONVERTED 배지로 노출.

- [ ] **Step 1: 실패하는 스펙 작성**

```ts
/**
 * 3-D — 병합 전환 후 주문 목록 상태 배지 갱신 Playwright E2E.
 *
 * <h2>검증 대상</h2>
 * <ol>
 *   <li>같은 거래처 DRAFT 2건 병합 발행 성공</li>
 *   <li>수동 새로고침(page.reload) 없이 invalidateQueries(['partner-orders']) 로
 *       DRAFT 필터 목록에서 변환된 두 행이 사라짐</li>
 *   <li>전체 필터로 전환 시 두 행이 CONVERTED 배지(완료/전환 라벨)로 노출</li>
 * </ol>
 *
 * <h2>Mock 전략 — VITE_MOCK_MODE=1 (mock.ts 3-D 상태보존)</h2>
 * <ul>
 *   <li>POST /api/v1/partner-orders/convert-to-slip-merge → 성공 +
 *       변환 주문번호('2026/05/04-1','2026/05/31-3')를 mockConvertedOrderNos 에 기록</li>
 *   <li>GET /api/v1/partner-orders → 기록된 주문번호는 CONVERTED 로 노출(전체) /
 *       DRAFT 필터에서는 제외</li>
 * </ul>
 *
 * <h2>no-fake-data 원칙 ([[feedback_no_fake_data_ever]])</h2>
 * <p>본 spec 은 VITE_MOCK_MODE=1 환경에서 react-query invalidate 회귀 검증 전용(FE 단위).
 * 실서버 Docker QA 증빙은 PM 이 별도 수행하며 본 spec 을 실 QA 로 포장하지 않는다.
 *
 * <h2>실행 방법</h2>
 * <pre>
 *   cd clients/desktop
 *   set VITE_MOCK_MODE=1 && npx vite src/renderer --host 127.0.0.1 --port 5174
 *   set PLAYWRIGHT_SKIP_WEB_SERVER=1 && set AUDIT_BASE_URL=http://127.0.0.1:5174
 *     && npx playwright test playwright/partner-order-list-badge-refresh --reporter=line
 * </pre>
 */
import { expect, test, type Page, type Locator } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'

const listUrl = (extra = '') =>
  `${BASE_URL}/#/sales/partner-orders?mockRole=MASTER${extra}`

async function installAuthMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const auth = {
      token: 'playwright-token',
      userId: '00000000-0000-0000-0000-000000010001',
      role: 'MASTER',
      fullName: '오병승',
      partnerCode: 'P-MOCK-001',
    }
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => auth,
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  })
}

async function gotoListAndWait(page: Page, extra = ''): Promise<void> {
  await page.goto(listUrl(extra), { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('header-page-title')).toContainText('주문서 관리', { timeout: 15_000 })
}

/** d2-order-merge 패턴 동일 — WarehouseAutocomplete 선택 헬퍼. */
async function selectWarehouseAutocomplete(warehouseDiv: Locator, searchText: string): Promise<void> {
  const input = warehouseDiv.locator('input[role="combobox"]')
  await expect(input).toBeVisible({ timeout: 5_000 })
  await input.click()
  await input.fill(searchText)
  await expect(input).toHaveAttribute('aria-expanded', 'true', { timeout: 5_000 })
  const listbox = warehouseDiv.locator('[role="listbox"]')
  await expect(listbox).toBeVisible({ timeout: 5_000 })
  await listbox.locator('[role="option"]').first().click()
  await expect(input).toHaveAttribute('aria-expanded', 'false', { timeout: 5_000 })
}

/** 같은 거래처 DRAFT 2건 병합 발행을 완료한다(성공 토스트까지). */
async function performMerge(page: Page): Promise<void> {
  const checkboxes = page.locator('input[type="checkbox"][data-testid^="merge-checkbox-"]')
  await expect(checkboxes.first()).toBeVisible({ timeout: 10_000 })
  await checkboxes.nth(0).check()
  await checkboxes.nth(1).check()
  await expect(page.getByTestId('merge-convert-open')).toBeEnabled({ timeout: 5_000 })
  await page.getByTestId('merge-convert-open').click()
  await expect(page.getByTestId('merge-convert-dialog-body')).toBeVisible({ timeout: 10_000 })
  await selectWarehouseAutocomplete(page.getByTestId('merge-convert-warehouse'), 'HQ')
  const submitBtn = page.getByTestId('merge-convert-submit')
  await expect(submitBtn).toBeEnabled({ timeout: 10_000 })
  await submitBtn.click()
  // 성공 토스트 = 병합 완료 신호
  await expect(page.getByTestId('merge-convert-success-toast')).toBeVisible({ timeout: 10_000 })
}

test.describe('3-D 병합 후 주문 목록 배지 갱신 (invalidate 회귀)', () => {
  test('시나리오 1: 병합 성공 → 새로고침 없이 DRAFT 목록에서 변환 행 사라짐', async ({ page }) => {
    await installAuthMock(page)
    await gotoListAndWait(page) // 기본 DRAFT 필터 — 같은 거래처 DRAFT 2건

    // 변환 전: 두 DRAFT 행 존재
    await expect(page.getByTestId('partner-order-row-2026/05/04-1')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('partner-order-row-2026/05/31-3')).toBeVisible()

    await performMerge(page)

    // page.reload() 호출 없음 — invalidate 만으로 갱신되어야 함.
    // 변환된 두 행이 DRAFT 목록에서 사라짐.
    await expect(page.getByTestId('partner-order-row-2026/05/04-1')).toHaveCount(0, { timeout: 10_000 })
    await expect(page.getByTestId('partner-order-row-2026/05/31-3')).toHaveCount(0)
  })

  test('시나리오 2: 병합 후 전체 필터 → 변환 행이 CONVERTED 배지로 노출', async ({ page }) => {
    await installAuthMock(page)
    await gotoListAndWait(page)
    await performMerge(page)

    // 전체 필터로 전환
    await page.getByTestId('partner-order-list-status-filter').selectOption('')

    // 변환 행 재노출 + 배지 텍스트가 더 이상 '진행중'(DRAFT 라벨)이 아님
    const row = page.getByTestId('partner-order-row-2026/05/04-1')
    await expect(row).toBeVisible({ timeout: 10_000 })
    const badge = row.locator('span').filter({ hasText: /진행중|완료|전환|확인중|보류|취소/ }).last()
    await expect(badge).not.toContainText('진행중')
  })
})
```

> 배지 라벨 단언 주의: `PARTNER_ORDER_STATUS_LABEL[CONVERTED]` 의 실제 한국어 라벨을 `clients/desktop/src/renderer/api/partnerOrder.ts`(또는 라벨 정의 파일)에서 확인하여 시나리오 2 의 정단언으로 교체할 것(예: `await expect(badge).toContainText('전환')`). 부정 단언(`not.toContainText('진행중')`)은 폴백이며, 정확 라벨 확인 후 긍정 단언을 우선한다.

- [ ] **Step 2: 실패 확인 (mock 상태보존 전이라면)**

Task 4 미적용 상태로 실행하면 시나리오 1 이 FAIL(행이 안 사라짐)해야 정상. Task 4 적용 후 PASS.

Run (mock 서버 기동 상태에서):
```bash
cd clients/desktop
set PLAYWRIGHT_SKIP_WEB_SERVER=1 && set AUDIT_BASE_URL=http://127.0.0.1:5174 && npx playwright test playwright/partner-order-list-badge-refresh --reporter=line
```
Expected (Task 4 적용 후): 2 시나리오 PASS.

- [ ] **Step 3: CONVERTED 라벨 정단언 확정**

`partner-order.ts` 등에서 `PARTNER_ORDER_STATUS_LABEL` 의 CONVERTED 라벨을 확인하고 시나리오 2 의 배지 단언을 긍정형으로 교체. 재실행 PASS 확인.

- [ ] **Step 4: 커밋**

```bash
git add clients/desktop/playwright/partner-order-list-badge-refresh/
git commit -m "$(cat <<'EOF'
test(e2e): 병합 후 주문 목록 배지 갱신 invalidate 회귀 스펙 신규

- DRAFT 2건 병합 발행 → 새로고침 없이 DRAFT 목록에서 변환 행 제거 단언
- 전체 필터 전환 시 CONVERTED 배지 노출 단언
- VITE_MOCK_MODE 한정 FE 회귀(실 QA 무관, no-fake-data)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 문서 동기화 + DECISIONS + 풀빌드 검증

**Files:**
- Create: `docs/dev-reports/slice-3-d-slipform-stock-modal-unify.md`
- Modify: `docs/DECISIONS.md` (D-3D-01~03)
- Modify: `docs/handoff/CURRENT-WORK.md`
- Modify: `docs/samhan-public-overview.html`

문서 동기화 의무([[feedback_continuous_docs_sync]], [[feedback_samhan_public_overview_sync]], [[feedback_function_documentation]]).

- [ ] **Step 1: dev-report 작성**

`docs/dev-reports/slice-3-d-slipform-stock-modal-unify.md` 생성 — 섹션: ①배경(모달 분기) ②변경 요약(모달 일원화/데드코드 제거/배지 E2E) ③파일별 변경 ④테스트(Playwright 시나리오) ⑤QA(Docker 실서버 계획) ⑥후속.

- [ ] **Step 2: DECISIONS 정식화**

`docs/DECISIONS.md` 에 추가:
- **D-3D-01**: 작성 페이지 재고모달을 신 공용 `InventoryLookupModal`(가용/실/예약)로 일원화, 구 `StockBalanceModal` 제거.
- **D-3D-02**: 3-D 범위 = 모달 일원화 + 목록 배지 갱신 E2E(둘 다).
- **D-3D-03**: 합계(실재고 총합) 컬럼 생략 — 전환은 특정 창고 기준이며 합계는 각 창고 셀로 파악.

- [ ] **Step 3: handoff/overview 동기화**

`CURRENT-WORK.md` item 3-D 를 진행/완료로 갱신(다음 = 3-A2 Playwright hard gate → item 2 typeahead). `samhan-public-overview.html` nav-badge/progress 표 반영.

- [ ] **Step 4: 풀 타입체크/빌드 + 전체 Playwright 회귀**

Run:
```bash
cd clients/web/design-system && npx tsc --noEmit
cd ../../desktop && npx tsc --noEmit && npm run build
```
Expected: 오류 0, 빌드 성공.

mock 서버 기동 후:
```bash
cd clients/desktop
set PLAYWRIGHT_SKIP_WEB_SERVER=1 && set AUDIT_BASE_URL=http://127.0.0.1:5174 && npx playwright test playwright/d2-6d-inventory-lookup playwright/d2-order-merge playwright/partner-order-list-badge-refresh --reporter=line
```
Expected: 전 스펙 PASS(재고모달/병합/배지 갱신 회귀 무손상).

- [ ] **Step 5: 커밋**

```bash
git add docs/
git commit -m "$(cat <<'EOF'
docs(3-D): dev-report + DECISIONS D-3D-01~03 + handoff/overview 동기화

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Docker 실서버 실 QA (머지 전 의무 — 별도 단계)

> Playwright(mock)는 회귀 가드일 뿐 실 QA 가 아니다([[feedback_no_fake_data_ever]]). 머지 전 PM 이 수행.

- [ ] 선결: 로컬 3-DB(product/inventory/partner_order) TRUNCATE CASCADE + 전체 reseed([[project_seed_product_uuid_catalog]] 절차) — 구-시드 드리프트 해소.
- [ ] 게이트웨이(:8080) + 실 JWT + 실 inventory_db 연동. `SlipFormPage` 품목 선택 → 재고조회 → 가용/실/예약 매트릭스 실 렌더 + psql 대조 실 캡처.
- [ ] 0수량 토글 OFF/ON, VIRTUAL 제외, 로딩/에러/빈 상태 실 확인.
- [ ] 실 캡처를 `docs/qa/slice-3-d-slipform-stock-modal-unify/` 에 저장 + PR 본문 인라인 첨부([[feedback_pr_qa_screenshots]]). 실연동 불가 시 "캡처 불가 + 사유" 정직 보고.

---

## 자가 검토 (Self-Review)

- **Spec 커버리지**: §2 모달 일원화→Task1, §3.2 데드코드→Task2, §3.3 배지 E2E→Task4+5, §4 QA→Docker QA 단계, §3.1 스냅샷 보존→Task1 Step2/3. 시나리오 12 회귀→Task3. ✅ 누락 없음.
- **Placeholder 스캔**: TBD/TODO 없음. 모든 코드 단계 실제 코드 포함. mock 타입 완화·CONVERTED 라벨 확정은 명시적 확인 단계로 처리(placeholder 아님). ✅
- **타입 일관성**: `stockSelectedSnapshot: StockBalanceLookupLine[]`(Task1) ↔ `InventoryLookupModal` props `lines: StockBalanceLookupLine[]` 일치. `mockConvertedOrderNos`(Task4 Step1) ↔ 사용처(Step2/3) 일치. `slip-form-inventory-lookup-btn`(Task1 Step5) ↔ Task3 selector 일치. ✅
