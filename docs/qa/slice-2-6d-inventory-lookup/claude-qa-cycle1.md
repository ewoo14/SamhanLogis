# QA 리뷰 사이클 1 — Phase 2.6d 품목 재고조회 모달

> 작성: QA agent (claude-qa-cycle1) | 날짜: 2026-05-31 | 대상 브랜치: feat/2-6d-inventory-lookup-modal

---

## 1. 검토 범위

| 파일 | 역할 |
|---|---|
| `playwright/d2-6d-inventory-lookup/inventory-lookup.spec.ts` | E2E 11건 시나리오 |
| `src/renderer/api/mock.ts` (Phase 2.6d 영역) | Mock fixture (balances/batch, warehouses, partner-orders, slips) |
| `src/renderer/api/inventory.ts` | `fetchProductBalancesMatrix` 신규 함수 |
| `src/renderer/routes/components/InventoryLookupModal.tsx` | 공유 모달 컴포넌트 |
| `src/renderer/routes/SalesPartnerOrderDetailPage.tsx` | 주문 트리거 |
| `src/renderer/routes/SlipDetailPage.tsx` | 출고·입고 트리거 |
| `services/.../PartnerOrderDetailResponse.java` | BE productId 노출 확인 |
| `docs/superpowers/specs/2026-05-31-inventory-lookup-modal-design.md` | §5 기준 |

---

## 2. 커버리지 vs §5 누락 케이스

### 2-A. VIRTUAL 창고 제외 단언 부재 [중간]

§5 명시: "VIRTUAL 제외(예약 대상 외)".

`fetchProductBalancesMatrix` 는 `cols` 필터에서 `w.type !== 'VIRTUAL'` 로 올바르게 제외하고,
batch 처리 루프에서도 `if (b.warehouseType === 'VIRTUAL') continue` 를 수행한다.
그러나 spec 어느 시나리오도 VR-001(가상창고) 컬럼이 모달에 노출되지 않는다는 것을
**직접 단언하지 않는다**.

`MOCK_WAREHOUSES` 는 VR-001(type='VIRTUAL')을 포함하고 있고, batch mock 도 VR-001 row 를
반환하므로 FE 로직이 VIRTUAL 필터를 빠뜨리더라도 현재 spec 은 false-green 이 된다.

**필요 단언:**
```typescript
await expect(modal).not.toContainText('VR-001')
await expect(modal).not.toContainText('가상창고')
```

---

### 2-B. 0토글 ON 시 BK-001 셀 실제 값(0/0/0) 단언 없음 [높음]

시나리오 4·8 모두 `await expect(modal).toContainText('BK-001')` 로 텍스트 노출 여부만 검증한다.
토글 ON 이후 BK-001 셀이 정말 `가용 0 / 실 0 / 예약 0` 으로 렌더되는지는 단언하지 않는다.

**false-green 위험**: `data-testid="inventory-lookup-cell-{modelName}-BK-001"` 셀이
0/0/0 대신 임의 숫자나 빈 문자열로 렌더되어도 현재 spec 은 통과한다.

**필요 단언 (예시, modelName=AJ040RXH4BC1):**
```typescript
const bkCell = modal.getByTestId('inventory-lookup-cell-AJ040RXH4BC1-BK-001')
await expect(bkCell).toContainText('가용 0')
await expect(bkCell).toContainText('실 0')
await expect(bkCell).toContainText('예약 0')
```

---

### 2-C. HQ-001/VH-001 셀 실제 숫자 단언 없음 [높음]

시나리오 3·8 은 `modal.toContainText('가용')` / `toContainText('실')` / `toContainText('예약')`
으로 문자열 레이블 존재만 확인한다.
셀 안의 숫자 값이 `fetchProductBalancesMatrix` 결과와 실제로 일치하는지 검증하지 않는다.

Mock 기준 p-aj040/HQ-001: totalQty=12, reservedQty=2 → availableQty=10.
해당 값이 셀에 렌더되는지 단언이 없어 렌더 로직에 버그가 있어도 false-green 가능.

**필요 단언 (예시):**
```typescript
const hqCell = modal.getByTestId('inventory-lookup-cell-AJ040RXH4BC1-HQ-001')
await expect(hqCell).toContainText('가용 10')
await expect(hqCell).toContainText('실 12')
await expect(hqCell).toContainText('예약 2')
```

---

### 2-D. 0토글 OFF 상태 CS-001(total=0) 미노출 단언 없음 [중간]

