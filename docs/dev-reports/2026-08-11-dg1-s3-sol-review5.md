# PR #1168 D-G1 S3 — CODEX SOL 5.6 재검토5

> 대상 워크트리: `C:\dev\Samhan-Public\.claude\worktrees\wdg1s3`  
> 대상 HEAD: `d56fa5fe197203615f84b79a054959a92b4ec377`  
> 검토일: 2026-08-11  
> 역할: CODEX SOL 5.6 코드 검토자  
> 제약 준수: git 조작 0건 · 공유 DB 접근/쓰기 0건 · 신규 QA 서버 0건 · 기존 5193 유지

## 1. 판정

**차단 결함 1건. PR #1168 머지와 #1169 rebase를 보류한다.**

fix4가 scroll close와 mouse click 사이의 경합에서 dropdown을 다시 열기는 한다. 그러나 다음 rAF에서
**새 좌표가 commit되기 전에 낡은 fixed dropdown의 `visibility`를 먼저 복구**한다. 그 결과 실제
`page.mouse.click`과 3px window scroll 조합에서 첫 rAF에 dropdown이 visible이면서 anchor와 3px
분리되고, 다음 rAF에야 정상 4px gap으로 돌아온다.

이 PR의 첫 차단 결함이었던 “한 프레임 어긋남”이 재열기 경합 경로에서 다시 생겼다. 공식 7-test
live spec의 신규 재열기 gate는 최종 `toBeVisible`과 option count만 보므로 이 프레임을 보지 않는다.

요약:

```text
정상 시작       scrollY=0  visible=true  belowGap=4  aligned=true
scroll event    scrollY=3  visible=false belowGap=7  closed=true
첫 rAF 재열기   scrollY=3  visible=true  belowGap=7  aligned=false  ← RED
다음 rAF        scrollY=3  visible=true  belowGap=4  aligned=true
100ms 최종      scrollY=3  visible=true  belowGap=4  aligned=true
```

동일 경로를 Chromium-1217 headless에서 `--repeat-each=5 --workers=1`로 실행했고 **5/5 같은 RED**였다.

## 2. 차단 결함 F-1 — scroll→click 재열기가 낡은 fixed 좌표를 첫 rAF에 다시 노출한다

### 2.1 불변식

외부 scroll과 같은 mouse click이 경합하더라도 각 paint 경계에서 dropdown은 다음 둘 중 하나여야 한다.

1. 닫혔거나 `visibility:hidden`이다.
2. visible이면 현재 anchor와 같은 방향으로 정렬되어 gap `4px ± 2px`다.

최종 상태가 맞는 것만으로는 충분하지 않다. 첫 rAF에 visible·misaligned면 이 PR이 이미 고쳤던 한 프레임
분리 결함의 재발이다.

### 2.2 source 좌표 전수

- `clients/desktop/src/renderer/components/groupware/DocumentReferencePicker.tsx:116`
  - `reopenAfterScrollRef`가 scroll/click 경합 재열기 표식이다.
- 같은 파일 `:170-187`
  - scroll event에서 portal을 즉시 숨기고 `flushSync`로 닫는다.
  - 표식이 있으면 다음 rAF의 `:183`에서 **먼저** `visibility`를 제거한다.
  - 그 뒤 `:184-185`에서 `setOpen(true)`와 `updateDropdownPosition()`을 요청한다.
- 같은 파일 `:379-395`
  - click 시 기존 fixed 좌표와 현재 anchor 좌표가 0.5px보다 다르면 재열기 표식을 세운다.
- 같은 파일 `:485`
  - focus가 남은 input의 실제 click 진입점이다.
- `clients/desktop/playwright/2026-08-11-dg1-s3-fix-real-qa/s3-fix-real-qa.spec.ts:530-558`
  - 신규 onClick gate는 실제 `page.mouse.click`을 쓰지만 최종 visible/count/value만 단언한다.
  - scroll event와 재열기 사이 첫 rAF의 geometry/visibility는 읽지 않는다.

### 2.3 원인

현재 순서:

```text
scroll handler
  stale portal visibility=hidden
  flushSync(open=false, position=null)
  requestAnimationFrame(
    stale dropdownRef visibility 제거   ← 새 좌표보다 먼저 노출
    setOpen(true)
    updateDropdownPosition()
  )
```

실측에서 app의 재열기 rAF 뒤 같은 paint boundary에서 old DOM이 `belowGap=7`로 visible했다. position state가
반영된 다음 rAF에는 `belowGap=4`가 됐다. 즉 “다음 rAF 재배치” 자체가 한 프레임의 낡은 좌표 재노출을 만든다.

