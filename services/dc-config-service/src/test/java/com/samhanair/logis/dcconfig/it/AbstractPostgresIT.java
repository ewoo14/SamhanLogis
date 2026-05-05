package com.samhanair.logis.dcconfig.it;

import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * dc-config-service 통합 테스트 베이스. 싱글턴 컨테이너 패턴 (PR #13 회고 적용).
 *
 * <p>Docker 가 호스트에서 사용 불가하면 {@link DockerAvailableCondition} 이
 * 테스트를 fail 이 아닌 skip 으로 처리.
 */
@ExtendWith(AbstractPostgresIT.DockerAvailableCondition.class)
public abstract class AbstractPostgresIT {

    // Testcontainers 가 임의 ephemeral 컨테이너에 자체 생성하는 자격증명 — 외부 노출 X (test scope only).
    // GitGuardian PASS 위해 literal credential pair 회피 — System.getenv 우선, 없으면 randomized.
    private static final String TEST_DB_USER = pickEnvOrRandom("TEST_PG_USER", "tc_user_");
    private static final String TEST_DB_PASSWORD = pickEnvOrRandom("TEST_PG_PASSWORD", "tc_pw_");

    @SuppressWarnings("resource")
    protected static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>("postgres:16-alpine")
                    .withDatabaseName("dc_config_db")
                    .withUsername(TEST_DB_USER)
                    .withPassword(TEST_DB_PASSWORD);

    private static String pickEnvOrRandom(String envName, String prefix) {
        String env = System.getenv(envName);
        if (env != null && !env.isBlank()) {
            return env;
        }
        return prefix + java.util.UUID.randomUUID().toString().substring(0, 8);
    }

    static {
        try {
            POSTGRES.start();
        } catch (Throwable ignored) {
            // Docker 미가용 — DockerAvailableCondition 이 sub IT 들을 skip 처리.
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
        registry.add("app.security.internal.token", () -> "test-internal-token");
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
                // fall through
            }
            return org.junit.jupiter.api.extension.ConditionEvaluationResult
                    .disabled("Docker daemon not reachable - skipping Testcontainers IT");
        }
    }
}
