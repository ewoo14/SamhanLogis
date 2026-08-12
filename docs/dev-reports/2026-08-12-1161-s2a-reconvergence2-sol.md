# #1161 S2a 재수렴 적대검증 보고서 (2회차)

검증 대상: 브랜치 `feat/1161-s2-audit-publishers`, 사용자 제공 HEAD `543c1d2a4`, PR #1177. 판정 질문은 오직 **실 사용자 경로로 재현 가능한 결함이 있는가**이다. 구현 코드는 변경하지 않고, git 명령과 공유 `samhan-*` 스택은 사용하지 않는다.

## 측정 1 — 검증 기준선과 최우선 가설

실행 원문:

```powershell
Get-Content docs/handoff/CURRENT-WORK.md -Raw -Encoding UTF8
Get-Content .codex/AGENTS.md -Raw -Encoding UTF8
Get-Content docs/dev-reports/2026-08-12-1161-s2a-fix2.md -Raw -Encoding UTF8
Get-Content docs/dev-reports/2026-08-12-1161-s2a-sol-review.md -Raw -Encoding UTF8
Get-Content docs/dev-reports/2026-08-12-1161-s2a-reconvergence-sol.md -Raw -Encoding UTF8
```

확인 원문:

```java
@Configuration
public class AuditPublisherAutoConfiguration {
    @Bean
    @ConditionalOnMissingBean
    @ConditionalOnBean(ConnectionFactory.class)
    RabbitTemplate auditRabbitTemplate(...)

    @Bean
    @ConditionalOnMissingBean
    AuditPublisher auditPublisher(ObjectProvider<RabbitTemplate> rabbitTemplate, ...)
```

가설: 평범한 `@Configuration`의 `@ConditionalOnBean(ConnectionFactory.class)`가 실제 서비스 빈 등록 순서에서 다시 탈락하면 `AuditPublisher` 자체는 생겨도 `RabbitTemplate` 늦은 조회가 비어 `[AUDIT_DISABLED]`가 나오고 두 pilot 실사용 이벤트가 0건 발행된다. Testcontainers가 아니라 현재 소스 JAR의 실제 서비스 기동으로 판별한다.

집계: passed 0 / skipped 0 / failed 0 (read-only 기준선).

## 측정 2 — 공유 스택 회피와 현재 컨테이너 관찰

실행 원문:

```powershell
docker ps -a --format "{{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}"
```

핵심 원문:

```text
samhan-dc-config-service ... 127.0.0.1:8089->8089/tcp ...
samhan-partner-auth-service ... 127.0.0.1:8091->8091/tcp ...
samhan-elasticsearch ... 0.0.0.0:9200->9200/tcp ...
samhan-rabbitmq ... 0.0.0.0:5672->5672/tcp ...
```

판정: 공유 `samhan-*`는 목록만 읽었고 요청·중지·재기동·DB 접근을 하지 않는다. 기존 `recon1175-*`, `sol1158-*`도 다른 격리 트랙이므로 사용하지 않는다. 본 라운드는 새 `s2a-reconv2-*` 이름과 새 격리 포트만 사용한다.

집계: passed 0 / skipped 0 / failed 0 (환경 관찰).

## 측정 3 — 격리 인프라와 현재 소스 JAR 준비

실행 원문:

```powershell
$ports=25489,25491,26572,26672,28082,28189,28091,29280,25161
# 각 포트 TcpClient 확인
docker network create s2a-reconv2-net
docker run -d --name s2a-reconv2-dc-db --network s2a-reconv2-net ... -p 127.0.0.1:25489:5432 postgres:16-alpine
docker run -d --name s2a-reconv2-pa-db --network s2a-reconv2-net ... -p 127.0.0.1:25491:5432 postgres:16-alpine
docker run -d --name s2a-reconv2-rabbit --network s2a-reconv2-net ... -p 127.0.0.1:26572:5672 -p 127.0.0.1:26672:15672 rabbitmq:3.13-management-alpine
docker run -d --name s2a-reconv2-es --network s2a-reconv2-net ... -p 127.0.0.1:29280:9200 docker.elastic.co/elasticsearch/elasticsearch:8.15.3
.\gradlew.bat :services:dc-config-service:bootJar :services:partner-auth-service:bootJar :services:logging-service:bootJar --no-daemon --console=plain
```

