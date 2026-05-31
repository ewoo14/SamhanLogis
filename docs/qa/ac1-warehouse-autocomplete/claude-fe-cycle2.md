# AC-1 창고 자동완성 — FE 리뷰 사이클 2

**브랜치**: `feat/ac-1-warehouse-autocomplete`
**fix 커밋**: `d6843058`
**리뷰어**: Claude FE
**날짜**: 2026-05-31

---

## 결론: APPROVE (잔여 finding P3 1건)

사이클 1 P0(F-1 blur 게이트 우회)는 **완전히 해소**되었다.
신규 결함 1건(N-1, P3 경고 수준)이 발견되었으나 블로커 아님.

---

## F-1 [P0] 해소 판정: 해소 완료

### 변경 전 동작 (버그)
`handleBlur` → `!trimmed` 분기에서 `onChange('', dummyObj)` 를 호출.
부모 `convertWarehouse` 가 `code=''` 인 truthy 객체로 오염 → 제출 게이트 우회.

### 변경 후 동작 (d6843058)
```ts
if (!trimmed) {
  // onChange 호출 금지
  if (selectedWarehouse) {
    setDraft(selectedLabel)  // 기존 선택 표시 복원
  }
  return
}
```
- `onChange` 가 완전히 제거됨 — 부모 상태가 변경되지 않는다.
- `selectedWarehouse` 존재 시 `setDraft(selectedLabel)` 복원: 이전 선택 레이블이 input 에 다시 나타난다.
- `selectedWarehouse` 없음(null) 시 `draft` 는 `''` 그대로 유지 → 부모 상태 null 유지 → 제출 버튼 disabled.

**게이트 우회 차단 판정: 확인.**

### warehouseCode='' 전송 불가 확인
매칭 실패 경로(`else { setDraft(selectedLabel) }`) 에서도 `onChange` 미호출.
`exact.id !== value` 조건부 `onChange` 는 정확 매치(visibleWarehouses 내 존재)에만 도달하므로
`warehouseCode=''` 로 `convertWarehouse` 가 오염되는 경로가 없음. **확인.**

---

## F-2 [P2] 해소 판정: 해소 완료

```ts
const handleFocus = () => {
  ...
  setDraft('')        // 전체 후보 노출
  setActiveIndex(-1)
  setOpen(true)
}
```

- 포커스 시 `draft=''` → `searchWarehouses(visibleWarehouses, '')` → 전체 목록 반환.
- 기존에 창고가 선택된 상태에서 재포커스해도 전체 목록이 노출됨.
  `displayValue = open ? draft : selectedLabel` 로 비포커스 시 selectedLabel 표시는 유지.
- **부작용 없음 확인**: `selectedLabel` 은 `useMemo([selectedWarehouse])` 로 별도 관리.
  포커스 중 `draft=''` 는 후보 노출에만 영향, `selectedLabel` 과 독립.

---

## handleFocus draft='' 부작용 경계 분석

### 기존 선택 표시 훼손 여부
`displayValue = open ? draft : selectedLabel`
- `open=true`(포커스 중): `draft=''` 표시. placeholder 가 표시됨 → 사용자가 타이핑 시작 가능.
- `open=false`(포커스 밖): `selectedLabel` 표시. 이전 선택 레이블 정상 출력.

**훼손 없음.** 단, 포커스 직후 잠깐 input 이 비어 보이는 시각적 동작은 의도된 UX(재선택 마찰 제거).

### blur 복원 로직 경계

| 상태 | `selectedWarehouse` | blur 시 동작 |
|---|---|---|
| 미선택, 빈 입력 | null | `draft=''` 유지, return (onChange 미호출) |
| 미선택, free-text 입력 | null | `exact` 없음 → `setDraft('')` (selectedLabel='') |
| 선택된 상태, 빈 입력 | 존재 | `setDraft(selectedLabel)` 복원 |
| 선택된 상태, 정확 매치 | 존재 | `onChange` 호출 (값 변경), `draft` 는 pick 에서 이미 설정 |
| 선택된 상태, 매칭 실패 | 존재 | `setDraft(selectedLabel)` 복원 |

