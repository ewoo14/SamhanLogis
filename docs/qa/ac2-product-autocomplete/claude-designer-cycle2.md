# AC-2 ProductAutocomplete — Designer 리뷰 Cycle 2

**리뷰어**: Designer Agent (Claude)
**날짜**: 2026-05-31
**Fix 커밋**: `71422f48`
**대상 파일**:
- `clients/web/design-system/src/components/ProductAutocomplete/ProductAutocomplete.tsx`
- `clients/web/design-system/src/components/ProductAutocomplete/ProductAutocomplete.module.css`
- `clients/desktop/src/renderer/routes/SlipFormPage.tsx`
- `clients/web/design-system/src/components/LineRow/LineRow.tsx` (참조)
- `clients/web/design-system/src/components/LineRow/LineRow.module.css` (참조)

---

## Cycle 1 P1 블로킹 4건 해소 판정

### D-1 [P1] — 로딩 중 dropdown 박스 미표시 → **해소**

Cycle 1 지적: `status='loading'` + `candidates=[]` 구간에 dropdown 컨테이너 자체가 렌더되지 않아 로딩 위치가 불명확.

Fix 내용 확인:

```tsx
// L290
const showLoadingRow = open && status === 'loading' && candidates.length === 0

// L367-380
{showLoadingRow ? (
  <ul id={listId} className={styles['dropdown']} role="listbox" aria-label="품목 목록">
    <li className={styles['statusRow']} role="option" aria-selected={false}>
      <span className={styles['spinnerDot']} aria-hidden="true" />
      <span>검색 중…</span>
    </li>
  </ul>
) : null}
```

`showLoadingRow`(loading + candidates 빈 구간)에 `.dropdown` 클래스 `<ul>` 이 독립 분기로 렌더된다. `.dropdown` 은 `position: absolute; top: calc(100% + 4px); box-shadow: var(--elev-popover)` 를 포함하므로 시각적 dropdown 박스에 "검색 중…" 텍스트와 spinner 가 나타난다.

`showLoadingRow` / `showDropdown && candidates.length > 0` / `showEmpty` / 에러 4개 분기는 상호 배타적이므로 `listId` 중복 발행 없음.

**판정: 해소. D-1 블로킹 제거.**

---

### D-3 [P1] — dropdown shadow 하드코딩 → **해소**

Cycle 1 지적: `box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08)` 리터럴 — `--elev-popover` 미참조.

Fix 내용 확인 (`ProductAutocomplete.module.css` L112):

```css
.dropdown {
  ...
  box-shadow: var(--elev-popover);
}
```

`--elev-popover: 0 4px 12px rgba(0, 0, 0, 0.08)` 토큰을 직접 참조. 다크 모드에서 토큰 오버라이드 시 자동 반영.

**판정: 해소. D-3 블로킹 제거.**

---

### D-4 [P1] — LineRow 내 FormField 라벨 렌더 시 행 높이 초과 위험 → **해소**

Cycle 1 지적: `label` prop 을 넘기지 않으면 `FormField` 가 라벨 DOM 을 렌더해 40px 행 높이를 초과할 수 있음. compact 사용법이 문서화되지 않음.

Fix 내용 확인:

1. **`isCompact` 분기 구현** (`ProductAutocomplete.tsx` L303):
   ```tsx
   const isCompact = !label || label === ''
   ```
   `isCompact` 이면 `FormField` 를 완전히 건너뛰고 `renderControls(reactId, ...)` 를 직접 반환 (L433~435). `<label>` DOM 요소 미생성 → 행 높이 영향 없음.

2. **SlipFormPage 사용부** (L1037~1058):
   ```tsx
   <ProductAutocomplete
     label=""
     ariaLabel={`라인 ${idx + 1} 품목`}
     ...
   />
   ```
   `label=""` → `isCompact=true` → FormField 미렌더. `ariaLabel` 로 접근성 이름 부여.

3. **JSDoc 명시** (`ProductAutocomplete.tsx` L71~80):
   ```
   label?: string — ... LineRow 내 compact 사용 시 label 을 생략하고 ariaLabel 을 대신 지정한다.
   ariaLabel?: string — ... LineRow 내 compact 사용 시 visible label 없이 접근성 이름을 부여할 때 사용.
   ```
   문서화 완료.

4. **행 높이 검증**: `LineRow.module.css` `.lineRow { height: var(--row-h); }` = 40px. `ProductAutocomplete .field { height: 36px }`. `cellModel` 은 `display: flex; align-items: center; height: 100%` 이므로 36px field 가 40px cell 내 수직 중앙정렬. `FormField` wrapper 가 없으므로 label 높이 추가 없음.

**판정: 해소. D-4 블로킹 제거.**

---

### D-7 [P1] — `_globalSeq` 모듈 전역 — 멀티라인 인스턴스 간 stale 체크 간섭 → **해소**

Cycle 1 지적: `let _globalSeq = 0` 모듈 전역 카운터 → 라인 A seq=5, 라인 B seq=6 → 라인 A 응답이 항상 버려지는 블로킹 UX 버그.

Fix 내용 확인 (`ProductAutocomplete.tsx` L136~141):

