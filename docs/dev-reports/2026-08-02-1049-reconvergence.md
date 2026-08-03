# #1049 재수렴 적대적 검증 보고서

- `closeSearchSurface` 정의는 `clients/web/design-system/src/components/AsyncAutocomplete/AsyncAutocomplete.tsx:280-289`이며 `cancelDebouncedSearch()`, `latestSeq.current = ++instanceSeq.current`, `setOpen(false)`, `setActiveIndex(-1)`, `setSearchState({ candidates: [], resolvedQuery: '' })`, `setStatus('idle')`, `setErrorMsg(null)`, `setDraft('')`를 수행한다.
- `closeSearchSurface()` 직접 호출문은 같은 파일의 `:310`, `:316`, `:475` 총 3곳이다.
- 모달 취소는 `AsyncAutocomplete.tsx:714`의 `onCancel={closeSelection}`에서 `:472-477`로 들어가 `closeSearchSurface()`를 호출한다.
- 입력은 `AsyncAutocomplete.tsx:479-480`의 `displayValue = open ? draft : selectedLabel`로 표시되므로, 취소 시 `setOpen(false)`와 `setDraft('')`에 의해 타이핑하던 검색어가 화면에서 사라지고 선택값 레이블(없으면 빈 문자열)로 돌아간다.
- 확정된 복수 선택 칩은 `MultiSelectAutocomplete.tsx:23-29`, `:169-194`의 부모 controlled `selected` 배열에서 렌더되며, 모달 취소 경로는 `onAdd`/`onRemove`를 호출하지 않는다. 따라서 모달을 닫았다 다시 열어도 이미 확정된 칩은 남는다.
- 모달 내부에서 체크만 하고 취소한 미확정 선택은 별개다. `AsyncAutocomplete.tsx:472-475`가 `selectionCandidates`를 비우고, 모달은 후보 키 기반으로 재생성되므로 그 임시 체크는 남지 않는다.
- `rg -n "closeSearchSurface\\s*\\(" clients --glob '*.{ts,tsx,js,jsx}'` 전수 결과는 `AsyncAutocomplete.tsx:310`, `:316`, `:475`의 3곳뿐이며 legacy 소비 코드의 직접 호출은 0곳이다.
- `:310`과 `:316`은 각각 `resultSelectionMode`가 있는 결과 1건/2건 이상 분기 안에 있고, `:475`의 `closeSelection`은 `:315`에서 같은 opt-in 분기가 연 `selectionOpen` 모달의 확인·취소에만 연결된다. 따라서 `resultSelectionMode`가 없는 legacy 경로는 세 호출문 모두에 도달하지 않아 기존 40곳 동작을 바꾸지 않는다.

## 결론

- **지우면 안 되는 것을 지우는가 — 예.** 모달 취소가 `AsyncAutocomplete.tsx:714 → :472-475 → :280-289`로 공통 정리에 도달해 입력 초안을 지우며, `:479-480`에 따라 사용자가 타이핑하던 검색어가 사라진다.
- 이미 확정된 복수 선택 칩은 부모 `selected` 상태이므로 지워지지 않는다.
- `closeSearchSurface()` 호출부는 **총 3곳**, legacy 직접 호출은 **0곳**이며 opt-in하지 않은 legacy 40곳은 세 호출 경로에 도달하지 않는다.
- 판단이 코드로 명확하여 Playwright는 실행하지 않았다.
