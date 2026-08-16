package com.samhanair.logis.accounting.it;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * accounting-service 통합 테스트의 베이스. **싱글턴 컨테이너 패턴** —
 * static 블록에서 한 번 start, JVM 종료 시 Testcontainers Ryuk 가 자동 stop.
 *
 * <p>Docker 데몬 미가용 시 {@link DockerAvailableCondition} 이 테스트를 fail 이 아닌 skip 처리.
 * (slip-service AbstractPostgresIT 답습 — 메모리 {@code feedback_testcontainers_windows_docker.md})
 */
@ExtendWith(AbstractPostgresIT.DockerAvailableCondition.class)
@org.springframework.context.annotation.Import(com.samhanair.logis.security.test.GatewayAttestationMockMvcConfig.class)
public abstract class AbstractPostgresIT {

    @Autowired
    protected DynamicPermissionClient dynamicPermissionClient;

    private static final String POSTGRES_PASSWORD = UUID.randomUUID().toString();

    @SuppressWarnings("resource")
    protected static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>("postgres:16-alpine")
                    .withDatabaseName("accounting_db")
                    .withUsername(UUID.randomUUID().toString())
                    .withPassword(POSTGRES_PASSWORD);

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
        registry.add("app.security.internal.token", () -> "test-internal-token");
        // MIG-3 사이클 3 — Testcontainers PostgreSQL 단일 컨테이너 reuse 환경에서
        // ApplicationContext 다수 (29+ IT) 가 connection pool 누적 → max_connections 초과 방지.
        // HikariCP maximumPoolSize=5 로 제한하여 CI 의 PSQLException at ConnectionFactoryImpl:711 회귀 차단.
        // PostgreSQL 단일 Testcontainers reuse 가정 — test parallelism 도입 시 connection 부족 회귀 가능, 재검토 필요 (사후 재점검 회고).
        registry.add("spring.datasource.hikari.maximum-pool-size", () -> "5");
        registry.add("spring.datasource.hikari.minimum-idle", () -> "1");
        registry.add("spring.datasource.hikari.connection-timeout", () -> "20000");
    }

    @BeforeEach
    void setUpDynamicPermissionDefaults() {
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.check(any(UUID.class), anyString(), any(PermissionAction.class)))
                .thenReturn(true);
    }

    protected void denyDynamicPermissionFor(String role) {
        lenient().when(dynamicPermissionClient.canView(eq(role), anyString())).thenReturn(false);
        lenient().when(dynamicPermissionClient.canEdit(eq(role), anyString())).thenReturn(false);
    }

    protected void denyRequirePermission(String pageCode, PermissionAction action) {
        when(dynamicPermissionClient.check(any(UUID.class), eq(pageCode), eq(action))).thenReturn(false);
    }

    /** Docker 데몬 미접근 시 테스트를 build fail 대신 skip 처리. */
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
