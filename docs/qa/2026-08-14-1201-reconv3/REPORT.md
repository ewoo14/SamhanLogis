# PR #1201 마지막 미관측 구간 재수렴 라이브 QA

> 2026-08-14 · 역할 SOL(재수렴 적대검증자) · PR head `18aac3fc22718d66ae248880ac92403a7e204d9d`

## 판정

**이번 라운드의 필수 경로를 모두 실제 사용자 경로로 완주했고, 도달 가능한 결함은 0건이다. 관측 불가도 0건이다.**

- 상태 아이콘: 내 정보·직원 목록·검색 결과·그룹 생성 다이얼로그 네 화면 모두 실제 production Electron에서 확인했다. DOM 존재가 아니라 계산된 10×10 px, 계산색, visibility, 좌표를 측정했다.
- 4상태: 접속=녹색, 자리비움=주황, 부재중=빨강, 오프라인=회색으로 서로 구분된다. 네 상태 모두 원형이지만 계산색 4개가 서로 다르다.
- 이름 왼쪽: 네 화면 전부 `icon.right <= name.left`다.
- 비활성 직원: DB에 실재하는 `[DEV-SEED] 탈퇴사용자`가 directory API·검색 결과·그룹 생성 다이얼로그에서 모두 0건이다.
- 직전 통과 항목: 그룹 메시지, 1:1 `batchId=null`, 본체 `/#/chat` 목록·방·전송·SSE를 다시 통과했다.
- 개발책임자 미결정인 개별 목록 안읽음 표시와 상단 칩 구성은 관측만 했고 결함 수에 넣지 않았다.

## 1. 환경 실측 원문

### 1.1 PR 정체

금지된 git 명령은 실행하지 않았다.

```text
gh pr view 1201
number=1201
state=OPEN
headRefName=feat/894-s1-chat-port
headRefOid=18aac3fc22718d66ae248880ac92403a7e204d9d
```

### 1.2 최초 RAM·컨테이너

```text
RAM_FREE_GIB=12.634
RAM_TOTAL_GIB=61.613
RAM_THRESHOLD_GIB=1.000

COMPOSE_EXPECTED_COUNT=24
PRESENT_COUNT=22
MISSING_COUNT=2
MISSING_NAMES=samhan-nginx,samhan-prometheus
NON_RUNNING_OR_UNHEALTHY_COUNT=0
```

QA 종료 시 다시 센 결과도 expected 24, present 22, missing 2이고 존재하는 22개는 전부 `running/healthy`였다.

### 1.3 user-service 재배포 전

```text
NAME=/samhan-user-service
IMAGE_ID=sha256:2703a84fe2039f17b363f1bb2b9fcb9652e6b6d9377718cbb79c4b6ed063b31d
IMAGE_CREATED=2026-08-13T23:34:30.807127045Z
CONTAINER_CREATED=2026-08-13T23:34:34.123926427Z
STATUS=running
HEALTH=healthy
JAR_MTIME=2026-08-14 08:34:06.000000000 +0900
JAR_SIZE=93513430
```

### 1.4 브랜치 JAR 강제 빌드

안내된 `scripts/redeploy-service.ps1`는 이 워크트리에 존재하지 않았다.

첫 fallback은 Gradle을 `infrastructure`에서 호출해 실패했다.

```text
Project directory '...\w894\infrastructure' is not part of the build defined by settings file '...\w894\settings.gradle'.
BUILD FAILED in 4s
```

루트에서 실행한 첫 bootJar는 전부 `UP-TO-DATE`라 JAR 시각이 갱신되지 않았다. 새 빌드임을 나이로 입증하기 위해 `--rerun-tasks`를 사용했다.

```text
.\gradlew.bat :services:user-service:bootJar --no-daemon --rerun-tasks

> Task :services:user-service:bootJar
BUILD SUCCESSFUL in 21s
12 actionable tasks: 12 executed

HOST_JAR_MTIME=2026-08-14 09:41:14 +0900
HOST_JAR_SIZE=91252809
HOST_JAR_SHA256=025669a28555dba74bed05e9d9449d71756ff176c8bd0837d4c0a55417257afa
```

### 1.5 user-service 단독 재배포와 공유 스택 간섭

실행 명령은 user-service 단독이었다.

```text
docker compose --env-file .env.local \
  -f docker-compose.yml -f docker-compose.local-all.yml \
  up -d --build --no-deps user-service

Container samhan-user-service Recreated
Container samhan-user-service Started
```

