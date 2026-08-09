# PR #1150 R3 — IME 조합 중 Escape 모달 닫힘 수정 보고서

검증일: 2026-08-09 KST  
워크트리: `C:\dev\Samhan-Public\.claude\worktrees\t1141b`  
브랜치: `fix/1141-autoconfirm-suffix-selection`  
기준 HEAD: `cc3ae598e`

## 원인 확정

실제 닫힘 주체는 `<dialog>` 네이티브 동작이나 라우팅이 아니라 공용 Modal의 document-level native keydown 핸들러다.

- `clients/web/design-system/src/components/Modal/Modal.tsx:144-163`
  - `document.addEventListener('keydown', handler)`로 Escape를 전역 수신한다.
  - 최상위 dialog/활성 요소 판정 후 `e.stopPropagation()`, `e.stopImmediatePropagation()`, `onCloseRef.current()`를 호출한다(`:148-160`).
- `clients/web/design-system/src/components/WarehouseAutocomplete/WarehouseAutocomplete.tsx:285-294`
- `clients/web/design-system/src/components/AsyncAutocomplete/AsyncAutocomplete.tsx:549-558`
  - R2의 조합 중 키 조기 반환이 Escape 전파를 막지 않아 document Modal까지 도달했다.

선행 여부도 git으로 확인했다.

- Modal의 Escape 핸들러는 `75f9a6192`(2026-05-04)부터 존재한다.
- Modal의 최상위 dialog 판정과 `stopImmediatePropagation()` 보강은 `6e05ec9f37`로 이번 HEAD 이전이다.
- 조합 중 `Escape`를 키 목록에 추가한 조기 반환은 이번 R2 HEAD `cc3ae598e`에서 추가됐다.

따라서 근본적인 Modal 닫힘 주체는 PR 이전 코드이고, 공용 Modal 전체는 수정하지 않았다. 이번 R3는 두 autocomplete 표면에서만 조합 중 Escape 전파를 차단했다.

## 수정

두 컴포넌트의 keydown에서 조합 상태를 native event와 기존 `isComposingRef`의 OR로 판단한다.

- `Escape`이면 `stopPropagation()`으로 Modal document 핸들러까지 전파하지 않는다.
- 조합 취소가 끝났으므로 `isComposingRef.current = false`로 재설정한다. 이 재설정이 없으면 실 CDP 경로에서 다음 일반 Escape도 영구 소비됐다.
- Arrow/Enter 및 기존 비조합 Escape 동작은 변경하지 않았다.

## RED-A~C 원문

### RED-A — Modal 조상 + 조합 중 Escape

추가 테스트:

- `clients/web/design-system/src/components/WarehouseAutocomplete/WarehouseAutocomplete.test.tsx:521`
- `clients/web/design-system/src/components/AsyncAutocomplete/AsyncAutocomplete.test.tsx:1353`

첫 RED 실행 결과:

```text
Test Files 2 failed
Tests 2 failed | 63 passed (65)
WarehouseAutocomplete: Unable to find role dialog; body was <body><div /></body>
AsyncAutocomplete: Unable to find role dialog; body was <body><div /></body>
```

GREEN 실행 결과:

```text
Test Files 2 passed (2)
Tests 65 passed (65)
```

조합 중 Escape에서 Modal과 input이 모두 남고 입력값 `본가`가 보존됐다.

### RED-B — 조합 중이 아닌 Escape

추가 테스트:

- `clients/web/design-system/src/components/WarehouseAutocomplete/WarehouseAutocomplete.test.tsx:547`
- `clients/web/design-system/src/components/AsyncAutocomplete/AsyncAutocomplete.test.tsx:1383`

RED-A와 같은 최초 실행에서 RED-B는 이미 통과했다.

```text
WarehouseAutocomplete: 조합 중이 아닌 Escape는 입력이 닫힌 모달을 기존대로 닫는다 — passed
AsyncAutocomplete: 조합 중이 아닌 Escape는 입력이 닫힌 모달을 기존대로 닫는다 — passed
```

수정 후에도 두 테스트가 계속 통과하여 불변식 B를 보존했다. Warehouse의 autocomplete dropdown이 열린 일반 Escape를 외부 Modal까지 전달하지 않는 기존 계약도 별도 기존 테스트로 통과했다.

