package com.samhanair.logis.user.it;

import java.util.UUID;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * user-service 통합 테스트의 베이스. <strong>싱글턴 컨테이너 패턴</strong> —
 * static 블록에서 한 번 start, JVM 종료 시 Testcontainers Ryuk 가 자동 stop.
 * 여러 IT 클래스가 같은 컨테이너 인스턴스를 공유한다.
 *
 * <p>{@code @Testcontainers} + {@code @Container} 패턴은 IT 클래스마다 별도 lifecycle 을
 * 관리하려 시도해 Spring Context 캐시 stale URL 문제를 일으킬 수 있다
 * (slip-service PR 사고 회고). 따라서 본 패턴은 {@code @Testcontainers} 사용 안 함.
 *
 * <p>Docker 데몬이 호스트에서 사용 불가하면 {@link DockerAvailableCondition} 이
 * 테스트를 fail 이 아닌 skip 으로 처리한다.
 */
@ExtendWith(AbstractPostgresIT.DockerAvailableCondition.class)
@org.springframework.context.annotation.Import(com.samhanair.logis.security.test.GatewayAttestationMockMvcConfig.class)
public abstract class AbstractPostgresIT {

    private static final String POSTGRES_PASSWORD = UUID.randomUUID().toString();

    @SuppressWarnings("resource")
    protected static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>("postgres:16-alpine")
                    .withDatabaseName("user_db")
                    .withUsername(UUID.randomUUID().toString())
                    .withPassword(POSTGRES_PASSWORD);

    static {
        try {
            POSTGRES.start();
        } catch (Throwable ignored) {
            // Docker 미가용 환경. DockerAvailableCondition 이 sub IT 들을 skip 처리.
        }
    }

    /**
     * Spring Context 로드 전 Testcontainers PostgreSQL JDBC URL 을 datasource 에 주입.
     *
     * <p>eureka 비활성화 + flyway 활성화 + ddl-auto=validate 로 Flyway migration 검증.
     * internal-token 은 테스트용 고정값 사용.
     */
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
        // SP-D4 cycle 4 fix — HikariCP 풀 축소 (PR #188 / SP-D4 inventory CI 회고)
        registry.add("spring.datasource.hikari.maximum-pool-size", () -> "3");
        registry.add("spring.datasource.hikari.minimum-idle", () -> "1");
    }

    /**
     * Docker 데몬 미접근 시 테스트를 build fail 대신 skip 처리.
     *
     * <p>{@code POSTGRES.isRunning()} 체크를 포함하여 컨테이너가 실제 실행 중인지 확인.
     */
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
