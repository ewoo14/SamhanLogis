# PR #1201 재수렴 라이브 QA 보고서

> 2026-08-14 · 역할 SOL(재수렴 적대검증자) · PR head `b2ca758b6a0550ffb23c7b891de62690a2d3bfa5`

## 판정

**도달 가능한 결함 2종이 남아 있고, 직전 7건 중 비활성 직원 숨김 1건은 증거 무결성 재검토 결과 관측 불가로 정정한다. 머지 비권고.**

직전 라운드의 7개 원 증상 중 6개(API prefix, `employeeCode=null`, presence 합성, 그룹 경로, 그룹 메시지 500, 본체 채팅 회귀)는 닫혔다. 비활성 직원 숨김은 당시 캡처가 directory 로딩 완료를 증명하지 못해 관측 불가로 정정한다. 또한 ⑥의 sequence 충돌 fix가 그룹 메시지를 수신자 수만큼 발신자 화면에 중복 표시하는 새 결함을 만들었다. 화면 정본이 요구한 상태 아이콘도 실제 픽셀로 보이지 않는다.

## 1. 환경 실측 원문

### 1.1 PR 및 변경 범위

```text
gh pr view 1201
headRefName : feat/894-s1-chat-port
headRefOid  : b2ca758b6a0550ffb23c7b891de62690a2d3bfa5
baseRefName : main
state       : OPEN
```

PR 변경 파일 목록에 Flyway migration 파일은 **0개**였다. 따라서 격리 DB가 아니라 공유 DB를 사용했다. 실제 변경 서비스는 `auth-service`, `user-service`, `groupware-service` 세 개뿐이어서 이 세 서비스만 재배포했다. `inventory-service`, `logging-service`, `dashboard-service` 등은 건드리지 않았다.

### 1.2 최초 RAM, 컨테이너, 기존 JAR

```text
HOST_RAM|FreeBytes=21736480768|TotalBytes=66156642304|FreeGiB=20.244|TotalGiB=61.613

/samhan-auth-service|2026-08-12T00:03:23.288496844Z|running|healthy
JAR|/app/app.jar|mtime=2026-08-12 09:03:06.000000000 +0900|size=88064529

/samhan-user-service|2026-08-13T22:50:32.297525685Z|running|starting
JAR|/app/app.jar|mtime=2026-08-14 06:36:12.000000000 +0900|size=93513389

/samhan-groupware-service|2026-08-13T21:04:34.684137017Z|running|healthy
JAR|/app/app.jar|mtime=2026-08-13 22:23:07.000000000 +0900|size=99428705
```

Compose 정본 조합(`docker-compose.yml + docker-compose.local-all.yml`)으로 서비스 존재 여부도 따로 셌다.

```text
CONTAINER_EXPECTED=24
CONTAINER_PRESENT=23
CONTAINER_MISSING=2
MISSING|nginx
MISSING|prometheus
```

`PRESENT=23`에는 현재 정본의 expected 목록 밖에서 이미 돌고 있던 `logging-service`가 포함된다. QA 핵심인 gateway/auth/user/groupware/postgres는 존재했다.

### 1.3 브랜치 JAR 빌드와 재배포 원문

```text
.\gradlew.bat :services:auth-service:bootJar :services:user-service:bootJar :services:groupware-service:bootJar --no-daemon

> Task :services:user-service:bootJar
> Task :services:groupware-service:bootJar
> Task :services:auth-service:bootJar

BUILD SUCCESSFUL in 14s
34 actionable tasks: 7 executed, 27 up-to-date
```

```text
docker compose -f docker-compose.yml -f docker-compose.local-all.yml up -d --build --no-deps auth-service user-service groupware-service

Container samhan-user-service Recreated
Container samhan-auth-service Recreated
Container samhan-groupware-service Recreated
Container samhan-user-service Started
Container samhan-groupware-service Started
Container samhan-auth-service Started
```

QA 시작 직전 세 컨테이너와 내부 JAR를 다시 쟀다.

