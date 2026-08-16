# PR #1254 CODEX SOL 최종 재수렴 적대검증

## ① 환경 확인

요청 직후 맨 먼저 실행한 원문이다.

```text
cd C:\dev\Samhan-Public\.claude\worktrees\w1253
git rev-parse HEAD
0c0c04b60f873050ee0ff0dc4abebb6f2c9f522b

git rev-parse --abbrev-ref HEAD
fix/notice-banner-layout-and-wording

git status --porcelain
(출력 0줄)

gh pr checks 1254
GitGuardian Security Checks	fail	1s	https://dashboard.gitguardian.com
#910 문서 계약 테스트 (docs/dev-reports 관할)	pass	42s	https://github.com/ewoo14/Samhan-Public/actions/runs/31945544259/job/95160827117
Credential Plaintext Guard (SP-08-8)	pass	1m2s	https://github.com/ewoo14/Samhan-Public/actions/runs/31945544220/job/95160827090
Local Stack Port Resolver Guard (#1113)	pass	52s	https://github.com/ewoo14/Samhan-Public/actions/runs/31945544220/job/95160827079
Notion Runtime Zero Guard (SP-08-7)	pass	40s	https://github.com/ewoo14/Samhan-Public/actions/runs/31945544220/job/95160827086
Internal Chat Desktop (typecheck + lint + test + build)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945544220/job/95160827127
Frontend Order-App (typecheck + test + build)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945544220/job/95160827121
Detox Android (arologis-mobile, AVD)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945544543/job/95160828029
S1 logging opt-in 계약 (docs/local-stack 관할)	pass	43s	https://github.com/ewoo14/Samhan-Public/actions/runs/31945544259/job/95160827159
Frontend Mobile-Staff (typecheck + jest + expo doctor + prebuild dry-run)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945544220/job/95160827148
Frontend Mobile (삼한 모바일 · typecheck + jest)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945544220/job/95160827146
Frontend DS (typecheck + lint + build + storybook)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945544220/job/95160827123
Config Audit Guard (다운스트림 URL/포트 정합, #745)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945544220/job/95160827133
App Build Version Guard (scripts/app-build-version, #910/#928)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945544220/job/95160827116
Arologis Config Audit Guard (다운스트림 URL/포트 정합, #745)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945544661/job/95160828304
Arologis Notion Runtime Zero Guard (SP-08-7)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945544661/job/95160828295
자격 평문 비공개 가드 (docs 관할, SP-08-8)	pass	52s	https://github.com/ewoo14/Samhan-Public/actions/runs/31945544259/job/95160827142
Detox Android (mobile v4, AVD)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945544543/job/95160827978
Desktop Playwright (mock 회귀 hard gate)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945544543/job/95160827999
Playwright (web + electron + mobile emul)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945544543/job/95160828000
데스크톱 빌드 (arologis-desktop)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945544661/job/95160828318
모바일 prebuild (arologis-mobile)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945544661/job/95160828247
문서 본문 단언 스펙 (mock 게이트 중 docs/** 를 읽는 것)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945544259/job/95160827157
백엔드 빌드 + 테스트 (arologis-service)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945544661/job/95160828286
빌드 + 테스트 (accounting+partner)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945544220/job/95160827096
빌드 + 테스트 (accounting-cash-receipt-it)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945544220/job/95160827107
빌드 + 테스트 (accounting-codef-it)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945544220/job/95160827130
빌드 + 테스트 (accounting-deposit-mapping-it)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945544220/job/95160827135
빌드 + 테스트 (accounting-partner-integrity-it)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945544220/job/95160827136
빌드 + 테스트 (phase9-10 (groupware+notification+dashboard))	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945544220/job/95160827098
빌드 + 테스트 (product-quantity-sync-schema)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945544220/job/95160827149
빌드 + 테스트 (shared+auth+gateway)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945544220/job/95160827106
빌드 + 테스트 (slip-it-core)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945544220/job/95160827168
빌드 + 테스트 (slip-it-public)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945544220/job/95160827113
빌드 + 테스트 (slip-units)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945544220/job/95160827125
빌드 + 테스트 (user+product+inventory+logging)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945544220/job/95160827094
자격 평문 비공개 가드 (SP-08-8 + SP-10-2)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945544661/job/95160828323
하네스 거짓 green 가드 (docs/qa 관할)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31945544263/job/95160827249
```

초기 `gh pr checks` exit code는 1이었다.

## ② CI 카운트

- 초기 직접 카운트: 총 38개 = pass 6 / pending 31 / fail 1.
- 게시 직전 직접 카운트: 총 53개 = success 51 / in-progress 1 / failure 1.
- 게시 직전 pending: `Desktop Playwright (mock 회귀 hard gate)` 1개.
- failure: `GitGuardian Security Checks` 1개.
- 로컬 재실행: design-system 32 files / **286 tests passed**, 12.90초, exit 0.
- 로컬 재실행: arologis-desktop 21 files / **99 tests passed**, 11.66초, exit 0. 이 안에서 진리표 4건과 AppVersionGate 14건도 통과했다.

## ③ 직전 마감 fix 4건 재현 결과

