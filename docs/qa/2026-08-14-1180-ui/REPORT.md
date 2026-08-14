# PR #1180 화면·기능 1차 적대검증(SOL) 라이브 QA

- 실행일: 2026-08-14 KST
- 대상: PR #1180, `feat/901-claude-conversation`
- 범위: 화면·기능·회귀. 권한 계약은 별도 라운드이므로 제외
- 정본: `docs/decisions/2026-08-14-samhan-messenger-ui-v2.md` §8 결정 A~D 포함
- 판정: **도달 가능한 화면·기능 결함 7건**
- 브라우저: 로컬 Playwright Chromium `C:\Users\user\AppData\Local\ms-playwright\chromium-1217\chrome-win64\chrome.exe`
- Electron: Playwright `_electron`으로 실제 `clients/internal-chat-desktop` 및 `clients/desktop` 빌드 실행
- 합성 PNG: 0장

## 1. 환경 실측 원문

### 1.1 RAM 및 공유 컨테이너

시작 시 RAM:

```text
FreePhysicalMemoryKB : 4697460
FreeRAMGB            : 4.48
```

1.0GB 중단 기준을 통과했다. 지정된 공유 서비스 8종은 **존재 8, 없음 0**이었다.

```text
samhan-auth-service         | infrastructure-auth-service         | Up 5 hours (healthy)
samhan-user-service         | infrastructure-user-service         | Up 19 minutes (healthy)
samhan-inventory-service    | infrastructure-inventory-service    | Up 17 minutes (healthy)
samhan-accounting-service   | infrastructure-accounting-service   | Up 17 minutes (healthy)
samhan-logging-service      | infrastructure-logging-service      | Up 23 minutes (healthy)
samhan-api-gateway          | infrastructure-api-gateway          | Up 23 minutes (healthy)
samhan-dc-config-service    | infrastructure-dc-config-service    | Up 19 minutes (healthy)
samhan-partner-auth-service | infrastructure-partner-auth-service | Up 19 minutes (healthy)
MISSING=0
```

금지된 6개 서비스(`inventory-service`, `accounting-service`, `logging-service`, `api-gateway`, `dc-config-service`, `partner-auth-service`)는 재배포하지 않았다.

### 1.2 Flyway 처리 방법: 공유 DB 미사용, 격리 DB 사용

공유 스택에는 다른 트랙이 동시에 실행 중이고 이 브랜치가 auth V103~V106, user V13을 추가하므로 공유 DB를 변경하지 않았다. 별도 `qa1180sol-pg` PostgreSQL 16 컨테이너에 `auth_db`, `user_db`를 만들었다.

```text
auth_db|UTF8|en_US.utf8|en_US.utf8
user_db|UTF8|en_US.utf8|en_US.utf8

103|seed system claude permission|true
104|add claude conversation audits|true
105|add claude conversation sessions|true
106|allow anonymous claude denial audit|true
13|create messenger presence|true
```

저장소에 `scripts/redeploy-service.ps1`가 실제로 없었다. 지시된 fallback으로 다음을 실행했다.

```text
.\gradlew.bat :services:auth-service:bootJar :services:user-service:bootJar --no-daemon
BUILD SUCCESSFUL in 12s
```

다른 트랙의 동시 빌드가 bind mount의 host JAR을 바꾸는 것을 발견해 최초 mtime 증거는 폐기했다. 현재 JAR을 별도 임시 경로에 고정 복사한 뒤 내 컨테이너만 재기동하여 아래 증거를 다시 얻었다.

```text
auth host/frozen : 88095596 bytes | 2026-08-14T03:49:36.8617691Z
auth SHA-256     : fabb162da5264d8932fc63edbfd1a07a2030708252bb2ad020435b81ff9dbc13
user host/frozen : 91270525 bytes | 2026-08-14T02:43:02.9341163Z
user SHA-256     : ce223af4196a2b8d6648784ed78b4d032ac0f706d6ee0793f7ae8b674d9ff49f

qa1180sol-auth         /app/app.jar|88095596|2026-08-14 03:49:36.861769100 +0000
qa1180sol-auth-virtual /app/app.jar|88095596|2026-08-14 03:49:36.861769100 +0000
qa1180sol-user         /app/app.jar|91270525|2026-08-14 02:43:02.934116300 +0000
```

