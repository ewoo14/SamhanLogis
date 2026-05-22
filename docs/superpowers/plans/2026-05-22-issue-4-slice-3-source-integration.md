# Issue 4 Slice 3 — source services 통합 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Codex 디스패치 의무 (feedback_codex_implements_claude_reviews).

**Goal:** Source services (inventory + groupware) 가 NotificationPublisher 로 통합 알림 발송. SafetyStockService.checkAndNotify + MessageService.send 가 notification-service `/internal/notifications` 호출.

**Architecture:** Shared `NotificationPublisher` Spring component (shared:security 패턴 일관). LB-aware RestClient + X-Internal-Token 자동 첨부. Source service 트랜잭션 영향 0 (fail-soft).

**Tech Stack:** Spring Boot 3.3.5, RestClient, Spring Cloud LoadBalancer, JUnit 5, Mockito

**Spec:** [`docs/superpowers/specs/2026-05-22-issue-4-unified-notification-center-design.md`](../specs/2026-05-22-issue-4-unified-notification-center-design.md) Slice 3

---

## File Structure

### Create
- `shared/notification-publisher/build.gradle` — 신규 shared 모듈 (shared:security 패턴)
- `shared/notification-publisher/src/main/java/com/samhanair/logis/notification/publisher/NotificationPublisher.java` — Spring component
- `shared/notification-publisher/src/main/java/com/samhanair/logis/notification/publisher/NotificationPublishRequest.java` — copy DTO (notification-service 의 web/dto 와 wire format 1:1)
- `shared/notification-publisher/src/main/java/com/samhanair/logis/notification/publisher/NotificationSeverity.java` — enum copy
- `shared/notification-publisher/src/main/java/com/samhanair/logis/notification/publisher/NotificationPublisherAutoConfiguration.java` — @AutoConfiguration

### Modify
- `settings.gradle` — `:shared:notification-publisher` include
- `build.gradle` — `leafProjects` 에 `:shared:notification-publisher` 추가
- `services/inventory-service/build.gradle` — `:shared:notification-publisher` 의존
- `services/groupware-service/build.gradle` — `:shared:notification-publisher` 의존
- `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/SafetyStockService.java` — checkAndNotify 마지막에 NotificationPublisher.publish 호출
- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/service/MessageService.java` — send 후 publish 호출
- `services/inventory-service/src/test/java/com/samhanair/logis/inventory/service/SafetyStockServiceTest.java` — @Mock NotificationPublisher + publish 호출 검증
- `services/groupware-service/src/test/java/com/samhanair/logis/groupware/service/MessageServiceTest.java` — 동일

---

## Task 1: shared:notification-publisher 모듈 신규

**Files:**
- Create: `shared/notification-publisher/build.gradle`
- Create: `shared/notification-publisher/src/main/java/com/samhanair/logis/notification/publisher/NotificationSeverity.java`
- Create: `shared/notification-publisher/src/main/java/com/samhanair/logis/notification/publisher/NotificationPublishRequest.java`
- Create: `shared/notification-publisher/src/main/java/com/samhanair/logis/notification/publisher/NotificationPublisher.java`
- Create: `shared/notification-publisher/src/main/java/com/samhanair/logis/notification/publisher/NotificationPublisherAutoConfiguration.java`
- Create: `shared/notification-publisher/src/main/resources/META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`
- Modify: `settings.gradle` — include
- Modify: `build.gradle` — leafProjects 추가

- [ ] **Step 1: shared/notification-publisher/build.gradle** (shared:security 패턴 1:1 미러)

```gradle
plugins {
    id 'java-library'
    id 'io.spring.dependency-management'
}

dependencyManagement {
    imports {
        mavenBom org.springframework.boot.gradle.plugin.SpringBootPlugin.BOM_COORDINATES
    }
}

dependencies {
    api 'org.springframework.boot:spring-boot-autoconfigure'
    api 'org.springframework.boot:spring-boot'
    api 'org.springframework:spring-web'
    api 'com.fasterxml.jackson.core:jackson-databind'

    // LB-aware RestClient
    compileOnly 'org.springframework.cloud:spring-cloud-loadbalancer'

    // ConfigurationProcessor (옵션)
    annotationProcessor 'org.springframework.boot:spring-boot-configuration-processor'

    compileOnly "org.projectlombok:lombok:${lombokVersion}"
    annotationProcessor "org.projectlombok:lombok:${lombokVersion}"

    testImplementation 'org.springframework.boot:spring-boot-starter-test'
    testRuntimeOnly 'org.junit.platform:junit-platform-launcher'
}

