# AC-2 품목 자동완성 — FE 리뷰 사이클 2

- **브랜치**: feat/ac-2-product-autocomplete
- **대상 커밋**: 71422f48
- **리뷰어**: Claude FE
- **날짜**: 2026-05-31

---

## 결론

**APPROVE** — P0 2건 완전 해소, P1 3건 완전 해소. 신규 결함 2건(P2 등급) 발견. 잔여 블로커 없음.

---

## Playwright 실제 실행 출력 (7/7 PASS)

```
Running 7 tests using 1 worker

  ✓  1 [chromium] › playwright\ac-2-product-autocomplete\ac-2-product-autocomplete.spec.ts:98:3
       AC-2 품목 자동완성 ProductAutocomplete › 시나리오 1: 전표 작성 진입 — 품목 combobox 렌더 확인 (620ms)
  ✓  2 [chromium] › playwright\ac-2-product-autocomplete\ac-2-product-autocomplete.spec.ts:111:3
       AC-2 품목 자동완성 ProductAutocomplete › 시나리오 2: "AJ" 입력 → 후보 listbox 표시 (mock /api/products?q=AJ) (976ms)
  ✓  3 [chromium] › playwright\ac-2-product-autocomplete\ac-2-product-autocomplete.spec.ts:133:3
       AC-2 품목 자동완성 ProductAutocomplete › 시나리오 3: 후보 클릭 선택 → 입력란에 modelName 표시 (980ms)
  ✓  4 [chromium] › playwright\ac-2-product-autocomplete\ac-2-product-autocomplete.spec.ts:159:3
       AC-2 품목 자동완성 ProductAutocomplete › 시나리오 4: 키보드 ArrowDown + Enter 선택 → modelName 반영 (1.1s)
  ✓  5 [chromium] › playwright\ac-2-product-autocomplete\ac-2-product-autocomplete.spec.ts:186:3
       AC-2 품목 자동완성 ProductAutocomplete › 시나리오 5: 품목 선택 → 단가 자동 채워짐 (1.0s)
  ✓  6 [chromium] › playwright\ac-2-product-autocomplete\ac-2-product-autocomplete.spec.ts:211:3
       AC-2 품목 자동완성 ProductAutocomplete › 시나리오 6: UUID 비공개 가드 — 전표작성 화면 UUID 미노출 (1.1s)
  ✓  7 [chromium] › playwright\ac-2-product-autocomplete\ac-2-product-autocomplete.spec.ts:235:3
       AC-2 품목 자동완성 ProductAutocomplete › 시나리오 7: 멀티라인 — 라인1·라인2 각각 독립 품목 선택 (per-instance seq) (1.5s)

  7 passed (10.5s)
```

실행 환경: Windows 11, Playwright (chromium), VITE_MOCK_MODE=1, http://127.0.0.1:5173.

---

## 사이클1 P0 해소 확인

### F-01/F-02 [P0] — aria-label/Playwright locator 해소: RESOLVED

**근거**:

1. `isCompact = !label || label === ''` 분기: `label=""` 전달 시 FormField를 완전히 건너뛰고 wrapper div + input만 렌더. 빈 `<label htmlFor=id>` 요소가 DOM에 남지 않으므로 ARIA 2.1 §6.2.7 덮어쓰기 문제 원천 차단.

2. `aria-label={isCompact ? ariaLabel : undefined}` — compact 모드에서 ariaLabel prop을 input에 직접 적용.

3. SlipFormPage: `label=""` + `ariaLabel={\`라인 ${idx + 1} 품목\`}` 조합으로 `라인 1 품목`, `라인 2 품목` 등 accessible name 부여.

4. Playwright spec: `getByRole('combobox', { name: /라인 1 품목/ })` 로 WarehouseSelector `<select>` 와 명확히 구분. 시나리오 1 620ms PASS 실증.

5. 멀티라인 시나리오 7에서 `getByRole('combobox', { name: /라인 2 품목/ })` 도 성공 (1.5s PASS).

**판정**: P0 완전 해소.

---

## 사이클1 P1 해소 확인

### F-06 [P1] — `_globalSeq` → 인스턴스별 `useRef` seq 해소: RESOLVED

**근거**:

- `instanceSeq = useRef<number>(0)` + `latestSeq = useRef<number>(0)` — 두 ref 모두 컴포넌트 인스턴스 당 독립 생성.
- `performSearch` 내 `++instanceSeq.current` → 라인A 와 라인B 의 seq 가 완전 격리.
- 시나리오 7: 라인1 AJ040 선택 → 라인2 AJ052 선택 → 라인1 값 유지 확인 (1.5s PASS).

**판정**: P1 완전 해소.

### D-1 [P1] — 로딩 시 dropdown 박스 + "검색 중…" 렌더 해소: RESOLVED

**근거**:

- `showLoadingRow = open && status === 'loading' && candidates.length === 0` — candidates 0개일 때도 `<ul role="listbox">` + `<li>검색 중…</li>` 렌더.
- `showDropdown` 조건: `status === 'loading' || candidates.length > 0 || status === 'done' || status === 'error'` — 로딩 시작 즉시 dropdown 영역 활성화.
- spinnerDot이 listbox 내부 li에도 렌더되어 시각 피드백 이중 제공 (field 우측 스피너 + listbox 내 스피너).