이미지와 QA 컨테이너 시각:

```text
postgres:16-alpine             created=2026-05-14T19:03:47.733148088Z
eclipse-temurin:17-jre-alpine created=2026-06-22T19:57:10.021996084Z

qa1180sol-pg           created=2026-08-14T03:39:31.078666758Z running
qa1180sol-auth         created=2026-08-14T03:50:32.083294981Z running
qa1180sol-auth-virtual created=2026-08-14T03:50:32.475404462Z running
qa1180sol-user         created=2026-08-14T03:51:08.270594997Z running
qa1180sol-auth-prod    created=2026-08-14T03:59:45.386654713Z exited(1)
```

QA 종료 후 위 5개 컨테이너, 정적 서버 PID 45980, 임시 고정 JAR 디렉터리를 제거했다. 공유 `samhan-*` 및 다른 라운드 `qa1180adv-*`에는 손대지 않았다.

## 2. 항목별 결과

### 2.1 삼한 메신저 UI v2 — 정본 대조

| 항목 | 결과 | 실측 |
|---|---|---|
| 사용자 명칭 | **부분 실패** | HTML title과 BrowserWindow title은 `삼한 메신저`. 실제 Electron `app.getName()`은 `@samhan/internal-chat-desktop`, builder `productName`/shortcut은 `Samhan Internal Chat`, 앱 내 헤더는 `채팅`이다. |
| 상단 `[개별][그룹별][클로드]` pill | **실패** | 실제 버튼은 `[개별][그룹별][새 대화]`; `.page-chips=0`, Claude 화면 0. 선택/미선택 pill 상태도 없다. |
| 내 상태 위치·직접 변경 | **실패** | `.profile-status-control=0`. 칩 바로 아래 상태 변경 메뉴가 실제 진입 경로에 없다. |
| 상태 아이콘 픽셀 | **실패** | 직원 8명 모두 10×10px 자체는 보이나 전부 `presence-offline`, `rgb(148,163,184)`로 붕괴한다. |
| 개별: 그룹 바깥·직급 안·입사일 | **실패** | 실제 화면은 그룹 헤더 없는 평면 직원 목록이다. `개발자`도 직급 문자열로 그대로 노출된다. |
| 개별: 사람 클릭 → 1:1 | **실패** | `[DEV-SEED] 개발매니저` 클릭 전후 URL이 동일하고 `chat-room-page=0`이었다. |
| 그룹별 참고 화면 | **실패** | 실제 9개 행은 방 이름 텍스트만 있다. 아바타·인원수·마지막 메시지·시각이 없다. |
| 클로드 세션 목록·새 세션·선택 열기 | **실패** | 실제 Electron 사용자 경로에서 클로드 탭 자체가 없다. |
| 세션 서버 지속 | **통과(API)** | `CLD-20260814-687736` 생성 후 auth 프로세스를 재기동했고 목록에서 동일 세션 1건을 다시 읽었다. 화면 선택은 위 결함 때문에 검증 불가가 아니라 도달 실패로 판정했다. |

도달 증명:

```text
internal-chat Electron URL=file:///.../out/renderer/index.html
pageTitle=삼한 메신저
windowTitle=삼한 메신저
buttons=[개별, 그룹별, 새 대화]
v2ChipRow=0
claudePage=0
```

### 2.2 presence 6종

백엔드 저장·정책과 실제 화면이 서로 다른 경로를 사용한다.

```text
PUT AVAILABLE / AWAY / ABSENT / IN_MEETING / ON_CALL / OFFLINE => 모두 200

실제 화면 계산 스타일 6회:
className=presence presence-offline
width=10 height=10 display=block
backgroundColor=rgb(148, 163, 184)
visibility=visible opacity=1
```

