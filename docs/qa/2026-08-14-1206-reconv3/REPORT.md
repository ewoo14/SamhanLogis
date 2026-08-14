# PR #1206 재수렴 적대검증 3차 (SOL) · 머지 직전 라이브 QA

- 대상: PR #1206, `feat/1161-s15-retention`, HEAD `73668f7a4f5e0f0ed12bb38a1fa9f7a5c9f48340`
- 일시: 2026-08-14 (Asia/Seoul)
- 판정: **도달 가능한 결함 2건 — 머지 비권고**
- 실행 원칙: git 명령·제품 코드 수정 없음. Gradle 선빌드 후 대상 6개 서비스만 재배포. 로컬 Playwright Chromium 1217 직접 launch. 합성·복제 PNG 없음.

## 1. 환경 실측 원문

### 1.1 RAM · 컨테이너 존재/부재

검증 시작 전 중단선 1.0GB를 넘었다. Compose 선언은 logging profile 포함 25개이며, 존재하는 것만 세지 않고 부재 2개를 확인했다.

```text
RAM_FREE_GB=8.09
RAM_TOTAL_GB=61.613

COMPOSE_DECLARED=25|PRESENT=23|ABSENT=2
ABSENT_SERVICE=nginx
ABSENT_SERVICE=prometheus

RAM_FINAL_FREE_GB=6.822
```

### 1.2 Gradle 선빌드 · 대상 6개만 재배포

첫 `bootJar`가 모두 up-to-date여서 이번 라운드의 새 빌드라는 jar 시각 증거가 부족했다. 따라서 같은 6개를 `--rerun-tasks`로 다시 생성한 뒤 이미지화·재배포했다.

```text
.\gradlew :services:logging-service:bootJar :services:api-gateway:bootJar
  :services:user-service:bootJar :services:dashboard-service:bootJar
  :services:dc-config-service:bootJar :services:partner-auth-service:bootJar
  --no-daemon --rerun-tasks

BUILD SUCCESSFUL in 25s
41 actionable tasks: 41 executed
```

```text
/samhan-logging-service     created=2026-08-14T02:38:48Z health=healthy restarts=0 jar=2026-08-14 11:37:50 +0900
/samhan-api-gateway        created=2026-08-14T02:38:48Z health=healthy restarts=0 jar=2026-08-14 11:37:45 +0900
/samhan-user-service       created=2026-08-14T02:38:54Z health=healthy restarts=0 jar=2026-08-14 11:37:51 +0900
/samhan-dashboard-service  created=2026-08-14T02:38:54Z health=healthy restarts=0 jar=2026-08-14 11:37:51 +0900
/samhan-dc-config-service  created=2026-08-14T02:38:54Z health=healthy restarts=0 jar=2026-08-14 11:37:50 +0900
/samhan-partner-auth-service created=2026-08-14T02:38:54Z health=healthy restarts=0 jar=2026-08-14 11:37:47 +0900
```

보호 대상은 컨테이너 ID와 생성 시각이 시작 전후 동일했다.

```text
inventory  id=435f7c3f68182381359298595300226455ad03384bfbe0c150db43c4947f6bd0 created=2026-08-14T02:33:13.84293957Z
accounting id=c4f44d6e50ef233626f6ea03e4ff5c9879a4b516a0bd30b573186e2b55a0f815 created=2026-08-14T02:33:13.842010226Z
```

## 2. 접근 제어 조건 1~6 — 실 HTTP 원문

토큰 원문과 내부 토큰은 자격이므로 보고서에는 쓰지 않았다. 호출에는 실 토큰을 사용했다.

### 조건 1 — gateway 경유 MASTER

```text
GW_MASTER|GET|/api/logs/dlq?limit=20|HTTP=200
{"success":true,"code":"OK","message":"성공","data":[{"queue":"samhan.audit.dlq","messageCount":0}]}

GW_MASTER|POST|/api/logs/dlq/qa-reconv3-absent-message/retry|HTTP=200
{"success":true,"code":"OK","message":"성공","data":false}

GW_MASTER|POST|/api/logs/dlq/qa-reconv3-absent-message/discard?reason=reconv3-access|HTTP=200
{"success":true,"code":"OK","message":"성공","data":false}
```

