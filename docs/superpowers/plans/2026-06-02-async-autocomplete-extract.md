# 공용 AsyncAutocomplete<T> 추출 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development 또는 executing-plans. 체크박스(`- [ ]`) 추적.
>
> **🚨 구현 = Codex 디스패치**([[feedback_codex_implements_claude_reviews]]). 코드 블록은 명세. PR 은 1차 push 직후 조기 발행([[feedback_open_pr_early]]).

**Goal:** Product/Partner Autocomplete의 95% 중복 async typeahead 로직을 제네릭 `AsyncAutocomplete<T>`로 추출하고, 두 컴포넌트는 얇은 wrapper로 보존(공개 API·소비처 불변).

**Architecture:** design-system에 제네릭 `AsyncAutocomplete<T>`(전 로직 + 어댑터 props getKey/getInputLabel/renderOption/listboxLabel) 신규. Product/PartnerAutocomplete는 어댑터 주입 wrapper로 축소. CSS는 단일 `AsyncAutocomplete.module.css`로 통합하고 focus-ring 토큰 채택.

**Tech Stack:** React 18 + TypeScript(제네릭 forwardRef), CSS Modules, Vite(design-system 라이브러리 빌드), Storybook.

**Spec:** `docs/superpowers/specs/2026-06-02-async-autocomplete-extract-design.md`

---

## Task 1: AsyncAutocomplete<T> 제네릭 컴포넌트 + CSS

**Files:**
- Create: `clients/web/design-system/src/components/AsyncAutocomplete/AsyncAutocomplete.tsx`
- Create: `clients/web/design-system/src/components/AsyncAutocomplete/AsyncAutocomplete.module.css`
- Create: `clients/web/design-system/src/components/AsyncAutocomplete/index.ts`

- [ ] **Step 1: 제네릭 컴포넌트 작성**

`ProductAutocomplete.tsx`의 전 로직을 제네릭 `<T,>`로 이전한다. props 인터페이스:
```ts
export interface AsyncAutocompleteProps<T> {
  value: T | null
  onChange: (item: T | null) => void
  search: (q: string) => Promise<T[]>
  /** React key / aria-activedescendant id / 선택 동일성 비교 키. */
  getKey: (item: T) => string
  /** 입력란 표시값 + blur exact-match 기준. */
  getInputLabel: (item: T) => string
  /** dropdown <li> 내부 내용. */
  renderOption: (item: T) => React.ReactNode
  /** listbox aria-label (예: "품목 목록"). */
  listboxLabel: string
  /** blur 정확 일치 판정. 기본: getInputLabel(item).toLowerCase()===trimmed.toLowerCase(). */
  matchExact?: (item: T, trimmed: string) => boolean
  label?: string
  ariaLabel?: string
  placeholder?: string
  required?: boolean
  error?: string
  disabled?: boolean
  minChars?: number
  debounceMs?: number
}
```
내부 구현은 `ProductAutocomplete.tsx`(현행) 과 1:1로 옮기되 다음만 치환:
- `value?.modelName` → `value ? getInputLabel(value) : ''`
- `p.modelName`(입력/표시/pick setDraft) → `getInputLabel(p)`
- `p.id`(key, `${listId}-${...}`, 선택 비교, aria-activedescendant) → `getKey(p)`
- blur exact-match: `candidates.find((p)=> (matchExact ? matchExact(p, trimmed) : getInputLabel(p).toLowerCase()===trimmed.toLowerCase()))`
- 옵션 행 내부 `<span class=optionModel>...` → `{renderOption(p)}`
- listId prefix → `ds-aac-list-${reactId}`, listbox `aria-label={listboxLabel}`
- 모듈 css import → `./AsyncAutocomplete.module.css`

**제네릭 forwardRef 패턴**(타입 보존):
```tsx
function AsyncAutocompleteInner<T>(props: AsyncAutocompleteProps<T>, ref: React.ForwardedRef<HTMLInputElement>) { /* 로직 */ }
export const AsyncAutocomplete = forwardRef(AsyncAutocompleteInner) as <T>(
  p: AsyncAutocompleteProps<T> & { ref?: React.ForwardedRef<HTMLInputElement> },
) => ReturnType<typeof AsyncAutocompleteInner>
```

- [ ] **Step 2: CSS 통합 + focus-ring 토큰**

