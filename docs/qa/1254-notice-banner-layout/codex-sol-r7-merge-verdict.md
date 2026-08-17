# PR #1254 CODEX SOL 적대검증 — 일곱 번째 머지 판정 라운드

## ① 환경 확인

실행 명령 원문:

```text
cd C:\dev\Samhan-Public\.claude\worktrees\w1253
git rev-parse HEAD                 # ab88776db
git status --porcelain
gh pr checks 1254
```

최초 실행 출력 원문:

```text
ab88776db025ff997bcafc03bfa838e66888997f
```

`git status --porcelain` 출력은 비어 있었다.

```text
GitGuardian Security Checks	fail	1s	https://dashboard.gitguardian.com
#910 문서 계약 테스트 (docs/dev-reports 관할)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31949869902/job/95171587272
Arologis Notion Runtime Zero Guard (SP-08-7)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31949869905/job/95171587304
Config Audit Guard (다운스트림 URL/포트 정합, #745)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31949869877/job/95171587217
Credential Plaintext Guard (SP-08-8)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31949869877/job/95171587268
Desktop Playwright (mock 회귀 hard gate)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31949869886/job/95171587167
Detox Android (arologis-mobile, AVD)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31949869886/job/95171587148
Detox Android (mobile v4, AVD)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31949869886/job/95171587207
Frontend DS (typecheck + lint + build + storybook)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31949869877/job/95171587228
Frontend Mobile (삼한 모바일 · typecheck + jest)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31949869877/job/95171587241
Frontend Mobile-Staff (typecheck + jest + expo doctor + prebuild dry-run)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31949869877/job/95171587231
Frontend Order-App (typecheck + test + build)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31949869877/job/95171587236
Internal Chat Desktop (typecheck + lint + test + build)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31949869877/job/95171587194
Local Stack Port Resolver Guard (#1113)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31949869877/job/95171587206
Playwright (web + electron + mobile emul)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31949869886/job/95171587222
S1 logging opt-in 계약 (docs/local-stack 관할)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31949869902/job/95171587261
데스크톱 빌드 (arologis-desktop)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31949869905/job/95171587342
모바일 prebuild (arologis-mobile)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31949869905/job/95171587354
문서 본문 단언 스펙 (mock 게이트 중 docs/** 를 읽는 것)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31949869902/job/95171587271
백엔드 빌드 + 테스트 (arologis-service)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31949869905/job/95171587323
빌드 + 테스트 (accounting+partner)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31949869877/job/95171587506
빌드 + 테스트 (accounting-cash-receipt-it)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31949869877/job/95171587293
빌드 + 테스트 (accounting-codef-it)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31949869877/job/95171587372
빌드 + 테스트 (accounting-deposit-mapping-it)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31949869877/job/95171587336
빌드 + 테스트 (accounting-partner-integrity-it)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31949869877/job/95171587365
빌드 + 테스트 (phase9-10 (groupware+notification+dashboard))	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31949869877/job/95171587281
빌드 + 테스트 (product-quantity-sync-schema)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31949869877/job/95171587263
빌드 + 테스트 (slip-it-core)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31949869877/job/95171587346
빌드 + 테스트 (slip-it-public)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31949869877/job/95171587283
빌드 + 테스트 (slip-units)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31949869877/job/95171587289
자격 평문 비공개 가드 (docs 관할, SP-08-8)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31949869902/job/95171587275
App Build Version Guard (scripts/app-build-version, #910/#928)	pass	46s	https://github.com/ewoo14/Samhan-Public/actions/runs/31949869877/job/95171587255
빌드 + 테스트 (shared+auth+gateway)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31949869877/job/95171587314
Arologis Config Audit Guard (다운스트림 URL/포트 정합, #745)	pass	45s	https://github.com/ewoo14/Samhan-Public/actions/runs/31949869905/job/95171587331
자격 평문 비공개 가드 (SP-08-8 + SP-10-2)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31949869905/job/95171587415
Notion Runtime Zero Guard (SP-08-7)	pass	38s	https://github.com/ewoo14/Samhan-Public/actions/runs/31949869877/job/95171587240
빌드 + 테스트 (user+product+inventory+logging)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31949869877/job/95171587248
하네스 거짓 green 가드 (docs/qa 관할)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31949869893/job/95171587134
```

