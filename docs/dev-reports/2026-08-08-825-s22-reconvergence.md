# PR #1120 / 이슈 #825 — S22 재수렴 적대검증 보고서

## 판정

**BLOCK — 도달 결함 2건이다.**

1. **S22-F1 / 100ms 양방향 시간 결함** — 단건 자동확정 뒤 33ms에 친 정상 `Q`는 삼켜지고, 140ms 뒤 같은 `insertText`는 `HQ-001 · 본사창고Q`로 통과했다. 하나의 시간창이 빠른 사용자의 의도 입력과 느리게 도착한 잔여 입력을 구분할 수 없다.
2. **S22-F2 / S20-1 미종결** — 검색 결과 모달 backdrop 취소 뒤 `창`은 실 Chromium에서 300ms 후 다시 빈 값이 됐다. S21의 `draftRef` 추가로 원 결함이 닫히지 않았다.

S21의 구조 전제는 현재 소스에서 확인했다. `STALE_INPUT_GUARD_WINDOW_MS=100`, 신규 ref 4개와 DOM intent handler 4개가 존재한다. 사용자 지시상 `git` 명령을 쓰지 않았으므로 `+74/-5` 수치 자체는 별도 diff로 재계산하지 않았다.

## 실행 경계

- 제품 코드 수정 없음.
- `git` 명령, DB 쓰기, Docker 재기동·재배포 없음.
- Desktop mock 전체 스위트 미실행.
- 관련 `WarehouseAutocomplete` spec, Desktop 소비자 3개 spec, S15 Playwright, typecheck만 실행했다.
- 추가 관측용 Playwright와 Vitest 파일은 임시 생성·실행 후 삭제했다. 최종 신규 파일은 이 보고서 하나다.

## 1차 각도 — S21 fix의 정상 경로와 신규 표면

### S22-F1. 100ms가 정상 키를 삼키고 늦은 suffix를 통과시킨다

#### 재현 절차

1. `/sales/partner-orders`에서 병합전환을 연다.
2. 출고 창고에 `H`를 입력해 `HQ-001 · 본사창고`를 단건 자동확정한다.
3. 자동확정 직후 Playwright `press('Q')`를 실행하고 실제 경과시간과 표시값을 읽는다.
4. 다시 자동확정한 뒤 140ms를 기다려 같은 `press('Q')`를 실행한다.

#### 실측 원문

```text
{"tag":"intentional-key-under-100ms","elapsedMs":33,"value":"HQ-001 · 본사창고"}
{"tag":"insertText-after-140ms","elapsedMsAfterPress":23,"value":"HQ-001 · 본사창고Q"}
```

#### 왜 실 사용자가 밟는가

분당 100타는 평균 글자 간격이 약 100ms이고, 자동확정은 사용자가 별도로 확정 조작을 하지 않아도 첫 검색어가 단건이 되는 순간 발생한다. 사용자는 확정 발생을 기다리지 않고 다음 글자를 친다. 실제 33ms 입력은 확정 라벨 뒤 suffix 조건에 걸려 폐기됐다. 반대로 메인 스레드 부하·렌더 지연으로 동일 `insertText`가 100ms 뒤 도착하면 guard가 이미 꺼져 표시값과 부모 선택값이 갈린다. 두 결과는 같은 이벤트 종류와 같은 값에서 시간만 바꿔 재현됐다.

### 입력 4종

확정 라벨 뒤 입력을 각기 별도 Chromium 이벤트로 밟았다.

```text
일반 키 33ms                         → HQ-001 · 본사창고     (삼킴, FAIL)
paste / insertFromPaste              → HQ-001 · 본사창고Q    (통과)
IME / insertCompositionText          → HQ-001 · 본사창고Q    (통과)
autocomplete / insertReplacementText → HQ-001 · 본사창고Q    (통과)
```

paste·IME·replacement는 S20의 전면 차단에서 벗어났다. 일반 키는 “settled”를 120ms 기다리는 S21 단위 테스트에서만 통과하고 실제 guard 안에서는 막힌다.

