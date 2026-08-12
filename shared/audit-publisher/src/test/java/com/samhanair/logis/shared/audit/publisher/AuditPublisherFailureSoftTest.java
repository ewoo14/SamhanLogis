package com.samhanair.logis.shared.audit.publisher;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;

import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import com.samhanair.logis.shared.audit.contract.AuditEnums;
import com.samhanair.logis.shared.audit.contract.AuditEventV2;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.springframework.amqp.rabbit.core.RabbitTemplate;

class AuditPublisherFailureSoftTest {
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
