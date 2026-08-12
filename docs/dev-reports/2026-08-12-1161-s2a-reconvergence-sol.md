# #1161 S2a 재수렴 적대검증 보고서

검증 대상: 브랜치 `feat/1161-s2-audit-publishers`, 사용자 제공 HEAD `85675c363`, PR #1177. 사용자 지시에 따라 git 명령은 실행하지 않았다. 판정 질문은 오직 **실 사용자 경로로 재현 가능한 결함이 있는가**이다.

## 측정 1 — fix1 변경 경계와 산출물 기준선

실행 명령:

```powershell
$targets=@('docs/dev-reports/2026-08-12-1161-s2a-reconvergence-sol.md','docs/qa/2026-08-12-1161-s2a-reconv')
foreach($t in $targets){"$t EXISTS=$(Test-Path $t)"}
Get-Content 'shared/audit-publisher/src/main/java/com/samhanair/logis/shared/audit/publisher/AuditPublisherAutoConfiguration.java' -Raw -Encoding UTF8
Get-Content 'docs/dev-reports/2026-08-12-1161-s2a-fix1.md' -Raw -Encoding UTF8
```

실행 원문(핵심):

```text
docs/dev-reports/2026-08-12-1161-s2a-reconvergence-sol.md EXISTS=False
docs/qa/2026-08-12-1161-s2a-reconv EXISTS=False

@Bean
@ConditionalOnBean(ConnectionFactory.class)
@ConditionalOnMissingBean
RabbitTemplate auditRabbitTemplate(ConnectionFactory connectionFactory, MessageConverter messageConverter) {
    RabbitTemplate template = new RabbitTemplate(connectionFactory);
    template.setMessageConverter(messageConverter);
    return template;
}
```

판정: 이번 라운드 시작 시 지정 보고서와 QA PNG 디렉터리는 없었다. fix1 소스에는 직전 치명 결함의 직접 원인이던 독립 `new CachingConnectionFactory()`가 없고, Spring 관리 `ConnectionFactory`와 `Jackson2JsonMessageConverter`를 사용하는 구성이 존재한다. 이 측정만으로 실사용 결함 유무를 판정하지 않고 라이브 경로에서 확인한다.

테스트 집계: passed 0 / skipped 0 / failed 0 (파일·소스 read-only 측정).

## 측정 2 — 공유 스택 회피와 격리 포트 사전 점검

실행 명령:

```powershell
docker ps -a --format '{{.Names}}|{{.Image}}|{{.Ports}}|{{.Status}}'
$ports=15489,15491,16572,16672,18082,18089,18091,19280,15161,15162
foreach($p in $ports){$c=New-Object Net.Sockets.TcpClient; try{$ok=$c.ConnectAsync('127.0.0.1',$p).Wait(250)}catch{$ok=$false}; $c.Dispose(); "PORT $p OPEN=$ok"}
java -version
node --version
npm --version
```

실행 원문(핵심):

```text
samhan-postgres|postgres:16-alpine|0.0.0.0:5432->5432/tcp|Up 9 hours (healthy)
samhan-dc-config-service|infrastructure-dc-config-service|127.0.0.1:8089->8089/tcp|Up 11 hours (healthy)
samhan-partner-auth-service|infrastructure-partner-auth-service|127.0.0.1:8091->8091/tcp|Up 11 hours (healthy)
samhan-elasticsearch|docker.elastic.co/elasticsearch/elasticsearch:8.15.3|0.0.0.0:9200->9200/tcp|Up 42 hours (healthy)
samhan-rabbitmq|rabbitmq:3.13-management-alpine|0.0.0.0:5672->5672/tcp|Up 42 hours (healthy)

PORT 15489 OPEN=False
PORT 15491 OPEN=False
PORT 16572 OPEN=False
PORT 16672 OPEN=False
PORT 18082 OPEN=False
PORT 18089 OPEN=False
PORT 18091 OPEN=False
PORT 19280 OPEN=False
PORT 15161 OPEN=False
PORT 15162 OPEN=False
openjdk version "17.0.18" 2026-01-20
v24.15.0
11.12.1
```