## ② CI 카운트

최종 재조회 시점의 `gh pr checks 1254 --json bucket,name,state` 집계는 총 53개다.

```text
pass=51
pending=1  Desktop Playwright (mock 회귀 hard gate)
fail=1     GitGuardian Security Checks
TOTAL=53
```

따라서 CI green이 아니다. 이 사실은 아래 제품 도달 결함과 독립적인 추가 머지 차단 조건이다.

## ③ 새 판정 기준 ①②③ 실측

### ① 밀지 않는다 — 통과

```text
[BODY-Y] {"withBanner":199.71875,"withoutBanner":199.71875,"difference":0}
```

헤더·본문 첫 행의 y 좌표 차이는 0이다.

### ② 조작을 가로채지 않는다 — 실패 1건

기하학적 교차 면적은 결함 수에 사용하지 않았다. 실제 click 수신만 판정했다.

- 36-case에서 배너 밖 날짜 input, 탭, 행 버튼 등은 겹침 좌표 실제 click 수신 `received=1`이었다.
- 배너 내부 `보안인증서 설치`, `다시 확인`, `닫기`는 각각 실제 click 수신 `1`이었다.
- 그러나 `320×600 · 확대 125%`의 `CSV 다운로드`는 겹침 내부 원시 click과 locator click 모두 button capture `0`, Blob 생성 `0`, anchor click `0`이었다.

기존 스펙은 이 케이스에서 `hitMatches=true`만 보고 실패시키지 않아 `[DEFECTS] count=0`이 됐다. 새 기준은 hit 대상이 아니라 실제 이벤트 수신이므로 실패다.

### ③ 도달 가능하다 — 배너 스택은 통과, 외부 CSV 마우스 도달은 실패

```text
[SCROLL-ALTERNATIVES] {"start":0,"max":471,"active":true,"keyboardEnd":470.9333190917969,"keyboardHome":0,"wheelDown":192}
[INTERNAL-CLICKS] [{"text":"보안인증서 설치","received":1},{"text":"다시 확인","received":1},{"text":"닫기","received":1}]
```

세 장의 모든 배너와 내부 버튼은 키보드·휠로 도달하고 실제 click 이벤트를 받았다. 반면 같은 화면의 CSV 버튼은 키보드 Enter로만 동작하고 마우스로는 동작하지 않아 ②의 도달 결함으로 계상한다.

## ④ CSV 다운로드 click listener 판정

재현 기하:

```text
button x=230.5417..350.7917, y=415.2667..451.2667
stack  x=16..240.0000,       y=424.0000..464.0000
겹침 내부 elementFromPoint 후보 233개
fractional hitTag=BUTTON, text="CSV 다운로드", isButton=true
```

실제 마우스 결과 원문:

```text
[CSV-RAW-MOUSE] {"clickPoint":{"x":239.25,"y":437.25},"state":{"buttonCapture":0,"createObjectURL":0,"anchorClick":0,"downloadName":"","blobSize":0,"documentClicks":[]}}
[CSV-ACTUAL] {"relativePoint":{"x":4.7291717529296875,"y":22.366668701171875},"download":null,"state":{"buttonCapture":0,"createObjectURL":0,"anchorClick":0,"downloadName":"","blobSize":0,"documentClicks":[]}}
[CSV-TOP-STRIP] {"topStripPoint":{"x":235.27084350585938,"y":418.2666931152344},"download":null,"state":{"buttonCapture":0,"createObjectURL":0,"anchorClick":0,"downloadName":"","blobSize":0,"documentClicks":[{"clientX":235,"clientY":418,"tag":"MAIN"}]}}
```