실행 원문(핵심):

```text
PORT 25489 OPEN=False
PORT 25491 OPEN=False
PORT 26572 OPEN=False
PORT 26672 OPEN=False
PORT 28082 OPEN=False
PORT 28189 OPEN=False
PORT 28091 OPEN=False
PORT 29280 OPEN=False
PORT 25161 OPEN=False

BUILD SUCCESSFUL in 29s
24 actionable tasks: 6 executed, 18 up-to-date
DC=/var/run/postgresql:5432 - accepting connections
PA=/var/run/postgresql:5432 - accepting connections
RABBIT=3.13.7
ES=green
```

판정: DB 2개·Rabbit·Elasticsearch와 서비스 포트가 모두 공유 스택과 분리됐다. 현재 워크트리 소스에서 세 JAR를 새로 만들었다.

집계: passed 1 / skipped 0 / failed 0 (Gradle bootJar 묶음).

## 측정 4 — 실제 서비스 기동의 조건 평가와 publisher 존재

현재 소스 JAR를 각각 `logging-service:28082`, `dc-config-service:28189`, `partner-auth-service:28091`에서 실제 기동했다. 세 서비스 모두 격리 DB/Rabbit/ES만 가리킨다.

실행 원문(핵심):

```text
PORTS=True,True,True
Started LoggingServiceApplication in 15.541 seconds
Started PartnerAuthServiceApplication in 20.685 seconds
Started DcConfigServiceApplication in 22.177 seconds

dc-config-service [AUDIT_DISABLED] 검색 결과: 0건
partner-auth-service [AUDIT_DISABLED] 검색 결과: 0건

audit_publisher_drop_total{application="dc-config-service",reason="queue_full"} 0.0
audit_publisher_drop_total{application="partner-auth-service",reason="queue_full"} 0.0
```

Rabbit 관리 API의 기동 직후 연결은 lazy producer 특성상 logging consumer 1개였다. 두 pilot 모두 `audit_publisher_drop_total` metric을 노출하므로 `AuditPublisher` bean은 실제 런타임에 존재한다.

판정: 최우선 가설이던 평범한 `@Configuration`의 조건 평가 순서 탈락은 이번 실제 서비스 기동에서 재현되지 않았다. `[AUDIT_DISABLED]`도 없었다. 단, 발행 성공 여부는 다음 실사용 요청으로 별도 확인한다.

집계: passed 2 (pilot 실제 기동·publisher 존재) / skipped 0 / failed 0.

## 측정 5 — 정상 Rabbit에서 두 pilot 실사용 동작, publish metric, ES

격리 DC DB에 거래처 1건을 준비한 뒤 실제 `PATCH /api/v1/partner-dc-configs/RECONV2-P-001`, 존재하지 않는 인증정보의 `POST /api/v1/auth/partner-login`, 깨진 JSON 로그인 요청을 실행했다.

실행 원문(핵심):

```text
DC_STATUS=200 MS=315 BODY={..."partnerCode":"RECONV2-P-001",..."homeMultiDc":"47%","commercialMultiDc":"48%",...}
PA_STATUS=200 MS=330 BODY={..."status":"NOT_FOUND_AUTH",...}
BAD_STATUS=400 MS=9

rabbitmq_published_total{application="dc-config-service",name="rabbit"} 1.0
rabbitmq_published_total{application="partner-auth-service",name="rabbit"} 1.0
ES_COUNT=2
```

ES 원문(필드 발췌):

```json
{
  "serviceName": "partner-auth-service",
  "action": "B_FAILURE",
  "resourceId": "거래처 인증",
  "description": "로그인 결과",
  "ipAddress": "127.0.0.1",
  "userAgent": "Playwright-Reconv2/1.0",
  "httpStatus": 200,
  "errorSummary": "인증 정보가 없습니다"
}
{
  "serviceName": "dc-config-service",
  "action": "A_CHANGE",
  "resourceId": "RECONV2-P-001",
  "description": "거래처 DC 설정 변경",
  "afterData": {"partnerCode":"RECONV2-P-001"},
  "httpStatus": 200
}
```