증거: [gateway MASTER 200](screenshots/07-gateway-master-200.png)

### 조건 2 — gateway 경유 일반 계정

실 `dev_developer` DEVELOPER 토큰으로 세 동작 모두 같았다.

```text
GW_DEVELOPER|inspect|HTTP=403
GW_DEVELOPER|retry|HTTP=403
GW_DEVELOPER|discard|HTTP=403
body={"success":false,"code":"FORBIDDEN","message":"권한이 없습니다"}
```

증거: [gateway DEVELOPER 403](screenshots/06-gateway-developer-403.png)

### 조건 3 — 무인증 · 만료 · 다른 서비스용 토큰

```text
GW_NO_AUTH|inspect/retry/discard|HTTP=401
body={"success":false,"code":"UNAUTHORIZED","message":"인증 토큰이 없습니다"}

GW_EXPIRED|inspect/retry/discard|HTTP=401
body={"success":false,"code":"INVALID_TOKEN","message":"유효하지 않은 토큰입니다"}

GW_OTHER_SERVICE|inspect/retry/discard|HTTP=403
body={"success":false,"code":"FORBIDDEN","message":"권한이 없습니다"}
```

만료 토큰은 현 gateway HMAC secret으로 서명하고 `exp=현재-1h`로 만들었다. 다른 서비스용 토큰은 실 아로로지스 `AROLOGIS_MASTER` 로그인 토큰이다.

증거: [gateway 무인증 401](screenshots/05-gateway-no-auth-401.png)

### 조건 4 — logging-service 직접 포트

배포 형상은 `127.0.0.1:8082 -> container:8082`로 직접 ingress가 실제 존재한다.

```text
DIRECT_NO_HEADERS|inspect/retry/discard|HTTP=401
DIRECT_FORGED_MASTER|X-User-Id + MASTER group|inspect/retry/discard|HTTP=401
body={"success":false,"code":"UNAUTHORIZED","message":"내부 인증 토큰이 유효하지 않습니다"}
```

직전 라운드의 임의 사용자 헤더 200 우회는 닫혔다.

증거: [직접 포트 forged MASTER 401](screenshots/08-direct-forged-master-401.png)

### 조건 5 — 유효 내부 토큰 + 권한 없는 계정

```text
DIRECT_VALID_INTERNAL_DEVELOPER|inspect|HTTP=403
DIRECT_VALID_INTERNAL_DEVELOPER|retry|HTTP=403
DIRECT_VALID_INTERNAL_DEVELOPER|discard|HTTP=403
body={"success":false,"code":"FORBIDDEN","message":"권한이 없습니다"}
```

내부 토큰은 gateway 경유 사실만 증명하고 사용자 권한을 승격시키지 않았다. gateway DEVELOPER와 본 요청은 실제 응답 화면이 바이트 동일하여 중복 PNG를 제출하지 않고 HTTP 원문으로만 확정했다.

### 조건 6 — 다른 logging 경로와 정상 사용 회귀

```text
PATH_BY_SERVICE_MASTER|GET|/api/logs/by-service/user-service?page=0&size=1|HTTP=200
PATH_BY_SERVICE_DEVELOPER|same|HTTP=403
PATH_BY_USER_MASTER|GET|/api/logs/by-user/qa-reconv3?page=0&size=1|HTTP=200
PATH_SEARCH_MASTER|GET|/api/logs/search?...|HTTP=200
PATH_ACTIVITY_DEVELOPER|GET|/logs/activity?page=0&size=1|HTTP=200
PATH_FRONT_DEVELOPER|POST|/logs/front|HTTP=200

DIRECT_BY_SERVICE_FORGED|HTTP=401
DIRECT_ACTIVITY_FORGED|HTTP=401
DIRECT_FRONT_FORGED|HTTP=401
```