09:41 첫 재배포는 아래와 같이 성공했다.

```text
IMAGE_ID=sha256:5b61dd67301a45fd05c10712428745829b91d8b6581c4776001b4bad3b03a9df
CONTAINER_CREATED=2026-08-14T00:41:36.45485738Z
STATUS=running
HEALTH=healthy
JAR_MTIME=2026-08-14 09:41:14.000000000 +0900
JAR_SIZE=91252809
```

그러나 다른 트랙이 09:45에 공유 스택을 재배포해 user-service를 다른 JAR로 덮었다. 이때 실제 관측값은 다음과 같다.

```text
USER_IMAGE_ID=sha256:2b7be2ab95bfe24de7fa08052b2c89ecd412123eb2bee6f3176a22b60b686b18
USER_CONTAINER_CREATED=2026-08-14T00:45:26.275655345Z
USER_JAR_MTIME=2026-08-14 09:44:37.000000000 +0900
USER_JAR_SIZE=93513430
USER_JAR_SHA256=ba5c3342ee29a856ab130f5f75d665e0602a0df87f207ef1a36270b02eb2e751
```

그 시각에 logging/api-gateway/dashboard도 외부 명령으로 재생성된 것이 container created 시각으로 확인됐다. 본 QA는 이 세 서비스를 포함한 금지 대상 서비스를 재배포하지 않았다.

외부 compose 종료를 확인한 뒤 user-service만 다시 올렸다. 실제 검증에 사용한 산출물은 호스트와 컨테이너 해시가 정확히 같다.

```text
HOST_JAR_SHA256=025669a28555dba74bed05e9d9449d71756ff176c8bd0837d4c0a55417257afa
CONTAINER_JAR_SHA256=025669a28555dba74bed05e9d9449d71756ff176c8bd0837d4c0a55417257afa
JAR_HASH_MATCH=True
JAR_MTIME=2026-08-14 09:41:14.000000000 +0900
JAR_SIZE=91252809
IMAGE=sha256:9492ac271212554a14d682e643f78737f6cce393e30eca634b9d438199a1fd71
CONTAINER_CREATED=2026-08-14T00:48:55.843068138Z
STATUS=running
HEALTH=healthy
EUREKA_USER_STATUS=UP
```

위 브랜치 JAR로 09:50에 라이브 QA를 완주한 뒤, 다른 트랙이 09:52에 공유 스택을 다시 회수했다. 타 트랙 사용 중인 공유 서비스를 계속 덮지 않기 위해 세 번째 재배포는 하지 않았다. 세션 종료 시점의 실제 상태는 다음과 같다.

```text
POST_QA_EXTERNAL_RESTORE=true
USER_IMAGE=sha256:cc0bea58956160a4175ca127a19ced71549a19624841db3c23a6db79d3cad133
USER_CONTAINER_CREATED=2026-08-14T00:52:23.522329652Z
USER_STATUS=running
USER_HEALTH=healthy
USER_JAR_MTIME=2026-08-14 09:44:37.000000000 +0900
USER_JAR_SIZE=93513430
USER_JAR_SHA256=ba5c3342ee29a856ab130f5f75d665e0602a0df87f207ef1a36270b02eb2e751
```

따라서 `JAR_HASH_MATCH=True`는 09:50 실제 검증 실행 시점의 증거이고, 세션 종료 시점에는 타 트랙 JAR가 healthy 상태로 복원돼 있다.

### 1.6 금지 대상 서비스 최종 health

```text
samhan-inventory-service  running healthy  created=2026-08-13T23:49:38.099401938Z
samhan-logging-service    running healthy  created=2026-08-14T00:52:17.920103098Z
samhan-api-gateway        running healthy  created=2026-08-14T00:52:17.895234603Z
samhan-auth-service       running healthy  created=2026-08-13T22:56:30.169049611Z
samhan-dashboard-service  running healthy  created=2026-08-14T00:52:23.521670168Z
FINAL_RAM_FREE_GIB=12.668
```

### 1.7 실제 클라이언트

```text
clients/internal-chat-desktop
  npm run build
  electron-vite production build exit 0
  실제 electron.exe + out/main/index.js를 Playwright _electron으로 실행

clients/desktop
  npm run build:web
  vite production build exit 0
  http://127.0.0.1:5182/#/chat
  C:\Users\user\AppData\Local\ms-playwright\chromium-1217\chrome-win64\chrome.exe
```