판정: 두 pilot의 정상 실사용 경로는 publisher worker가 실제 존재하는 상태에서 Rabbit 연결을 만들고 각각 1건을 발행했으며 logging consumer를 거쳐 ES에 2건 적재됐다. 주입한 `X-Forwarded-For: Bearer-reconv2-secret-token, 203.0.113.99`는 무시됐고 ES에는 peer `127.0.0.1`이 기록됐다. 비밀번호 `1234`, 위조 토큰 문자열, 요청용 UUID는 partner-auth 이벤트에 들어가지 않았다.

그러나 동일 실제 프로세스에 보낸 깨진 JSON 로그인은 HTTP 400이었는데 Rabbit/ES 증분이 없었다. 이 시점에는 제품 결함 후보로 유지하고, 정상 프록시·화면·Rabbit 중단 측정과 교차 확인한다.

집계: passed 2 (DC/partner-auth 중앙행) / skipped 0 / failed 1 (깨진 JSON 실패 감사행 기대 1, 실제 0).

## 측정 6 — 실제 api-gateway 경유의 정상 프록시 IP

현재 소스로 `eureka-server:28761`, `api-gateway:28080`을 격리 기동하고 partner-auth를 `28091`로 등록했다. 이어 격리 Docker client에서 실제 gateway public route `/api/v1/auth/partner-login`을 호출했다. client가 위조 XFF도 함께 보냈으므로 “위조 차단”과 “정상 실제 IP 보존”을 동시에 관찰했다.

실행 원문(핵심):

```text
BUILD SUCCESSFUL in 15s
Registered instance API-GATEWAY/localhost:api-gateway:28080 with status UP
Registered instance PARTNER-AUTH-SERVICE/localhost:partner-auth-service:28091 with status UP

CLIENT_IP=172.28.0.6
ES_BEFORE=2
{"success":true,..."status":"NOT_FOUND_AUTH",...}
GATEWAY_HTTP=200
ES_AFTER=3
```

해당 ES 행 원문:

```json
{
  "serviceName": "partner-auth-service",
  "action": "B_FAILURE",
  "ipAddress": "127.0.0.1",
  "userAgent": "Gateway-Live-Reconv2/1.0",
  "httpStatus": 200,
  "errorSummary": "인증 정보가 없습니다"
}
```

### 결함 1 — [심각도 무관] X-Forwarded-For 위조 차단이 정상 gateway 경로의 실제 사용자 IP까지 소실

실 사용자 경로:

1. 외부 사용자가 정상 `api-gateway`를 통해 거래처 로그인을 시도한다.
2. gateway가 partner-auth로 요청을 전달한다.
3. partner-auth는 위조 가능한 `X-Forwarded-For` 대신 servlet peer만 사용한다.
4. 실제 client peer `172.28.0.6` 대신 gateway peer `127.0.0.1`이 중앙 감사에 저장된다.

공격자가 보낸 `X-Forwarded-For: 198.51.100.200`은 저장되지 않았으므로 위조 차단 자체는 작동한다. 그러나 모든 정상 사용자가 gateway 주소로 뭉개져 실제 접속자를 IP로 구분할 수 없다. 사용자가 명시한 “위조를 막으려다 실제 IP를 전부 잃으면 결함”에 해당한다.

집계: passed 1 (gateway 업무 응답/중앙행) / skipped 0 / failed 1 (실제 client IP 보존).

## 측정 7 — publisher가 실제 존재·발행한 상태의 Rabbit 중단 fail-soft

중단 직전 두 pilot의 실제 발행 metric은 각각 1이었다. 즉 publisher 부재 우회가 아닌, 방금 Rabbit/ES 왕복에 성공한 동일 publisher 프로세스를 유지한 채 격리 Rabbit만 중단했다.

실행 원문:

```text
DC_BEFORE=rabbitmq_published_total{application="dc-config-service",name="rabbit"} 1.0
PA_BEFORE=rabbitmq_published_total{application="partner-auth-service",name="rabbit"} 1.0
RABBIT=Exited (0) Less than a second ago

DC_DOWN_STATUS=200 MS=36 BODY={..."homeMultiDc":"49%",..."remark":"rabbit-down-save"...}
PA_DOWN_STATUS=200 MS=25 BODY={..."status":"NOT_FOUND_AUTH",...}
DB home_discount_rate=0.4900

dc-config-service: audit publisher failed id=internal reason=AmqpConnectException
partner-auth-service: audit publisher failed id=internal reason=AmqpConnectException
```

판정: 실제 publisher worker가 Rabbit 접속 실패를 맞았지만 DC 저장 응답·DB commit, partner-auth 기존 업무 응답은 모두 유지됐다. fail-soft 결함은 재현되지 않았다.

집계: passed 2 (DC HTTP+DB, partner-auth HTTP) / skipped 0 / failed 0.

## 측정 8 — partner-auth controller 이전 실패 감사와 증거 내용

Rabbit을 다시 기동해 logging consumer 재연결을 확인한 뒤, 실제 `partner-login`에 두 종류의 controller 이전 실패를 만들었다.

실행 원문:

```text
# 깨진 JSON
BAD_STATUS=400 MS=9
ES 증분=0

# 유효한 JSON이나 PIN validation 실패
RABBIT=3.13.7
ES_BEFORE=3
VALIDATION_STATUS=400
ES_AFTER=3
```

코드 경계 원문:

```java
public PartnerAuthExceptionHandler() { this(null); }
public PartnerAuthExceptionHandler(AuditPublisher auditPublisher) { this.auditPublisher = auditPublisher; }

@ExceptionHandler(MethodArgumentNotValidException.class)
public ResponseEntity<ApiResponse<Void>> handleValidation(MethodArgumentNotValidException ex) {
    // auditFailure 호출 없음
}

@ExceptionHandler(HttpMessageNotReadableException.class)
public ResponseEntity<ApiResponse<Void>> handleMessageNotReadable(..., HttpServletRequest request) {
    auditFailure(request, 400, ErrorCode.INVALID_INPUT.name(), "요청 본문이 유효하지 않습니다");
}
```

### 결함 2 — [심각도 무관] 실제 partner-auth controller 이전 400 실패가 중앙 감사에 남지 않음

실 사용자 경로:

1. 외부 거래처가 깨진 JSON 또는 4자리 규칙을 어긴 PIN으로 `/api/v1/auth/partner-login`을 호출한다.
2. 사용자는 실제 HTTP 400을 받는다.
3. 정상 Rabbit과 logging consumer가 살아 있고 동일 프로세스 publisher가 직전/직후 발행 가능한 상태인데도 Rabbit/ES 행은 증가하지 않는다.
4. 개발자 로그 메뉴에서 이 실패와 실제 400 사유를 확인할 수 없다.

깨진 JSON handler에는 감사 호출이 있지만 실제 Spring 서비스에서 0건이었고, validation handler에는 호출 자체가 없다. 두 입력은 모두 실제 공개 로그인 경로에서 재현됐다.

반면 controller에 도달한 `NOT_FOUND_AUTH` 로그인 실패 이벤트의 실제 ES 내용은 `httpStatus=200`, `errorSummary=인증 정보가 없습니다`, `ipAddress=127.0.0.1`, `userAgent=Playwright-Reconv2/1.0`이었다. 요청 비밀번호 `1234`, 위조 토큰 문자열, 요청 헤더 UUID는 event/ES에 없었다. 사유 필드의 민감정보 혼입 결함은 이 경로에서 재현되지 않았다.

집계: passed 1 (controller 도달 로그인 실패의 상태·사유 및 민감정보 비혼입) / skipped 0 / failed 2 (깨진 JSON, PIN validation 중앙행).

## 측정 9 — Playwright 개발자 로그 라이브QA

공유 스택을 쓰지 않고 격리 Vite `127.0.0.1:25161`과 격리 logging-service `127.0.0.1:28082`를 연결했다. 인증·권한 응답만 QA 하니스가 주입하고 `/logs/activity`는 격리 서비스의 실 응답을 사용했다.

브라우저 플러그인 우선 연결 원문:

