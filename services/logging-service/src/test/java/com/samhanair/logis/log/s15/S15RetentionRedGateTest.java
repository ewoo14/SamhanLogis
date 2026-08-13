package com.samhanair.logis.log.s15;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.log.messaging.RabbitConfig;
import com.samhanair.logis.log.messaging.RabbitRetentionPolicyInitializer;
import java.lang.reflect.Field;
import java.util.Map;
import java.time.Duration;
import java.lang.reflect.Method;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.RabbitMQContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.springframework.amqp.rabbit.connection.CachingConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitAdmin;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.web.client.RestTemplate;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import java.net.URI;
import org.springframework.test.web.client.MockRestServiceServer;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.http.HttpMethod.PUT;
import org.springframework.amqp.core.Queue;

/**
 * S1.5 RED gate.
 *
 * <p>보존 등급이 ES 문서에 남고, Rabbit topology 가 설정 가능한 상한/TTL을 가지며,
 * DLQ 운영 명령과 재처리 횟수 상한이 존재해야 한다. 이 테스트는 구현 전 실패를
 * 기록하기 위한 것이며, topology 회귀는 격리 Testcontainers에서 검증한다.
 */
@Testcontainers
class S15RetentionRedGateTest {

    @Container
    static final RabbitMQContainer RABBIT = new RabbitMQContainer("rabbitmq:3.13-management-alpine");

    @Test
    void auditQueue_hasBoundedRetentionAndDeadLetterArguments() throws Exception {
        Method auditQueue = RabbitConfig.class.getDeclaredMethod("auditQueue");
        auditQueue.setAccessible(true);
        Queue queue = (Queue) auditQueue.invoke(new RabbitConfig());

        assertThat(queue.getArguments())
                .containsKeys("x-dead-letter-exchange", "x-dead-letter-routing-key")
                .doesNotContainKeys("x-max-length", "x-message-ttl");
    }

    @Test
    void retentionPolicy_appliesTtlAndMaxLengthWithoutQueueRedeclarationArguments() {
        RestTemplate restTemplate = new RestTemplate();
        MockRestServiceServer server = MockRestServiceServer.bindTo(restTemplate).build();
        server.expect(requestTo("http://rabbit:15672/api/policies/%2F/samhan-audit-retention"))
                .andExpect(method(PUT))
                .andExpect(content().string(org.hamcrest.Matchers.allOf(
                        org.hamcrest.Matchers.containsString("message-ttl"),
                        org.hamcrest.Matchers.containsString("86400000"),
                        org.hamcrest.Matchers.containsString("max-length"),
                        org.hamcrest.Matchers.containsString("10000"))))
                .andRespond(withSuccess());

        new RabbitRetentionPolicyInitializer(restTemplate, "http://rabbit:15672", "samhan",
                "secret", 10000L, 86400000L).applyRetentionPolicy();
        server.verify();
    }

    @Test
    void existingQueueWithoutRetentionArguments_acceptsLoggingTopologyUpgrade() throws Exception {
        CachingConnectionFactory connectionFactory = new CachingConnectionFactory(
                RABBIT.getHost(), RABBIT.getAmqpPort());
        connectionFactory.setUsername("guest");
        connectionFactory.setPassword("guest");
        RabbitAdmin admin = new RabbitAdmin(connectionFactory);
        RabbitTemplate template = new RabbitTemplate(connectionFactory);
        template.execute(channel -> {
            channel.exchangeDeclare(RabbitConfig.DLX, "topic", true);
            channel.queueDeclare(RabbitConfig.QUEUE, true, false, false, Map.of(
                    "x-dead-letter-exchange", RabbitConfig.DLX,
                    "x-dead-letter-routing-key", RabbitConfig.DLQ_ROUTING_KEY));
            return null;
        });

        Method auditQueue = RabbitConfig.class.getDeclaredMethod("auditQueue");
        auditQueue.setAccessible(true);
        Queue declaredQueue = (Queue) auditQueue.invoke(new RabbitConfig());
        org.assertj.core.api.Assertions.assertThatCode(() -> admin.declareQueue(
                declaredQueue)).doesNotThrowAnyException();

        String managementUrl = "http://" + RABBIT.getHost() + ":" + RABBIT.getMappedPort(15672);
        new RabbitRetentionPolicyInitializer(new RestTemplate(), managementUrl, "guest", "guest",
                10000L, 86400000L).applyRetentionPolicy();
        HttpHeaders headers = new HttpHeaders();
        headers.setBasicAuth("guest", "guest");
        String policyDetails = new RestTemplate().exchange(
                URI.create(managementUrl + "/api/policies/%2F/" + RabbitRetentionPolicyInitializer.POLICY_NAME),
                HttpMethod.GET, new HttpEntity<>(headers), String.class).getBody();
        assertThat(policyDetails).contains("message-ttl", "max-length", "86400000", "10000");
        connectionFactory.destroy();
    }

    @Test
    void auditDocument_preservesRetentionClassAndOutcomeMetadata() throws Exception {
        Field retentionClass = Class.forName("com.samhanair.logis.log.domain.AuditLog")
                .getDeclaredField("retentionClass");
        Field outcome = Class.forName("com.samhanair.logis.log.domain.AuditLog")
                .getDeclaredField("outcome");

        assertThat(retentionClass.getType().getName())
                .isEqualTo("com.samhanair.logis.shared.audit.contract.AuditEnums$RetentionClass");
        assertThat(outcome.getType().getName())
                .isEqualTo("com.samhanair.logis.shared.audit.contract.AuditEnums$Outcome");
    }

    @Test
    void retentionPolicy_isConfigurationBacked_notHardCodedInDomain() throws Exception {
        Class<?> policy = Class.forName("com.samhanair.logis.log.retention.AuditRetentionProperties");

        assertThat(policy.isAnnotationPresent(
                org.springframework.boot.context.properties.ConfigurationProperties.class))
                .as("retention periods must be changed in one configuration location")
                .isTrue();
        assertThat(policy.getDeclaredMethod("getChangeRetention").getReturnType())
                .isEqualTo(Duration.class);
        assertThat(policy.getDeclaredMethod("getFailureRetention").getReturnType())
                .isEqualTo(Duration.class);
        assertThat(policy.getDeclaredMethod("getReadRetention").getReturnType())
                .isEqualTo(Duration.class);
    }

    @Test
    void dlqOperations_areExplicitAndRedeliveryIsBounded() throws Exception {
        Class<?> operations = Class.forName("com.samhanair.logis.log.dlq.DlqOperations");

        assertThat(operations.getDeclaredMethod("inspect", int.class)).isNotNull();
        assertThat(operations.getDeclaredMethod("retry", String.class)).isNotNull();
        assertThat(operations.getDeclaredMethod("discard", String.class, String.class)).isNotNull();
        assertThat(operations.getDeclaredMethod("maxRedeliveries").getReturnType())
                .isEqualTo(int.class);
    }
}
