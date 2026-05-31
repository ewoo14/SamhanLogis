# FE 리뷰 — 2.6d 품목 재고조회 모달 (사이클 2)

검토 커밋: c07c8d47  
검토일: 2026-05-31  
리뷰어: Claude FE

---

## 사이클 1 결함 해소 검증

### QA B-2 — `fetchProductBalancesMatrix` lines 기준 순회

해소 O.

`inventory.ts` lines 491–515: `lines.map((line) => {...})` 로 교체되었으며 `batchById.get(line.productId)`가 `undefined`를 반환하는 품목(BK-001 등 batch 미포함)도 전 창고 0/0/0 행을 생성한다. 이전의 `res.data.data.map()` 패턴(BE 응답 기준 순회)이 완전히 제거되었다.

### FE P1-1 — SlipDetailPage·SalesPartnerOrderDetailPage `useEffect [id]` 체크 리셋

해소 O.

- `SlipDetailPage` line 311: `useEffect(() => { setCheckedLineIds(new Set()) }, [id])` 정확히 구현.
- `SalesPartnerOrderDetailPage` line 390: 동일 패턴 구현.

두 파일 모두 id 변경 시 체크 상태가 초기화된다.

### FE P1-2 — InventoryLookupModal `useEffect [open]` showZero OFF 복원

해소 O.

`InventoryLookupModal` lines 61–63:

```tsx
useEffect(() => {
  if (open) setShowZero(false)
}, [open])
```

`open`이 `false → true`로 전환될 때마다 `showZero`가 `false`로 초기화된다. 모달 재오픈 시 토글 OFF 복원 보장.

### FE P1-3 — 주문 상세 IIFE → useMemo

해소 O.

`SalesPartnerOrderDetailPage` lines 394–406에서 컴포넌트 최상위 `useMemo` 선언으로 교체되었다:

```tsx
const inventoryLookupLines = useMemo<StockBalanceLookupLine[]>(
  () => (query.data?.lines ?? [])
    .filter((l) => checkedLineIds.has(l.lineId) && !!l.productId)
    .map((l) => ({
      productId: l.productId,
      modelName: l.modelCode,
      productName: l.productName,
    })),
  [query.data?.lines, checkedLineIds],
)
```

IIFE가 완전히 제거되었고 deps 배열이 올바르다.

### FE P1-4 — Playwright testid 허점 교체

해소 O.

- `SlipDetailPage` line 1527: `data-testid="slip-line-inventory-lookup-btn"` 신설.
- Playwright 시나리오 7~11이 `getByTestId('slip-line-inventory-lookup-btn')` 으로 일관되게 사용.
- 체크박스 `aria-label`이 `/재고조회 선택/` 패턴으로 SlipDetailPage(line 1640) 와 SalesPartnerOrderDetailPage(line 692) 에서 일치.

### FE P1-5 — aria 일관

해소 O.

- 전체선택 체크박스: `aria-label="전체 선택"` — SlipDetailPage line 1602, SalesPartnerOrderDetailPage line 652. Playwright `getByRole('checkbox', { name: '전체 선택' })` 로 접근 가능.
- 재고조회 체크박스: `aria-label="{modelName} 재고조회 선택"` — 두 컴포넌트 모두 동일 패턴.
- 셀 `aria-label`: `{modelName} {warehouseName} — 가용 N 실 N 예약 N` — 스크린리더 친화적.

### QA Playwright 추가 시나리오 — 셀 실값 단언 / VIRTUAL 제외 / 0토글 OFF total=0 숨김 / 출고 UUID 가드 / batch 500 에러

해소 O.

| 항목 | 시나리오 | 구현 여부 |
|---|---|---|
| 셀 실수치 단언 | 시나리오 3: HQ-001 가용=10/실=12/예약=2 단언 | O (mock p-aj040/HQ-001: total=12, reserved=2, available=10 일치) |
| VIRTUAL 제외 | 시나리오 3: `VR-001`·`가상창고` 미노출 단언 | O (fetchProductBalancesMatrix VIRTUAL 필터 + visibleCols 이중 가드) |
| 0토글 OFF total=0 숨김 | 시나리오 4: CS-001 OFF 숨김·BK-001 ON 노출 | O (p-aj040/CS-001 total=0 → visibleCols 제외 확인) |
| BK-001 0/0/0 단언 | 시나리오 4: BK-001 셀 0/0/0 | O (batch 미포함 → lines 기준 0/0/0 채움) |
| 출고 UUID 가드 | 시나리오 9: 출고전표 모달 내 UUID 미노출 | O (`UUID_PATTERN` 정규식 단언) |
| batch 500 에러 배너 | 시나리오 13: `ord-error-test` → `role=alert` 노출 | O (mock `__error_test__` 500 반환 + `inventory-lookup-error` testid 단언) |

