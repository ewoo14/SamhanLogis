# AC-2 ProductAutocomplete — Designer 리뷰 Cycle 1

**리뷰어**: Designer Agent (Claude)
**날짜**: 2026-05-31
**대상 파일**:
- `clients/web/design-system/src/components/ProductAutocomplete/ProductAutocomplete.tsx`
- `clients/web/design-system/src/components/ProductAutocomplete/ProductAutocomplete.module.css`
- `clients/web/design-system/src/components/ProductAutocomplete/ProductAutocomplete.stories.tsx`
- `clients/web/design-system/src/components/LineRow/LineRow.tsx` (modelCell slot 통합 확인)

참조 기준: AC-1 `WarehouseAutocomplete`, `AccountCodeSelect`, `tokens.css`

---

## 1. 서버검색 UX — 로딩·상태 피드백

### 통과

- debounce 250ms 기본값 적절. `debounceMs` prop 으로 오버라이드 가능.
- `status: 'loading'` → 필드 우측에 14px CSS spinner(`spinnerDot`, `border-top-color: var(--color-brand-500)`) 표시. 사용자가 서버 응답 대기 중임을 인지 가능.
- stale 응답 무시 (`_globalSeq` 비교) — 빠른 연속 입력 시 이전 결과 덮어쓰기 방지.
- 에러 시 "검색 중 오류가 발생했습니다." 메시지 표시.
- minChars 미달 시 "N글자 이상 입력하면 검색합니다." 안내 표시.

### 결함

**[D-1] P1 — 로딩 중 dropdown 컨테이너 미표시 (로딩 위치 불명확)**

`showDropdown` 조건이 `status === 'loading'` 을 포함하지만 실제 렌더는
```
{showDropdown && candidates.length > 0 ? (<ul>...) : null}
```
로 `candidates.length > 0` 을 추가로 AND 한다.
따라서 검색 시작 직후 `status='loading'`이고 `candidates=[]` 인 구간에는
dropdown 컨테이너 자체가 렌더되지 않는다.
로딩 스피너는 input 우측에 표시되나, 후보 목록 자리(dropdown 박스)에 로딩 UI가
전혀 없어 "지금 검색 중인가, 검색 결과가 없는가"를 구분하기 어렵다.

**권장**: `status === 'loading'` 일 때 dropdown 위치에 로딩 플레이스홀더 1행
("검색 중…") 을 표시하거나, `showDropdown` 조건을 실제 렌더 분기와 정합되게
단순화해야 한다.

현재 `showDropdown` 변수는 실질적으로 사용되지 않고(loading + candidates=0 구간에
dropdown이 안 뜸), 오해를 유발하는 dead-code 논리에 가깝다.

---

## 2. AC-1 일관성 점검

### 통과

- `activeIndex` / `optionSelected` / `optionActive` 분리 적용.
- **`optionSelected.optionActive` 규칙 존재** (`ProductAutocomplete.module.css` L141~143).
  AC-1 D-1 교훈 반영 완료 — `background-color: var(--color-brand-200)` 로 양립 처리.
- focus ring: `.field:focus-within { box-shadow: 0 0 0 3px rgba(45, 119, 168, 0.18) }` — AC-1, AccountCodeSelect 와 동일 패턴 일관.
- 키보드 네비: ArrowDown/ArrowUp/Enter/Escape 구현. Enter 단일 후보 자동 선택(candidates.length===1) 포함.
- `onMouseDown: e.preventDefault()` — blur 보다 click 먼저 발생하도록 게이트 처리. AC-1 패턴 일관.
- blur 게이트: 미확정 free-text 차단, 이전 선택 복원. AC-1 교훈 적용.
- ArrowUp 에서 idx=0 일 때 0 유지 (AC-1 동일 동작).

### 결함

**[D-2] P2 — optionModel 색상 대비 약함 (가독성 저하)**

