# PR #1206 재수렴 적대검증 라이브 QA 보고서

- 대상: PR #1206, `feat/1161-s15-retention`, 지정 HEAD `fc0dcabdb`
- 일시: 2026-08-14 (Asia/Seoul)
- 판정: **머지 비권고 — 실 사용자 경로 결함 2건**
- 원칙: 코드 수정·git 명령 없이 실제 브랜치 빌드, 기존 RabbitMQ queue, 실제 서비스/API/UI를 사용했다.

## 1. 환경 실측 원문

PR 본문과 issue comment/review comment 전부를 먼저 읽고 이전 라운드 질문 1~6을 기준으로 실행했다. PR 변경 파일에는 Flyway migration이 없어서 공유 DB를 그대로 사용했다.

### 1.1 빌드와 제한 재배포

```text
.\gradlew.bat :services:logging-service:bootJar :services:user-service:bootJar :services:dashboard-service:bootJar :shared:audit-publisher:jar :shared:audit-contract:jar --no-daemon
BUILD SUCCESSFUL in 12s

docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.local-all.yml --profile logging up -d --build --no-deps logging-service user-service dashboard-service
```

다른 트랙이 실행 중이므로 위 3개 외에는 재배포하지 않았다. 검증 도중 다른 트랙이 `user-service`를 한 번 교체해 이 워크트리 산출물이 아닌 상태가 되었고, 허용 대상인 `user-service`만 같은 명령으로 다시 교체한 뒤 S2b를 재실행했다.

최종 컨테이너/JAR 원문:

```text
/samhan-logging-service|2026-08-13T22:50:32.296502087Z|running|healthy|restart=0
/samhan-user-service|2026-08-13T23:14:47.956633928Z|running|starting|restart=0
/samhan-dashboard-service|2026-08-13T22:50:32.29691548Z|running|unhealthy|restart=0

samhan-logging-service|2026-08-14 07:50:10.000000000 +0900|100999544
samhan-user-service|2026-08-14 06:36:12.000000000 +0900|93513389
samhan-dashboard-service|2026-08-14 06:36:12.000000000 +0900|101572636
```

### 1.2 컨테이너 존재/부재와 RAM

```text
declared_count=25
running_count=23
absent_count=2|names=nginx,prometheus
free_gib=17.103|total_gib=61.613
```

RAM은 전 구간 1.0 GiB 중단선보다 충분했다.

### 1.3 기존 queue가 있는 브로커 배포

배포 전 기존 `samhan.audit.queue`는 durable이고 TTL/max-length queue argument가 없었다. immutable argument는 DLX 두 개뿐이었다. logging-service를 멈춘 상태에서 sentinel 한 건을 기존 queue에 넣어 `messages=1, consumers=0`을 확인하고 재배포했다.

```text
sentinel id=12061206-0814-4a15-8b2b-fc0dcabdb001
requestId=qa-1206-predeploy-existing-queue
before deploy: samhan.audit.queue messages=1 consumers=0
after deploy:  samhan.audit.queue messages=0 consumers=1
ES: samhan-audit-logs-a/_doc/12061206-0814-4a15-8b2b-fc0dcabdb001 found=true version=1
```

재배포 로그에는 `PRECONDITION_FAILED`가 없고 다음 policy 적용 로그가 있었다.

```text
samhan-audit-retention ttl=86400000 max-length=10000
```

최종 브로커 원문:

```text
samhan.audit.read.queue    0  1  [DLX arguments]  samhan-audit-retention
samhan.audit.queue         0  1  [DLX arguments]  samhan-audit-retention
samhan.audit.dlq           0  0  []
samhan.audit.failure.queue 0  1  [DLX arguments]  samhan-audit-retention
```

기존 queue를 삭제·purge·이관하지 않았다. sentinel은 재배포 뒤 정상 소비됐다. 따라서 직전 fix의 **policy 적용 및 기존 메시지 손실 0** 주장은 이번 실측에서도 재현됐으며 증거 정정 사항은 없다.

증거: [기존 queue와 effective policy](screenshots/03-rabbit-existing-queue-policy.png), [policy JSON](screenshots/09-rabbit-policy-json.png)

## 2. 질문 1~6 및 DLQ 실경로 결과

### 질문 1 — Rabbit 실패 시 fail-soft

실제 `dev_master`로 로그인해 `dev_developer` 역할을 `DEVELOPER → MANAGER`로 변경했다. DB/목록 화면은 MANAGER로 바뀌었다. 실제 릴리스 `2026/08/14-1206`도 생성·게시되어 화면에 `배포됨`으로 노출됐다. 즉 두 업무 mutation은 Rabbit 발행 실패와 무관하게 커밋됐다.

- user 역할 변경: 성공, 이후 정리 단계에서 DEVELOPER로 원복
- dashboard 릴리스 생성/게시: 성공, 이후 게시 취소·삭제
- 결과: fail-soft 업무 경로는 동작

