# D-G1 S3 SOL 5.6 재검토 4 — scroll-close 사용성·gate 감도

> 대상: PR #1168, HEAD `5b491ec2ecdb7693b69855ce8b9c31bacbc8854b`
> 검토일: 2026-08-11
> 판정: **차단 — 외부 1px scroll 뒤 focus가 남은 검색 input을 마우스로 재클릭해도 dropdown을 재열 수 없는 결함 1건**
> 공유 DB: 조회·write 모두 0건
> git 조작: checkout/add/commit/push/merge 모두 0건
> 후속: **#1169(D-G7) rebase 시작 불가**

## 1. 판정 요약

이번 fix의 주효과와 새 gate의 감도는 확인됐다.

- dropdown 자체 wheel scroll은 닫히지 않았다. 실제 `scrollTop 0→21`, document와 `main.app-main`은 움직이지 않았고, 목록은 열린 채 유지되어 하단 항목을 선택할 수 있었다.
- 실제 window와 실제 `main.app-main` overflow scroll 모두 첫 rAF에서 `closed:true`였다.
- scroll-close를 직전 위치갱신 handler로 되돌린 source mutation은 두 실제 owner에서 모두 첫 rAF RED가 났다. 세 번째 false-green은 아니다.
- 외부 scroll 뒤 검색어 `2026/`와 후보 7건은 React state에 남았다. `ArrowDown`은 즉시 7건을 재열었다.
- Chromium-1217 live spec은 fresh `6 passed`, 별도 SOL probe는 `2 passed`였다.

그러나 외부 scroll은 검색 input의 focus를 제거하지 않는다. 1px만 움직여도 dropdown은 닫히지만 input은 계속 focus 상태다. 이때 마우스로 같은 input을 다시 클릭해도 `focus` 이벤트가 다시 발생하지 않으므로 `handleFocus()`가 호출되지 않고 목록이 계속 닫혀 있다. 기존 live test의 “재열기”는 검색어를 `2026/ → 2026 → 2026/`로 바꿔 새 검색을 강제로 발생시킨 것이어서 이 정상 마우스 경로를 보지 않았다.

## 2. 차단 결함 F-1 — 1px scroll 뒤 마우스로 검색 결과를 재열 수 없다

### 불변식

외부 scroll 시 dropdown을 닫는 정책을 유지하더라도 다음은 성립해야 한다.

1. 검색어는 보존한다.
2. 사용자가 검색어를 다시 입력하지 않고 검색 input을 클릭하면 기존 유효 후보를 재열 수 있다.
3. keyboard 사용자는 `ArrowDown`으로 재열 수 있어야 한다.
4. dropdown 자체를 scroll하는 동안은 닫지 않고 긴 목록의 하단 항목을 선택할 수 있어야 한다.

현재 1·3·4는 성립하지만, mouse-only 경로인 2가 성립하지 않는다. 1~2px 터치패드 관성에도 동일하므로 “목록을 닫는다”는 기능 축소가 검색 재입력 또는 blur/refocus를 사용자에게 강요한다.

### 코드 좌표 전수

- `clients/desktop/src/renderer/components/groupware/DocumentReferencePicker.tsx:119-134`
  - `query`, `options`, `open`, `dropdownPosition`이 별도 state다. scroll-close는 query/options를 지우지 않는다.
- 같은 파일 `:169-178`
  - `closeDropdownOnScroll()`이 portal을 즉시 숨기고 `flushSync`로 position/open만 닫는다. 이동량 threshold는 없어 1px도 닫힌다.
- 같은 파일 `:180-213`
  - listener는 `window`와 picker의 overflow 조상에만 붙는다. body portal인 dropdown 자체에는 붙지 않아 내부 scroll은 보존된다.
- 같은 파일 `:346-367`
  - 후보 재열기는 `handleFocus()`에 있다. 이미 focus된 input을 다시 클릭하면 이 callback이 재실행되지 않는다.
- 같은 파일 `:384-414`
  - `ArrowDown`은 `options.length > 0`이면 `open=true`로 재열어, 후보가 실제로 보존됐음을 확인할 수 있다.
