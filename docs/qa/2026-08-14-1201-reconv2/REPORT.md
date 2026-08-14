# PR #1201 fix 라운드 재수렴 라이브 QA 보고서

> 2026-08-14 · 역할 SOL(재수렴 적대검증자) · PR head `d068943a94c87a65ad522b5cbdb5305729af7dbb`

## 판정

**완주한 그룹 메시지·1:1·본체 채팅 경로에서 도달 가능한 결함은 0건이다. 그러나 최우선인 상태 아이콘 4개 표면과 비활성 직원 숨김은 공유 `user-service`가 브랜치 라우트를 포함하지 않은 JAR로 교체된 상태라 관측 불가다. 따라서 PR 전체를 “결함 0”으로 판정하지 않는다.**

- 결함 1 재수렴: 통과. 그룹 메시지 1회 전송은 발신자 1건, 수신자 1건이다.
- 1:1 `batchId=null`: 통과. 발신자·수신자 모두 1건이다.
- 본체 `clients/desktop`: 통과. `/#/chat` 직접 진입, 목록, 방 열기, 전송, 상대 context SSE 수신을 실서버로 완주했다.
- 상태 아이콘: **관측 불가**. 내 정보·directory·검색 결과·그룹 생성 다이얼로그 모두 실제 화면을 열었으나 `/api/users/messenger/*`가 500이라 `.presence`가 생성되지 않았다.
- 비활성 직원 숨김: **관측 불가**. 같은 500 경계 때문에 directory 로딩 완료 조건을 만들 수 없었다.

## 1. 환경 실측 원문

### 1.1 PR·워크트리 정체

금지된 git 명령은 실행하지 않았다. `.git`의 worktree ref 파일과 GitHub PR API를 각각 읽어 서로 대조했다.

```text
LOCAL_REF=refs/heads/feat/894-s1-chat-port
LOCAL_REF_OID=d068943a94c87a65ad522b5cbdb5305729af7dbb

gh pr view 1201
headRefName=feat/894-s1-chat-port
headRefOid=d068943a94c87a65ad522b5cbdb5305729af7dbb
baseRefName=main
state=OPEN
```

PR 본문, issue comments 전부, review comments 전부를 먼저 읽었다. review와 inline review comment는 각각 0건이었다. 정본은 `docs/decisions/2026-08-13-messenger-ui-spec.md`다.

### 1.2 최초 RAM·컨테이너

```text
RAM_FREE_GIB=14.813
RAM_TOTAL_GIB=61.613
RAM_THRESHOLD_GIB=1.000

CONTAINER_EXPECTED=24
SAMHAN_CONTAINER_PRESENT=23
CONTAINER_MISSING=2
MISSING_NAMES=samhan-nginx,samhan-prometheus
```

`PRESENT=23`에는 compose 정본 expected 목록 밖의 `samhan-logging-service`가 들어 있다. gateway/auth/user/groupware/postgres는 모두 존재했다.

### 1.3 배포 전 groupware 이미지·JAR

```text
IMAGE_ID=sha256:d9ada2b5fd49bf2baddcfd441aa4bde604dd6368a68f3e019fd9848d137c93da
IMAGE_CREATED=2026-08-13T22:56:27.84807132Z
CONTAINER_CREATED=2026-08-13T22:56:30.169103977Z
JAR_PATH=/app/app.jar
JAR_MTIME=2026-08-14 07:56:06.000000000 +0900
JAR_SIZE=99438267
```

### 1.4 브랜치 groupware 빌드·단독 재배포

`groupware-service` 외 서비스는 재배포하지 않았다.

```text
.\gradlew.bat :services:groupware-service:bootJar --no-daemon

> Task :services:groupware-service:bootJar
BUILD SUCCESSFUL in 12s
26 actionable tasks: 2 executed, 24 up-to-date
```

```text
docker compose --env-file .env.local \
  -f docker-compose.yml -f docker-compose.local-all.yml \
  up -d --build --no-deps groupware-service

Container samhan-groupware-service Recreated
Container samhan-groupware-service Started
```

