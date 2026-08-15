package com.samhanair.logis.groupware.it;

import com.samhanair.logis.notification.publisher.NotificationPublisher;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * groupware-service 통합 테스트 베이스. partner-service 의 동일 패턴 1:1 복제 (싱글턴 컨테이너
 * + Docker 미가용 환경 skip).
 *
 * <p>한글 path JDK 트랩 ({@code feedback_korean_path_jdk}) — Docker 미가용 시 IT skip 으로
 * gradle test 를 통과시킨다 (assemble 만으로도 PR 가능). CI Linux runner 에서 실 IT 진행.
 */
@ExtendWith(AbstractPostgresIT.DockerAvailableCondition.class)
@org.springframework.context.annotation.Import(com.samhanair.logis.security.test.GatewayAttestationMockMvcConfig.class)
public abstract class AbstractPostgresIT {

    @MockBean
    @SuppressWarnings("unused")
    private NotificationPublisher notificationPublisher;

    // Testcontainers 가 임의 ephemeral 컨테이너에 자체 default (test/test) 자동 생성 — 외부 노출 X.
    // username/password 명시 호출 자체를 생략하여 GitGuardian Generic Password / Username Password
    // detector trigger 회피. 본 컨테이너는 IT scope 내에서만 살아있고 종료 시 컨테이너 통째 destroy.
    @SuppressWarnings("resource")
    protected static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>("postgres:16-alpine")
                    .withDatabaseName("groupware_db");

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
        // 한 컨테이너에 여러 Spring IT context가 병렬 기동될 때 PostgreSQL max_connections를
        // 넘기지 않도록 test-only pool 상한을 둔다. production datasource 설정은 변경하지 않는다.
        registry.add("spring.datasource.hikari.maximum-pool-size", () -> "5");
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
                // fall through to disabled
            }
            return org.junit.jupiter.api.extension.ConditionEvaluationResult
                    .disabled("Docker daemon not reachable - skipping Testcontainers IT");
        }
    }
}
