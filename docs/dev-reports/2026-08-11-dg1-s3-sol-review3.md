# D-G1 S3 SOL 5.6 재검토 3 — portal dropdown 가시성

> 대상: PR #1168, HEAD `95484e2140d1c6c485142affaa899bbd098c2056`  
> 검토일: 2026-08-11  
> 판정: **차단 — 실제 window scroll 첫 paint에서 anchor와 dropdown이 분리되는 결함 1건**  
> 공유 DB: 조회·write 모두 0건  
> git 조작: checkout/add/commit/push/merge 모두 0건  
> 후속: **#1169(D-G7) rebase 시작 불가**

## 1. 판정 요약

body portal과 가시성 gate의 주효과는 확인됐다.

- Chromium-1217 기존 live QA는 `5 passed`였고 7유형 모두 `inViewport:true`, `optionContainsHit:true`였다.
- portal을 실제 DOM에서 picker 자식 `position:absolute`로 되돌린 뮤테이션은 즉시 RED가 났다. gate는 장식이 아니다.
- 1280×480 하단 flip-up, 480×640 신규 open, 0건/여러 건, 비관련 3개 route의 document scroll·resize는 통과했다.
- 기존 6종 인쇄·상세 라벨과 6개 href 계약은 exact 값으로 유지됐다.

그러나 구현자 scroll test는 실제 scroll owner를 움직이지 않았다. 이 앱의 `.app-main`은 `overflow:auto`지만
콘텐츠 높이만큼 grid item 자체가 늘어나는 route가 많아 실제 스크롤은 `document.scrollingElement/window`에서 일어난다.
실제 window를 스크롤하면 fixed dropdown 좌표 갱신이 한 paint 늦어져, 사용자에게 anchor와 목록이 분리된 프레임이 보인다.

## 2. 차단 결함 F-1 — 실제 window scroll 첫 paint에서 dropdown이 80px 떠 있다

### 불변식

dropdown을 연 채 사용자가 뒤 화면을 스크롤할 때 다음 중 하나가 **첫 paint 이전**에 성립해야 한다.

1. dropdown이 닫힌다.
2. dropdown이 anchor와 같은 프레임에 재배치된다.

입력창과 목록이 서로 다른 좌표계처럼 보이는 paint가 한 프레임이라도 있으면 안 된다. 이 요구는 이번 재검토 지시의
“입력창과 목록이 분리돼 붕 뜨는 순간이 없는지”를 그대로 계측한 것이다.

### 코드 좌표

- `clients/desktop/src/renderer/components/groupware/DocumentReferencePicker.tsx:137`
  - `updateDropdownPosition()`이 `getBoundingClientRect()`를 읽고 React state를 갱신한다.
- 같은 파일 `:176-189`
  - `window`와 overflow 조상에 scroll listener를 등록하지만, listener가 호출한 state update는 다음 React commit에서 반영된다.
- 같은 파일 `:473-530`
  - listbox는 `document.body` portal의 `position:fixed` 요소다.
- `clients/desktop/playwright/2026-08-11-dg1-s3-fix/s3-fix-live.spec.ts:249,273`
  - 구현자 test는 `main.scrollTop`만 바꾼다.
- 같은 spec `:95-104,252,277`
  - `waitForDropdownAligned()`은 X축(left/width)만 확인한다. 실제 Y축 scroll 이동 여부와 첫 paint를 보지 않는다.

### 재현 데이터

```text
브라우저     chromium-1217 / headless
URL          http://127.0.0.1:5193/?mockRole=MASTER#/groupware/approvals/new
viewport     1280×1000
결재 유형    지출결의서
참조 유형    JOURNAL
검색어       2026/
문서 참조행  4개를 추가해 실제 document scroll range 확보
조작         window.scrollBy(0, 80)
측정         연속 requestAnimationFrame 2개에서 picker/listbox rect
```

원문:

```text
SOL_R3_SCROLL_BELOW_RED={
  "before":{
    "scrollY":0,
    "picker":{"top":697.5625,"bottom":754.5625},
    "list":{"top":758.5625,"bottom":992},
    "belowGap":4,
    "alignedBelow":true
  },
  "frame1":{
    "scrollY":80,
    "picker":{"top":617.5625,"bottom":674.5625},
    "list":{"top":758.5625,"bottom":992},
    "belowGap":84,
    "alignedBelow":false
  },
  "frame2":{
    "scrollY":80,
    "picker":{"top":617.5625,"bottom":674.5625},
    "list":{"top":678.5625,"bottom":918.5625},
    "belowGap":4,
    "alignedBelow":true
  }
}

Expected frame1.alignedBelow: true
Received: false
1 failed
```

flip-up 상태에서도 같은 현상이 독립 재현됐다. 80px 단발 scroll의 첫 paint는 `aboveGap:80`, 두 번째 paint부터
`aboveGap:0`이었다. 20px씩 연속 scroll한 probe에서는 6/6 paint가 계속 한 step 뒤처져 `aligned:false`였다.

정적 캡처 [01-scroll-after-probe.png](../qa/2026-08-11-dg1-s3-r3/01-scroll-after-probe.png)는 두 번째 paint에
회복된 상태다. 첫 paint 결함은 위 연속 프레임 좌표와 Playwright 실패 원문이 정본이다.

### 왜 기존 test가 green이었는가

구현자 test는 `main.app-main.scrollTop += 80` 뒤 synthetic `scroll` event를 보냈다. 그러나 실측한 비관련 route의
`main.app-main`은 `clientHeight === scrollHeight`라 scrollTop이 0에서 움직이지 않았다. 결재 작성 route도 기존
조합에서는 실제 window scroll을 만들지 않아, listener 호출만 하고 anchor 좌표는 바꾸지 않는 false-green이었다.

반면 실제 document scroll 실측은 다음처럼 움직였다.

```text
홈                    document scrollTop 0 → 36
판매                  document scrollTop 0 → 120
회계 > 분개장         document scrollTop 0/120 → 120
```

세 route 모두 1024×480 → 760×560 resize 후 main 노출과 document scroll range를 유지했다.

## 3. 구현자 지시서

### RED-A 표적

1. 아래 열림과 flip-up 양쪽에서 실제 `window/document.scrollingElement` scroll을 만든다.
2. scroll 전 `gap=4px`인 상태에서 20px·80px 단발 이동 후 **첫 requestAnimationFrame**에 닫힘 또는 `gap=4±2px`를 단언한다.
3. 연속 6프레임 scroll에서도 매 paint가 닫힘 또는 정렬 상태여야 한다.
4. `main.scrollTop` 값이 실제로 변했는지 단언하지 않은 synthetic event test는 근거로 쓰지 않는다.
5. 아래 열림, flip-up, anchor가 viewport 밖으로 나가는 닫힘 정책을 각각 별도 test로 둔다.

### RED-B 표적

- 7유형 모두 click 전에 bounding box·viewport·중앙 hit-test gate를 유지한다.
- 기존 6종 검색·선택과 아래 §6의 라벨·href exact 값을 보존한다.
- 0건 / 1건 / 여러 건+내부 scroll / 긴 거래처명 / 480px / 1280×480 조합을 유지한다.
- desktop 전체 Vitest·typecheck, accounting 1,867, groupware 254를 유지한다.
- V19 기존 값 보존 계약과 refDocNo POST→GET 왕복·뮤테이션 감도를 유지한다.
- S4 route를 당겨 만들지 않는다. 정산서 plain text 판정은 그대로 유지한다.

### 반드시 지킬 중단 조건

**제 전제가 틀렸다면 고치지 말고 중단·보고하십시오.** 특히 브라우저 paint 순서상 frame1이 실제 사용자에게
그려지지 않는다고 판단한다면, React state commit/scroll event/paint 순서를 추측으로 설명하지 말고 DevTools trace 또는
동등한 paint 증거로 반증해야 한다. test에서 두 번째 rAF만 기다려 green으로 만들거나 scroll 중 dropdown을 임의로
숨겼다가 재표시하면서 깜빡임을 만들면 안 된다.

### 새 조합