실 UI도 `/#/admin/activity-logs`에서 `activity-log-page`와 `activity-log-table`을 단정한 뒤 캡처했다.

증거: [DEVELOPER 활동 로그 정상 경로](screenshots/04-activity-log-normal-path.png)

## 3. Rabbit 설정 계열

### 3.1 정상 배포

```text
dc-config     Attempting to connect to: [rabbitmq:5672]
dc-config     Created new connection ... amqp://samhan@172.19.0.10:5672/
partner-auth  Attempting to connect to: [rabbitmq:5672]
partner-auth  Created new connection ... amqp://samhan@172.19.0.10:5672/
```

최종 두 서비스 모두 healthy/restart 0이다.

### 3.2 🔴 환경변수 누락 시 “즉시 실패”가 아니다

실행 중 컨테이너의 환경에서 `RABBIT_HOST`, `RABBIT_USER`, `RABBIT_PASSWORD`만 제거한 격리 컨테이너를 각각 기동했다. 35초 후에도 프로세스가 종료되지 않았다.

```text
LONG_MISSING_ENV_TEST|dc-config
state=running|exit=0
HTTP=503|body={"status":"DOWN"}
Caused by: java.net.UnknownHostException: ${RABBIT_HOST}

LONG_MISSING_ENV_TEST|partner-auth
state=running|exit=0
HTTP=503|body={"status":"DOWN"}
Caused by: java.net.UnknownHostException: ${RABBIT_HOST}
```

즉 `${RABBIT_HOST}`가 설정 단계에서 미해결 placeholder로 실패하지 않고 호스트 문자열로 들어가며, 프로세스는 열린 채 health만 DOWN이 된다.

## 4. 원래 감사·보존·DLQ 계약

### 4.1 user 역할변경 · dashboard 릴리스 게시 → Rabbit → ES

```text
USER_ROLE_TO_MANAGER|PATCH|/api/v1/admin/users/<ROUTING_ID>/role|HTTP=200
body.data.loginId=dev_developer|body.data.role=MANAGER

RELEASE_CREATE|POST|/app/releases|HTTP=200|version=2026/08/14-12063|published=false
RELEASE_PUBLISH|POST|/app/releases/<ROUTING_ID>/publish|HTTP=200|published=true
```

임시 비내구 큐 `qa.1206.reconv3.capture`를 `samhan.audit.exchange`의 `audit.#`에 바인딩해 실 payload를 수신했다.

```text
RABBIT_CAPTURE|routing=audit.change.user-service|service=user-service
  requestId=qa-1206-reconv3-user-role|route=/api/v1/admin/users/{id}/role|action=A_CHANGE|retention=A
RABBIT_CAPTURE|routing=audit.change.dashboard-service|service=dashboard-service
  requestId=qa-1206-reconv3-release-publish|route=/app/releases/{id}/publish|action=A_CHANGE|retention=A
```

```text
ES_GET|HTTP=200|index=samhan-audit-logs-a|service=user-service|requestId=qa-1206-reconv3-user-role|retention=A
ES_GET|HTTP=200|index=samhan-audit-logs-a|service=dashboard-service|requestId=qa-1206-reconv3-release-publish|retention=A
ES_GET|HTTP=200|index=samhan-audit-logs-b|service=user-service|requestId=qa-1206-reconv3-user-role|retention=B
ES_GET|HTTP=200|index=samhan-audit-logs-c|service=user-service|requestId=qa-1206-reconv3-control|retention=C
```

증거: [역할 MANAGER 실화면](screenshots/02-user-role-manager-live.png), [릴리스 배포됨 실화면](screenshots/03-dashboard-release-published-live.png)

### 4.2 A/B/C 인덱스와 ILM

```text
ILM|grade=A|index=samhan-audit-logs-a|policy=samhan-audit-ilm-a|delete.min_age=365d
ILM|grade=B|index=samhan-audit-logs-b|policy=samhan-audit-ilm-b|delete.min_age=365d
ILM|grade=C|index=samhan-audit-logs-c|policy=samhan-audit-ilm-c|delete.min_age=30d
```