- 같은 파일 `:450-467`
  - 검색 input에는 `onFocus`, `onBlur`, `onKeyDown`만 있고, focus가 유지된 mouse click/pointer 경로의 재열기 handler가 없다.
- `clients/desktop/playwright/2026-08-11-dg1-s3-fix/s3-fix-live.spec.ts:471-474,493-496,510-513`
  - 기존 “재열기”는 매번 `fill('2026')` 뒤 `fill('2026/')`로 query를 변경해 새 검색을 강제한다. 검색어를 그대로 둔 재클릭을 검증하지 않는다.

### 재현 데이터

```text
브라우저     Playwright chromium-1217 / headless
URL          http://127.0.0.1:5193/?mockRole=MASTER#/groupware/approvals/new
viewport     1280×1000
결재 유형    지출결의서
참조 유형    JOURNAL
검색어       2026/
검색 후보    7건
조작         body sentinel로 실제 window range 확보 → window.scrollBy(0, 1)
측정         첫 rAF 뒤 DOM/focus/query → 같은 focus input click → 500ms 뒤 DOM
```

원문:

```text
SOL_R4_ONE_PX_CLOSED={
  "scrollY":1,
  "listboxCount":0,
  "activeTestId":"doc-ref-search-input",
  "query":"2026/",
  "beforeCount":7
}

SOL_R4_RECLICK={
  "listboxCount":0,
  "activeTestId":"doc-ref-search-input"
}

SOL_R4_KEYBOARD_REOPEN={
  "count":7,
  "query":"2026/"
}
```

[02-one-pixel-scroll-closed-query-preserved.png](../qa/2026-08-11-dg1-s3-r4/02-one-pixel-scroll-closed-query-preserved.png)와 [03-focused-input-reclick-still-closed.png](../qa/2026-08-11-dg1-s3-r4/03-focused-input-reclick-still-closed.png)은 같은 검색어와 focus outline을 유지하지만 목록이 닫힌 동일 상태다. [04-keyboard-reopen.png](../qa/2026-08-11-dg1-s3-r4/04-keyboard-reopen.png)은 같은 state에서 `ArrowDown`만으로 7건이 재출현함을 보여 준다.

## 3. 첫 각도 반대 검증 — dropdown 자체 scroll은 PASS

1280×480에서 JOURNAL 7건 목록을 실제 mouse wheel로 scroll했다.

```text
SOL_R4_INTERNAL_SCROLL={
  "before":{
    "scrollTop":0,
    "scrollHeight":259,
    "clientHeight":238,
    "windowY":371,
    "mainTop":0,
    "activeIsInput":true
  },
  "after":{
    "scrollTop":21,
    "scrollHeight":259,
    "clientHeight":238,
    "windowY":371,
    "mainTop":0,
    "visible":true
  },
  "optionCount":7,
  "query":"2026/"
}
```

- dropdown 내부만 `0→21`로 움직였다.
- window와 main 좌표는 불변이었다.
- listbox는 visible 상태를 유지했다.
- scroll 뒤 마지막 option을 실제 click해 attachment chip 1개 생성을 확인했다.

[01-dropdown-internal-scroll-open.png](../qa/2026-08-11-dg1-s3-r4/01-dropdown-internal-scroll-open.png)에 내부 scrollbar와 하단 후보가 열린 상태가 남아 있다. 따라서 “긴 목록을 못 쓴다”는 우려 자체는 결함으로 재현되지 않았다.

## 4. 두 번째 각도 — 새 first-rAF gate의 mutation 감도

production source의 두 scroll listener를 검토 중에만 `closeDropdownOnScroll`에서 직전 구현인 `handleViewportChange`로 바꿨다. 두 probe 뒤 즉시 원복했고 최종 source diff가 0임을 확인했다.

### 실제 window/document owner — RED