| 축 | 추가할 조합 |
|---|---|
| 열림 방향 | below / flip-up |
| scroll owner | 실제 window/document / overflow 조상 |
| 이동량 | 20px 연속 6회 / 80px 단발 |
| paint | frame 1 / frame 2 회복 비교 |
| 종료 | anchor 일부 노출 / 완전 이탈 후 닫힘 |
| 폭 | 1280 / 480 |

## 4. 가시성 gate 뮤테이션 — 진짜 gate 확인

portal listbox를 런타임에서 picker 자식으로 되돌리고 다음 스타일을 강제했다.

```text
position:absolute; top:100%; left:0; right:0; z-index:20
picker overflow-x:hidden / computed overflow-y:auto
```

원문:

```text
SOL_R3_MUTATION_RED={
  "optionRect":{"top":726.5625,"bottom":763.5625,"left":291,"right":1229},
  "pickerRect":{"top":668.5625,"bottom":725.5625,"left":290,"right":1230},
  "inViewport":false,
  "hitTag":null,
  "hitTestId":null,
  "optionContainsHit":false,
  "pickerOverflowX":"hidden",
  "pickerOverflowY":"auto"
}

Expected inViewport: true
Received: false
1 failed
```

[06-mutation-red-clipped.png](../qa/2026-08-11-dg1-s3-r3/06-mutation-red-clipped.png)에서도 검색어만 보이고
후보는 보이지 않는다. 따라서 gate는 clipping 회귀를 실제로 잡는다.

`REFERENCE_VISIBILITY_CASES`는 spec `:70`에서 7유형을 모두 열거하고, `:193-203` loop 내부에서 각 유형의
option에 `expectVisibleAndHitTestable()`을 호출한다. 정산서만 걸린 gate가 아니다.

## 5. portal 새 표면 3가지

| 표면 | 판정 | 근거 |
|---|---|---|
| 실제 scroll | **FAIL** | 아래 열림 첫 paint gap 84px, flip-up 첫 paint 80px 불일치 |
| modal z-index | 운영 소비처 없음 | picker 소비처는 작성 `GroupwareApprovalCreatePage.tsx:614`, 상세 `GroupwareApprovalDetailPage.tsx:653` 두 곳뿐이며 둘 다 Modal 내부가 아님 |
| 하단·창 축소 | PASS | 1280×480 list `82.56..322.56`, picker `326.56..383.56`, `opensAbove:true`; 480×640 hit-test PASS |

z-index 정적 계약은 picker `1100`, design-system Modal backdrop `1000`, push toast `1200`, fullscreen/version 계열
`9999/10000`이다. 따라서 가상의 picker-in-Modal은 backdrop 위에 뜨고 상위 차단 overlay는 덮지 않는다. 다만 실제
picker-in-Modal 운영 화면이 존재하지 않아 동시 상호작용은 이번 round에서 밟을 수 없었다. “인쇄 미리보기”는 Modal이
아니라 `/groupware/approvals/:id/print` route 이동임도 직접 확인했다.

desktop renderer의 body portal 구현은 공통 design-system Modal과 이번 picker가 주된 경로다. 비관련 portal과의 실제
동시 충돌은 발견되지 않았지만, picker-in-Modal 실제 consumer 부재는 검증 공백으로 남는다.

## 6. 기존 6종 라벨·href exact 불변

targeted Vitest가 아래 값을 실제로 비교해 6/6 통과했다.

| `refDocType` | 인쇄 라벨 | 상세 라벨 | 상세 href |
|---|---|---|---|
| `OUTBOUND_SLIP` | `전표 참조` | `출고전표` | `#/sales?slipNo=2026%2F08%2F11-1` |
| `INBOUND_SLIP` | `전표 참조` | `입고전표` | `#/purchases?slipNo=2026%2F08%2F11-1` |
| `JOURNAL` | `전표 참조` | `분개장` | `#/accounting/journals?journalNo=2026%2F08%2F11-1` |
| `TAX_INVOICE` | `전표 참조` | `세금계산서` | `#/accounting/tax-invoices?taxInvoiceNo=2026%2F08%2F11-1` |
| `STATEMENT` | `전표 참조` | `거래명세서` | `#/accounting/statement-batch?statementNo=2026%2F08%2F11-1` |
| `PARTNER_LEDGER` | `거래처원장 참조` | `거래처원장` | `#/accounting/ledgers?partnerCode=P-001&period=2026-08` |