### RED-C — 실 CDP IME 경로

대상 spec: `clients/desktop/playwright/1150-a2-sol-review-real-qa/1150-a2-sol-review-real-qa.spec.ts:256-281`

수정 전 실 CDP RED 원문:

```text
[WAREHOUSE_IME_ESCAPE] {"inputCountAfterEscape":0,"dialogCountAfterCompositionEscape":0,"state":null}
Error: 조합 중 Escape 뒤 창고 input이 제거되지 않음
Expected: 1
Received: 0
```

첫 전파 차단 수정 뒤에는 native probe가 `keydown`, `isComposing:true`, `key:Escape`를 기록했지만 같은 결과가 나왔다. 이에 React event flag만 의존하지 않고 `isComposingRef`를 함께 사용하도록 보강했다.

최종 GREEN 원문:

```text
[WAREHOUSE_IME_ESCAPE] {"inputCountAfterEscape":1,"dialogCountAfterCompositionEscape":1,
  "state":{"value":"HQ-001 · 본본","start":11,"end":11}}
3 passed (9.8s)
```

이 assertion은 합성 `KeyboardEvent`가 아니다. `Input.imeSetComposition`, `Input.insertText`, `page.keyboard.press('Escape')`를 사용했고, native probe에서 `insertCompositionText/isComposing:true`와 `keydown/isComposing:true`를 확인했다.

비조합 RED-C는 모달을 새로 연 뒤 input을 blur하여 autocomplete를 닫고, 실제 `page.keyboard.press('Escape')`로 Modal이 닫히는 경로를 확인했다.

## 회귀·조합 검증

기존 SOL 정상 조건도 함께 통과했다.

- 조합 중 자동확정 차단
- 조합 종료 후 Warehouse suffix selection `10..13`
- 품목 기존 selection `0..1` 보존
- 정상 자동확정 양방향 입력
- 붙여넣기/0ms 연속입력/지우고 재입력
- autocompleteSelection 단위 spec 포함 전체 design-system 회귀

실행 결과:

```text
clients/web/design-system 전체: Test Files 26 passed, Tests 226 passed
clients/desktop 실 CDP spec: 3 passed
```

## 실행 명령과 종료 코드

| 명령 | 종료 코드 | 결과 |
|---|---:|---|
| `npm test -- --run src/components/AsyncAutocomplete/AsyncAutocomplete.test.tsx src/components/WarehouseAutocomplete/WarehouseAutocomplete.test.tsx --reporter=verbose` | 0 | 2 files / 65 tests passed |
| `npm run build` (`clients/web/design-system`) | 0 | production build passed |
| `npm test -- --reporter=dot` (`clients/web/design-system`) | 0 | 26 files / 226 tests passed |
| `playwright ... 1150-a2-sol-review-real-qa.spec.ts` | 0 | 3 tests passed, real CDP IME |
| `git diff --check` | 0 | whitespace 오류 없음 |

## 신규 파일 목록

- `docs/dev-reports/2026-08-09-1150-r3-escape-composition-fix.md` — 본 보고서

이번 라운드에는 새 소스/테스트/QA screenshot 파일을 만들지 않았다. R2 보고서와 `docs/qa/2026-08-09-1150-r2-sol-reconv/`는 작업 시작 전부터 존재한 사용자 산출물이며 그대로 보존했다. build가 갱신한 `clients/web/design-system/dist/`는 생성 산출물이고 git status에 나타나지 않는 ignored 결과다.

## 못 한 것 / 제한

- Codex in-app Browser는 R2와 동일하게 사용할 수 없어 Playwright Chromium/CDP 실 경로로 검증했다.
- R3 전용 새 screenshot/JSON은 만들지 않았다. 기존 SOL spec의 실제 console 원문과 R2 screenshot/JSON을 재사용했다.
- 커밋·push는 하지 않았다.
- 작업 중 초기에 테스트 명령 1회가 실수로 메인 checkout의 `clients/web/design-system`에서 실행됐다. 읽기/테스트만 수행했고 파일 변경은 없었다. 이후 RED/GREEN/빌드/실 CDP 검증은 모두 지정 워크트리 `t1141b`에서 다시 실행했다.
