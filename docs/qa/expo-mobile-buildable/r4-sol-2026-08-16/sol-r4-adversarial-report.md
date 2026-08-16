# PR #1246 / 이슈 #1235 — CODEX SOL 적대검증 R4

## ① 환경 확인

요청된 명령:

```powershell
cd C:\dev\Samhan-Public\.claude\worktrees\w1235
git rev-parse HEAD
git rev-parse --abbrev-ref HEAD
git status --porcelain
gh pr checks 1246
```

최초 실행 원문 그대로:

```text
c5af40469e34425d2c0faa829a5bd8e0c75f302f
feat/expo-mobile-buildable

#910 문서 계약 테스트 (docs/dev-reports 관할)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31939924104/job/95147508579
App Build Version Guard (scripts/app-build-version, #910/#928)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31939924111/job/95147508762
Config Audit Guard (다운스트림 URL/포트 정합, #745)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31939924111/job/95147508641
Credential Plaintext Guard (SP-08-8)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31939924111/job/95147508712
Desktop Playwright (mock 회귀 hard gate)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31939924122/job/95147508649
Detox Android (arologis-mobile, AVD)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31939924122/job/95147508700
Detox Android (mobile v4, AVD)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31939924122/job/95147508670
Frontend DS (typecheck + lint + build + storybook)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31939924111/job/95147508765
Frontend Mobile (삼한 모바일 · typecheck + jest)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31939924111/job/95147508729
Frontend Mobile-Staff (typecheck + jest + expo doctor + prebuild dry-run)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31939924111/job/95147508724
Frontend Order-App (typecheck + test + build)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31939924111/job/95147508680
Internal Chat Desktop (typecheck + lint + test + build)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31939924111/job/95147508679
Local Stack Port Resolver Guard (#1113)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31939924111/job/95147508640
Notion Runtime Zero Guard (SP-08-7)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31939924111/job/95147508710
Playwright (web + electron + mobile emul)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31939924122/job/95147508630
S1 logging opt-in 계약 (docs/local-stack 관할)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31939924104/job/95147508626
문서 본문 단언 스펙 (mock 게이트 중 docs/** 를 읽는 것)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31939924104/job/95147508592
빌드 + 테스트 (accounting+partner)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31939924111/job/95147508759
빌드 + 테스트 (accounting-cash-receipt-it)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31939924111/job/95147508659
빌드 + 테스트 (accounting-codef-it)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31939924111/job/95147508673
빌드 + 테스트 (accounting-deposit-mapping-it)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31939924111/job/95147508767
빌드 + 테스트 (accounting-partner-integrity-it)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31939924111/job/95147508708
빌드 + 테스트 (phase9-10 (groupware+notification+dashboard))	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31939924111/job/95147508665
빌드 + 테스트 (product-quantity-sync-schema)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31939924111/job/95147508792
빌드 + 테스트 (shared+auth+gateway)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31939924111/job/95147508739
빌드 + 테스트 (slip-it-core)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31939924111/job/95147508658
빌드 + 테스트 (slip-it-public)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31939924111/job/95147508832
빌드 + 테스트 (slip-units)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31939924111/job/95147508699
빌드 + 테스트 (user+product+inventory+logging)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31939924111/job/95147508674
GitGuardian Security Checks	pass	0	https://dashboard.gitguardian.com
자격 평문 비공개 가드 (docs 관할, SP-08-8)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31939924104/job/95147508604
하네스 거짓 green 가드 (docs/qa 관할)	pending	0	https://github.com/ewoo14/Samhan-Public/actions/runs/31939924105/job/95147508593
```

`git status --porcelain`은 빈 출력이었다. 최초 `gh pr checks`는 pending 때문에 exit 1이었다.

## ② CI 카운트

- 최초 실측: **pass 1 / fail 0 / pending 31 / 총 32**.
- 게시 직전 실측: **pass 46 / fail 0 / pending 0 / 총 46**, `gh pr checks` exit 0.