판정: 공유 `samhan-*` 컨테이너는 목록 조회만 했고 접근·재기동·변경하지 않는다. 다른 라운드의 `recon1175-*` 스택도 존재하므로 사용하지 않는다. 이번 라운드는 `s2a-reconv-*` 이름과 위의 비어 있는 격리 포트만 사용한다.

테스트 집계: passed 0 / skipped 0 / failed 0 (환경 read-only 측정).

## 측정 3 — 정적 활성 범위와 ConnectionFactory 부재 경계

실행 명령:

```powershell
rg -n --hidden --glob '!**/build/**' --glob '!**/node_modules/**' "class AuditPublisherAutoConfiguration|ConditionalOnBean|ConditionalOnMissingBean|ConnectionFactory|AuditPublisher" .
rg -n --hidden --glob '!**/build/**' --glob '!**/node_modules/**' --glob '*.yml' --glob '*.yaml' --glob '*.properties' --glob '*.env*' --glob '*.gradle' --glob '*.java' "SAMHAN_AUDIT|samhan\.audit|audit\.publisher|audit-publisher|AuditPublisherAutoConfiguration" .
rg -n --glob '!**/build/**' "RabbitAutoConfiguration|spring\.autoconfigure\.exclude|ConnectionFactory|RabbitTemplate|spring\.profiles\.active|ActiveProfiles|ApplicationContextRunner|AnnotationConfigApplicationContext" services/dc-config-service/src/test services/partner-auth-service/src/test shared/audit-publisher/src/test
Get-ChildItem -Recurse -File services -Filter '*.java' | Select-String -Pattern 'AuditPublisherAutoConfiguration|AuditPublisher' -Encoding UTF8
```

실행 원문(서비스별 집계):

```text
auth-service dep=False auditJavaRefs=0 publisherBlocks=0
user-service dep=False auditJavaRefs=0 publisherBlocks=0
product-service dep=False auditJavaRefs=0 publisherBlocks=0
inventory-service dep=False auditJavaRefs=0 publisherBlocks=0
slip-service dep=False auditJavaRefs=0 publisherBlocks=0
accounting-service dep=False auditJavaRefs=0 publisherBlocks=0
partner-service dep=False auditJavaRefs=0 publisherBlocks=0
partner-order-service dep=False auditJavaRefs=0 publisherBlocks=0
arologis-service dep=False auditJavaRefs=0 publisherBlocks=0
groupware-service dep=False auditJavaRefs=0 publisherBlocks=0
notification-service dep=False auditJavaRefs=0 publisherBlocks=0
dashboard-service dep=False auditJavaRefs=0 publisherBlocks=0
dc-config-service dep=True auditJavaRefs=3 publisherBlocks=1
partner-auth-service dep=True auditJavaRefs=4 publisherBlocks=1
```

판정: `ConnectionFactory`를 외부에서 명시적으로 제거하면 `RabbitTemplate`→`AuditPublisher`→pre-controller filter가 모두 생성되지 않아 서비스는 기동하고 감사만 조용히 사라진다. 그러나 두 pilot 모두 AMQP starter와 `publisher.enabled=true`를 가지며 local profile도 Rabbit auto-configuration을 제외하지 않는다. 저장소가 제공하는 로컬·테스트·운영 profile에서 ConnectionFactory 부재 사용자 경로는 확인되지 않았다. 나머지 12개 서비스는 publisher 의존·생산 참조·활성 블록이 모두 0건이므로 fix1 오활성 결함도 확인되지 않았다.

테스트 집계: passed 0 / skipped 0 / failed 0 (정적 read-only 측정).

## 측정 4 — JSON converter와 logging v1/v2 소비 계약

실행 명령:

```powershell
.\gradlew.bat :shared:audit-publisher:test --tests '*AuditRabbitRoundTripIT' :services:logging-service:test --tests '*AuditLogConsumerTest' --no-daemon --console=plain
```

실행 원문(핵심):

