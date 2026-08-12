package com.samhanair.logis.shared.audit.publisher;

import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Bean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.rabbit.connection.CachingConnectionFactory;

@Configuration
@Import(AuditPublisher.class)
public class AuditPublisherAutoConfiguration {
    @Bean
    @ConditionalOnMissingBean
    RabbitTemplate auditRabbitTemplate() {
        return new RabbitTemplate(new CachingConnectionFactory());
    }
}
