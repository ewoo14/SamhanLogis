# AC-1 WarehouseAutocomplete — Designer 리뷰 Cycle 1

검토일: 2026-05-31  
검토자: Designer agent  
브랜치: feat/ac-1-warehouse-autocomplete  
대상 파일:
- `clients/web/design-system/src/components/WarehouseAutocomplete/WarehouseAutocomplete.tsx`
- `clients/web/design-system/src/components/WarehouseAutocomplete/WarehouseAutocomplete.module.css`
- `clients/web/design-system/src/components/WarehouseAutocomplete/WarehouseAutocomplete.stories.tsx`
- `clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.tsx` (전환 모달 적용부)

---

## 1. 자동완성 UX — AccountCodeSelect 와 일관성

### 일관 항목 (통과)
- input focus → draft 복원 + open=true 패턴: AccountCodeSelect 와 동일
- blur 시 blurTimer(120ms) → mouseDown 우선 처리 패턴: 동일
- Escape → 이전 선택 복원(setDraft(selectedLabel)): 동일
- 선택 표시 형식 "code · name" (AccountCodeSelect 는 "code name" 공백 구분): 창고 도메인은 `·` 구분이 더 명확해 의도적 차이로 수용 가능

### 발견 [P1] — ArrowDown/Up 키 내비게이션 편차

**AccountCodeSelect 에는 ArrowDown/Up 키 내비게이션이 없다.** WarehouseAutocomplete 는 `activeIndex` + ↑↓ 구현이 추가되어 있어 실제로는 AccountCodeSelect 보다 더 완성도 높은 UX이다. 그러나 `aria-activedescendant` 가 `${listId}-${candidates[activeIndex]!.id}` 를 가리키는데, 창고 ID 는 UUID가 아닌 `wh-hq-001` 같은 테스트 픽스처 ID로 stories에서 보이지만, **실제 BE 응답 UUID 가 aria ID 일부로 DOM에 노출**된다.

구체적으로:
```tsx
id={`${listId}-${w.id}`}  // w.id = UUID (BE PK)
aria-activedescendant={... `${listId}-${candidates[activeIndex]!.id}` ...}
```

이는 사용자 눈에는 보이지 않으나 DOM 인스펙터에서 UUID 가 attribute 값으로 확인 가능하다. `feedback_uuid_no_user_visibility.md` 규칙은 "화면에서 UUID 노출 금지"이고 DOM attribute는 스크린 리더가 읽지 않는 내부 참조이므로 엄격 적용 대상이 아니라고 해석할 수 있다. 단, 이 점을 BE/FE 팀과 명시적으로 합의할 것을 권고한다.

### 발견 [P2] — 후보 없을 때 빈 상태 표시 위치

```css
.empty {
  position: absolute;
  top: calc(100% + 4px);
  ...
}
```

`.empty` 가 absolute 배치로 dropdown 과 동일 위치에 표시되는 것은 AccountCodeSelect 와 동일 패턴이므로 일관성 충족. 다만 `.wrapper` 에 `overflow: visible` 이 명시되지 않아 부모 컨텍스트에 따라 클리핑될 수 있다. AccountCodeSelect 도 동일 패턴이므로 기존 대비 신규 결함은 아님. 기록만 남김.

---

## 2. 디자인 토큰 사용

### 통과 항목
| 속성 | 사용 토큰 | 평가 |
|---|---|---|
| border | `--color-border`, `--color-border-strong` | 정상 |
| border-radius | `--radius-md` | 정상 |
| background | `--color-bg`, `--color-bg-muted` | 정상 |
| text color | `--color-text`, `--color-text-muted`, `--color-text-subtle` | 정상 |
| font-size | `--font-size-base`, `--font-size-sm`, `--font-size-xs` | 정상 |
| font-weight | `--font-weight-semibold` | 정상 |
| font-family | `--font-family-sans` | 정상 |
| spacing (padding/gap) | `--space-1`, `--space-2`, `--space-3` | 정상 |
| transition | `--duration-fast` | 정상 |
| hover background | `--color-brand-50` | AccountCodeSelect 동일 |
| selected background | `--color-brand-100` | AccountCodeSelect 동일 |
| active (키보드) outline | `--color-brand-300` | AccountCodeSelect 에 없는 추가 개선 |
| error border | `--color-danger` | 정상 |