**판정**: P1 완전 해소.

### D-3 [P1] — dropdown shadow `var(--elev-popover)` 토큰 해소: RESOLVED

**근거**:

- `ProductAutocomplete.module.css` L113: `box-shadow: var(--elev-popover);` — 하드코딩 제거 확인.

**판정**: P1 완전 해소.

---

## 사이클1 기타 항목 처리 확인

### F-05 [P1] — 결정적 대기 해소: RESOLVED

시나리오 2/3/4/5/6/7 전부 `expect(listbox).toBeVisible({ timeout: 5_000 })` 결정적 대기 적용. `waitForTimeout` 하드코딩 제거 확인.

### D-2 [P2] — optionModel/optionName 색상 구분: RESOLVED

`optionModel`: `color: var(--color-text)` + `font-weight: var(--font-weight-semibold)`.
`optionName`: `color: var(--color-text-muted)`.

### F-04 [P2] — `categoryId` 제거: RESOLVED

`ProductSummaryResponse` 인터페이스에 `categoryId` 미포함. mock의 `categoryId: null` 반환과 불일치하나 FE 타입에서 미사용 필드이므로 문제 없음.

### F-09 [P2] — mock 키 `MWR-WE10N` 수정: RESOLVED

`MOCK_PRODUCTS_BY_MODEL` 키: `'MWR-WE10N'` (하이픈 포함). `modelName: 'MWR-WE10N'` 과 일치.

---

## 신규 발견 결함

### N-1 [P2] — 로딩 전환 구간에서 두 `<ul id={listId}>` 동시 렌더 가능성

**위치**: `ProductAutocomplete.tsx` L368-414

**현상**: 검색 응답이 반환되는 순간(status=loading → done 전환 프레임), `showLoadingRow`(`status===loading && candidates.length===0`)와 `showDropdown && candidates.length > 0`(`status===loading` 조건 포함) 조건이 동시에 참이 될 수 있는 경로가 있다.

구체적으로:
- `showDropdown` 조건에 `status === 'loading'` 이 포함되어 있으므로, `status=loading` + `candidates.length > 0` 구간(이전 검색 결과가 남아 있고 새 검색이 시작된 상태)에서 후보 드롭다운이 표시된다.
- 이 구간에서는 `showLoadingRow`가 false(`candidates.length === 0` 아님)이므로 두 ul이 동시에 렌더되지는 않는다.

그러나 두 `<ul>` 에 동일한 `id={listId}` 가 부여된다. React가 조건부 렌더로 한 번에 하나만 DOM에 있게 하므로 **실제 중복 id DOM 오염은 없다**. 그러나 코드 독해 시 "두 `<ul id={listId}>`가 공존하는 것 아닌가?" 혼동을 유발한다.

**위험도**: P2 (런타임 버그 없음, 코드 명확성 문제).
**권고**: `showLoadingRow` ul과 candidates ul을 하나의 `<ul id={listId}>` 로 통합하고 내부 조건 분기로 처리하면 id 중복 위험을 구조적으로 차단할 수 있다.

---

### N-2 [P2] — 시나리오 6 UUID 가드: `body.textContent()` 검사의 auth stub UUID 은닉 의존

**위치**: `ac-2-product-autocomplete.spec.ts` L228-229

**현상**: `installAuthMock`의 `auth.userId = '00000000-0000-0000-0000-000000010001'` 은 UUID 패턴에 정확히 매칭된다. `page.locator('body').textContent()` 는 DOM text node만 수집하고 JS 객체 값은 포함하지 않으므로 현재는 PASS한다.

그러나 만약 미래에 앱이 `userId`를 DOM에 렌더(예: 디버그 패널, aria-label 등)하는 코드가 추가된다면 시나리오 6 자체가 auth stub UUID 를 잡아내 오탐(false positive fail)이 발생한다.

**위험도**: P2 (현재 오작동 없음, 미래 유지보수 취약).
**권고**: auth stub `userId`를 UUID 형식이 아닌 값(`playwright-user-001` 등)으로 변경하거나, UUID 가드 검사 전 auth stub UUID를 expect 예외 목록으로 명시하면 내성이 강해진다.

---

## 요약표

| 항목 | 등급 | 상태 |
|---|---|---|
| F-01/F-02 aria-label/Playwright locator | P0 | RESOLVED |
| F-06 멀티라인 per-instance seq | P1 | RESOLVED |
| D-1 로딩 dropdown + "검색 중…" | P1 | RESOLVED |
| D-3 shadow var(--elev-popover) 토큰 | P1 | RESOLVED |
| F-05 결정적 대기 | P1 | RESOLVED |
| D-2 optionModel/optionName 색상 | P2 | RESOLVED |
| F-04 categoryId 제거 | P2 | RESOLVED |
| F-09 mock 키 MWR-WE10N | P2 | RESOLVED |
| N-1 두 ul 동일 id 구조 명확성 | P2 | 신규 |
| N-2 auth stub UUID body 검사 의존 | P2 | 신규 |

**Playwright**: 7/7 PASS (10.5s, chromium, VITE_MOCK_MODE=1)

**결론**: APPROVE. 잔여 finding 2건(P2 등급, 블로커 아님).
