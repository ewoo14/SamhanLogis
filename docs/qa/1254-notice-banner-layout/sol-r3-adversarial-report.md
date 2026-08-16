# PR #1254 CODEX SOL 적대검증 라운드 보고서

## ① 환경 확인

요청된 작업 디렉터리에서 맨 먼저 실행한 명령과 출력 원문이다.

```powershell
cd C:\dev\Samhan-Public\.claude\worktrees\w1253
git rev-parse HEAD
git rev-parse --abbrev-ref HEAD
git status --porcelain
gh pr checks 1254
```

```text
0f33524b2c6d89ea4ace2ea4bb8a20f04884ae55
fix/notice-banner-layout-and-wording

#910 문서 계약 테스트 (docs/dev-reports 관할)	pass	46s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942097747/job/95152657904
App Build Version Guard (scripts/app-build-version, #910/#928)	pass	42s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942097771/job/95152657972
Arologis Config Audit Guard (다운스트림 URL/포트 정합, #745)	pass	43s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942097730/job/95152657839
Arologis Notion Runtime Zero Guard (SP-08-7)	pass	38s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942097730/job/95152657854
Config Audit Guard (다운스트림 URL/포트 정합, #745)	pass	46s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942097771/job/95152658013
Credential Plaintext Guard (SP-08-8)	pass	1m6s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942097771/job/95152658075
Detox Android (arologis-mobile, AVD)	pass	1m40s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942097761/job/95152658017
Detox Android (mobile v4, AVD)	pass	58s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942097761/job/95152657984
Frontend DS (typecheck + lint + build + storybook)	pass	1m56s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942097771/job/95152658004
Frontend Mobile (삼한 모바일 · typecheck + jest)	pass	1m2s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942097771/job/95152658021
Frontend Mobile-Staff (typecheck + jest + expo doctor + prebuild dry-run)	pass	1m21s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942097771/job/95152658109
Frontend Order-App (typecheck + test + build)	pass	44s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942097771/job/95152658065
GitGuardian Security Checks	pass	1s	https://dashboard.gitguardian.com
Internal Chat Desktop (typecheck + lint + test + build)	pass	1m56s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942097771/job/95152658018
JUnit 테스트 결과 (accounting+partner)	pass	0	https://github.com/ewoo14/Samhan-Public/runs/95153048798
JUnit 테스트 결과 (accounting-cash-receipt-it)	pass	0	https://github.com/ewoo14/Samhan-Public/runs/95152997369
JUnit 테스트 결과 (accounting-deposit-mapping-it)	pass	0	https://github.com/ewoo14/Samhan-Public/runs/95152996271
JUnit 테스트 결과 (arologis-service)	pass	0	https://github.com/ewoo14/Samhan-Public/runs/95152785273
JUnit 테스트 결과 (phase9-10 (groupware+notification+dashboard))	pass	0	https://github.com/ewoo14/Samhan-Public/runs/95152821040
JUnit 테스트 결과 (shared+auth+gateway)	pass	0	https://github.com/ewoo14/Samhan-Public/runs/95152874663
JUnit 테스트 결과 (slip-it-core)	pass	0	https://github.com/ewoo14/Samhan-Public/runs/95153037931
JUnit 테스트 결과 (user+product+inventory+logging)	pass	0	https://github.com/ewoo14/Samhan-Public/runs/95152975494
Local Stack Port Resolver Guard (#1113)	pass	57s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942097771/job/95152658049
Notion Runtime Zero Guard (SP-08-7)	pass	40s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942097771/job/95152658044
빌드 + 테스트 (accounting-partner-integrity-it)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31942097771/job/95152658062
빌드 + 테스트 (user+product+inventory+logging)	pass	1m37s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942097771/job/95152658030
빌드 + 테스트 (shared+auth+gateway)	pass	1m27s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942097771/job/95152658048
Frontend Desktop (typecheck + lint + build)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31942097771/job/95152855695
Desktop Playwright (mock 회귀 hard gate)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31942097761/job/95152657900
빌드 + 테스트 (accounting-cash-receipt-it)	pass	1m20s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942097771/job/95152658112
빌드 + 테스트 (phase9-10 (groupware+notification+dashboard))	pass	1m37s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942097771/job/95152658054
모바일 prebuild (arologis-mobile)	pass	1m22s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942097730/job/95152657846
빌드 + 테스트 (accounting-deposit-mapping-it)	pass	1m16s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942097771/job/95152658095
빌드 + 테스트 (slip-it-core)	pass	1m39s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942097771/job/95152658080
데스크톱 빌드 (arologis-desktop)	pass	1m44s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942097730/job/95152657873
빌드 + 테스트 (accounting+partner)	pass	1m28s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942097771/job/95152658107
Frontend Mobile-Public (typecheck + lint + test + build)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31942097771/job/95152855690
백엔드 빌드 + 테스트 (arologis-service)	pass	1m18s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942097730/job/95152657883
빌드 + 테스트 (accounting-codef-it)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31942097771/job/95152658155
자격 평문 비공개 가드 (docs 관할, SP-08-8)	pass	52s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942097747/job/95152657826
S1 logging opt-in 계약 (docs/local-stack 관할)	pass	45s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942097747/job/95152657882
하네스 거짓 green 가드 (docs/qa 관할)	pass	1m29s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942097762/job/95152657875
자격 평문 비공개 가드 (SP-08-8 + SP-10-2)	pass	56s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942097730/job/95152657863
문서 본문 단언 스펙 (mock 게이트 중 docs/** 를 읽는 것)	pass	1m10s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942097747/job/95152657886
Playwright (web + electron + mobile emul)	pass	2m59s	https://github.com/ewoo14/Samhan-Public/actions/runs/31942097761/job/95152657936
빌드 + 테스트 (product-quantity-sync-schema)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31942097771/job/95152658134
빌드 + 테스트 (slip-it-public)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31942097771/job/95152658165
빌드 + 테스트 (slip-units)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31942097771/job/95152658116
```