`optionModel` (모델명, 예: AJ040RXH4BC1) 이 `color: var(--color-text-muted)` = neutral-600 (#4D5562) 로 표시된다.
AC-1 `WarehouseAutocomplete` 에서는 `optionCode` 도 동일하게 `color: var(--color-text-muted)` 이나, 모델명은 ERP 에서 **1차 검색 키워드**로 품목명(secondary) 보다 강조되어야 한다.

`optionName` 이 `color: var(--color-text)` = neutral-900 (#0F1216) 인 반면
`optionModel` 은 muted 색상 → 시각 계층이 역전.
모델명을 더 강하게, 품목명을 보조 색으로 처리하는 것이 한국 ERP 관례에 부합.

**권장**: `optionModel` → `color: var(--color-text)` 또는 `var(--ink-primary)`. `optionName` → `color: var(--color-text-muted)`.

---

## 3. 디자인 토큰 사용

### 통과

- 간격: `var(--space-1/2/3)` 일관 사용.
- 색상: `var(--color-brand-50/100/200/300/500)`, `var(--color-border)`, `var(--color-danger)`, `var(--color-bg)`, `var(--color-bg-muted)`, `var(--color-text/muted/subtle)` 전부 토큰.
- radius: `var(--radius-md)`.
- duration: `var(--duration-fast)`.
- font: `var(--font-family-sans)`, `var(--font-size-base/sm/xs)`, `var(--font-weight-semibold)`.
- `font-variant-numeric: tabular-nums` — 모델명 숫자 정렬.

### 결함

**[D-3] P1 — dropdown shadow 하드코딩 (AC-1 미해결 D-4 패턴 반복)**

```css
/* ProductAutocomplete.module.css L112 */
box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
```

이 값은 `tokens.css` 의 `--elev-popover: 0 4px 12px rgba(0, 0, 0, 0.08)` 와 일치하나
토큰을 직접 참조하지 않고 리터럴로 복제한다.
`WarehouseAutocomplete.module.css` 도 동일하게 하드코딩되어 있어 AC-1 에서
Designer D-4 로 지적된 패턴이 그대로 복제되었다.

다크 모드(`body[data-theme="dark"]`) 에서 `--elev-popover` 가 오버라이드되면
ProductAutocomplete dropdown 은 반응하지 않는다.

**권장**: `box-shadow: var(--elev-popover)` 로 교체.

동일 파일의 focus ring 하드코딩(L34, L48 `rgba(45,119,168,0.18)` / `rgba(214,80,74,0.18)`)
은 AC-1 에서도 동일하게 사용 중이며, 공통 패턴으로 사전 합의된 것으로 판단되어
이번 P1 지적에서 제외한다. 단 향후 `--focus-ring-brand`, `--focus-ring-danger` 토큰
도입이 권장된다. [P2 메모]

---

## 4. 전표 작성 통합 — LineRow 모델셀

### 통과

- `LineRow` 에 `modelCell?: ReactNode` slot prop 추가됨 (`LineRow.tsx` L105, L202~210).
- `modelCell != null` 조건으로 기존 input 흐름 backward compatible 유지.
- `cellModel` CSS: `position: relative; padding-right: var(--space-row-x)` — autocomplete dropdown 이 row 경계 밖으로 절대 위치 가능한 구조.
- `LineRow.module.css` grid 10컬럼 구조와 `ProductAutocomplete` wrapper `width: 100%` — 모델명 셀 폭에 맞춰 자동 확장.

### 결함

**[D-4] P1 — cellModel 높이 40px 내 field(36px) 수직 중앙정렬 미검증**

`LineRow` 행 높이 `--row-h: 40px`. `ProductAutocomplete .field` 높이 `36px`.
`cellModel` 이 `display: flex; align-items: center; height: 100%` 이므로
36px field 가 수직 중앙정렬되어야 하나, `FormField` wrapper div 가 삽입되면
`FormField → wrapper → field` 3단 구조가 생겨 `FormField` 의 상하 padding/margin 이
행 높이를 초과시킬 수 있다.

`FormField` 가 `label` 을 렌더할 경우 라벨 높이만큼 추가되어 40px 행이 확장된다.
전표 라인 내에서는 **라벨 없이** 사용해야 하며, 호출자가 `label=""` 또는 라벨
미렌더 옵션을 명시해야 함이 현재 API 어디에도 문서화되지 않았다.

**권장**: LineRow 내 `modelCell` 용 인라인 사용 시 `label` prop 을 빈 문자열 또는
`undefined` 로 넘겨야 함을 JSDoc / Storybook 에 명시. 또는 `compact` / `noLabel` prop
을 추가하여 `FormField` label 렌더를 억제.

---

## 5. 한국 ERP 관례 — 품목 검색 UX

### 통과

- `minChars=1` 기본값: 한 글자부터 검색 시작, 즉시 반응성.
- 후보 포맷 "modelName · productName" — 이카운트 참조 화면 패턴과 일관.
- 선택 후 입력란에 `modelName` 표시 — 전표 작성 시 모델명이 1차 식별자.
- UUID 비공개 가드 준수 — `productId` 화면 미노출.
- Escape 로 dropdown 닫기 — 표준 ERP 키보드 UX.

### 결함

**[D-5] P2 — minChars 안내 메시지 위치 UX 문제**

`showMinCharsHint` 가 `true` 일 때 `.hint` div 가 `position: absolute; top: calc(100% + 4px)` 로 렌더된다. 그러나 `showMinCharsHint` 와 `showDropdown` 이 동시에 `true` 가 될 수 없는 조건(minChars 미달 시 `status='idle'`, `candidates=[]`)이라 실질 충돌은 없다.

다만 **사용자가 1글자 입력 후 바로 지우면** (draft.trim().length === 0) hint 가 사라지고 dropdown 도 없어 "입력하세요" 안내가 없다. 처음 포커스 시 hint 를 표시하거나 placeholder 로 보완하면 더 자연스럽다. 현재 placeholder `"모델명 또는 품목명 입력…"` 이 있으므로 허용 수준이나, minChars>1 설정 시 "N글자 이상" 안내가 포커스 직후 즉시 표시되지 않는 점은 개선 여지.

---

## 6. Storybook 커버리지

### 통과

8개 story 존재 (요구사항 5개 초과):
- `Default` — 검색 + 선택 흐름
- `LoadingState` — 2초 delay 로딩 스피너
- `EmptyResults` — "검색 결과 없음"
- `ErrorState` — reject 에러 메시지
- `RequiredWithError` — 필수 + 에러 외곽선
- `Disabled` — 비활성
- `MinChars` — minChars=3 안내 메시지
- `SelectThenBlur` — 선택 후 blur 복원 (AC-1 교훈 검증)

### 결함

**[D-6] P2 — LoadingState story 가 로딩 상태를 자동 진입하지 않음**

`LoadingState` story 는 delay 2000ms 로 설정되어 있어, Storybook 에서 열어도
사용자가 직접 텍스트를 입력해야 로딩 상태로 진입한다. Play function 없이 정적으로
로딩 중 상태를 보여주는 방법이 없다.

**권장**: `play` 함수로 input 에 자동 타이핑하거나, 별도 `LoadingStateFrozen` story 를
추가해 `status='loading'` 상태를 props 로 직접 주입하는 방안 검토.
(현재 status 가 내부 state 이므로 구조 변경 없이는 어렵다 — P2 수준 backlog)

---

## 7. 기타 코드 품질 (디자인 관련)

**[D-7] P2 — `_globalSeq` 모듈 수준 전역 변수 — 멀티 인스턴스 간섭 가능**

```ts
let _globalSeq = 0
```

복수의 `ProductAutocomplete` 인스턴스가 동시에 마운트되면 (예: 판매 전표 멀티라인)
seq 가 공유되어 한 인스턴스의 검색이 다른 인스턴스의 stale 체크에 영향을 준다.
예: 라인 1 seq=5, 라인 2 seq=6 → 라인 1 의 응답은 latestSeq(5) !== 6 이라 항상 버려진다.

**권장**: `_globalSeq` 를 컴포넌트 인스턴스 범위로 이동 (`useRef` 기반 per-instance counter).
디자인 관점에서는 멀티라인 전표에서 품목 자동완성이 전혀 동작하지 않는 **블로킹 UX 버그**.

---

## 결론 요약

| ID | 심각도 | 항목 | 블로킹 |
|---|---|---|---|
| D-1 | **P1** | 로딩 중 dropdown 컨테이너 미표시 — `showDropdown` 조건과 실제 렌더 불일치 | 예 |
| D-2 | P2 | optionModel 색상 역전 — 모델명(muted) < 품목명(primary) 시각 계층 오류 | 아니오 |
| D-3 | **P1** | dropdown shadow 하드코딩 (`rgba(0,0,0,0.08)`) — `--elev-popover` 미참조 | 예 |
| D-4 | **P1** | LineRow 내 FormField 라벨 렌더 시 행 높이 초과 위험 — label 사용 방법 미문서화 | 예 |
| D-5 | P2 | minChars > 1 포커스 직후 안내 미표시 | 아니오 |
| D-6 | P2 | LoadingState story 정적 진입 불가 — play 함수 없음 | 아니오 |
| D-7 | **P1** | `_globalSeq` 모듈 전역 — 멀티라인 인스턴스 간 stale 체크 간섭 → 멀티라인 전표에서 검색 결과 항상 버려짐 | 예 |

**블로킹 finding: 4건 (D-1, D-3, D-4, D-7)**

P1 4건이 해소될 때까지 PR 머지 보류 권장.
특히 D-7 은 전표 멀티라인 사용 시 품목 검색이 전면 무력화되는 블로킹 버그임.