QA 스펙은 패키지 내부의 `1201-reconv3-live-real-qa.mjs` 이름으로 실행했고, `docs/qa`에는 스크립트를 두지 않았다. 실행 후 임시 스펙과 node/electron/vite/chromium 프로세스를 제거했다.

```text
QA_PROCESS_COUNT_AFTER=0
HARNESS_FILE_EXISTS=False
```

## 2. 상태 아이콘 — 네 화면 실픽셀

실제 API로 네 계정의 상태를 만들었다.

```text
SET_STATUS dev_master    AVAILABLE HTTP 200
SET_STATUS dev_manager   AWAY      HTTP 200
SET_STATUS dev_sales     ABSENT    HTTP 200
SET_STATUS dev_developer OFFLINE   HTTP 200

DIRECTORY_API HTTP 200 count=8
AVAILABLE actual=AVAILABLE
AWAY      actual=AWAY
ABSENT    actual=ABSENT
OFFLINE   actual=OFFLINE
```

검증 후 네 상태는 모두 `OFFLINE`으로 복원했고 네 호출 모두 HTTP 200이었다.

### 2.1 계산 스타일·좌표

| 화면 | 상태 | 계산색 | 크기 | display / visibility | icon.right | name.left | 이름 왼쪽 |
|---|---|---|---:|---|---:|---:|---|
| 내 정보 | 접속 | `rgb(22, 163, 74)` | 10×10 | block / visible | 50 | 60 | 통과 |
| 직원 목록 | 접속 | `rgb(22, 163, 74)` | 10×10 | block / visible | 50 | 60 | 통과 |
| 직원 목록 | 자리비움 | `rgb(245, 158, 11)` | 10×10 | block / visible | 50 | 60 | 통과 |
| 직원 목록 | 부재중 | `rgb(239, 68, 68)` | 10×10 | block / visible | 50 | 60 | 통과 |
| 직원 목록 | 오프라인 | `rgb(148, 163, 184)` | 10×10 | block / visible | 50 | 60 | 통과 |
| 검색 결과 | 접속 | `rgb(22, 163, 74)` | 10×10 | inline-block / visible | 48.667 | 48.667 | 통과 |
| 검색 결과 | 자리비움 | `rgb(245, 158, 11)` | 10×10 | inline-block / visible | 48.667 | 48.667 | 통과 |
| 검색 결과 | 부재중 | `rgb(239, 68, 68)` | 10×10 | inline-block / visible | 48.667 | 48.667 | 통과 |
| 검색 결과 | 오프라인 | `rgb(148, 163, 184)` | 10×10 | inline-block / visible | 48.667 | 48.667 | 통과 |
| 그룹 생성 | 접속 | `rgb(22, 163, 74)` | 10×10 | inline-block / visible | 46 | 46 | 통과 |
| 그룹 생성 | 자리비움 | `rgb(245, 158, 11)` | 10×10 | inline-block / visible | 46 | 46 | 통과 |
| 그룹 생성 | 부재중 | `rgb(239, 68, 68)` | 10×10 | inline-block / visible | 46 | 46 | 통과 |
| 그룹 생성 | 오프라인 | `rgb(148, 163, 184)` | 10×10 | inline-block / visible | 46 | 46 | 통과 |

모든 아이콘은 `border-radius: 50%`, `opacity: 1`이었다. 네 상태는 색이 모두 달라 실제 픽셀로 구분된다.

### 2.2 화면별 실캡처

- 내 정보: [01-my-info-presence-real-qa.png](screenshots/01-my-info-presence-real-qa.png)
- 직원 목록: [02-directory-four-presence-states-real-qa.png](screenshots/02-directory-four-presence-states-real-qa.png)
- 검색 결과: [03-search-four-presence-states-real-qa.png](screenshots/03-search-four-presence-states-real-qa.png)
- 그룹 생성 다이얼로그: [05-group-dialog-four-presence-states-real-qa.png](screenshots/05-group-dialog-four-presence-states-real-qa.png)

## 3. 비활성 직원 숨김

DB에 실제 비활성 표본이 있다.

```text
user_db.employees
  full_name=[DEV-SEED] 탈퇴사용자
  login_id=dev_disabled
  termination_date=2026-03-31
  is_deleted=true

auth_db.accounts
  login_id=dev_disabled
  enabled=false
  is_deleted=true
```