재배포 후 직접 재측정했다.

```text
GROUPWARE_IMAGE_ID=sha256:0bd5c9df98ded3926c71a092a20f126612c7bead76e28481772dfb3c99e5edd6
GROUPWARE_IMAGE_CREATED=2026-08-13T23:56:15.493478861Z
GROUPWARE_CONTAINER_CREATED=2026-08-13T23:56:17.615205861Z
GROUPWARE_STATUS=running
GROUPWARE_HEALTH=healthy
GROUPWARE_JAR_MTIME=2026-08-14 08:56:03.000000000 +0900
GROUPWARE_JAR_SIZE=99438783
POST_DEPLOY_RAM_FREE_GIB=13.551
```

### 1.5 실제로 띄운 클라이언트

```text
독립 앱 build
  clients/internal-chat-desktop
  npm run build
  electron-vite production main/preload/renderer build exit 0

독립 앱 실행
  C:\dev\Samhan-Public\.claude\worktrees\w894\clients\internal-chat-desktop\node_modules\electron\dist\electron.exe
  out/main/index.js
  Playwright _electron

본체 build
  clients/desktop
  npm run build:web
  vite production web build exit 0

본체 실행
  http://localhost:5182/#/chat
  C:\Users\user\AppData\Local\ms-playwright\chromium-1217\chrome-win64\chrome.exe
```

독립 Electron과 본체 Chromium은 실제 로그인 API가 발급한 JWT를 각 QA session의 요청 헤더에 주입했다. API·DB·렌더링·SSE는 mock이 아니다.

### 1.6 상태 아이콘을 막은 공유 user-service 실측

지시대로 `user-service`는 재배포하지 않았다. 현재 공유 컨테이너는 이 PR의 브랜치 JAR가 아니며 messenger controller 라우트를 포함하지 않는다.

```text
USER_IMAGE_ID=sha256:2703a84fe2039f17b363f1bb2b9fcb9652e6b6d9377718cbb79c4b6ed063b31d
USER_IMAGE_CREATED=2026-08-13T23:34:30.807127045Z
USER_CONTAINER_CREATED=2026-08-13T23:34:34.123926427Z
USER_STATUS=running
USER_HEALTH=healthy
USER_JAR_MTIME=2026-08-14 08:34:06.000000000 +0900
USER_JAR_SIZE=93513430
```

QA 자격 자체는 해소됐다.

```text
LOGIN|dev_master|200|role=MASTER
LOGIN|dev_manager|200|role=MANAGER
LOGIN|dev_sales|200|role=SALES
LOGIN|dev_developer|200|role=DEVELOPER
```

그러나 실제 directory 요청은 다음과 같았다.

```text
GET /api/users/messenger/directory HTTP 500
{"success":false,"code":"INTERNAL_ERROR","message":"서버 내부 오류가 발생했습니다.","data":null,...}
```

`samhan-user-service` 원문:

```text
org.springframework.web.servlet.resource.NoResourceFoundException:
No static resource users/messenger/directory.
```

## 2. 상태 아이콘 최우선 검증

### 2.1 내 정보

- 실제 Electron production 화면의 `[data-testid="chat-rooms-page"]` 도달을 단정했다.
- `/api/users/messenger/me`가 500이라 내 정보 행은 비었다.
- `.presence` DOM/픽셀은 0개다. 계산색·크기·이름 왼쪽 위치는 **관측 불가**다.
- 실캡처: [01-presence-surfaces-unavailable-directory-500-real-qa.png](screenshots/01-presence-surfaces-unavailable-directory-500-real-qa.png)

### 2.2 직원 목록(directory)

- `[aria-label="직원 목록"]`이 있는 개별 화면까지 도달했다.
- directory HTTP 500으로 목록이 비었다.
- 접속·자리비움·부재중·오프라인 4종의 계산된 픽셀은 **관측 불가**다.
- 같은 캡처 01이 실제 빈 목록을 보인다.