### `userInputIntentRef` 수명

change 없는 선행 이벤트 뒤 같은 guard 안에 일반 `insertText`를 넣었다.

```text
{"tag":"stale-intent-paste","value":"HQ-001 · 본사창고Q"}
{"tag":"stale-intent-composition","value":"HQ-001 · 본사창고Q"}
{"tag":"stale-intent-replacement","value":"HQ-001 · 본사창고"}
```

빈 paste와 취소 composition은 플래그를 남겨 다음 일반 input을 사용자 replacement로 통과시켰다. 다만 브리핑의 더 강한 가설인 “그 플래그가 **다음 자동확정** 뒤 잔여 키까지 남는다”는 성립하지 않는다. 다음 자동확정을 일으키는 `handleChange`가 274행에서 플래그를 먼저 끄고 그 뒤 `pick()`과 guard 설정을 수행하기 때문이다. 따라서 이 관측은 S22-F1의 현재 guard 오분류 표면이지만 별도 BLOCK으로 세지 않았다. replacement의 합성 `beforeinput`만으로는 이 Chromium/React 경로에서 플래그가 남는 것을 재현하지 못했다.

### `draftRef` 이중 진실원

부모가 포커스 중 `value="hq"`를 `value="vh"`로 rerender했을 때 다음을 확인했다.

```text
{"tag":"external-value-rerender","visible":"검색중","externalValue":"vh"}
```

즉 외부 prop과 `draftRef`/표시값은 blur 전까지 어긋날 수 있다. 그러나 현재 제품 소비자 5곳을 추적한 결과 선택값 변경은 이 컴포넌트의 `onChange` 또는 닫히며 unmount되는 reset 경로였고, 포커스 중 외부에서 다른 창고를 주입하는 현재 화면 진입점은 찾지 못했다. 내부 `onChange` 선택은 `pick()`이 `draftRef`를 함께 갱신하며, 모달 확정도 아래 실 Chromium에서 300ms 동안 라벨을 유지했다. 따라서 이 라운드의 사용자 도달 결함으로 집계하지 않는다.

### 타이머 정리

자동확정 뒤 unmount하고 fake timer 큐를 읽었다.

```text
{"tag":"guard-timer-unmount","beforeUnmount":1,"afterUnmount":1,"afterAdvance":0}
```

`useEffect` cleanup이 없어 화면을 떠난 뒤 100ms 콜백이 실제 실행된다. 콜백은 unmount된 ref 두 개만 쓰고 state·DOM·부모 callback을 건드리지 않아 현재 사용자 결과에는 도달하지 않았다. 별도 BLOCK으로 세지 않는다.

### `pick()`의 `lastTypedDraftRef=label`

자동확정·dropdown Enter·모달 명시확정은 모두 선택 라벨을 넣는다. 이후 취소 가능한 검색 모달을 다시 열려면 먼저 `handleChange`를 지나며 이때 `lastTypedDraftRef`가 새 검색어로 덮인다. 명시확정 직후에는 라벨이 focus 복원용으로 사용됐다. 사용자가 친 적 없는 라벨이 이후 취소 검색어로 복원되는 도달 경로는 재현되지 않았다.

## 2차 각도 — S20 원 결함 2건

### S22-F2. backdrop 취소 후 300ms에 `창`이 소실된다

#### 재현 절차

1. 병합전환 출고 창고에 `창`을 입력해 2건 이상 후보 모달을 연다.
2. `ds-modal-backdrop`을 클릭한다.
3. 300ms 기다린 뒤 input, dropdown, 바깥 모달을 읽는다.

#### 실측 원문

```text
{"tag":"backdrop-300ms","value":"","expanded":"false","outerVisible":true}
```

#### 원인

