# item 2 설계 — 공용 `AsyncAutocomplete<T>` 추출

- **작성일**: 2026-06-02
- **슬라이스**: item 2 (CURRENT-WORK.md 후속 큐)
- **상태**: 설계 승인 (개발책임자, 2026-06-02 "반영 후 구현")
- **유형**: FE 내부 리팩터 (design-system, 공개 API 불변, BE 무관)
- **관련 메모리**: [[feedback_open_pr_early]], [[feedback_codex_implements_claude_reviews]], [[feedback_ci_test_filter_false_green]]

---

## 1. 배경 — 95% 중복

`ProductAutocomplete`(450줄)와 `PartnerAutocomplete`(465줄)는 async 서버검색 typeahead로 **약 95% 동일**하다. 차이는 다음뿐:

| 축 | ProductAutocomplete | PartnerAutocomplete |
|---|---|---|
| 옵션 타입 | `{id, modelName, productName, sellingPrice?}` | `{partnerCode, name, bizNo?, phone?}` |
| 식별 키 | `id` | `partnerCode` |
| 입력 표시값 | `modelName` | `name` |
| 옵션 행 렌더 | 모델명 · 품목명 | 거래처명 · 코드 · 사업자번호? |
| 기본 label / placeholder / 검색 prop | 품목 / searchProducts | 거래처 / searchPartners |

나머지(debounce, 인스턴스 seq stale 무시, blur 게이트, 키보드 내비, compact/FormField 분기, 로딩/빈/에러 상태, 타이머 정리)는 바이트 동일. CSS도 거의 동일하나 Product는 focus-ring을 하드코딩 rgba로, Partner(AC-3)는 `var(--focus-ring-*)` 토큰으로 — Partner가 더 정합([[CURRENT-WORK]] "AC-2 focus-ring 백포트" 미해결 후속).

## 2. 목표 & 범위

### 목표
중복 로직을 제네릭 `AsyncAutocomplete<T>`로 추출하고 두 컴포넌트는 **얇은 wrapper로 보존**(공개 API·타입·소비처 무변경).

### 범위 밖
- WarehouseAutocomplete/WarehouseSelector(sync 변형) — 성격이 달라 별도 평가(미포함).
- 소비처(SlipFormPage·LineRow) 로직 변경 — 무변경 유지.
- BE / 검색 API 변경.

### 확정 결정
- **D-AAC-01**: 범위 = Product + Partner만(async). Warehouse는 별도.
- **D-AAC-02**: 기존 컴포넌트를 **얇은 wrapper로 보존**(공개 API 불변). 소비처 직접 교체 안 함 — 블래스트 반경 최소.
- **D-AAC-03**: CSS 통합 시 **focus-ring 토큰(`--focus-ring-brand`/`--focus-ring-danger`) 채택** — Product 하드코딩 rgba 제거, AC-2 백포트 동시 해소.

## 3. 설계

### 3.1 제네릭 컴포넌트 `AsyncAutocomplete<T>`
신규 `clients/web/design-system/src/components/AsyncAutocomplete/AsyncAutocomplete.tsx`. 기존 두 컴포넌트의 전 로직을 이전.

**어댑터 props (T별 차이):**
- `getKey: (item: T) => string` — React key / `aria-activedescendant` id / 선택 동일성 비교.
- `getInputLabel: (item: T) => string` — 입력란 표시 + blur exact-match 기준.
- `renderOption: (item: T) => ReactNode` — dropdown `<li>` 내부 내용.
- `listboxLabel: string` — listbox `aria-label`.
- `matchExact?: (item: T, trimmed: string) => boolean` — blur 시 정확 일치(기본: `getInputLabel(item).toLowerCase() === trimmed.toLowerCase()`).

**공통 props (그대로):** `value: T | null`, `onChange: (v: T | null) => void`, `search: (q: string) => Promise<T[]>`, `label?`, `ariaLabel?`, `placeholder?`, `required?`, `error?`, `disabled?`, `minChars?`(1), `debounceMs?`(250).

**제네릭 forwardRef**: 제네릭+forwardRef 표준 패턴 사용(내부 `forwardRef` + 외부 캐스팅 `as` 또는 제네릭 함수 컴포넌트 래핑). `HTMLInputElement` ref 전달 보존.