Mock 기준 p-aj040/CS-001: `total: 0, reserved: 0`. 0토글 OFF 시 이 창고는 숨겨져야 한다.
시나리오 4 는 BK-001 미노출만 확인하고, CS-001(잔량 있지만 total=0인 창고) 도 숨겨지는지
검증하지 않는다.

**필요 단언:**
```typescript
// 0토글 OFF 상태
await expect(modal).not.toContainText('CS-001')
```

단, `p-aj036`은 CS-001에 total=1이 있으므로 다중선택 시 이 경우와 구분이 필요하다.

---

### 2-E. 다중 품목 매트릭스 행 개수 단언 없음 [중간]

§5 요건: "다중 품목 매트릭스". 시나리오 6(전체선택)은 버튼 활성 + 선택 수 표시를 확인하지만,
모달을 열어 여러 행(품목 행)이 모두 렌더되는지 검증하지 않는다.

전체선택 후 모달 오픈 → SAMPLE_LINES 기준 1건(ord-draft는 라인 1건) 또는 여러 라인 행 단언이
없으면 매트릭스 행 렌더 누락을 잡지 못한다.

---

### 2-F. 에러 상태(API 500) 시나리오 부재 [중간]

§5 명시: "에러 상태". InventoryLookupModal 에는 `query.isError` 분기와 `role="alert"` 요소가
구현되어 있으나, spec 에 에러 경로 시나리오가 없다. fetch 실패 시 에러 배너 노출 여부를 검증하지
않는다.

**필요 시나리오**: mock.ts 에 batch 500 오류 경로를 트리거하거나 `page.route()` 로 intercept
후 에러 응답 주입 → `role="alert"` 요소 visible 단언.

---

### 2-G. 주문 입고 컨텍스트(INBOUND) 0토글 시나리오 없음 [낮음]

입고전표(시나리오 10·11)는 버튼/모달 오픈 + UUID 가드만 검증하고,
0토글 ON/OFF 동작은 검증하지 않는다. 출고 컨텍스트(시나리오 8)에서만 확인.
INBOUND 컨텍스트에서 같은 InventoryLookupModal 인스턴스를 공유하므로 회귀 위험은 낮으나
spec §5 의 "입고 상세 각각 ... 토글" 요건이 미달.

---

### 2-H. 선택 수 표시 단언 약함 [낮음]

시나리오 6: `await expect(btn).toContainText('(')` — 괄호 문자 존재만 확인하며 실제 숫자가
정확히 표시되는지(예: `(1)`)는 검증하지 않는다. 구현은 `checkedLineIds.size > 0 ? ` (${checkedLineIds.size})` : ''`
로 정확히 렌더하므로 단언을 `toContainText('(1)')` 등으로 강화해야 false-green을 방지한다.

---

## 3. 단언 강도 분석

| 번호 | 시나리오 | 단언 강도 | 문제 |
|---|---|---|---|
| 1 | 선택 0건 비활성 | 충분 | — |
| 2 | 라인 체크 → 버튼 활성 → 모달 오픈 | 충분 | — |
| 3 | 셀 3줄(가용/실/예약) | 약함 | 레이블 존재만, 값 미단언 (2-C) |
| 4 | 0토글 OFF/ON BK-001 | 약함 | BK-001 텍스트 존재만, 셀 값 0/0/0 미단언 (2-B); CS-001 OFF 미단언 (2-D) |
| 5 | UUID 비공개 가드 | 충분 | innerText 전체 UUID_PATTERN 검사 — 실용적 |
| 6 | 전체선택 + 선택 수 표시 | 약함 | `(` 존재만 확인 (2-H); 모달 행 미단언 (2-E) |
| 7 | 출고 라인 체크 → 모달 | 충분 | — |
| 8 | 출고 셀 3줄 + 0토글 | 약함 | 3번과 동일(값 미단언, 2-C) |
| 9 | — | (없음) | 출고 UUID 가드 없음 |
| 10 | 입고 라인 체크 → 모달 | 충분 | — |
| 11 | 입고 UUID 가드 | 충분 | — |
| 12 | 회귀 SlipFormPage | 충분 (단순 렌더 확인) | — |

**시나리오 9 번호 gap**: spec 는 11건이라고 문서화되어 있으나 describe 블록에 9번 시나리오가 없다.
시나리오 7·8 이후 바로 10번으로 이어지므로 출고전표 UUID 가드 시나리오가 누락된 것으로 보인다.

---

## 4. 구현 코드 결함