`AsyncAutocomplete.module.css` = `PartnerAutocomplete.module.css`(focus-ring 토큰 버전) 기반으로 작성하되, 옵션 파트 클래스를 의미 중립 명으로: `optionPrimary`(1차, semibold), `optionSecondary`(2차), `optionTertiary`(3차, 보조), `optionSep`. 구조 클래스(wrapper/field/input/dropdown/option/optionSelected/optionActive/empty/hint/statusRow/loadingSpinner/spinnerDot)는 동일. focus: `box-shadow: var(--focus-ring-brand)`, error focus: `var(--focus-ring-danger)`.

- [ ] **Step 3: index.ts barrel**
```ts
export * from './AsyncAutocomplete'
```

- [ ] **Step 4: 검증 + 커밋**

Run: `cd clients/web/design-system && npx tsc --noEmit`
Expected: 오류 0.
```bash
git add clients/web/design-system/src/components/AsyncAutocomplete/
git commit -m "feat(ds): 제네릭 AsyncAutocomplete<T> 추출(Product/Partner 공통 base)"
```

---

## Task 2: ProductAutocomplete / PartnerAutocomplete → wrapper 축소

**Files:**
- Modify: `clients/web/design-system/src/components/ProductAutocomplete/ProductAutocomplete.tsx`
- Modify: `clients/web/design-system/src/components/PartnerAutocomplete/PartnerAutocomplete.tsx`
- Delete: `ProductAutocomplete.module.css`, `PartnerAutocomplete.module.css`

- [ ] **Step 1: ProductAutocomplete wrapper**

`ProductOption` 타입 정의 유지(이동 금지 — 소비처 import 경로 불변). 본문을 AsyncAutocomplete wrapper로 교체:
```tsx
import { forwardRef } from 'react'
import { AsyncAutocomplete } from '../AsyncAutocomplete/AsyncAutocomplete'
import styles from '../AsyncAutocomplete/AsyncAutocomplete.module.css'

export interface ProductOption { id: string; modelName: string; productName: string; sellingPrice?: number }
export interface ProductAutocompleteProps {
  value: ProductOption | null
  onChange: (product: ProductOption | null) => void
  searchProducts: (q: string) => Promise<ProductOption[]>
  label?: string; ariaLabel?: string; placeholder?: string
  required?: boolean; error?: string; disabled?: boolean
  minChars?: number; debounceMs?: number
}
export const ProductAutocomplete = forwardRef<HTMLInputElement, ProductAutocompleteProps>(
  function ProductAutocomplete({ searchProducts, label = '품목', placeholder = '모델명 또는 품목명 입력…', ...rest }, ref) {
    return (
      <AsyncAutocomplete<ProductOption>
        ref={ref}
        search={searchProducts}
        getKey={(p) => p.id}
        getInputLabel={(p) => p.modelName}
        listboxLabel="품목 목록"
        renderOption={(p) => (
          <>
            <span className={styles['optionPrimary']}>{p.modelName}</span>
            <span className={styles['optionSep']}>·</span>
            <span className={styles['optionSecondary']}>{p.productName}</span>
          </>
        )}
        label={label}
        placeholder={placeholder}
        {...rest}
      />
    )
  },
)
export default ProductAutocomplete
```

- [ ] **Step 2: PartnerAutocomplete wrapper**

`PartnerOption` 유지. wrapper:
```tsx
import { forwardRef } from 'react'
import { AsyncAutocomplete } from '../AsyncAutocomplete/AsyncAutocomplete'
import styles from '../AsyncAutocomplete/AsyncAutocomplete.module.css'

export interface PartnerOption { partnerCode: string; name: string; bizNo?: string; phone?: string }
export interface PartnerAutocompleteProps {
  value: PartnerOption | null
  onChange: (partner: PartnerOption | null) => void
  searchPartners: (q: string) => Promise<PartnerOption[]>
  label?: string; ariaLabel?: string; placeholder?: string
  required?: boolean; error?: string; disabled?: boolean
  minChars?: number; debounceMs?: number
}
export const PartnerAutocomplete = forwardRef<HTMLInputElement, PartnerAutocompleteProps>(
  function PartnerAutocomplete({ searchPartners, label = '거래처', placeholder = '거래처명 또는 코드 입력…', ...rest }, ref) {
    return (
      <AsyncAutocomplete<PartnerOption>
        ref={ref}
        search={searchPartners}
        getKey={(p) => p.partnerCode}
        getInputLabel={(p) => p.name}
        listboxLabel="거래처 목록"
        renderOption={(p) => (
          <>
            <span className={styles['optionPrimary']}>{p.name}</span>
            <span className={styles['optionSep']}>·</span>
            <span className={styles['optionSecondary']}>{p.partnerCode}</span>
            {p.bizNo ? (<><span className={styles['optionSep']}>·</span><span className={styles['optionTertiary']}>{p.bizNo}</span></>) : null}
          </>
        )}
        label={label}
        placeholder={placeholder}
        {...rest}
      />
    )
  },
)
export default PartnerAutocomplete
```