### 회귀 — SlipFormPage StockBalanceModal 무변경

확인 O.

`git diff origin/main...HEAD` 기준 `SlipFormPage.tsx`가 변경 파일 목록에 포함되지 않는다. Playwright 시나리오 12에서 `inventory-lookup-modal` testid가 0개임을 단언한다.

---

## 신규 발견 결함

### N-1 (Minor) — `inventoryLookupLines` 타입 선언 생략 가능성 (SlipDetailPage)

`SlipDetailPage` line 880:

```tsx
const inventoryLookupLines: StockBalanceLookupLine[] = slip.lines
  .filter((l) => checkedLineIds.has(l.id) && l.productId)
  .map(...)
```

`l.productId: string` 은 항상 truthy(빈문자열 제외)이므로 `filter` 이후에도 TypeScript 는 타입 narrowing 없이 `string` 으로 인식한다. `.map(l => ({ productId: l.productId }))` 에서 `l.productId` 가 `string`임은 타입 시스템상 이미 보장되므로 기능 결함은 아니다.

단, 빈문자열 productId가 실수로 할당된 경우 배치 조회에 빈 키가 포함될 수 있다. `SalesPartnerOrderDetailPage` 의 useMemo 에는 `!!l.productId` (빈문자열 방어 포함)가 있는데, SlipDetailPage 는 `l.productId` 만으로 truthy check를 수행한다. 동일하게 `!!l.productId` 로 통일하는 것이 방어적으로 더 정확하다. **기능 결함은 아니므로 APPROVE를 블로킹하지 않는다.**

### N-2 (Minor) — `inventoryLookupLines` 가 render body에서 계산 (SlipDetailPage)

`SlipDetailPage` line 880은 early return 이후 render body 내에서 계산하므로 React 규칙상 문제없다. 그러나 `SalesPartnerOrderDetailPage`가 `useMemo`를 사용한 것과 달리 SlipDetailPage 는 단순 const 계산이다. `slip.lines`와 `checkedLineIds`가 이 컴포넌트에서 자주 변경될 경우 매 렌더마다 재계산된다. 현재 `lines` 개수가 최대 수십 건 수준이므로 성능 영향은 미미하다. **블로킹 없음.**

### N-3 (Spec 정합 미확인 — 주의) — 시나리오 4 CS-001 숨김 단언과 mock 데이터 일치

mock `p-aj040/CS-001: { total: 0, reserved: 0 }` 이고 batch 응답에 CS-001 row가 포함된다(filter 조건: `w.type === 'VIRTUAL' || per[w.code] !== undefined`에서 `per['CS-001'] = {total:0,reserved:0}` 이므로 포함). FE fetchProductBalancesMatrix에서 cells['CS-001'] = `{ available: 0, reserved: 0, total: 0 }` 으로 채워져 `visibleCols` 필터(OFF 시 `total > 0` 기준)에서 정상 제외된다. 시나리오 4 `CS-001` 미노출 단언은 통과할 것으로 분석된다.

단, 실서버에서는 `CS-001` 창고에 재고가 있는 경우 OFF 상태에서 표시될 수 있으며 이는 정상 동작이다.

---

## 종합 판정

| 항목 | 사이클 1 결함 | 해소 여부 |
|---|---|---|
| QA B-2 | lines 기준 순회 | O |
| FE P1-1 | useEffect [id] 체크 리셋 | O |
| FE P1-2 | useEffect [open] showZero OFF | O |
| FE P1-3 | IIFE → useMemo | O |
| FE P1-4/P1-5 | testid 허점 / aria 일관 | O |
| Playwright 추가 시나리오 13종 | 셀 실값/VIRTUAL/0토글/UUID/500에러 | O |
| SlipFormPage 회귀 | 무변경 | O |
| typecheck | 오류 없음 | O |

신규 결함: N-1(Minor/비블로킹), N-2(Minor/비블로킹), N-3(주의/비블로킹) — 모두 기능 결함 아님.

**판정: APPROVE**

사이클 1에서 지적한 모든 결함(B-2, P1-1 ~ P1-5, QA Playwright 추가)이 해소되었다. 신규 발견 항목은 모두 Minor 수준이며 블로킹 사유 없다.
