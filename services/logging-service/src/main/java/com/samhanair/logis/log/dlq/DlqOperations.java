package com.samhanair.logis.log.dlq;

import com.samhanair.logis.log.messaging.RabbitConfig;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.amqp.rabbit.core.RabbitAdmin;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Service;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;

/** 운영자가 DLQ를 확인하고 명시적으로 재처리/폐기하는 경계. */
@Service
@ConditionalOnBean({RabbitTemplate.class, RabbitAdmin.class})
public class DlqOperations {

    private static final String ATTEMPT_HEADER = "x-samhan-dlq-retry-count";
    private static final int MAX_REDELIVERIES = 3;

    private final RabbitTemplate rabbitTemplate;
    private final RabbitAdmin rabbitAdmin;

    public DlqOperations(RabbitTemplate rabbitTemplate, RabbitAdmin rabbitAdmin) {
        this.rabbitTemplate = rabbitTemplate;
        this.rabbitAdmin = rabbitAdmin;
    }

    /** DLQ 깊이와 운영자가 식별할 수 있는 기본 큐 상태를 반환한다. */
    public List<Map<String, Object>> inspect(int limit) {
        List<Message> messages = new ArrayList<>();
        List<Map<String, Object>> result = new ArrayList<>();
        for (int i = 0; i < Math.max(0, limit); i++) {
            Message message = rabbitTemplate.receive(RabbitConfig.DLQ);
            if (message == null) break;
            messages.add(message);
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("messageId", message.getMessageProperties().getMessageId());
            item.put("retryCount", attemptCount(message.getMessageProperties()));
            item.put("reason", message.getMessageProperties().getHeaders().get("x-exception-message"));
            item.put("maxRedeliveries", MAX_REDELIVERIES);
            result.add(item);
        }
        messages.forEach(this::restore);
        if (result.isEmpty()) {
            Map<String, Object> status = new LinkedHashMap<>();
            status.put("queue", RabbitConfig.DLQ);
            status.put("messageCount", rabbitAdmin.getQueueProperties(RabbitConfig.DLQ) == null
                    ? 0 : rabbitAdmin.getQueueProperties(RabbitConfig.DLQ).getOrDefault(QUEUE_MESSAGE_COUNT, 0));
            result.add(status);
        }
        return result;
    }

    /** ID가 일치하는 메시지만 원래 exchange로 한 번 재발행한다. */
    public boolean retry(String messageId) {
        Message message = take(messageId);
        if (message == null) return false;
        int attempts = attemptCount(message.getMessageProperties());
        if (attempts >= MAX_REDELIVERIES) {
            restore(message);
            return false;
        }
        MessageProperties properties = message.getMessageProperties();
        properties.setHeader(ATTEMPT_HEADER, attempts + 1);
        String routingKey = originalRoutingKey(properties);
        rabbitTemplate.send(RabbitConfig.EXCHANGE, routingKey, message);
        return true;
    }

    /** 운영자가 사유를 남기고 ID가 일치하는 메시지를 폐기한다. */
    public boolean discard(String messageId, String reason) {
        Message message = take(messageId);
        return message != null && reason != null && !reason.isBlank();
    }

    public int maxRedeliveries() { return MAX_REDELIVERIES; }

    @SuppressWarnings("unchecked")
    private static String originalRoutingKey(MessageProperties properties) {
        Object deaths = properties.getHeaders().get("x-death");
        if (deaths instanceof List<?> list && !list.isEmpty() && list.get(0) instanceof Map<?, ?> death) {
            Object routingKeys = death.get("routing-keys");
            if (routingKeys instanceof List<?> keys && !keys.isEmpty()) return String.valueOf(keys.get(0));
        }
        return "audit.change.retry";
    }

    private Message take(String messageId) {
        List<Message> skipped = new ArrayList<>();
        Message found = null;
        Message current;
        while ((current = rabbitTemplate.receive(RabbitConfig.DLQ)) != null) {
            String currentId = current.getMessageProperties().getMessageId();
            if (messageId.equals(currentId)) {
                found = current;
                break;
            }
            skipped.add(current);
        }
        skipped.forEach(this::restore);
        return found;
    }

    private void restore(Message message) {
        rabbitTemplate.send(RabbitConfig.DLX, RabbitConfig.DLQ_ROUTING_KEY, message);
    }

    private static int attemptCount(MessageProperties properties) {
        Object value = properties.getHeaders().get(ATTEMPT_HEADER);
        return value instanceof Number number ? number.intValue() : 0;
    }

    private static final String QUEUE_MESSAGE_COUNT = "QUEUE_MESSAGE_COUNT";
}
