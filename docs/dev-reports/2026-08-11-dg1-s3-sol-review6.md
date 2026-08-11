# PR #1168 D-G1 S3 — CODEX SOL 5.6 재검토6

> 대상 워크트리: `C:\dev\Samhan-Public\.claude\worktrees\wdg1s3`  
> 사용자 지정 대상: PR #1168 / HEAD `6d9856f0a`  
> 검토일: 2026-08-11  
> 역할: CODEX SOL 5.6 코드 검토자  
> 제약 준수: git 명령 0건 · 공유 DB 접근/쓰기 0건 · 신규 QA 서버 0건 · 기존 PID 71632 유지

## 1. 판정

**차단 결함 1건. 같은 위치 계산 사슬의 다섯 번째 제품 결함은 재현하지 못했지만, fix5 rollback을 잡아야 하는 첫-rAF 회귀 gate가 8/10 false-green이다.**

분류는 다음과 같다.

```text
같은 사슬의 다섯 번째인가?  아니다.
원인                         제품 위치 계산이 아니라 테스트 observer 등록 순서다.
위치 계산 방식 재설계 필요?  이번 증거로는 아니다.
머지 판정                    보류 — rollback gate가 안정 RED가 될 때까지.
```

현행 제품 코드는 숨은 dropdown을 재지 않는다. 항상 화면에 남아 있는 picker anchor의
`getBoundingClientRect()`만 읽고, 계산된 `DropdownPosition`이 없으면 portal을 아예 렌더하지 않는다.
최초 열림·캐시 재열림·폰트/결과 높이 변화·resize·flip-up·키보드/마우스·실제 창 최소화 복귀에서
visible한 첫 측정은 모두 gap 4px 정렬 및 hit-test를 만족했다.

그러나 사용자가 특별히 요구한 “fix를 되돌렸을 때 동일 검사가 RED인가”는 보고서의 5/5와 달랐다.
직전 fix4의 scroll handler와 `handleClick -> setOpen(true)`를 함께 복원한 exact rollback을 두 번
`--repeat-each=5 --workers=1`로 실행했을 때 각 실행에서 1건만 RED였다. 합계는 **2 RED / 8 false-green**이다.

## 2. 차단 결함 F-1 — first-rAF gate가 관찰을 너무 늦게 시작한다

### 2.1 원인 좌표

- `clients/desktop/playwright/2026-08-11-dg1-s3-fix-real-qa/s3-fix-real-qa.spec.ts:571-586`
  - `pointerdown`에서 3px scroll을 만들고 click microtask에서 수동 scroll event를 dispatch한다.
- 같은 파일 `:588-590`
  - 실제 `page.mouse.click()`이 완전히 끝날 때까지 기다린다.
- 같은 파일 `:592-612`
  - **그 뒤에야** `page.evaluate()`로 첫 `requestAnimationFrame` observer를 등록한다.

fix4 rollback에서는 앱 scroll handler가 자기 재열기 rAF를 scroll event 중에 먼저 예약한다. Playwright의
mouse RPC가 반환되고 다음 `page.evaluate()`가 브라우저 task에 도착하기 전에 그 앱 rAF가 실행될 수 있다.
그 경우 검사는 결함 프레임이 아니라 다음의 정상 좌표만 읽는다.

```text
실제로 잡은 RED  visible=true / aligned=false / belowGap=7 / scrollY=3
놓친 GREEN       visible=true / aligned=true  / belowGap=4 / scrollY=3
rollback 합계    RED 2/10 · false-green 8/10
```

따라서 현행 코드에서 5/5 GREEN인 사실은 제품 상태의 필요 증거지만, 이 gate 하나만으로 rollback 방지를
충분히 증명하지는 못한다. observer promise를 실제 mouse click 전에 미리 설치하고, 앱 scroll listener 뒤에서
같은 scroll dispatch가 예약한 앱 rAF 직후의 좌표를 읽도록 순서를 고정해야 한다. 실제 mouse 입력은 그대로
유지할 수 있다.

### 2.2 3종 기존 mutation은 독립 RED

| mutation | 직접 결과 |
|---|---|
| body portal을 picker 내부로 복귀 | `DocumentReferencePicker.test.tsx:131` parent가 body가 아니어서 1/1 RED |
| window/main scroll-close를 위치 갱신으로 복귀 | main `scrollTop=80`, 첫 frame `gap=0`, window `scrollY=80`, 첫 frame `gap=-374.4375`; 2/2 RED |
| input `onClick` 제거 | 실제 mouse 재클릭 뒤 10초 내 listbox 없음; 1/1 RED |

즉 기존 3종 mutation의 대상은 실제 portal/실제 움직인 scroll owner/실제 mouse click이다. F-1은 이 세
gate의 대상 오류가 아니라 새 first-rAF gate의 **관찰 시작 시점** 오류다.

## 3. 제품 surface 재검토