1. **0px 소실: 원 결함은 닫힘.** 320×480·480×480·320×600에서 stack border-box 높이는 40px였다. 다만 배너 2·3장에서는 수평 스크롤바가 생겨 실제 `clientHeight=23px`로 줄고 28px 버튼을 완전히 표시하지 못하는 새 도달 결함이 열렸다.
2. **600×720 스크롤바 클릭 통과: 닫힘.** 직접 hit은 stack 내부 `DIV`, stack을 잠시 제외했을 때 아래 대상은 `TD`, 실제 클릭 뒤 아래 대상 click 수는 0이었다.
3. **stack 하단 휠 본문 전달: 닫히지 않음.** 45행 실데이터에서 stack `289.3333→289.3333`, MAIN `100→100`, delta `+120`이었다.
4. **600×720 하단 0.24~0.32px 클리핑: 100% 배율에서는 닫힘.** stack 가시 하단 `704.4583`, 버튼 하단 `702.3229 / 702.2396 / 702.2396`. 그러나 작은 화면과 150% 확대에서 새 클리핑이 재현됐다.

## ④ 다섯 번째 표면 탐색

- 창 리사이즈 왕복 `600×720→320×480→480×480→600×720`: clientHeight `244→23→23→244`; 0px는 없었다.
- 배너 동적 제거/추가: 자식 `3→2→3`, 600×720 clientHeight 244 유지.
- 배너 내부 버튼: `닫기` 실제 클릭 뒤 `app-auto-update-status` DOM 수 `1→0`; pointer-events 경계는 버튼 클릭을 막지 않았다.
- stack에 스크롤이 남았을 때 반대 방향 휠: 하향 stack `50→170`, 상향 `100→10`; 두 경우 MAIN `100→100`. 정상.
- stack 경계 휠: 하단에서 MAIN `100→100`으로 실패. 상단에서는 MAIN `200→80`으로 전달됨.
- 확대: 125%에서는 세 버튼 모두 완전 가시·hit 성공. 150%에서는 `보안인증서 설치` top `422.8681` < stack top `424.0000`으로 상단 클리핑.

## ⑤ 뷰포트 × 장수 매트릭스

45행 실서버 GET 응답과 렌더링 45행이 일치한 상태에서 전수 측정했다.

| 뷰포트 | 1장 | 2장 | 3장 |
|---|---|---|---|
| 320×480 | client 40, 교차 77.4375, 날짜 입력 hit 차단 | client 23, 교차 77.4375, 버튼 완전 가시 실패 | client 23, 교차 77.4375, 버튼 3개 완전 가시 실패 |
| 480×480 | client 40, 교차 1636.7084, 저장 탭 2개 hit 차단 | client 23, 교차 1636.7084, 버튼 완전 가시 실패 | client 23, 교차 1636.7084, 버튼 3개 완전 가시 실패 |
| 320×600 | client 40, 교차 1702.3631, 저장 탭 2개 hit 차단 | client 23, 교차 1702.3631, 버튼 완전 가시 실패 | client 23, 교차 1702.3631, 버튼 3개 완전 가시 실패 |
| 600×720 | client 64, 교차 0 | client 244, 교차 0, 버튼 도달 | client 244, 교차 0, 세 번째 배너·버튼 도달 |

직접 클릭 원문:

```text
[DIRECT-BLOCK] {"x":106.90104675292969,"y":426.3333339691162,"hitTag":"DIV","hitInsideStack":true,"targetClicks":0}
```

## ⑥ 잃으면 안 되는 것 재현

- 600×720 3장: 세 번째 배너까지 스크롤 도달, `보안인증서 설치/다시 확인/닫기` 모두 완전 가시·hit 성공, `닫기` 실제 클릭 성공.
- 밀지 않는다: 본문 첫 heading `199.71875→199.71875`, 차이 0.
- 가리지 않는다: 600×720은 1·2·3장 모두 교차 0. 단 320×480·480×480·320×600은 실패했다.
- 몇 장이든 얼마나 작든 도달: 실패. 작은 화면에서 본문 조작 차단과 버튼 클리핑이 남았다.
- 진리표 4조합: 개발+미설정 true / 개발+env=1 false / 패키지+미설정 true / 패키지+env=1 true, 4 tests passed.
- 사용자 대면 문구: `신뢰 루트` 0건 / `보안인증서` 2건.
- 3장 순서: `['app-version-policy-error','app-trust-root-disabled','app-auto-update-status']`; gaps `[12,12]`를 네 필수 뷰포트에서 모두 확인.
- 스크롤 행 클릭: 45행 중 버튼 클릭 후 `#/dispatches/manual?date=2026-08-08&slipNo=2026%2F08%2F08-52` 도달.
- 모달: `미배차 결과 저장` 표시 및 취소 성공.
- 드롭다운: focus 유지, options 3.
- 인쇄: 모든 `[data-print-exclude]` 계산 display `none`.
- Tab: stack→`보안인증서 설치`→본문 메뉴로 탈출.
- Linux 조건: production Electron 스펙에 `process.platform === 'linux' ? ['--no-sandbox'] : []` 유지.

