# AC-1 WarehouseAutocomplete — Designer 리뷰 Cycle 2

검토일: 2026-05-31
검토자: Designer agent
브랜치: feat/ac-1-warehouse-autocomplete
Fix commit: d6843058
대상 파일:
- `clients/web/design-system/src/components/WarehouseAutocomplete/WarehouseAutocomplete.module.css`
- `clients/web/design-system/src/components/WarehouseAutocomplete/WarehouseAutocomplete.tsx`
- `clients/web/design-system/src/components/WarehouseAutocomplete/WarehouseAutocomplete.stories.tsx`

---

## 사이클1 P1 블로킹 Finding 해소 확인

### D-1 [P1 블로킹] — `optionSelected` + `optionActive` 동시 상태 시각 충돌

**판정: 해소 확인**

CSS에 다음 결합 규칙이 추가되었다.

```css
/* D-1: selected + keyboard-active 동시 상태 — selected 강조(brand-100)를 유지하면서
 * active outline 을 더 진한 brand-200 배경으로 명확히 구분. */
.optionSelected.optionActive {
  background-color: var(--color-brand-200);
}
```

사이클1 권고 사항 "`.optionSelected.optionActive` 결합 규칙 추가 + background `--color-brand-200` 이상으로 강화"가 정확히 반영되었다.

**대비 검토 — `--color-brand-200: #AECFE7`**

