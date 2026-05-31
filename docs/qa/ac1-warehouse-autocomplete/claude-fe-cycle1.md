# AC-1 창고 자동완성 — FE 코드 리뷰 (Claude FE, Cycle 1)

- **리뷰어**: Claude FE agent
- **날짜**: 2026-05-31
- **대상 브랜치**: `feat/ac-1-warehouse-autocomplete` (PR #331)
- **결론**: **CHANGES_REQUESTED**
- **Finding 요약**: P0 1건 / P1 0건 / P2 3건

---

## 점검 결과 요약

| # | 등급 | 위치 | 제목 |
|---|---|---|---|
| F-1 | P0 | `WarehouseAutocomplete.tsx` `handleBlur` | 선택 후 입력 전체 삭제 + blur → 더미 truthy Warehouse 객체로 onChange 호출 → 게이트 우회 + 빈 warehouseCode API 전송 |
| F-2 | P2 | `WarehouseAutocomplete.tsx` handleFocus | 창고 선택 상태에서 재포커스 시 selectedLabel로 draft 세팅 → 후보 dropdown 전체가 빈 화면 노출 |
| F-3 | P2 | `WarehouseAutocomplete.tsx` `handleKeyDown` | 드롭다운 닫힌 상태에서 ArrowDown 키 입력 시 열리지 않음 — WAI-ARIA 1.2 combobox 패턴 위반 |
| F-4 | P2 | `WarehouseAutocomplete.tsx` / aria | `aria-haspopup="listbox"` 미선언 — WAI-ARIA combobox 완전성 |

---

## 세부 Finding

### F-1 [P0] blur 시 빈 입력으로 onChange 잘못 호출 — 게이트 우회 + 빈 warehouseCode API 전송

**파일**: `clients/web/design-system/src/components/WarehouseAutocomplete/WarehouseAutocomplete.tsx` 163–165행

**재현 시나리오**:
1. 전환 모달에서 출고 창고를 선택한다 (예: HQ-001 본사창고).
2. 창고 자동완성 input에 다시 포커스한다 (draft = "HQ-001 · 본사창고").
3. input 내용을 전부 Delete/Backspace로 지운다 (draft = "").
4. input 바깥을 클릭해 blur 처리한다.

**현재 코드**:
```ts
if (!trimmed) {
  if (value) onChange('', { id: '', name: '', code: '', type: 'HEADQUARTERS', active: true })
  return
}
```

**문제**:
- `value`(convertWarehouse.id)가 존재하면 `onChange('', { id: '', name: '', code: '', ... })` 호출.
- 부모 `onChange` = `(_id, warehouse) => setConvertWarehouse(warehouse)` 이므로
  `setConvertWarehouse({ id: '', name: '', code: '', ... })` 가 실행됨.
- `{ id: '', ... }` 는 **truthy 객체**이므로 부모의 제출 게이트 `!convertWarehouse`가 `false`가 됨 → **제출 버튼 활성화**.
- 제출 시 `convertWarehouse.code === ''` → API에 `warehouseCode: ''` 전송 → BE 422 또는 비정상 처리.
- `convertWarehouseError` 조건 `!convertWarehouse`도 `false` → 에러 메시지도 노출되지 않음.

**spec 의도**: `blur 시 미확정 처리(부모 null 복원)` — 빈 입력 + blur는 선택 해제로 처리해야 함.

**현재 테스트 커버리지**: 기존 Playwright 시나리오 1~11 중 이 경로(선택 후 입력 삭제 + blur)를 검증하는 케이스 없음. P0 버그가 테스트망을 통과함.

**수정 방향**:

방법 A (권장 — 가장 단순, spec 정합):
```ts
if (!trimmed) {
  // 빈 입력 blur: 이전 선택값 복원 (selectedLabel로 덮어쓰기, onChange 호출 안 함)
  // draft는 블러 타이머 안에서 setDraft(selectedLabel)로 복원됨 — else 분기와 동일 처리
  setDraft(selectedLabel)
  return
}
```
- 빈 입력 + blur 시 onChange를 호출하지 않고 이전 선택(selectedLabel)으로 복원.
- 사용자가 선택을 명시적으로 해제하는 경로는 "드롭다운에서 다른 항목 선택" 또는 모달 취소로만 남음.
- WarehouseSelector의 native select도 선택 후 취소 없이 이전 값 유지이므로 drop-in 동작 정합.

방법 B (onChange 시그니처 확장 필요):
- `onChange: (warehouseId: string | null, warehouse: Warehouse | null) => void`로 변경
- WarehouseSelector 시그니처와 불일치 → drop-in 파손 → 비권장.

---

### F-2 [P2] 창고 선택 상태에서 재포커스 시 드롭다운 전체 공백

**파일**: `WarehouseAutocomplete.tsx` `handleFocus` 145~154행

**현상**:
- 창고 선택 후 input을 다시 클릭하면 `handleFocus`가 `setDraft(selectedLabel)` 실행.
- `selectedLabel = "HQ-001 · 본사창고"` → `searchWarehouses(visibleWarehouses, "HQ-001 · 본사창고")`
  - code prefix: `w.code.startsWith("HQ-001 · 본사창고")` → 어떤 창고도 해당 없음.
  - name includes: `w.name.includes("HQ-001 · 본사창고")` → 어떤 창고도 해당 없음.
  - candidates = [] → `"일치하는 창고가 없습니다."` 노출.
- 사용자가 선택된 창고 확인이나 다른 창고로 변경하려 할 때 드롭다운이 비어 보임.

**참고**: AccountCodeSelect 원본도 동일 패턴. 이 PR에서 명시적으로 개선이 없다면 idiom 수준에서 일관성 유지로 볼 수 있음. 단, 창고 목록이 4개로 소수라는 점(spec: "전체 표시 허용")에서 재포커스 시 전체 목록을 노출하는 것이 spec 의도에 더 부합함.

**수정 방향**:
```ts
const handleFocus = () => {
  if (disabled) return
  if (blurTimer.current) { ... }
  setDraft('')          // selectedLabel 대신 빈 문자열로 → 전체 목록 표시
  setActiveIndex(-1)
  setOpen(true)
}
```
단, 이 경우 사용자가 현재 선택값을 볼 수 없으므로 input value가 빈 문자열로 초기화되는 시각적 점프가 발생함. 대안으로 draft='' 설정 후 input에 선택 창고 코드를 placeholder처럼 보여주는 방식도 가능하나 별도 구현 필요.

---

### F-3 [P2] 닫힌 combobox에서 ArrowDown 키로 열리지 않음 — WAI-ARIA 1.2 패턴 미준수

**파일**: `WarehouseAutocomplete.tsx` `handleKeyDown` 188행

```ts
if (!open || candidates.length === 0) return
```

- 드롭다운이 닫힌 상태(`open=false`)에서 ArrowDown 누르면 얼리 리턴 → 드롭다운이 열리지 않음.
- WAI-ARIA 1.2 combobox 패턴: `ArrowDown`은 드롭다운이 닫혀 있을 때 오픈 트리거로 동작해야 함.
- AccountCodeSelect 원본에도 동일 gap 존재(기존 부채). 이 PR에서 이식 시 개선 없음.

**수정 방향**:
```ts
if (e.key === 'ArrowDown' && !open) {
  e.preventDefault()
  setOpen(true)
  return
}
if (!open || candidates.length === 0) return
```

---

### F-4 [P2] `aria-haspopup="listbox"` 미선언

**파일**: `WarehouseAutocomplete.tsx` `<input>` 247–258행

- WAI-ARIA combobox 패턴 권고사항: combobox 역할의 element에 `aria-haspopup="listbox"` 선언.
- 현재 `role="combobox"` + `aria-expanded` + `aria-controls` + `aria-activedescendant` 는 있으나 `aria-haspopup` 미선언.
- 보조기기가 팝업 유형을 명시적으로 알리지 못함.
- AccountCodeSelect 원본도 동일 gap(기존 부채). 이 PR에서 이식 시 개선 없음.

**수정 방향**: `<input>` 속성에 `aria-haspopup="listbox"` 추가.

---

## 정상 확인 사항

### 1. 검색 로직 — 정상

- `searchWarehouses`: code prefix 우선 → name 부분일치 (대소문자 무시). 중복 제외(Set). spec 완전 일치.
- 빈 입력 + 포커스 시 전체 목록 반환 (trimmed 없으면 `return warehouses`). spec 일치.
- `hideVirtual`: `warehouses.filter((w) => w.type !== 'VIRTUAL')` — VIRTUAL 제외 정확.

### 2. 키보드/포커스/blur — 부분 정상 (F-1, F-3 제외)

- ArrowDown/Up 경계: 마지막에서 Down = 유지, 처음에서 Up = 0 유지. 경계 안전.
- Enter: `activeIndex >= 0 ? candidates[activeIndex] : candidates[0]` — 초기 상태(-1)에서도 first pick. 안전.
- Escape: 닫기 + draft 복원. 정상.
- onMouseDown에 `e.preventDefault()` — blur timer 보다 먼저 pick 처리. 정상.
- blurTimer 120ms 지연 — click 이벤트 선행 보장. 정상.
- blur 후 정확 매치("code · name" 또는 code만) 확정. 불일치 시 복원. spec 일치(F-1 예외 케이스 제외).

### 3. drop-in 정합 — 정상

- props 시그니처: `warehouses/value/onChange(id,wh)/label/placeholder/hideVirtual/required/error/disabled` — WarehouseSelector와 1:1 동일.
- SalesPartnerOrderDetailPage의 모든 기존 로직 보존:
  - `convertWarehouse` state, `setConvertWarehouse` 콜백.
  - `convertWarehouseError` 에러 게이트.
  - `!convertWarehouse` 제출 disable 조건.
  - `convertWarehouse.code` → `warehouseCode` API 전송.
  - `hideVirtual`, `required`, `disabled={convertMutation.isPending || warehousesQuery.isLoading}`.
- WarehouseSelector 컴포넌트 미변경 확인 (`git diff` 에 WarehouseSelector 파일 없음). 타 화면 영향 없음.

### 4. UUID 비공개 — 실질적으로 준수

- dropdown 옵션의 `id` 속성에 UUID 포함 (`${listId}-${w.id}`) → ARIA `aria-activedescendant` 용. HTML 속성이며 사용자 가시 텍스트 아님. 허용.
- `onChange` 첫 인자(warehouseId=UUID)는 부모가 `_id`로 무시. `warehouse.code`만 API 전송. 정상.
- Storybook Default story에서 `선택된 창고 ID: {selected}` 문자열로 UUID 노출 — dev-only 스토리이므로 실 production 영향 없음. 단, 엄격한 해석 시 수정 권고 (단순히 `선택됨: {selected ?? '없음'}` → 창고 코드 표시로 변경 권장).

### 5. 접근성 — 부분 정상 (F-3, F-4 제외)

- `role="combobox"` + `aria-expanded` + `aria-autocomplete="list"` + `aria-controls` + `aria-activedescendant`. 핵심 속성 구현.
- `role="listbox"` + `role="option"` + `aria-selected`. 정상.
- 빈 상태: `role="status"` live region — 스크린리더 고지 가능.
- `aria-invalid`, `aria-describedby`, `aria-required` — FormField 통합 올바름.

### 6. 회귀/타입/빌드 — 정상

- `clients/web/design-system`: `tsc -p tsconfig.build.json --noEmit` → **0 error** (출력 없음).
- `clients/desktop`: `npm run typecheck` → **0 error**.
- design-system `npm run lint` → **0 error** (59 warning — 전부 기존 stories의 useState-in-render 패턴, 신규 파일도 동일 warning 3건이나 pre-existing 패턴).
- desktop `npm run lint` → **0 error** (1 pre-existing warning — PurchaseSlipPrintPage.tsx, 이번 PR 무관).
- `export * from './components/WarehouseAutocomplete'` → `WarehouseAutocomplete/index.ts`가 `Warehouse` 타입을 re-export하지 않으므로 `WarehouseSelector/index.ts`의 `Warehouse` export와 충돌 없음.
- Storybook 5종 story 모두 spec 요구 충족 (Default/SearchInput/HideVirtual/RequiredWithError/Disabled).
- Playwright 셀렉터 갱신: `input[role="combobox"]` + `[role="listbox"]` + `[role="option"]` — WarehouseAutocomplete 렌더 구조와 정합. 시나리오 1~11 (10 포함) 모두 셀렉터 수준 정합.
- Playwright 시나리오 9 에러 텍스트 `'잔여 수량을 초과'` — mock.ts 응답 `'전환 수량이 잔여 수량을 초과하거나 이미 전환된 주문입니다.'`의 substring. 어서션 정상.

---

## 미커버 테스트 시나리오 (Playwright 보완 권장)

| 시나리오 | 이유 |
|---|---|
| 창고 선택 후 input 전체 삭제 + blur → 제출 버튼 disabled 확인 | F-1 P0 버그를 잡을 회귀 테스트 (F-1 수정 후 필수 추가) |
| 키보드만으로 ArrowDown → 후보 열림 → 선택 | F-3 수정 후 키보드 전용 플로우 커버 |

---

## 결론

**CHANGES_REQUESTED**

P0 버그(F-1) 수정 필수. blur 시 빈 입력 처리에서 더미 Warehouse 객체로 onChange를 호출하는 코드를 제거하고, selectedLabel 복원만 수행하도록 변경해야 한다. 이 버그는 창고 선택 후 입력을 지우고 blur하면 빈 warehouseCode가 API로 전송되는 실 운영 결함으로, 현재 Playwright 테스트에도 커버되지 않아 그대로 릴리즈될 위험이 있다.

P2 3건(F-2~F-4)은 운영 결함은 아니나 WAI-ARIA 패턴 완전성 및 UX 개선 항목으로, 이번 사이클에서 함께 수정하거나 후속 AC-2/AC-3 공통 개선 타이밍에 일괄 처리 권고.

Finding 총 4건: P0 1건 / P1 0건 / P2 3건.