```text
/samhan-auth-service|2026-08-13T22:56:30.169049611Z|running|healthy|sha256:d0976339...
JAR|/app/app.jar|mtime=2026-08-14 07:56:06.000000000 +0900|size=88069798

/samhan-user-service|2026-08-13T22:56:30.169535656Z|running|healthy|sha256:48062354...
JAR|/app/app.jar|mtime=2026-08-14 07:56:06.000000000 +0900|size=91252809

/samhan-groupware-service|2026-08-13T22:56:30.169103977Z|running|healthy|sha256:d9ada2b5...
JAR|/app/app.jar|mtime=2026-08-14 07:56:06.000000000 +0900|size=99438267

POST_DEPLOY_RAM|FreeGiB=19.306
```

독립 앱은 `npm run build`로 Electron production renderer/main/preload를 만들었고, 본체는 `npm run build:web`으로 production web build를 만들었다. 둘 다 exit 0이었다.

```text
독립 앱  electron-vite build  exit 0
본체     vite build --config vite.web.config.ts  exit 0
```

브라우저/앱:

```text
독립 앱  실제 Electron production build + Playwright _electron
본체     C:\Users\user\AppData\Local\ms-playwright\chromium-1217\chrome-win64\chrome.exe
본체 URL http://localhost:5182/#/chat
gateway  http://localhost:8080
```

독립 Electron의 S3 자동 로그인은 PR 본문이 범위 밖으로 명시했고 production build 안에 로그인 UI/토큰 전달 경로가 없다. 따라서 이전 라이브 QA와 동일하게 실 API 로그인으로 받은 실제 JWT를 Electron QA session의 요청 헤더에만 주입했다. 데이터/API/렌더링은 mock 없이 실 서버를 사용했다.

### 1.4 QA 종료 후 공유 스택의 동시 변경

QA가 끝난 뒤 다른 트랙이 `user-service`를 다시 재배포했다. 이 라운드의 배포/판정 시점과 구분해야 한다.

```text
QA 수행 시 user-service
/samhan-user-service|2026-08-13T22:56:30.169535656Z
JAR mtime=2026-08-14 07:56:06 +0900 size=91252809

QA 종료 후 재측정
/samhan-user-service|2026-08-13T23:14:47.956633928Z|running|starting|sha256:b97577de...
JAR mtime=2026-08-14 06:36:12 +0900 size=93513389
```

이 교체 뒤 directory가 500으로 바뀌었으나, 교체 전 브랜치 빌드에서는 마지막 완주까지 directory 200이었다. 다른 트랙의 재배포를 이 PR 결함으로 세지 않았다. 종료 시 RAM은 `FreeGiB=15.806`이었다.

## 2. 직전 도달 결함 7건 재검증

### ① user API prefix 누락 — 닫힘

재현:

1. `dev_master` 실 로그인.
2. 실제 Electron build를 열고 `chat-rooms-page`를 단정.
3. 직원 목록이 렌더될 때까지 기다리고 네트워크를 기록.

```text
GET 200 /api/users/messenger/me
GET 200 /api/users/messenger/directory
POST 200 /api/users/messenger/presence/sessions/{sessionId}
directoryCount=8
```

결과: `/api` prefix 경로가 사용되며 직원 목록이 표시됐다. [01-independent-directory.png](screenshots/01-independent-directory.png)

### ② `employeeCode` 전원 null — 닫힘

재현:

1. 실 directory 응답의 `employeeCode` null 수를 센다.
2. 직원 목록에서 `[DEV-SEED] 개발매니저` 버튼이 enabled인지 단정.
3. 버튼을 클릭해 1:1 방 생성과 대화 진입을 수행.

```text
directoryCount=8
nullEmployeeCodes=0
POST 201 /admin/groupware/chat/rooms/direct/by-employee-code
roomCode=CHAT-20260813-000017
```

결과: 직원 클릭으로 방에 진입하고 실제 메시지를 보냈다. [02-independent-direct-message.png](screenshots/02-independent-direct-message.png)

