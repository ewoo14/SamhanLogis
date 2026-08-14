# PR #1206 재수렴 적대검증 2차 (SOL) · 라이브 QA

- 대상: PR #1206, `feat/1161-s15-retention`, HEAD `2f32bbffc`
- 일시: 2026-08-14 (Asia/Seoul)
- 판정: **도달 가능한 결함 1건 — 머지 비권고**
- 중심 결론: gateway 경유 계약은 닫혔지만, `logging-service` 직접 포트에서 임의 `X-User-Id`만으로 읽기·재처리·폐기가 모두 허용된다.
- 실행 원칙: 코드·git 명령 없음. 로컬 Playwright Chromium 1217 직접 launch. 합성·복제 PNG 없음.

## 1. 환경 실측 원문

### 1.1 RAM, 선언 서비스, 부재 서비스

검증 시작 전 RAM은 중단선 1.0 GiB보다 충분했다.

```text
RAM_FREE_GIB=12.807
RAM_TOTAL_GIB=61.613

COMPOSE_PROFILE=logging|DECLARED=25|PRESENT=23|RUNNING=23|ABSENT=2
ABSENT=samhan-nginx
ABSENT=samhan-prometheus

RAM_FINAL_FREE_GIB=10.905|TOTAL_GIB=61.613
```

### 1.2 Gradle 선행 빌드와 재배포

```text
.\gradlew.bat :services:logging-service:bootJar :services:api-gateway:bootJar
  :services:user-service:bootJar :services:dashboard-service:bootJar --no-daemon

BUILD SUCCESSFUL in 12s
33 actionable tasks: 33 up-to-date

docker compose --env-file infrastructure/.env.local
  -f infrastructure/docker-compose.yml
  -f infrastructure/docker-compose.local-all.yml
  --profile logging up -d --build --no-deps
  logging-service api-gateway user-service dashboard-service
```

`user-service`는 다른 트랙 #1201 라이브 QA 중임을 인지한 상태에서 이 브랜치 JAR로 재배포했다. 09:52 KST 교체 직후 healthy를 확인했고, 최종 시점에도 healthy/restart 0이다.

### 1.3 이미지·컨테이너 내부 JAR 시각

```text
/samhan-logging-service|created=2026-08-14T00:52:17.920103098Z|started=2026-08-14T00:52:27.398918133Z|health=healthy|restart=0
jar=/app/app.jar|mtime=2026-08-14 09:44:36.000000000 +0900|size=100999699

/samhan-api-gateway|created=2026-08-14T00:52:17.895234603Z|started=2026-08-14T00:52:27.3954283Z|health=healthy|restart=0
jar=/app/app.jar|mtime=2026-08-14 09:44:33.000000000 +0900|size=58582788

/samhan-user-service|created=2026-08-14T00:52:23.522329652Z|started=2026-08-14T00:52:33.138207824Z|health=healthy|restart=0
jar=/app/app.jar|mtime=2026-08-14 09:44:37.000000000 +0900|size=93513430

/samhan-dashboard-service|created=2026-08-14T00:52:23.521670168Z|started=2026-08-14T00:52:33.136985413Z|health=healthy|restart=0
jar=/app/app.jar|mtime=2026-08-14 09:44:37.000000000 +0900|size=101572683
```

### 1.4 서비스 health 원문

```text
HEALTH|url=http://127.0.0.1:8083/actuator/health|HTTP=200|body={"status":"UP"}
HEALTH|url=http://127.0.0.1:8094/actuator/health|HTTP=200|body={"status":"UP"}
```

두 응답 본문은 바이트 단위로 동일하다. 따라서 서비스별 URL을 포함하지 않는 viewport 캡처만으로 두 서비스를 구분한다는 직전 주장은 철회한다. health 자체는 위 서로 다른 실 URL의 HTTP 원문으로만 확정한다.

## 2. 접근 제어 조건 1~6 — 실 HTTP 원문

토큰 문자열은 자격이므로 보고서에서만 `<REDACTED>` 처리했다. 호출 시에는 실제 토큰을 사용했다.

### 조건 1 — MASTER inspect/retry/discard