## ③ 릴리스 가드 전수 sweep — SOL 직접 실측

각 조합에서 `npx expo export --platform web --clear`를 독립 실행했다. 성공 번들은 센티널 포함 파일 수도 직접 셌다.

| # | BUILD_ENV / APP_VARIANT / 토큰 | exit | 센티널 파일 | 가드 문구 | 실측 판정 |
|---:|---|---:|---:|---|---|
| 1 | unset / sales / 있음 | 1 | 0 | 있음 | 차단 |
| 2 | production / unset / 있음 | 1 | 0 | 있음 | 차단 |
| 3 | PRODUCTION / SALES / 있음 | 1 | 0 | 있음 | 차단 |
| 4 | ` prod ` / ` sales ` / 있음 | 1 | 0 | 있음 | 차단 |
| 5 | preview / staff / 있음 | 1 | 0 | 있음 | 차단 |
| 6 | 빈 문자열 / 빈 문자열 / 있음 | 1 | 0 | 있음 | 차단 |
| 7 | ` development ` / sales / 있음 | 0 | 1 | 없음 | 통과 |
| 8 | DEVELOPMENT / staff / 있음 | 0 | 1 | 없음 | 통과 |

실측 합계: **비개발 6/6 차단, 명시적 development 2/2 통과**. LUNA 수치와 일치한다.

## ④ 거래처 검색 세 화면 실HTTP·스크린샷

### PR HEAD JAR 격리 배포

```text
./gradlew.bat :services:partner-service:bootJar --no-daemon
BUILD SUCCESSFUL in 10s
HOST_BYTES=114051575
HOST_SHA256=88db08ff0af7f27e5a9adc3de959a58974560afb5037ee295a289ab3b565cbbe
CONTAINER_SHA256=88db08ff0af7f27e5a9adc3de959a58974560afb5037ee295a289ab3b565cbbe  /app/app.jar
ISOLATED_HEALTH=UP
```

격리 컨테이너는 공유 `samhan-net`과 최신 회전 자격을 사용하되, `sol1246r4-partner`, host `28095`로 공유 partner-service와 분리했다. quick-search만 이 컨테이너로, 대시보드 등 나머지는 공유 gateway로 전달했다.

최신 `infrastructure/.env.local` 자격으로 새 로그인한 실HTTP 원문:

```text
DASHBOARD_HTTP=200 BYTES=333
DASHBOARD_COUNTS draft=18 sent=0 accepted=0 inProgress=18
QUICK_SEARCH_HTTP=200 BYTES=605 SUCCESS=True COUNT=3
ROW code=2148720659 name=(주)삼한공조시스템 representative=김미선
ROW code=550122-1168113 name=삼한빌딩 5층 이성수 representative=
ROW code=6340200656 name=삼한공조 representative=백윤숙
[R4_HTTP] GET /mobile/sales/dashboard target=SHARED_GATEWAY status=200 bytes=333
[R4_HTTP] GET /api/v1/partners/quick-search?q=%EC%82%BC%ED%95%9C&size=20 target=PR_HEAD_PARTNER status=200 bytes=605
```

대시보드 진행 견적 실측은 기준값과 같은 **18건**이다. 공유 실데이터 write는 **0건**이다.

### 세 화면 UI 도달 결과

| 화면 | UI에서 발생한 검색 HTTP | 백엔드 응답 건수 | 화면 행 수 | 스크린샷 |
|---|---|---:|---:|---|
| 견적 | 미도달 | 직접 HTTP 3건 | 미측정 | 없음 |
| 주문 | 미도달 | 직접 HTTP 3건 | 미측정 | 없음 |
| 거래처 | 미도달 | 직접 HTTP 3건 | 미측정 | 없음 |