S21은 blur timer가 최신 `draftRef`를 읽게 했지만, 최신 값 `창`은 빈 값이 아니다. 따라서 219행의 빈 값 보존 분기가 아니라 242~245행의 “exact 아님” 분기로 가서 `draftRef`와 `draft`를 `selectedLabel`로 덮는다. 미확정 상태의 `selectedLabel`은 빈 문자열이다.

#### 왜 실 사용자가 밟는가

2건 이상 후보가 나열된 모달에서 backdrop 클릭은 기본 취소 조작이다. 별도 후속 입력 없이 0.3초 뒤 검색어가 사라진다. 이는 자동확정 엣지가 아니라 원 기능의 “2건 이상 모달 나열 후 취소·복원” 경로다.

### S20의 확정 라벨 suffix 불일치

S21은 paste·IME·replacement를 통과시켰지만 일반 키를 시간으로 양분했다. 33ms에서는 suffix가 붙지 않아 내부/표시 불일치는 막지만 정상 입력을 잃고, 140ms에서는 `…본사창고Q`가 다시 나타난다. 따라서 원 결함은 안정적으로 닫힌 것이 아니라 S22-F1의 시간 의존 상태로 바뀌었다.

## 3차 각도 — 회귀 울타리

| 동작 | S22 결과 |
|---|---|
| Escape 첫 회 dropdown만 · 두 번째 바깥 모달 | 통과 — `outerVisible:true/false`, 첫 회 `expanded:false` |
| 취소 버튼 후 `창` 보존 300ms · dropdown 닫힘 | 통과 — `value:"창"`, `expanded:false` |
| 취소 후 검색어 편집 시 후보 모달 재개방 | 통과 — `selectionVisible:true` |
| 미확정 발행 disabled · POST 0건 | 통과 — S15 관련 Playwright assertion 포함 4/4 |
| `Ctrl+A` 후 `HQ` 자동확정 · `…본사창고Q` 아님 | 통과 — S15 관련 Playwright |
| 결재자·은행거래 Enter 확정 · UUID 비노출 | 통과 — S15 관련 Playwright |
| `resultSelectionMode` 미지정 dropdown Enter | 통과 — 수금계획 S15 Playwright |
| 명시확정 후 300ms 표시값 유지 · dropdown 닫힘 | 통과 — `CS-001 · 거래처 위탁창고`, `expanded:false` |
| backdrop 취소 후 300ms `창` 보존 | **실패 — S22-F2** |

실측 원문:

```text
{"tag":"cancel-button-300ms","value":"창","expanded":"false"}
{"tag":"cancel-edit-reopen","selectionVisible":true}
{"tag":"explicit-confirm-300ms","value":"CS-001 · 거래처 위탁창고","expanded":"false"}
{"tag":"escape-first","outerVisible":true,"expanded":"false"}
{"tag":"escape-second","outerVisible":false}
```

## 4차 각도 — 증거 무결성

S21의 수치는 같은 좁은 명령으로 재현됐다.

```text
clients/web/design-system
npm test -- --run src/components/WarehouseAutocomplete/WarehouseAutocomplete.test.tsx
Test Files 1 passed (1)
Tests      20 passed (20)
Exit code  0

clients/desktop
npm test -- --run src/renderer/routes/components/MergeConvertDialog.test.tsx src/renderer/routes/SalesPartnerOrderDetailPage.coedit.test.tsx src/renderer/routes/SlipFormPage.test.tsx
Test Files 3 passed (3)
Tests      128 passed (128)
Exit code  0

clients/desktop
npm run typecheck
cleanup scope 2 passed, 0 failed
real-QA scope 50 passed, 0 failed
Exit code 0

clients/web/design-system
npm exec tsc -- --noEmit -p tsconfig.json
Exit code 0
```

회귀 울타리의 S15 Playwright도 같은 명령에서 `4 passed`, exit 0이었다.

증거 무결성 예외로 기록한다. S21의 `20/20`과 `128/128`, `50/50` 수치 자체는 참이지만 “backdrop 300ms 보존” 결론은 실 Chromium 원문과 모순된다. 단위 spec은 `20/20` 중 해당 이름까지 통과했으나, 같은 현재 소스의 Chromium 결과는 `value:""`였다.