### 4.3 DLQ 재시도 상한 · 빈 DLQ 200

AMQP `message_id=12061206-0814-4a15-8b2b-0000000000d4`인 소유 poison만 사용했다.

```text
DLQ_D4_INITIAL      retryCount=0|maxRedeliveries=3
DLQ_D4_RETRY_1      HTTP=200|data=true  -> retryCount=1
DLQ_D4_RETRY_2      HTTP=200|data=true  -> retryCount=2
DLQ_D4_RETRY_3      HTTP=200|data=true  -> retryCount=3
DLQ_D4_OVER_LIMIT   HTTP=200|data=false -> retryCount=3 유지
DLQ_D4_DISCARD_OWNED|HTTP=200|data=true
DLQ_D4_EMPTY|HTTP=200|data=[{"queue":"samhan.audit.dlq","messageCount":0}]
```

첫 poison은 AMQP `message_id`를 누락해 `messageId:null`로 보였다. payload가 `requestId=qa-1206-reconv3-poison`인 본 QA 메시지이고 DLQ 유일 1건임을 원문 대조한 뒤 그 1건만 소비 제거하고, 위 D4로 재실행했다. 다른 DLQ 메시지는 폐기하지 않았다.

### 4.4 기존 큐가 있는 브로커 위 재배포

RabbitMQ를 재기동·purge하지 않고 기존 durable queue 위에 logging-service를 두 번 교체했다.

```text
samhan.audit.queue         messages=0 consumers=1 policy=samhan-audit-retention
samhan.audit.failure.queue messages=0 consumers=1 policy=samhan-audit-retention
samhan.audit.read.queue    messages=0 consumers=1 policy=samhan-audit-retention
samhan.audit.dlq           messages=0 consumers=0
PRECONDITION_FAILED_LOG_COUNT=0

policy=samhan-audit-retention
pattern=^samhan\.audit\.(queue|failure\.queue|read\.queue)$
definition={"max-length":10000,"message-ttl":86400000}
priority=10
```

### 4.5 🔴 평문 Rabbit 자격 기본값이 현재 소스와 런타임에 남아 있다

현재 트리의 `services/logging-service/src/main/resources/application.yml`에서 Rabbit username/password 환경변수에 평문 기본값이 남아 있다. 값 자체는 보고서에 재기록하지 않는다.

```text
RABBIT_PLAINTEXT_FALLBACK_MATCH_COUNT=8
logging-service application.yml:13 username 환경변수 + 평문 기본값
logging-service application.yml:14 password 환경변수 + 평문 기본값
```

런타임도 확인했다. 정상 컨테이너 환경에서 `RABBIT_USER`, `RABBIT_PASSWORD`만 제거한 격리 logging-service가 소스 기본값으로 브로커에 붙었다.

```text
LOGGING_MISSING_CREDENTIAL_ENV|removed=RABBIT_USER,RABBIT_PASSWORD
state=running|exit=0
HTTP=200|body={"status":"UP"}
Attempting to connect to: [rabbitmq:5672]
Created new connection ... amqp://samhan@172.19.0.10:5672/
```

PR exact head의 로컬 Credential Plaintext Guard는 pass지만 GitGuardian check는 fail이다. 본 결함은 check 상태가 아니라 위 현재 소스와 실 런타임으로 확정했다.

## 5. 직전 중복 캡처 2쌍 정정

### 로그인 차단 vs 로그인 성공

서로 다른 실 상태로 다시 세웠고 해시도 다르다.

- [잘못된 자격 로그인 차단](screenshots/00-login-invalid-credential.png)
- [실 로그인 성공 대시보드](screenshots/01-login-success-dashboard.png)

```text
00 SHA256=817e14f0a899d1878e48c7b43a21bc1c9e767e1c608f8995daf92ecb1dbc8d73
01 SHA256=47805c7f04777e16e531dabac272350f0ee8c33df787be0da07c8ef014d88af9
DISTINCT=true
```