### ③ 비활성 직원 노출 — 관측 불가(증거 무결성 정정)

재현:

1. `auth_db.accounts`의 `dev_sales.enabled` 원값 `true` 확인.
2. 일시적으로 `false`로 변경.
3. 실제 Electron directory를 재조회.
4. 직원 목록에서 `[DEV-SEED] 개발영업`이 없는지 단정.
5. `enabled=true`로 원복하고 다시 표시되는지 확인.

실행 당시 4번 단정이 directory 응답 완료가 아니라 정적 `chat-rooms-page` 렌더 직후 실행됐다. [05-disabled-account-hidden.png](screenshots/05-disabled-account-hidden.png)은 직원 목록 전체가 빈 로딩 중 상태이므로 비활성 직원 숨김의 통과 증거가 아니다. 직후 다른 트랙이 `user-service`를 다른 JAR로 교체해 동일 브랜치 환경에서 재실행할 수 없었다. 따라서 **관측 불가**로 정정한다. `dev_sales.enabled` 원복 `true`는 SQL로 확인했다.

### ④ 접속 상태 합성 오류 — 닫힘

재현:

1. `dev_manager` 수동 상태를 `ABSENT`로 설정.
2. `mobile-qa1201-*` 세션을 추가.
3. `dev_sales=AWAY`, `dev_developer=ABSENT`, `dev_accountant=OFFLINE` 상태를 함께 조회.
4. API 값과 Electron DOM의 상태 라벨을 단정.

```text
dev_master=AVAILABLE
dev_manager=AVAILABLE  # ABSENT + mobile session, 세션 우선
dev_sales=AWAY
dev_developer=ABSENT
dev_accountant=OFFLINE
```

결과: “하나 이상 접속이면 접속” 합성은 닫혔다. 단, 상태 아이콘 자체가 화면에 보이지 않는 별도 결함은 §4에 기록한다. [04-presence-four-session-priority.png](screenshots/04-presence-four-session-priority.png)

### ⑤ 그룹 API 경로 불일치 — 닫힘

재현:

1. `[그룹별]` 클릭.
2. `[검색]` → 직원 검색 → 개발매니저/개발영업 복수 선택.
3. `[단톡방 생성]` 클릭.
4. 목록에 새 roomCode 링크가 나타나는지 단정.

```text
GET 200 /admin/groupware/chat/rooms/groups
POST 201 /admin/groupware/chat/rooms/groups
```

결과: 검색·복수 선택·실제 생성이 모두 동작했다. [07-group-search-multiselect.png](screenshots/07-group-search-multiselect.png)

### ⑥ 그룹 메시지 unique 충돌 500 — 원 증상 닫힘, 새 도달 결함 발생

재현:

1. 개발매니저·개발영업을 수신자로 그룹방 생성.
2. 발신자 Electron에서 메시지를 한 번 입력하고 `[보내기]` 클릭.
3. POST status와 화면의 동일 본문 렌더 개수를 센다.

```text
POST 200 /admin/groupware/chat/rooms/CHAT-20260814-000025/messages
renderedCount=2

POST 200 /admin/groupware/chat/rooms/CHAT-20260814-000026/messages
renderedCount=2
```

결과: 기존 `ux_messages_room_sequence` 500은 재현되지 않았다. 그러나 한 번 보낸 메시지가 발신자 화면에 두 번 보인다. [08-group-a-message.png](screenshots/08-group-a-message.png) · [09-group-b-message.png](screenshots/09-group-b-message.png)

### ⑦ 본체 채팅 진입/목록 회귀 — 닫힘

재현:

1. 지정 Chromium 1217에서 본체 실제 로그인 UI로 `dev_manager` 로그인.
2. `http://localhost:5182/#/chat` 직접 이동.
3. 본체 전용 `[data-testid="chat-rooms-page"]` 단정.
4. `CHAT-20260813-000017` 링크를 열고 `[data-testid="chat-room-page"]` 단정.
5. 본체에서 메시지를 전송하고 독립 Electron에서 SSE 재조회로 도착하는지 확인.