### 2.4 재현 데이터와 실제 mouse 경로

```text
브라우저        chromium-1217 headless
viewport        1280 × 1000
route           /?mockRole=MASTER#/groupware/approvals/new
결재 유형       지출결의서
문서 유형       JOURNAL
query           2026/
후보            7건
초기 gap        4px
scroll owner    document.scrollingElement / window
이동            pointerdown capture에서 window.scrollBy(0, 3)
click           input 실제 bounding box 중앙 page.mouse.click
focus           input 유지
query 변경      없음
```

한 번의 압축 원문:

```text
R5_CAPTURE={
  "rows":[
    {"phase":"scroll-event","scrollY":3,"closed":true,"visible":false,"aligned":false,"belowGap":7},
    {"phase":"first-rAF-after-reopen","scrollY":3,"closed":false,"visible":true,"aligned":false,"belowGap":7},
    {"phase":"second-rAF","scrollY":3,"closed":false,"visible":true,"aligned":true,"belowGap":4}
  ],
  "final":{"scrollY":3,"visible":true,"aligned":true,"belowGap":4}
}
```

5회 반복 원문 공통:

```text
Running 5 tests using 1 worker
SCROLL_CLICK_FRAME_TRACE=...first-rAF visible=true aligned=false belowGap=7...
SCROLL_CLICK_FINAL_GEOMETRY={"scrollY":3,"belowGap":4,...}
Expected: true
Received: false
for (const frame of paintFrames) expect(frame.closed || frame.aligned).toBe(true)
5 failed
```

증거 캡처:

- [02-scroll-click-first-raf-red.png](../qa/2026-08-11-dg1-s3-r5/02-scroll-click-first-raf-red.png)
  - SHA-256 `1D029C1B4CF7DEEFC4B41FE6C2DE3C5141AF9F1895EAAC1657DB80AFF8160F26`

## 3. 클릭 재열기가 만든 나머지 surface

### 3.1 열린 상태 click과 닫기 경로

실제 mouse/keyboard 결과:

| 조합 | 결과 |
|---|---|
| 열린 input 실제 click | listbox 1 · options 7 유지, 비토글 |
| Escape | listbox 0 · `aria-expanded=false` · focus는 input 유지 |
| Escape 직후 같은 input click | listbox 0 유지; Escape가 options를 비우는 기존 계약 |
| 제목 input 외부 click/blur | 120ms 후 닫힘 |
| blur 뒤 검색 input 실제 click | query `2026/` 재검색 후 listbox 1 · options 7 |
| 문서 유형 select click 뒤 검색 input click | listbox 1 · options 7 |
| window 1px scroll close 뒤 같은 input click | listbox 1 · options 7 |
| fresh `main.app-main` 1px scroll close 뒤 같은 input click | `scrollTop=1`, listbox 1 · options 7 |

따라서 열린 상태 click이 토글하지 않는 것 자체는 차단 결함이 아니다. Escape와 외부 click/blur가 실제 닫기
경로로 동작했다. 단, Escape는 cache/options까지 비우므로 같은 focus 상태의 click만으로 즉시 다시 열지는 않는다.
이 동작은 fix4 보고서가 명시한 기존 Escape 계약과 일치하며 이번 fix가 새로 만든 회귀로 판정하지 않았다.

재열기 정상 캡처:

- [01-window-scroll-mouse-reopen.png](../qa/2026-08-11-dg1-s3-r5/01-window-scroll-mouse-reopen.png)
  - SHA-256 `B2CE5A54AC9AB6B12D10506B3DFB535E39D75228FFEAC3E1C4D62A5CF328D349`

### 3.2 0건 전제 대조 — 지시문의 “빈 listbox 표시”는 현재 HEAD와 반대다

사용자 지시문에는 “0건일 때 listbox를 띄우고 빈 결과 문구가 없다”고 적혀 있으나, 실제 HEAD와 live 결과는
**listbox 자체가 없다**. 빈 상자는 보이지 않는다.

코드 계약:

- 검색 응답: `setOpen(nextOptions.length > 0)`
- 0건: `options=[]`, `open=false`, `activeIndex=-1`
- 렌더: `open`일 때만 listbox portal 생성

기존 6종과 신규 정산서 1종을 각각 `NO_MATCH_<TYPE>_000`으로 실제 300ms debounce 뒤 대조했다.