### 2.3 검색 결과

- 개별 화면의 `대화 상대 검색` 입력까지 도달했다.
- directory 데이터가 0이라 검색 결과 `.presence`도 0개였다.
- 아이콘의 이름 왼쪽 위치는 **관측 불가**다.
- 같은 캡처 01에 실제 검색 입력과 빈 결과가 함께 보인다.

### 2.4 그룹 생성 다이얼로그

- `[그룹별]` → `[검색]` → `role=dialog, aria-label=단톡방 생성`을 단정했다.
- `직원 검색`에 `개발`을 실제 입력했다.
- directory HTTP 500 때문에 `presenceCount=0`, 선택 대상 0이었다.
- 실캡처: [02-presence-surface-unavailable-group-dialog-real-qa.png](screenshots/02-presence-surface-unavailable-group-dialog-real-qa.png)

### 2.5 4종 구분·이름 왼쪽 판정

**미실행이 아니라 화면까지 실행했으나 데이터 경계에서 막힌 관측 불가다.** 4종의 실제 계산색/픽셀과 이름 왼쪽 위치를 보지 못했으므로 통과나 결함 0으로 쓰지 않는다. 소스 CSS 존재나 DOM 테스트 결과로 대체 판정하지 않았다.

## 3. 결함 1 재수렴

### 3.1 그룹 발신자 — 1회 전송, 화면 1건

직전 라운드가 만든 기존 그룹방 `CHAT-20260814-000025`를 사용했다. 남의 기존 메시지는 집계하지 않고 이번 고유 본문만 exact text로 셌다.

```text
body=QA1201 reconv2 group 20260814001012
POST /admin/groupware/chat/rooms/CHAT-20260814-000025/messages HTTP 200
sender renderedCount=1
```

실캡처: [03-group-sender-one-message-real-qa.png](screenshots/03-group-sender-one-message-real-qa.png)

### 3.2 그룹 수신자 — 본인 행 유지, 화면 1건

master Electron을 종료한 뒤 manager 실제 Electron session으로 같은 방을 열었다.

```text
recipient renderedCount=1
```

수신자 화면에서 이번 본문이 사라지지 않았고 1건으로 보였다. 실캡처: [05-group-recipient-one-message-real-qa.png](screenshots/05-group-recipient-one-message-real-qa.png)

DB는 수신자별 2행을 유지하되 같은 `batchId`를 공유한다. UUID 값 자체는 기록하지 않는다.

```text
CHAT-20260814-000025
seq=3 batch=set
seq=4 batch=set
rows=2 recipients=2 distinctBatchIds=1
```

즉 저장 행은 2개지만 발신자/수신자 목록 경계에서 각각 논리 메시지 1건이다.

### 3.3 1:1 `batchId=null` 회귀

기존 직접방 `CHAT-20260813-000017`에서 실제 Electron으로 1회 전송했다.

```text
body=QA1201 reconv2 direct 20260814001012
POST HTTP 200
DB rows=1 batch=null seq=11
sender renderedCount=1
recipient renderedCount=1
```

- 발신자: [04-direct-sender-one-message-real-qa.png](screenshots/04-direct-sender-one-message-real-qa.png)
- 수신자: [06-direct-recipient-one-message-real-qa.png](screenshots/06-direct-recipient-one-message-real-qa.png)

### 3.4 본체 clients/desktop 회귀

두 개의 지정 Chromium context에 master/manager 실제 JWT를 각각 주입했다.

```text
URL=http://localhost:5182/#/chat
data-testid=chat-rooms-page visible
CHAT-20260813-000017 link visible
data-testid=chat-room-page visible
```

목록 실캡처: [07-main-chat-list-deeplink-real-qa.png](screenshots/07-main-chat-list-deeplink-real-qa.png)

manager가 같은 방을 먼저 연 상태에서 master가 한 번 전송했다.

```text
body=QA1201 reconv2 main SSE 20260814001232
POST HTTP 200
DB rows=1 batch=null seq=12
master renderedCount=1
manager SSE-triggered renderedCount=1
```

