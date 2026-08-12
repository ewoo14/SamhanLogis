package com.samhanair.logis.shared.audit.publisher;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;

import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import com.samhanair.logis.shared.audit.contract.AuditEnums;
import com.samhanair.logis.shared.audit.contract.AuditEventV2;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.rabbit.connection.CachingConnectionFactory;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.test.context.support.TestPropertySourceUtils;

class AuditPublisherFailureSoftTest {
    @Test
    void autoConfiguration_usesSpringRabbitConnectionFactoryAndJsonConverter() {
        try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext()) {
            context.registerBean(org.springframework.amqp.rabbit.connection.ConnectionFactory.class,
                    () -> new CachingConnectionFactory("127.0.0.1", 5672));
            context.registerBean(io.micrometer.core.instrument.MeterRegistry.class,
                    io.micrometer.core.instrument.simple.SimpleMeterRegistry::new);
            TestPropertySourceUtils.addInlinedPropertiesToEnvironment(context,
                    "samhan.audit.publisher.enabled=true");
            context.register(AuditPublisherAutoConfiguration.class);
            context.refresh();
            RabbitTemplate template = context.getBean(RabbitTemplate.class);
            assertThat(template.getConnectionFactory()).isInstanceOf(CachingConnectionFactory.class);
            assertThat(template.getMessageConverter()).isInstanceOf(
                    org.springframework.amqp.support.converter.Jackson2JsonMessageConverter.class);
        }
    }

    @Test
    void disabledPublisher_isVisibleInsteadOfSilentlyMissing() {
        try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext()) {
            context.registerBean(org.springframework.amqp.rabbit.connection.ConnectionFactory.class,
                    () -> new CachingConnectionFactory("127.0.0.1", 5672));
            context.registerBean(io.micrometer.core.instrument.MeterRegistry.class,
                    io.micrometer.core.instrument.simple.SimpleMeterRegistry::new);
            TestPropertySourceUtils.addInlinedPropertiesToEnvironment(context,
                    "samhan.audit.publisher.enabled=false");
            context.register(AuditPublisherAutoConfiguration.class);
            context.refresh();
            assertThat(context.getBean(AuditPublisher.class)).isNotNull();
        }
    }
    @Test
    void rabbitFailureNeverEscapesPublishCaller() throws Exception {
        RabbitTemplate rabbit = Mockito.mock(RabbitTemplate.class);
        doThrow(new IllegalStateException("rabbit down")).when(rabbit)
                .convertAndSend(any(String.class), any(String.class), any(Object.class));
        AuditPublisher publisher = new AuditPublisher(rabbit, new SimpleMeterRegistry());
        try {
            assertThatCode(() -> publisher.publish(AuditEventV2.authentication(
                    "partner-auth-service", true, "/login", "성공", "127.0.0.1", "test")))
                    .doesNotThrowAnyException();
            Thread.sleep(50L);
        } finally {
            publisher.close();
        }
    }

    @Test
    void uuidIsNeverUsedAsPresentationFallback() {
        String uuid = "550e8400-e29b-41d4-a716-446655440000";
        org.assertj.core.api.Assertions.assertThat(AuditSanitizer.display(uuid))
                .isEqualTo(AuditSanitizer.UNKNOWN_RESOURCE);
    }
}
