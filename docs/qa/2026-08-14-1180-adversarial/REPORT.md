# PR #1180 1차 적대검증(SOL) 라이브 QA

- 대상 PR: `#1180` — `feat/901-claude-conversation`
- 대상 head: `b63e047a273addeb2e6c82477dd300992f56a4fe`
- 실행일: 2026-08-14 KST
- 판정: **머지 차단 — 실 사용자 경로 결함 7건**
- 원칙: 인앱 Browser가 아니라 지정 로컬 Playwright Chromium(`chromium-1217`)을 직접 실행했다. 합성·복제 PNG는 사용하지 않았다.

## 1. 환경 실측 원문

### 1.1 PR·정본

`gh pr view 1180`의 본문, issue comment 5건, review/review comment 전수를 읽었다. review/review comment는 0건이었다. 다음 정본을 UTF-8로 전부 읽고 §8 결정 A~D와 결정 1·2를 기준으로 판정했다.

- `docs/decisions/2026-08-14-samhan-messenger-ui-v2.md`
- `docs/decisions/2026-08-13-blocked-tracks-unblocked.md`

### 1.2 RAM

```text
시작: FREE_KB=7468992 FREE_GB=7.123 TOTAL_GB=61.613
종료 직전: FREE_NOW_GB=4.233
중단 기준 1.0GB 미만 진입 없음
```

### 1.3 공유 컨테이너 — 없는 것도 셈

요청에서 명시한 8개를 이름으로 전수 확인했다.

```text
present=8 missing=0 missingNames=
samhan-auth-service       Up / 127.0.0.1:8081
samhan-user-service       Up / 127.0.0.1:8083
samhan-inventory-service  Up / 127.0.0.1:8085
samhan-accounting-service Up / 127.0.0.1:8087
samhan-logging-service    Up / 127.0.0.1:8082
samhan-api-gateway        Up / 127.0.0.1:8080
samhan-dc-config-service  Up / 127.0.0.1:8089
samhan-partner-auth-service Up / 127.0.0.1:8091
```

금지된 공유 서비스는 재배포하지 않았다.

### 1.4 Flyway 처리 — 격리 DB 선택

공유 DB는 auth V102, user V12까지만 적용돼 있었다. PR의 auth V103~V106/user V13을 공유 DB에 적용하면 다른 트랙 validate를 깨뜨리므로 `qa1180adv-pg` 격리 PostgreSQL을 사용했다.

```text
공유 auth latest: V102 preserve permission change actor id
공유 user latest: V12 add employee account link reconciliation

격리 auth:
105|106|allow anonymous claude denial audit|t
104|105|add claude conversation sessions|t
103|104|add claude conversation audits|t
102|103|seed system claude permission|t

격리 user:
13|13|create messenger presence|t
12|12|add employee account link reconciliation|t
```

DB 인코딩은 기존 격리 컨테이너의 UTF-8 PostgreSQL을 사용했다. 한글 HTTP 본문은 정상 UTF-8이었다. 일부 `psql` 콘솔 출력만 Windows 코드페이지에서 깨졌으며 HTTP/브라우저 판정에는 쓰지 않았다.

### 1.5 이미지 시각·컨테이너 내부 JAR 나이와 SHA-256

```text
eclipse-temurin:17-jre-alpine image created=2026-06-22T19:57:10.021996084Z
postgres:16-alpine image created=2026-05-14T19:03:47.733148088Z

qa1180adv-auth
  container=2026-08-14T02:44:31.357000945Z
  jar mtime=2026-08-14 02:43:02.803362600 +0000 size=88095596
  SHA-256=e72c3250ffa965e89b5d0978bb21ae63268c23a5e0871776f89de29a8859f893

qa1180adv-auth-virtual
  container=2026-08-14T02:47:57.777622748Z
  jar mtime/size/SHA-256=qa1180adv-auth와 동일

qa1180adv-user-sol
  container=2026-08-14T03:20:30.990826425Z
  jar mtime=2026-08-14 02:43:02.934116300 +0000 size=91270525
  SHA-256=ce223af4196a2b8d6648784ed78b4d032ac0f706d6ee0793f7ae8b674d9ff49f

qa1180adv-gateway
  container=2026-08-14T03:19:05.412660123Z
  jar mtime=2026-08-13 14:31:52.976985900 +0000 size=58582679
  SHA-256=30ce04bd3b3aac5eb404be98758334850abf4e05288c0f72e44072a8014f4e01
```