tasks.named('test') {
    useJUnitPlatform()
}
```

- [ ] **Step 2: NotificationSeverity.java** (notification-service 의 enum copy)

```java
package com.samhanair.logis.notification.publisher;

public enum NotificationSeverity {
    INFO,
    WARNING,
    CRITICAL
}
```

- [ ] **Step 3: NotificationPublishRequest.java** (wire format 1:1)

```java
package com.samhanair.logis.notification.publisher;

import java.util.List;
import java.util.UUID;

/**
 * {@code POST /internal/notifications} 요청 body — source service 가 호출.
 *
 * <p>notification-service 의 {@code NotificationPublishRequest} record 와 wire format 1:1 정합.
 *
 * @param channel        알림 채널 키 (SAFETY_STOCK / MESSENGER / APPROVAL ...)
 * @param severity       INFO/WARNING/CRITICAL
 * @param title          제목 (200 자)
 * @param body           본문 (TEXT)
 * @param targetRole     role 배열 (예: ["MASTER","MANAGER"]). null/empty 면 role 필터 미적용.
 * @param targetUserId   특정 사용자 UUID. null 면 role 기반.
 * @param sourceService  발송 service 명 (예: inventory-service)
 * @param sourceRefId    source 식별자
 * @param deeplink       FE 가 클릭 시 이동할 라우트
 */
public record NotificationPublishRequest(
        String channel,
        NotificationSeverity severity,
        String title,
        String body,
        List<String> targetRole,
        UUID targetUserId,
        String sourceService,
        String sourceRefId,
        String deeplink
) {
}
```

- [ ] **Step 4: NotificationPublisher.java** (Spring component)

```java
package com.samhanair.logis.notification.publisher;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * 통합 알림 센터 발송 client — source service 가 호출 (Issue 4 Slice 3).
 *
 * <p>notification-service 의 {@code POST /internal/notifications} endpoint 를 호출하여 row INSERT.
 * X-Internal-Token 헤더 자동 첨부.
 *
 * <p>장애 격리 정책: 호출 실패 시 warn log 만 남기고 throw 하지 않음 (fail-soft).
 * 알림 누락은 운영 모니터링 책임이며, source service 의 트랜잭션에 영향 주지 않는다.
 *
 * <p>등록은 {@link NotificationPublisherAutoConfiguration} 가 담당.
 */
public class NotificationPublisher {

    private static final Logger log = LoggerFactory.getLogger(NotificationPublisher.class);
    private static final String NOTIFICATION_SERVICE_BASE = "http://notification-service";
    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";

    private final RestClient restClient;
    private final String internalToken;
    private final String callerServiceName;

    public NotificationPublisher(RestClient.Builder loadBalancedBuilder,
                                 String internalToken,
                                 String callerServiceName) {
        this.restClient = loadBalancedBuilder.baseUrl(NOTIFICATION_SERVICE_BASE).build();
        this.internalToken = internalToken;
        this.callerServiceName = (callerServiceName == null || callerServiceName.isBlank())
                ? "unknown" : callerServiceName;
    }

    /**
     * 알림 발송 — fail-soft. notification-service 다운 또는 4xx/5xx 시 warn log + return.
     *
     * @param req 발송 요청 (sourceService 는 본 publisher 가 자동 set)
     */
    public void publish(NotificationPublishRequest req) {
        try {
            NotificationPublishRequest enriched = new NotificationPublishRequest(
                    req.channel(), req.severity(), req.title(), req.body(),
                    req.targetRole(), req.targetUserId(),
                    callerServiceName,
                    req.sourceRefId(), req.deeplink());

            restClient.post()
                    .uri("/internal/notifications")
                    .header(INTERNAL_TOKEN_HEADER, internalToken == null ? "" : internalToken)
                    // notification-service /internal/ 가드 통과용 (X-User-Id + X-User-Role)
                    .header("X-User-Id", "system-internal:" + callerServiceName)
                    .header("X-User-Role", "MASTER")
                    .body(enriched)
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientException ex) {
            log.warn("[NotificationPublisher] notification-service 발송 실패 (fail-soft) — channel={} ref={} error={}",
                    req.channel(), req.sourceRefId(), ex.getMessage());
        } catch (Exception ex) {
            log.error("[NotificationPublisher] 알림 발송 예외 (fail-soft) — channel={} ref={} error={}",
                    req.channel(), req.sourceRefId(), ex.getMessage(), ex);
        }
    }
}
```

- [ ] **Step 5: NotificationPublisherAutoConfiguration.java**

```java
package com.samhanair.logis.notification.publisher;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.web.client.RestClient;

