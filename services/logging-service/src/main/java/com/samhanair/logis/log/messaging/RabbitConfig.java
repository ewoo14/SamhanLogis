package com.samhanair.logis.log.messaging;

import java.util.Map;

import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.amqp.support.converter.MessageConverter;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.config.SimpleRabbitListenerContainerFactory;
import org.springframework.amqp.rabbit.config.RetryInterceptorBuilder;
import org.springframework.amqp.rabbit.retry.RejectAndDontRequeueRecoverer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.annotation.Value;

/**
 * RabbitMQ topology for audit logs.
 *
 *   - Exchange: {@code samhan.audit.exchange} (topic, durable)
 *   - Queue:    {@code samhan.audit.queue} bound with pattern {@code audit.#}
 *   - DLX:      {@code samhan.audit.dlx}
 *   - DLQ:      {@code samhan.audit.dlq}
 *
 * Producers publish with routing keys like {@code audit.slip},
 * {@code audit.account.login}, etc.
 */
@Configuration
public class RabbitConfig {

    @Value("${samhan.audit.rabbit.audit-queue-max-length:10000}")
    private long auditQueueMaxLength = 10000L;

    @Value("${samhan.audit.rabbit.audit-queue-message-ttl-ms:86400000}")
    private long auditQueueMessageTtlMs = 86400000L;

    public static final String EXCHANGE = "samhan.audit.exchange";
    public static final String QUEUE = "samhan.audit.queue";
    public static final String FAILURE_QUEUE = "samhan.audit.failure.queue";
    public static final String READ_QUEUE = "samhan.audit.read.queue";
    public static final String DLX = "samhan.audit.dlx";
    public static final String DLQ = "samhan.audit.dlq";
    public static final String ROUTING_PATTERN = "audit.#";
    public static final String DLQ_ROUTING_KEY = "audit.dlq";

    @Bean
    TopicExchange auditExchange() {
        return new TopicExchange(EXCHANGE, true, false);
    }

    @Bean
    TopicExchange dlx() {
        return new TopicExchange(DLX, true, false);
    }

    @Bean
    Queue auditQueue() {
        return QueueBuilder.durable(QUEUE)
                .withArguments(Map.of(
                        "x-dead-letter-exchange", DLX,
                        "x-dead-letter-routing-key", DLQ_ROUTING_KEY,
                        "x-max-length", auditQueueMaxLength,
                        "x-message-ttl", auditQueueMessageTtlMs
                ))
                .build();
    }

    @Bean
    Queue auditDeadLetterQueue() {
        return QueueBuilder.durable(DLQ).build();
    }

    @Bean
    Queue auditFailureQueue() {
        return boundedQueue(FAILURE_QUEUE, 10000L);
    }

    @Bean
    Queue auditReadQueue() {
        return boundedQueue(READ_QUEUE, 2000L);
    }

    private Queue boundedQueue(String name, long maxLength) {
        return QueueBuilder.durable(name).withArguments(Map.of(
                "x-dead-letter-exchange", DLX,
                "x-dead-letter-routing-key", DLQ_ROUTING_KEY,
                "x-max-length", maxLength,
                "x-message-ttl", auditQueueMessageTtlMs)).build();
    }

    @Bean
    Binding auditBinding(Queue auditQueue, TopicExchange auditExchange) {
        return BindingBuilder.bind(auditQueue).to(auditExchange).with("audit.change.#");
    }

    @Bean
    Binding failureBinding(Queue auditFailureQueue, TopicExchange auditExchange) {
        return BindingBuilder.bind(auditFailureQueue).to(auditExchange).with("audit.failure.#");
    }

    @Bean
    Binding readBinding(Queue auditReadQueue, TopicExchange auditExchange) {
        return BindingBuilder.bind(auditReadQueue).to(auditExchange).with("audit.read.#");
    }

    @Bean
    Binding dlqBinding(Queue auditDeadLetterQueue, TopicExchange dlx) {
        return BindingBuilder.bind(auditDeadLetterQueue).to(dlx).with(DLQ_ROUTING_KEY);
    }

    @Bean
    MessageConverter jsonMessageConverter() {
        return new Jackson2JsonMessageConverter();
    }

    @Bean
    SimpleRabbitListenerContainerFactory rabbitListenerContainerFactory(
            ConnectionFactory connectionFactory, MessageConverter converter) {
        SimpleRabbitListenerContainerFactory factory = new SimpleRabbitListenerContainerFactory();
        factory.setConnectionFactory(connectionFactory);
        factory.setMessageConverter(converter);
        factory.setDefaultRequeueRejected(false);
        factory.setAdviceChain(RetryInterceptorBuilder.stateless()
                .maxAttempts(3)
                .recoverer(new RejectAndDontRequeueRecoverer())
                .build());
        return factory;
    }
}