- 발신: [08-main-chat-send-real-qa.png](screenshots/08-main-chat-send-real-qa.png)
- 상대 SSE 수신: [09-main-chat-sse-receive-real-qa.png](screenshots/09-main-chat-sse-receive-real-qa.png)

## 4. 직전 6건 재확인 + 비활성 직원 숨김

| 항목 | 결과 | 실측 |
|---|---|---|
| user API prefix 누락 | 경로 fix 확인, E2E는 관측 불가 | Electron이 `/api/users/messenger/*`를 실제 호출했다. prefix는 맞지만 공유 user JAR의 route 부재로 500 |
| `employeeCode` 전원 null | 관측 불가 | directory 응답 500이라 표본 0 |
| 접속 상태 합성 오류 | 관측 불가 | presence status/session/me/directory route가 공유 user JAR에 없음 |
| 그룹 API 경로 불일치 | 통과(목록·방 경로) | `GET /admin/groupware/chat/rooms/groups` 200, 기존 그룹방 UI 진입 성공. 새 그룹 POST는 directory 차단으로 미실행 |
| 그룹 메시지 unique 500 | 통과 | 그룹 POST 200, DB 2행 보존 |
| 본체 채팅 진입/목록 회귀 | 통과 | `/#/chat`, 목록, 방, 전송, SSE 완주 |
| 비활성 직원 숨김 | 관측 불가 | 로그인 200까지 해소했으나 directory 500. `enabled`를 바꾸면 로딩 완료 증거를 만들 수 없어 DB 변경 자체를 하지 않음 |

직전 통과 항목인 비참여자 권한·UUID 비노출은 이번 필수 경로의 화면/URL에서 새 UUID 노출을 관측하지 않았다. 권한 공격 시나리오는 이번 라운드 범위의 메시지 재수렴과 독립적이라 재실행하지 않았다.

### 미결정 3항목 — 결함으로 세지 않음

- 동일 직급 내 정렬: directory가 비어 관측 불가.
- 개별 목록 안읽음 표시: directory가 비어 관측 불가.
- 자리비움 자동 전환 기준 시간: presence route 부재로 관측 불가.

## 5. 캡처 SHA-256 — 중복 0

```text
SCREENSHOT_COUNT=9
UNIQUE_HASH_COUNT=9
DUPLICATE_HASH_COUNT=0
```

| 파일 | SHA-256 | bytes |
|---|---|---:|
| `01-presence-surfaces-unavailable-directory-500-real-qa.png` | `C1F5F460C3826F42DB48C2C10F6BC8ED3A4104A77A012E971599080BD6D88D83` | 14722 |
| `02-presence-surface-unavailable-group-dialog-real-qa.png` | `2A6D193E4C1961776CE4D6BD743AE347CD424AB3A9B86D095DA8EDAFE3736230` | 10980 |
| `03-group-sender-one-message-real-qa.png` | `E723B7385005163479ACF2DAE852FC5786754542934842E9417EE02D6A204DF7` | 39533 |
| `04-direct-sender-one-message-real-qa.png` | `A669EB57C2060DE366197552A4E923D0110052D35B38ACC438AC62EFE7673A50` | 169318 |
| `05-group-recipient-one-message-real-qa.png` | `27553AFEED6C9D865CC823F13AF00BACB05A1F907527067F80AED51FD728553F` | 44528 |
| `06-direct-recipient-one-message-real-qa.png` | `1D071084092DD18ECD89764789554F5968B4F14B9594171C6039C671D95AC48E` | 187792 |
| `07-main-chat-list-deeplink-real-qa.png` | `BCB9716229E0A0C6321EDA4D90E916FBD0B6649FAE43C0636F95C450A2B5FE90` | 41099 |
| `08-main-chat-send-real-qa.png` | `3FF0D89F93AC362B532064077B7FD800BC82975FFDFD81614CE8427AA2F57B58` | 92898 |
| `09-main-chat-sse-receive-real-qa.png` | `03211E1F989D16C9765A9C4F5B4757601B4F69FDD471B23B8E52AFC33F09A3D4` | 105514 |