### 4-A. `fetchProductBalancesMatrix` — productId 미포함 라인 행 누락 버그 [높음]

```typescript
// inventory.ts L487–508
const rows: BalanceMatrixRow[] = balRes.data.data.map((p) => { ... })
```

`rows` 는 batch 응답(`balRes.data.data`)에 포함된 productId 만 행으로 생성한다.
`lines` 파라미터에 전달된 품목 중 **batch 응답에 없는 품목**(잔량 row 가 전혀 없는 신품)은
rows 에서 누락된다.

`fetchStockBalanceBatch`(기존)도 동일 패턴이지만, 2.6d 는 `listWarehouses` 머지로 전 창고
0/0/0 채움을 보장하면서 품목 행 누락을 허용한다는 내부 모순이 있다.

올바른 구현:
```typescript
const rows: BalanceMatrixRow[] = lines.map((line) => {
  const p = batchById.get(line.productId)
  const cells = ...
  return { productId: line.productId, modelName: line.modelName, productName: line.productName, cells }
})
```
spec 은 이 케이스를 커버하지 않는다 — mock fixture 에 `SAMPLE_LINES` 의 모든 productId 가
batch mock 에 존재하므로 false-green.

---

### 4-B. `p-pc1nw` productId 가 batch mock 에 없음 [중간]

`SAMPLE_LINES[2]` 의 productId 는 `'p-pc1nw'` 이지만, `mockPerProduct` 맵에 `'p-pc1nw'` 키가
없다. 현재 mock fallback:
```typescript
const per = mockPerProduct[pid] ?? { 'HQ-001': { total: 0, reserved: 0 }, ... }
```
로 0 행을 반환하므로 화면에는 표시되지 않는 문제가 없지만, "WIFI 판넬" 품목이 정상 선택된
상황에서는 모든 창고 0이라 0토글 OFF 시 열이 없어보여 혼란을 줄 수 있다.

spec 은 SAMPLE_LINES 의 `p-pc1nw` 라인이 선택된 시나리오를 다루지 않는다.

---

### 4-C. `SlipDetailPage` — productId 없는 라인 체크박스 선택 가능 [낮음]

```typescript
// SlipDetailPage L876
slip.lines.filter((l) => checkedLineIds.has(l.id) && l.productId)
```
`inventoryLookupLines` 생성 시 `l.productId` 없는 라인은 필터되지만, 체크박스 자체는 모든
라인에 노출되어 있다. productId 없는 라인을 체크 후 버튼을 클릭하면 빈 lines 배열로 모달이
열린다 — "재고 정보가 없습니다" 상태.

spec 에 이 케이스 시나리오 없음. 실제 mock SAMPLE_LINES 는 모두 productId 가 있으므로 미발생.

---

## 5. 회귀 검증 평가

### 5-A. SlipFormPage StockBalanceModal 회귀 (시나리오 12)

시나리오 12는 `/sales/new` 로 이동 후 `body` visible + `stock-balance-modal` count=0 만 확인한다.
기존 `StockBalanceModal`의 실제 열기/닫기/셀 표시 동작을 검증하지 않으므로, 해당 컴포넌트
내부에 회귀가 발생해도 탐지 불가능하다.

단 설계 §5 원칙 "기존 SlipFormPage StockBalanceModal 회귀 0" 과 "별도 컴포넌트, 기존 무변경"
이 구현에서도 충족되므로 최소한 import 충돌/렌더 크래시 회귀는 잡을 수 있다.

### 5-B. SlipDetailPage 편집 기능 회귀

spec 에 SlipDetailPage 의 기존 transition/line-edit 기능 회귀 시나리오 없음.
2.6d 변경은 체크박스 컬럼 추가 + 툴바 버튼 + 모달 마운트로 기존 UI에 영향이 최소화되어
있고, 실제 코드도 기존 `selectedLineId` state 와 독립적으로 `checkedLineIds` 를 관리한다.
그러나 테이블 컬럼 추가로 레이아웃이 변경되었기 때문에 `col-no` 컬럼 인덱스 의존 선택자가
있다면 오탐 가능 — spec 은 role/label 기반 선택자를 사용하므로 안전하다.

---

## 6. Docker 실 QA 계획 점검