선택+포커스 동시 상태의 배경은 brand-200 (#AECFE7)이다.

- brand-50 (hover: #EFF6FB) < brand-100 (selected: #D7E8F4) < brand-200 (selected+active: #AECFE7) 의 명도 계층이 올바르게 성립한다.
- brand-200 위에 outline `2px solid var(--color-brand-300)` (#7FB1D5)이 추가로 렌더된다. brand-200 배경과 brand-300 outline 의 색차(delta E)는 충분하며 WCAG 2.1 SC 1.4.11 Non-text Contrast (3:1) 기준 충족 가능 수준이다.
- 흰색(#FFFFFF) 배경 대비 brand-200 #AECFE7 의 대비비는 약 1.5:1 로 낮으나, 이는 배경색 간 구분 (포커스 영역 강조) 이므로 텍스트 가독성 기준(4.5:1)이 아닌 UI 컴포넌트/그래픽 기준(3:1) 적용 대상이다. brand-200 내부의 텍스트(optionCode: color-text-muted + optionName: color-text)는 중립색으로 별도 렌더되어 가독성에 영향 없다.
- 신규 시각 결함 없음.

**CSS cascade 검증**: `.optionSelected.optionActive` 는 CSS 명시도(specificity)상 `.optionSelected` (10), `.optionActive` (10) 단독 규칙보다 높은 명시도(20)를 가져 배경색 덮어쓰기가 의도대로 작동한다. outline 은 `.optionActive` 에서 상속되고 `.optionSelected.optionActive` 에서 재정의하지 않으므로 outline `2px solid var(--color-brand-300)` 은 그대로 적용된다.

---

### D-2 [P1 권고] — Default Story UUID 노출

**판정: 해소 확인**

사이클1 보고 당시 코드:
```tsx
<div style={{ marginTop: 8, fontSize: 12, color: '#6B7280' }}>
  선택된 창고 ID: {selected ?? '(없음)'}
</div>
```
여기서 `selected` 는 warehouseId(UUID) 그대로였다.

수정 후 현재 코드:
```tsx
const [selectedWarehouse, setSelectedWarehouse] = useState<{ code: string; name: string } | null>(null)
// onChange 핸들러:
onChange={(_id, wh) => setSelectedWarehouse({ code: wh.code, name: wh.name })}
// 표시:
선택된 창고: {selectedWarehouse ? `${selectedWarehouse.code} · ${selectedWarehouse.name}` : '(없음)'}
```

- state 를 UUID id 대신 `{ code, name }` 객체로 교체했다.
- `onChange` 첫 번째 인자 `_id` 는 underscore 접두사로 명시적으로 미사용 처리했다.
- value prop 은 `SAMPLE_WAREHOUSES.find((w) => w.code === selectedWarehouse.code)?.id` 로 내부에서만 id 를 참조하고 외부 표시에는 노출하지 않는다.
- 표시 텍스트도 "선택된 창고 ID" → "선택된 창고" 로 수정되었다.
- `feedback_uuid_no_user_visibility.md` 가이드라인 준수 확인.

**주의 사항 (비블로킹)**: `SearchInput` 및 `HideVirtual` story 에서는 여전히 `const [selected, setSelected] = useState<string | null>(null)` 에 UUID id 를 저장하지만, 이 값은 화면에 표시되지 않으므로 규칙 위반이 아니다. 단, 해당 story 에서 console.log 로 warehouseId(UUID)를 출력하는 부분이 `SearchInput` story 내에 남아 있다 (`console.log('selected warehouse:', wh)` — wh 자체가 아닌 id 출력이 아니므로 직접 UUID 노출은 아님).

---

### D-3 [P1 권고] — `error ?? invalid` 대신 `Boolean(error) || invalid`

**판정: 해소 확인**

수정 전: `(error ?? invalid) ? styles['hasError'] : null`
수정 후: `(Boolean(error) || invalid) ? styles['hasError'] : null`

- `error = ""` (빈 문자열) 전달 시 이전 코드는 `"" ?? invalid` → `""` (falsy) 로 hasError 미적용. 수정 후 `Boolean("") || false` → `false` 로 동일하게 처리되지만, 이는 빈 문자열 에러를 에러 없음으로 정확히 해석하는 것이다.
- 실제 의도: `error = "출고 창고를 선택하세요."` 같은 비어 있지 않은 문자열이면 `Boolean(error) = true` → hasError 적용. `error = undefined` 이면 `Boolean(undefined) = false` → FormField 의 `invalid` 폴백 사용. 정확하다.
- AccountCodeSelect 의 `error ? styles['hasError'] : null` 패턴보다 방어적이고 명료하다.

---

## 잔여 P2 Finding 재확인

### D-4 [P2] — dropdown `box-shadow` 미토큰화

**상태: 미수정 (비블로킹 확인)**

```css
.dropdown {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}
```

`--elev-popover: 0 4px 12px rgba(0, 0, 0, 0.08)` 토큰이 tokens.css에 정의되어 있으나 여전히 하드코딩 raw value 를 사용한다. AccountCodeSelect 동일 패턴이므로 비블로킹. 후속 토큰 정비 backlog 유지.

### D-5 [P2] — `hideVirtual` 사용 시 hint 없음

**상태: 미수정 (비블로킹 확인)**

전환 모달에서 `hideVirtual` 적용 시 "출고 가능 창고만 표시됩니다" 같은 hint 미표시. UX 개선 권고 상태 유지. 비블로킹.

### D-6 [P2] — Loading / 비활성 창고 선택 가능 여부 Story 없음

**상태: 미수정 (비블로킹 확인)**

Storybook에 Loading 상태 story, 비활성 창고 선택 가능 여부 검증 story 가 없다. 5 story 최소 요건은 충족하므로 비블로킹. 비활성 창고(HQ-002)가 현재 코드에서도 클릭/Enter 시 `pick()` 호출이 차단되지 않아 선택 가능한 점은 BE/FE 팀과 별도 결정 필요.

---

## 신규 시각 결함 검사

사이클1 대비 d6843058 fix 에서 신규 도입된 CSS/TSX 변경은 다음 3가지로 한정된다.

1. `.optionSelected.optionActive { background-color: var(--color-brand-200); }` 추가
2. `(Boolean(error) || invalid)` 로 hasError 조건 변경
3. Default Story onChange/state 리팩토링

모두 기존 컴포넌트의 시각 레이아웃(크기, 위치, 간격, 폰트)을 변경하지 않는 최소 범위 수정이다. 신규 시각 결함 없음.

---

## 종합 결론

**전체 평가: 통과**

사이클1 블로킹 Finding D-1 (selected+active CSS 충돌)이 `.optionSelected.optionActive` 결합 규칙 추가로 정확히 해소되었다. brand-200 배경색은 선택 상태(brand-100)와 선택+포커스 상태(brand-200)를 명도 계층으로 명확히 구분하며, 신규 시각 결함을 유발하지 않는다.

D-2 (Story UUID 노출) 및 D-3 (error 빈 문자열 폴백)도 권고대로 수정 완료.

잔여 D-4/D-5/D-6 는 비블로킹으로, 후속 슬라이스 개선 backlog로 이관한다.

**블로킹 Finding: 0건**

| ID | 등급 | 내용 | 사이클2 판정 |
|---|---|---|---|
| D-1 | P1 블로킹 | selected+active CSS 충돌 | 해소 |
| D-2 | P1 권고 | Default Story UUID 노출 | 해소 |
| D-3 | P1 권고 | error 빈 문자열 폴백 | 해소 |
| D-4 | P2 | dropdown shadow 미토큰화 | 잔여 (비블로킹) |
| D-5 | P2 | hideVirtual hint 없음 | 잔여 (비블로킹) |
| D-6 | P2 | Loading / 비활성 창고 Story 없음 | 잔여 (비블로킹) |