증거: [역할 변경 UI](screenshots/01-live-admin-users-manager.png), [릴리스 게시 UI](screenshots/02-live-app-release-published.png)

### 질문 2 — 실제 event 소비와 ES 저장

consumer가 살아 있는 상태에서 실제 Rabbit exchange에 A/B/C event를 발행했다. 모두 각 queue에서 소비되어 ES에 한 건씩 저장됐다.

```text
A id=...00a requestId=qa-1206-grade-A -> samhan-audit-logs-a retentionClass=A
B id=...00b requestId=qa-1206-grade-B -> samhan-audit-logs-b retentionClass=B
C id=...00c requestId=qa-1206-grade-C -> samhan-audit-logs-c retentionClass=C
```

반면 S2b의 실제 user/dashboard mutation은 중앙 queue에 도착하지 않았다. 자세한 재현은 결함 1에 적었다.

증거: [A](screenshots/05-es-grade-a.png), [B](screenshots/06-es-grade-b.png), [C](screenshots/07-es-grade-c.png)

### 질문 3 — DLQ inspect/retry/discard 및 재처리 한도

invalid Instant를 넣은 poison event `12061206-0814-4a15-8b2b-fc0dcabdb004`를 consumer가 살아 있는 `audit.change` 경로로 발행했다. consumer 원문:

```text
Retries exhausted for message ... messageId=12061206-0814-4a15-8b2b-fc0dcabdb004
MessageConversionException
ListenerExecutionFailedException: Retry Policy Exhausted
RejectAndDontRequeueRecoverer
```

queue는 0, DLQ는 1이 되어 consumer의 3회 한도 초과 후 DLQ 전송은 실제 동작했다. [DLQ 1건 증거](screenshots/04-rabbit-dlq-poison.png)

그러나 실제 MASTER JWT를 사용한 의도된 gateway 경로는 세 API가 전부 403이었다.

```text
DLQ_inspect|HTTP=403|body=
DLQ_retry|HTTP=403|body=
DLQ_discard|HTTP=403|body=
```

따라서 운영 API의 inspect/retry/discard와 `retry-count` 0→1→2→3 차단은 실행 경로에 진입하지 못했다. 이는 결함 2이다.

### 질문 4 — A/B/C ES index 및 ILM

실제 저장 문서와 index setting/policy를 대조했다.

```text
A -> samhan-audit-logs-a -> lifecycle samhan-audit-ilm-a -> delete 365d
B -> samhan-audit-logs-b -> lifecycle samhan-audit-ilm-b -> delete 365d
C -> samhan-audit-logs-c -> lifecycle samhan-audit-ilm-c -> delete 30d
```

결과: 정상 분리. [A/B/C ILM 원문](screenshots/08-es-ilm-a-b-c.png)

### 질문 5 — #1200 request/trace/pilot 회귀

직접 발행한 sentinel/A/B/C는 requestId가 ES까지 동일하게 보존됐다. `partner-auth-service`의 실제 invalid partner-login도 실행해 HTTP 200, business status `NOT_FOUND_AUTH`를 받았으나, 이 서비스는 공유 트랙 때문에 이번 브랜치 빌드로 재배포할 수 없는 대상이다. 해당 requestId는 중앙 queue/ES에서 관측되지 않았다. 낡은 배포본 여부를 배제할 수 없어 **#1200 pilot S2a는 관측 불가**이며 결함으로 집계하지 않았다.

### 질문 6 — user/dashboard 기존 동작·응답

```text
Q6_ROLES|HTTP=200|count=10
Q6_VERSION|HTTP=200
```

실 UI에서 사용자 목록과 릴리스 목록도 조회됐다. 다만 브랜치 빌드의 중앙 감사 Rabbit 연결 때문에 두 서비스 actuator가 HTTP 503 `{"status":"DOWN"}`이 되었고 dashboard 컨테이너는 `unhealthy`였다. 이는 결함 1과 같은 원인이므로 별도 중복 집계하지 않는다.

증거: [user health DOWN](screenshots/10-user-health-down.png), [dashboard health DOWN](screenshots/11-dashboard-health-down.png)

## 3. 도달 가능한 결함 목록

### 결함 1 — S2b user/dashboard 중앙 감사가 실제 Rabbit queue에 수신되지 않음

재현:

1. 이 브랜치의 user/dashboard JAR를 `--no-deps`로 재배포한다.
2. dev MASTER로 실제 역할 변경 또는 릴리스 게시를 수행한다.
3. 업무 응답/DB/UI 성공을 확인한다.
4. 서비스 로그와 Rabbit connection/queue를 확인한다.

실측 원문:

```text
ROLE_PATCH|loginId=dev_developer|role=DEVELOPER|status=committed
audit publisher retry id=0eb9dc8d-d14f-4c0f-b27f-31ae52854020 attempt=1 reason=AmqpConnectException
audit publisher retry id=0eb9dc8d-d14f-4c0f-b27f-31ae52854020 attempt=2 reason=AmqpConnectException
audit publisher exhausted retries id=0eb9dc8d-d14f-4c0f-b27f-31ae52854020 attempts=3 reason=AmqpConnectException
USER_HEALTH|503|DOWN
```

