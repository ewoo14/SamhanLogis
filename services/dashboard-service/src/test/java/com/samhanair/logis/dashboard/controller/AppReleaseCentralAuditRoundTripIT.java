package com.samhanair.logis.dashboard.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.samhanair.logis.dashboard.domain.AppClientType;
import com.samhanair.logis.dashboard.domain.AppRelease;
import com.samhanair.logis.dashboard.domain.AppReleaseForceLevel;
import com.samhanair.logis.dashboard.service.AppReleaseService;
import com.samhanair.logis.shared.audit.contract.AuditEnums.AuditAction;
import com.samhanair.logis.shared.audit.contract.AuditEventV2;
import com.samhanair.logis.shared.audit.contract.AuditTopology;
import com.samhanair.logis.shared.audit.publisher.AuditPublisher;
import java.time.LocalDateTime;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.rabbit.connection.CachingConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.test.util.ReflectionTestUtils;
import org.testcontainers.containers.RabbitMQContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

@Testcontainers
class AppReleaseCentralAuditRoundTripIT {
    @Container
    static final RabbitMQContainer RABBIT = new RabbitMQContainer("rabbitmq:3.13-management-alpine");

    @Test
    void publishRouteDeliversEventToCentralRabbitPipeline() {
        CachingConnectionFactory connectionFactory = new CachingConnectionFactory(
                RABBIT.getHost(), RABBIT.getAmqpPort());
        RabbitTemplate template = new RabbitTemplate(connectionFactory);
        template.setMessageConverter(new Jackson2JsonMessageConverter());
        String queue = "dashboard-s2b-it-" + System.nanoTime();
        template.execute(channel -> {
            channel.exchangeDeclare(AuditTopology.EXCHANGE, "topic", true);
            channel.queueDeclare(queue, false, true, true, null);
            channel.queueBind(queue, AuditTopology.EXCHANGE, "audit.#");
            return null;
        });

        UUID id = UUID.randomUUID();
        AppRelease release = AppRelease.create(
                AppClientType.DESKTOP, "2026/08/14-1", AppReleaseForceLevel.MINOR,
                "release notes", LocalDateTime.of(2026, 8, 14, 9, 0), "2026/08/13-1");
        ReflectionTestUtils.setField(release, "id", id);
        AppReleaseService service = mock(AppReleaseService.class);
        when(service.publish(id)).thenReturn(release);
        AuditPublisher publisher = new AuditPublisher(template, new SimpleMeterRegistry(), true);
        AppReleaseController controller = new AppReleaseController(service, publisher);

        controller.publish(id, "actor-id");

        Object received = template.receiveAndConvert(queue, 10_000L);
        assertThat(received).isInstanceOf(AuditEventV2.class);
        AuditEventV2 event = (AuditEventV2) received;
        assertThat(event.serviceName()).isEqualTo("dashboard-service");
        assertThat(event.action()).isEqualTo(AuditAction.A_CHANGE);
        assertThat(event.routeTemplate()).isEqualTo("/app/releases/{id}/publish");
        assertThat(event.resourceId()).isEqualTo(id.toString());
        publisher.close();
        connectionFactory.destroy();
    }
}