`git status --porcelain`의 초기 출력은 빈 문자열이었다.

## ② CI 카운트

최초 원문은 `pass=39`, `fail=0`, `pending=8`, 합계 47건이었다. 보고서 작성 직전 재조회는 `pass=52`, `fail=0`, `pending=1`, 합계 53건이었다. 최초 게시 직후 마지막 check가 끝나 최종 상태는 `pass=52`, `fail=1`, 합계 53건으로 바뀌었다. 실패 check는 `Desktop Playwright (mock 회귀 hard gate)`이다. 실행 중 JUnit 결과 check가 추가되어 합계가 늘었다.

CI 실패 원문은 이 보고서의 사용자 도달 결함과 별개인 **증거 무결성 예외**로만 기록한다.

```text
Test timeout of 60000ms exceeded.
Retry #1
Test timeout of 60000ms exceeded.
1 failed
  [chromium] › playwright/1254-arologis-production-electron.spec.ts
674 passed (13.0m)
```

## ③ 다섯 축 실측

### 스크롤 + 본문 행 클릭

실 서버 `2026-08-08` 응답 45건과 렌더 행 45개를 맞춘 뒤 앱의 실제 중첩 스크롤 컨테이너를 `scrollTop=1236.6666259765625`로 이동했다. 배너 내부 비버튼 좌표 `(40, 508.4583)`의 실제 hit는 `TD`, 행은 `arologis-unassigned-row-2026/08/08-34`였고 마우스 클릭 이벤트 수는 1이었다. 배너 비버튼 영역은 스크롤된 행 클릭을 막지 않았다.

### 모달·드롭다운·툴팁 레이어