```text
BUILD SUCCESSFUL in 35s
AuditRabbitRoundTripIT: tests=1 skipped=0 failures=0 errors=0
AuditLogConsumerTest: tests=2 skipped=0 failures=0 errors=0
contentType=application/json
header={__TypeId__=com.samhanair.logis.shared.audit.contract.AuditEventV2}
CONSUMER class=com.samhanair.logis.log.messaging.AuditLogEvent schema=v2 action=A_CHANGE service=dc-config-service
OLD_JSON class=com.samhanair.logis.log.messaging.AuditLogEvent action=ACCOUNT_LOGIN schema=null
```

판정: 새 publisher v2 JSON은 listener inferred type인 `AuditLogEvent`로 역직렬화되며, `schemaVersion`이 없는 legacy v1 JSON도 소비된다. fix 전 `SimpleMessageConverter`는 non-Serializable `AuditEventV2`를 `IllegalArgumentException`으로 거부했으므로 fix 전 pilot가 Java-serialized v2를 기존 큐에 남기는 실제 경로는 없다. 소비 계약으로 인한 사용자 로그 누락 결함은 재현되지 않았다.

테스트 집계: passed 3 / skipped 0 / failed 0.

## 측정 5 — 격리 인프라와 현재 소스 JAR 준비

실행 명령:

```powershell
docker network create s2a-reconv-net
docker run -d --name s2a-reconv-dc-db --network s2a-reconv-net -e POSTGRES_DB=dc_config_db -e POSTGRES_USER=reconv -e POSTGRES_PASSWORD=reconv_pw -p 127.0.0.1:15489:5432 postgres:16-alpine
docker run -d --name s2a-reconv-pa-db --network s2a-reconv-net -e POSTGRES_DB=partner_auth_db -e POSTGRES_USER=reconv -e POSTGRES_PASSWORD=reconv_pw -p 127.0.0.1:15491:5432 postgres:16-alpine
docker run -d --name s2a-reconv-rabbit --network s2a-reconv-net -e RABBITMQ_DEFAULT_USER=reconv -e RABBITMQ_DEFAULT_PASS=reconv_pw -p 127.0.0.1:16572:5672 -p 127.0.0.1:16672:15672 rabbitmq:3.13-management-alpine
docker run -d --name s2a-reconv-es --network s2a-reconv-net -e discovery.type=single-node -e xpack.security.enabled=false -e "ES_JAVA_OPTS=-Xms512m -Xmx512m" -p 127.0.0.1:19280:9200 docker.elastic.co/elasticsearch/elasticsearch:8.15.3
.\gradlew.bat :services:dc-config-service:bootJar :services:partner-auth-service:bootJar :services:logging-service:bootJar --no-daemon
```

실행 원문(핵심):

```text
BUILD SUCCESSFUL in 21s
24 actionable tasks: 5 executed, 19 up-to-date
DC=/var/run/postgresql:5432 - accepting connections
PA=/var/run/postgresql:5432 - accepting connections
RABBIT=3.13.7
ES=green
s2a-reconv-es|Up|127.0.0.1:19280->9200/tcp
s2a-reconv-rabbit|Up|127.0.0.1:16572->5672/tcp, 127.0.0.1:16672->15672/tcp
s2a-reconv-pa-db|Up|127.0.0.1:15491->5432/tcp
s2a-reconv-dc-db|Up|127.0.0.1:15489->5432/tcp
```

첫 Elasticsearch 명령은 PowerShell 인자 분리로 `unknown shorthand flag: 'X' in -Xmx512m`를 반환했으며 컨테이너는 생성되지 않았다. 같은 격리 이름·포트에서 환경변수 값을 따옴표로 묶어 재실행한 뒤 green을 확인했다. 구현 코드 변경은 없었다.

테스트 집계: passed 1 (Gradle build) / skipped 0 / failed 1 (첫 ES 기동 명령), 재실행 passed 1.

## 측정 6 — 정상 Rabbit에서 두 pilot 실사용 요청

현재 소스 JAR를 격리 DB/Rabbit/ES에 연결해 `logging-service:18082`, `dc-config-service:18089`, `partner-auth-service:18091`에서 기동했다. DC seed만 격리 DB에 넣은 뒤 실제 HTTP 요청을 보냈다.