6회 실캡처 SHA가 완전히 같아 중복 5장은 제거하고 한 장만 남겼다. DOM만 있는 결함이 아니라, 실제 픽셀이 6상태 모두 동일한 오프라인 색이다.

자동 전환은 격리 DB의 `last_activity_at`만 조정하고 실제 60초 scheduler를 기다렸다.

```text
AUTO_10M|status=AWAY|poll=1
AUTO_30M|status=ABSENT|poll=29
```

수동 우선은 통과했다.

```text
SET|IN_MEETING|200
ACTIVITY_AFTER_MANUAL|IN_MEETING|200
SET|ON_CALL|200
ACTIVITY_AFTER_MANUAL|ON_CALL|200
MANUAL_BEFORE_SCHEDULER|IN_MEETING
MANUAL_AFTER_SCHEDULER_65S|IN_MEETING
```

다중 세션과 타 사용자 반영은 실패했다.

```text
JOIN|sol-a|200
JOIN|sol-b|200
LEAVE_FIRST_OF_TWO|200
SSE => AVAILABLE → IN_MEETING → ON_CALL → OFFLINE
ME_AFTER_FIRST_LEAVE => OFFLINE
```

두 번째 세션이 살아 있는데 첫 번째 세션 종료가 오프라인을 발행했다. 또한 관찰자 SSE의 네 상태 이벤트 모두 `employeeCode:null`이었다. 프런트는 null event를 타 직원 행에 매칭할 수 없다.

실제 앱 프로세스 종료 경로도 실패했다.

```text
ACTUAL_APP_JOIN_STATUS=200
ACTUAL_APP_AFTER_CLOSE|AVAILABLE
```

즉 실제 Electron 앱을 종료한 2초 뒤에도 서버 상태가 AVAILABLE이었다.

### 2.3 가상 에이전트

| 항목 | 결과 | 실측 |
|---|---|---|
| 기본값 OFF | **통과** | `CLAUDE_VIRTUAL_AGENT_ENABLED=false`, 키 없음에서 대화 POST는 503 `CLAUDE_CREDENTIAL_NOT_CONFIGURED`. |
| ON 시 실제 왕복 | **통과(API)** | 세션 생성 201, 질문 200, 답변은 `[가상 에이전트] 실제 Claude 모델 응답이 아닙니다...`, `virtualAgent=true`. |
| 화면에 “가상” | **실패/도달 결함** | 실제 사용자 경로에 Claude 탭이 없어 화면 응답 자체를 열 수 없다. |
| API에 “가상” | **통과** | prefix `[가상 에이전트]`, boolean `virtualAgent=true`. |
| 감사 로그에 “가상” | **통과** | `CLD-20260814-687736|VIRTUAL_SENT|...|apiResponses=[]`. |
| 운영 프로파일 기동 실패 | **통과** | prod + virtual ON 컨테이너가 `exited|1`; 런타임 무시가 아니라 Spring context 기동 실패. |

운영 차단 원문:

```text
PROD_GATE_CONTAINER|exited|1|2026-08-14T04:00:01.762646933Z
BeanCreationException: Error creating bean with name 'claude.virtual-agent-...ClaudeVirtualAgentProperties'
Caused by: java.lang.IllegalStateException: 운영 프로파일에서는 가상 에이전트를 켤 수 없습니다.
```

### 2.4 본체 `clients/desktop` 회귀

브랜치 빌드:

```text
npm run build
electron-vite build: exit 0
renderer 750 modules transformed
```

실제 Electron `file:///.../out/renderer/index.html#/chat` 경로에서 수행했다.