```text
URL=http://localhost:5182/#/chat
GET 200 /admin/groupware/chat/rooms
GET 200 /admin/groupware/chat/rooms/CHAT-20260813-000017/messages
GET 200 /admin/groupware/chat/rooms/CHAT-20260813-000017/stream
POST 200 /admin/groupware/chat/rooms/CHAT-20260813-000017/messages
rendered=QA1201 재수렴 본체 20260813231349
```

결과: hash deep-link가 홈으로 떨어지지 않았고 목록·방 열기·전송·독립 앱 수신까지 통과했다. [11-main-chat-list-deeplink.png](screenshots/11-main-chat-list-deeplink.png) · [12-main-chat-message.png](screenshots/12-main-chat-message.png) · [13-independent-sse-receive.png](screenshots/13-independent-sse-receive.png)

## 3. 본체 채팅 회귀 결과

**통과.** 독립 앱 성공과 별개로 본체 경로를 직접 밟았다.

```text
로그인 UI 200
/#/chat deep-link 유지
채팅방 목록 렌더
CHAT-20260813-000017 진입
기존 대화 기록 렌더
본체 메시지 POST 200
독립 Electron SSE-triggered REST 재조회 후 같은 메시지 렌더
```

본체/독립 앱의 관측 화면·URL·모든 링크를 generic `8-4-4-4-12` 정규식으로 sweep했고 모두 UUID 0건이었다.

## 4. 도달 가능한 결함 목록 — 2종

### D1. 그룹 메시지 1회 전송이 발신자 화면에 수신자 수만큼 중복 표시

재현:

1. 독립 앱 `[그룹별]` → `[검색]`.
2. 개발매니저와 개발영업 두 명을 선택해 단톡방 생성.
3. 새 방에 임의 본문을 한 번 입력하고 `[보내기]` 클릭.
4. 전송 직후 같은 본문 카드가 두 개 표시된다.

실측:

```text
CHAT-20260814-000025
입력/POST 1회, HTTP 200, 동일 본문 렌더 2개

CHAT-20260814-000026
입력/POST 1회, HTTP 200, 동일 본문 렌더 2개
```

DB에서도 각 논리 전송이 수신자별 2행으로 저장되고, 발신자 메시지 목록이 두 행을 모두 화면에 노출한다. 캡처: [08](screenshots/08-group-a-message.png), [09](screenshots/09-group-b-message.png).

### D2. 정본의 접속 상태 아이콘이 실제 화면에 보이지 않음

재현:

1. 독립 앱 개별 목록을 연다.
2. 직원 행과 내 정보 행을 본다.
3. 이름·직책·부서는 보이지만 앞의 접속/자리비움/부재중/오프라인 점 또는 아이콘은 보이지 않는다.

API와 DOM `aria-label`에는 상태 4종이 존재한다. 그러나 실제 캡처에는 아이콘 픽셀이 없다. 정본 §2의 “각 직원은 상태 아이콘 + 이름 + 직책”과 어긋난다. 캡처: [01](screenshots/01-independent-directory.png), [04](screenshots/04-presence-four-session-priority.png).

## 5. 그룹 목록 정본 및 미결정 3항목 관측

### 그룹 목록 정본

- 내 정보가 목록 위에 표시됐다.
- 이름 있는 기존 방 `QA1201 안읽음방 20260813205323`은 이름으로 표시됐다.
- 이름 없는 방은 `[DEV-SEED] 개발마스터, [DEV-SEED] 개발매니저, [DEV-SEED] 개발영업` 참여자 나열로 표시됐다.
- manager 화면에서 새 방 두 개 모두 안읽음 `1`이 표시됐다.
- 나중에 메시지를 보낸 `CHAT-20260814-000026`이 `000025`보다 먼저였다.

```text
codeB=CHAT-20260814-000026 index=0
codeA=CHAT-20260814-000025 index=1
```

캡처: [06-group-list-name-and-participants.png](screenshots/06-group-list-name-and-participants.png) · [10-group-unread-latest-order.png](screenshots/10-group-unread-latest-order.png)