## 5차 각도 — 수렴 판정

### 판정: 발산

근거는 결함 수가 아니라 상태와 구분 불가능성이 늘어난 방식이다.

- fix 크기가 S17 10줄 → S19 13줄 → S21 74줄로 증가했다.
- S21은 ref 4개, timer 1개, DOM 전구 이벤트 4개를 추가했지만 S20의 backdrop 원 결함은 그대로 남았다.
- 같은 일반 `insertText`를 오직 100ms 경계로만 나눠 33ms 사용자 입력은 버리고 140ms suffix는 통과시킨다. 상태를 더해도 이벤트의 원인을 관측할 정보가 없다.
- cross-event intent flag는 change가 없으면 남고, unmount 뒤 timer도 남으며, 외부 prop과 draft mirror도 동기화 지점이 따로다. 닫는 결함마다 수명 조합이 늘어났다.

따라서 S21은 원 기능을 향해 결함 표면이 줄어드는 수렴이 아니라, 자동확정 후 브라우저 이벤트를 ref와 시간으로 추정하면서 새 상태공간을 만드는 발산이다.

### 없앨 수 있는 ref 관측

- **`userInputIntentRef`는 현재 관측한 Chromium 경로에서 없앨 수 있다.** 실제 change/input 이벤트의 `nativeEvent.inputType` 자체가 `insertFromPaste`, `insertCompositionText`, `insertReplacementText`를 전달하며 `isUserReplacement`가 이미 세 값을 직접 검사한다. 이 ref가 추가로 만든 것은 선행 paste/composition/beforeinput의 의도를 다음 change로 넘기는 cross-event 수명이다. S21 단위 helper가 `paste` 뒤 inputType 없는 generic `change`를 보내기 때문에 테스트에서는 필요해졌지만, 실 Chromium의 같은 이벤트에는 중복이다.
- `staleInputGuardRef`와 `staleInputGuardTimerRef`는 현재 100ms 알고리즘 안에서는 한 쌍이라 하나만 독립 제거할 수 없었다.
- `draftRef`는 120ms blur callback의 최신 draft를 읽는 역할이 있어 현재 구조에서 단독 제거 가능한 것으로 관측되지 않았다. 다만 외부 `value`와 자동 동기화되는 진실원은 아니다.

### 남은 결함의 범위 분리

- **원 기능에 닿음:** S22-F2. 2건 이상 모달 나열 → backdrop 취소 → 검색어 복원 경로다. 복수 후보 나열·단수 강제 계약의 취소 축에 직접 닿는다. 복수선택 자체와 명시확정은 이번 회귀에서 깨지지 않았다.
- **자동확정 엣지:** S22-F1. 단건 자동확정 직후 키 도착 시점과 suffix guard의 문제다.
- **현재 사용자 도달로 집계하지 않은 구조 관측:** 외부 `value` rerender와 draft mirror 불일치, unmount 뒤 timer 실행, change 없는 intent flag 수명이다.

## 이 라운드가 보지 않은 것

- Desktop mock 전체 스위트와 다른 모든 `WarehouseAutocomplete` 소비 화면의 E2E는 실행하지 않았다.
- 실제 OS 한글 후보창·브라우저 비밀번호 관리자·서드파티 autocomplete UI는 사용하지 않았다. Chromium `InputEvent`의 각 inputType을 직접 전달해 컴포넌트 경계를 밟았다.
- 메인 스레드에 인위적 CPU 부하를 걸어 브라우저가 잔여 이벤트를 자연 발생시키는 실험은 하지 않았다. 동일 `insertText`를 33ms와 140ms에 직접 입력해 시간 경계의 양쪽 결과를 측정했다.
- DB, API, Docker, 배포 환경은 보지 않았다.

## 신규 파일 목록

- `docs/dev-reports/2026-08-08-825-s22-reconvergence.md`