| 항목 | 결과 | 실측 |
|---|---|---|
| `/#/chat` 진입·목록 | **통과** | `chat-rooms-page` 도달, 기존 방 목록 표시. |
| 방 열기 | **통과** | 기존 그룹방 `CHAT-20260814-000018`의 `chat-room-page` 도달. |
| UI 전송 | **통과** | `SOL1180-GROUP-UI-1786679782230` 전송 후 화면·REST 모두 확인. |
| 그룹 1회 전송 중복 | **통과** | 동일 본문 서버 exact count=1, sequence=1. 수신자별 행 중복 재발 없음. |
| SSE 수신 | **통과** | stream 200 `text/event-stream`을 먼저 확인한 뒤 외부 API로 `SOL1180-SSE-READY-1786679940279` 1건 생성; reload 없이 화면에 나타남. 서버 exact count=1. |
| 비활성 직원 숨김 | **통과** | 실제 `탈퇴` 검색 결과 버튼 0건. |

초기 한 번은 stream readiness 확인 전에 외부 메시지를 보내 15초 관측에 실패했다. 해당 결과는 무효 처리했다. stream 200 이후 재실행한 위 결과만 판정에 사용했다.

## 3. CI 실패 원문

실패 check:

```text
Internal Chat Desktop (typecheck + lint + test + build)
run=31761422440 job=94648413975 conclusion=FAILURE
```

실패 원문 핵심:

```text
FAIL src/renderer/messenger-ui-v2.test.tsx > 삼한 메신저 UI v2 > 그룹별 페이지는 마지막 메시지와 인원수를 목록 행에 표시한다
TestingLibraryElementError: Unable to find an element with the text: 오전 8:36.

66| expect(screen.getByText('4')).toBeInTheDocument()
67| expect(screen.getByText('오늘 일정 공유드립니다')).toBeInTheDocument()
68| expect(screen.getByText('오전 8:36')).toBeInTheDocument()
  |                   ^

Test Files  1 failed | 6 passed (7)
Tests       1 failed | 28 passed (29)
Process completed with exit code 1.
```

실제 실패 DOM에는 기대값 대신 `오후 11:36`이 렌더링돼 있었다. 검증자 역할이므로 수정하지 않았다.

## 4. 캡처 SHA-256 — 중복 0

```text
desktop-chat-list-real-qa.png              F6EC855FBC1F59F0C7FF3CE031C34A2982485C3A2EBD03F1FA419D1DDCD4444F
desktop-electron-launch-real-qa.png        76668FA83AD6AB653363FDA366ED797C5EF417DBAE962A4E4517BFC41AA617EF
desktop-group-rest-reload-real-qa.png      004DF9A39CC38035EBAAD52182BD5EBD0287F0E132E5B2B7C1BFB3AB66B58970
desktop-group-sse-ready-real-qa.png        3D8CB6B39937F76F7A004C89AFF4EF432C4E8A2D97221E1FCBAE2F71F26E2615
desktop-group-ui-send-real-qa.png          C67E6E0B07BE66C26DCC1ADEB74A2C4011EC644023059B1467E97C0247C65880
desktop-inactive-hidden-real-qa.png        1BBE011A0C33935395101FED337BCDE9D48C89C17EE00F9EA1DD1CE21B7ABFB3
messenger-actual-entry-real-qa.png         D29F4643CC61CEEB576836703CDBC8534C2CB8D861430E3EC34285468741DA31
messenger-electron-actual-real-qa.png      37A50D10A5ABF2296713804EEE982ED5C514F3C975DFD650745BD6AF85BF8AE6
messenger-group-actual-real-qa.png         B4DDCDCA18F73082C27ED662172154CB4B631B27898C83D460C4F8320ADFADF4
presence-in_meeting-real-qa.png            7CB48C5AB42ED8B97896BE3FD7B57C45069A91622104EBAF9AC92FAAC8A6F18E
```

검사 결과: 파일 10개, 고유 SHA-256 10개, 중복 0.

## 5. 도달 가능한 결함 목록

