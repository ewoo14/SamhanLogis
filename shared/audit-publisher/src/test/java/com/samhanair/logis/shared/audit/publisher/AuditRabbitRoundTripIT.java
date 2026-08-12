package com.samhanair.logis.shared.audit.publisher;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.testcontainers.containers.RabbitMQContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.samhanair.logis.shared.audit.contract.AuditEventV2;
import com.samhanair.logis.shared.audit.contract.AuditTopology;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.rabbit.connection.CachingConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;

@Testcontainers
class AuditRabbitRoundTripIT {
    @Container
    static final RabbitMQContainer RABBIT = new RabbitMQContainer("rabbitmq:3.13-management-alpine");

    @Test
    void isolatedRabbitReceivesPublishedAuditEvent() throws Exception {
        CachingConnectionFactory connectionFactory = new CachingConnectionFactory(RABBIT.getHost(), RABBIT.getAmqpPort());
        connectionFactory.setUsername("guest");
        connectionFactory.setPassword("guest");
        RabbitTemplate template = new RabbitTemplate(connectionFactory);
        template.setMessageConverter(new Jackson2JsonMessageConverter());
        String queue = "s2a-it-" + System.nanoTime();
        template.execute(channel -> {
            channel.exchangeDeclare(AuditTopology.EXCHANGE, "topic", true);
            channel.queueDeclare(queue, false, true, true, null);
            channel.queueBind(queue, AuditTopology.EXCHANGE, "audit.#");
            return null;
        });
        AuditPublisher publisher = new AuditPublisher(template, new SimpleMeterRegistry(), true);
        publisher.publish(AuditEventV2.authentication(
                "partner-auth-service", false, "/api/v1/auth/partner-login", "실패", "127.0.0.1", "it"));

        var received = template.receiveAndConvert(queue, 10_000L);
        assertThat(received).isInstanceOf(AuditEventV2.class);
        assertThat(((AuditEventV2) received).serviceName()).isEqualTo("partner-auth-service");
        assertThat(((AuditEventV2) received).action()).isEqualTo(
                com.samhanair.logis.shared.audit.contract.AuditEnums.AuditAction.B_FAILURE);
        publisher.close();
        connectionFactory.destroy();
    }
}