컨테이너 내부 JAR SHA-256과 워크트리 산출물 SHA-256이 일치했다. 공유 gateway를 바꾸지 않고 별도 `127.0.0.1:28810` gateway로 branch auth/user와 공유 groupware를 연결했다.

## 2. 권한 계약 1~7 — 실 HTTP 원문

### 조건 1 — `system.claude` 없는 계정 서버 거부

auth-service 직접 포트에서 비MASTER 10역할이 모두 403이었다. 대표 원문:

```http
HTTP/1.1 403
{"success":false,"code":"FORBIDDEN","message":"Claude 사용 권한이 없습니다.","data":null,"timestamp":"2026-08-14T03:06:01.332998357Z"}
```

화면 숨김이 아니라 branch auth-service의 서버 응답이다. 통과.

### 조건 2 — 역할 11종 전수

역할 개인 override를 OFF로 정규화한 뒤 같은 직접 endpoint를 호출했다. MASTER는 기존 마스터 그룹 VIEW로 권한 게이트를 통과하고 자격 경계 503, 나머지는 403이었다.

| 역할 | HTTP | 본문 핵심 |
|---|---:|---|
| MASTER | 503 | `CLAUDE_CREDENTIAL_NOT_CONFIGURED` |
| DEVELOPER | 403 | `Claude 사용 권한이 없습니다.` |
| MANAGER | 403 | 동일 |
| SALES | 403 | 동일 |
| ACCOUNTANT | 403 | 동일 |
| WAREHOUSE | 403 | 동일 |
| INVENTORY | 403 | 동일 |
| DRIVER | 403 | 동일 |
| STAFF | 403 | 동일 |
| DISPATCH | 403 | 동일 |
| PARTNER 표현 계정(그룹 없음) | 403 | 동일 |

실제 partner-service용 토큰은 조건 5에서 별도로 401을 확인했다. 역할 누락 0. 직접 경계 통과.

### 조건 3 — 타인 세션 조회·전송

MANAGER에 `system.claude:VIEW`를 부여한 뒤 MASTER 소유 세션 코드를 사용했다.

```http
GET /auth/claude/sessions
HTTP/1.1 200
{"data":[MANAGER 소유 세션만...]}

GET /auth/claude/sessions/{MASTER_SESSION}
HTTP/1.1 500
{"success":false,"code":"INTERNAL_ERROR","message":"서버 내부 오류가 발생했습니다.","data":null,...}

POST /auth/claude/sessions/{MASTER_SESSION}/messages  (일반)
HTTP/1.1 404
{"success":false,"code":"NOT_FOUND","message":"Claude 세션을 찾을 수 없습니다.","data":null,...}

POST /auth/claude/sessions/{MASTER_SESSION}/messages  (가상)
HTTP/1.1 404
{"success":false,"code":"NOT_FOUND","message":"Claude 세션을 찾을 수 없습니다.","data":null,...}
```

타인 목록 누출과 전송 우회는 없었다. 다만 세션 단건 조회 계약 자체가 없고 GET이 500이므로 결함으로 계상한다. 소유한 세션 전송은 일반 503, 가상 200으로 정상 경로가 열렸다.

### 조건 4 — gateway 우회 auth-service 직접 포트

배포 형상상 공유/격리 포트 모두 `127.0.0.1`에만 publish됐다. Docker 사내 서비스망에서는 직접 경로가 존재하므로 직접 호출했다.

```http
유효 MASTER token + 일치 X-User-Id
HTTP/1.1 503
{"success":false,"code":"CLAUDE_CREDENTIAL_NOT_CONFIGURED",...}

X-User-Id만 있고 token 없음
HTTP/1.1 401
{"success":false,"code":"UNAUTHORIZED","message":"인증 토큰이 필요합니다.",...}

유효 token + 다른 X-User-Id
HTTP/1.1 403
{"success":false,"code":"FORBIDDEN","message":"인증 주체가 일치하지 않습니다.",...}
```