- 실제 「미배차 결과 저장」 모달을 열고 저장하지 않은 채 취소했다. `backdrop z-index=1000`, `stack z-index=999`, 스택 좌표의 `elementFromPoint`는 실제 backdrop 내부 `DIV`였다.
- 실제 수동 배차 화면의 native `select`를 `Alt+ArrowDown`으로 열었다. `active=true`, option 3개였고 `Escape`로 닫았다. shared data write는 없었다.
- 해당 대상 화면에 DOM `role=tooltip` 구현은 0개였다. 열 수 있는 커스텀 tooltip 표면은 없었고 native select popup은 DOM 외부 OS 레이어다.

### 인쇄

print media 계산 스타일 원문:

```text
[PRINT] [{"id":null,"display":"none"},{"id":"app-version-policy-error","display":"none"},{"id":"app-trust-root-disabled","display":"none"},{"id":"app-auto-update-status","display":"none"}]
```

인쇄에 배너가 끼어들지 않았다.

### 3장 stack

순서와 간격은 유지됐다.

```text
order=["app-version-policy-error","app-trust-root-disabled","app-auto-update-status"]
gaps=[12,12]
```

그러나 600×720 실 화면에서 스택이 화면 아래로 잘렸다.

```text
stack y=460.4583435058594 height=531.78125 bottom=992.2395935058594 viewportBottom=720
app-version-policy-error top=460.4583435058594 bottom=523.4583435058594 fullyInViewport=true
app-trust-root-disabled  top=535.4583740234375 bottom=790.9896240234375 fullyInViewport=false
app-auto-update-status   top=802.9896240234375 bottom=992.2396240234375 fullyInViewport=false
```

스택은 `position:fixed`이고 자체 스크롤이 없으므로, 두 번째 배너의 하단과 세 번째 배너 전체는 사용자가 창 안에서 도달할 수 없다.

### 키보드 탐색

보안인증서 설치 버튼에서 Tab을 시작한 실제 순서는 `보안인증서 설치 → 다시 확인 → 닫기 → 배차 → 기사 관리 → 인사 → 부서 → 회계 → 계정과목 → 권한`이었다. 3개 배너 조작을 지난 뒤 전역 메뉴로 빠져나와 `escaped=true`; 배너에 갇히지 않았다.

## ④ 잃으면 안 되는 것 재현

- 진리표 4조합: 개발+미설정 `true`, 개발+env=1 `false`, 패키지+미설정 `true`, 패키지+env=1 `true`; targeted Vitest 포함 18/18 통과.
- 사용자 대면 실화면: `신뢰 루트=0`, `보안인증서=2`.
- 본문 제목 y: 배너 표시 `223.6666717529297`, 숨김 통제 `223.6666717529297`, 차이 `0`.
- 3장 stack 순서와 gaps: 위 원문대로 유지.
- 새 SOL R3 라이브 스펙 wall time은 `6.0초`였고 최종 exit 1은 아래 도달 결함 단언 1건 때문이다.
- 그러나 PR이 추적하는 기존 `1254-arologis-production-electron.spec.ts`는 GitHub CI에서 최초·retry 모두 `Test timeout of 60000ms exceeded`로 끝났다. 따라서 직전 라운드의 “스펙이 60초 안에 끝난다” 주장은 현재 CI에서 재현되지 않았다. 이는 도달 결함 수에 넣지 않고 증거 무결성 정정으로 기록한다.

## ⑤ 스크린샷

`resolveQaShotsDir()` 기본 `_local` 경로를 사용했다.

```text
파일명  sol-r3-600x720-three-banners-45rows.png
크기    40,061 bytes
경로    docs/qa/1254-notice-banner-layout/sol-r3-screenshots/_local/
백엔드  45건
DOM 행  45행
```

직접 원본 PNG를 열어 육안 확인했다. 입력 날짜는 `2026-08-08`, 요약은 출고전표 45건/미배차 45건이고, 버전 정책 배너가 표 헤더 위에 보이며 자동 업데이트 꺼짐 배너는 화면 하단에서 잘리고 세 번째 업데이트 상태 배너는 전혀 보이지 않는다.