실사용자 경로 결과:

```text
GET /api/users/messenger/directory HTTP 200
directory total=8
inactiveNameCount=0

검색 결과 query=탈퇴사용자 count=0
그룹 생성 다이얼로그 query=탈퇴사용자 count=0
```

- 검색 결과: [04-inactive-hidden-search-real-qa.png](screenshots/04-inactive-hidden-search-real-qa.png)
- 그룹 생성 다이얼로그: [06-inactive-hidden-group-dialog-real-qa.png](screenshots/06-inactive-hidden-group-dialog-real-qa.png)

## 4. 직전 통과 항목 재확인

### 4.1 그룹 메시지

기존 공유 그룹방을 사용했고 새 방을 만들지 않았다. 다른 라운드의 메시지는 집계하지 않고 이번 고유 본문만 exact text로 셌다.

```text
room=CHAT-20260814-000025
body=QA1201 reconv3 group 20260814005004
POST HTTP 200
sender renderedCount=1
recipient renderedCount=1

DB rows=2
recipients=2
batch_null=0
distinct batchId=1
sequence=5,6
```

- 발신자: [07-group-sender-one-message-real-qa.png](screenshots/07-group-sender-one-message-real-qa.png)
- 수신자: [09-group-recipient-one-message-real-qa.png](screenshots/09-group-recipient-one-message-real-qa.png)

### 4.2 1:1 `batchId=null`

```text
room=CHAT-20260813-000017
body=QA1201 reconv3 direct 20260814005004
POST HTTP 200
sender renderedCount=1
recipient renderedCount=1

DB rows=1
recipients=1
batchId=null
sequence=13
```

- 발신자: [08-direct-sender-one-message-real-qa.png](screenshots/08-direct-sender-one-message-real-qa.png)
- 수신자: [10-direct-recipient-one-message-real-qa.png](screenshots/10-direct-recipient-one-message-real-qa.png)

### 4.3 본체 채팅

해시라우터 경로로 직접 진입한 뒤 이 화면에만 있는 `data-testid=chat-rooms-page`를 단정했다.

```text
master URL=http://127.0.0.1:5182/#/chat
manager URL=http://127.0.0.1:5182/#/chat
chat-rooms-page=visible
direct room chat-room-page=visible

body=QA1201 reconv3 main SSE 20260814005004
POST HTTP 200
sender renderedCount=1
manager SSE recipientRendered=1

DB rows=1
recipients=1
batchId=null
sequence=14
```

- 목록 도달: [11-main-chat-list-deeplink-real-qa.png](screenshots/11-main-chat-list-deeplink-real-qa.png)
- 발신: [12-main-chat-send-real-qa.png](screenshots/12-main-chat-send-real-qa.png)
- 상대 SSE 수신: [13-main-chat-sse-receive-real-qa.png](screenshots/13-main-chat-sse-receive-real-qa.png)

### 4.4 미결정 항목 관측

- 개별 목록 안읽음 표시: 화면은 실행했으나 정책 미결정 항목이므로 통과/실패 및 결함 수를 판정하지 않았다.
- 상단 칩 구성: 본체 상단의 현재 사용자/알림 표시는 실제 캡처에 보이는 그대로이며, 정책 미결정 항목이므로 결함 수를 판정하지 않았다.

## 5. 캡처 SHA-256 — 중복 0

```text
SCREENSHOT_COUNT=13
UNIQUE_HASH_COUNT=13
DUPLICATE_HASH_COUNT=0
```

