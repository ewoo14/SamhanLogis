package com.samhanair.logis.log.it;

import com.samhanair.logis.log.LoggingServiceApplication;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
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
 * <p>Kafka consumer config 대신 RabbitMQ listener 를 보유하므로,
 * RabbitMQ autoconfig 비활성으로 컨텍스트 기동 가능 여부를 검증한다.
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
     * ApplicationContext 가 예외 없이 기동되면 PASS.
     *
     * <p>Elasticsearch / RabbitMQ / Eureka 비활성 상태에서
     * RabbitConfig bean + AuditLogConsumer bean 이 정상 로드됨을 간접 검증.
     */
    @Test
    @DisplayName("logging-service Spring 컨텍스트 정상 로드 — ES+RabbitMQ+Eureka 비활성")
    void contextLoads() {
        // ApplicationContext 기동 성공이 곧 PASS.
    }
}
