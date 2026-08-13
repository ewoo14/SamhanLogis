package com.samhanair.logis.log.s15;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.log.messaging.RabbitConfig;
import java.lang.reflect.Field;
import java.time.Duration;
import java.lang.reflect.Method;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.core.Queue;

/**
 * S1.5 RED gate.
 *
 * <p>보존 등급이 ES 문서에 남고, Rabbit topology 가 설정 가능한 상한/TTL을 가지며,
 * DLQ 운영 명령과 재처리 횟수 상한이 존재해야 한다. 이 테스트는 구현 전 실패를
 * 기록하기 위한 것이며, Testcontainers를 사용하지 않는다.
 */
class S15RetentionRedGateTest {

    @Test
    void auditQueue_hasBoundedRetentionAndDeadLetterArguments() throws Exception {
        Method auditQueue = RabbitConfig.class.getDeclaredMethod("auditQueue");
        auditQueue.setAccessible(true);
        Queue queue = (Queue) auditQueue.invoke(new RabbitConfig());

        assertThat(queue.getArguments())
                .containsKeys("x-max-length", "x-message-ttl", "x-dead-letter-exchange",
                        "x-dead-letter-routing-key");
        assertThat(queue.getArguments().get("x-max-length")).isInstanceOf(Number.class);
        assertThat(queue.getArguments().get("x-message-ttl")).isInstanceOf(Number.class);
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