### user health vs dashboard health

두 URL의 본문은 모두 `{"status":"UP"}`라 URL 표시 없는 viewport만으로 서비스 정체성을 구분할 수 없다. 별도 이미지 주장은 다시 만들지 않고 **관측 불가로 낮춘다**. 서로 다른 실 URL의 HTTP 원문으로만 확정한다.

```text
HEALTH|http://127.0.0.1:8083/actuator/health|HTTP=200|body={"status":"UP"}
HEALTH|http://127.0.0.1:8094/actuator/health|HTTP=200|body={"status":"UP"}
```

## 6. 캡처 SHA-256 — 중복 0

```text
00-login-invalid-credential.png|817e14f0a899d1878e48c7b43a21bc1c9e767e1c608f8995daf92ecb1dbc8d73|43069
01-login-success-dashboard.png|47805c7f04777e16e531dabac272350f0ee8c33df787be0da07c8ef014d88af9|48092
02-user-role-manager-live.png|1309a1743cc420c31d1b2e1d747df61762f60dfdc3acb887bfa460d3c517a1ba|242526
03-dashboard-release-published-live.png|a3c73b386da7433691b9833373ab5eea0c58a968bec1db08e5b83e43b296afc7|70693
04-activity-log-normal-path.png|6ae6c42db7b06dcce5131c22b75b81b5b553d14e91b6ee3c1b27705c7cded006|140934
05-gateway-no-auth-401.png|91d1ed9e6937671bbe4f8e41f7b3b377ea15c922415827fa5bc82fe3147f47ec|8369
06-gateway-developer-403.png|d649fa4ae6c78db29ae3fa3927796e7be5838213dfeb1e51e25a93f1fb6df2a6|7998
07-gateway-master-200.png|c08c05fd53b46730b50cac9f19e63efb0d863af11339466794faf92e4f105c4f|10429
08-direct-forged-master-401.png|017cec8eaaecc31d4a23fc2c6903070ece85b6a87bf634964f59a1ee08046bda|8791

SCREENSHOT_COUNT=9
DUPLICATE_HASH_GROUPS=0
ALL_NONZERO=true
```

실제 첫 해시 검사에서는 gateway DEVELOPER 403과 valid-internal DEVELOPER 403이 동일 JSON이라 PNG도 동일했다. 후자는 HTTP 원문으로만 남기고 중복 PNG를 제출 대상에서 제거한 뒤 다시 해시를 계산했다.

## 7. 도달 가능한 결함 목록

### 결함 1 — dc-config · partner-auth의 Rabbit 환경변수 누락이 설정 단계에서 즉시 실패하지 않는다

재현: 정상 컨테이너 환경에서 Rabbit host/user/password만 제거해 같은 이미지를 기동한다. 두 프로세스 모두 `running`, exit 0으로 남고 actuator만 503 DOWN이다. 로그의 원인은 `UnknownHostException: ${RABBIT_HOST}`다.

영향: 잘못된 배포가 설정 단계에서 명확히 종료되지 않고 열린 프로세스+DOWN 상태로 남는다. fix E의 명시 계약과 다르다.

### 결함 2 — logging-service의 평문 Rabbit 자격 기본값이 소스와 런타임에 남아 있다

재현: `RABBIT_USER`, `RABBIT_PASSWORD`를 제거한 같은 이미지가 `rabbitmq:5672`에 실제 연결하고 health 200 UP이 된다.

영향: 환경변수 누락을 숨기고, PR이 주장한 “평문 자격 기본값 제거”와 반대 동작을 한다.

**총 2건.** 접근 제어 우회, 정상 logging 경로 차단, 감사 미도달, ILM 혼합, DLQ 무한 재처리, 빈 DLQ 500, 기존 큐 406은 이번 라운드에서 재현되지 않았다.

## 8. 관측 불가와 실행 실패 원문