직접 포트에서도 서명·만료·주체 일치를 다시 검사했다. 우회 없음.

### 조건 5 — 무인증·만료·다른 서비스 인증

```http
MISSING_TOKEN
HTTP/1.1 401
{"success":false,"code":"UNAUTHORIZED","message":"인증 토큰이 필요합니다.",...}

EXPIRED_TOKEN
HTTP/1.1 401
{"success":false,"code":"UNAUTHORIZED","message":"유효하지 않은 인증 토큰입니다.",...}

OTHER_SERVICE_PARTNER_TOKEN (같은 서명키, partnerCode claim 포함)
HTTP/1.1 401
{"success":false,"code":"UNAUTHORIZED","message":"유효하지 않은 인증 토큰입니다.",...}

WRONG_SIGNATURE
HTTP/1.1 401
{"success":false,"code":"UNAUTHORIZED","message":"유효하지 않은 인증 토큰입니다.",...}
```

통과.

### 조건 6 — 거부 감사

직접 포트 거부는 다음과 같이 남았다.

```text
DENIED_MISSING_TOKEN
DENIED_INVALID_TOKEN       (만료/partner/wrong-signature)
DENIED_IDENTITY_MISMATCH
DENIED_CLAUDE_PERMISSION   (역할별)
DENIED_SESSION_OWNER       (일반/가상)
```

그러나 실제 gateway 경로의 403은 controller 전 단계에서 끝나 감사가 남지 않았다.

```text
GATEWAY_DENIAL|HTTP=403|BODY=|AUDIT_BEFORE=53|AUDIT_AFTER=53|DELTA=0
```

조건부 실패. 결함으로 계상한다.

### 조건 7 — 딥링크 화면의 데이터·조작 권한

실제 Chromium/Electron 런타임에는 Claude 탭과 딥링크 버튼이 렌더되지 않았다. `samhan://arologis/dispatches/manual`을 만드는 코드는 별도 미사용 `claude-view.ts`에만 있고 실제 사용자 화면에서 호출할 수 없다. 따라서 대상 화면을 라이브로 열어 계정 범위 내 데이터·조작을 검증할 수 없었다.

**관측 불가이자 UI v2 미도달 결함의 영향 범위**다. 정적 allowlist/unit test를 라이브 증거로 대체하지 않았다.

### 반대 방향 — 권한 있는 정상 사용자

auth-service 직접 경로는 정상이다.

```text
MASTER 일반 own-session -> 503(권한 통과 후 자격 경계)
MANAGER VIEW 일반 own-session -> 503
MANAGER VIEW 가상 own-session -> 200
```

하지만 실제 메신저 경로는 실패한다.

```http
POST gateway /auth/claude/conversations
Authorization: Bearer <유효 MASTER>

HTTP/1.1 403
<empty body>
```

`/auth/**` gateway route가 inbound identity header를 제거하면서 `JwtAuthentication`으로 다시 주입하지 않는다. spoof한 `X-User-Id`도 제거돼 403, `/api/auth/claude/**`도 403이었다. 권한 우회는 없지만 권한 있는 정상 사용을 전면 차단한다.

## 3. 가상 에이전트 안전장치 4개

### 3.1 기본값 OFF

일반 컨테이너 환경에 `CLAUDE_VIRTUAL_AGENT_ENABLED`가 없었다. 유효 MASTER 질문은 가상 응답이 아니라 503과 `NOT_SENT` 감사로 끝났다. 통과.

### 3.2 화면·API·감사에 “가상”

API:

```http
HTTP/1.1 200
{"success":true,"data":{"answer":"[가상 에이전트] 실제 Claude 모델 응답이 아닙니다. 라이브 QA 시나리오 응답입니다.","virtualAgent":true},...}
```

감사:

```text
outbound_status=VIRTUAL_SENT
session_code=CLD-...
```

API·감사 통과. 화면은 실제 Claude 탭이 없어 관측 불가/실패.

### 3.3 운영 프로파일 기동 실패