빈 DLQ에서 존재하지 않는 메시지 ID를 사용했다. 상태 코드 계약과 빈 상태의 비파괴 응답을 동시에 확인했다.

```text
GW_MASTER|GET|http://127.0.0.1:8080/api/logs/dlq?limit=20|Authorization=True|HTTP=200
{"success":true,"code":"OK","message":"성공","data":[{"queue":"samhan.audit.dlq","messageCount":0}]}

GW_MASTER|POST|http://127.0.0.1:8080/api/logs/dlq/qa-reconv2-absent-message/retry|Authorization=True|HTTP=200
{"success":true,"code":"OK","message":"성공","data":false}

GW_MASTER|POST|http://127.0.0.1:8080/api/logs/dlq/qa-reconv2-absent-message/discard?reason=reconv2-access-matrix|Authorization=True|HTTP=200
{"success":true,"code":"OK","message":"성공","data":false}
```

실 메시지에 대해서도 retry와 discard가 각각 `data:true`였다. §4에 전체 원문을 남긴다.

### 조건 2 — 권한 없는 일반 계정

`dev_developer`의 실제 DEVELOPER 토큰으로 세 동작 모두 동일했다.

```text
GW_DEVELOPER|GET|/api/logs/dlq?limit=20|Authorization=True|HTTP=403
{"success":false,"code":"FORBIDDEN","message":"권한이 없습니다"}

GW_DEVELOPER|POST|/api/logs/dlq/qa-reconv2-absent-message/retry|Authorization=True|HTTP=403
{"success":false,"code":"FORBIDDEN","message":"권한이 없습니다"}

GW_DEVELOPER|POST|/api/logs/dlq/qa-reconv2-absent-message/discard?reason=reconv2-access-matrix|Authorization=True|HTTP=403
{"success":false,"code":"FORBIDDEN","message":"권한이 없습니다"}
```

증거: [gateway DEVELOPER 403](screenshots/05-gateway-developer-403.png)

### 조건 3 — 인증 헤더 없음

```text
GW_NO_AUTH|GET|/api/logs/dlq?limit=20|Authorization=False|HTTP=401
{"success":false,"code":"UNAUTHORIZED","message":"인증 토큰이 없습니다"}

GW_NO_AUTH|POST|/api/logs/dlq/qa-reconv2-absent-message/retry|Authorization=False|HTTP=401
{"success":false,"code":"UNAUTHORIZED","message":"인증 토큰이 없습니다"}

GW_NO_AUTH|POST|/api/logs/dlq/qa-reconv2-absent-message/discard?reason=reconv2-access-matrix|Authorization=False|HTTP=401
{"success":false,"code":"UNAUTHORIZED","message":"인증 토큰이 없습니다"}
```

증거: [gateway 무토큰 401](screenshots/04-gateway-no-token-401.png)

### 조건 4 — 만료 토큰 · 다른 서비스용 토큰

만료 토큰은 현재 gateway의 실제 HMAC secret으로 서명하되 `exp=현재-3600s`로 만든 QA 토큰이다. 다른 서비스용 토큰은 아로로지스 실제 admin 로그인으로 발급한 `AROLOGIS_MASTER` access token이다.

```text
GW_EXPIRED|GET|/api/logs/dlq?limit=20|Authorization=True|HTTP=401
GW_EXPIRED|POST|/api/logs/dlq/.../retry|Authorization=True|HTTP=401
GW_EXPIRED|POST|/api/logs/dlq/.../discard?...|Authorization=True|HTTP=401
body={"success":false,"code":"INVALID_TOKEN","message":"유효하지 않은 토큰입니다"}

GW_OTHER_SERVICE|GET|/api/logs/dlq?limit=20|Authorization=True|HTTP=403
GW_OTHER_SERVICE|POST|/api/logs/dlq/.../retry|Authorization=True|HTTP=403
GW_OTHER_SERVICE|POST|/api/logs/dlq/.../discard?...|Authorization=True|HTTP=403
body={"success":false,"code":"FORBIDDEN","message":"권한이 없습니다"}
```

다른 서비스용 토큰은 인증 파싱은 되었으나 허용 그룹이 없어 403으로 거절됐다. 세 동작 모두 동일하다.