### ⏳ 미결정 3항목 — 판정하지 않고 관측만 기록

1. 동일 직급 내 정렬: 사원 순서는 `개발영업 → 잠금사용자 → 개발재고 → 개발창고 → 개발회계`로 보였다. 이름순도 명확한 입사순도 아니며 미결정이라 결함으로 세지 않았다.
2. 개별 목록 안읽음 표시: 개별 직원 목록에는 이름·직책·부서·상태만 있고 마지막 메시지/안읽음 수는 표시되지 않았다. 미결정이라 결함으로 세지 않았다.
3. 자리비움 자동 전환 기준 시간: 화면에는 `자리비움` 상태 라벨만 있고 몇 분 기준인지 표시는 없다. QA 시간 동안 자동 전환 기준을 판정하지 않았다.

## 6. 관측 불가 항목과 실패 원문

필수 사용자 시나리오 중 **비활성 직원 숨김 1건은 관측 불가**다. 캡처 완료 조건을 잘못 잡은 증거 무결성 문제를 본 라운드에서 정정했고, 재실행 전 공유 `user-service`가 다른 트랙 JAR로 교체됐다. 나머지 필수 시나리오는 완주했다. 아래는 최종 완주 전에 폐기하고 재실행한 하네스/환경 실패 원문이다.

### 6.1 첫 인라인 Playwright 파이프 인코딩 실패

```text
SyntaxError: Invalid regular expression: /?????/: Nothing to repeat
```

PowerShell 파이프를 UTF-8로 바꾼 뒤에도 긴 인라인 명령이 Windows 런처에서 거부되어 `*-real-qa.mjs` 임시 스크립트로 옮겼다.

```text
execution error: Io(Os { code: 5, kind: PermissionDenied, message: "액세스가 거부되었습니다." })
```

### 6.2 Electron 쿠키 주입 실패 진단 원문

```text
QA_DIAG_HTTP [
  "POST 401 http://localhost:8080/api/users/messenger/presence/sessions/...",
  "GET 401 http://localhost:8080/admin/groupware/chat/rooms",
  "GET 401 http://localhost:8080/api/users/messenger/directory",
  "GET 401 http://localhost:8080/api/users/messenger/me"
]
locator.waitFor: Timeout 30000ms exceeded.
```

Playwright request context 쿠키가 Electron `file://` renderer 요청에 전달되지 않은 것이었다. S3 자동 로그인 범위 밖이라는 PR 본문에 따라 실제 JWT header를 QA session에 주입한 뒤 네 요청 모두 200으로 재현했다.

### 6.3 두 번째 Electron 동시 실행 실패

```text
electron.launch: Target page, context or browser has been closed
Waiting for the debugger to disconnect...
process did exit: exitCode=0
```

앱의 정상 single-instance lock 때문이었다. master 종료 → manager 검증 → manager 종료 → master 재실행 순으로 바꿔 완주했다.

### 6.4 본체 preview 종료 실패

```text
page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5182/#/login
```

본체 production preview를 direct Node/Vite 프로세스로 다시 띄우고 HTTP 200을 확인한 뒤 같은 본체 시나리오를 완주했다.

### 6.5 종료 확인 중 공유 `user-service` 교체

```text
CLEANUP_LOGIN 200 DIRECTORY 500
TypeError: Cannot read properties of null (reading 'filter')
```

직후 inspect에서 `user-service.Created`가 QA 수행 시각 이후로 바뀌고 브랜치 JAR가 아닌 이전 mtime/size로 교체된 것을 확인했다(§1.4). QA 판정은 교체 전 마지막 완주 결과에 한정한다.

## 7. 공유 DB에 만든·바꾼 것 전부

### 7.1 새 그룹방 7개

모두 `dev_master + dev_manager + dev_sales`, `room_name=null`이다. `CHAT-20260814-000018`, `000019`는 어제 잔재이며 이 라운드 생성물이 아니다.

