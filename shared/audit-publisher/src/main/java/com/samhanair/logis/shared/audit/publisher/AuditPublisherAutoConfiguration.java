package com.samhanair.logis.shared.audit.publisher;

import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Bean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.amqp.support.converter.MessageConverter;
import org.springframework.beans.factory.annotation.Value;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.beans.factory.ObjectProvider;

@Configuration
@Import(AuditRequestCaptureAutoConfiguration.class)
public class AuditPublisherAutoConfiguration {
    @Bean
    @ConditionalOnMissingBean
    MessageConverter auditMessageConverter() {
        return new Jackson2JsonMessageConverter();
    }

    @Bean
    @ConditionalOnMissingBean
    @ConditionalOnBean(ConnectionFactory.class)
    RabbitTemplate auditRabbitTemplate(ConnectionFactory connectionFactory, MessageConverter converter) {
        RabbitTemplate template = new RabbitTemplate(connectionFactory);
        template.setMessageConverter(converter);
        return template;
    }

    @Bean
    @ConditionalOnMissingBean
    AuditPublisher auditPublisher(ObjectProvider<RabbitTemplate> rabbitTemplate, MeterRegistry meters,
                                  @Value("${samhan.audit.publisher.enabled:false}") boolean enabled) {
        RabbitTemplate template = rabbitTemplate.getIfAvailable();
        return new AuditPublisher(template, meters, enabled && template != null);
    }
}