1. user/dashboard health의 별도 viewport 식별은 본문 동일·URL 미표시라 관측 불가로 낮췄다.
2. 최초 Vite launch는 현재 패키지의 `node_modules` 부재로 실패했다.

```text
Start-Process: The system cannot find the file specified.
Vite did not become ready
```

의존성이 실제 설치된 worktree의 `clients/desktop/node_modules`를 임시 junction으로 연결한 뒤 패키지 안에서 재실행했다.
3. Playwright 1차는 실제 서버 로그인 오류 문구와 단언이 달라 timeout, 2차는 숨겨진 role option을 잡아 timeout, 3차는 역할 변경 후 새 토큰이 MANAGER라 활동 로그가 정상 redirect되어 timeout됐다. 실제 DOM/URL로 각각 원인을 분리하고, 역할 원복 후 DEVELOPER 새 토큰으로 최종 전체 실행했다.
4. 첫 DLQ poison은 AMQP `message_id` 누락으로 운영 API의 ID가 null이었다. 본 QA payload임을 원문 대조해 단 1건 제거하고 D4로 다시 실행했다.

최종 브라우저 원문:

```text
PLAYWRIGHT_REAL_QA_PASS|screenshots=9
browser=C:\Users\user\AppData\Local\ms-playwright\chromium-1217\chrome-win64\chrome.exe
```

## 9. 브로커 · ES · 스택 원복 증명

### 업무/DB

```text
VERIFY_ROLE|HTTP=200|loginId=dev_developer|role=DEVELOPER
CLEAN_RELEASE_UNPUBLISH|HTTP=200|isPublished=false
CLEAN_RELEASE_DELETE|HTTP=200
VERIFY_RELEASE_REMOVED|HTTP=200|matches=0
```

### RabbitMQ

```text
samhan.audit.read.queue    messages=0 consumers=1
samhan.audit.queue         messages=0 consumers=1
samhan.audit.dlq           messages=0 consumers=0
samhan.audit.failure.queue messages=0 consumers=1
CAPTURE_QUEUE_DELETE|HTTP=204
CAPTURE_QUEUE_VERIFY|HTTP=404
TEMP_CONTAINERS=0
```

임시 캡처 큐에는 공유 스택의 다른 트랙 이벤트가 섞일 수 있는 1,249건이 있었다. 다른 트랙 데이터를 지우지 않기 위해 `qa-1206-reconv3*` request/resource/description으로 명시 태그된 소유 이벤트만 삭제했다.

### Elasticsearch

```text
ES_TAGGED_CLEAN|grade=A|ids=9|pre=7|deleted=7|failures=0|post=0
ES_TAGGED_CLEAN|grade=B|ids=1|pre=1|deleted=1|failures=0|post=0
ES_TAGGED_CLEAN|grade=C|ids=1|pre=1|deleted=1|failures=0|post=0
FRONT_SEARCH_TOTAL=0
```

### 프로세스와 최종 health

```text
logging-service     running|healthy|restarts=0
api-gateway         running|healthy|restarts=0
user-service        running|healthy|restarts=0
dashboard-service   running|healthy|restarts=0
dc-config-service   running|healthy|restarts=0
partner-auth-service running|healthy|restarts=0

PORT5175_LISTENERS=0
CHROMIUM1217_PROCESS_COUNT=0
TEMP_SPEC_EXISTS=false
JUNCTION_EXISTS=false
```

## 10. 최종 판정

fix D의 접근 제어 계약은 모든 검증 진입면에서 수렴했고, `/logs/by-service`·`by-user`·`search`·`activity`·`front` 정상 경로도 막히지 않았다. 감사 큐→ES, A/B/C+ILM, 기존 큐 재배포, DLQ 재처리 상한과 빈 DLQ 200도 유지됐다.

그러나 fix E의 “Rabbit 환경변수 누락 시 설정 단계 즉시 실패”가 실배포에서 성립하지 않고, logging-service에는 평문 Rabbit 자격 fallback이 현재 소스와 런타임에 남아 있다. **도달 결함 2건이므로 머지 비권고다.**
