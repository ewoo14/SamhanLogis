# PR #1254 CODEX SOL 9라운드 적대검증 — 머지 판정

## ① 환경 확인

요청된 원문 명령:

```text
cd C:\dev\Samhan-Public\.claude\worktrees\w1253
git rev-parse HEAD                 # 39ff6bbdf
git status --porcelain
gh pr checks 1254
```

첫 실행 원문(두 번째 명령 출력은 빈 문자열):

```text
39ff6bbdf9b0cff1d9ba299849d4de65450d11a6

GitGuardian Security Checks	fail	1s	https://dashboard.gitguardian.com	
#910 문서 계약 테스트 (docs/dev-reports 관할)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31950980586/job/95174274598	
App Build Version Guard (scripts/app-build-version, #910/#928)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31950980595/job/95174274660	
Arologis Config Audit Guard (다운스트림 URL/포트 정합, #745)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31950980683/job/95174274697	
Arologis Notion Runtime Zero Guard (SP-08-7)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31950980683/job/95174274703	
Credential Plaintext Guard (SP-08-8)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31950980595/job/95174274609	
Desktop Playwright (mock 회귀 hard gate)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31950980681/job/95174274728	
Detox Android (arologis-mobile, AVD)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31950980681/job/95174274711	
Detox Android (mobile v4, AVD)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31950980681/job/95174274678	
Frontend DS (typecheck + lint + build + storybook)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31950980595/job/95174274597	
Frontend Mobile (삼한 모바일 · typecheck + jest)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31950980595/job/95174274636	
Frontend Mobile-Staff (typecheck + jest + expo doctor + prebuild dry-run)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31950980595/job/95174274611	
Frontend Order-App (typecheck + test + build)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31950980595/job/95174274584	
Internal Chat Desktop (typecheck + lint + test + build)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31950980595/job/95174274672	
Local Stack Port Resolver Guard (#1113)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31950980595/job/95174274593	
Playwright (web + electron + mobile emul)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31950980681/job/95174274674	
S1 logging opt-in 계약 (docs/local-stack 관할)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31950980586/job/95174274651	
데스크톱 빌드 (arologis-desktop)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31950980683/job/95174274600	
모바일 prebuild (arologis-mobile)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31950980683/job/95174274638	
문서 본문 단언 스펙 (mock 게이트 중 docs/** 를 읽는 것)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31950980586/job/95174274566	
백엔드 빌드 + 테스트 (arologis-service)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31950980683/job/95174274668	
빌드 + 테스트 (accounting+partner)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31950980595/job/95174274800	
빌드 + 테스트 (accounting-cash-receipt-it)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31950980595/job/95174274684	
빌드 + 테스트 (accounting-codef-it)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31950980595/job/95174274683	
빌드 + 테스트 (accounting-deposit-mapping-it)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31950980595/job/95174274719	
Notion Runtime Zero Guard (SP-08-7)	pass	39s	https://github.com/ewoo14/Samhan-Public/actions/runs/31950980595/job/95174274607	
자격 평문 비공개 가드 (docs 관할, SP-08-8)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31950980586/job/95174274527	
빌드 + 테스트 (phase9-10 (groupware+notification+dashboard))	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31950980595/job/95174274689	
빌드 + 테스트 (slip-units)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31950980595/job/95174274596	
Config Audit Guard (다운스트림 URL/포트 정합, #745)	pass	41s	https://github.com/ewoo14/Samhan-Public/actions/runs/31950980595/job/95174274536	
빌드 + 테스트 (slip-it-core)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31950980595/job/95174274675	
빌드 + 테스트 (accounting-partner-integrity-it)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31950980595/job/95174274741	
하네스 거짓 green 가드 (docs/qa 관할)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31950980570/job/95174274479	
빌드 + 테스트 (user+product+inventory+logging)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31950980595/job/95174274591	
빌드 + 테스트 (slip-it-public)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31950980595/job/95174274725	
빌드 + 테스트 (product-quantity-sync-schema)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31950980595/job/95174274652	
자격 평문 비공개 가드 (SP-08-8 + SP-10-2)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31950980683/job/95174274646	
빌드 + 테스트 (shared+auth+gateway)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31950980595/job/95174274599	
```

HEAD는 요청값과 일치했고 시작 작업트리는 깨끗했다. `gh pr checks`는 실패/pending 때문에 종료코드 1이었다.

## ② CI 카운트

게시 직전 `gh pr checks 1254 --json name,state,bucket,link` 실측:

```text
총 53 · pass 51 · pending 1 · fail 1
pending  Desktop Playwright (mock 회귀 hard gate) · IN_PROGRESS
fail     GitGuardian Security Checks · FAILURE
```

2분간 `gh pr checks 1254 --watch --interval 10`으로 감시했으나 pending은 끝나지 않았다. GitGuardian 대시보드 상세은 현재 GitHub CLI 응답에 없어 false positive로 임의 판정하지 않았다. CI도 merge green이 아니다.

