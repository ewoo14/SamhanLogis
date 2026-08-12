package com.samhanair.logis.shared.audit.publisher;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.testcontainers.containers.RabbitMQContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.samhanair.logis.shared.audit.contract.AuditEventV2;
import com.samhanair.logis.shared.audit.contract.AuditTopology;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.springframework.amqp.rabbit.connection.CachingConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;

@Testcontainers
class AuditRabbitRoundTripIT {
    @Container
    static final RabbitMQContainer RABBIT = new RabbitMQContainer("rabbitmq:3.13-management-alpine");

    @Test
    void isolatedRabbitReceivesBothPilotEventsAfterPublisherRoundTrip() throws Exception {
        CachingConnectionFactory connectionFactory = new CachingConnectionFactory(RABBIT.getHost(), RABBIT.getAmqpPort());
        connectionFactory.setUsername("guest");
        connectionFactory.setPassword("guest");
        RabbitTemplate template = new AuditPublisherAutoConfiguration()
                .auditRabbitTemplate(connectionFactory, new Jackson2JsonMessageConverter());
        String queue = "s2a-it-" + System.nanoTime();
        template.execute(channel -> {
            channel.exchangeDeclare(AuditTopology.EXCHANGE, "topic", true);
            channel.queueDeclare(queue, false, false, false, null);
            channel.queueBind(queue, AuditTopology.EXCHANGE, "audit.#");
            return null;
        });
        AuditPublisher publisher = new AuditPublisher(template, new SimpleMeterRegistry());
        publisher.publish(AuditEventV2.mutation(
                "dc-config-service", "PATCH", "/api/v1/partners/{partnerCode}/dc-config",
                "관리자", "DC_CONFIG", "SOL-P-001", null, "거래처 DC 설정 변경", java.util.Map.of("homeMultiDc", "49%")));
        publisher.publish(AuditEventV2.authentication(
                "partner-auth-service", false, "/api/v1/auth/partner-login", "실패", "127.0.0.1", null));

        try {
            var first = template.receiveAndConvert(queue, 10_000L);
            var second = template.receiveAndConvert(queue, 10_000L);
            assertThat(java.util.List.of(first, second)).extracting(Object::getClass)
                    .containsOnly(AuditEventV2.class);
            assertThat(java.util.List.of(first, second)).extracting(value -> ((AuditEventV2) value).serviceName())
                    .containsExactlyInAnyOrder("dc-config-service", "partner-auth-service");
        } finally {
            publisher.close();
            connectionFactory.destroy();
        }
    }
}