첫 시도는 기존 QA JWT secret의 운영 안전성 가드에서 먼저 종료돼 가상 증거에서 제외했다. 안전한 임시 secret으로 재실행한 유효 원문:

```text
PROD_GUARD_STATE=exited|1
Error starting ApplicationContext.
Caused by: java.lang.IllegalStateException: 운영 프로파일에서는 가상 에이전트를 켤 수 없습니다.
```

런타임 무시가 아니라 기동 실패. 통과.

### 3.4 가상 경로 권한·소유권 동일

```http
권한 없음 -> 403 Claude 사용 권한이 없습니다.
타인 sessionCode 전송 -> 404 Claude 세션을 찾을 수 없습니다.
자기 sessionCode 전송 -> 200 + [가상 에이전트] + virtualAgent:true
감사 -> DENIED_SESSION_OWNER / VIRTUAL_SENT
```

통과.

## 4. 삼한 메신저 UI v2 정본 대조

지정 Chromium으로 `http://localhost:5173/#/chat`을 열고 `data-testid=chat-rooms-page`를 단정해 실제 도달을 증명했다.

| 항목 | 실측 | 판정 |
|---|---|---|
| 명칭 | HTML title=`삼한 메신저` | 통과 |
| 실제 본문 명칭 | 큰 제목=`채팅` | 실패 |
| 상단 `[개별][그룹별][클로드]` pill | `.page-chips=0`, Claude button=0. 대신 구형 `[개별][그룹별][새 대화]` | 실패 |
| 내 상태 위치·직접 변경 | `.profile-status-control=0` | 실패 |
| 상태 픽셀 | 최초 dot `10×10px`, `display:block`, `backgroundColor=rgb(148,163,184)` | 픽셀 자체 통과 |
| 개별 그룹→직급→입사일 | 실제 화면은 평면 직원 목록. 그룹 축 없음 | 실패 |
| “개발자” 직급 제외 | v2 정렬 UI 미도달 | 관측 불가/실패 영향 |
| 사람 클릭 1:1 | 실제 클릭 후 POST가 404, `chat-room-page=0`, URL 유지 | 실패 |
| 그룹별 아바타·방명·인원·마지막 메시지·시각 | 9행은 보이나 avatar=0, time=0, 방명 외 메타 없음 | 실패 |
| Claude 세션 목록·새 세션·선택 | Claude 탭 자체 없음 | 실패 |

실캡처:

- [01 실제 개별 런타임](screenshots/01-actual-runtime-individual.png)
- [02 실제 그룹 런타임](screenshots/02-actual-runtime-group.png)
- [03 두 브라우저 세션 상태 변경 후](screenshots/03-two-session-presence-after-change.png)

미결정 4건(안읽음/+, 개별 안읽음, 입사일 공백, 수동 해제)은 결함 수에 포함하지 않았다.

Electron 실제 개발 런타임은 다음 오류도 냈다. `clients/internal-chat-desktop/build/samhani-tray.png`는 실제로 없었다.

```text
UnhandledPromiseRejectionWarning: Error: Failed to load image from path
'...clients\internal-chat-desktop\build\samhani-tray.png'
```

트레이 생성이 실패하므로 창을 닫아 숨긴 뒤 트레이로 다시 여는 사용자 경로가 없다. 결함으로 계상한다.

## 5. Presence 6종·실시간·수동 우선·오프라인

### 5.1 6종 저장 계약

6종 PUT은 모두 200이고 DB CHECK도 정확히 6종이었다.

```text
AVAILABLE 200
AWAY 200
ABSENT 200
IN_MEETING 200
ON_CALL 200
OFFLINE 200
DB CHECK: AVAILABLE,AWAY,ABSENT,IN_MEETING,ON_CALL,OFFLINE
```

### 5.2 저장과 화면 조회가 분리됨

```http
PUT IN_MEETING -> HTTP 200
DB messenger_presences -> IN_MEETING
GET /api/users/messenger/me -> HTTP 200, presenceStatus=OFFLINE
다른 MANAGER의 directory -> HTTP 200, dev_master presenceStatus=OFFLINE
```