### 조건 5 — gateway 우회, logging-service 직접 포트

호스트 배포 형상은 `127.0.0.1:8082 -> container:8082`이고 Docker 내부망에서도 컨테이너 포트가 존재한다.

실 MASTER Bearer만 전달하고 gateway identity header를 전달하지 않으면 세 동작 모두 빈 본문 403이다.

```text
DIRECT_MASTER_BEARER|GET|http://127.0.0.1:8082/logs/dlq?limit=20|Authorization=True|identityHeaders=False|HTTP=403|body=
DIRECT_MASTER_BEARER|POST|http://127.0.0.1:8082/logs/dlq/.../retry|Authorization=True|identityHeaders=False|HTTP=403|body=
DIRECT_MASTER_BEARER|POST|http://127.0.0.1:8082/logs/dlq/.../discard?...|Authorization=True|identityHeaders=False|HTTP=403|body=

DIRECT_NO_AUTH|GET|http://127.0.0.1:8082/logs/dlq?limit=20|Authorization=False|identityHeaders=False|HTTP=403|body=
DIRECT_NO_AUTH|POST|http://127.0.0.1:8082/logs/dlq/.../retry|Authorization=False|identityHeaders=False|HTTP=403|body=
DIRECT_NO_AUTH|POST|http://127.0.0.1:8082/logs/dlq/.../discard?...|Authorization=False|identityHeaders=False|HTTP=403|body=
```

그러나 임의 identity header를 직접 넣으면 MASTER 그룹이든 DEVELOPER 그룹이든 모두 200이다.

```text
DIRECT_FORGED_MASTER|GET|/logs/dlq?limit=20|Authorization=False|X-User-Id=임의|X-User-Groups=MASTER|HTTP=200
{"success":true,"code":"OK","data":[{"queue":"samhan.audit.dlq","messageCount":0}]}
DIRECT_FORGED_MASTER|POST|.../retry|HTTP=200|body={"success":true,"code":"OK","data":false}
DIRECT_FORGED_MASTER|POST|.../discard?...|HTTP=200|body={"success":true,"code":"OK","data":false}

DIRECT_FORGED_DEVELOPER|GET|/logs/dlq?limit=20|Authorization=False|X-User-Id=dev_developer|X-User-Groups=DEVELOPER|HTTP=200
{"success":true,"code":"OK","data":[{"queue":"samhan.audit.dlq","messageCount":0}]}
DIRECT_FORGED_DEVELOPER|POST|.../retry|HTTP=200|body={"success":true,"code":"OK","data":false}
DIRECT_FORGED_DEVELOPER|POST|.../discard?...|HTTP=200|body={"success":true,"code":"OK","data":false}
```

실 poison 메시지를 넣고 DEVELOPER header로 직접 폐기한 원문:

```text
DIRECT_DEV_INSPECT_REAL|GET|http://127.0.0.1:8082/logs/dlq?limit=20|Authorization=False|X-User-Id=dev_developer|X-User-Groups=DEVELOPER|HTTP=200
{"success":true,"code":"OK","data":[{"messageId":"12061206-0814-4a15-8b2b-0000000000d2","retryCount":0,"reason":null,"maxRedeliveries":3}]}

DIRECT_DEV_DISCARD_REAL|POST|http://127.0.0.1:8082/logs/dlq/12061206-0814-4a15-8b2b-0000000000d2/discard?reason=forged-developer-direct-bypass|Authorization=False|X-User-Id=dev_developer|X-User-Groups=DEVELOPER|HTTP=200
{"success":true,"code":"OK","data":true}
```

증거: [직접 포트 DEVELOPER header 우회 200](screenshots/06-direct-developer-header-bypass-200.png)

### 조건 6 — 읽기와 되돌릴 수 없는 동작의 판정 기준

- gateway: inspect/retry/discard 모두 MASTER 200, DEVELOPER 403, 무토큰 401, 만료 401, 아로로지스 토큰 403으로 동일하다.
- 직접 포트: inspect/retry/discard 모두 임의 `X-User-Id`가 있으면 200이다.
- 특히 직접 포트 DEVELOPER header로 실제 DLQ 메시지 `discard`가 `data:true`였으므로 상태 코드만 열린 것이 아니라 파괴 동작이 실행됐다.