spec 의 실행 방법 주석:
```
VITE_MOCK_MODE=1 && npx vite src/renderer --host 127.0.0.1 --port 5174
PLAYWRIGHT_SKIP_WEB_SERVER=1 && AUDIT_BASE_URL=http://127.0.0.1:5174
```
Mock 모드 전용 spec 이며 §5 Docker 실 QA 계획이 spec 파일에만 주석("QA 증빙 스크린샷은 실서버
Docker 환경에서 PM 이 별도 수행")으로 기술되어 있다.

**점검 결과:**
- Docker 실 inventory_db 잔량 매트릭스 + 0토글 on/off 캡처 절차가 spec/docs 어디에도 구체적인
  SQL fixture 또는 단계별 절차로 문서화되지 않았다. `docs/qa/slice-2-6d-inventory-lookup/`
  하위에 Docker 실 QA 체크리스트가 없다.
- `feedback_no_fake_data_ever` 원칙상 Playwright spec 은 VITE_MOCK_MODE=1 한정 회귀
  전용임을 명시했으므로 수용 가능하나, Docker 실 캡처 절차 문서가 누락된 상태에서 QA 승인
  불가 — PM/QA 단계에서 실 캡처 증빙 필요.

---

## 7. 기타 세부 발견

| # | 파일 | 내용 | 심각도 |
|---|---|---|---|
| M1 | `InventoryLookupModal.tsx` L88 | toggle 은 `<input type="checkbox">` — design-system 의 Checkbox 컴포넌트 미사용(§4.3 "design-system 컴포넌트 우선 재사용") | 낮음 |
| M2 | `SalesPartnerOrderDetailPage.tsx` | `aria-label="전체 선택"` 체크박스가 존재하는지 확인 필요 — 시나리오 6이 `getByRole('checkbox', { name: '전체 선택' })` 로 탐색하나, 실제 컴포넌트의 aria-label 이 "전체 선택" 인지 코드 재확인 필요. 시나리오 6이 통과 실패 가능성 있음. | 중간 |
| M3 | `inventory.ts` `fetchProductBalancesMatrix` | `BalanceWarehouseCol.warehouseId` 를 매트릭스 반환값에 포함하지만 모달 렌더 코드에서는 사용하지 않음 — UUID 비공개 가드 위반 아님(화면 미노출)이지만 불필요한 UUID 노출 내부 구조. | 정보성 |
| M4 | `SlipDetailPage.tsx` | `inventoryLookupLines` 의 `modelName: l.modelName ?? ''` — SlipLine 타입에 modelName 이 nullable 이면 빈 문자열이 배치 키로 전송됨. `data-testid` 에 modelName 이 사용되므로 셀 testid 가 `inventory-lookup-cell--HQ-001`(빈문자열 포함)이 될 수 있음. | 낮음 |
| M5 | `mock.ts` batch mock | `p-aj040/CS-001` total=0 row 를 반환(filter 없이 모두 포함). 반면 `p-aj036/VH-001` total=0 도 포함. 0토글 OFF 단언이 없어서 이 케이스가 올바르게 숨겨지는지 미검증. | 중간 (2-D 와 동일 근거) |

---

## 8. 종합 평가

**판정: CHANGES_REQUESTED**

### 블로커 (Blocker)

1. **셀 실제 값 단언 없음 (2-B, 2-C)**: 0/0/0 BK-001 및 HQ-001 셀 숫자 값이 검증되지 않아
   false-green 위험이 높다. 핵심 기능 검증 미달.

2. **`fetchProductBalancesMatrix` productId 없는 품목 행 누락 버그 (4-A)**: `lines` 기준으로
   rows 를 생성하지 않고 batch 응답 기준으로 생성하므로, 잔량이 없는 신품 품목이 선택되면
   매트릭스 행이 사라진다. spec 이 이를 검증하지 않아 false-green.

### 요구 수정 (Required)

3. VIRTUAL 창고 제외 직접 단언 추가 (2-A).
4. 0토글 OFF 시 total=0 창고(CS-001 p-aj040 등) 미노출 단언 추가 (2-D).
5. 시나리오 9(출고전표 UUID 가드) 누락 추가.
6. 에러 상태 시나리오 추가(최소 1건, `page.route()` mock 또는 별도 mock trigger) (2-F).

### 권장 (Recommended)

7. 전체선택 후 모달 오픈 시 품목 행 개수 단언 (2-E).
8. 선택 수 표시를 `(1)` 등 실제 값으로 단언 강화 (2-H).
9. INBOUND 컨텍스트 0토글 시나리오 추가 (2-G).
10. Docker 실 QA 체크리스트 문서 작성 (§6).

---

*파일 위치: `docs/qa/slice-2-6d-inventory-lookup/claude-qa-cycle1.md`*
