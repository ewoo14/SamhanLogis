package com.samhanair.logis.slip.it;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;

import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.slip.client.ApprovalLineAuthorizeClient;
import com.samhanair.logis.slip.client.ApprovalLineAuthorizeResult;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * slip-service 통합 테스트의 베이스. **싱글턴 컨테이너 패턴** —
 * static 블록에서 한 번 start, JVM 종료 시 Testcontainers Ryuk 가 자동 stop.
 * 여러 IT 클래스가 같은 컨테이너 인스턴스를 공유한다.
 *
 * <p>{@code @Testcontainers} + {@code @Container} 패턴은 IT 클래스마다 별도 lifecycle 을
 * 관리하려 시도해 race condition / Spring Context 캐시 stale URL 문제를 일으킨다
 * (product-service PR #13 사고 — 메모리 {@code feedback_pm_integration_build_check.md}).
 * 따라서 본 패턴은 {@code @Testcontainers} 사용 안 함.
 *
 * <p>Docker 데몬이 호스트에서 사용 불가하면 {@link DockerAvailableCondition} 이
 * 테스트를 fail 이 아닌 skip 으로 처리한다.
 *
 * <p>SP-D6-6: {@code @RequirePermission} 이 모든 사용자-facing mutation 에 적용되므로
 * {@code DynamicPermissionClient} 는 공통 {@code @MockBean} 으로 제공한다. 기본값은 기존
 * role guard 회귀를 피하기 위해 lenient allow 이며, 403 검증 케이스는 요청 직전 명시적으로
 * false stub 을 둔다.
 */
@ExtendWith(AbstractPostgresIT.DockerAvailableCondition.class)
public abstract class AbstractPostgresIT {

    @MockBean
    protected DynamicPermissionClient dynamicPermissionClient;

    @MockBean
    protected ApprovalLineAuthorizeClient approvalLineAuthorizeClient;

    @BeforeEach
    void setUpDynamicPermissionClient() {
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.check(any(UUID.class), anyString(), any(PermissionAction.class)))
                .thenReturn(true);
        lenient().when(approvalLineAuthorizeClient.authorize(anyString(), anyString(), any(UUID.class)))
                .thenReturn(new ApprovalLineAuthorizeResult(false, false));
    }

    @SuppressWarnings("resource")
    protected static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>("postgres:16-alpine")
                    .withDatabaseName("slip_db")
                    .withUsername("samhan")
                    .withPassword("samhan_dev_pw");

    @SuppressWarnings("resource")
    protected static final PostgreSQLContainer<?> INVENTORY_POSTGRES =
            new PostgreSQLContainer<>("postgres:16-alpine")
                    .withDatabaseName("inventory_db")
                    .withUsername("samhan")
                    .withPassword("samhan_dev_pw")
                    .withInitScript("db/inventory-warehouse-master.sql");

    static {
        try {
            POSTGRES.start();
            INVENTORY_POSTGRES.start();
        } catch (Throwable ignored) {
            // Docker 미가용 환경. DockerAvailableCondition 이 sub IT 들을 skip 처리.
        }
    }

    @DynamicPropertySource
    static void registerDatasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("app.publish.warehouse-validation.jdbc-url", INVENTORY_POSTGRES::getJdbcUrl);
        registry.add("app.publish.warehouse-validation.username", INVENTORY_POSTGRES::getUsername);
        registry.add("app.publish.warehouse-validation.password", INVENTORY_POSTGRES::getPassword);
        registry.add("spring.flyway.enabled", () -> "true");
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "validate");
        registry.add("eureka.client.enabled", () -> "false");
        registry.add("eureka.client.register-with-eureka", () -> "false");
        registry.add("eureka.client.fetch-registry", () -> "false");
        registry.add("app.security.internal.token", () -> "test-internal-token");
        // ----------------------------------------------------------------
        // HikariCP 풀 크기 축소 — PR #188 CI fail 회고 (2026-05-14):
        //   다수의 IT 가 서로 다른 @MockBean / @WithMockUser / @TestPropertySource
        //   조합을 사용하면 Spring Context 캐시가 N 개 컨텍스트 × HikariPool 기본 10 conn
        //   = postgres max_connections(100) 초과 → "FATAL: sorry, too many clients already".
        //   IT 는 sequential 실행이므로 conn pool 작아도 무방.
        // ----------------------------------------------------------------
        registry.add("spring.datasource.hikari.maximum-pool-size", () -> "3");
        registry.add("spring.datasource.hikari.minimum-idle", () -> "1");
        // ----------------------------------------------------------------
        // #809 D-R8-2 — 가격기억 전용 pool 도 같은 이유로 축소한다. 운영 기본 4 를 그대로 두면
        // 캐시된 컨텍스트 N 개 × (메인 3 + 전용 4) 가 컨테이너 max_connections 를 압박한다.
        // minimum-idle 0 = 유휴 컨텍스트가 커넥션을 점유하지 않음 (IT 는 sequential 실행).
        // ----------------------------------------------------------------
        registry.add("app.slip.price-memory.datasource.hikari.maximum-pool-size", () -> "2");
        registry.add("app.slip.price-memory.datasource.hikari.minimum-idle", () -> "0");
    }

    /** Docker 데몬 미접근 시 테스트를 build fail 대신 skip 처리. */
    static class DockerAvailableCondition implements
            org.junit.jupiter.api.extension.ExecutionCondition {
        @Override
        public org.junit.jupiter.api.extension.ConditionEvaluationResult evaluateExecutionCondition(
                org.junit.jupiter.api.extension.ExtensionContext context) {
            try {
                if (DockerClientFactory.instance().isDockerAvailable()
                        && POSTGRES.isRunning() && INVENTORY_POSTGRES.isRunning()) {
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