## 3. 감사 큐 실제 수신과 Elasticsearch 문서

### 3.1 실 업무 mutation

```text
USER_ROLE_TO_MANAGER|PATCH|/api/v1/admin/users/{id}/role|X-Request-Id=qa-1206-reconv2-user-role|HTTP=200
body.data.loginId=dev_developer|body.data.role=MANAGER

RELEASE_PUBLISH|POST|/app/releases/7ca2f413-e720-4856-8132-5d401ad4a131/publish|X-Request-Id=qa-1206-reconv2-release-publish|HTTP=200
body.data.version=2026/08/14-12062|body.data.isPublished=true
```

증거: [user 역할 MANAGER](screenshots/02-user-role-manager-live.png), [릴리스 게시](screenshots/03-dashboard-release-published-live.png)

### 3.2 `audit.#` 임시 캡처 큐 수신

임시 비내구 queue `qa.1206.reconv2.capture`를 `samhan.audit.exchange`의 `audit.#`에 바인딩했다. 아래는 실제 Rabbit payload를 `ack_requeue_true`로 읽은 원문이다.

```text
RABBIT_CAPTURE|routingKey=audit.change.user-service|id=56601f89-1e26-436f-8ec0-3ca04085b8c5|service=user-service|requestId=qa-1206-reconv2-user-role|route=/api/v1/admin/users/{id}/role|action=A_CHANGE|retention=A
RABBIT_CAPTURE|routingKey=audit.change.user-service|id=6ea965dc-988a-41bb-9ddb-d96694d8168e|service=user-service|requestId=qa-1206-reconv2-user-role|route=/api/v1/admin/users/{id}/role|action=A_CHANGE|retention=A

RABBIT_CAPTURE|routingKey=audit.change.dashboard-service|id=2e9f7832-735f-4149-a94b-0c8372159966|service=dashboard-service|requestId=qa-1206-reconv2-release-publish|route=/app/releases/{id}/publish|action=A_CHANGE|retention=A
RABBIT_CAPTURE|routingKey=audit.change.dashboard-service|id=864e5e3d-d323-4805-a4a8-79f47cc8e4ff|service=dashboard-service|requestId=qa-1206-reconv2-release-publish|route=/app/releases/{id}/publish|action=A_CHANGE|retention=A
```

### 3.3 ES 실제 문서 GET

```text
ES_GET|HTTP=200|index=samhan-audit-logs-a|id=56601f89-1e26-436f-8ec0-3ca04085b8c5|found=True|service=user-service|requestId=qa-1206-reconv2-user-role
ES_GET|HTTP=200|index=samhan-audit-logs-a|id=2e9f7832-735f-4149-a94b-0c8372159966|found=True|service=dashboard-service|requestId=qa-1206-reconv2-release-publish
```

증거: [A 등급 user role 문서](screenshots/07-es-grade-a-user-role.png)

## 4. ILM · DLQ 한도 · 빈 DLQ · 기존 큐 배포

### 4.1 A/B/C 인덱스와 ILM 분리

실 A는 역할변경, 실 C는 사용자 목록 조회, QA B는 `audit.failure.qa-reconv2`로 발행했다.

```text
PUBLISH_B|routing=audit.failure.qa-reconv2|messageId=12061206-0814-4a15-8b2b-00000000000b|HTTP=200|body={"routed":true}
ES_B|HTTP=200|index=samhan-audit-logs-b|id=12061206-0814-4a15-8b2b-00000000000b|found=True|requestId=qa-1206-reconv2-grade-b|retention=B

ILM|grade=A|index=samhan-audit-logs-a|lifecycle=samhan-audit-ilm-a|delete.min_age=365d
ILM|grade=B|index=samhan-audit-logs-b|lifecycle=samhan-audit-ilm-b|delete.min_age=365d
ILM|grade=C|index=samhan-audit-logs-c|lifecycle=samhan-audit-ilm-c|delete.min_age=30d
```