## ⑥ 도달 결함

### 결함 1 — 짧은 창에서 3장 배너의 하단이 화면 밖에 고정되어 내용과 버튼에 도달할 수 없다

재현 절차:

1. 실제 Electron 앱에 최신 `infrastructure/.env.local` 자격으로 로그인한다.
2. `#/dispatches/unassigned`로 이동해 화면 고유 제목 「미배차 리스트」와 날짜 입력을 확인한다.
3. 날짜를 `2026-08-08`로 바꿔 백엔드 45건=DOM 45행을 확인한다.
4. 버전 정책 연결 실패 + 보안인증서 미설치 + updater 오류로 배너 3장을 만든다.
5. 창을 600×720으로 바꾼다.

실패 원문:

```text
Error: 600x720에서 3장 배너가 뷰포트 밖으로 잘림: [{"id":"app-version-policy-error","top":460.4583435058594,"bottom":523.4583435058594,"fullyInViewport":true},{"id":"app-trust-root-disabled","top":535.4583740234375,"bottom":790.9896240234375,"fullyInViewport":false},{"id":"app-auto-update-status","top":802.9896240234375,"bottom":992.2396240234375,"fullyInViewport":false}]
```

## ⑦ 증거 무결성 자기 고지

- 기존 round-fix-2 보고서의 실 서버 `backendEntries=45/renderedRows=45`는 이번에도 동일하게 재현됐다.
- 기존 캡처 주장의 파일 수 24개와 총 1,408,900 bytes를 디스크에서 다시 세어 정확히 일치했다.
- 기존 `difference=0`, 진리표 4조합, 문구 0/보안인증서 표기, 순서·간격도 재현됐다.
- 기존 코멘트의 `1254-arologis-production-electron.spec.ts 1 passed (11.6s)` 및 타임아웃 폐쇄 주장은 현재 HEAD GitHub CI에서 재현되지 않았다. 최초·retry 모두 60초 timeout이고 check는 fail이다. 이 불일치를 게시 직후 확인해 같은 코멘트를 정정했다.
- 기존 24조합의 “조작 요소 교차 0”과 이번 결함은 모순이 아니다. 교차 면적은 0이지만 스택 자체가 viewport bottom을 272.2396px 넘는 별도 사용자 표면이다.
- 첫 스크롤 probe는 `window.scrollBy`가 앱의 중첩 스크롤 컨테이너를 움직이지 않아 `scrollY=0`, hit=`TH`로 나왔다. 이를 도달 결함으로 보고하지 않고, 실제 스크롤 컨테이너로 재측정하여 hit=`TD`, clickCount=1로 정정했다.
- 첫 행 수 probe가 응답 직후 중간 렌더 1행을 세었던 실행도 `toHaveCount(45)` 조건 대기로 재실행하여 45=45를 확인했다. 고정 sleep은 사용하지 않았다.
- 라이브 스펙은 `clients/desktop` 안에서 공식 `playwright.real-qa.config.ts`와 `REAL_QA_ALLOW_UNTRACKED=1` 명시 경로로 실행했다. 스크린샷은 `resolveQaShotsDir()`를 경유했다.
- `git add`, `git commit`, `git push` 및 공유 실데이터 write를 실행하지 않았다.

## ⑧ 프로세스 회수

- 이번 라운드가 기동한 Electron·Playwright·chrome-headless-shell·Vite 잔여: 0개.
- `1254-sol-r3-*` 임시 사용자 데이터 디렉터리 잔여: 0개.
- 이번 라운드 격리 컨테이너: 생성 0개, 잔여 0개.
- 시작 전부터 다른 동시 라운드가 사용하던 Electron PID `30604, 94284, 50000, 89364` 4개는 그대로 살아 있으며 건드리지 않았다.
- 공유 실행 컨테이너는 최종 27개이며 중지·변경하지 않았다.

## ⑨ 판정

**도달 결함 1건.**