실행 원문(핵심):

```text
PORT 18082=UP
PORT 18089=UP
PORT 18091=UP
Created new connection: ... [delegate=amqp://reconv@127.0.0.1:16572/]

DC STATUS=200 MS=270 BODY={..."partnerCode":"RECONV-P-001",..."homeMultiDc":"47%"...}
PA STATUS=200 MS=296 BODY={..."status":"NOT_FOUND_AUTH",...}
BAD STATUS=400 MS=33 BODY={"success":false,"code":"INVALID_INPUT","message":"password: 비밀번호는 숫자 4자리 PIN이어야 합니다",...}
ES_TOTAL=0

rabbitmq_published_total{application="dc-config-service",name="rabbit"} 0.0
rabbitmq_published_total{application="partner-auth-service",name="rabbit"} 0.0
```

Rabbit 관리 API 원문:

```text
samhan.audit.queue: consumers=1, messages=0
samhan.audit.dlq: consumers=0, messages=0
samhan.audit.exchange: type=topic, durable=true
```

### 결함 1 — [치명] Spring 관리 ConnectionFactory가 존재해도 두 pilot의 AuditPublisher가 런타임에서 생성되지 않아 조용히 0건 발행

실 사용자 경로:

1. 운영자가 거래처 DC 설정을 저장하거나 외부 거래처가 로그인을 시도한다.
2. 업무 응답은 각각 HTTP 200이고 DC DB도 변경된다.
3. 격리 Rabbit 연결·exchange·queue·logging consumer가 모두 정상인데 두 pilot의 publish 지표는 0이고 ES도 0건이다.
4. 개발자 로그 메뉴에는 해당 행이 생기지 않는다.

근거상 `ConnectionFactory` 빈 부재가 아니라 조건 평가 순서 문제다. Spring Rabbit health가 동일 프로세스에서 관리 ConnectionFactory로 실제 연결했고, Rabbit topology와 consumer도 정상이다. 그러나 `AuditPublisher` 생성자만 등록하는 `audit.publisher.drop.total` metric 자체가 두 pilot 모두 없고 publish count도 0이다. `@ConditionalOnBean(ConnectionFactory.class)`가 붙은 사용자 구성의 `RabbitTemplate`과, component scan 대상 `AuditPublisher`의 `@ConditionalOnBean(RabbitTemplate.class)` 조합이 런타임 등록 순서에서 모두 탈락한 결과와 일치한다. 이는 fix1이 만든 새 표면이며 슬라이스 전체를 무발행으로 만든다.

테스트 집계: passed 3 HTTP 업무 경로 / skipped 0 / failed 3 감사 행 기대(두 pilot + 신규 400 B_FAILURE 모두 0건).

## 측정 7 — Rabbit 실제 중단 시 fail-soft와 DB commit

실행 명령:

```powershell
docker stop s2a-reconv-rabbit
# 이후 dc-config PATCH, partner-auth 업무 로그인 실패, validation 400을 격리 포트로 호출
```

실행 원문:

```text
RABBIT=Exited (0) 1 second ago
DC STATUS=200 MS=85 DB=0.4800
PA STATUS=200 MS=26 ATTEMPTS=1
BAD STATUS=400 MS=17 BODY={"success":false,"code":"INVALID_INPUT","message":"password: 비밀번호는 숫자 4자리 PIN이어야 합니다",...}
rabbitmq_published_total{application="dc-config-service",name="rabbit"} 0.0
rabbitmq_published_total{application="partner-auth-service",name="rabbit"} 0.0
```

판정: Rabbit을 실제 중단해도 DC 저장은 HTTP 200이며 DB `0.4800`으로 commit됐고, partner-auth 업무 로그인 실패도 HTTP 200이며 login attempt 1건이 commit됐다. fail-soft 업무 경계 자체는 유지된다. 다만 측정 6에서 publisher가 애초 생성되지 않은 치명 결함 때문에, 이 결과는 정상 publisher worker의 장애 격리를 증명하지 않고 **감사 기능 전체가 비활성이라 업무가 영향받지 않는 상태**를 함께 보여준다.

