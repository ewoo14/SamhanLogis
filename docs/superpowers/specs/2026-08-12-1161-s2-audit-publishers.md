# #1161 S2 — 감사 발행자 배선 spec

- 작성일: 2026-08-12
- 기준: 현재 작업 디렉토리의 `origin/main` 기반 작업트리(사용자 제공 전제). 이 라운드에서는 `git` 명령을 사용하지 않았다.
- 범위: 14개 업무 서비스의 중앙 감사 이벤트 발행 계약과 PR 분할 설계
- 비범위: 구현 코드, DB migration, Docker 쓰기, 배포·머지

## 1. 목적과 확정 결정

개발책임자의 목적은 단순 보존이 아니라 logging-service에 모인 기록으로 장애와 오동작의 원인을 추적하고, 장차 에이전트가 원인을 판별·수정할 수 있을 정도의 **진단 가능성**을 확보하는 것이다.

2026-08-12 확정 결정에 따라 다음 두 저장 계층을 함께 유지한다.

1. 서비스별 감사 테이블: 도메인 상세 이력, 복원, revision, 업무 규칙의 진실 원천
2. logging-service 중앙 감사 인덱스: 서비스 횡단 검색, 시간순 상관분석, 운영 진단의 진실 원천

중앙 이벤트 발행은 기존 서비스별 감사 저장을 대체하지 않는다. 기존 감사 테이블을 삭제·통합하거나, 이미 존재하는 감사 테이블을 같은 목적으로 다시 만드는 것은 S2 범위 밖이자 금지 사항이다.

## 2. 현황 실측 — 코드 축

### 2.1 발행 대상 서비스의 범위

`settings.gradle`에 등록된 17개 service project 중 인프라 진입점인 `api-gateway`, `eureka-server`와 중앙 소비자인 `logging-service`를 제외한 다음 14개를 S2 발행 대상 업무 서비스로 정의한다.

`accounting-service`, `arologis-service`, `auth-service`, `dashboard-service`, `dc-config-service`, `groupware-service`, `inventory-service`, `notification-service`, `partner-auth-service`, `partner-order-service`, `partner-service`, `product-service`, `slip-service`, `user-service`

실측 명령과 출력 원문:

```text
> Get-Content -LiteralPath 'settings.gradle' -Encoding UTF8 | Select-String "^include 'services:"
include 'services:eureka-server'
include 'services:api-gateway'
include 'services:auth-service'
include 'services:user-service'
include 'services:product-service'
include 'services:inventory-service'
include 'services:slip-service'
include 'services:accounting-service'
include 'services:logging-service'
include 'services:partner-auth-service'
include 'services:dc-config-service'
include 'services:partner-order-service'
include 'services:partner-service'
include 'services:groupware-service'
include 'services:notification-service'
include 'services:dashboard-service'
include 'services:arologis-service'
```

### 2.2 `samhan.audit` 발행자 재확인

실측 결과, 배경의 “logging-service 밖 발행자 0개” 전제는 현재 코드에서도 참이다.

- `samhan.audit` 계약 문자열은 logging-service의 build 문서·README·Rabbit 구성·consumer/event에만 존재한다.
- 14개 발행 대상 서비스의 main Java 코드에는 `RabbitTemplate`, `AmqpTemplate`, `CorrelationData`, `convertAndSend` 사용이 0건이다.
- shared main Java 코드의 유일한 `convertAndSend`는 `shared:realtime-abstraction`의 Redis SSE broker이며 RabbitMQ 감사 발행과 무관하다.

실측 명령과 출력 원문:

```text
> rg -n --glob '!**/build/**' 'samhan\.audit' services shared infrastructure
services\logging-service\build.gradle:4: * Consumes audit events from RabbitMQ exchange `samhan.audit.exchange`
services\logging-service\build.gradle:5: * (queue `samhan.audit.queue`, routing pattern `audit.#`) and persists
services\logging-service\README.md:12:| Exchange | `samhan.audit.exchange`  | topic, durable                     |
services\logging-service\README.md:13:| Queue    | `samhan.audit.queue`     | bound with pattern `audit.#`       |
services\logging-service\README.md:14:| DLX      | `samhan.audit.dlx`       | topic                              |
services\logging-service\README.md:15:| DLQ      | `samhan.audit.dlq`       | catches failed messages            |
services\logging-service\src\main\java\com\samhanair\logis\log\messaging\RabbitConfig.java:18: *   - Exchange: {@code samhan.audit.exchange} (topic, durable)
services\logging-service\src\main\java\com\samhanair\logis\log\messaging\RabbitConfig.java:19: *   - Queue:    {@code samhan.audit.queue} bound with pattern {@code audit.#}
services\logging-service\src\main\java\com\samhanair\logis\log\messaging\RabbitConfig.java:20: *   - DLX:      {@code samhan.audit.dlx}
services\logging-service\src\main\java\com\samhanair\logis\log\messaging\RabbitConfig.java:21: *   - DLQ:      {@code samhan.audit.dlq}
services\logging-service\src\main\java\com\samhanair\logis\log\messaging\RabbitConfig.java:29:    public static final String EXCHANGE = "samhan.audit.exchange";
services\logging-service\src\main\java\com\samhanair\logis\log\messaging\RabbitConfig.java:30:    public static final String QUEUE = "samhan.audit.queue";
services\logging-service\src\main\java\com\samhanair\logis\log\messaging\RabbitConfig.java:31:    public static final String DLX = "samhan.audit.dlx";
services\logging-service\src\main\java\com\samhanair\logis\log\messaging\RabbitConfig.java:32:    public static final String DLQ = "samhan.audit.dlq";
services\logging-service\src\main\java\com\samhanair\logis\log\messaging\AuditLogEvent.java:10: * exchange {@code samhan.audit.exchange} with routing key {@code audit.<...>}.
services\logging-service\src\main\java\com\samhanair\logis\log\messaging\AuditLogConsumer.java:19: * ({@code samhan.audit.dlq} via DLX {@code samhan.audit.dlx}). This avoids
services\logging-service\src\main\java\com\samhanair\logis\log\messaging\AuditLogConsumer.java:30:    @RabbitListener(queues = "samhan.audit.queue")

> rg -n --glob 'services/*/src/main/java/**/*.java' 'RabbitTemplate|AmqpTemplate|convertAndSend|CorrelationData' services
[출력 없음]

> rg -n --glob 'shared/*/src/main/java/**/*.java' 'RabbitTemplate|AmqpTemplate|convertAndSend|CorrelationData' shared
shared\realtime-abstraction\src\main\java\com\samhanair\logis\shared\realtime\broker\RedisRealtimeBroker.java:95:            redisTemplate.convertAndSend(TOPIC_PREFIX + entityId, json);
shared\realtime-abstraction\src\main\java\com\samhanair\logis\shared\realtime\broker\RedisRealtimeBroker.java:101:            log.warn("[PR-H4a] Redis convertAndSend 실패 — entityId={} event={} cause={}",
```

따라서 전제 오류로 중단할 사유는 발견되지 않았다.

### 2.3 현재 RabbitMQ/consumer 원문 계약

현재 `RabbitConfig`의 계약은 다음과 같다.

```java
// command:
// Get-Content -LiteralPath 'services\logging-service\src\main\java\com\samhanair\logis\log\messaging\RabbitConfig.java' -Encoding UTF8 -Raw

public static final String EXCHANGE = "samhan.audit.exchange";
public static final String QUEUE = "samhan.audit.queue";
public static final String DLX = "samhan.audit.dlx";
public static final String DLQ = "samhan.audit.dlq";
public static final String ROUTING_PATTERN = "audit.#";
public static final String DLQ_ROUTING_KEY = "audit.dlq";
```

```java
TopicExchange auditExchange() {
    return new TopicExchange(EXCHANGE, true, false);
}

TopicExchange dlx() {
    return new TopicExchange(DLX, true, false);
}

Queue auditQueue() {
    return QueueBuilder.durable(QUEUE)
            .withArguments(Map.of(
                    "x-dead-letter-exchange", DLX,
                    "x-dead-letter-routing-key", DLQ_ROUTING_KEY
            ))
            .build();
}

Queue auditDeadLetterQueue() {
    return QueueBuilder.durable(DLQ).build();
}

Binding auditBinding(Queue auditQueue, TopicExchange auditExchange) {
    return BindingBuilder.bind(auditQueue).to(auditExchange).with(ROUTING_PATTERN);
}

Binding dlqBinding(Queue auditDeadLetterQueue, TopicExchange dlx) {
    return BindingBuilder.bind(auditDeadLetterQueue).to(dlx).with(DLQ_ROUTING_KEY);
}
```

추가로 `AuditLogConsumer`는 `@RabbitListener(queues = "samhan.audit.queue")`로 소비하고, 실패를 다시 던져 DLX/DLQ로 보내며, `AuditLogEvent.id`가 비어 있으면 consumer가 임의 UUID를 생성한다. wire DTO의 현재 필드는 다음 13개다.

```java
String id,
String serviceName,
String userId,
String userRole,
String action,
String resourceType,
String resourceId,
String description,
Map<String, Object> beforeData,
Map<String, Object> afterData,
String ipAddress,
String userAgent,
Instant occurredAt
```

이 계약은 소비 측 원문 실측이며 곧바로 최종 발행 계약으로 승인한다는 뜻은 아니다. 특히 producer 재시도 시 중복 방지를 위한 안정적 `id`, 서비스 횡단 추적용 correlation 정보, 사용자 화면에서 UUID를 숨길 표시 식별자 계약은 아래 설계에서 보강해야 한다.

### 2.4 서비스별 감사·이력 저장소 현황

현재 소스의 JPA `@Table`을 14개 서비스별로 다시 센 결과다. `없음`은 “아무 기록 기능도 없음”이 아니라, 아래 검색식으로 찾는 감사·이력·로그·movement·attempt 전용 JPA entity가 없다는 뜻이다.

실측 명령과 출력 원문:

```text
> $targets = @('accounting-service','arologis-service','auth-service','dashboard-service','dc-config-service','groupware-service','inventory-service','notification-service','partner-auth-service','partner-order-service','partner-service','product-service','slip-service','user-service'); foreach ($svc in $targets) { $rows = @(); Get-ChildItem -LiteralPath "services\$svc\src\main\java" -Recurse -File -Filter '*.java' -ErrorAction SilentlyContinue | ForEach-Object { $body = Get-Content -LiteralPath $_.FullName -Encoding UTF8 -Raw; $matches = [regex]::Matches($body, '@Table\(name = "([^"]+)"\)[\s\S]{0,500}?public class ([A-Za-z0-9_]+)'); foreach ($m in $matches) { $table = $m.Groups[1].Value; if ($table -match '(^|_)(audit|audits|history|log|logs|movement|movements|attempt|attempts|record|records)($|_)') { $rows += "$table=$($m.Groups[2].Value)" } } }; if ($rows.Count -eq 0) { "$svc | 없음" } else { "$svc | $([string]::Join(', ', ($rows | Sort-Object -Unique)))" } }
accounting-service | accounting_audit_logs=AccountingAuditLog
arologis-service | arologis_audit_logs=ArologisAuditLog, arologis_role_change_history=ArologisRoleChangeHistory, dispatch_save_history=DispatchSaveHistory
auth-service | 없음
dashboard-service | 없음
dc-config-service | dc_config_audit_logs=DcConfigAuditLog, price_calculation_logs=PriceCalculationLog
groupware-service | groupware_audit_logs=GroupwareAuditLog
inventory-service | dps_save_history=DpsSaveHistory, inventory_audit_lines=InventoryAuditLine, inventory_audit_logs=InventoryAuditLog, inventory_audit_number_sequences=InventoryAuditNumberSequence, inventory_audits=InventoryAudit, stock_movements=StockMovement
notification-service | dispatch_sms_save_history=DispatchSmsSaveHistory, notification_audit_logs=NotificationAuditLog, notification_logs=NotificationLog
partner-auth-service | partner_login_attempt=PartnerLoginAttempt
partner-order-service | partner_order_audit_logs=PartnerOrderAuditLog, partner_order_front_event_log=FrontEventLog, partner_order_history=PartnerOrderHistory
partner-service | partner_audit_logs=PartnerAuditLog, partner_credit_history=PartnerCreditHistory
product-service | price_history=PriceHistory, product_audit_logs=ProductAuditLog
slip-service | slip_audit_logs=SlipAuditLog, slip_cleanup_save_history=SlipCleanupSaveHistory, slip_publish_audit=SlipPublishAudit, slip_signature_audit=SlipSignatureAudit
user-service | employee_signature_audit=EmployeeSignatureAudit, role_change_history=RoleChangeHistory, user_audit_logs=UserAuditLog
```

이름이 `audit`가 아닌 version snapshot도 기능상 감사·복원 계층이므로 별도로 확인했다.

```text
> rg -n -i --glob 'services/*/src/main/resources/db/migration/*.sql' 'create table( if not exists)? [a-z0-9_]*revision[a-z0-9_]*' services
services\groupware-service\src\main\resources\db\migration\V12__pin_document_template_revisions.sql:10:CREATE TABLE document_template_revisions (
services\partner-service\src\main\resources\db\migration\V12__add_partner_revisions.sql:31:CREATE TABLE IF NOT EXISTS partner_revisions (
services\partner-order-service\src\main\resources\db\migration\V7__add_partner_order_revisions.sql:9:CREATE TABLE partner_order_revisions (
services\slip-service\src\main\resources\db\migration\V28__add_estimate_revisions.sql:28:CREATE TABLE IF NOT EXISTS estimate_revisions (
services\slip-service\src\main\resources\db\migration\V27__add_slip_revisions.sql:28:CREATE TABLE IF NOT EXISTS slip_revisions (

> rg -n --glob 'services/*/src/main/java/**/*.java' '@Table\(name = ".*revision.*"\)' services
services\slip-service\src\main\java\com\samhanair\logis\slip\revision\domain\SlipRevision.java:37:@Table(name = "slip_revisions")
services\partner-service\src\main\java\com\samhanair\logis\partner\revision\domain\PartnerRevision.java:39:@Table(name = "partner_revisions")
services\slip-service\src\main\java\com\samhanair\logis\slip\estimate\revision\domain\EstimateRevision.java:39:@Table(name = "estimate_revisions")
services\groupware-service\src\main\java\com\samhanair\logis\groupware\domain\DocumentTemplateRevision.java:26:@Table(name = "document_template_revisions")
services\partner-order-service\src\main\java\com\samhanair\logis\partnerorder\revision\domain\PartnerOrderRevision.java:48:@Table(name = "partner_order_revisions")
```

마이그레이션에만 존재하거나 별도 업무 보존 의미를 가진 `bundle_component_default_backfill_audit`, `slip_line_correction_audits`도 있다. 이들은 generic overlay entity가 없다는 이유로 “기능 없음”으로 판정하면 안 된다.

정리하면 다음과 같다.

| 서비스 | 이미 존재하는 서비스별 보존 계층 | S2 원칙 |
|---|---|---|
| accounting | `accounting_audit_logs` | 유지. 중앙 이벤트와 병행 |
| arologis | `arologis_audit_logs`, role-change/history | 유지. 중앙 이벤트와 병행 |
| auth | 감사 전용 테이블 없음. `BaseEntity` 감사 필드는 별개 | S2에서 새 DB 테이블을 만들지 않고 중앙 발행으로 진단 표면 확보 |
| dashboard | 감사 전용 테이블 없음. snapshot/aggregate는 감사 테이블이 아님 | S2에서 새 DB 테이블을 만들지 않고 중앙 발행 |
| dc-config | `dc_config_audit_logs`, 계산 로그 | 유지 |
| groupware | `groupware_audit_logs`, `document_template_revisions` | 두 의미를 합치지 않고 유지 |
| inventory | `inventory_audit_logs`, 물리 실사/line, stock movement, save history | 각각의 업무 의미를 유지 |
| notification | `notification_audit_logs`, 발송 결과 log, 배차문자 save history | generic 감사와 발송 이력을 구분해 유지 |
| partner-auth | `partner_login_attempt` | 로그인 성공·실패의 기존 진실 원천으로 유지하고 중앙에도 요약 발행 |
| partner-order | audit, revision, history, front-event log | 네 계층을 유지하고 중앙 이벤트는 횡단 진단용 |
| partner | audit, revision, credit history | 유지 |
| product | audit, price history, backfill audit | 유지 |
| slip | audit, revision, estimate revision, publish/signature/cleanup/correction audit | 유지 |
| user | audit, role history, signature audit | 유지 |

### 2.5 이미 존재하는 공유 모듈 좌표

현재 공유 좌표는 `shared:realtime-abstraction`과 `shared:notification-publisher`다.

- `shared:realtime-abstraction`에는 `AuditLogRecorder`, `AuditLogEntry`, `AuditEventPayloadBuilder`, `ChangeEntry`가 있고 12개 발행 대상 서비스가 이미 의존한다. 그러나 이는 자체 DB field-diff + SSE overlay 계약이며 중앙 RabbitMQ 진단 이벤트 계약이 아니다.
- `shared:notification-publisher`에는 auto-configuration, `publishAfterCommit`, 전용 bounded executor, fail-soft publisher 패턴이 있다. 다만 HTTP 알림용이고 queue 포화 시 `CallerRunsPolicy`로 호출 스레드가 직접 실행될 수 있어 “업무 응답 무영향”이라는 S2 불변식에는 그대로 재사용할 수 없다.
- auth-service와 partner-auth-service는 `shared:realtime-abstraction`을 의존하지 않는다.

실측 원문:

```text
> rg -n --glob 'build.gradle' 'realtime-abstraction|notification-publisher' services | Where-Object { $_ -match 'implementation project' }
services\arologis-service\build.gradle:91:    implementation project(':shared:realtime-abstraction')
services\dashboard-service\build.gradle:80:    implementation project(':shared:realtime-abstraction')
services\dc-config-service\build.gradle:57:    implementation project(':shared:realtime-abstraction')
services\partner-order-service\build.gradle:74:    implementation project(':shared:realtime-abstraction')
services\groupware-service\build.gradle:55:    implementation project(':shared:notification-publisher')
services\groupware-service\build.gradle:69:    implementation project(':shared:realtime-abstraction')
services\notification-service\build.gradle:72:    implementation project(':shared:realtime-abstraction')
services\partner-service\build.gradle:70:    implementation project(':shared:realtime-abstraction')
services\user-service\build.gradle:46:    implementation project(':shared:realtime-abstraction')
services\product-service\build.gradle:59:    implementation project(':shared:realtime-abstraction')
services\logging-service\build.gradle:46:    implementation project(':shared:realtime-abstraction')
services\accounting-service\build.gradle:58:    implementation project(':shared:realtime-abstraction')
services\accounting-service\build.gradle:59:    implementation project(':shared:notification-publisher')
services\slip-service\build.gradle:64:    implementation project(':shared:realtime-abstraction')
services\inventory-service\build.gradle:55:    implementation project(':shared:notification-publisher')
services\inventory-service\build.gradle:58:    implementation project(':shared:realtime-abstraction')
```

## 3. 이슈(CLOSED 포함)·기존 결정 축 대조

### 3.1 #1161 결정과 2026-08-12 최신 결정

`gh issue view 1161 --comments`에서 확인한 2026-08-10 결정 출력 중 해당 부분 원문은 다음과 같다.

```text
## 📌 개발책임자 결정 (2026-08-10) — 4건 확정 + 새 요구 1건

> *"**일원화**, **실패도 기록**, **조회 동작도 대상**, **auth-service 로 모두.**
> 전 서비스 동작 및 진단(**성공, 실패 모두**) 등을 위한 로그 기록이 필요함.
> 다만, **전 서비스의 데이터가 모두 모이므로 부하가 걸릴 위험**이 있어 **그에 따른 대비 기획이 필요함.**"*
```

같은 이슈의 후속 결정은 A 변경 감사 1년, B 실패 1년, C 조회 30일을 잠정 초기값으로 두고, 부하 시 C를 먼저 버리며, 발행은 비동기·논블로킹이고 유실은 조용히 사라지면 안 된다고 정했다.

그러나 2026-08-10의 “서비스별 감사 테이블을 중앙으로 일원화” 및 S4 제거 계획은 **2026-08-12 개발책임자의 최신 결정인 “감사 테이블은 서비스별 + 중앙 둘 다 유지”로 명시적으로 폐기·대체**된다. 나머지 결정(실패 포함, GET 포함, auth 포함, 부하 대비, 보존 등급)은 충돌하지 않으므로 유지한다.

### 3.2 관련 CLOSED 결정

- #871은 회계 서비스의 **로컬 감사 저장 실패** 시 업무 변경도 차단하는 fail-closed 결정을 유지했다.
- 이번 S2의 **중앙 Rabbit 발행**은 개발책임자가 별도로 “본 업무 트랜잭션에 영향을 주면 안 된다”고 확정했다.
- 따라서 두 결정을 합치거나 하나로 덮지 않는다. 회계의 기존 로컬 감사 원자성은 그대로 유지하되, 그 로컬 감사가 성공한 뒤 중앙 fan-out만 fail-soft/after-commit으로 격리한다.
- #1163 / merged PR #1174는 14개 서비스 sweep에서 `ActorDisplayName.resolve`로 UUID 변형까지 차단하고 actorId는 내부 추적용으로 보존하는 계약을 확정했다. S2는 이 공통 resolver와 표시/내부 식별자 분리를 재사용해야 한다.
- #830은 서비스별 revision 채번의 멀티인스턴스 안전성 문제이며 중앙 이벤트 idempotency와는 별개다. 중앙 event ID는 producer에서 안정적으로 생성해 재전송 중복을 막아야 한다.

PR #1174 대조 출력 원문:

```text
> gh pr view 1174 --json number,state,title,mergedAt,mergeCommit,url
{"mergeCommit":{"oid":"4a31d9eeedea4e437ad5101de242ffe33c969757"},"mergedAt":"2026-08-12T01:33:54Z","number":1174,"state":"MERGED","title":"[FIX] #1163 이력·감사에 UUID 가 노출되는 잔여 경로 — 14개 서비스 전수 sweep","url":"https://github.com/ewoo14/Samhan-Public/pull/1174"}
```

### 3.3 `docs/dev-reports/` 대조 결론

`2026-08-10-audit-logging-full-inventory.md`와 `2026-08-10-audit-logging-operation-matrix.md`를 코드와 대조했다.

- generic audit class/table의 존재, 실제 producer 0, auth/dashboard 감사 전용 테이블 없음, partner-auth 로그인 시도 별도 보존, revision/history와 generic audit의 의미가 다르다는 구조적 결론은 현재 코드에서도 재현된다.
- 당시 실제 DB 행 수는 공유 DB의 과거 시점 측정이므로 이번 spec의 현재 수치로 재사용하지 않는다.
- 기존 보고서가 제안한 auth 감사 테이블 신설이나 서비스별 감사 일원화/제거는 최신 “둘 다 유지” 결정 및 이번 라운드의 migration 금지와 맞지 않아 S2 요구사항으로 채택하지 않는다.

세 축의 최종 판정은 다음과 같다.

| 쟁점 | 코드 | 이슈/CLOSED | 개발책임자 결정 문서 | S2 판정 |
|---|---|---|---|---|
| 중앙 producer | 0개 | #1161이 공백 확정 | 전수보고서도 0 확정 | 신규 공통 publisher 필요 |
| 서비스별 감사 | 12개 서비스에 하나 이상, auth/dashboard 없음 | 과거 제거안 존재 | 2026-08-12 둘 다 유지 | 기존 저장소 전부 유지 |
| 실패/GET/auth | 중앙 발행 없음 | 포함 결정 | 부하·진단 목적 | 포함하되 판별식 적용 |
| 중앙 발행 실패 | 현재 계약 없음 | 비동기·업무 무영향 | 회계 로컬 감사 fail-closed는 별개 | 중앙 fan-out만 fail-soft |
| UUID | ES 문서에는 raw ID 필드 존재, activity 응답은 userId 제외하지만 resourceId는 그대로 표시 | #1163 CLOSED, PR #1174 merged | UUID 사용자 비공개 상시 규칙 | 내부/표시 식별자 강제 분리 |

## 4. 설계 대안과 선택

### 대안 A — 14개 서비스에서 mutation마다 직접 `RabbitTemplate` 호출

- 장점: 각 도메인이 정확한 before/after와 업무 식별자를 만들기 쉽다.
- 단점: 동일한 직렬화·retry·장애격리·UUID sanitizing을 14번 복제하고, 호출을 빠뜨린 endpoint가 곧 영구 누락이 된다. GET·실패·security filter 단계 오류는 별도 배선이 필요하다.
- 판정: 채택하지 않는다.

### 대안 B — 공통 HTTP filter 하나로 모든 요청을 자동 발행

- 장점: 14개 서비스의 성공·실패·GET을 가장 적은 코드로 빠짐없이 포착한다.
- 단점: 업무 resource의 표시 식별자와 field diff를 알기 어렵고, scheduler/import/consumer처럼 HTTP 밖 동작은 잡지 못한다. raw URI·payload를 잘못 담으면 UUID·비밀정보를 중앙 화면에 재노출한다.
- 판정: 단독으로는 부족하다.

### 대안 C — 공통 request 관측 + 도메인 enrichment SPI의 혼합형

- 모든 업무 HTTP 완료를 공통 filter/interceptor가 **요청당 1건** 발행한다.
- handler metadata와 서비스별 작은 `AuditContextContributor`가 action, 업무 resource type, 사용자 표시용 business key를 보강한다.
- 기존 서비스별 audit/revision writer는 그대로 두고, 상세 before/after가 이미 계산되는 지점만 공통 publisher API에 sanitized enrichment를 전달한다.
- scheduler/import/message consumer는 공통 `publishSummary` API로 batch 1건을 발행한다.

**대안 C를 채택한다.** 기본 request outcome 이벤트가 전 서비스 coverage를 보장하고, 도메인 SPI는 진단 품질을 높인다. 서비스별로 publisher 구현을 복제하지 않으며, 기존 감사 테이블의 의미도 보존한다.

## 5. 감사 대상 판별식

“전 서비스 전 동작”을 다음의 실행 가능한 판별식으로 바꾼다.

### 5.1 포함

아래 중 하나이고 §5.2 제외 조건에 해당하지 않으면 중앙 감사 대상이다.

1. 14개 업무 서비스의 업무 HTTP 요청 완료
   - 성공한 생성·수정·삭제·복구·상태전이
   - 실패한 생성·수정·삭제·복구·상태전이
   - 성공·실패한 업무 조회(GET/HEAD뿐 아니라 조회 의미의 POST 포함)
   - 로그인 성공·실패, 권한 변경, 잠금·해제, 비밀번호 reset 시도. 비밀번호·token 값은 절대 payload에 넣지 않는다.
   - 인증/인가/validation에서 service method 진입 전에 끝난 4xx도 포함한다.
2. 업무 데이터를 변경하는 scheduler, batch/import, message consumer
   - 건별 폭증 대신 실행 1회당 요약 1건: 입력 건수, 성공/실패/skip 건수, 파일의 비가역 hash, 소요시간
   - 개별 변경은 기존 서비스별 감사·revision 저장소가 담당한다.
3. 서비스 간 내부 업무 호출
   - 동일 request/trace ID로 각 서비스의 구간을 남긴다. 중복이 아니라 호출 chain 진단 데이터다.
4. no-op mutation
   - 결과를 `NO_CHANGE`로 남긴다. 사용자가 시도했으나 값이 같았다는 사실도 진단 가치가 있다.

### 5.2 제외

다음은 감사 이벤트가 아니라 운영 telemetry이므로 제외한다.

- `/actuator/health`, `/actuator/prometheus`, readiness/liveness, Eureka heartbeat
- Swagger/OpenAPI 문서, 정적 asset, favicon
- CORS `OPTIONS`
- SSE/WebSocket heartbeat·keepalive·재연결 tick. 최초 연결 성공/실패는 별도 요약 이벤트 1건만 허용한다.
- logging-service가 수신 이벤트를 ES에 쓰는 동작. 자기 자신을 다시 발행하면 무한 순환하므로 producer 대상 14개에서 logging-service를 제외한다.
- request/response body의 자동 덤프, raw query string, multipart 원문, 파일 원문

`@AuditIgnore`는 위 기술 경로에만 허용한다. 업무 handler에 사용하면 사유 문자열과 아키텍처 테스트 allowlist가 필수다. 이름이 `preview`, `lookup`, `sync`라는 이유만으로 제외하지 않는다. 실제 상태 변경 여부를 판정한다.

### 5.3 등급 결정 순서

분류는 HTTP method만으로 끝내지 않고 다음 우선순위를 적용한다.

1. outcome이 실패(HTTP 4xx/5xx, exception, broker consumer 실패)이면 **B_FAILURE**
2. 성공한 mutation/auth/permission/import/scheduler이면 **A_CHANGE**
3. 성공한 업무 조회·메뉴 진입이면 **C_READ**

기본값은 GET/HEAD=`C_READ`, POST/PUT/PATCH/DELETE=`A_CHANGE`다. 조회 의미 POST는 `@AuditKind(C_READ)`, 상태를 바꾸는 GET 같은 비표준 endpoint는 `@AuditKind(A_CHANGE)`로 명시한다. 실패는 method/annotation보다 항상 우선해 B로 승격한다.

잠정 보존은 #1161 결정대로 A=1년, B=1년, C=30일이며 실제 증가율 측정 뒤 조정한다. 법적 보존 요구가 더 길면 A의 해당 도메인 정책이 우선한다.

## 6. 공통 배선 구조

### 6.1 신규 공유 좌표

기존 `shared:realtime-abstraction`에 Rabbit 진단 책임을 섞지 않는다. 해당 모듈은 JPA audit overlay + SSE 책임이 이미 명확하고 logging-service도 의존하므로, producer를 추가하면 중앙 소비자의 자기 발행 위험이 생긴다.

다음 두 좌표를 둔다.

1. `shared:audit-contract`
   - `AuditEventV2`, enum, topology/routing 상수, schema validation
   - Spring Web/JPA에 의존하지 않는 wire contract
   - logging-service consumer와 publisher가 함께 의존
2. `shared:audit-publisher`
   - `shared:audit-contract` + Spring AMQP/Web/Tx/Micrometer
   - auto-configuration, request outcome filter, actor/resource sanitizer, bounded priority dispatch, retry/confirm callback, `AuditContextContributor` SPI
   - 14개 업무 서비스만 의존. logging-service는 의존하지 않는다.

14개 서비스에는 공통 모듈 의존과 서비스별 최소 business-key/action registry만 둔다. exchange명, DTO, executor, retry, UUID 방어를 14번 복제하지 않는다.

### 6.2 request/trace 상관관계

현재 main Java에서 `X-Request-Id`, `X-Correlation-Id`, `traceId`, `MDC` 상관관계 구현은 검색되지 않았다.

```text
> rg -n --glob 'services/*/src/main/java/**/*.java' --glob 'shared/*/src/main/java/**/*.java' 'X-Request-Id|X-Correlation-Id|traceId|MDC\.' services shared
[출력 없음]
```

공통 모듈은 신뢰 가능한 inbound `X-Request-Id`가 있으면 사용하고, 없으면 새 ID를 생성해 response와 outbound service call에 전파한다. 외부 클라이언트가 보낸 값을 무조건 신뢰하지 않고 gateway가 strip/reinject한 헤더 또는 내부 인증 경로만 신뢰한다. 서비스마다 새 ID를 만들지 않아 한 사용자 요청의 service chain이 같은 ID로 검색되어야 한다.

outbound `RestClient`/`WebClient` 공통 interceptor에도 request ID를 전달한다. 지원하지 않는 client는 서비스 wave에서 adapter를 추가한다. 단, request ID 자체를 업무 `requestId` UUID와 혼동하지 않는다.

### 6.3 transaction 경계

- HTTP 성공 이벤트는 controller/service 반환과 transaction commit이 끝난 뒤 dispatch queue에 넣는다.
- transaction 안에서 명시적으로 상세 이벤트를 요청하면 `TransactionSynchronization.afterCommit`에서 enqueue한다.
- rollback/exception이면 성공 이벤트는 만들지 않고 B_FAILURE 한 건만 만든다.
- transaction이 없는 조회·로그인 실패는 request 완료 후 바로 enqueue한다.
- 기존 로컬 감사 writer의 transaction propagation은 바꾸지 않는다. 특히 회계 로컬 감사 fail-closed 계약을 중앙 publisher의 fail-soft와 혼동하지 않는다.

### 6.4 routing key

기존 `audit.#` binding을 유지하면서 아래 키를 사용한다.

- `audit.change.<service-name>`
- `audit.failure.<service-name>`
- `audit.read.<service-name>`

모두 현재 `samhan.audit.exchange` → `samhan.audit.queue` binding에 들어온다. consumer는 event의 `retentionClass`와 routing key가 어긋나면 DLQ로 보내고 metric을 올린다.

## 7. wire contract v2

현재 13필드 `AuditLogEvent`는 하위 호환 입력으로 유지하되, 신규 publisher는 다음 v2 필드를 반드시 채운다.

| 필드군 | 필드 | 계약 |
|---|---|---|
| 식별 | `schemaVersion`, `id`, `serviceName` | v2, producer가 만든 안정적 event ID, 정확한 application name |
| 분류 | `retentionClass`, `eventKind`, `outcome`, `action` | A/B/C, READ/MUTATION/AUTH/BATCH/INTERNAL, SUCCESS/FAILURE/NO_CHANGE |
| 상관 | `requestId`, `traceId`, `parentService` | 서비스 횡단 원인 추적. 없는 값은 null 허용하되 request HTTP는 requestId 필수 |
| HTTP | `httpMethod`, `routeTemplate`, `httpStatus`, `durationMs` | raw URI가 아니라 `/slips/{id}` 같은 template |
| actor | `userId`, `actorDisplayName`, `userRole` | `userId`는 내부 전용, 표시명은 UUID-safe resolver 통과 |
| resource | `resourceType`, `resourceId`, `internalResourceId` | `resourceId`는 전표번호/창고코드/거래처코드 같은 화면 안전 business key. UUID는 `internalResourceId`에만 |
| 설명 | `description`, `beforeData`, `afterData` | allowlist로 만든 표시 안전 값만. body 자동 직렬화 금지 |
| 오류 | `errorCode`, `errorClass`, `rootCauseClass`, `errorSummary`, `stackFingerprint` | 비밀정보 제거, stack 전체는 화면 DTO에 제공하지 않음 |
| 환경 | `ipAddress`, `userAgent`, `occurredAt` | 현재 계약 유지. 보존/권한/마스킹 대상 |

`id`는 enqueue 전에 한 번 생성하고 retry에서 재사용한다. consumer는 동일 `id` 저장을 idempotent upsert로 취급한다. v2에서 blank ID는 계약 위반이며 DLQ 대상이다. 기존 v1 producer 호환을 위해서만 현재 consumer의 blank→UUID fallback을 한시 유지한다.

진단을 위해 전체 stack trace나 request body를 무차별 수집하지 않는다. 오류 class, root cause class, 표준 error code, sanitizer를 통과한 요약, application frame 기반 fingerprint로 먼저 원인을 좁히고, 상세 stack은 기존 service 로그에서 requestId로 연결한다.

## 8. UUID·민감정보 비공개 계약

### 8.1 내부 값과 표시 값 분리

- `userId`, `internalResourceId`, event `id`, request/trace ID는 ES 내부 검색·join용이다.
- `actorDisplayName`, `resourceId`, `description`, `beforeData`, `afterData`는 사용자 화면에 나갈 수 있는 presentation-safe 필드다.
- 내부 UUID가 없다고 진단이 불가능해지는 것은 아니며, 내부 보존은 허용한다. 다만 사용자 응답 DTO와 UI에 직접 내보내지 않는다.
- 표시 식별자가 없으면 `변경자 미상`, `대상 식별자 미상`을 사용한다. UUID 앞 8자, raw path segment, internal ID fallback은 금지한다.

### 8.2 생성 단계 fail-safe

- actor 이름은 PR #1174의 `ActorDisplayName.resolve`를 반드시 통과한다.
- presentation-safe 필드는 allowlist builder로만 만들며, canonical UUID, 32hex, `urn:uuid`, zero-width wrapper 변형을 재귀 검사한다.
- 위반 값을 발견해도 업무 요청을 실패시키지 않는다. 해당 값은 안전 placeholder로 치환하고 `audit_presentation_redaction_total{service,field}` metric과 rate-limited ERROR를 남긴다.
- raw URI/query/body/header dump는 금지한다. header는 request ID와 신뢰된 actor/role 등 명시 allowlist만 허용한다.
- 비밀번호, reset token, JWT, internal token, cookie, API key, 서명 이미지, 원본 첨부/문서, 카드·계좌 전체번호는 before/after에 넣지 않는다. 필요한 경우 존재 여부·변경 여부·마스킹 끝자리만 기록한다.

### 8.3 조회 단계 이중 방어

현재 `/logs/activity`는 `userId`를 응답에서 제외하지만 `resourceId`와 `description`은 그대로 보여 준다. `/logs/by-service`, `/logs/by-user`, `/logs/search`는 `AuditLog` domain document를 직접 반환한다. v2 도입 전 반드시 다음으로 바꾼다.

- 사용자 도달 가능 endpoint는 모두 전용 safe DTO를 반환하고 raw `AuditLog` 반환을 금지한다.
- activity 목록은 `resourceId` business key와 safe description만 표시한다.
- 내부 ID·before/after·오류 상세가 필요한 개발자 상세 조회는 별도 permission과 redacted DTO를 사용한다. raw ES document를 그대로 반환하지 않는다.
- API·desktop 양쪽에 UUID 변형 sweep 테스트를 둔다. 새 action/resource label이 없을 때 raw 값을 그대로 보여 주지 않는다.

## 9. 성능·장애 격리 계약

다음은 선택 사항이 아니라 acceptance gate다.

1. request thread에서 Rabbit connection 획득, network publish, retry, confirm 대기를 하지 않는다.
2. enqueue는 non-blocking `offer` 단일 시도다. queue 포화 시 `CallerRunsPolicy`를 쓰지 않는다.
3. A/B와 C는 용량이 분리된 bounded lane을 사용한다. C가 A/B 용량을 잠식할 수 없고, 포화 시 C부터 즉시 drop한다.
4. worker는 제한된 daemon executor에서 publish한다. retry는 같은 event ID로 bounded exponential backoff를 적용한다.
5. broker accepted 이후에는 publisher confirm/return을 관측하고 consumer 실패는 현재 DLX/DLQ로 보낸다.
6. broker 미연결, exchange 미존재, serializer 오류, executor 종료, queue 포화 어느 경우에도 publisher exception이 업무 호출자로 전파되지 않는다.
7. 모든 drop/nack/unroutable/retry-exhausted는 다음 두 흔적을 동시에 남긴다.
   - Micrometer counter/gauge: service, class, reason까지만 label
   - rate-limited structured WARN/ERROR: event ID, request ID, class, reason. payload·UUID·비밀값은 기록하지 않음
8. 중앙 audit loss 사실은 관측 가능해야 하지만 loss를 막기 위한 local DB outbox를 S2에서 만들지 않는다. outbox write 실패가 업무 transaction을 깨뜨리고 이번 migration 금지·업무 무영향 계약과 충돌하기 때문이다. process crash 전 enqueue event 유실 가능성은 metric/log 한계와 함께 명시한다.

정량 gate:

- Rabbit 정상/지연/중단/queue-full 각각에서 동일 업무 API의 status와 DB commit 결과가 audit 비활성 baseline과 같아야 한다.
- publisher로 인한 request-thread 추가시간은 로컬 격리 부하테스트에서 p95 2ms 이하, p99 5ms 이하를 목표로 한다. 초과하면 rollout하지 않는다.
- queue 크기·worker 수·retry 수는 설정값이며 무한 queue/retry는 금지한다.

### 9.1 현재 topology와 선행 공백

현재 `RabbitConfig`에는 queue `max-length`, TTL, broker priority, DLQ consumer가 없다. 따라서 producer 내부에서 C를 먼저 버릴 수는 있어도 broker가 이미 받은 단일 queue 안에서 C를 먼저 폐기하는 것은 보장할 수 없다.

#1161에서 S2보다 먼저 두기로 한 S1.5(보존 정책 + 실패 경로)가 아직 현재 코드 계약에 반영되지 않은 상태라면, **S2a 구현·격리 테스트는 가능하지만 14개 서비스 전체 활성화는 S1.5 완료를 선행 gate로 둔다.** S2가 임의로 기존 durable queue arguments를 바꾸거나 운영 queue를 재선언하지 않는다.

## 10. 서비스별 표시 식별자 계약

`AuditContextContributor`는 내부 UUID를 표시값으로 fallback하지 않는다. 표시 식별자를 얻지 못한 경우 중앙 event는 여전히 발행하되 `resourceId="대상 식별자 미상"`으로 둔다.

| 서비스 | 우선 표시 식별자 예시 | 금지 fallback |
|---|---|---|
| accounting | 전표번호, 회계 문서번호, 계정코드, 정산 문서번호 | journal/account/settlement UUID |
| arologis | 전표번호, 배차 업무번호, 차량번호, 직원 business code | dispatch/driver/stop UUID |
| auth | loginId, 역할 풀네임, pageCode, 권한그룹명 | account/group UUID |
| dashboard | 공지 제목, release version | notice/release UUID |
| dc-config | 거래처코드, 설정 종류·적용일 | config UUID |
| groupware | 결재·문서번호, 양식명 | document/template UUID |
| inventory | 창고코드, 실사번호, 품목코드, movement 업무 참조 | warehouse/audit/product UUID |
| notification | channel + 업무 참조번호, 저장내역명, 외부 message ID의 안전한 일부 | notification request UUID, 전화번호 원문 |
| partner-auth | 거래처코드 또는 마스킹된 로그인 식별자 | partner/login-attempt UUID, 비밀번호 관련 값 |
| partner-order | 주문번호 | order/revision UUID |
| partner | 거래처코드·거래처명 | partner UUID |
| product | 모델코드·품목코드 | product UUID |
| slip | `YYYY/MM/DD-{순번}` 전표번호·견적번호 | slip/estimate UUID |
| user | 사번·직원명·부서코드 | employee/account UUID |

이 표는 화면 표시 계약의 우선순위다. 서비스마다 존재하지 않는 business key를 새 DB column으로 만들라는 요구가 아니다. 현재 응답/도메인에서 안전한 key를 얻을 수 없으면 placeholder를 사용하고, 별도 도메인 결정 없이 UUID를 가공해 대체하지 않는다.

## 11. S2 슬라이스 분할 — 각 1 PR

14개 서비스를 한 PR에 넣지 않는다. 공통 filter가 코드 중복은 줄여도 서비스별 security chain, 비표준 조회 POST, business key, scheduler/import, 회귀 suite가 달라 검증 표면까지 한 PR에 합치면 결함 위치와 rollback 경계가 사라진다.

### S2a — 공통 계약·publisher 기반 + 2종 pilot

범위:

- `shared:audit-contract`, `shared:audit-publisher`
- logging-service v1/v2 consumer, idempotency, safe response DTO
- routing key/metric/queue lane/UUID sanitizer
- 전형적 mutation 서비스 `dc-config-service` pilot
- 비인증 성공·실패가 있는 `partner-auth-service` pilot
- 개발자 로그 메뉴에 두 pilot event 표시

이 두 pilot을 함께 택하는 이유는 정상 CRUD와 security-chain 이전 실패를 한 PR에서 모두 증명하되 서비스 수는 2개로 제한하기 위해서다. 나머지 12개 publisher는 비활성이다.

### S2b — 신원·권한·운영 화면

- `auth-service`, `user-service`, `dashboard-service`
- 로그인/권한/잠금/해제와 공지·release mutation
- auth 비밀번호·token redaction, 사용자/역할 표시 계약

### S2c — 핵심 transaction 도메인

- `accounting-service`, `inventory-service`, `slip-service`, `partner-order-service`
- 기존 로컬 감사/복원/revision의 원자성 보존
- commit 후 중앙 발행, rollback 시 B_FAILURE만 발행
- 전표번호·실사번호·주문번호 business key

### S2d — master·협업 도메인

- `partner-service`, `product-service`, `groupware-service`
- revision/history와 중앙 request event의 중복 의미를 문서화
- import/sync는 batch summary 1건 + 기존 상세 보존

### S2e — 배차·알림 운영 도메인

- `arologis-service`, `notification-service`
- scheduler/message consumer/외부 vendor 결과 요약
- 차량번호·전표번호·channel/ref 중심 표시, GPS·전화번호·vendor credential redaction

각 PR은 해당 wave의 README/ROADMAP/DECISIONS/dev-report 동기화, 한국어 Javadoc/OpenAPI, 실제 Rabbit/ES 경로 QA와 개발자 로그 메뉴 스크린샷을 포함한다. migration은 S2 전 wave에서 만들지 않는다.

## 12. 검증 및 acceptance gate

### 12.1 공통 contract/단위 검증

- v1 event 역직렬화 회귀와 v2 필수값 validation
- routing key ↔ retention class 일치
- 안정적 event ID retry 및 consumer idempotency
- UUID canonical/32hex/URN/zero-width 변형을 actor/resource/description/nested before/after에서 모두 차단
- password/JWT/token/cookie/API key/전화번호 등 민감 field allowlist·redaction
- raw URI 대신 route template만 저장
- `@AuditKind` override와 `@AuditIgnore` allowlist 판별

### 12.2 transaction·장애 주입 검증

각 wave의 대표 mutation으로 다음 표를 모두 통과해야 한다.

| 조건 | 업무 결과 | 중앙 결과 |
|---|---|---|
| commit 성공 + Rabbit 정상 | commit 유지 | A_CHANGE 1건 |
| commit 성공 + Rabbit down/slow | commit·응답 baseline과 동일 | 비동기 retry 후 실패 metric/log, 업무 예외 0 |
| local audit 실패로 transaction rollback | 기존 도메인 계약대로 rollback | 성공 event 0, B_FAILURE 1건 |
| validation/auth 실패 | 원래 4xx 유지 | B_FAILURE 1건, secret/body 없음 |
| GET 성공 | 원래 response 유지 | C_READ 1건 |
| dispatch queue full | 원래 response 유지 | C 우선 drop, A/B reserved lane 유지, drop 관측 가능 |
| duplicate delivery | 업무와 무관 | ES logical document 1건 |

### 12.3 coverage 검증

- 구현 시점의 실제 `HandlerMethod` 목록을 자동 추출해 각 업무 route가 기본 capture, 명시 override, 기술 exclude 중 정확히 하나로 분류되는 manifest를 artifact로 남긴다.
- handler 수를 과거 보고서의 580으로 하드코딩하지 않는다. 현재 코드에서 다시 센 분모를 사용한다.
- HTTP 밖 scheduler/import/message consumer 목록도 서비스 wave별로 추출하고, 상태 변경 항목은 `publishSummary` 또는 기존 domain audit와 연결한다.
- “class/table 존재”가 아니라 test에서 실제 Rabbit message를 받고 logging-service 조회까지 확인한다.

### 12.4 성능·운영 검증

- Rabbit 정상, 2초 지연, connection refused, exchange unroutable, queue full을 각각 주입한다.
- audit disabled baseline과 p50/p95/p99 latency, status, DB 결과를 비교한다.
- producer accepted/rejected/retry/nack/drop metric, executor queue depth, Rabbit queue/DLQ depth, ES ingest failure를 dashboard/alert에서 확인한다.
- S1.5가 queue/retention/DLQ consumer를 제공하면 exact topology와 함께 end-to-end 재검증한다.

### 12.5 사용자 화면 QA

- 개발자 로그 메뉴에서 A/B/C, 서비스, action, 시각, 안전한 사용자명, business key, requestId 검색이 가능해야 한다.
- actor/resource/internal/request/trace UUID를 fixture에 넣고 화면 text/DOM/accessibility name 어디에도 UUID 또는 앞 8자가 나타나지 않아야 한다.
- 상세 진단 권한이 없는 사용자는 error summary·before/after 내부값을 볼 수 없어야 한다.
- screenshot은 mock이 아니라 local opt-in logging-service + Rabbit + ES 실경로로 생성한다.

## 13. 명시적 비범위

- 서비스별 감사/revision/history 테이블 제거·통합
- 신규 서비스 DB 감사 테이블 또는 outbox migration
- 기존 감사 overlay 복원 semantics 변경
- S1.5의 ILM, queue TTL/max-length, DLQ consumer 자체 구현
- 법적 보존 기간 최종 확정
- raw request/response/body/stack 전체 수집
- logging-service 자체 producer 활성화

## 14. 완료 정의

S2 전체 완료는 다음을 모두 만족할 때다.

1. 14개 업무 서비스에서 publisher가 실제로 활성화되고 `samhan.audit.exchange`로 발행한다.
2. 업무 route 전수 manifest에 미분류 항목이 0개다.
3. 기존 서비스별 감사·revision/history 저장과 화면 동작이 보존된다.
4. 성공 mutation, 실패, GET, auth, 대표 scheduler/import가 중앙 ES에서 requestId와 함께 조회된다.
5. Rabbit/ES 중단·지연·포화가 업무 transaction·status·응답시간 gate를 깨지 않는다.
6. drop/nack/unroutable/retry-exhausted가 조용히 사라지지 않는다.
7. 개발자 로그 메뉴 및 모든 사용자 도달 API에서 UUID·UUID 조각·비밀정보 노출이 0건이다.
8. S1.5 선행 topology/retention gate가 충족되고 실제 증가율 재측정을 시작할 수 있다.

## 15. 구현자에게 넘기는 결정 요약

- 서비스별 + 중앙 감사는 병존한다.
- 공통 request outcome + domain enrichment 혼합형을 사용한다.
- 신규 `shared:audit-contract`/`shared:audit-publisher`로 14중 복제를 막는다.
- B_FAILURE > A_CHANGE > C_READ 순으로 보존하고 C부터 버린다.
- 중앙 publisher는 after-commit·non-blocking·fail-soft다. request thread network/retry/CallerRuns 금지다.
- 내부 UUID는 중앙 진단용으로 보존할 수 있으나 사용자 표시 필드와 API DTO에는 절대 노출하지 않는다.
- raw body/query/URI/stack을 수집하지 않는다.
- S2a~S2e를 각각 1개 통합 PR로 진행하며, 전 서비스 일괄 big-bang은 금지한다.