정산서 `SALES_COMMISSION_SETTLEMENT`는 `영업수수료 정산서`, href `null`이다. S4 route가 없으므로 plain text로 두는
이전 판정을 유지한다.

## 7. 검증 결과

| 검증 | 결과 |
|---|---|
| 구현자 Chromium-1217 live spec | `5 passed (9.7s)` |
| 7유형 gate | 7/7 `inViewport:true`, `optionContainsHit:true` |
| 실제 window scroll first-paint probe | **1 failed** — F-1 |
| clipping mutation probe | 예상대로 **1 failed** — gate 감도 확인 |
| flip-up + 480px + 비관련 3 route SOL probe | `2 passed` |
| picker + 기존 라벨/href + 정산서 plain text targeted Vitest | `3 files / 23 passed` |
| desktop 전체 Vitest | 단독 fresh run exit `0` |
| desktop typecheck | exit `0` |
| accounting 전체 | `BUILD SUCCESSFUL in 7m 19s`; 223 files / **1,867** / failures 0 / errors 0 / skipped 10 |
| groupware 전체 | `BUILD SUCCESSFUL in 1m 25s`; 33 files / **254** / failures 0 / errors 0 / skipped 0 |
| refDocNo production mutation | `ApprovalTemplateAttachmentIT.java:323`, 1 test / 1 failed |
| refDocNo 원복 + V19 targeted | `BUILD SUCCESSFUL in 43s` |

desktop 전체 Vitest를 accounting과 처음 병렬 실행했을 때 `Worker exited unexpectedly`가 발생했다. 개별 assertion
실패는 없었고 단독 재실행은 exit 0이었다. 이 환경 실패는 제품 결함 수에 넣지 않았다.

## 8. 스크린샷

| 파일 | 내용 | SHA-256 |
|---|---|---|
| [01-scroll-after-probe.png](../qa/2026-08-11-dg1-s3-r3/01-scroll-after-probe.png) | scroll 두 번째 paint 회복 상태 | `510AA22B1FEF25D235083C0B5673B551FDF0E6E72DC4345BD5941B782569C9ED` |
| [02-flip-up.png](../qa/2026-08-11-dg1-s3-r3/02-flip-up.png) | 1280×480 실제 flip-up | `3FAB71FF543647FFF2C3BE2552BA0B0B1A9CF96693481E38C9DC57B4D1E69E86` |
| [03-narrow-480.png](../qa/2026-08-11-dg1-s3-r3/03-narrow-480.png) | 480×640 hit-test 가능한 dropdown | `EB18FBB8ED57F7A32795AD1061FED974F4784FC314DAC118EE26164B2E6691A1` |
| [04-unrelated-accounting-resize.png](../qa/2026-08-11-dg1-s3-r3/04-unrelated-accounting-resize.png) | 비관련 분개장 route resize | `687FFB9A6D1583B9CF7D167079E95C5BEE5AFA2F483A33D9400270336DEEC56A` |
| [06-mutation-red-clipped.png](../qa/2026-08-11-dg1-s3-r3/06-mutation-red-clipped.png) | portal 되돌림 clipping RED | `6EF082C552CE8CC2169AAFB003A90CAB058F063BAD74F270BC4DC9E7D051CC94` |

## 9. 프로세스·데이터 정리

- 새 QA 서버를 띄우지 않았다.
- 기존 5193 Vite는 이 worktree의 기존 프로세스(PID 71632)임을 확인하고 유지했다.
- 5293 listener는 없다.
- 임시 Playwright probe 3개와 production refDocNo 뮤테이션은 모두 제거·원복했다.
- 공유 DB 조회·write, API 실서버 호출, container 생성은 수행하지 않았다.

현재 판정은 **머지·#1169 rebase 보류**다. F-1 수정 제출 후 같은 first-paint probe로 재검토해야 한다.
