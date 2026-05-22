package com.samhanair.logis.notification.publisher;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.web.client.RestClient;

/**
 * NotificationPublisher 자동 등록 — shared:notification-publisher 의존만 추가하면 활성.
 *
 * <p>{@code loadBalancedRestClientBuilder} bean 이 없는 service 에서는 비활성화된다.
 */
@AutoConfiguration
public class NotificationPublisherAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean
    @ConditionalOnBean(name = "loadBalancedRestClientBuilder")
    public NotificationPublisher notificationPublisher(
            @Qualifier("loadBalancedRestClientBuilder") RestClient.Builder loadBalancedBuilder,
            @Value("${app.security.internal.token:}") String internalToken,
            @Value("${spring.application.name:unknown}") String applicationName) {
        return new NotificationPublisher(loadBalancedBuilder, internalToken, applicationName);
    }
}