/**
 * NotificationPublisher 자동 등록 — shared:notification-publisher 의존만 추가하면 활성.
 *
 * <p>{@code loadBalancedRestClientBuilder} bean 이 없는 service (auth/dashboard/dc-config/groupware 등
 * DPC 호출자 아닌 service) 에서는 비활성. DPC 호출자 service 는 자동 활성.
 */
@AutoConfiguration
public class NotificationPublisherAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean
    @ConditionalOnBean(name = "loadBalancedRestClientBuilder")
    public NotificationPublisher notificationPublisher(
            @Qualifier("loadBalancedRestClientBuilder") RestClient.Builder loadBalancedBuilder,
            @Value("${app.security.internal.token:}") String internalToken,
            @Value("${spring.application.name:unknown}") String applicationName) {
        return new NotificationPublisher(loadBalancedBuilder, internalToken, applicationName);
    }
}
```

- [ ] **Step 6: AutoConfiguration.imports**

`shared/notification-publisher/src/main/resources/META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`:

```
com.samhanair.logis.notification.publisher.NotificationPublisherAutoConfiguration
```

- [ ] **Step 7: settings.gradle + build.gradle leafProjects 등록**

`settings.gradle`:
```gradle
include 'shared:notification-publisher'
project(':shared:notification-publisher').projectDir = file('shared/notification-publisher')
```

`build.gradle` leafProjects 리스트에 `:shared:notification-publisher` 추가.

- [ ] **Step 8: 컴파일 검증**

Run: `./gradlew :shared:notification-publisher:assemble --no-daemon`
Expected: BUILD SUCCESSFUL

- [ ] **Step 9: Commit**

```bash
git add shared/notification-publisher/ settings.gradle build.gradle
git commit -m "feat(notification-publisher): Slice 3 Task 1 — shared:notification-publisher 모듈 신규 (Spring AutoConfiguration + LB-aware RestClient + fail-soft)"
```

---

## Task 2: inventory-service SafetyStockService 통합

**Files:**
- Modify: `services/inventory-service/build.gradle` — `:shared:notification-publisher` 의존
- Modify: `services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/SafetyStockService.java`
- Modify: `services/inventory-service/src/test/java/com/samhanair/logis/inventory/service/SafetyStockServiceTest.java`

- [ ] **Step 1: build.gradle 의존 추가**

`services/inventory-service/build.gradle` dependencies 블록에 추가:

```gradle
implementation project(':shared:notification-publisher')
```

- [ ] **Step 2: SafetyStockService.checkAndNotify 안에 publish 호출**

기존 `checkAndNotify(UUID productId, UUID warehouseId)` 메서드 안 `fireAlert(config, currentQty)` 호출 후 NotificationPublisher.publish 추가.

import 추가:
```java
import com.samhanair.logis.notification.publisher.NotificationPublisher;
import com.samhanair.logis.notification.publisher.NotificationPublishRequest;
import com.samhanair.logis.notification.publisher.NotificationSeverity;
import java.util.List;
```

field 추가 (`@RequiredArgsConstructor`):
```java
private final NotificationPublisher notificationPublisher;
```

`fireAlert(SafetyStockConfig config, int currentQty)` 메서드 수정 또는 새 helper 추가:

```java
private void fireAlert(SafetyStockConfig config, int currentQty) {
    // 기존 notificationClient.sendSafetyStockAlert 호출 유지 (legacy SMS/email)
    notificationClient.sendSafetyStockAlert(...);

    // Slice 3 추가: 통합 알림 센터 발송
    notificationPublisher.publish(new NotificationPublishRequest(
            "SAFETY_STOCK",
            NotificationSeverity.WARNING,
            String.format("안전재고 부족 — 제품 %s", config.getProductId()),
            String.format("현재 %d / 임계 %d (부족 %d)",
                    currentQty, config.getThreshold(), config.getThreshold() - currentQty),
            List.of("MASTER", "MANAGER", "INVENTORY", "WAREHOUSE"),
            null,  // role 기반
            null,  // sourceService 자동 set
            config.getProductId() + (config.getWarehouseId() != null ? "+" + config.getWarehouseId() : ""),
            "/inventory/safety-stock-alerts"
    ));
}
```

- [ ] **Step 3: SafetyStockServiceTest 보강**

`@Mock NotificationPublisher notificationPublisher` 추가. `fireAlert` 분기에서 `verify(notificationPublisher).publish(...)` 검증.

신규 test:
```java
@Test
@DisplayName("checkAndNotify: 임계 미만 시 NotificationPublisher.publish 호출")
void checkAndNotify_belowThreshold_publishesNotification() {
    // setup
    SafetyStockConfig config = SafetyStockConfig.create(productId, warehouseId, 50, null);
    when(safetyStockConfigRepository.findByProductIdAndWarehouseId(productId, warehouseId))
            .thenReturn(Optional.of(config));
    when(safetyStockConfigRepository.findByProductIdAndWarehouseId(productId, null))
            .thenReturn(Optional.empty());
    when(stockBalanceRepository.findByProductIdAndWarehouse_IdAndIsDeletedFalse(
            productId, warehouseId))
            .thenReturn(Optional.of(mockBalance(20)));

    // act
    safetyStockService.checkAndNotify(productId, warehouseId);

    // assert
    verify(notificationPublisher).publish(any(NotificationPublishRequest.class));
}
```

- [ ] **Step 4: 컴파일 + test 검증**

Run: `./gradlew :services:inventory-service:test --tests SafetyStockServiceTest --no-daemon`
Expected: 14건 PASS (기존 13 + 신규 1)

- [ ] **Step 5: Commit**

```bash
git add services/inventory-service/
git commit -m "feat(notification-publisher): Slice 3 Task 2 — SafetyStockService.checkAndNotify → NotificationPublisher 통합"
```

---

## Task 3: groupware-service MessageService 통합

**Files:**
- Modify: `services/groupware-service/build.gradle` — `:shared:notification-publisher` 의존
- Modify: `services/groupware-service/src/main/java/com/samhanair/logis/groupware/service/MessageService.java`
- Modify: `services/groupware-service/src/test/java/com/samhanair/logis/groupware/service/MessageServiceTest.java`

- [ ] **Step 1: build.gradle 의존 추가**

`services/groupware-service/build.gradle`:
```gradle
implementation project(':shared:notification-publisher')
```

- [ ] **Step 2: MessageService.send 후 publish 호출**

기존 `send(MessageSendRequest req)` 메서드의 `Message msg = Message.send(...)` 저장 후 publish 호출.

field 추가:
```java
private final NotificationPublisher notificationPublisher;
```

send 메서드 끝:
```java
Message saved = messageRepository.save(msg);