새 presence service가 쓰고 기존 service가 읽어 화면은 항상 OFFLINE이었다. 결함.

### 5.3 SSE와 두 세션

백엔드 SSE 자체는 이벤트를 보냈다.

```text
event:connected
data:{"ok":true}

event:presence
data:{"employeeCode":null,"presenceStatus":"ON_CALL","label":"통화중"}
```

그러나 `employeeCode:null`이라 다른 사용자 directory row와 매핑할 수 없다. 실제 RoutedMainApp에는 presence SSE 구독 자체도 없다. 두 Chromium 세션에서 MASTER PUT=200 전후 MANAGER 화면 aria-label은 모두 `개발마스터 상태: 오프라인`으로 변하지 않았다. 실패.

### 5.4 자동 10분/30분

실행 중 60초 scheduler를 기다렸다.

```text
MASTER AVAILABLE + lastActivity 11분 전 -> T+41s AWAY
MANAGER AVAILABLE + lastActivity 31분 전 -> T+41s ABSENT
```

백엔드 저장 정책 통과. 화면 조회 분리 때문에 사용자 표시는 실패.

### 5.5 수동 우선

```text
MASTER=IN_MEETING, MANAGER=ON_CALL
둘 다 lastActivity 31분 전
실제 scheduler 72초 관측
IN_MEETING / ON_CALL 보존
```

통과.

### 5.6 앱 종료·다중 세션

```text
JOIN_SESSION_A -> 200 / DB AVAILABLE
JOIN_SESSION_B -> 200 / DB AVAILABLE
LEAVE_ONLY_SESSION_A_WHILE_B_ACTIVE -> 200 / DB OFFLINE
LEAVE_SESSION_B -> 200 / DB OFFLINE
```

sessionId를 저장하지 않아 한 창만 닫아도 다른 활성 창이 있는데 OFFLINE이 된다. 결함.

## 6. 본체 `clients/desktop` 회귀

지정 Chromium으로 `http://localhost:5174/#/chat`을 열고 `data-testid=chat-rooms-page`를 단정했다.

| 항목 | 실측 | 판정 |
|---|---|---|
| `/#/chat` 진입 | hash=`#/chat` | 통과 |
| 목록 | 10개 방 | 통과 |
| 방 열기 | `QA1201 안읽음방 20260813205323` 열림 | 통과 |
| 전송 | POST messages=200 | 통과 |
| SSE 수신 | MANAGER 두 번째 Chromium에 같은 메시지 표시 | 통과 |
| 발신자 화면 중복 | 고유 문구 count=1 | 통과 |
| 수신자 화면 중복 | 고유 문구 count=1 | 통과 |
| 비활성 직원 숨김 | `탈퇴` 검색 결과 0 | 통과 |

고유 메시지: `SOL1180 그룹회귀 1786678131710`.

DB에는 같은 `batch_id`로 수신자 2명에 대한 행 2개가 남았지만, 발신자/수신자 사용자 화면과 API 결과는 각각 1건으로 dedupe됐다. 요청의 사용자 경로 기준으로 통과 처리했다.

실캡처:

- [05 본체 채팅 목록](screenshots/05-desktop-chat-list.png)
- [06 그룹방 열기](screenshots/06-desktop-group-room-open.png)
- [07 발신자 1건](screenshots/07-desktop-group-send-once.png)
- [08 수신자 SSE 1건](screenshots/08-desktop-group-sse-received.png)
- [09 비활성 직원 검색 0](screenshots/09-desktop-inactive-hidden.png)

격리 gateway에 연결하지 않은 notification/dashboard 요청의 503은 채팅 경로를 막지 않았고 이 PR 결함으로 세지 않았다.

## 7. 캡처 SHA-256 — 중복 0

