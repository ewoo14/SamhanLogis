package com.samhanair.logis.notification.config;

import org.springframework.cloud.client.loadbalancer.LoadBalanced;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

/**
 * UserClient 와 AligoSmsAdapter 가 사용하는 {@link RestClient.Builder} bean — 외부 service /
 * 외부 API 호출용. baseUrl 은 호출 측에서 직접 부여 (multi-target 재사용).
 *
 * <p>{@code loadBalancedRestClientBuilder} — Spring Cloud LoadBalancer 통합 빌더로
 * shared {@code DefaultDynamicPermissionClient} 가 auth-service 호출에 사용.
 */
@Configuration
public class WebClientConfig {

    @Bean
    public RestClient.Builder restClientBuilder() {
        return RestClient.builder();
    }

    @Bean
    @LoadBalanced
    public RestClient.Builder loadBalancedRestClientBuilder() {
        return RestClient.builder();
    }
}