모든 경계 케이스에서 onChange 가 선택 없는 상태로 오염되지 않는다. **확인.**

---

## 시나리오 12 (신규 Playwright) 검증

```
시나리오 12: F-1 회귀 — 창고 미선택 상태에서 임의 텍스트 입력+blur 시 제출 버튼 disabled 유지
```

### 케이스 A (빈 포커스 후 Tab blur)
- `autocompleteInput.focus()` → `press('Tab')` → `waitForTimeout(200)`
- blur timer(120ms) 경과 후 `trimmed=''` → onChange 미호출 → submitBtn.toBeDisabled() 검증.
- **커버리지 충분.**

### 케이스 B (매칭 없는 텍스트 입력 후 Tab blur)
- `fill('zzz매칭없음')` → `keyboard.press('Tab')` → `waitForTimeout(200)`
- blur 콜백에서 `trimmed='zzz매칭없음'` → `exact=undefined` → `setDraft(selectedLabel='')` → onChange 미호출.
- submitBtn.toBeDisabled() 검증.
- **커버리지 충분.**

### 한계점 (P3 — 블로커 아님)
케이스 B 에서 `autocompleteInput.focus()` 후 `fill('zzz매칭없음')` 를 호출하면
`handleFocus` 가 `draft=''` 로 초기화한 뒤 Playwright `fill` 이 전체 텍스트를 덮어쓴다.
이는 실제 사용자 흐름과 동일하므로 시나리오는 유효하다.

---

## 신규 Finding

### N-1 [P3] handleBlur 클로저 stale-draft 잠재 위험

**위치**: `WarehouseAutocomplete.tsx` L157–184

**현상**: `handleBlur` 내부 `window.setTimeout(callback, 120)` 은 blur 발생 시점의 렌더 클로저에서 `draft` 를 캡처한다. 사용자가 빠르게 타이핑하다 즉시 blur 할 때(120ms 이내에 `draft` 상태가 추가로 변경되는 경우) 클로저가 최신 `draft` 를 읽지 못할 가능성이 이론상 존재한다.

**실 영향 평가**: React 함수형 컴포넌트는 렌더마다 새 함수를 생성하므로 `handleBlur` 는 blur 이벤트가 발생한 렌더의 `draft` 를 캡처한다. `handleChange` 에 의해 `draft` 가 업데이트되면 컴포넌트는 리렌더되고 새 `handleBlur` 가 등록된다. 실제 브라우저 이벤트 순서상 onBlur 는 마지막 onChange 이후에 발생하므로 클로저의 `draft` 는 최종 입력값을 반영한다.

**결론**: 실제로 stale closure 가 발생하는 시나리오는 없으나, 명시적으로 `useRef`로 `draft` 의 최신값을 tracking 하는 패턴(예: `draftRef.current = draft`) 을 사용하면 방어적으로 확실히 제거할 수 있다. P3 제안 수준 — 지금 당장 블로커 아님.

---

## 빌드/타입/린트 검증

| 검증 | 결과 |
|---|---|
| `npm run build` (design-system) | 통과 (0 error) |
| `npm run lint` (design-system) | 0 error, 59 warning (stories.tsx hooks-in-render 패턴 — 기존 베이스라인과 동일, 신규 없음) |
| TypeScript strict (tsc -p tsconfig.build.json) | build 내 tsc 실행 통과 |

---

## 잔여 Finding 요약

| ID | 심각도 | 내용 | 상태 |
|---|---|---|---|
| F-1 | P0 | blur 게이트 우회 | **해소 완료** |
| F-2 | P2 | 재포커스 전체 후보 노출 | **해소 완료** |
| D-1 | P1 | selected+active CSS 결합 규칙 | **해소 완료** |
| D-2 | P1 | Story UUID 노출 제거 | **해소 완료** |
| D-3 | P1 | error="" falsy 처리 | **해소 완료** |
| N-1 | P3 | handleBlur stale-draft 잠재 위험 (이론) | 신규, 블로커 아님 |

**잔여 블로커**: 0건
**잔여 finding(P3)**: 1건 (N-1)