### 3.1 숨김 측정·최초 열림·재열림

생산 코드 좌표:

- `DocumentReferencePicker.tsx:140-165`: 보이는 picker anchor rect로 fixed 좌표 계산.
- `:150-151`: 방향 판단은 dropdown 실높이가 아니라 viewport 공간과 상수
  `DROPDOWN_MIN_FLIP_SPACE=160`, `DROPDOWN_MAX_HEIGHT=240`을 사용.
- `:525-587`: `open && dropdownPosition`일 때만 body portal을 렌더함. `display:none`,
  `visibility:hidden`, 0크기 dropdown을 사전 측정하는 경로가 없음.

최초 검색의 rAF sampler 결과:

```text
first visible frame index  18
time from input sampler     316ms (기존 300ms debounce 포함)
expanded=true/listbox 없음  0 frame
first visible               aligned=true / belowGap=4 / hit=true
anchor                      top=697.5625 bottom=754.5625 height=57
list                        top=758.5625 bottom=992 height=233.4375
```

layout effect의 위치 state 갱신은 첫 visible paint 전 끝났다. fix 때문에 추가 rAF를 기다리는 프레임은
관찰되지 않았다. cache 재열림의 첫 rAF도 `visible=true / aligned=true / belowGap=4 / scrollY=3 /
hitInside=true`였다.

### 3.2 폰트·빈 목록·찬 목록·resize

- `document.fonts.ready` 뒤 검색 input의 font-size/line-height를 강제로 키워 reflow를 만들었다.
  결과는 위로 열림, `aboveGap=4`, option 중앙 hit-test 성공이었다.
- 7건 → 0건 전환은 listbox 0, 다시 7건은 visible·aligned였다.
- 열린 상태에서 viewport `1280x900 -> 1024x640` 변경 첫 rAF는 anchor가 viewport 밖으로 나가
  `closed=true`였다. 낡은 visible 좌표는 없었다.
- 현행 mock 최대 후보 7건은 `clientHeight=238`, `scrollHeight=259`로 실제 내부 overflow가 생겼다.
  480px 높이에서 `listBottom=322.5625`, `pickerTop=326.5625`, `aboveGap=4`; anchor와 겹치지 않고
  첫 option 중앙 hit-test가 listbox 안으로 들어왔다.
- 생산 검색 limit은 10이고 normalize 상한은 20이다. 이번 live mock에는 7건보다 큰 fixture가 없어
  20건 실높이 조합은 보지 못했다. max-height/overflow 코드 경로는 7건에서 이미 활성화됐다.

### 3.3 조작 조합

| 조합 | 실제 결과 |
|---|---|
| Tab → 키 입력 → ArrowDown → Enter | attachment chip 1건 선택 |
| 실제 mouse로 마지막 option 선택 | 내부 scroll 뒤 chip 생성, listbox 닫힘 |
| click 직후 실제 window 20px scroll | native scroll event 1건; 연속 3 frame 모두 closed=true, scrollY=20 |
| scroll 중 click / 3px 경합 | 현행 first rAF gap 4, hit 성공 |
| 다른 picker 추가 중 기존 dropdown | listbox 최대 1개; blur 이후 기존 layer 닫힘 |
| 실제 Chromium window 최소화→normal | `Browser.setWindowBounds` 실제 성공; 복귀 후 aboveGap=4, hit 성공 |
| 내부 wheel | scrollTop 0→21, dropdown 열린 상태 유지 |

다중 picker QA 초기에 첫 picker anchor와 세 번째 picker listbox를 비교해 `aligned=false`가 나온 적이
있었다. 이는 제품 결함이 아니라 검사 대상 오류였다. listbox `id`와 combobox `aria-controls`를 결속해
같은 owner끼리 다시 측정하자 `aboveGap=4`였다. 이 보정 전 결과는 판정 수치에 넣지 않았다.

## 4. 공식 GREEN이 실제로 보는 값

- `aligned`: listbox와 해당 picker의 실제 `getBoundingClientRect()` 두 개로 계산한다.
- `belowGap`: `listRect.top - pickerRect.bottom`의 CSS pixel 실수값이다.
- `scrollY`: 해당 frame의 실제 `window.scrollY`다.
- 가시성: rect가 viewport 안인지와 option 중앙 `document.elementFromPoint()`가 option 자신/자손인지
  함께 확인한다.

fresh 공식 S3 9개는 9/9 통과했다. 7유형의 option rect는 모두 viewport 안이고 중앙 hit-test가 option
안으로 들어왔다. 별도 현행 first-rAF 5회도 모두 다음 값이었다.

```text
visible=true / aligned=true / belowGap=4 / scrollY=3   5/5
```

다만 §2의 이유로 exact rollback에 대한 안정 RED는 성립하지 않는다.

## 5. RED-B 보존