키보드 대조군 원문:

```text
[CSV-KEYBOARD] {"download":null,"state":{"buttonCapture":1,"createObjectURL":1,"anchorClick":1,"downloadName":"arologis-unassigned-2026-08-08.csv","blobSize":1017,"documentClicks":[{"clientX":0,"clientY":0,"tag":"BUTTON","text":"CSV 다운로드"},{"clientX":0,"clientY":0,"tag":"A","text":""}]}}
```

판정: CSV 생성 로직은 살아 있지만 마우스 click 경로가 죽었다. “사용자가 버튼을 마우스로 눌러도 아무 일도 일어나지 않는다”가 재현되므로 도달 결함이다. Electron Blob URL은 Playwright `download` 이벤트로 승격되지 않았지만, 직접 계측한 `createObjectURL=1`, `anchorClick=1`, 파일명, Blob 크기로 핸들러 실행을 확인했다.

## ⑤ scrollbar 보완 판정과 한계

기존 스펙의 네이티브 scrollbar 직접 hit 원문:

```text
[SCROLLBAR] {"x":581,"y":655.2916809082031,"directTag":"MAIN","directInsideStack":false,"belowTag":"MAIN","belowClicks":0}
[SCROLLBAR-LIMITATION] headless 네이티브 scrollbar lane 직접 hit을 입증하지 못함
```

직접 hit은 이번에도 입증하지 못했다. scrollbar thumb 직접 드래그도 별도로 입증하지 않았다. 대신 실제 대체 입력 경로를 확인했다.

- 키보드: `Home 0 → End 470.9333/max 471 → Home 0`
- 휠: `0 → 192`
- 직전 스펙의 경계 전달: stack 하단에서 본문 `100 → 280`, 상단에서 본문 `200 → 80`

따라서 배너 스택의 도달성은 휠·키보드로 보완 통과한다. 네이티브 scrollbar 직접 hit/드래그는 확인하지 못한 것으로 남긴다.

## ⑥ 잃으면 안 되는 것 재현

```text
본문 y 차이                         0
진리표 개발+env 미설정              prompt=true
진리표 개발+env=1                   prompt=false
진리표 패키지+env 미설정             prompt=true
진리표 패키지+env=1                  prompt=true
사용자 대면 「신뢰 루트」             0건
사용자 대면 「보안인증서」             2건
stack 순서                           ['app-version-policy-error','app-trust-root-disabled','app-auto-update-status']
gaps                                 [12,12]
행 클릭                              45행 중 실제 클릭 → #/dispatches/manual 이동
모달                                 「미배차 결과 저장」 visible=true
드롭다운                             active=true, options=3
인쇄                                 data-print-exclude 전부 display=none
Tab 탐색                             stack 내부 → 외부 메뉴 탈출
공유 실데이터 write                  메인 스펙 3건, 적대 탐침 2건 모두 route 차단
라이브 스펙                          36 cases, [DEFECTS] count=0, 1 passed, 11.5s, exit 0
```

stale dist 방지를 위해 아래 순서로 새로 실행했다.

```text
design-system build                  exit 0
arologis-desktop build               exit 0
design-system                        32 files, 289 tests passed
arologis-desktop                     21 files, 99 tests passed
인증서 확인 시작 진리표              1 file, 4 tests passed
```

## ⑦ 캡처

캡처 목적지는 `resolveQaShotsDir()` 규약을 경유해 `_local`로 격리했다.

```text
docs/qa/1254-notice-banner-layout/sol-r6-final/_local/320x480-three-banners-sol-r6-final-real-qa.png
docs/qa/1254-notice-banner-layout/sol-r6-final/_local/480x480-three-banners-sol-r6-final-real-qa.png
docs/qa/1254-notice-banner-layout/sol-r6-final/_local/320x600-three-banners-sol-r6-final-real-qa.png
docs/qa/1254-notice-banner-layout/sol-r6-final/_local/600x720-three-banners-sol-r6-final-real-qa.png
docs/qa/1254-notice-banner-layout/sol-r7-adversarial/_local/320x600-125pct-csv-and-stack-real-qa.png
```

