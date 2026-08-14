package com.samhanair.logis.arologis.it;

import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.context.annotation.Import;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * arologis-service 통합 테스트 베이스 — Phase 10 W10-1.
 *
 * <p>dashboard-service AbstractPostgresIT 1:1 복제 (싱글턴 컨테이너 + Docker 미가용 환경 skip).
 * 한글 path JDK 트랩 회피 — Docker 미가용 시 IT skip.
 */
@ExtendWith(AbstractPostgresIT.DockerAvailableCondition.class)
@Import(GatewayAttestationMockMvcConfig.class)
public abstract class AbstractPostgresIT {

    @SuppressWarnings("resource")
    protected static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>("postgres:16-alpine")
                    .withDatabaseName("arologis_db");

    static {
        try {
            POSTGRES.start();
        } catch (Throwable ignored) {
            // Docker 미가용 환경. DockerAvailableCondition 이 sub IT 들을 skip.
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
        registry.add("samhan.security.gateway-attestation", () -> GatewayAttestationMockMvcConfig.ATTESTATION);
        registry.add("samhan.arologis.client.skeleton-mode", () -> "true");
        // SP-D4 cycle 4 fix — HikariCP 풀 축소 (PR #188 / SP-D4 inventory CI 회고)
        registry.add("spring.datasource.hikari.maximum-pool-size", () -> "3");
        registry.add("spring.datasource.hikari.minimum-idle", () -> "1");
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