내부 상태/동작은 현행과 1:1: `draft/open/activeIndex/candidates/status/errorMsg`, `instanceSeq/latestSeq`, blur/debounce 타이머, `handleFocus/Blur/Change/KeyDown`, `performSearch`, `pick`, `displayValue`, `showDropdown/showLoadingRow/showEmpty/showMinCharsHint`, compact↔FormField 분기, unmount 타이머 정리.

### 3.2 wrapper — ProductAutocomplete / PartnerAutocomplete
각 파일은 어댑터 주입 wrapper로 축소(공개 export 보존):
- `ProductOption`/`PartnerOption` 타입 정의 유지(이동 없음 — 소비처 import 경로 불변).
- `ProductAutocomplete` = `<AsyncAutocomplete<ProductOption> getKey={p=>p.id} getInputLabel={p=>p.modelName} renderOption={...모델명·품목명} listboxLabel="품목 목록" search={searchProducts} label="품목"(기본) placeholder=... {...rest}/>`. ref 전달.
- `PartnerAutocomplete` 동일(getKey=partnerCode, getInputLabel=name, renderOption=명·코드·사업자번호?, listboxLabel="거래처 목록", 기본 label "거래처").
- prop 이름 `searchProducts`/`searchPartners`는 wrapper 공개 API로 유지(내부에서 `search`로 전달).

### 3.3 CSS 통합
- 신규 `AsyncAutocomplete/AsyncAutocomplete.module.css` — 구조 클래스(wrapper/field/input/dropdown/option/optionSelected/optionActive/empty/hint/statusRow/loadingSpinner/spinnerDot) + 옵션 파트 클래스(`optionPrimary`/`optionSecondary`/`optionTertiary`/`optionSep`).
- wrapper의 `renderOption`은 위 공유 파트 클래스 사용(Product: primary=모델명, secondary=품목명 / Partner: primary=명, secondary=코드, tertiary=사업자번호).
- **focus-ring 토큰 채택**(D-AAC-03): `:focus` → `var(--focus-ring-brand)`, error `:focus` → `var(--focus-ring-danger)`.
- 구 `ProductAutocomplete.module.css`·`PartnerAutocomplete.module.css` 삭제.
- design-system 배럴(`index.ts`)에 `AsyncAutocomplete` + 타입(`AsyncAutocompleteProps`) export 추가(공용 재사용 가능화). 기존 Product/Partner export 유지.

## 4. 테스트 / 검증
- **회귀 가드**: `clients/desktop/playwright/ac-2-product-autocomplete`·`ac-3-partner-autocomplete` 스펙이 3-A2 게이트에 포함됨 → CI 자동 실행으로 동작 불변 검증.
- design-system `npm run build`(tsc + vite) + storybook 빌드 green. Product/Partner stories 보존.
- 동등성 점검: 입력 표시·dropdown 행 마크업·키보드(ArrowUp/Down/Enter/Esc)·blur exact-match·stale 무시·compact 모드 1:1.
- 데스크톱 `tsc --noEmit`(소비처 무변경 확인).

## 5. 리스크 / 영향
| 항목 | 평가 |
|---|---|
| 공개 API 불변 | 소비처(SlipFormPage·LineRow) 0 변경 |
| 제네릭+forwardRef 타입 | 표준 패턴으로 처리, 주의 요 |
| CSS 토큰 전환 | focus-ring 시각 미세 변화(개선 방향) — 회귀 가드로 확인 |
| 영향 범위 | design-system: +AsyncAutocomplete(컴포넌트+css) / Product·Partner wrapper 축소 / 구 css 2개 삭제 / 배럴 export. BE·Flyway 무관 |

## 6. 산출물 체크리스트
- [ ] `AsyncAutocomplete/AsyncAutocomplete.tsx`(제네릭 + 전 로직) + `index.ts`
- [ ] `AsyncAutocomplete/AsyncAutocomplete.module.css`(통합 + focus-ring 토큰)
- [ ] `ProductAutocomplete.tsx` wrapper 축소 (ProductOption 유지)
- [ ] `PartnerAutocomplete.tsx` wrapper 축소 (PartnerOption 유지)
- [ ] 구 `ProductAutocomplete.module.css`·`PartnerAutocomplete.module.css` 삭제
- [ ] design-system `index.ts` AsyncAutocomplete export
- [ ] design-system build + storybook + desktop tsc green
- [ ] ac-2/ac-3 Playwright 회귀 green(3-A2 게이트)
- [ ] dev-report `docs/dev-reports/slice-item2-async-autocomplete.md` + DECISIONS D-AAC-01~03 + handoff 동기화