## ③ 판정 기준 ①②③ 실측

### ① 밀지 않는다 — 통과

실제 production Electron의 미배차 화면에서 배너 표시/숨김 전후 본문 첫 제목 좌표:

```text
[BODY-Y] {"withBanner":199.71875,"withoutBanner":199.71875,"difference":0}
```

고정 overlay라 본문 첫 행도 같은 흐름을 유지한다.

### ② 조작을 가로채지 않는다 — 일반 조작 통과, 스크롤바 조작 실패

배너 밖 조작의 실제 동작:

```text
nav a 7개      각각 mouse click 후 hash 이동 확인
date input     dateFocused=true
CSV button     blobDownloads=1
실행/저장내역  aria-selected=true 전환
행 버튼         45행 중 mouse click 후 #/dispatches/manual 이동
저장 버튼       미배차 결과 저장 dialog visible=true
select          active=true · options=3
```

배너가 덮은 날짜 input/CSV/탭/권한 버튼 좌표도 기존 36행 스펙에서 `received=1`이었다. 배너 내부 `보안인증서 설치`, `다시 확인`, `닫기`도 각각 실제 클릭을 1회 받았다. 빠른 닫기 연속 조작은 첫 클릭으로 배너가 사라져 `received=1`, `bannerAfter=0`이었다.

다만 스크롤바 레인 자체는 아래 `MAIN`에 `pointerdown`을 넘겼다. 이는 ④의 도달 결함이다.

### ③ 도달 가능하다 — 실패

배너 3장, 320×480, 100%에서 모든 배너 내부 버튼은 `scrollIntoView` 뒤 hit/click 가능했다. 그러나 사용자가 스택을 스크롤바로 조작하는 두 경로가 깨져 전체 도달 계약은 실패다.

## ④ 이번 fix의 새 표면 탐색

직접 작성한 `1254-sol-r9-event-surface-real-qa.spec.ts`를 clients/desktop 패키지 안에서 headless Electron/Playwright로 3회 실행했다. 마지막 신선한 원문:

```text
[R9-SCROLLBAR-CLICK] {"laneTarget":{"tag":"MAIN","testid":null,"text":"배차권한을 확인하지 못했습니다. 잠시 후 다시 시도해 "},"clickBefore":0,"clickAfter":0,"clickCounts":{"click":0,"pointerdown":1}}
[R9-SCROLLBAR-DRAG] {"dragMid":0,"dragAfter":340,"dragCounts":{"click":0,"pointerdown":2}}
[R9-INTERNAL-BUTTONS] [{"name":"보안인증서 설치","before":202.6666717529297,"after":202.6666717529297,"received":1,"presentAfter":1},{"name":"다시 확인","before":372,"after":209.3333282470703,"received":1,"presentAfter":0}]
[R9-RAPID] received=1 bannerAfter=0
```

해석:

1. 스크롤바 레인 단일 클릭은 `scrollTop 0→0`; 스택을 전혀 스크롤하지 않았다.
2. 아래 `MAIN`은 단일 클릭에서 `pointerdown=1`을 받았다.
3. 드래그 중간은 `scrollTop=0`; thumb/track drag로 움직이지 않았다. mouseup 뒤 click 처리로만 340으로 점프했다.
4. 드래그 시작/종료 동안 아래 `MAIN`의 누적 `pointerdown=2`였다.
5. 내부 버튼은 자기 클릭을 받았다. `다시 확인` 뒤 scrollTop 변화는 updater 상태 DOM 교체에 따른 레이아웃 변화이며 이중 전달로 세지 않았다.
6. 빠른 닫기는 한 번만 동작했다. 이중 전달 없음.

## ⑤ 전수 매트릭스 — 클릭 수신·동작 기준

기존 SOL R6를 stale dist 제거 뒤 다시 실행했다.

| 뷰포트 | 배율 | 배너 수 | 케이스 | 외부 겹침 조작 mouse 수신 | 내부 버튼 도달/hit | 순서·간격 |
|---|---:|---:|---:|---|---|---|
| 320×480 | 100/125/150% | 1/2/3 | 9 | 통과 | 통과 | 3장 `[12,12]` |
| 480×480 | 100/125/150% | 1/2/3 | 9 | 통과 | 통과 | 3장 `[12,12]` |
| 320×600 | 100/125/150% | 1/2/3 | 9 | 통과 | 통과 | 3장 `[12,12]` |
| 600×720 | 100/125/150% | 1/2/3 | 9 | 통과 | 통과 | 3장 `[12,12]` |

```text
[MATRIX-SUMMARY] viewportBannerCases=36
[DEFECTS] count=0 []
[DURATION] ms=10721
1 passed (11.6s)
```