### 발견 [P1] — focus ring box-shadow 하드코딩 rgba

```css
.field:focus-within {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);  /* <- dropdown shadow 아닌 focus ring */
  /* 실제는: */
  box-shadow: 0 0 0 3px rgba(45, 119, 168, 0.18);
}

.hasError:focus-within {
  box-shadow: 0 0 0 3px rgba(214, 80, 74, 0.18);
}
```

`rgba(45, 119, 168, 0.18)` 은 `--color-brand-500: #2D77A8` 의 raw RGB 하드코딩이고, `rgba(214, 80, 74, 0.18)` 은 `--color-danger-500: #D6504A` 의 raw RGB 하드코딩이다. `tokens.css` 에 투명도 포함 shadow 토큰이 없으므로 현재 AccountCodeSelect.module.css 에서도 **동일하게 하드코딩**되어 있어 일관성 자체는 유지된다.

그러나 `tokens.css` 에 `--shadow-md: 0 2px 6px rgba(15, 18, 22, 0.08)` / `--elev-popover: 0 4px 12px rgba(0, 0, 0, 0.08)` 같은 elevation 토큰이 있음에도 dropdown `box-shadow`가 `0 4px 12px rgba(0, 0, 0, 0.08)` 으로 직접 쓰인 점은 `--elev-popover` 를 쓸 수 있었으나 쓰지 않은 것이다. **AccountCodeSelect 도 동일** 문제이므로 이번 PR 신규 결함은 아니지만, 토큰 정비 backlog 로 등록 권고.

**중요: AccountCodeSelect 와 WarehouseAutocomplete 의 focus ring 은 pixel 단위 완전 동일** — 리그레션 없음.

### 발견 [P2] — dropdown box-shadow 미토큰화

```css
.dropdown {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}
```

위는 `--elev-popover: 0 4px 12px rgba(0, 0, 0, 0.08)` 와 값이 동일하다. `var(--elev-popover)` 로 교체 권고. AccountCodeSelect 동일 패턴이므로 블로킹 아님.

---

## 3. FormField 통합

### 통과
- `FormField` render prop 패턴 사용: `label`, `error`, `required`, `ariaDescribedBy`, `invalid` 모두 올바르게 연결
- `Label` 컴포넌트의 required 별표 (`--color-danger`, semibold): 정상
- `FormField` 의 error span (`role="alert"`, `--color-danger`): 정상
- `WarehouseSelector` (기존 native select) 와 FormField 연결 방식이 동일

### 발견 [P1] — `invalid` 전달 불일치

```tsx
// WarehouseAutocomplete.tsx line 226~229
className={[
  styles['field'],
  disabled ? styles['disabled'] : null,
  (error ?? invalid) ? styles['hasError'] : null,
].filter(Boolean).join(' ')}
```

`error` prop 이 외부에서 전달된 경우, FormField 의 `invalid` 는 `Boolean(error)` 이므로 `error ?? invalid` 는 `error || invalid` 와 사실상 동일하다. 그런데 `error` 가 빈 문자열 `""` 로 전달되면:
- `error ?? invalid` → `""` (truthy 판정 X → hasError 미적용)
- `invalid` = `Boolean("")` = `false`

결과적으로 `error=""` 시 error outline 이 미표시된다. 실용적으로 빈 문자열 에러는 없겠지만 방어 코드 측면에서 `Boolean(error) || invalid` 로 수정 권고. **AccountCodeSelect 는 `error ? styles['hasError'] : null` 로 단순 처리** — 이쪽이 더 명료하다.

블로킹 수준: 실제 사용(SalesPartnerOrderDetailPage)에서 error 는 문자열 메시지 또는 undefined 이므로 동작상 문제 없음. P1 로 분류하되 FE 팀에 수정 권고.

---

## 4. 한국 ERP 관례 — 창고 자동완성 적정성

### 검토 결론
이카운트 참조 기준:
- 창고 수 4~5개 (실 운영 기준): 자동완성보다 드롭다운이 표준 ERP 관례
- 그러나 이미 `WarehouseSelector`(native select) 가 드롭다운으로 존재하며, 이번 PR 은 타이핑 검색이 가능한 **업그레이드 대체** 컴포넌트