```text
WINDOW_SCROLL_FIRST_PAINT={
  "before":{"closed":false,"aligned":true,"gap":4,"scrollY":0,"scrollOwner":"HTML","scrollTop":0,"maxScrollTop":160},
  "frame1":{"closed":false,"aligned":false,"gap":-374.4375,"scrollY":80},
  "frame2":{"closed":false,"aligned":true,"gap":4,"scrollY":80},
  "events":["scroll","raf1","raf2"]
}

Expected frames.frame1.closed || frames.frame1.aligned: true
Received: false
s3-fix-live.spec.ts:469
1 failed
```

### 실제 `main.app-main` overflow owner — RED

```text
CONTAINER_SCROLL_FIRST_PAINT={
  "frame1":{"closed":false,"aligned":false,"gap":0,"scrollTop":80},
  "frame2":{"closed":false,"aligned":true,"gap":4,"scrollTop":80},
  "scrollHeight":1086,
  "clientHeight":480
}

Expected containerFrames.frame1.closed || containerFrames.frame1.aligned: true
Received: false
s3-fix-live.spec.ts:353
1 failed
```

두 케이스 모두 scroll 값이 실제로 변했고 첫 rAF만 RED, 두 번째 rAF는 정렬 회복이다. 이전 `4px → 84px → 4px` 결함과 같은 paint 경계를 잡는다. 따라서 새 테스트는 움직이지 않는 컨테이너나 두 번째 frame만 보는 false-green이 아니다.

## 5. 구현자 지시서

### RED-A 표적

1. 실제 `window/document.scrollingElement`와 실제 `main.app-main` overflow owner 각각에서 1px·2px scroll을 만든다.
2. 첫 rAF에 dropdown이 닫혔고 실제 scroll 값이 변했음을 단언한다.
3. query가 그대로이고 `document.activeElement`가 검색 input인 상태에서 **query 변경 없이 같은 input을 mouse click**한다.
4. click 뒤 기존 유효 options가 visible·hit-test 가능한 상태로 재열림을 단언한다. 검색어를 지웠다 다시 쓰거나 blur를 인위적으로 만들면 이 RED-A를 충족하지 않는다.
5. `ArrowDown` 재열기와 mouse 재열기 모두 같은 후보 수·검색어를 유지해야 한다.
6. dropdown 자체 wheel/touch scroll은 listbox `scrollTop`이 실제로 증가하고 open/query/options가 유지되며 하단 option 실제 click이 가능해야 한다.
7. scroll-close를 위치갱신/no-op으로 되돌리면 window와 main first-rAF test가 모두 RED여야 한다.

권장 수정 표면은 이미 focus된 input의 click/pointer 재진입이다. 기존 `options.length > 0`일 때만 재열어 빈 결과를 거짓으로 열지 말고, blur/refocus debounce나 새 API 요청을 강제하지 않는 최소 변경을 우선 검토한다.

### RED-B 표적

- 실제 window/main first rAF `closed || aligned` gate를 그대로 유지한다.
- 빠른 20px×6, scroll+resize, scroll 중 option click, 1280×480 flip-up, 480×640 신규 open을 유지한다.
- 7유형 전부 `inViewport:true`, `optionContainsHit:true` 중앙 hit-test를 유지한다.
- portal 되돌림은 계속 `inViewport:false`, `optionContainsHit:false` RED여야 한다.
- 기존 6종 label/href exact, 정산서 plain text, 검색·선택 계약을 유지한다.
- desktop 전체 Vitest/typecheck/lint, accounting 1,867, groupware 254, V19 기존 데이터, refDocNo POST→GET 왕복을 유지한다.
- S4 route를 당겨 만들지 않는다.

### 반드시 지킬 중단 조건

**제 전제가 틀렸다면 고치지 말고 중단·보고하십시오.** 특히 이미 focus된 input click이 운영 브라우저에서 실제 `focus`를 다시 발생시킨다고 판단하거나 mouse-only 재열기가 제품 요구가 아니라고 판단한다면, 추측으로 코드를 바꾸지 말고 Chromium event log 또는 명시적 UX 결정으로 반증해야 한다.

### 새 조합