```text
No browser is available
agent.browsers.list() => []
```

사용자가 브라우저 부재를 이유로 생략하지 말고 Playwright로 밟으라고 명시했으므로, 저장소의 `@playwright/test` Chromium 1.59.1로 동일 화면을 실행했다. 첫 실행은 권한 응답 shape를 배열로 잘못 준 QA 하니스 오류로 홈 redirect되어 실패했고, 실제 API 계약인 `Map<pageCode, actions>`로 보정했다. 두 번째 실행은 화면 진입 후 비즈니스 식별자 표시 기대를 잘못 둔 하니스 assertion이 실패했다. 제품 코드는 변경하지 않고 화면의 실제 계약(내용/서비스 행)으로 보정한 최종 실행 원문은 다음과 같다.

```text
DEBUG_URL=http://127.0.0.1:25161/admin/activity-logs
LIVE_UI total=총 3건
LIVE_UI table=시각(KST) ... 거래처 인증 ... 로그인 결과 ... 거래처 인증 | ... DC 설정 ... 거래처 DC 설정 변경 ... DC 설정 | ... 거래처 인증 ... 로그인 결과 ... 거래처 인증
LIVE_UI url=http://127.0.0.1:25161/admin/activity-logs
Exit code: 0
```

판정: 두 pilot의 실제 ES 행이 개발자 로그 화면에 보인다. 화면 본문에는 UUID 정규식, 비밀번호 `1234`, 위조 토큰/XFF 문자열이 없었다. controller 이전 400 두 건은 측정 8의 결함으로 애초 ES에 없어 화면에도 없다.

Playwright 집계: passed 1 / skipped 0 / failed 2 (두 실패 모두 QA 하니스 assertion/fixture 보정 전 실행, 제품 판정과 분리).

스크린샷 전체 경로:

- `docs/qa/2026-08-12-1161-s2a-reconv2/01-pilot-rows-live.png`

## 측정 10 — 나머지 12개 서비스 비활성

실행 원문 형식:

```powershell
# 각 서비스 build.gradle의 shared:audit-publisher 의존,
# src/main Java의 AuditPublisher 참조,
# resources의 samhan.audit/audit.publisher/AUDIT_PUBLISHER 정확 문자열 집계
```

실행 원문:

```text
auth-service dep=False auditJavaRefs=0 exactConfigMatches=0
user-service dep=False auditJavaRefs=0 exactConfigMatches=0
product-service dep=False auditJavaRefs=0 exactConfigMatches=0
inventory-service dep=False auditJavaRefs=0 exactConfigMatches=0
slip-service dep=False auditJavaRefs=0 exactConfigMatches=0
accounting-service dep=False auditJavaRefs=0 exactConfigMatches=0
partner-service dep=False auditJavaRefs=0 exactConfigMatches=0
partner-order-service dep=False auditJavaRefs=0 exactConfigMatches=0
arologis-service dep=False auditJavaRefs=0 exactConfigMatches=0
groupware-service dep=False auditJavaRefs=0 exactConfigMatches=0
notification-service dep=False auditJavaRefs=0 exactConfigMatches=0
dashboard-service dep=False auditJavaRefs=0 exactConfigMatches=0
```

판정: 나머지 12개 서비스에서 publisher 의존·생산 코드·활성 설정이 모두 0이다. 오활성 결함은 재현되지 않았다.

집계: passed 12 / skipped 0 / failed 0.

## 측정 11 — 종료 전 신선 검증과 격리 자원 정리

종료 직전 신선 검증 원문:

```text
REPORT_EXISTS=True BYTES=16187
PNG_EXISTS=True BYTES=54432
PNG_SIGNATURE=89-50-4E-47-0D-0A-1A-0A
AUDIT_DISABLED_COUNT=0
ES_COUNT=3
ACTIVITY_TOTAL=3 SERVICES=dc-config-service,partner-auth-service
audit_publisher_drop_total{application="dc-config-service",reason="queue_full"} 0.0
rabbitmq_published_total{application="dc-config-service",name="rabbit"} 1.0
audit_publisher_drop_total{application="partner-auth-service",reason="queue_full"} 0.0
rabbitmq_published_total{application="partner-auth-service",name="rabbit"} 1.0
```

