package com.samhanair.logis.partnerauth.it;

import java.util.UUID;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * partner-auth-service 통합 테스트 베이스. Singleton-container 패턴
 * (product-service AbstractPostgresIT 와 동일 — PR #13 race condition 회고).
 *
 * <p>Docker 미가용 환경에서는 {@link DockerAvailableCondition} 이 IT 를 skip
 * (memory feedback_testcontainers_windows_docker.md).
 */
@ExtendWith(AbstractPostgresIT.DockerAvailableCondition.class)
@org.springframework.context.annotation.Import(com.samhanair.logis.security.test.GatewayAttestationMockMvcConfig.class)
public abstract class AbstractPostgresIT {

    /** 통합테스트 컨테이너 자격은 매 실행 임시값이다 — 소스에 고정 자격을 박지 않는다. */
    private static final String POSTGRES_PASSWORD = UUID.randomUUID().toString();

    @SuppressWarnings("resource")
    protected static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>("postgres:16-alpine")
                    .withDatabaseName("partner_auth_db")
                    .withUsername(UUID.randomUUID().toString())
                    .withPassword(POSTGRES_PASSWORD);

    static {
        try {
            POSTGRES.start();
        } catch (Throwable ignored) {
            // Docker 미가용. DockerAvailableCondition 이 sub IT 를 skip.
        }
    }

    @DynamicPropertySource
    static void registerDatasource(DynamicPropertyRegistry registry) {
        // 운영 application.yml의 필수 Rabbit/내부 자격은 테스트에서만 주입한다.
        registry.add("spring.rabbitmq.host", () -> "localhost");
        registry.add("spring.rabbitmq.username", () -> "ci-test-user");
        registry.add("spring.rabbitmq.password", () -> "ci-test-password");
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.flyway.enabled", () -> "true");
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "validate");
        registry.add("eureka.client.enabled", () -> "false");
        registry.add("eureka.client.register-with-eureka", () -> "false");
        registry.add("eureka.client.fetch-registry", () -> "false");
        registry.add("samhan.jwt.secret", () -> "test-only-secret-32bytes-minimum-key!!");
        registry.add("samhan.jwt.expiration-hours", () -> "8");
        registry.add("samhan.dc-config.internal-token", () -> "test-internal-token");
        registry.add("samhan.partner-activity.internal-token", () -> "test-internal-token");
        registry.add("app.security.internal.token", () -> "test-internal-token");
    }

    /** Docker 미가용 시 IT 를 fail 대신 skip. */
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
                // fall through
            }
            return org.junit.jupiter.api.extension.ConditionEvaluationResult
                    .disabled("Docker daemon not reachable - skipping Testcontainers IT");
        }
    }
}