```tsx
/**
 * stale 응답 무시: 인스턴스별 단조 증가 seq.
 * 모듈 전역 카운터(이전 _globalSeq) 대신 인스턴스별 useRef 로 격리하여
 * 멀티라인 전표에서 라인 A 검색이 라인 B seq 에 의해 버려지는 오염 방지.
 */
const instanceSeq = useRef<number>(0)
const latestSeq = useRef<number>(0)
```

`performSearch` 내부 (L219):
```tsx
const seq = ++instanceSeq.current
latestSeq.current = seq
```

`instanceSeq` / `latestSeq` 가 각 컴포넌트 인스턴스의 `useRef` 로 완전 격리. 라인 A와 라인 B는 독립 카운터를 가지며 상호 간섭 없음.

**판정: 해소. D-7 블로킹 제거.**

---

## D-2 [P2] — optionModel 색상 처리 확인

Cycle 1 지적: `optionModel` 이 `var(--color-text-muted)`, `optionName` 이 `var(--color-text)` — 시각 계층 역전.

Fix 내용 확인 (`ProductAutocomplete.module.css` L145~165):

```css
.optionModel {
  /* 모델명이 1차 검색 키워드 — primary color 로 강조 (D-2) */
  color: var(--color-text);
  font-weight: var(--font-weight-semibold);
  ...
}
.optionName {
  /* 품목명은 보조 정보 — muted 로 처리 (D-2) */
  color: var(--color-text-muted);
  ...
}
```

모델명: `var(--color-text)` + `font-weight-semibold` (1차, 강조). 품목명: `var(--color-text-muted)` (보조). 시각 계층 정상화. 한국 ERP 관례 충족.

Cycle 1 에서 D-2 는 P2(비블로킹)로 분류되었으나 fix 커밋에 함께 포함되어 해소됨.

**판정: 해소. (P2였으므로 블로킹 아님)**

---

## 잔여 결함 (비블로킹)

### D-5 [P2] — minChars > 1 포커스 직후 안내 미표시

Cycle 1 에서 P2 비블로킹으로 분류. Fix 커밋에 변경 없음. 현재 `showMinCharsHint` 조건은 `draft.trim().length > 0 && draft.trim().length < minChars` 이므로 포커스 직후 빈 draft 상태에서는 hint 표시 없음. placeholder `"모델명 또는 품목명 입력…"` 이 fallback 안내 역할을 하므로 허용 수준.

**상태: 잔여 (비블로킹). 후속 backlog 유지.**

### D-6 [P2] — LoadingState story 정적 진입 불가

Cycle 1 에서 P2 비블로킹으로 분류. Fix 커밋에 변경 없음. `status` 가 내부 state 이므로 구조 변경 없이 story 에서 주입 불가. `play` 함수 추가 또는 별도 frozen story 가 해결책이나 현재 미구현.

**상태: 잔여 (비블로킹). 후속 backlog 유지.**

---

## 신규 시각 결함 점검 (isCompact 모드)

### isCompact 정렬 / 높이

- `isCompact=true` 시 `renderControls(reactId, ...)` 직접 반환 → `<div className={styles['wrapper']}>` 최상위.
- `.wrapper { position: relative; display: inline-flex; flex-direction: column; gap: var(--space-1); width: 100%; }` — `width: 100%` 로 cellModel 셀 폭 채움.
- `.field { height: 36px; }` — `cellModel` 의 `align-items: center; height: 100%(=40px)` 에서 수직 중앙. 상하 2px 여백 확보.
- FormField label 미생성으로 추가 높이 없음.

신규 시각 결함 없음.

### dropdown z-index (멀티라인 중첩)

`.dropdown { position: absolute; z-index: 50; }`. `cellModel { position: relative; }`. 복수 라인에서 dropdown 이 열리면 z-index 50 으로 상위 라인 dropdown 이 하위 라인 row 를 덮을 수 있음. 이는 ERP 전표 autocomplete 의 정상 동작이며, 동시에 복수 dropdown 이 열리지 않는 구조(blur 시 닫힘)이므로 시각 결함 아님.

**신규 결함 없음.**

---

## 결론 요약

| ID | 심각도 | 항목 | Cycle1 블로킹 | Cycle2 판정 |
|---|---|---|---|---|
| D-1 | P1 | 로딩 중 dropdown 박스 + "검색 중…" row 렌더 | 예 | **해소** |
| D-2 | P2 | optionModel 색상 역전 | 아니오 | **해소** (커밋 포함) |
| D-3 | P1 | dropdown shadow `var(--elev-popover)` 토큰 참조 | 예 | **해소** |
| D-4 | P1 | isCompact(label 없이 ariaLabel) + FormField 미렌더 + JSDoc 문서화 | 예 | **해소** |
| D-5 | P2 | minChars > 1 포커스 직후 안내 미표시 | 아니오 | 잔여 (비블로킹) |
| D-6 | P2 | LoadingState story 정적 진입 불가 | 아니오 | 잔여 (비블로킹) |
| D-7 | P1 | per-instance `useRef` seq 로 멀티라인 검색 독립 | 예 | **해소** |

**블로킹 finding: 0건**

Cycle 1 P1 블로킹 4건(D-1 / D-3 / D-4 / D-7) 전부 해소 확인.
신규 시각 결함 없음.
잔여 P2 2건(D-5 / D-6)은 비블로킹으로 후속 backlog.

**Designer 관점 PR 머지 승인.**