9장을 제출 전에 직접 열어 서로 다른 실제 화면임을 확인했다.

## 6. 도달 가능한 결함 목록

**완주한 경로의 도달 가능한 결함: 0건.**

단, 상태 아이콘 4표면과 비활성 직원 숨김은 관측 불가이므로 PR 전체의 “결함 0” 판정은 보류한다. shared `user-service`를 이 브랜치 산출물로 검증할 수 있는 전용 시점이 필요하다. 본 라운드에서는 재배포 금지 지시를 지켰다.

## 7. 관측 불가와 실패 원문

### 7.1 상태 아이콘·비활성 직원 숨김

```text
GET /api/users/messenger/directory HTTP 500
GET /api/users/messenger/me HTTP 500
POST /api/users/messenger/presence/sessions/{sessionId} HTTP 500

NoResourceFoundException:
No static resource users/messenger/directory.
```

영향:

```text
내 정보                  관측 불가
직원 목록                관측 불가
검색 결과                관측 불가
그룹 생성 다이얼로그      관측 불가
4상태 계산색/픽셀         관측 불가
이름 왼쪽 위치            관측 불가
비활성 직원 숨김          관측 불가
```

### 7.2 본체 로그인 UI 하네스 실패와 우회

본체 production preview의 로그인 UI는 submit 후 화면 전환이 없었다. 같은 자격의 직접 로그인 API는 200이었다. 채팅 회귀는 실제 JWT를 browser context에 주입해 완주했다.

```text
HARNESS_FAILURE|web login UI dev_master|submit 후 화면 전환 없음
LOGIN|dev_master|200|role=MASTER
```

로그인 UI 자체는 이번 요청의 본체 채팅 체크리스트에 포함되지 않았으므로 도달 결함으로 세지 않았다. 채팅 API·화면·SSE에는 mock을 쓰지 않았다.

### 7.3 폐기한 첫 실행

첫 두 실행은 shell 도구 시간 제한을 잘못 1초로 지정해 외부에서 종료됐다. 앱 판정·캡처·데이터 집계에 쓰지 않았다.

```text
command timed out after 5026 milliseconds
```

명령행에 `1201-reconv2-real-qa` 또는 해당 Electron entry가 있는 PID만 종료한 뒤 재실행했다.

## 8. 공유 DB에 만든 것

### 8.1 새 방

```text
0개
```

직전 라운드의 기존 그룹방 `CHAT-20260814-000025`와 기존 직접방 `CHAT-20260813-000017`만 사용했다.

### 8.2 새 메시지

```text
1) QA1201 reconv2 group 20260814001012
   room=CHAT-20260814-000025
   논리 전송 1건 / DB 2행 / batch=set / recipients=2

2) QA1201 reconv2 direct 20260814001012
   room=CHAT-20260813-000017
   DB 1행 / batch=null

3) QA1201 reconv2 main SSE 20260814001232
   room=CHAT-20260813-000017
   DB 1행 / batch=null
```

### 8.3 임시 변경·원복

- `auth_db.accounts.dev_sales.enabled`: 변경하지 않음. 종료 실측 `dev_sales|true`.
- presence manual/session: 공유 user JAR의 route 부재로 모두 500, 상태 변경 없음.
- 직원·employeeCode·termination_date 변경: 없음.
- 방/메시지 삭제: 없음.

## 9. 종료 정리

```text
QA_NODE_ELECTRON_CHROMIUM_PROCESSES=NONE
PORT5182=CLOSED
PORT5187=CLOSED
POST_QA_RAM_FREE_GIB=13.377
TEMP_REAL_QA_SCRIPT=DELETED
DOCS_QA_SCRIPT=NONE
```

`inventory-service`, `logging-service`, `user-service`, `dashboard-service`, `auth-service` 등 다른 트랙 서비스는 재배포하지 않았다.
