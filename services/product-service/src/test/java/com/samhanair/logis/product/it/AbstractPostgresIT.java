package com.samhanair.logis.product.it;

import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.service.ClassificationService;
import com.samhanair.logis.product.service.ProductService;
import com.samhanair.logis.product.quantitysync.QuantitySyncRuleTestCatalog;
import org.springframework.beans.factory.annotation.Autowired;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * product-service 통합 테스트의 베이스. **싱글턴 컨테이너 패턴**:
 * static block 에서 한 번 start 하고 JVM 종료 시 자동 stop (Testcontainers Ryuk).
 * 여러 IT 클래스가 abstract base 의 같은 컨테이너 인스턴스를 공유한다.
 *
 * <p>JUnit 의 {@code @Testcontainers} + {@code @Container} 패턴은 IT 클래스마다
 * 별도 lifecycle 을 관리하려 시도해 race condition / Spring Context 캐시 stale URL
 * 문제를 일으킨다 (PR #13 2차 CI 의 RepositoryIT 4건 connection refused 사고).
 * 따라서 본 패턴은 {@code @Testcontainers} 사용 안 함.
 *
 * <p>Docker 가 호스트에서 사용 불가하면 {@link DockerAvailableCondition} 이
 * 테스트를 fail 이 아닌 skip 으로 처리한다.
 */
@ExtendWith(AbstractPostgresIT.DockerAvailableCondition.class)
public abstract class AbstractPostgresIT {

    @Autowired
    protected ClassificationService quantitySyncClassificationService;

    @Autowired
    protected ProductService quantitySyncProductService;

    @SuppressWarnings("resource")
    protected static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>("postgres:16-alpine")
                    .withDatabaseName("product_db")
                    .withUsername("samhan")
                    .withPassword("samhan_dev_pw");

    /** 통합 fixture가 target 역할을 관리자 분류 경로로 구성한다. */
    protected final void classifyQuantitySyncTarget(String modelCode) {
        classifyQuantitySyncTarget(modelCode, EstimateCategory.HOME_MULTI);
    }

    /** 지정한 견적 카테고리의 부자재 분류를 관리자 서비스 경로로 지정한다. */
    protected final void classifyQuantitySyncTarget(String modelCode, EstimateCategory estimateCategory) {
        QuantitySyncRuleTestCatalog.classifyAsMaterial(quantitySyncProductService, modelCode,
                QuantitySyncRuleTestCatalog.ensureMaterialClassification(quantitySyncClassificationService,
                        estimateCategory));
    }

    static {
        try {
            POSTGRES.start();
            // JVM shutdown 시 Testcontainers Ryuk 가 자동 stop. stop() 명시 호출 불필요.
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
        // SP-D4 cycle 4 fix — HikariCP 풀 축소 (PR #188 / SP-D4 inventory CI 회고)
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