| 파일 | SHA-256 | bytes |
|---|---|---:|
| `01-my-info-presence-real-qa.png` | `E26E535BC385EA62629D2973BB28A420E19BDF8910AD42268B1BBEE7750660AB` | 54992 |
| `02-directory-four-presence-states-real-qa.png` | `69AA7DF87BC7478F3A5C88B612E4243B796737868A70C8FF2D4EAC2BB01F2B74` | 49874 |
| `03-search-four-presence-states-real-qa.png` | `B6AE32B7599CF70A64177888056F6F4A6FE8EF0D19FEF992C305C06BF518B64E` | 44650 |
| `04-inactive-hidden-search-real-qa.png` | `405ACB4AC814347FBFF499BD1B06E773D937C76E40035882A80740FC23FF13B9` | 2304 |
| `05-group-dialog-four-presence-states-real-qa.png` | `B252FFF531B501C5BE1A3B3E3C22C060A2AF4DC5717BFD7145927C9E68DC2E17` | 49580 |
| `06-inactive-hidden-group-dialog-real-qa.png` | `6C7C3D952F32CB5C3F76B9649A089EC4C489E5E5EDF78163BEA61F6640044766` | 11385 |
| `07-group-sender-one-message-real-qa.png` | `A077E1FACEBDE592B5AE26D557B7722E7D70F849E8A217535AB5593FF17D21F9` | 46338 |
| `08-direct-sender-one-message-real-qa.png` | `E0BD5AC865F085C68DC24BFE2720050B32829B124A7DE19752C53D8EF270768F` | 184704 |
| `09-group-recipient-one-message-real-qa.png` | `556C64D6C9EC7F80F9B4A15440018E6D6DCBB253FFB1D53F83EAF6B2B87C7BDE` | 54702 |
| `10-direct-recipient-one-message-real-qa.png` | `DE66EA255523D03D98353B7B0CE3A41B9A4EC2615344FA6E803420C5A21DEBA0` | 209496 |
| `11-main-chat-list-deeplink-real-qa.png` | `A39B0F571B0540DEB04807B50AEFF3BBAB0AA47E893A3EAE5228ECDB36AE5CD9` | 41808 |
| `12-main-chat-send-real-qa.png` | `F72B738A92946CE3C178C321251124BCF9C42C8B400E2FE0957AEA4E7FECB586` | 102944 |
| `13-main-chat-sse-receive-real-qa.png` | `5D76AD4FE70E38CBF6A41905B447EDFC9009913183E0F0975CB7CA94CE69D47D` | 118945 |

13장을 제출 전에 직접 열어 서로 다른 실제 화면임을 확인했다.

## 6. 도달 가능한 결함 목록

**0건.**

상태 아이콘 네 표면, 4상태 픽셀 구분, 이름 왼쪽 위치, 비활성 직원 숨김, 그룹/1:1/본체 채팅 회귀를 모두 완주했다.

## 7. 관측 불가와 실패 원문

### 7.1 최종 관측 불가

```text
필수 항목 관측 불가=0
```

### 7.2 회복한 실행 실패

공유 스택이 다른 JAR로 덮인 동안 첫 상태 호출은 아래와 같이 실패했다.

```text
PUT /api/users/messenger/presence/status HTTP 500
NoResourceFoundException:
No static resource users/messenger/presence/status.
```

컨테이너 JAR 해시가 브랜치 산출물과 다름을 확인해 user-service만 다시 재배포했다. 재배포 직후 gateway discovery 전 호출은 503이었다.

```text
PUT /api/users/messenger/presence/status HTTP 503
{"path":"/api/users/messenger/presence/status","status":503,"error":"Service Unavailable"}
```

`EUREKA_USER_STATUS=UP`을 확인한 최종 실행에서는 같은 호출이 네 계정 모두 200이었다. 위 실패는 최종 사용자 경로에서 재현되지 않아 도달 결함으로 세지 않았다.

QA 완료 후 09:52 타 트랙이 공유 user-service를 다시 회수했기 때문에 세션 종료 시점에는 directory가 다시 500이다. 이 응답의 컨테이너 JAR 해시는 브랜치 검증 JAR가 아니라 위에 기록한 `ba5c33…`이며, 검증 완료 뒤 발생한 환경 교체로 분리했다.

해시 확인용 PowerShell 첫 명령은 예약 변수 `$Host`와 충돌했다.

```text
Cannot overwrite variable Host because it is read-only or constant.
```

변수명을 바꿔 같은 값을 다시 측정했고 `JAR_HASH_MATCH=True`를 얻었다. 배포 자체에는 영향이 없었다.

## 8. 공유 DB에 만든 것

새 방·직원·계정은 만들지 않았다. 기존 공유 방에 아래 메시지만 만들었다.

```text
CHAT-20260814-000025
  QA1201 reconv3 group 20260814005004
  messages rows=2, recipients=2, distinct batchId=1

CHAT-20260813-000017
  QA1201 reconv3 direct 20260814005004
  messages rows=1, batchId=null

CHAT-20260813-000017
  QA1201 reconv3 main SSE 20260814005004
  messages rows=1, batchId=null
```

QA용 presence 수동 상태는 서버 메모리 값이며 종료 전에 네 계정 모두 `OFFLINE`으로 복원했다.