### 통과 — 업무 흐름 자연성
- 빈 입력 + 포커스 → 전체 목록 즉시 표시: 창고 수가 적으므로 이 동작이 이카운트 드롭다운과 동일한 UX 효과
- 코드 prefix 우선 정렬 (HQ-001, VH-001 패턴): 창고 코드 암기 가능한 담당자에게 최적
- 이름 부분일치 보조: 코드 모를 때 한국어 이름으로 검색 가능

### 발견 [P2] — VIRTUAL 창고 hideVirtual 시 설명 없음

전환 모달에서 `hideVirtual` 적용 시 VIRTUAL 창고가 제외되는데, 사용자에게 "왜 특정 창고가 보이지 않는가"에 대한 힌트가 없다. FormField 의 `hint` prop 을 활용해 "출고 가능 창고만 표시됩니다" 같은 안내 추가를 권고. 현재 SalesPartnerOrderDetailPage 적용부에도 미표시. UX 개선 권고이므로 블로킹 아님.

---

## 5. 접근성 시각 피드백

### 통과
- `role="combobox"`, `aria-autocomplete="list"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`: ARIA 1.2 combobox 패턴 준수
- `aria-selected` on `role="option"`: 정상
- `aria-invalid`, `aria-describedby`, `aria-required`: FormField 연결 정상
- `aria-label="창고 목록"` on `role="listbox"`: 스크린 리더 목록 인식 가능
- `role="status"` on `.empty`: 빈 상태 스크린 리더 알림

### 발견 [P1] — optionActive 와 optionSelected 동시 적용 시 시각 충돌

```css
.optionSelected {
  background-color: var(--color-brand-100);
  font-weight: var(--font-weight-semibold);
}

.optionActive {
  background-color: var(--color-brand-50);
  outline: 2px solid var(--color-brand-300);
  outline-offset: -2px;
}
```

키보드로 이미 선택된 항목으로 포커스 이동 시 두 클래스가 동시 적용된다:
- background: `--color-brand-50` (optionActive 가 우선 — CSS 순서상 후위)
- outline: `--color-brand-300` 적용
- font-weight: semibold 유지

결과적으로 선택됨(brand-100) + 포커스(brand-50 + outline) 가 합산되어 brand-50 배경 + outline 이 된다. 선택 상태 강조(brand-100)가 포커스 하이라이트(brand-50)에 덮어씌워지므로 시각적으로 선택됨을 구분하기 어렵다. 두 상태 동시 적용 시 `optionSelected.optionActive` 결합 규칙을 별도로 정의하거나 background 를 `--color-brand-200` 이상으로 강화할 것을 권고.

### 발견 [P2] — disabled 상태 시각 (input cursor)

```css
.disabled {
  background-color: var(--color-bg-muted);
  cursor: not-allowed;
}
.input:disabled {
  color: var(--color-text-muted);
  cursor: not-allowed;
}
```

`cursor: not-allowed` 가 `.disabled` (wrapper `div`) 와 `.input:disabled` 양쪽에 모두 선언되어 있다. wrapper `div` 에 cursor 선언은 child `input` 에 의해 덮어씌워지므로 실효성이 없다(pointer-events 상속과 cursor 는 별개). 다만 AccountCodeSelect 에도 동일 패턴이므로 신규 결함 아님.

### 통과 — 로딩 상태

SalesPartnerOrderDetailPage 적용부에서 `warehousesQuery.isLoading` 시 `disabled` + placeholder 변경으로 로딩 피드백 처리:
```tsx
placeholder={warehousesQuery.isLoading ? '창고 목록 불러오는 중…' : '창고 코드 또는 이름 입력…'}
disabled={convertMutation.isPending || warehousesQuery.isLoading}
```
별도 스피너 없이 disabled+placeholder 변경으로 처리하는 것은 전환 모달 컨텍스트에서 수용 가능. Storybook에 loading story 없음은 아래 6항에서 별도 기록.

---

## 6. Storybook 5 Story 커버리지