dashboard도 같은 `attempts=3 reason=AmqpConnectException`을 반복했고 actuator 503이었다. Rabbit `list_connections`에는 logging-service 연결 1개만 있었고 user/dashboard 연결은 없었다. 결과적으로 “publisher를 붙였다”는 S2b의 user role-change와 dashboard release event는 `audit.#` consumer queue에 들어오지 않는다.

### 결함 2 — DLQ 운영 API inspect/retry/discard가 MASTER 실경로에서도 모두 403

재현:

1. poison event를 3회 처리 실패시켜 `samhan.audit.dlq`에 넣는다.
2. dev MASTER로 로그인해 받은 실제 JWT로 gateway `/api/logs/dlq`를 호출한다.
3. inspect, retry, discard 모두 HTTP 403 빈 body를 반환한다.

영향: 운영자가 DLQ를 열람·재처리·폐기할 수 없고, 운영 API의 무한 순환 차단 경로 자체를 사용할 수 없다.

총 **2건**이다.

## 4. 관측 불가 항목과 실패 원문

1. DLQ API retry-count 순환: 위 403 때문에 API 경로에서 0→1→2→3을 밟을 수 없었다. 결함 2로 집계했다.
2. #1200 partner pilot S2a: 대상 서비스 재배포가 금지되어 현재 컨테이너가 이 PR 산출물인지 보장할 수 없다. 결함으로 집계하지 않았다.
3. 첫 Vite 백그라운드 방식:

```text
execution error: Io(Os { code: 5, kind: PermissionDenied, message: "액세스가 거부되었습니다." })
```

4. 첫 native HashRouter 실행은 Vite root 누락으로 실패했다.

```text
page.goto: net::ERR_HTTP_RESPONSE_CODE_FAILURE at http://127.0.0.1:5175/#/login
```

5. root를 바로잡은 뒤 `127.0.0.1:5175` 로그인은 cookie host가 gateway의 `localhost`와 달라 로그인 직후 `/auth/me` 401로 logout됐다. `localhost:5175/#/...`로 동일 지정 Chromium을 다시 실행해 성공했다.

```text
PLAYWRIGHT_HASH_UI_PASS url=http://localhost:5175/#/admin/app-releases
PLAYWRIGHT_BROKER_ES_PASS screenshots=7
PLAYWRIGHT_HEALTH_DOWN_REPRODUCED HTTP=503 services=2
```

모든 최종 UI 캡처는 `C:\Users\user\AppData\Local\ms-playwright\chromium-1217\chrome-win64\chrome.exe`를 package 내부 Playwright에서 headless로 직접 launch했고, `/#/admin/users`, `/#/admin/app-releases` 도달 후 화면 전용 testid/text를 단정했다.

## 5. 만든·바꾼 것과 정리 결과

### 업무/DB

- `dev_developer`: DEVELOPER → MANAGER → DEVELOPER 원복. 역할 변경 이력 2건은 감사 이력으로 남음.
- 릴리스 `2026/08/14-1206`, id `44e5d9c5-86da-4bea-b07f-fa5200eb466d`: 생성·게시 후 게시 취소·삭제. soft-delete 이력은 남을 수 있음.

### RabbitMQ

- 기존 policy `samhan-audit-retention`을 재적용/확인. queue argument 변경, queue 삭제, purge, 이관은 0건.
- 제품 queue `samhan.audit.failure.queue`, `samhan.audit.read.queue`가 logging-service 기동으로 생성됨.
- sentinel/A/B/C 4건은 정상 소비.
- poison 1건은 DLQ에 생성. API discard가 403이어서 Rabbit management에서 해당 messageId를 확인한 뒤 `ack_requeue_false`로 그 1건만 제거함. purge하지 않음.
- 최종 audit queue/DLQ 메시지 수는 모두 0.

### Elasticsearch

- `samhan-audit-logs-a/b/c`에 QA 문서 4건 생성.
- 캡처 후 문서 ID 4개를 각각 DELETE하여 모두 `result=deleted` 확인.
- 제품 index/template/ILM policy는 삭제하거나 변경하지 않음.

### 로컬 프로세스/파일

- Vite/Chromium은 각 실행의 `finally`에서 종료.
- 최종 `port5175_listeners=0`, `matching_processes=0`.
- `docs/qa`에는 REPORT와 PNG만 두었고 실행 스크립트는 남기지 않았다.

## 6. 최종 판정

기존 queue + policy 전환은 메시지 손실 없이 재현되어 직전 Rabbit 406 결함은 재수렴됐다. 그러나 실제 S2b 발행이 중앙 queue에 도달하지 않고, DLQ 운영 API도 실제 MASTER 경로에서 전부 403이다. 따라서 **도달 가능한 결함 2건, 머지 비권고**다.
