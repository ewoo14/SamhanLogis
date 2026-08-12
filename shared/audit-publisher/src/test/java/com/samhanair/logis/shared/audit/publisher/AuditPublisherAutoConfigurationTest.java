package com.samhanair.logis.shared.audit.publisher;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.amqp.rabbit.connection.CachingConnectionFactory;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;

class AuditPublisherAutoConfigurationTest {
    @Test
    void usesSpringConfiguredConnectionFactoryAndJsonConverter() {
        CachingConnectionFactory configured = new CachingConnectionFactory("configured-host", 15672);
        try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext()) {
            context.registerBean(ConnectionFactory.class, () -> configured);
            context.register(AuditPublisherAutoConfiguration.class);
            context.refresh();

            RabbitTemplate template = context.getBean(RabbitTemplate.class);
            assertThat(template.getConnectionFactory()).isSameAs(configured);
            assertThat(template.getMessageConverter()).isInstanceOf(Jackson2JsonMessageConverter.class);
        } finally {
            configured.destroy();
        }
    }
}