마지막 캡처를 직접 열어 확인했다. 320×600·125%에서 CSV 버튼 문구는 오른쪽으로 잘려 보이지 않고 버튼 왼쪽 일부만 배너 스크롤 표면과 맞닿아 있다.

## ⑧ 도달 결함

### 결함 1 — 320×600·125%에서 CSV 다운로드 마우스 click 무수신

재현 절차:

1. production `design-system` 빌드 후 `arologis-desktop`을 빌드한다.
2. Electron을 headless로 실행하고 해시 라우터 `#/dispatches/unassigned`로 이동한다.
3. 날짜를 `2026-08-08`로 바꾸어 45행을 렌더한다. 자동저장 POST는 차단한다.
4. 세 배너를 표시하고 viewport `320×600`, zoom factor `1.25`를 적용한다.
5. `elementFromPoint`가 `CSV 다운로드` 버튼인 겹침 내부 좌표를 마우스로 클릭한다.
6. 버튼 capture, `URL.createObjectURL`, 임시 anchor click 수를 읽는다.

실제 결과:

```text
hitTag=BUTTON, isButton=true, candidateCount=233
buttonCapture=0, createObjectURL=0, anchorClick=0, blobSize=0
```

대조군인 버튼 focus + Enter는 `buttonCapture=1`, `createObjectURL=1`, `anchorClick=1`, `blobSize=1017`이다. 따라서 데이터나 핸들러 문제가 아니라 마우스 도달 경로 결함이다.

## ⑨ 증거 무결성 자기 고지

- 기하학적 교차 면적은 결함 판정에 사용하지 않았다.
- 기존 36-case 스펙의 exit 0을 숨기지 않았다. 동시에 그 스펙이 CSV `received=0`을 실패 조건으로 세지 않는 false-green 공백도 명시했다.
- 판정용 임시 Playwright 스펙은 실행 후 삭제했다. 제품 코드와 기존 스펙은 수정하지 않았다.
- 첫 두 적대 탐침에서 날짜 응답 45행이 최신 자동저장 복원에 덮여 1행으로 남는 별도 기지 결함을 재현했다. 직전 스펙과 같은 입력 전 1.2초 안정화 후 이 PR의 배너/CSV 판정만 수행했으며, 별도 결함을 #1254 결함 수에 중복 계상하지 않았다.
- Electron Blob URL은 Playwright `download` 이벤트가 `null`이었다. 이를 성공으로 쓰지 않았고, 직접 계측한 Blob/anchor 호출만 증거로 사용했다.
- 공유 실데이터 write는 모두 route에서 차단했다.
- `git commit`, `git push`, `git add`, `git add -A`를 실행하지 않았다.

## ⑩ 프로세스 회수

Playwright/Electron은 `finally`에서 종료했고 임시 user-data-dir을 제거했다. 이 라운드에서 격리 컨테이너는 기동하지 않았다.

```text
QA_PROCESS_COUNT=0
QA_CONTAINER_COUNT=0
```

판정용 임시 스펙도 삭제했다. 보고서 작성 직전 `git status --porcelain`은 비어 있었다.

## ⑪ 판정

**머지 반려 — 도달 결함 1건.**

`320×600 · 확대 125%`에서 `CSV 다운로드`는 DOM hit 대상만 맞고 실제 마우스 click 이벤트와 다운로드 핸들러를 받지 않는다. 이는 개발책임자가 확정한 새 기준 ② “배너가 시각적으로 덮은 위치의 요소도 클릭이 도달한다”를 위반한다.

추가로 CI도 `pass 51 / pending 1 / fail 1`이라 green이 아니다.
