# AC-2 품목 자동완성 — FE 코드 리뷰 (claude-fe-cycle1)

- **리뷰어**: claude-fe
- **작성일**: 2026-05-31
- **대상 브랜치**: feat/ac-2-product-autocomplete (PR #332)
- **결론**: **CHANGES_REQUESTED**

---

## Playwright 실행 결과 (실제 출력)

```
Running 6 tests using 1 worker

  6 failed
    시나리오 1: 전표 작성 진입 — 품목 combobox 렌더 확인
    시나리오 2: "AJ" 입력 → 후보 listbox 표시 (mock /api/products?q=AJ)
    시나리오 3: 후보 클릭 선택 → 입력란에 modelName 표시
    시나리오 4: 키보드 ArrowDown + Enter 선택 → modelName 반영
    시나리오 5: 품목 선택 → 단가 자동 채워짐
    시나리오 6: UUID 비공개 가드 — 전표작성 화면 UUID 미노출
```

**6개 전부 FAIL. PASS 0건.**

### 실패 원인 분석

모든 테스트가 `getByRole('combobox').first()` 로 첫 번째 combobox 를 찾는데, 실제 DOM 에는 SlipFormPage 상단에 `WarehouseSelector`(select 기반), `DeliveryTagSelector`(select 기반), io_type select 가 먼저 렌더되어 있다. Playwright ARIA snapshot 기준:
- `combobox "출발 창고 (필수)"` [ref=e123] — `<select>` (WarehouseSelector)
- `combobox "도착 창고"` [ref=e128]
- `combobox "배송태그"` [ref=e133]
- `combobox "입출고 분기 (io_type)"` [ref=e218]
- `combobox [ref=e288]` — **ProductAutocomplete input** (이름 없음, label="" 때문)

`first()` 는 ref=e123 (`<select>`) 을 반환한다. `<select>` 는 native combobox 역할이지만 `role` attribute 자체는 없으므로 `toHaveAttribute('role', 'combobox')` 이 `null` 을 받아 실패. 이후 `fill()` 도 `<select>` 에는 불가하므로 시나리오 2~6 모두 연쇄 실패.

**근본 원인: 스펙의 locator helper `getProductInput` 가 `page.getByRole('combobox').first()` 를 사용하는데, ProductAutocomplete 가 `label=""` 로 렌더되어 이름이 없고 DOM 순서상 WarehouseSelector select 뒤에 위치하기 때문에 disambiguate 가 불가능하다.**

두 가지 상호 연관된 결함:
1. **spec 결함**: locator 전략이 DOM 순서를 가정하며 label 에 의한 필터링 없음
2. **SlipFormPage 결함**: `modelCell` 의 ProductAutocomplete 에 `label=""` 을 전달하여 ARIA name 이 없는 combobox 가 됨 — 접근성 위반이자 locator 모호성 원인

---

## typecheck / lint / build 결과

- design-system `tsc -p tsconfig.build.json --noEmit`: **PASS** (에러 0)
- design-system `npm run build`: **PASS** (157.81 kB, 3.39s)
- design-system `npm run lint`: 0 errors (ProductAutocomplete.tsx 자체 0건. stories.tsx 에서 `useState` in `render` function 경고 — 기존 WarehouseAutocomplete.stories.tsx 와 동일 패턴, pre-existing)
- desktop `npm run typecheck`: **PASS** (에러 0)
- desktop `npm run lint`: **PASS** (0 errors, 기존 PurchaseSlipPrintPage warning 1건은 pre-existing)
- mobile-staff: ProductAutocomplete/productApi 의존 없음 — 영향 없음

---

## 점검 결과

### 1. 서버검색 / debounce / stale 응답 무시

**[P2] 전역 `_globalSeq` 다중 인스턴스 안전성 문제**

`ProductAutocomplete.tsx:89`:
```ts
let _globalSeq = 0
```
이 모듈 전역 변수는 모든 ProductAutocomplete 인스턴스가 공유한다. SlipFormPage 에서 라인이 여러 개일 때(예: 라인 3개) 각 인스턴스가 `++_globalSeq` 를 공유하므로, 인스턴스 A 의 요청이 인스턴스 B 의 seq 를 밀어올려 인스턴스 A 자신의 `latestSeq.current !== seq` 비교가 오동작할 수 있다. 즉, 라인 A 에서 검색 중에 라인 B 를 건드리면 라인 A 의 응답이 stale 로 잘못 버려질 수 있다. 인스턴스별 독립 seq 는 이미 `latestSeq.current` (useRef) 로 추적하므로 `_globalSeq` 자체는 인스턴스별 useRef 로 내부화해야 한다.

**[P2] debounce 내 `void performSearch` — AbortController 미사용**

검색이 진행 중일 때 새 입력이 들어오면 이전 debounce timer 는 취소되지만 이미 비행 중인 `searchProducts` promise 를 중단할 방법이 없다. 현재는 `latestSeq` 비교로 stale 응답은 무시하므로 UI 결과는 올바르나, 불필요한 네트워크 요청이 다수 발생한다. `searchProducts` 가 `signal?: AbortSignal` 를 지원하지 않는 현 API signature 에서는 구조적 한계이지만, `performSearch` 가 `useCallback` 의존성으로 `searchProducts` 를 포함하는데 `searchProducts` prop 이 인라인 함수(`searchProductsApi` 직접 참조)라 매 렌더마다 바뀌지 않아 실용적으로는 문제 없다. 주석/문서 명시 필요.

**[P1] 빈 입력 포커스 시 검색 없음**

`handleFocus` 에서 draft='' 으로 초기화하고 open=true 가 되지만, draft.trim().length < minChars(1) 이므로 검색이 트리거되지 않는다. 결과 후보가 표시되지 않아 드롭다운은 열리지 않는다. 사용자가 필드를 클릭했을 때 기존 선택이 있다면 hint 메시지도 안 나오고 아무것도 안 보임. 스펙 §3.1 "빈 입력 + 포커스 → 전체 창고 목록 표시" 는 WarehouseAutocomplete 의 동작인데, ProductAutocomplete 에서는 서버 검색이므로 빈 검색 허용 여부가 스펙(D-AC2-01)에 명확히 정의되지 않았다. 그러나 Playwright 시나리오 2 의 `input.fill('AJ')` 흐름과 다르게 사용자가 포커스 후 빈 상태에서 열릴 때 UX 가 어색하다. minChars=1 이 기본값이라 1글자 미만(빈)에는 hint 만 표시되어야 하나, `showMinCharsHint` 조건이 `draft.trim().length > 0` 이라 빈 입력에는 hint 도 없다. 포커스 즉시 미니멀 힌트 표시 필요.

### 2. 로딩/빈/에러 상태 및 blur 게이트

**상태 표시**: 로딩(spinnerDot), 빈결과("검색 결과 없음"), 에러("검색 중 오류가 발생했습니다.") 모두 구현됨. 구조적으로 올바름.

**blur 게이트**: `handleBlur` 에서 `blurTimer(120ms)` 후 처리. onMouseDown 에서 `e.preventDefault()` 로 blur 전 click이 먼저 처리되는 패턴 — AC-1 교훈 적용됨. 더미 onChange(productId='') 호출 없음. 기존 AC-1 blur 게이트 원칙 준수.

**[P2] blur 시 `draft` 클로저 캡처 문제**

`handleBlur` 내부에서 `draft` state 를 직접 읽는다. `blurTimer` 콜백이 120ms 후 실행될 때 `draft` 는 클로저에 캡처된 시점의 값이다. 만약 blur 이후 120ms 안에 다른 렌더가 발생해 draft 가 바뀌었다면 stale closure 를 읽는다. `useRef` 로 draft 최신값을 별도 추적하거나, `setDraft` 의 functional update 패턴으로 해결해야 한다. 실사용에서는 blur 후 draft 가 바뀌는 시나리오가 드물지만 race condition 이다.

**[P2] `pick()` 함수 closure — candidates 최신성**

`handleBlur` 에서 `candidates` 를 직접 읽어 exact match 를 찾는다. `candidates` 도 클로저 캡처이므로 blur timer 실행 시점의 candidates 가 최신이 아닐 수 있다. useRef 로 candidates 를 동기 추적해야 한다.

### 3. LineRow slot 회귀

**backward compatible**: `modelCell` prop 이 optional (`ReactNode | undefined`). `modelCell != null` 조건으로 분기. 미제공 시 기존 `<input>` + onModelNameChange/onModelNameBlur + lookupLoading 스피너 + lookupError 아리아 연결 그대로 유지됨. 타 소비자(EstimateLineRow 등) 는 lineRow 를 직접 import 하지 않음 — cross-check 불필요.

**[P2] `modelCell` 제공 시 `lookupError` 에러 배너 여전히 렌더**

LineRow.tsx:152 `const hasError = !!line.lookupError` 는 `modelCell` 슬롯 여부와 무관하게 평가된다. SlipFormPage 에서 AC-2 적용 후 `lookupError` 는 항상 null 로 리셋(`lookupError: null`)되어 실용적 문제는 없으나, `modelCell` 제공 시에도 row 에 `styles['error']` 가 붙을 수 있는 구조이다. 주석("modelCell 사용 시 호출자가 자체 처리")이 있으나 LineRow 자체가 `lookupError` 를 렌더하는 모순이 남아 있다.

**[P1] `modelCell` 라인의 품목명 셀(productName) 표시 로직**

LineRow 에서 품목명(셀 5)은 `line.productName` 을 표시한다. `modelCell=ProductAutocomplete` 로 선택 시 SlipFormPage onChange 에서 `productName: p?.productName ?? ''` 으로 updateLine 한다. 정상 동작하나, 선택 해제(onChange(null)) 시 `productName: ''` 으로 클리어됨 — OK. 흐름 정합.

### 4. SlipFormPage 배선

**onChange 정합성**:
```tsx
onChange={(p) =>
  updateLine(line.id, {
    productId: p?.id ?? null,
    modelName: p?.modelName ?? '',
    productName: p?.productName ?? '',
    unitPrice: p?.sellingPrice != null ? String(p.sellingPrice) : line.unitPrice,
    lookupError: null,
    lookupLoading: false,
  })
}
```
productId / modelName / productName / unitPrice 모두 정합. 선택 해제(null)시 productId=null, modelName=''으로 정리됨. 기존 검증(`canSubmit = validLineCount > 0`)은 `l.productId && Number(l.quantity) > 0` 기준이라 productId=null이면 집계에서 제외 — 의도한 대로 동작.

**[P0] label="" 접근성 결함 및 Playwright locator 실패 원인**

SlipFormPage 의 ProductAutocomplete 에 `label=""` 을 전달한다:
```tsx
<ProductAutocomplete
  value={lineProductValue}
  onChange={...}
  searchProducts={searchProductsApi}
  label=""
  placeholder="모델명 또는 품목명"
  debounceMs={250}
/>
```
`label=""` 은 FormField 에 빈 라벨을 렌더하고 combobox input 의 aria-labelledby 가 빈 텍스트를 가리켜 ARIA name 이 없는 combobox 가 된다. 이로 인해:
1. **ARIA 접근성 위반** — combobox 에 accessible name 없음 (`aria-label` 또는 유효한 label 필요)
2. **Playwright 시나리오 1 실패** — `getByRole('combobox').first()` 가 WarehouseSelector의 `<select>` 를 먼저 잡음

**`handleModelNameBlur` no-op 전환**:
```tsx
const handleModelNameBlur = (_id: string, _modelName: string): void => {
  // no-op
}
```
기존 onBlur lookup(`/slips/lookup-product`) 완전 무효화. AC-2 이후 ProductAutocomplete 가 이를 대체하므로 의도한 변경. 기존 검증/제출 로직(`canSubmit`) 은 이를 참조하지 않아 영향 없음.

**단가 fill**: `p.sellingPrice != null ? String(p.sellingPrice)` — `productApi.ts` 에서 `Number(p.sellingPrice)` 변환 후 ProductOption 에 담겨 전달. `sellingPrice?: number` 타입이므로 null/undefined 체크 후 String 변환 정합. LineRow 의 `priceDisplay` 는 `Number(line.unitPrice).toLocaleString()` — "1850000" → "1,850,000" 렌더 정상.

### 5. searchProducts API

**경로**: `GET /api/products?q={q}&size=20` — 스펙 D-AC2-02 기준 `GET /products?q=`(gateway StripPrefix `/api/products`) 정합.

**응답 매핑**: `ApiEnvelope<PageResponse<ProductSummaryResponse>>` → `page.content` 배열 → `ProductOption` 변환. `name` → `productName`, `modelName`, `sellingPrice: Number(string)`. 필드 매핑 정합.

**[P1] `categoryId: null` mock 데이터 — `ProductSummaryResponse` 타입 불일치**

`productApi.ts:25` 에서 `categoryId: UUID` 를 타입 정의에 포함하나 실제 사용하지 않는다. mock.ts:851 에서 `categoryId: null` 을 반환한다. 타입에 `categoryId` 를 포함시킨 것은 BE `ProductSummaryResponse` 를 반영한 것이나, FE 에서 사용하지 않는 필드라면 타입에서 제거해 불필요한 필드를 표면에 드러내지 않는 것이 명확하다(미사용 필드 노출).

**graceful 빈 배열**: try/catch 에서 `return []` — 네트워크 실패 시 graceful degradation 구현됨.

**UUID 비공개**: `productId`(id)는 `ProductOption.id` 로 내부 전달, 화면 렌더에는 modelName/productName 만 사용됨 — 규칙 준수.

**[P2] mock `MWR_WE10N` 키와 spec 불일치**

`MOCK_PRODUCTS_BY_MODEL` 의 키가 `MWR_WE10N`(언더스코어) 이나 modelName 은 `MWR-WE10N`(하이픈). 기존 `lookup-product` mock에서 `MOCK_PRODUCTS_BY_MODEL[modelName.toUpperCase()]` 로 조회 시 하이픈이 언더스코어로 치환되지 않아 조회 미스가 발생한다. AC-2 mock 의 `GET /api/products?q=` 핸들러는 `Object.values` 로 조회하므로 q 검색에서는 문제없지만, 키 자체의 불일치는 코드 품질상 결함이다.

### 6. Playwright spec 결함 (상세)

**[P0] `getProductInput` locator 전략 실패**

```ts
function getProductInput(page: Page) {
  return page.getByRole('combobox').first()
}
```

DOM 에서 첫 번째 combobox 는 WarehouseSelector `<select>`. ProductAutocomplete input 이 아님. 올바른 locator:
- `page.getByRole('combobox', { name: /모델명|품목/i }).first()` (label 이 있는 경우)
- 또는 `page.locator('[data-testid="line-product-input"]').first()`
- 또는 SlipFormPage에서 ProductAutocomplete에 `label="라인 1 품목"` 전달 + `page.getByRole('combobox', { name: '라인 1 품목 (입력)' })` 등

**[P1] `gotoSlipNewPage` — AuthGuard 통과 보장 불명확**

`installAuthMock` 에서 `window.samhanAuth` stub 을 주입하지만, 실제 앱의 AuthGuard 가 `window.samhanAuth.getToken()` 을 async 호출하는지 여부에 따라 페이지 로드 중 guard 가 이미 실행됐을 수 있다. `addInitScript` 는 페이지 평가 전에 실행되므로 이론적으로 안전하나, `gotoSlipNewPage` 에서 waitUntil='domcontentloaded' 후 `'+ 라인 추가' 버튼` 대기로 충분히 커버됨.

**[P1] `waitForTimeout(400)` 하드코딩 — 취약한 타이밍**

debounce 250ms + 비동기 대기를 `page.waitForTimeout(400)` 으로 처리한다. CI 환경 부하에 따라 불안정할 수 있다. `expect(listbox).toBeVisible({ timeout: 5_000 })` 으로 이미 커버하므로 waitForTimeout 을 제거하거나 더 긴 timeout 으로 대체하는 것이 권장된다.

---

## 전체 결함 목록

| # | 심각도 | 분류 | 내용 |
|---|---|---|---|
| F-01 | **P0** | Playwright spec | `getProductInput` 가 WarehouseSelector `<select>` 를 반환 → 6/6 FAIL |
| F-02 | **P0** | SlipFormPage 접근성 | `label=""` → accessible name 없는 combobox (ARIA 위반 + locator 실패 원인) |
| F-03 | P1 | ProductAutocomplete UX | 포커스 즉시(빈 입력) 드롭다운 안 열림 — hint 도 없음 |
| F-04 | P1 | productApi.ts | `categoryId` 미사용 필드 타입 노출 |
| F-05 | P1 | Playwright spec | `waitForTimeout(400)` 하드코딩 타이밍 취약성 |
| F-06 | P2 | ProductAutocomplete | `_globalSeq` 모듈 전역 — 다중 인스턴스 간 seq 오염 위험 |
| F-07 | P2 | ProductAutocomplete | blur handler `draft` / `candidates` 클로저 캡처 stale 위험 |
| F-08 | P2 | LineRow | `modelCell` 제공 시에도 `lookupError` 에러 배너 렌더 가능 구조 잔존 |
| F-09 | P2 | mock.ts | `MWR_WE10N` 키 vs `MWR-WE10N` modelName 불일치 |

---

## 결론

**CHANGES_REQUESTED** — P0 결함 2건으로 머지 불가.

- **F-01/F-02** (P0): Playwright 6/6 FAIL. `getProductInput` locator 수정 + `label=""` 대신 `label="라인 N 품목"` 또는 `aria-label` 부여 필요. 두 결함은 상호 연결(label 이 있으면 locator 도 해결됨).
- **F-06** (P2): `_globalSeq` 인스턴스 격리 — 다중 라인 실사용 시 stale 버그 재현 가능. useRef 로 내부화 권장.
- **F-07** (P2): blur 클로저 stale — draft/candidates useRef 동기 추적 권장.
- F-03/F-04/F-05/F-08/F-09 는 P1/P2 개선 권고.

typecheck/lint/build 는 이상 없으며 mobile-staff 영향 없음. 코드 구조(stale seq 논리, blur 게이트, UUID 비공개, backward compat lineRow slot) 는 설계적으로 올바름. P0 수정 + Playwright 재실행 PASS 후 재리뷰 요청.