| 검증 | fresh 결과 |
|---|---|
| 공식 S3 live / Chromium headless | 9 passed / exit 0 |
| 현행 first-rAF repeat | 5 passed / 5회 모두 gap 4 |
| desktop 전체 Vitest | 2,178 total / **2,176 passed** / 2 pending / 0 failed |
| desktop typecheck | exit 0; real-QA scope 51/51 포함 |
| desktop lint | exit 0; errors 0 / 기존 warnings 161 |
| accounting 전체 | 223 XML / **1,867 tests** / failures 0 / errors 0 / skipped 10 |
| groupware 전체 | 33 XML / **254 tests** / failures 0 / errors 0 / skipped 0 |
| picker + SLIP_REF 소비자 targeted | 3 files / **26 passed** |
| refDocNo POST→GET | `ApprovalTemplateAttachmentIT` 9 tests 중 왕복 testcase 포함, failures 0 |
| V19 SQL 계약 | 2 tests / failures 0 |

기존 6종 label/href exact도 targeted 9-test consumer에서 다음 값 그대로 통과했다.

| 유형 | 상세 라벨 | href |
|---|---|---|
| OUTBOUND_SLIP | 출고전표 | `#/sales?slipNo=2026%2F08%2F11-1` |
| INBOUND_SLIP | 입고전표 | `#/purchases?slipNo=2026%2F08%2F11-1` |
| JOURNAL | 분개장 | `#/accounting/journals?journalNo=2026%2F08%2F11-1` |
| TAX_INVOICE | 세금계산서 | `#/accounting/tax-invoices?taxInvoiceNo=2026%2F08%2F11-1` |
| STATEMENT | 거래명세서 | `#/accounting/statement-batch?statementNo=2026%2F08%2F11-1` |
| PARTNER_LEDGER | 거래처원장 | `#/accounting/ledgers?partnerCode=P-001&period=2026-08` |

`SALES_COMMISSION_SETTLEMENT + SLIP_REF`는 새 renderer와 frozen fallback 모두
`영업수수료 정산서` 라벨을 사용한다. S4 route가 아직 없으므로 상세 번호는 죽은 `href="#"` 링크가
아닌 plain text라는 현재 계약도 통과했다.

### V19 실제 기존행 적용

공유 DB를 사용하지 않고, 포트를 열지 않은 일회용 `postgres:16-alpine`에 pre-V19 기존 6종을 넣은 뒤
실제 `V19__extend_approval_reference_doc_type.sql`을 적용했다.

```text
PRE_SURVIVORS=6
POST_TYPES=7
attachment_type CHECK = SLIP_REF / PARTNER_LEDGER_REF / FILE
ref_doc_type CHECK      = 기존 6종 + SALES_COMMISSION_SETTLEMENT
ACTIVE_INDEX=1
```

검증 뒤 `codex-sol6-v19-review6` 컨테이너를 제거했다. 공유 DB 조회·write는 모두 0건이다.

## 6. QA 산출물과 환경 정리

- [01-first-open-reopen-aligned.png](../qa/2026-08-11-dg1-s3-sol6/01-first-open-reopen-aligned.png)
  - 최초/재열림 visible dropdown. SHA-256 `AFCA16AF98EA161C8363D7C690E8015FE8714FE8D06260FD216208F10C3722EC`
- [03-many-flip-up-visible.png](../qa/2026-08-11-dg1-s3-sol6/03-many-flip-up-visible.png)
  - 480px viewport에서 실제 위로 열린 overflow 목록. SHA-256 `0038324FF7C2CCCC03B0F7009050E7A4A904DF00CC20CE5E359979702CAC79DD`
- [04-window-restore-dropdown-visible.png](../qa/2026-08-11-dg1-s3-sol6/04-window-restore-dropdown-visible.png)
  - 실제 창 최소화/복귀 후 visible 목록. SHA-256 `893A9C4659F4B0895519E0B1E04DE9E8318B93205C0FF132FDF7D85A7CCA4DA6`

임시 Playwright 스펙은 제거했다. 모든 production mutation 원복 뒤
`DocumentReferencePicker.tsx` SHA-256은 시작/종료 모두
`9E8E9F3B9CABF8360B15AAEBC191704FCF6EA0EAAE80F68913AA2DC39387870A`다.
기존 QA 서버 PID 71632는 같은 Vite command line으로 살아 있다. 신규 QA 서버는 만들지 않았다.

## 7. 이번 라운드가 보지 않은 표면

- headless Chromium 외 GPU compositor/주사율별 실제 모니터 paint 영상
- mock 최대 7건을 넘는 실제 10~20건 응답의 각 행 가변 높이 조합
- OS 절전/모니터 분리 후 복귀(Chromium window 최소화/복귀는 실제 검증함)

이 미검증 표면에서는 제품 결함을 단정하지 않는다. 현재 머지 차단 사유는 제품 좌표 결함이 아니라
exact rollback을 8/10 놓치는 first-rAF gate 하나다.