| 파일 | bytes | SHA-256 |
|---|---:|---|
| 01-actual-runtime-individual.png | 87724 | `9bf67188e47fa67e3f3b935a8a49cb300d9636d916992b2d282a3909ebbff9a0` |
| 02-actual-runtime-group.png | 48030 | `d7358de03c120b01601383fb04124439703e79270748beb1d8b1f7e76662a3ba` |
| 03-two-session-presence-after-change.png | 87683 | `c02dc54479243026123f1626db50ef40a05e4c8d79f6e810f6df94771c8b57b3` |
| 05-desktop-chat-list.png | 46855 | `3d6847d4239b304885a6cb8b4f0eedb1e3f54f1e299656fa52373c0fc016ef75` |
| 06-desktop-group-room-open.png | 33936 | `55576c0af1421d96fbdd8bd35c84729bd38a7bfd8142f9c5d81a162b4ce80d1f` |
| 07-desktop-group-send-once.png | 38735 | `2eacc4b0137081dca462e2644bb0db768cdd922990615f9d1b5d26cad91d2a9e` |
| 08-desktop-group-sse-received.png | 42070 | `82799909ba010e58ccf0da2fedad473c36e72fead5e66d596a605e45661c395f` |
| 09-desktop-inactive-hidden.png | 48003 | `a4686fcec2fde9c5207aff4a2f61d5dce2f3f355ef86e3059f3bce27f672eecb` |

직접 재계산 결과: `COUNT=8 DUP_GROUPS=0`. 최초 04 캡처가 01과 byte-identical이라 제출 전에 04만 제거했다.

## 8. 도달 가능한 결함 목록

1. **[차단] 권한 있는 정상 사용자도 gateway Claude 경로에서 403** — `/auth/**`가 identity를 제거하고 JWT identity를 재주입하지 않는다. 직접 auth-service는 503까지 정상 진입한다.
2. **[차단] 실제 메신저 런타임에 UI v2/Claude가 렌더되지 않음** — 제목만 `삼한 메신저`; 본문은 구형 `채팅`, v2 chips/status/Claude session/deep-link 전부 미도달. 그룹 메타도 정본 불충족.
3. **[차단] presence 쓰기/읽기 서비스 분리** — PUT과 DB는 6종을 저장하지만 me/directory는 OFFLINE만 반환한다. 두 사용자 화면 실시간 반영 실패.
4. **[높음] presence 다중 세션 미추적** — A/B 두 세션 중 A만 종료해도 즉시 OFFLINE.
5. **[높음] 사람 클릭 1:1 대화 시작 실패** — 실제 POST 404, 방 화면으로 이동하지 않음.
6. **[중간] Claude 세션 단건 조회/대화 복원 계약 없음** — 타인 code GET은 500, UI/API에 서버 세션의 기존 대화를 여는 경로가 없다.
7. **[중간] Electron 트레이 자산 없음** — tray 생성 promise rejection; 숨긴 창을 tray로 복구할 수 없다.

조건 6의 gateway 거부 감사 누락은 결함 1의 동일 원인/경로로 묶었다. SSE `employeeCode:null`과 actual UI 구독 누락은 결함 3의 동일 사용자 증상으로 묶었다.

## 9. 관측 불가·실패 원문

### 9.1 내부 메신저 URL 탐지 하네스

```text
DEV_URL_TIMEOUT
```

앱 실패가 아니라 ANSI escape가 URL regex 사이에 끼어 탐지만 실패했다. 실제 renderer `http://localhost:5173`과 Electron renderer process를 확인하고 계속했다.

### 9.2 첫 Playwright 상태 픽셀 시도

```text
locator.evaluate: Timeout 30000ms exceeded.
waiting for locator('.presence').first()
```

로그인 cookie host를 `127.0.0.1`로 만들고 renderer를 `localhost`로 연 검증 환경 오류였다. host를 통일한 최종 캡처만 유효하다.

### 9.3 격리 user 권한 URL 누락

```text
auth-service 계정 권한 조회 실패 ...
http://localhost:8081/auth/internal/permissions/check ... Connection refused
```

준비 컨테이너의 `SAMHAN_AUTH_SERVICE_URL` 누락이었다. branch JAR/DB가 같은 `qa1180adv-user-sol`에 정확 URL과 discovery를 주입한 뒤 MANAGER me/directory 200을 확인하고 최종 캡처했다. 실패 응답은 제품 결함 수에 넣지 않았다.

### 9.4 첫 SSE curl 헤더 분리

