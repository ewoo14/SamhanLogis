package com.samhanair.logis.log.dlq;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.samhanair.logis.log.messaging.RabbitConfig;
import java.util.Properties;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.rabbit.core.RabbitAdmin;
import org.springframework.amqp.rabbit.core.RabbitTemplate;

class DlqOperationsTest {

    @Test
    void inspect_emptyDlq_returnsNormalStatusWhenQueuePropertiesChangesDuringProbe() {
        RabbitTemplate template = mock(RabbitTemplate.class);
        RabbitAdmin admin = mock(RabbitAdmin.class);
        when(template.receive(RabbitConfig.DLQ)).thenReturn(null);
        when(admin.getQueueProperties(RabbitConfig.DLQ))
                .thenReturn(properties(0))
                .thenReturn(null);

        var result = new DlqOperations(template, admin).inspect(20);

        assertThat(result).hasSize(1);
        assertThat(result.get(0)).containsEntry("queue", RabbitConfig.DLQ)
                .containsEntry("messageCount", 0);
    }

    @Test
    void inspect_withMessage_restoresMessageAndKeepsOperationalMetadata() {
        RabbitTemplate template = mock(RabbitTemplate.class);
        RabbitAdmin admin = mock(RabbitAdmin.class);
        var message = new org.springframework.amqp.core.Message(
                "payload".getBytes(),
                new org.springframework.amqp.core.MessageProperties());
        message.getMessageProperties().setMessageId("qa-message-1");
        when(template.receive(RabbitConfig.DLQ)).thenReturn(message).thenReturn(null);
        when(admin.getQueueProperties(RabbitConfig.DLQ)).thenReturn(new Properties());

        var result = new DlqOperations(template, admin).inspect(20);

        assertThat(result).hasSize(1);
        assertThat(result.get(0)).containsEntry("messageId", "qa-message-1")
                .containsEntry("retryCount", 0)
                .containsEntry("maxRedeliveries", 3);
        org.mockito.Mockito.verify(template).send(RabbitConfig.DLX, RabbitConfig.DLQ_ROUTING_KEY, message);
    }

    private static Properties properties(int messageCount) {
        Properties properties = new Properties();
        properties.put("QUEUE_MESSAGE_COUNT", messageCount);
        return properties;
    }
}