| 유형 | listbox | 빈 결과 문구 | aria-expanded |
|---|---:|---:|---:|
| `OUTBOUND_SLIP` | 0 | 없음 | false |
| `INBOUND_SLIP` | 0 | 없음 | false |
| `JOURNAL` | 0 | 없음 | false |
| `TAX_INVOICE` | 0 | 없음 | false |
| `STATEMENT` | 0 | 없음 | false |
| `PARTNER_LEDGER` | 0 | 없음 | false |
| `SALES_COMMISSION_SETTLEMENT` | 0 | 없음 | false |

모두 공통 `DocumentReferencePicker`를 사용하며 유형별 0건 분기는 없다. 따라서 “빈 상자가 사용자에게 무엇으로
보이는가”라는 전제는 재현되지 않았다. **제 전제가 틀렸으므로 이 부분은 고치지 않고 사실을 보고한다.**

- [03-zero-result-no-empty-box.png](../qa/2026-08-11-dg1-s3-r5/03-zero-result-no-empty-box.png)
  - SHA-256 `0D7AAD46E73A2AC91E1459B8C1DAB56024563345023D0906BC9996BB357D6D3B`

### 3.3 내부 wheel과 keyboard 전체 경로

```text
listbox wheel        scrollTop 0 → 21
외부 owner           window/main 좌표 불변
dropdown             열린 상태 유지
하단 option          scrollIntoView 뒤 실제 mouse click
selection            attachment chip 1개 생성

ArrowDown            scroll close 뒤 cache 후보 7건 재열기
Tab                  blur 120ms 뒤 닫기
Escape               닫기
Enter                active option 선택 · attachment chip 추가
```

- [04-internal-wheel-bottom-selected.png](../qa/2026-08-11-dg1-s3-r5/04-internal-wheel-bottom-selected.png)
  - SHA-256 `5EF6F97ABE4C3FB0DF44D2B0DBE9882CC12F793E3A69691BCDDF3253CCD48529`

## 4. 세 gate mutation 전수

각 mutation은 한 변수만 바꾸고 probe 뒤 즉시 원복했다. 최종 제품 source는 HEAD와 diff 0이다.

### 4.1 ① portal 되돌림 — RED

body portal/fixed를 기존 inline absolute dropdown으로 일시 되돌렸다.

```text
VISIBILITY_GATE={
  "rect":{"top":729.5625,"bottom":766.5625,...},
  "inViewport":false,
  "hitTag":null,
  "optionContainsHit":false,
  "viewport":{"width":1280,"height":720}
}
Expected: true
Received: false
1 failed
```

따라서 portal rollback gate는 감도가 있다.

### 4.2 ② scroll close 제거 — window/main 모두 RED

두 scroll listener만 `closeDropdownOnScroll`에서 직전 `handleViewportChange`로 바꿨다.

```text
CONTAINER_SCROLL_FIRST_PAINT={
  "frame1":{"closed":false,"aligned":false,"gap":0,"scrollTop":80},
  "frame2":{"closed":false,"aligned":true,"gap":4,"scrollTop":80},
  "scrollHeight":1086,"clientHeight":480
}

WINDOW_SCROLL_FIRST_PAINT={
  "before":{"closed":false,"aligned":true,"gap":4,"scrollY":0,...},
  "frame1":{"closed":false,"aligned":false,"gap":-374.4375,"scrollY":80},
  "frame2":{"closed":false,"aligned":true,"gap":4,"scrollY":80},
  "events":["scroll","raf1","raf2"]
}

2 failed
```

실제 `main.scrollTop=80`, `window.scrollY=80`이므로 움직이지 않는 컨테이너 false-green이 아니다.

### 4.3 ③ onClick 재열기 제거 — RED

input의 `onClick={handleClick}` 한 줄만 제거했다.

```text
실제 window scroll 직후 같은 검색 input을 mouse click하면 후보 dropdown을 다시 연다
Locator: getByRole('listbox')
Expected: visible
Timeout: 10000ms
element(s) not found
s3-fix-real-qa.spec.ts:555
1 failed
```

따라서 이번 fix의 click 재열기 자체에는 mutation 감도가 있다. 다만 이 신규 gate가 최종 상태만 확인하여
F-1의 첫 rAF stale visibility를 잡지 못한다.

## 5. RED-B 보존 결과

### 5.1 Desktop

| 검증 | fresh 결과 |
|---|---|
| 공식 S3 live spec / Chromium-1217 | **7 passed (16.1s)** |
| 7유형 visibility gate | 전부 `inViewport:true`, `optionContainsHit:true` |
| window/main 일반 scroll 첫 rAF | 최종 source에서 둘 다 `closed:true` |
| picker + 기존 6종 라벨/href + 정산서 상세 | **3 files / 26 passed** (`16 + 9 + 1`) |
| 전체 Vitest JSON | **247 files / 2,178 total / 2,176 passed / 2 pending / 0 failed**, exit 0 |
| typecheck | exit 0 |
| lint | **723 files / errors 0 / warnings 161**, exit 0 |