테스트 집계: passed 3 (기대 업무 HTTP/DB 결과) / skipped 0 / failed 0.

## 측정 8 — partner-auth 신규 B_FAILURE의 증거 오염 및 진단정보 소실

코드 경계와 실제 validation 400 요청을 교차 확인했다.

실행 원문(핵심):

```java
String forwarded = request.getHeader("X-Forwarded-For");
return (comma > 0 ? forwarded.substring(0, comma) : forwarded).trim();

AuditEventV2.authentication(... "인증 요청이 거부되었습니다", resolveClientIp(request), null)

.ipAddress(event.ipAddress())
.description(event.description())
```

```text
BAD STATUS=400 ... password: 비밀번호는 숫자 4자리 PIN이어야 합니다
```

### 결함 2 — [높음] 공개 로그인 요청자가 X-Forwarded-For로 중앙 감사 IP와 민감 문자열을 임의 주입 가능

실 사용자 경로: 외부 요청자가 validation 400 또는 업무 로그인 실패 요청에 `X-Forwarded-For: Bearer-reconv-secret-token`이나 UUID 문자열을 넣으면 filter/controller가 첫 값을 무검증 `ipAddress`로 event에 복사하고 logging consumer는 이를 ES에 저장한다. gateway의 inbound identity 제거 목록은 X-Forwarded-For를 제거하지 않는다. 따라서 실제 접속 IP를 위조해 감사 증거를 오염시키고 토큰·UUID 문자열을 중앙 로그에 주입할 수 있다. 정상 body/Authorization/User-Agent 경로에서 비밀번호·토큰·UA·인증 UUID 직접 복사는 확인되지 않았지만 이 우회 경로가 존재한다.

### 결함 3 — [높음] 신규 HTTP 400 B_FAILURE의 실제 상태와 거부 사유가 개발자 로그 저장 전에 소실

`AuditEventV2.authentication`은 실패 message를 `errorSummary`에 넣고 description은 항상 `로그인 결과`, httpStatus는 실제 400이 아니라 200으로 고정한다. 이어 `AuditLogConsumer`는 `errorSummary`, `httpStatus`, requestId, traceId 등 v2 진단 필드 17개를 ES `AuditLog`에 복사하지 않는다. 실제 사용자가 malformed JSON/잘못된 PIN/없는 계정으로 실패하면 행이 발행되더라도 개발자 로그에서는 동일한 `로그인 결과`로 보여 실패 원인과 실제 HTTP 상태를 구분할 수 없다.

민감정보 focused 테스트 집계: passed 3 / skipped 0 / failed 0.

## 측정 9 — Playwright 개발자 로그 라이브QA

브라우저는 격리 Vite `127.0.0.1:15161`을 사용했고, 인증/권한 경계만 QA session으로 주입했다. `/logs/activity` 데이터는 mock fixture가 아니라 격리 `logging-service:18082`의 실제 응답을 `route.fetch`로 연결했다.

첫 실행 원문:

```text
LIVE_UI total=총 0건 empty=시각(KST) ... 조회된 활동 로그가 없습니다.
1 failed
Error: route.fetch: Target page, context or browser has been closed
```

첫 실행은 화면과 PNG까지 생성했으나 종료 시 background refetch가 남아 Playwright가 실패했다. 임시 QA harness 끝에서 `page.unrouteAll({ behavior: 'wait' })`로 진행 중 route를 기다리도록 한 뒤 동일 시나리오를 재실행했다.

재실행 원문:

```text
Running 1 test using 1 worker
LIVE_UI total=총 0건 empty=시각(KST) 메뉴 사용자 작업 대상 내용 서비스

조회된 활동 로그가 없습니다.
1 passed (1.9s)
```

판정: 화면은 실제로 로그 메뉴에 진입했고 사용자에게 `총 0건`, `조회된 활동 로그가 없습니다.`를 표시했다. pilot 두 서비스 동작 후 두 행이 보여야 한다는 라이브QA 최소 기준은 **결함 1로 인해 실패**했다. 브라우저 부재나 정적 게이트로 대체하지 않았으며 Playwright Chromium으로 실제 화면을 밟았다.