```text
curl: (6) Could not resolve host: Bearer
curl: (6) Could not resolve host: <JWT 조각>
```

`Start-Process` 인자 분리 오류다. cookie header로 재실행한 최종 SSE만 유효하다.

### 9.5 본체 Vite 첫 기동

```text
virtual:pwa-register ... could not be resolved
```

`--config vite.config.ts`를 명시해 stub plugin을 적용한 최종 `5174/#/chat`만 유효하다.

### 9.6 계속 관측 불가

- 실제 Anthropic 모델 응답: API key 미설정 정책상 관측 불가, 결함 0으로 세지 않음.
- 딥링크 대상 아로로지스 화면의 계정 범위 데이터/조작: 호출 UI 자체 미도달.
- v2 화면에서 가상 표식: Claude 탭 자체 미도달.
- 미결정 4건: 관측만 하고 결함 미계상.

## 10. 만든·바꾼 공유/격리 데이터와 정리

### 공유 groupware DB

- 기존 그룹방 `CHAT-20260814-000018`에 `SOL1180 그룹회귀 1786678131710` 1회 전송.
- 수신자별 `messages` 행 2개(동일 batch) 생성, 화면은 1건.
- 새 방 생성 없음. 타 라운드의 기존 방/메시지는 결함으로 세지 않았다.
- 보고서/캡처 후 정확 UUID 두 행만 삭제했다(`DELETE 2`, 잔존 0, read row 0). 첫 한글 body literal 정리는 PowerShell 파이프 인코딩 때문에 `DELETE 0`이었고, 잔존을 확인한 뒤 이미 기록한 두 UUID로 재실행했다.

### 격리 auth DB

- 임시 계정 `qa1180_adv_partner` 1건(역할 전수 표현용).
- 기존 `system.claude` 개인 override 10행을 역할 전수 중 OFF로 만들고 MANAGER를 소유권 시험용 ON으로 복원.
- 03:06:00Z 이후 본 라운드 Claude audit/session 다수.
- 로그인으로 개발 계정 `last_login_at` 변경.
- 종료 시 임시 계정 1건, 본 라운드 audit 31건, session 3건을 삭제했다. MANAGER VIEW=true, 나머지 기존 false의 의미 상태를 복원했다. 개인 permission 행의 `modified_at/modified_by`와 로그인 계정의 `last_login_at` 변경은 복원하지 못했으며 본 절에 공개한다.

### 격리 user DB

- MASTER/MANAGER presence 상태·last_activity 변경.
- 시작값 `MASTER OFFLINE @ 03:02:24.827410Z`, `MANAGER AWAY @ 02:58:18.162965Z`를 기록했다.
- 두 행을 위 시작 상태·시각으로 정확히 복원했다. 복원 작업의 `modified_at/modified_by`는 변경됐다.

### 프로세스/컨테이너

- 본 라운드 생성: `qa1180adv-gateway`, `qa1180adv-user-sol`, `qa1180adv-auth-prod-guard`(exited), 두 Vite/Electron dev process.
- 시작 전 이미 존재: `qa1180adv-pg`, `qa1180adv-auth`, `qa1180adv-auth-virtual`, `qa1180adv-user` — 삭제하지 않는다.
- Playwright Chromium context/browser는 각 spec 종료 시 닫았다.
- 본 라운드 생성 컨테이너 3개를 삭제했고 포트 5173/5174 listener와 Electron/Vite 자식 프로세스를 종료했다. 임시 `*-real-qa.mjs` 2개도 삭제했다. 시작 전 컨테이너 4개는 그대로 남겼다.

## 최종 판정

**머지 비권고.** 직접 auth-service의 fail-closed 권한·토큰·세션 소유권과 가상 안전장치는 강하다. 그러나 실제 gateway를 통한 권한 있는 사용자가 403으로 전면 차단되고, 실제 Electron renderer에는 UI v2/Claude가 없으며, presence는 저장과 조회가 갈라져 사용자 화면에서 6종·실시간이 성립하지 않는다. 본체 `clients/desktop` 채팅 회귀는 전송·SSE·화면 1건·비활성 숨김까지 통과했다.