기존 6종 exact 계약:

| 유형 | 인쇄 라벨 | 상세 라벨 | href |
|---|---|---|---|
| 출고전표 | 전표 참조 | 출고전표 | `#/sales?slipNo=2026%2F08%2F11-1` |
| 입고전표 | 전표 참조 | 입고전표 | `#/purchases?slipNo=2026%2F08%2F11-1` |
| 분개장 | 전표 참조 | 분개장 | `#/accounting/journals?journalNo=2026%2F08%2F11-1` |
| 세금계산서 | 전표 참조 | 세금계산서 | `#/accounting/tax-invoices?taxInvoiceNo=2026%2F08%2F11-1` |
| 거래명세서 | 전표 참조 | 거래명세서 | `#/accounting/statement-batch?statementNo=2026%2F08%2F11-1` |
| 거래처원장 | 거래처원장 참조 | 거래처원장 | `#/accounting/ledgers?partnerCode=P-001&period=2026-08` |

flip-up, 480px, 비관련 회계 resize, 7유형 가시성은 공식 7-test spec에서 GREEN이었다.

### 5.2 Backend 전체 suite

| 모듈 | 명령 | fresh XML 합계 |
|---|---|---|
| accounting | `:services:accounting-service:test --rerun-tasks --no-build-cache` | **223 files / 1,867 tests / failures 0 / errors 0 / skipped 10** |
| groupware | `:services:groupware-service:test --rerun-tasks --no-build-cache` | **33 files / 254 tests / failures 0 / errors 0 / skipped 0** |

### 5.3 V19 기존행 실제 적용

공유 DB 대신 포트를 열지 않은 일회용 `postgres:16-alpine`에 V6 제약과 기존 6종 행을 먼저 넣고 V19을
적용했다. 이후 기존 6종 생존과 7종 신규 저장을 확인하고 컨테이너를 제거했다.

```text
ROW_COUNTS | pre_survived=6 | post_inserted=7 | settlement_rows=1
CHECK_DEF  | 기존 6종 + SALES_COMMISSION_SETTLEMENT
INDEX_DEF  | (ref_doc_type, ref_doc_no) WHERE is_deleted = false
```

### 5.4 refDocNo POST→GET 왕복과 mutation

원본 단일 IT:

```text
ApprovalTemplateAttachmentIT.salesCommissionSettlementReference_roundTripsFromAttachmentToApprovals
원복 후 exit 0
```

`ApprovalAttachment.documentRef()`의 다음 한 줄만 제거했다.

```java
attachment.refDocNo = refDocNo.trim();
```

mutation 원문:

```text
ApprovalTemplateAttachmentIT > salesCommissionSettlementReference_roundTripsFromAttachmentToApprovals() FAILED
java.lang.AssertionError at ApprovalTemplateAttachmentIT.java:323
1 test completed, 1 failed
BUILD FAILED in 36s
```

즉 POST가 실제로 저장한 `refDocNo`를 GET 역조회가 반환하는 gate도 계속 RED 감도를 가진다.

## 6. 구현자 지시서

### 6.1 반드시 지킬 불변식

1. scroll/click 경합의 **모든 paint**에서 dropdown은 hidden/closed 또는 현재 anchor와 `4px ± 2px` 정렬이다.
2. scroll close 정책은 window와 실제 `main.app-main` 양쪽에서 유지한다.
3. focus 유지 input의 실제 click 재열기와 열린 상태 비토글을 유지한다.
4. 0건은 현행 공통 계약대로 listbox 0 · 빈 문구 없음이다. 새 빈 상자나 새 문구를 임의 도입하지 않는다.
5. dropdown 내부 wheel은 외부 scroll close로 오인하지 않는다.
6. portal/fixed, flip-up, 480px, 7유형 visibility/hit-test를 유지한다.
7. 기존 6종 라벨·href exact, V19 기존행, `refDocNo` 왕복과 mutation 감도를 유지한다.

### 6.2 RED-A 구체 표적

공식 Chromium live spec에 다음 gate를 추가한다.

1. `JOURNAL`, query `2026/`, options 7건으로 연다.
2. input focus/query를 유지하고 실제 `page.mouse.click`을 사용한다.
3. pointerdown과 scroll event가 경합하도록 window와 `main.app-main`에서 각각 실제 1px·2px·3px 이동을 만든다.
4. 실제 scroll 값이 변했음을 단언한다.
5. scroll event 직후, 재열기 첫 rAF, 다음 rAF를 각각 읽는다.
6. 각 rAF에서 `closed || hidden || aligned(4px ± 2px)`를 단언한다.
7. 최종 listbox 1 · options 7 · query 불변도 단언한다.
8. 같은 gate를 below/flip-up 방향에 적용한다.

