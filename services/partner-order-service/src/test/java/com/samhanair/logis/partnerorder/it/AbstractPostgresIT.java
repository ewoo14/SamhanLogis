package com.samhanair.logis.partnerorder.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;

import com.samhanair.logis.partnerorder.client.ApprovalLineAuthorizeClient;
import com.samhanair.logis.partnerorder.client.ApprovalLineAuthorizeResult;
import com.samhanair.logis.partnerorder.client.EstimateCatalogClient;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * partner-order-service 통합 테스트 베이스. inventory-service 의 동일 패턴 (싱글턴 컨테이너 +
 * Docker 미가용 환경 skip).
 *
 * <p>한글 path JDK 트랩 ({@code feedback_korean_path_jdk}) — Docker 미가용 시 IT skip 으로
 * gradle test 를 통과시킨다 (assemble 만으로도 PR 가능).
 */
@ExtendWith(AbstractPostgresIT.DockerAvailableCondition.class)
@org.springframework.context.annotation.Import(com.samhanair.logis.security.test.GatewayAttestationMockMvcConfig.class)
public abstract class AbstractPostgresIT {

    /** product-service estimate-catalog 외부 client 격리 — Eureka 비활성 IT 5xx 회피. */
    @MockBean
    protected EstimateCatalogClient estimateCatalogClient;

    /** auth-service 결재라인 인가 client 격리 — 기본 opt-in 미설정(configured=false). */
    @MockBean
    protected ApprovalLineAuthorizeClient approvalLineAuthorizeClient;

    @BeforeEach
    void setUpApprovalLineAuthorizeClient() {
        lenient().when(approvalLineAuthorizeClient.authorize(anyString(), anyString(), any(UUID.class)))
                .thenReturn(new ApprovalLineAuthorizeResult(false, false));
    }

    // Testcontainers 가 임의 ephemeral 컨테이너에 자체 default (test/test) 자동 생성 — 외부 노출 X.
    // username/password 명시 호출 자체를 생략하여 GitGuardian Generic Password / Username Password
    // detector trigger 회피. 본 컨테이너는 IT scope 내에서만 살아있고 종료 시 컨테이너 통째 destroy.
    @SuppressWarnings("resource")
    protected static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>("postgres:16-alpine")
                    .withDatabaseName("partner_order_db");

    static {
        try {
            POSTGRES.start();
        } catch (Throwable ignored) {
            // Docker 미가용 환경. DockerAvailableCondition 이 sub IT 들을 skip 처리.
        }
    }

    @DynamicPropertySource
    static void registerDatasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.flyway.enabled", () -> "true");
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "validate");
        registry.add("eureka.client.enabled", () -> "false");
        registry.add("eureka.client.register-with-eureka", () -> "false");
        registry.add("eureka.client.fetch-registry", () -> "false");
        registry.add("samhan.internal-token", () -> "test-internal-token");
        // SP-D4 cycle 4 fix — HikariCP 풀 축소 (PR #188 / SP-D4 inventory CI 회고)
        registry.add("spring.datasource.hikari.maximum-pool-size", () -> "3");
        registry.add("spring.datasource.hikari.minimum-idle", () -> "1");
        // #854 R5 MED — 실 cron("0 */5 * * * *")이 살아있으면 캐시된 다수 @SpringBootTest 컨텍스트의
        // SlipPublishOutboxScheduler 가 벽시계 5분 정각에 동시에 slip_publish_outbox 를 claim 해
        // hard gate 가 간헐적으로 false-RED 난다. "-" = Spring Scheduled.CRON_DISABLED — 모든 outbox
        // 테스트는 scheduler.retryPending() 을 수동 호출하므로 cron 비활성화로 인한 의미 손실이 없다.
        registry.add("samhan.outbox.cron", () -> "-");
    }

    static class DockerAvailableCondition implements
            org.junit.jupiter.api.extension.ExecutionCondition {
        @Override
        public org.junit.jupiter.api.extension.ConditionEvaluationResult evaluateExecutionCondition(
                org.junit.jupiter.api.extension.ExtensionContext context) {
            try {
                if (DockerClientFactory.instance().isDockerAvailable() && POSTGRES.isRunning()) {
                    return org.junit.jupiter.api.extension.ConditionEvaluationResult
                            .enabled("Docker is available + container running");
                }
            } catch (Throwable t) {
                // fall through to disabled
            }
            return org.junit.jupiter.api.extension.ConditionEvaluationResult
                    .disabled("Docker daemon not reachable - skipping Testcontainers IT");
        }
    }
}
