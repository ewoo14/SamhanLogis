package com.samhanair.logis.log.it;

import com.samhanair.logis.log.LoggingServiceApplication;
import com.samhanair.logis.log.repository.AuditLogRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.listener.RabbitListenerContainerFactory;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.TestPropertySource;

/**
 * logging-service Spring 컨텍스트 로드 통합 테스트 (audit-slice-3 P1-2).
 *
 * <p>Elasticsearch + RabbitMQ + Eureka 를 모두 비활성화한 상태에서
 * ApplicationContext 가 정상 기동하는지 검증한다.
 *
 * <p>logging-service 는 JPA 를 사용하지 않으므로 (audit sink = Elasticsearch)
 * DataSource / JPA autoconfig 도 exclude 한다 ({@code application.yml local} 프로필 참조).
 *
 * <p>{@code RabbitAutoConfiguration} exclude 시 {@link ConnectionFactory} bean 이 미등록되어
 * {@code @RabbitListener} 처리 BPP ({@code RabbitListenerAnnotationBeanPostProcessor}) 가
 * {@code SimpleRabbitListenerContainerFactory} 빌드 시 {@code NoSuchBeanDefinitionException}
 * 을 던지는 문제 (audit Slice B#4 결함 1).
 *
 * <p>Fix (권장 b): {@code @MockBean ConnectionFactory} + {@code @MockBean RabbitListenerContainerFactory}
 * 를 선언하여 실제 RabbitMQ 연결 없이 컨텍스트 기동 가능하도록 격리한다.
 * 컨텍스트 로드 검증만 목적이므로 실 Rabbit 통신과 무관하다.
 */
@SpringBootTest(
        classes = LoggingServiceApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.NONE
)
@TestPropertySource(properties = {
        "spring.profiles.active=local",
        "eureka.client.enabled=false",
        "eureka.client.register-with-eureka=false",
        "eureka.client.fetch-registry=false",
        "spring.rabbitmq.username=ci-test-user",
        "spring.rabbitmq.password=ci-test-password",
        // Elasticsearch + RabbitMQ autoconfig 비활성 (local 프로필 일관)
        "spring.autoconfigure.exclude=" +
                "org.springframework.boot.autoconfigure.elasticsearch.ElasticsearchRestClientAutoConfiguration," +
                "org.springframework.boot.autoconfigure.data.elasticsearch.ElasticsearchDataAutoConfiguration," +
                "org.springframework.boot.autoconfigure.data.elasticsearch.ElasticsearchRepositoriesAutoConfiguration," +
                "org.springframework.boot.autoconfigure.amqp.RabbitAutoConfiguration," +
                "org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration," +
                "org.springframework.boot.autoconfigure.orm.jpa.HibernateJpaAutoConfiguration," +
                "org.springframework.boot.autoconfigure.data.jpa.JpaRepositoriesAutoConfiguration"
})
class LoggingServiceContextLoadIT {

    /**
     * audit Slice B#4 결함 1 fix — {@code RabbitAutoConfiguration} exclude 후
     * {@code RabbitListenerAnnotationBeanPostProcessor} 가 요구하는 {@link ConnectionFactory} bean 격리.
     *
     * <p>{@code spring-boot-starter-amqp} 가 classpath 에 있으면 {@code @RabbitListener} 처리 BPP 가
     * 활성화되어 {@link ConnectionFactory} 를 주입받으려 한다. autoconfig exclude 시 해당 bean 이 없으므로
     * {@code NoSuchBeanDefinitionException} 이 발생한다. {@code @MockBean} 으로 격리하여 해결한다.
     */
    @MockBean
    private ConnectionFactory connectionFactory;

    /**
     * {@code RabbitListenerAnnotationBeanPostProcessor} 가 default container factory name
     * ({@code rabbitListenerContainerFactory}) 을 찾을 때 사용하는 bean.
     *
     * <p>{@code @MockBean} 으로 격리하여 실 RabbitMQ 없이 컨텍스트 기동 가능하도록 한다.
     */
    @MockBean
    @SuppressWarnings("rawtypes")
    private RabbitListenerContainerFactory rabbitListenerContainerFactory;

    /**
     * audit Slice B#4 cycle 2 fix — JpaRepositoriesAutoConfiguration exclude 후
     * {@link AuditLogRepository} (JPA) bean 미등록 → {@code AuditLogConsumer} 생성자 의존성 실패.
     *
     * <p>{@code @MockBean} 으로 격리하여 실 DB 없이 컨텍스트 기동 가능.
     */
    @MockBean
    private AuditLogRepository auditLogRepository;

    /**
     * ApplicationContext 가 예외 없이 기동되면 PASS.
     *
     * <p>Elasticsearch / RabbitMQ / Eureka 비활성 상태에서
     * RabbitConfig bean + AuditLogConsumer bean 이 정상 로드됨을 간접 검증.
     */
    @Test
    @DisplayName("logging-service Spring 컨텍스트 정상 로드 — ES+RabbitMQ+Eureka 비활성 (ConnectionFactory MockBean)")
    void contextLoads() {
        // ApplicationContext 기동 성공이 곧 PASS.
    }
}