Browser 런타임의 사용 가능 목록이 `[]`여서 실 UI 클릭·입력·행 수 집계·캡처를 수행하지 못했다. `--list`, typecheck, mock, 기존 스크린샷으로 대체하지 않았다. 따라서 신규 스크린샷 파일 수는 **0장**, 파일명·바이트 수·육안 확인도 **없음**이다. 이 항목은 요구 미충족이며 R4 통과 근거로 사용할 수 없다.

실HTTP 로그 파일:

- `proxy-http.log` — 455 bytes
- `proxy-error.log` — 0 bytes
- `expo-web.log` — 682 bytes
- `expo-web-error.log` — 0 bytes

## ⑤ 양방향 회귀 — 정상 경로 유지

| 경로 | 실측 원문 | 판정 |
|---|---|---|
| sales + `BUILD_ENV=development` + 토큰 | `exit=0 sentinelFiles=1 guardMessage=no` | 정상 유지 |
| staff 일반 빌드 + 토큰 없음 + BUILD_ENV unset | `exit=0 sentinelFiles=0 guardMessage=no` | 정상 유지 |
| staff + preview + 토큰 | `exit=1 sentinelFiles=0 guardMessage=yes` | 릴리스 토큰 차단 |
| staff + DEVELOPMENT + 토큰 | sweep #8 `exit=0 sentinelFiles=1` | 개발 흐름 유지 |

staff에 토큰이 있다는 이유만으로 막히는 것이 아니라, **명시적 development면 허용되고 비개발이면 차단**된다. 확인한 정상 개발 흐름 회귀는 없다.

## ⑥ 도달 결함

이번 실행에서 **확정 재현한 사용자 도달 결함은 0건**이다.

다만 세 화면 실 UI 자체에 도달하지 못했으므로 “사용자가 UI를 통해 도달할 수 있는 결함이 남아 있지 않다”는 부정 명제는 증명하지 못했다. 브라우저 런타임 부재는 제품 결함으로 세지 않았으며, R4 최종 통과 판정은 보류한다.

## ⑦ 증거 무결성 자기 고지

- LUNA의 `6차단 / development 2통과`는 표를 옮기지 않고 8개 web export를 다시 실행해 동일 수치를 얻었다.
- 최초 sweep 실행기는 프로젝트 밖 output-dir을 사용해 development 2건을 잘못 exit 1로 만들었다. Expo 원문 `--output-dir must be a subdirectory of the project directory`로 원인을 확인한 뒤 이 실행을 폐기하고, 프로젝트 내부 임시 디렉터리로 전수 재실행했다.
- PR HEAD JAR은 새로 bootJar를 만들고 호스트/컨테이너 SHA-256을 대조했다.
- 직전 보고서의 “거래처 실제 목록 응답”은 PR HEAD JAR + 실제 DB에서 3건으로 재현됐다.
- 필수 세 화면 실 UI·스크린샷은 재현하지 못했다. 화면 행 수를 백엔드 3건으로 추정하거나 기존 PNG를 재사용하지 않았다.
- 자격·JWT·attestation 원문, 사용자 UUID는 보고서에 노출하지 않았다.

## ⑧ 프로세스 회수

이번 실행이 기동한 것만 회수했다.

```text
Metro/Expo listener 28101: 0
실HTTP proxy listener 28100: 0
sol1246r4-* 컨테이너: 0
sol1246r4/28101 명령행 잔여 프로세스: 0
Browser/헤드리스 브라우저: 기동 성공 0, 잔여 0
```

Expo가 자동 수정한 `clients/mobile-staff/tsconfig.json`은 원복했고, 앱 export 임시 디렉터리와 임시 proxy 소스도 삭제했다. 공유 `samhan-*` 및 다른 라운드 프로세스는 건드리지 않았다.

## ⑨ 판정

**도달 결함 0건(확정 발견 수).** 단, 세 화면 실 UI 미도달·스크린샷 0장 때문에 **잔존 도달 결함 0건 판정 및 R4 통과는 보류**한다.