1. **명칭 미완료** — 창/HTML title만 `삼한 메신저`; 앱 내부 헤더는 `채팅`, Electron app name과 installer/shortcut은 영문 구명칭이다.
2. **UI v2 실제 진입 경로 미연결** — 실제 앱은 `[개별][그룹별][새 대화]`의 기존 routed 화면을 열며 `[클로드]`와 v2 pill row가 없다.
3. **개별 페이지 계약 실패** — 조직 그룹 헤더가 없고 평면 목록이며, 사람 클릭 후 1:1 대화 화면이 열리지 않는다.
4. **그룹별 참고 화면 계약 실패** — 아바타·인원수·마지막 메시지·시각 없이 방 이름만 표시한다.
5. **presence 화면 상태원 분리** — 새 6종 DB/API 상태를 실제 `/me`·directory 화면이 읽지 않아 6종이 전부 같은 오프라인 픽셀로 보인다.
6. **presence 실시간·다중 세션 실패** — SSE `employeeCode:null`로 타 직원 행 매칭이 안 되고, 두 세션 중 하나만 종료해도 OFFLINE이 발행된다.
7. **앱 종료 오프라인 실패** — 실제 Electron 앱 종료 2초 뒤에도 격리 서버 상태가 AVAILABLE로 남았다.

## 6. 관측 불가와 실패 원문

- Claude 세션 선택/대화 화면 및 화면의 “가상” 표시는 자격 문제가 아니라 **실제 Claude 탭 부재라는 도달 결함** 때문에 실행할 수 없었다. 결함 2에 포함했다.
- 같은 직급의 입사일 순서는 seed 9명의 입사일이 모두 `2026-01-01`이라 구분 표본이 없었다. 입사일 공백 위치는 개발책임자 미결정이므로 결함으로 세지 않았다.
- 수동 상태 해제 시점, 상단 `안읽음`/`+`, 개별 안읽음 표시는 미결정 사항으로 관측만 하고 결함에서 제외했다.
- 최초 Electron 실행 실패 원문은 `Electron failed to install correctly, please delete node_modules/electron and try installing again`이었다. 실제 `electron.exe` 부재를 확인했고 `node_modules/electron/install.js`만 실행해 복구한 뒤 실제 Electron QA를 완료했다.
- 격리 user-service 최초 directory 빈 배열은 Eureka를 끈 상태에서 `AuthClient`가 `http://auth-service`를 찾지 못한 QA 설정 오류였다. simple discovery와 permission auth URL을 격리 컨테이너에 주입한 뒤 8명으로 재현됐으므로 제품 결함에서 제외했다.

## 7. 만든·변경한 데이터

### 공유 스택

- 기존 그룹방 `CHAT-20260814-000018` 사용. 새 그룹방 생성 없음.
- 메시지 3건 생성, 각 서버 exact count=1:
  - sequence 1: `SOL1180-GROUP-UI-1786679782230`
  - sequence 3: `SOL1180-GROUP-SSE-1786679782230` (readiness 전 관측 실패 메시지, REST에는 정상 저장)
  - sequence 5: `SOL1180-SSE-READY-1786679940279`
- `dev_master`로 여러 번 로그인해 공유 auth 계정의 `last_login_at`이 갱신됐을 수 있다.
- 비활성 직원과 계정 데이터는 변경하지 않았다.
- 개별 직원 클릭 후 최종 방 목록에서 개발매니저 direct 방은 발견되지 않았다.

### 격리 DB

- 전체 DB는 종료 시 컨테이너와 함께 제거했다.
- Flyway seed로 auth 계정 12건, user 직원 9건이 생성됐다.
- Claude 세션 1건: `CLD-20260814-687736`.
- Claude 감사 1건: `VIRTUAL_SENT`.
- presence 행: `dev_master`, `dev_manager`; 6종 상태, activity, 10/30분 전환, 다중 세션 종료를 위해 변경했다.

### 로컬 상태

- 실제 Electron 로그인 과정에서 로컬 desktop 인증 저장소가 `dev_master` 세션으로 갱신됐다.
- QA 프로세스, 내가 만든 컨테이너 5개(`qa1180sol-auth`, `qa1180sol-auth-virtual`, `qa1180sol-auth-prod`, `qa1180sol-user`, `qa1180sol-pg`), 정적 서버, 임시 JAR은 모두 종료·삭제했다. 다른 라운드의 `qa1180sol-auth-on`은 건드리지 않았다.