증거: [A](screenshots/07-es-grade-a-user-role.png), [B](screenshots/08-es-grade-b-failure.png), [C](screenshots/09-es-grade-c-read.png), [ILM A/B/C](screenshots/10-es-ilm-a-b-c.png)

### 4.2 consumer 3회 시도 후 DLQ, 운영 재처리 상한

invalid `occurredAt` poison `12061206-0814-4a15-8b2b-0000000000d1`을 실 exchange에 발행했다.

```text
PUBLISH_POISON_1|routing=audit.change.qa-reconv2|HTTP=200|body={"routed":true}
samhan.audit.queue messages=0 consumers=1
samhan.audit.dlq   messages=1 consumers=0

DLQ_INSPECT_INITIAL|HTTP=200
{"messageId":"12061206-0814-4a15-8b2b-0000000000d1","retryCount":0,"maxRedeliveries":3}

DLQ_RETRY_1|HTTP=200|data=true
DLQ_INSPECT_AFTER_RETRY_1|HTTP=200|retryCount=1|maxRedeliveries=3
DLQ_RETRY_2|HTTP=200|data=true
DLQ_INSPECT_AFTER_RETRY_2|HTTP=200|retryCount=2|maxRedeliveries=3
DLQ_RETRY_3|HTTP=200|data=true
DLQ_INSPECT_AFTER_RETRY_3|HTTP=200|retryCount=3|maxRedeliveries=3

DLQ_RETRY_OVER_LIMIT|HTTP=200|data=false
DLQ_INSPECT_AFTER_LIMIT|HTTP=200|retryCount=3|maxRedeliveries=3
DLQ_DISCARD_MASTER|HTTP=200|data=true
```

logging-service 로그에는 최초 전달과 각 재처리에서 각각 다음 원문이 남았다.

```text
Retries exhausted for message ... messageId=12061206-0814-4a15-8b2b-0000000000d1
ListenerExecutionFailedException: Retry Policy Exhausted
x-samhan-dlq-retry-count=1
x-samhan-dlq-retry-count=2
x-samhan-dlq-retry-count=3
```

consumer 내부 3회 시도 후 DLQ, 운영 재처리 count 3에서 추가 순환 차단(`data:false`)이 모두 재현됐다.

### 4.3 빈 DLQ 조회 회귀

```text
DLQ_INSPECT_EMPTY_AFTER_MASTER_DISCARD|GET|/api/logs/dlq?limit=20|Authorization=MASTER|HTTP=200
{"success":true,"code":"OK","data":[{"queue":"samhan.audit.dlq","messageCount":0}]}
```

### 4.4 기존 큐가 존재하는 broker 위 배포

RabbitMQ 컨테이너는 재배포하지 않았고 기존 durable queue 위에 네 애플리케이션만 `--no-deps`로 교체했다.

```text
vhost=/ name=samhan-audit-retention
pattern=^samhan\.audit\.(queue|failure\.queue|read\.queue)$
definition={"max-length":10000,"message-ttl":86400000}
priority=10

samhan.audit.queue         messages=0 consumers=1 policy=samhan-audit-retention
samhan.audit.failure.queue messages=0 consumers=1 policy=samhan-audit-retention
samhan.audit.read.queue    messages=0 consumers=1 policy=samhan-audit-retention
PRECONDITION_FAILED_EXACT_COUNT=0
LOGGING|health=healthy|restart=0
```

조사 중 `406` 문자열 4개가 먼저 집계됐으나 Rabbit reply code가 아니라 poison 본문 길이 `byte[406]`이었다. 정확한 `PRECONDITION_FAILED` 재집계는 0이다.

## 5. 직전 중복 캡처 2쌍 정정

### 5.1 차단 로그인 vs 성공 로그인

서로 다른 실 상태로 다시 캡처했다.

- [차단 로그인 — 실제 잘못된 자격 오류](screenshots/00-login-invalid-credential-blocked.png)
- [성공 로그인 — 실제 dashboard](screenshots/01-login-success-dashboard.png)

```text
00 SHA256=f2116a74b0b80dc19b4b130297bad60c2d842de2622112e025223898e6457ec9
01 SHA256=aaf7d7211e6fb6272450b9b3b5dc9102ee45e4bd6d2653e1dfad788c12ae21c4
CORRECTION_LOGIN_PAIR_DISTINCT=True
```