| Story | 상태 커버 | 평가 |
|---|---|---|
| `Default` | 기본 / 미선택 | 통과 |
| `SearchInput` | 검색 입력 시나리오 (인터랙티브) | 통과 |
| `HideVirtual` | hideVirtual=true (VIRTUAL 제외) | 통과 |
| `RequiredWithError` | required=true + error 메시지 | 통과 |
| `Disabled` | disabled (value 선택됨 상태) | 통과 |

### 발견 [P1] — Default Story 에서 UUID 노출

```tsx
<div style={{ marginTop: 8, fontSize: 12, color: '#6B7280' }}>
  선택된 창고 ID: {selected ?? '(없음)'}
</div>
```

`selected` 는 `warehouseId` (UUID)다. Story 는 `wh-hq-001` 같은 테스트 픽스처라 UUID가 아니지만, 실 BE 연동 시 UUID 가 그대로 노출된다. `feedback_uuid_no_user_visibility.md` 가이드라인에 따라 Story 의 확인 텍스트를 `선택된 창고 ID` 대신 선택된 창고 코드/이름을 표시하도록 수정 권고. Storybook 은 개발자 전용이므로 P1 (사용자 화면 아님)이나, 신규 개발자가 패턴을 잘못 참조할 우려가 있다.

### 발견 [P2] — Loading 상태 Story 없음

`SalesPartnerOrderDetailPage` 에서 `warehousesQuery.isLoading` 시 disabled+placeholder 변경이 있으나, Storybook 에 Loading story 가 없다. 5 story 요건은 충족하나 실 사용 시나리오 누락. P2 로 권고.

### 발견 [P2] — 비활성 창고(active=false) Story 없음

`HQ-002 구 본사창고(폐쇄)` 샘플이 SAMPLE_WAREHOUSES 에 포함되어 있어 dropdown 에서 "(비활성)" 배지 노출 확인 가능하나, 비활성 항목이 **선택 가능한지** (클릭/Enter 시 onChange 호출 여부) 검증 story 없음. 현재 코드는 비활성 항목도 pick() 호출이 차단되지 않아 비활성 창고 선택이 가능하다.

---

## 종합 결론

### 전체 평가: 조건부 통과 (P1 3건 수정 후 통과)

WarehouseAutocomplete 는 AccountCodeSelect idiom 을 창고 도메인에 충실히 이식했으며, 디자인 토큰 사용, FormField 통합, 접근성 ARIA 패턴 면에서 design-system 표준을 준수한다. 한국 ERP 관례(이카운트 참조) 관점에서도 소수 창고 자동완성은 업무 흐름상 자연스럽다.

### 블로킹 Finding 목록

| ID | 등급 | 내용 | 블로킹 여부 |
|---|---|---|---|
| D-1 | P1 | `optionSelected` + `optionActive` 동시 적용 시 시각 충돌 — 선택 상태 강조가 포커스 하이라이트에 덮어씌워짐 | **블로킹** |
| D-2 | P1 | Default Story 에서 `선택된 창고 ID` 로 UUID 노출 패턴 (신규 개발자 잘못된 참조 우려) | 권고 (P1, 비블로킹) |
| D-3 | P1 | `(error ?? invalid)` 대신 `Boolean(error) || invalid` 수정 권고 — 빈 문자열 에러 방어 | 권고 (P1, 비블로킹) |
| D-4 | P2 | dropdown `box-shadow` 를 `var(--elev-popover)` 토큰으로 교체 권고 | 비블로킹 |
| D-5 | P2 | `hideVirtual` 시 "출고 가능 창고만 표시" hint 없음 | 비블로킹 |
| D-6 | P2 | Loading / 비활성 창고 선택 가능 여부 Story 없음 | 비블로킹 |

**블로킹 Finding: 1건 (D-1)**

D-1 은 키보드 접근성 시각 피드백 결함으로, 선택된 항목에 키보드 포커스 이동 시 선택 상태를 시각적으로 구분할 수 없다. WCAG 2.1 SC 1.4.11 (Non-text Contrast) 관점에서도 포커스 표시가 선택 배경색보다 낮은 대비로 덮어씌워지는 것은 문제이다. FE 팀에 `.optionSelected.optionActive` 결합 규칙 추가를 요청한다.

나머지 P1 2건(D-2, D-3)은 즉시 수정 권고이나 기능 블로킹은 아니다.