- [ ] **Step 3: 구 CSS 삭제**
```bash
git rm clients/web/design-system/src/components/ProductAutocomplete/ProductAutocomplete.module.css clients/web/design-system/src/components/PartnerAutocomplete/PartnerAutocomplete.module.css
```

- [ ] **Step 4: 검증 + 커밋**

Run: `cd clients/web/design-system && npx tsc --noEmit && npm run build`
Expected: 오류 0, 빌드 성공.
```bash
git add clients/web/design-system/src/components/ProductAutocomplete clients/web/design-system/src/components/PartnerAutocomplete
git commit -m "refactor(ds): Product/PartnerAutocomplete 를 AsyncAutocomplete wrapper 로 축소"
```

---

## Task 3: barrel export + 빌드/회귀 검증

**Files:** Modify `clients/web/design-system/src/index.ts`

- [ ] **Step 1: AsyncAutocomplete export 추가**

`index.ts`에 `export * from './components/AsyncAutocomplete'` 추가(기존 Product/Partner export 유지). 중복 타입명 충돌 없는지 확인(AsyncAutocompleteProps 신규).

- [ ] **Step 2: design-system 풀 빌드 + storybook**

Run:
```bash
cd clients/web/design-system && npx tsc --noEmit && npm run build && npm run build-storybook
```
Expected: 전부 green. Product/Partner stories 정상 렌더.

- [ ] **Step 3: desktop 소비처 무변경 확인**

Run:
```bash
cd clients/desktop && npm ci >/dev/null 2>&1; (cd ../web/design-system && npm run build >/dev/null 2>&1); npx tsc --noEmit
```
Expected: 오류 0(소비처 SlipFormPage·LineRow import 불변).

- [ ] **Step 4: 커밋**
```bash
git add clients/web/design-system/src/index.ts
git commit -m "feat(ds): AsyncAutocomplete barrel export"
```

---

## Task 4: 회귀(Playwright) + 문서 + PR

- [ ] **Step 1: 조기 PR** — Task 1~3 push 직후 발행([[feedback_open_pr_early]]). CI `Desktop Playwright` 잡(3-A2 게이트)이 `ac-2-product-autocomplete`·`ac-3-partner-autocomplete` 회귀를 자동 실행 → 동작 불변 검증.
- [ ] **Step 2: ac-2/ac-3 green 확인** — CI desktop-playwright 잡에서 두 스펙 PASS 확인(또는 로컬 `npx playwright test playwright/ac-2-product-autocomplete playwright/ac-3-partner-autocomplete`).
- [ ] **Step 3: dev-report + DECISIONS + handoff**
  - `docs/dev-reports/slice-item2-async-autocomplete.md`(중복 제거 통계, wrapper 구조, focus-ring 토큰 흡수).
  - DECISIONS D-AAC-01~03.
  - CURRENT-WORK 동기화(item 2 완료 → 다음 후속).
- [ ] **Step 4: 커밋.**

---

## 자가 검토
- **Spec 커버리지**: §3.1 제네릭→T1, §3.2 wrapper→T2, §3.3 CSS통합+토큰→T1·T2, 배럴→T3, 회귀→T4. ✅
- **Placeholder**: 코드 전량 기재. ✅
- **타입 일관성**: `getKey/getInputLabel/renderOption/listboxLabel`(T1 정의) ↔ wrapper 주입(T2) 일치. `ProductOption`/`PartnerOption` 공개 타입 유지(소비처 불변). AsyncAutocomplete.module.css 클래스(optionPrimary/Secondary/Tertiary/Sep)가 T1 CSS ↔ T2 renderOption 일치. ✅