## ⑦ 스펙 실행 시간

최종 전용 라이브 스펙: **5.570초**, 제한 60초 안. 도달 결함을 assertion하여 의도대로 `1 failed`.

직전 추적 R5 스펙의 신선한 실행은 39.4초에 캡처용 `page.waitForResponse` 30초 timeout으로 실패했다. 따라서 기존 주장 `1 passed (4.7s)`는 이번 실행으로 재확인되지 않았다.

## ⑧ 캡처

모든 캡처는 `resolveQaShotsDir()`를 거쳐 `_local` 격리에 저장했고 원본 해상도로 시각 확인했다.

| 파일 | bytes | SHA-256 |
|---|---:|---|
| `320x480-three-banners-sol-r6-final-real-qa.png` | 13235 | `0D0F414727146A9180C12306D4482C14610AF49A4C7D5BAF0FFD5726F4F832A5` |
| `480x480-three-banners-sol-r6-final-real-qa.png` | 17510 | `FD8B67D24567F2E0D044A093532E7040138FD4930553D3F9B43791405C133F46` |
| `320x600-three-banners-sol-r6-final-real-qa.png` | 15734 | `A9BD58CA05B2A8EFEA940AF2ADAF05D0F3F4A425C2595DE61FC67478CA66C024` |
| `600x720-three-banners-sol-r6-final-real-qa.png` | 36267 | `0719DBCBC8FD7DED28660AE2B9BF266404745A95BEA3283B7742FA6067860BDC` |

로컬 경로: `docs/qa/1254-notice-banner-layout/sol-r6-final/_local/`.

## ⑨ 도달 결함

### 1. 작은 뷰포트에서 stack이 본문 조작을 덮고 실제 클릭을 차단

재현: 미배차 리스트, 45행 상태, 320×480, 배너 1장 이상. 날짜 입력과 stack 교차 면적 77.4375. 교차점 `(106.9010, 426.3333)` 클릭 시 hit은 stack 내부 `DIV`, 날짜 입력 click은 0회. 480×480에서는 저장 탭 2개와 1636.7084, 320×600에서는 저장 탭 2개와 1702.3631 교차한다.

### 2. 작은 뷰포트와 150% 확대에서 배너 버튼이 가시 영역에 완전히 들어오지 않음

재현: 320×480·480×480·320×600, 배너 2장 이상. stack border-box는 40px지만 수평 스크롤바 때문에 clientHeight가 23px다. 버튼 높이는 28px이며, 예: 320×480 `보안인증서 설치` bottom `453.2917` > visibleBottom `447.0000`. 150%에서도 해당 버튼 top `422.8681` < stack top `424.0000`.

### 3. stack 최하단의 하향 휠이 스크롤 가능한 MAIN으로 전달되지 않음

재현: 600×720, 45행, stack 최하단, MAIN scrollTop 100, stack 위에서 wheel deltaY +120. 결과 stack `289.3333→289.3333`, MAIN `100→100`. stack 잔여 구간과 상단 역방향 전달은 정상이라 최하단 하향 경계에 한정된다.

## ⑩ 증거 무결성 자기 고지

- 직전 R5 스펙은 기본 config에서 real-QA가 제외되어 처음 `Error: No tests found.`가 났다. real-QA config와 forward-slash 경로로 재실행했으나 최종 캡처 응답 대기에서 39.4초 timeout. 둘 다 제품 결함 수에 포함하지 않았다.
- 새 R6 스펙 첫 실행은 차단 규칙이 실제 로그인 `/auth/admin/login`까지 막아 로그인 화면에 머물렀다. 로그인 1개만 허용하도록 교정했고 제품 결함 수에 포함하지 않았다.
- 직접 클릭 프로브 첫 좌표는 뷰포트 밖이었다. 최종 보고 수치는 320×480 날짜 입력의 실제 교차점으로 다시 측정한 값만 사용했다.
- 최종 라이브 스펙과 캡처는 로컬 미추적 산출물이다. 지시대로 `git add/commit/push`를 하지 않았으며, PR 댓글에서 추적 산출물처럼 가장하지 않는다.
- 실서버 로그인과 GET을 사용했다. 미배차 자동저장 등 비조회 요청 3건은 route에서 전부 차단·응답 대체하여 공유 데이터 write를 남기지 않았다.
- 범위 밖 미배차 자동저장 복원 결함은 결함 수에 포함하지 않았다.

## ⑪ 프로세스 회수

- 기동한 Electron은 모든 실행의 `finally`에서 종료.
- QA 전용 잔여 프로세스: **0**.
- QA 전용/격리 컨테이너 기동: 0, 잔여: **0**.
- 공유 `samhan-*` 및 다른 트랙 컨테이너는 건드리지 않았다.

## ⑫ 판정

**머지 반려 — 실 사용자가 화면을 통해 도달할 수 있는 결함 3건.**

단위 테스트 286+99와 CI 다수 green은 확인했지만, 필수 실화면 매트릭스에서 본문 클릭 차단·버튼 클리핑·휠 경계 실패가 재현되므로 이번 머지 판정은 **도달 결함 3건**이다.