// Slice 3 추가: 통합 알림 센터 발송
notificationPublisher.publish(new NotificationPublishRequest(
        "MESSENGER",
        NotificationSeverity.INFO,
        String.format("새 메시지 (%s)", req.senderId()),
        req.body().length() > 80 ? req.body().substring(0, 80) + "..." : req.body(),
        null,  // role 미적용
        req.recipientId(),  // 특정 사용자만
        null,  // sourceService 자동 set
        saved.getId().toString(),
        "/messenger"
));

return saved;
```

- [ ] **Step 3: MessageServiceTest 보강**

`@Mock NotificationPublisher notificationPublisher` 추가 + send 호출 후 publish 검증 test 1건.

- [ ] **Step 4: 검증**

Run: `./gradlew :services:groupware-service:test --tests MessageServiceTest --no-daemon`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/groupware-service/
git commit -m "feat(notification-publisher): Slice 3 Task 3 — MessageService.send → NotificationPublisher 통합"
```

---

## Task 4: PR 발행

- [ ] **Step 1: 전체 컴파일 + test**

Run: `./gradlew compileJava compileTestJava --no-daemon && ./gradlew :services:inventory-service:test :services:groupware-service:test :services:notification-service:test --no-daemon`
Expected: 모두 BUILD SUCCESSFUL

- [ ] **Step 2: Push + PR**

```bash
git push -u origin feat/issue-4-slice-3-notification-source-integration

gh pr create --title "[FEAT] Issue 4 Slice 3 — source services 통합 (SafetyStock + Messenger → NotificationPublisher)" \
  --body "..."
```

---

## Self-Review

### Spec coverage
- [x] shared NotificationPublisher (Task 1)
- [x] safety stock source publish (Task 2)
- [x] messenger source publish (Task 3)
- [x] fail-soft 정책 (NotificationPublisher.publish try/catch)
- [x] X-Internal-Token + X-User-Id/X-User-Role 헤더 첨부 (PR #297 cycle 1e 회귀 가드)
- [x] target_role List<String> + target_user_id UUID 정합 (XOR invariant 자동 충족 — safety=role, messenger=userId)

### Placeholder scan
0건

### Type consistency
- `NotificationPublishRequest` 시그니처 task 1-3 일관 (channel, severity, title, body, targetRole, targetUserId, sourceService, sourceRefId, deeplink)
- callerServiceName auto-injection 동작

### Scope
단일 Slice 3 — Source service 2개 (inventory + groupware). 다른 service (accounting/slip 등) 통합은 별도 Sprint (Slice 4+).