### 5.2 user health vs dashboard health

두 실제 URL은 각각 HTTP 200이지만 본문이 모두 `{"status":"UP"}`로 동일하다. 브라우저 viewport에는 URL이 포함되지 않아 서로 다른 서비스임을 화면 요소로 단정할 수 없다. 따라서 직전 `10-user-health-down.png` / `11-dashboard-health-down.png` 주장은 **별도 캡처로 재제출하지 않고 관측 불가로 내렸다.** 서비스별 health는 §1.4의 서로 다른 실 URL HTTP 원문으로만 남긴다.

## 6. 캡처 SHA-256 — 중복 0

```text
00-login-invalid-credential-blocked.png|f2116a74b0b80dc19b4b130297bad60c2d842de2622112e025223898e6457ec9|31848
01-login-success-dashboard.png|aaf7d7211e6fb6272450b9b3b5dc9102ee45e4bd6d2653e1dfad788c12ae21c4|37753
02-user-role-manager-live.png|bfe8c0dfa83cabcd4fd93011f47cf229f80518c3251ec3fd49618c91a7d5eaa8|63805
03-dashboard-release-published-live.png|eb645f0345820b0dfc7b5830118de8dd94b7a0bfd0ef608edb3ddab849a9afaf|60525
04-gateway-no-token-401.png|670a45e6e67eb8821775cf0e5e9c730845219a1730fcab04ca3aa808d8ce876d|8849
05-gateway-developer-403.png|ced891a032fb22ee5990b5c5b9617451afef4b531fc930a41fe27879e8c6f687|8490
06-direct-developer-header-bypass-200.png|0b2652ae5e3c4315fc50fc343361b121165a7292a06cb0eb002564b828e022a1|10793
07-es-grade-a-user-role.png|ac503f21c295dcce3fab66be09cde6a55c1069a7affe988c7916730a5beddab5|33224
08-es-grade-b-failure.png|6cba2b7a4d4b85e26b37d5a13520b67c88b9e095d312e744ad366020be9cf045|28684
09-es-grade-c-read.png|b3ec7f2a560149a35397f055ef5aba3277ce7daa3c257fa5b0303f0211c98b49|28846
10-es-ilm-a-b-c.png|7b81ec1a5da70511fe7d962cc3539de46e58bea6d0cb85abf2aff6fea82a4048|33543

SCREENSHOT_COUNT=11
DUPLICATE_HASH_GROUPS=0
```

육안 확인도 직접 수행했다. 00은 오류 banner, 01은 dashboard, 02는 `dev_developer/매니저`, 03은 게시된 릴리스, 06은 직접 포트 success JSON, 10은 세 ILM policy가 각각 보인다.

## 7. 도달 가능한 결함 목록

### 결함 1 — logging-service 직접 포트에서 identity header 자작으로 DLQ 읽기·재처리·폐기 가능

재현:

1. gateway를 거치지 않고 `http://127.0.0.1:8082/logs/dlq`로 요청한다.
2. Authorization은 보내지 않는다.
3. `X-User-Id: <임의 비공백>`과 일반 DEVELOPER 그룹을 보낸다.
4. inspect가 200이다.
5. 실제 poison ID의 discard도 200 `data:true`이고 DLQ가 0이 된다.

원문은 §2 조건 5와 screenshot 06에 있다. `HeaderAuthenticationFilter`가 gateway 전용 header를 직접 신뢰하고, logging-service 내부에서 DLQ endpoint의 MASTER/MANAGER 인가를 재검증하지 않기 때문에 모든 직접 ingress가 같은 계약을 보장하지 않는다.

총 **1건**이다.

## 8. 관측 불가와 실행 실패 원문

### 8.1 health 서비스별 화면 식별

```text
user-service      HTTP 200 body={"status":"UP"}
dashboard-service HTTP 200 body={"status":"UP"}
```

본문이 동일하고 viewport에 URL이 없어 서비스별 screenshot identity는 관측 불가로 내렸다.

### 8.2 Rabbit 관리 UI

