# PR #1120 / 이슈 #825 — S23 범위 축소 fix 라운드

## 판정

S22-F2를 최소 수정으로 닫고, S22가 발산으로 판정한 자동확정 잔여 키 장치를 제거했다.

- backdrop 취소 뒤 300ms에도 미확정 검색어 `창`을 보존한다.
- 일반 타이핑·붙여넣기·한글 IME·자동완성 replacement를 시간창으로 분기하지 않는다.
- `HQ-001 · 본사 창고Q`는 #1141로 분리된 알려진 동작이며 이번 라운드에서 막지 않았다.
- 저장 게이트는 내부 `value`와 `onChange` 계약을 그대로 사용한다. 표시 draft가 남아도 미확정 `onChange`는 발생하지 않는다.

## RED-A 원문

S21 코드에서 backdrop 취소 후 blur timer를 직접 예약하는 최소 재현을 먼저 추가했다.

```text
× backdrop 취소가 예약한 blur에서도 미확정 draft를 보존한다
  → expected '' to be '창' // Object.is equality

Tests 21 | 2 failed | 19 passed
```

두 번째 실패는 S21이 만든 잔여 키 차단 단정이었다.

```text
× 알려진 동작: 자동확정 직후 이어진 키가 라벨 뒤에 붙는다 (#1141)
  → expected 'HQ-001 · 본사 창고Q' to be 'HQ-001 · 본사 창고'
```

이는 #1141 동작을 이번 fix에서 되살려 막으면 안 된다는 확인으로, GREEN에서는 `HQ-001 · 본사 창고Q`를 알려진 동작으로 유지했다.

## RED-B 원문

S22 실 Chromium 원문에서 확인된 양방향 RED는 다음과 같다.

```text
{"tag":"backdrop-300ms","value":"","expanded":"false","outerVisible":true}
```

회귀 울타리의 S22 원문은 다음과 같다.

```text
{"tag":"cancel-button-300ms","value":"창","expanded":"false"}
{"tag":"cancel-edit-reopen","selectionVisible":true}
{"tag":"explicit-confirm-300ms","value":"CS-001 · 거래처 위탁창고","expanded":"false"}
{"tag":"escape-first","outerVisible":true,"expanded":"false"}
{"tag":"escape-second","outerVisible":false}
```

## 변경

### 남긴 상태와 필요한 이유

- `draft` state — 포커스 중 검색어를 렌더링하는 표시값이다.
- `blurTimer` — 후보 option의 mouse 이벤트가 blur보다 먼저 처리되도록 기존 120ms 지연을 유지한다.
- `preserveDraftOnNextFocusRef` — 검색 모달 취소/확정 후 Modal cleanup이 복원한 focus에서 dropdown을 재개방하지 않고 draft/확정 라벨을 표시한다.
- `lastTypedDraftRef` — 지연 blur callback이 렌더 시점의 낡은 draft가 아니라 최신 사용자 검색어를 읽게 한다.
- `selectedWarehouse`·`selectedLabel` — 내부 선택값과 화면 라벨을 계산하고, 확정 상태의 표시/저장 경계를 유지한다.

### 거둔 것

- `STALE_INPUT_GUARD_WINDOW_MS` 100ms 시간창
- `staleInputGuardRef`
- `staleInputGuardTimerRef`
- `userInputIntentRef`
- S21에서 추가한 `draftRef`
- `onPaste` 핸들러
- `onCompositionStart` 핸들러
- `onBeforeInput` 핸들러
- `onInput` 핸들러
- `nativeEvent.inputType` 기반 `isUserReplacement` 분기
- 자동확정 뒤 stale guard를 켜고 100ms 뒤 끄는 timer 예약

backdrop blur의 non-exact 분기는 `preserveDraftOnNextFocusRef`가 살아 있는 취소/복원 경로에서 draft를 덮어쓰지 않도록 했다. 그 밖의 일반 blur는 기존처럼 선택 라벨로 복원하며, 미확정 입력을 부모 `onChange`로 저장하지 않는다.

## RED-B 9항목 동시 GREEN

