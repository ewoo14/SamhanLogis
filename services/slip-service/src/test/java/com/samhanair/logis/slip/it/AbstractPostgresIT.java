package com.samhanair.logis.slip.it;

import org.junit.jupiter.api.extension.ExtendWith;
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
 * <p><b>외부 client @MockBean 선언 정책 (audit-slice-3 P1-5):</b><br>
 * 외부 RestClient ({@code PartnerInternalClient}, {@code ProductClient},
 * {@code InventoryClient}, {@code NotificationChatRoomClient}, {@code PartnerBlockClient},
 * {@code ReceiptOcrClient}, {@code UserInternalClient}, {@code WarehouseInternalClient},
 * {@code DynamicPermissionClient}, {@code ArologisDispatchClient} 등) 의 {@code @MockBean} 은
 * 각 IT 클래스가 개별 선언하는 방식을 유지한다 (SP-08-FU1/FU2 패턴 일관).
 *
 * <p>이유: 각 IT 의 {@code @MockBean} 조합이 다르면 Spring Context 캐시가 조합별로 분리되므로
 * AbstractPostgresIT 에서 공통 bean 을 선언하면 컨텍스트 캐시 히트율이 낮아질 수 있다.
 * 점진적 리팩터링은 SP-D6+ 슬라이스에서 검토한다.
 *
 * <p>단, lenient stub 은 {@code @BeforeEach setupLenientStubs()} 메서드에서 일관 설정하여
 * "UnnecessaryStubbingException" 을 방지한다 (Mockito strict stubbing 가드).
 */
@ExtendWith(AbstractPostgresIT.DockerAvailableCondition.class)
public abstract class AbstractPostgresIT {

    @SuppressWarnings("resource")
    protected static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>("postgres:16-alpine")
                    .withDatabaseName("slip_db")
                    .withUsername("samhan")
                    .withPassword("samhan_dev_pw");

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
        // ----------------------------------------------------------------
        // HikariCP 풀 크기 축소 — PR #188 CI fail 회고 (2026-05-14):
        //   다수의 IT 가 서로 다른 @MockBean / @WithMockUser / @TestPropertySource
        //   조합을 사용하면 Spring Context 캐시가 N 개 컨텍스트 × HikariPool 기본 10 conn
        //   = postgres max_connections(100) 초과 → "FATAL: sorry, too many clients already".
        //   IT 는 sequential 실행이므로 conn pool 작아도 무방.
        // ----------------------------------------------------------------
        registry.add("spring.datasource.hikari.maximum-pool-size", () -> "3");
        registry.add("spring.datasource.hikari.minimum-idle", () -> "1");
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