현재 source는 3px case의 첫 rAF에서 `visible=true, belowGap=7, aligned=false`로 RED여야 한다.

### 6.3 수정 표면

낡은 `dropdownRef`의 `visibility`를 새 좌표 commit 전에 제거하지 않는다. 재열기 시 새 `open`과
`dropdownPosition`이 layout/flush 경계에서 반영된 뒤에만 visible해야 한다. 구현 방식은 하나로 강제하지 않지만,
“먼저 unhide → 나중 position state” 순서는 금지한다.

### 6.4 RED-B 구체 표적

- portal rollback → `inViewport:false`, `optionContainsHit:false` RED.
- scroll close 제거 → window/main 첫 rAF 둘 다 RED.
- onClick 제거 → focus 유지 mouse 재클릭 RED.
- **신규:** 새 좌표 commit 전 stale visibility를 복구하는 mutation → scroll/click 첫 rAF RED.
- 내부 wheel `scrollTop 0→21`, open 유지, 하단 실제 click.
- 열린 click 비토글, Escape, 외부 click/blur, blur 후 click, 다른 요소 뒤 click.
- ArrowDown, Tab, Escape, Enter 전체 keyboard 경로.
- 0/1/여러 건, 1280 below/flip-up, 480px.
- 공식 S3 7-test, desktop 2,176 passed + 2 pending, typecheck, lint.
- accounting 1,867, groupware 254, V19 기존행, refDocNo 왕복/mutation.

### 6.5 반드시 지킬 중단 조건

**제 전제가 틀렸다면 고치지 말고 중단·보고하십시오.**

특히 rAF callback 사이 DOM 상태가 실제 paint되지 않는다고 판단한다면 추측으로 tolerance를 넓히거나 gate를
삭제하지 말고, Chromium DevTools frame/paint trace 또는 동등한 브라우저 증거로 반증해야 한다. 0건에 빈
listbox가 실제로 존재한다고 판단한다면 유형별 DOM count와 current HEAD 코드를 먼저 반증해야 한다.

### 6.6 새 조합 전수

| 축 | 조합 |
|---|---|
| scroll owner | window / document.scrollingElement / 실제 main.app-main |
| 이동량 | 1px / 2px / 3px / 20px×6 / 80px |
| event 순서 | scroll 완료→click / pointerdown→scroll→mouseup→click / scroll+resize |
| focus | focus 유지 / blur 120ms 전후 / 다른 요소 뒤 refocus |
| open | 닫힘 / 열림 비토글 / Escape 닫힘 / 외부 click 닫힘 |
| 결과 수 | 0 / 1 / 7 + 내부 wheel |
| 방향·폭 | below / flip-up / 1280 / 480 |
| 입력 | mouse / ArrowDown / Tab / Escape / Enter |

## 7. QA·환경 정리

- 기존 `http://127.0.0.1:5193` PID `71632`만 사용했고 그대로 유지했다.
- 신규 QA 서버/listener는 만들지 않았다.
- Chromium 설치본은 `chromium-1217`, Playwright `1.59.1`이었다.
- 일회용 V19 PostgreSQL 컨테이너는 검증 후 제거했다.
- 공유 DB 조회·write는 모두 0건이다.
- 임시 Playwright probe와 모든 source mutation은 제거·원복했다.
- 최종 산출물은 본 보고서와 `docs/qa/2026-08-11-dg1-s3-r5/` 4장이다.

## 8. PM 보고

```text
PR #1168 / HEAD d56fa5fe1
S3 SOL 재검토5: BLOCKING 1

fix4의 scroll→click 재열기가 새 좌표 commit 전에 stale portal visibility를 복구해
첫 rAF에 visible·misaligned(3px scroll, belowGap 7)를 만든다.
다음 rAF/최종은 belowGap 4라 공식 최종-state gate가 false-green이다.
Chromium-1217 실제 page.mouse.click에서 5/5 RED.

세 mutation gate는 모두 RED:
portal rollback / window+main scroll close 제거 / onClick 제거.
RED-B는 desktop·accounting 1,867·groupware 254·V19·refDocNo mutation까지 보존.

0건은 지시문 전제와 달리 기존 6종+신규 모두 listbox 0, 빈 문구 없음이며 빈 상자 없음.

판정: 머지 및 #1169 rebase 보류. F-1 수정 후 재검토 필요.
```