| 울타리 | 결과 | 근거 |
|---|---|---|
| 취소 버튼 후 `창` 300ms 보존·dropdown 닫힘 | GREEN | S15 Playwright 1번 + 컴포넌트 test |
| 취소 후 `창`→`x`→Backspace→`창` 후보 모달 재개방 | GREEN | S15 Playwright 1번 |
| Escape 첫 회 dropdown만, 두 번째 회 바깥 모달까지 | GREEN | S15 Playwright 1번 |
| 미확정 발행 disabled·POST 0건 | GREEN | S15 Playwright 1번 |
| Ctrl+A 후 `HQ` 자동확정 | GREEN | S15 Playwright 1번 |
| 결재자·은행거래 Enter 확정·UUID 비노출 | GREEN | S15 Playwright 2·3번 |
| `resultSelectionMode` 미지정 dropdown Enter | GREEN | S15 Playwright 4번 |
| 명시확정 후 300ms 표시값 유지·dropdown 닫힘 | GREEN | S15 Playwright 1번 + 컴포넌트 test |
| 원 결함 무재발: CS-001 표시값 소실·dropdown 재개방 없음 | GREEN | S15 Playwright 1번 |

## 동시 GREEN 원문

```text
clients/web/design-system
npm exec vitest run src/components/WarehouseAutocomplete/WarehouseAutocomplete.test.tsx
Exit code: 0
Tests 21 | 21 passed | 0 failed

clients/desktop
npx playwright test playwright/825-s15-final-reconvergence/825-s15-final-reconvergence.spec.ts --reporter=line
Exit code: 0
4 passed (9.2s)

npm exec vitest run \
  src/renderer/routes/components/MergeConvertDialog.test.tsx \
  src/renderer/routes/SalesPartnerOrderDetailPage.coedit.test.tsx \
  src/renderer/routes/SlipFormPage.test.tsx
Exit code: 0
3 files, 128 tests passed, 0 failed

clients/web/design-system
npm run build
Exit code: 0

npm run typecheck
Exit code: 0

clients/desktop
npm run typecheck
Exit code: 0
real-QA scope: 50 passed, 0 failed
```

Desktop typecheck 첫 실행은 변경된 design-system 소스보다 `dist/index.d.ts`가 오래되어 freshness guard에서 중단됐다. 안내된 design-system build 후 재실행하여 exit 0을 확인했다. build의 기존 폰트 unresolved 경고는 TypeScript/테스트 실패가 아니다.

## 제거 식별자 전수 확인

WarehouseAutocomplete 범위와 Desktop 소스/Playwright 범위에서 각각 검색했다. 각 명령은 일치 없음으로 `rg` 자체 exit code 1, 출력 없음이었다.

```text
rg -n "STALE_INPUT_GUARD_WINDOW_MS|staleInputGuard|userInputIntentRef|draftRef" \
  clients/web/design-system/src/components/WarehouseAutocomplete
Exit code: 1

rg -n "onPaste=|onCompositionStart=|onBeforeInput=|onInput=" \
  clients/web/design-system/src/components/WarehouseAutocomplete
Exit code: 1

rg -n "STALE_INPUT_GUARD_WINDOW_MS|staleInputGuard|userInputIntentRef" \
  clients/desktop/src clients/desktop/playwright \
  --glob '*.ts' --glob '*.tsx' --glob '*.spec.ts' \
  --glob '!clients/desktop/playwright/825-s15-final-reconvergence/**'
Exit code: 1
```

마지막 검색에서 `onInputCommitChange`, `onInputBlur`, 다른 컴포넌트의 일반 `onInput`/`onCompositionStart` 식별자는 이번 제거 대상이 아니므로 제거 판정에 포함하지 않았다.

## 바뀐 파일을 참조하는 테스트 전부

- `clients/web/design-system/src/components/WarehouseAutocomplete/WarehouseAutocomplete.test.tsx` — 21/21
- `clients/desktop/src/renderer/routes/components/MergeConvertDialog.test.tsx` — 9/9
- `clients/desktop/src/renderer/routes/SalesPartnerOrderDetailPage.coedit.test.tsx` — 20/20
- `clients/desktop/src/renderer/routes/SlipFormPage.test.tsx` — 99/99
- `clients/desktop/playwright/825-s15-final-reconvergence/825-s15-final-reconvergence.spec.ts` — 4/4

`clients/desktop/playwright/825-s15-final-reconvergence/`는 실행만 했고 변경/커밋 대상으로 다루지 않았다. Desktop mock 전체 스위트, Docker 재기동, DB 쓰기, 배포는 수행하지 않았다.

## 최종 diff 규모

S21 커밋의 `+74/-5` 구현 diff를 기준으로 이번 라운드 적용 hunk을 수동 계수했다(보고서 신규 파일 제외).

```text
WarehouseAutocomplete.tsx       +3 / -70
WarehouseAutocomplete.test.tsx  +18 / -11
S21 대비 합계                    +21 / -81
```

## 신규 파일 목록

```text
docs/dev-reports/2026-08-08-825-s23-scope-reduction.md
```