```text
CHAT-20260814-000020
CHAT-20260814-000021
CHAT-20260814-000022
CHAT-20260814-000023
CHAT-20260814-000024
CHAT-20260814-000025
CHAT-20260814-000026
```

하네스 재시도도 실 DB를 사용했기 때문에 생성된 방을 숨기지 않고 모두 기록한다.

### 7.2 기존 직접방에 추가한 메시지 8개

방: `CHAT-20260813-000017` (`dev_master ↔ dev_manager`)

```text
QA1201 재수렴 독립 20260813231007
QA1201 재수렴 독립 20260813231059
QA1201 재수렴 독립 20260813231130
QA1201 재수렴 독립 20260813231147
QA1201 재수렴 독립 20260813231218
QA1201 재수렴 독립 20260813231303
QA1201 재수렴 독립 20260813231349
QA1201 재수렴 본체 20260813231349
```

직접방 생성 POST는 여러 번 호출했지만 idempotent하게 기존 `000017`을 반환해 새 직접방은 생기지 않았다.

### 7.3 그룹 메시지 논리 전송 7건 / DB 행 14개

각 논리 전송은 manager/sales 수신자별 두 행이다.

```text
000020  QA1201 재수렴 그룹A 20260813231147  2행
000021  QA1201 재수렴 그룹A 20260813231218  2행
000022  QA1201 재수렴 그룹B 20260813231218  2행
000023  QA1201 재수렴 그룹A 20260813231303  2행
000024  QA1201 재수렴 그룹B 20260813231303  2행
000025  QA1201 재수렴 그룹A 20260813231349  2행
000026  QA1201 재수렴 그룹B 20260813231349  2행
```

### 7.4 임시 변경 후 원복

- `auth_db.accounts.dev_sales.enabled`: `true → false → true`, 재시도 포함 4회. 최종 SQL 실측 `dev_sales|t`.
- presence: `dev_manager=ABSENT + mobile-qa1201-* session`, `dev_sales=AWAY`, `dev_developer=ABSENT` 설정/원복. 재시도 포함 6회이며 각 실행 `finally`에서 session 삭제와 `OFFLINE` 원복을 호출했다. 이후 다른 트랙의 `user-service` 재기동으로 인메모리 presence도 초기화됐다.
- 직원 생성/employeeCode/termination_date 변경: 없음.
- 기존 채팅방/메시지 삭제: 없음.

## 8. 프로세스 및 산출물 정리

```text
QA_PROCESSES
NONE

PORT5182
CLOSED

DOCS_QA_SCRIPTS
NONE

SCREENSHOT_COUNT
13
```

임시 `clients/desktop/playwright/1201-reconv-real-qa.mjs`는 실행 후 삭제했다. Electron, Chromium, Vite/Node는 모두 종료했고 `docs/qa`에는 실행 스크립트를 남기지 않았다.

## 9. 스크린샷 목록

1. [01-independent-directory.png](screenshots/01-independent-directory.png)
2. [02-independent-direct-message.png](screenshots/02-independent-direct-message.png)
3. [03-independent-history-preserved.png](screenshots/03-independent-history-preserved.png)
4. [04-presence-four-session-priority.png](screenshots/04-presence-four-session-priority.png)
5. [05-disabled-account-hidden.png](screenshots/05-disabled-account-hidden.png)
6. [06-group-list-name-and-participants.png](screenshots/06-group-list-name-and-participants.png)
7. [07-group-search-multiselect.png](screenshots/07-group-search-multiselect.png)
8. [08-group-a-message.png](screenshots/08-group-a-message.png)
9. [09-group-b-message.png](screenshots/09-group-b-message.png)
10. [10-group-unread-latest-order.png](screenshots/10-group-unread-latest-order.png)
11. [11-main-chat-list-deeplink.png](screenshots/11-main-chat-list-deeplink.png)
12. [12-main-chat-message.png](screenshots/12-main-chat-message.png)
13. [13-independent-sse-receive.png](screenshots/13-independent-sse-receive.png)