스크린샷 전체 경로:

- `docs/qa/2026-08-12-1161-s2a-reconv/01-two-pilots-silent-zero-rows.png`

Playwright 집계: passed 1 / skipped 0 / failed 1 (첫 harness 종료 경합), 재실행 passed 1 / skipped 0 / failed 0.

## 측정 10 — 격리 자원 정리와 파일 존재 확인

실행 원문:

```text
PORT 15161 PID=74052
PORT 18082 PID=74152
PORT 18089 PID=74688
PORT 18091 PID=45044
STOPPED PID=45044
STOPPED PID=74052
STOPPED PID=74152
STOPPED PID=74688
RESOLVED=s2a-reconv-es,s2a-reconv-rabbit,s2a-reconv-pa-db,s2a-reconv-dc-db
s2a-reconv-dc-db
s2a-reconv-pa-db
s2a-reconv-rabbit
s2a-reconv-es
s2a-reconv-net
PORT 15489 OPEN=False
PORT 15491 OPEN=False
PORT 16572 OPEN=False
PORT 16672 OPEN=False
PORT 18082 OPEN=False
PORT 18089 OPEN=False
PORT 18091 OPEN=False
PORT 19280 OPEN=False
PORT 15161 OPEN=False
CONTAINERS_LEFT=
```

정리 판정: 이번 라운드가 생성한 `s2a-reconv-*` 컨테이너 4개·network 1개와 격리 Java/Vite 프로세스만 정확한 이름/PID로 정리했다. 공유 `samhan-*`와 기존 `recon1175-*`에는 정지·삭제·재기동 명령을 보내지 않았다.

## 테스트 집계 요약

| 구분 | passed | skipped | failed |
|---|---:|---:|---:|
| Gradle focused 실행(consumer/roundtrip + 민감정보 경계, 반복 실행 포함) | 6 | 0 | 0 |
| 정상 Rabbit 실사용 HTTP 업무 결과 | 3 | 0 | 0 |
| 정상 Rabbit 감사 행 기대 | 0 | 0 | 3 |
| Rabbit 중단 fail-soft HTTP/DB 결과 | 3 | 0 | 0 |
| Playwright 첫 실행 | 0 | 0 | 1 |
| Playwright 재실행 | 1 | 0 | 0 |

첫 ES 기동 명령 실패 1건은 Docker CLI 인자 quoting 오류였고 수정 재실행 후 ES green이었다. 이는 테스트 케이스 집계와 분리한다.

## 최종 판정

**실 사용자 경로로 재현 가능한 결함이 있다. 총 3건이다.**

1. **[치명] 두 pilot 모두 정상 Rabbit 구성에서도 AuditPublisher가 런타임 생성되지 않아 DC 저장·partner 로그인·신규 400 B_FAILURE가 조용히 0건 발행된다.** 업무 성공, Rabbit/consumer 정상, publish metric 0, ES 0, 실제 개발자 로그 화면 0행으로 관통 재현했다.
2. **[높음] 공개 partner-login의 X-Forwarded-For를 무검증 감사 IP로 신뢰해 공격자가 실제 IP를 위조하고 토큰·UUID 문자열을 중앙 로그에 주입할 수 있다.**
3. **[높음] 신규 400 B_FAILURE의 실제 HTTP 상태와 거부 사유를 v2 event/consumer가 보존하지 않아 개발자 로그에서 실패 원인을 구분할 수 없다.**

반면 Rabbit 실제 중단 시 DC 업무 응답·DB commit과 partner-auth 업무 응답·login-attempt commit은 유지됐다. v1/v2 JSON 역직렬화 자체와 나머지 12개 서비스 비활성도 결함이 재현되지 않았다.

삭제된 추적 파일 확인: git 명령 금지에 따라 index 조회는 하지 않았다. 이번 라운드의 편집 원장을 기준으로 기존 repository 파일 삭제는 0건이며, 실행용으로 새로 만든 임시 Playwright spec/config 2개만 검증 후 제거했다. fix1 구현 파일과 지정 보고서·PNG의 존재를 별도 확인한다.