| 축 | 추가할 조합 |
|---|---|
| scroll owner | 실제 window/document / 실제 main overflow / dropdown 자체 |
| 이동량 | 1px / 2px / 20px×6 / 80px |
| input 상태 | focus 유지 / blur 후 refocus |
| 재진입 | 동일 input mouse click / ArrowDown / query 변경 없음 |
| 결과 수 | 0건 / 1건 / 여러 건+내부 scroll |
| 폭·방향 | 1280 below / 1280 flip-up / 480 |
| 동시 이벤트 | scroll+resize / scroll 중 option click / 관성 scroll 직후 input click |

## 6. 검증 결과

| 검증 | 결과 |
|---|---|
| Chromium-1217 기존 live spec | `6 passed (14.0s)` |
| SOL R4 내부 scroll + 1px/reopen probe | `2 passed (4.1s)`; probe assertion 자체는 관측 계약 확인용 |
| scroll-close→위치갱신 mutation, window | 예상대로 `1 failed`; first rAF `closed:false, aligned:false` |
| 같은 mutation, main overflow | 예상대로 `1 failed`; `scrollTop=80`, first rAF `closed:false, aligned:false` |
| 원복 후 desktop 전체 Vitest | exit `0` (56.4s) |
| desktop typecheck | exit `0` |
| desktop lint | exit `0`, 기존 161 warnings / errors 0 |
| 최종 working-tree `git diff --check` | exit `0` |

첫 전체 Vitest 병렬 실행은 임시 SOL probe의 직접 QA 경로 상수가 하네스 규칙을 위반해 2건 실패했다. 제품 assertion 실패가 아니며, 임시 probe 제거 후 전체 Vitest를 단독 fresh 재실행해 exit 0을 확인했다. 이 검증 오염은 공식 결함 수에 넣지 않는다.

## 7. 스크린샷

| 파일 | 내용 | SHA-256 |
|---|---|---|
| [01-dropdown-internal-scroll-open.png](../qa/2026-08-11-dg1-s3-r4/01-dropdown-internal-scroll-open.png) | dropdown 자체 실제 wheel scroll 후에도 열린 긴 목록 | `64F3687A3D842673A01053BE102512F1E84193840BEB3420A3E9AA9D53336C1B` |
| [02-one-pixel-scroll-closed-query-preserved.png](../qa/2026-08-11-dg1-s3-r4/02-one-pixel-scroll-closed-query-preserved.png) | 1px 외부 scroll 뒤 query/focus 보존, dropdown 닫힘 | `64F5249691EF6186B296EF2B1A939AB21659B9B5805511C9A9F8BF2E08BCA93F` |
| [03-focused-input-reclick-still-closed.png](../qa/2026-08-11-dg1-s3-r4/03-focused-input-reclick-still-closed.png) | 같은 focus input 재클릭 500ms 뒤에도 닫힘 | `C467A8F06361FA770887E1383DD4B15BECEBD04389B248D51CE58BBD30FE48CD` |
| [04-keyboard-reopen.png](../qa/2026-08-11-dg1-s3-r4/04-keyboard-reopen.png) | 같은 query/options에서 ArrowDown 즉시 재열림 | `BF6F93761BA2169C724D8A5011B140614305D3A5040140099F4B9F3EC31F2CD8` |

## 8. 범위·프로세스 정리

- 기존 5193 Vite(PID 71632)를 사용했고 유지했다. 새 QA 서버와 5293 listener는 만들지 않았다.
- 공유 DB 조회·write, 실 API 호출, container 생성은 수행하지 않았다.
- source mutation과 임시 Playwright probe는 제거·원복했다. 최종 산출물은 이 보고서와 `docs/qa/2026-08-11-dg1-s3-r4/` 4장뿐이다.
- 이번 round가 직접 밟지 않은 표면은 실제 Electron shell의 OS-level precision touchpad inertia, touch device momentum scroll, mobile soft keyboard/`visualViewport` 동시 변화다. 현재 결함은 headless Chromium의 실제 scroll/focus/click 이벤트만으로 재현되어 이 공백과 무관하게 차단한다.

현재 판정은 **머지·#1169 rebase 보류**다. F-1 수정 제출 후 같은 1px focus-retained mouse 재클릭과 first-rAF mutation으로 재검토해야 한다.