정리 실행 원문:

```text
STOPPED PID=10040 PORT=28189
STOPPED PID=96560 PORT=28091
STOPPED PID=50296 PORT=25161
STOPPED PID=74560 PORT=28082
STOPPED PID=94844 PORT=28080
STOPPED PID=50916 PORT=28761
s2a-reconv2-client
s2a-reconv2-es
s2a-reconv2-rabbit
s2a-reconv2-pa-db
s2a-reconv2-dc-db
s2a-reconv2-net
REMOVED_TEMP=...\.codex\tmp-s2a-reconv2
```

정리 후 원문:

```text
PORT 25161 OPEN=False
PORT 25489 OPEN=False
PORT 25491 OPEN=False
PORT 26572 OPEN=False
PORT 26672 OPEN=False
PORT 28080 OPEN=False
PORT 28082 OPEN=False
PORT 28091 OPEN=False
PORT 28189 OPEN=False
PORT 28761 OPEN=False
PORT 29280 OPEN=False
CONTAINERS_LEFT=
NETWORK_LEFT=
TEMP_EXISTS=False
REPORT_EXISTS=True
PNG_EXISTS=True
```

공유 `samhan-*`와 다른 라운드 컨테이너에는 정지·삭제·재기동 명령을 보내지 않았다.

삭제된 추적 파일 확인: git 명령 금지 때문에 index 조회는 하지 않았다. 이번 라운드 편집 원장상 기존 repository 파일 삭제는 0건이고, 삭제한 것은 이번 라운드가 `.codex/`(gitignore 대상)에 새로 만든 임시 로그/Playwright 하니스뿐이다. fix2 핵심 구현 파일 5개와 fix2 보고서가 모두 존재함을 종료 후 재확인했다.

## 실행 집계 요약

| 구분 | passed | skipped | failed |
|---|---:|---:|---:|
| 현재 소스 bootJar 묶음 | 1 | 0 | 0 |
| 두 pilot 실제 기동·publisher 존재 | 2 | 0 | 0 |
| 정상 Rabbit 두 pilot 중앙행 + 최초 400 probe | 2 | 0 | 1 |
| 실제 gateway 업무행·IP 보존 | 1 | 0 | 1 |
| publisher 존재 상태 Rabbit 중단 fail-soft | 2 | 0 | 0 |
| 로그인 실패 상태·사유·민감정보 + controller 이전 400 | 1 | 0 | 2 |
| Playwright 실행 | 1 | 0 | 2 |
| 나머지 서비스 비활성 | 12 | 0 | 0 |

Playwright failed 2건은 각각 잘못된 권한 fixture shape와 화면 비즈니스 식별자 기대를 둔 QA 하니스 실패이며, 제품 실행 실패와 분리했다. 최초 400 probe와 controller 이전 400 묶음의 깨진 JSON 1건은 같은 결함을 반복 확인한 것이므로 결함 수에는 중복 합산하지 않는다.

## 최종 판정

**실 사용자 경로로 재현 가능한 결함이 있다. 총 2건이다.**

1. 정상 `api-gateway` 경유 시 X-Forwarded-For 위조는 차단되지만 실제 client IP도 소실되어 중앙 감사에 gateway peer 주소만 남는다.
2. 깨진 JSON과 PIN validation의 실제 partner-auth 로그인 HTTP 400이 정상 Rabbit에서도 중앙 감사/ES/개발자 로그에 남지 않는다.

반면 최우선 우려였던 `@ConditionalOnBean(ConnectionFactory.class)` 조건 순서 탈락은 실제 두 서비스 기동에서 재현되지 않았다. `[AUDIT_DISABLED]` 0건, 두 pilot publish metric 각 1, ES/화면 실제 행 3건으로 확인했다. 이미 발행한 publisher 상태에서 Rabbit 중단 시에도 DC 저장·DB commit과 partner-auth 업무 응답은 유지됐다. 실제 로그인 실패 event에는 비밀번호·토큰·요청 UUID가 섞이지 않았고, 나머지 12개 서비스도 비활성이다.