중요한 증거 한계: 이 기존 스펙의 행렬 `ownButtonProbes`는 실제로 빈 배열이고, 외부 probe는 target 캡처 리스너에서 `preventDefault()`하므로 각 행의 실제 기본 동작까지 증명하지 않는다. 이를 숨기지 않고 별도 R9 스펙에서 nav 7개, 날짜, CSV Blob 생성, 탭 전환, 내부 버튼을 실제 동작시켰고, 기존 R6 후반에서 행 이동·모달·드롭다운을 실제 동작시켰다. 기하학적 겹침 면적은 결함 수에 사용하지 않았다.

행렬의 일반 클릭 수신/버튼 도달은 통과했지만, 가장 작은 필수 셀 `320×480·3장·100%`의 스크롤바 클릭/드래그가 실패하므로 전체 행렬 판정은 실패다.

## ⑥ 잃으면 안 되는 것 재현

```text
진리표 4조합       4 passed (개발×env, 패키지×env)
사용자 문구        신뢰 루트 0건 · 보안인증서 2건
stack 순서         ['app-version-policy-error','app-trust-root-disabled','app-auto-update-status']
stack gaps         [12,12]
행 클릭            45행 중 실제 이동 성공
모달               미배차 결과 저장 visible=true
드롭다운           active=true · options=3
인쇄               data-print-exclude 전부 display=none
Tab                stack 내부 → 외부 메뉴 탈출 확인
SOL R6 제한        11.6초 (<60초)
design-system      build exit 0 · 32 files/290 tests passed
arologis-desktop   build exit 0 · 21 files/99 tests passed
```

stale dist 방지 순서는 `clients/web/design-system npm run build` 종료코드 0 후 `clients/arologis-desktop npm run build` 종료코드 0이었다.

## ⑦ 캡처

`resolveQaShotsDir()`를 경유해 `_local`에 저장했다.

```text
docs/qa/1254-notice-banner-layout/sol-r9-final/_local/320x480-scrollbar-event-surface-real-qa.png
bytes=14172
```

기존 SOL R6의 4개 뷰포트 캡처도 같은 규약의 `sol-r6-final/_local`에서 새로 생성됐다.

## ⑧ 도달 결함

### 결함 1 — 스크롤바 레인 클릭이 스택을 스크롤하지 않음

재현:

1. production Electron을 320×480, 100%로 열고 배너 3장을 만든다.
2. 스택 `scrollTop=0`으로 둔다.
3. 우측 레인의 `x=rect.right-3`, `y=rect.top+height×0.8`을 `page.mouse.click`한다.
4. 기대: 스택 scrollTop 증가. 실제: `0→0`.

원문:

```text
Error: 스크롤바 레인 클릭이 스택을 스크롤해야 한다
Expected: > 0
Received:   0
```

### 결함 2 — 스크롤바 드래그가 연속 스크롤하지 않고 아래 요소에 pointerdown 전달

재현:

1. 같은 조건에서 레인 상단으로 mouse move/down.
2. 레인 하단까지 8단계로 drag한다.
3. 기대: drag 중 scrollTop 증가, 아래 요소 무반응.
4. 실제: `dragMid=0`, 아래 MAIN `pointerdown` 수신. mouseup 이후에만 `dragAfter=340`으로 점프.

원문:

```text
[R9-SCROLLBAR-DRAG] {"dragMid":0,"dragAfter":340,"dragCounts":{"click":0,"pointerdown":2}}
```

두 결함은 클릭과 드래그라는 별도 사용자 조작 경로이므로 2건으로 센다.

## ⑨ 증거 무결성 자기 고지

- `git add`, `git commit`, `git push`를 실행하지 않았다.
- geometric overlap 면적을 결함으로 세지 않았다.
- headless Chromium/Electron Playwright를 `clients/desktop` 안에서 실행했다.
- 공유 API의 GET/HEAD/OPTIONS/login 외 요청을 route fulfill로 차단했다. 마지막 R9 항해 중 자동저장 write 8건을 차단해 공유 실데이터 write 0건이다.
- R9 스펙은 실패 단언을 포함한 미추적 증거 파일이며 제품 소스는 수정하지 않았다.
- 캡처는 `resolveQaShotsDir()` 경유 `_local` 파일이다.

## ⑩ 프로세스 회수

모든 Electron은 `finally`에서 닫고 임시 user-data-dir을 삭제했다. 종료 후 `Win32_Process`에서 command line에 `w1253`, `1254-sol-r9`, `1254-sol-r6`가 남은 node/electron/chrome/playwright 프로세스는 0개였다.

이번 검증이 기동한 격리 컨테이너는 0개, 잔여도 0개다. `docker ps`의 기존 27개(다른 트랙 `qa1250-*` 2개 포함)는 본 검증이 기동하지 않았으므로 건드리지 않았다.

## ⑪ 판정

**머지 불가 — 도달 결함 2건.**

CI도 게시 직전 51 pass·1 pending·1 fail로 green이 아니다. 제품 차단 근거는 CI와 별개로, 스크롤바 레인 클릭 불능 1건과 드래그/하부 pointerdown 누출 1건이다.