Rabbit 상태 자체는 CLI/HTTP로 관측했지만 관리 UI의 고유 요소는 로컬 Playwright에서 timeout이었다. 이 화면의 screenshot 주장은 제출하지 않는다.

```text
locator.waitFor: Timeout 20000ms exceeded.
Call log:
  - waiting for getByText('samhan.audit.dlq').first() to be visible
```

### 8.3 Playwright 하네스 정정과 최종 성공

초기 `vite.web.config.ts`는 BrowserRouter이므로 `/#/admin/users`가 dashboard로 낙착했다. 이를 실 경로로 오인하지 않고, 기본 Vite 실모드(`VITE_MOCK_MODE=0`) HashRouter로 다시 띄워 화면 고유 testid를 단정했다.

```text
POST_LOGIN_URL=http://localhost:5175/#/
PLAYWRIGHT_REAL_QA_PASS screenshots=11 browser=chromium-1217
```

## 9. 브로커·ES·DB 원복 증명

### 9.1 업무/DB

```text
CLEAN_ROLE_DEVELOPER|PATCH|.../role|HTTP=200|body.data.loginId=dev_developer|body.data.role=DEVELOPER
CLEAN_RELEASE_UNPUBLISH|POST|.../unpublish|HTTP=200|body.data.isPublished=false
CLEAN_RELEASE_DELETE|DELETE|...|HTTP=200|body.data=null
VERIFY_ROLE|HTTP=200|loginId=dev_developer|role=DEVELOPER
VERIFY_RELEASE_REMOVED|HTTP=200|active_matches=0
```

### 9.2 RabbitMQ

QA capture queue에는 Playwright 반복 실행과 cleanup 감사까지 153 메시지, 150 고유 event ID가 있었다. 모두 ES cleanup 대상으로 수집한 뒤 queue를 삭제했다.

```text
queue deleted: qa.1206.reconv2.capture

samhan.audit.read.queue    messages=0 consumers=1 policy=samhan-audit-retention
samhan.audit.queue         messages=0 consumers=1 policy=samhan-audit-retention
samhan.audit.dlq           messages=0 consumers=0
samhan.audit.failure.queue messages=0 consumers=1 policy=samhan-audit-retention
```

### 9.3 Elasticsearch

임시 capture queue가 받은 150개 고유 ID를 retention class별 A/B/C 실제 index에서 bulk delete했다. poison 2개는 변환 실패로 ES에 애초 저장되지 않아 `not_found`였다.

```text
ES_CLEAN_TARGET_UNIQUE=150|CAPTURE_MESSAGES=153
ES_BULK_CLEAN|errors=False|deleted=148|not_found=2|fail=0
ES_CLEAN_VERIFY|targets=150|remaining=0
```

제품 index/template/ILM policy는 삭제·변경하지 않았다.

### 9.4 로컬 프로세스와 임시 파일

```text
PLAYWRIGHT runner exit=0
browser.close() 완료
STOPPED_VITE_PID=72736
PORT5175_LISTENERS=0
TEMP_SPEC_EXISTS=False
임시 node_modules junction 2개 제거
```

최종 시점의 Chromium 1217 프로세스 7개는 본 QA 최종 실행(10:12 KST) 종료 뒤 10:14:43 KST에 별도 profile `playwright_chromiumdev_profile-CPPNcp`로 생성된 다른 공유 작업 프로세스여서 종료하지 않았다. 본 QA의 runner/browser는 종료됐고 전용 Vite listener와 임시 실행 파일은 남지 않았다.

## 10. 최종 판정

원 결함 ①(user/dashboard 감사 미도달), 라운드 B의 빈 DLQ 500, gateway 경유 MASTER 403은 이번 실경로에서 재현되지 않았다. A/B/C·ILM·DLQ 상한·기존 큐 배포도 통과했다.

그러나 fix 라운드 C의 인증 확대가 `logging-service` 직접 ingress에서 임의 identity header를 인증으로 승격한다. 일반 DEVELOPER header로 실제 DLQ 폐기까지 가능하므로 **접근 제어 계약은 모든 진입 경로에서 동일하지 않다. 도달 결함 1건, 머지 비권고**다.
