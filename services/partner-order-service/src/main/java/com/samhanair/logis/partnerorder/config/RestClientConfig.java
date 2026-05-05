package com.samhanair.logis.partnerorder.config;

import org.springframework.cloud.client.loadbalancer.LoadBalanced;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

/**
 * Exposes a {@link RestClient.Builder} with Spring Cloud LoadBalancer integration so
 * {@code lb://service-name} URIs are resolved through Eureka.
 *
 * <p>5 외부 client (DcConfig/Product/Inventory/Slip/PartnerAuth) 가 모두 이 builder 를 주입받아
 * 사용. inventory-service 의 동일 패턴 (RestClient + LoadBalancer + RestClient).
 */
@Configuration
public class RestClientConfig {

    @Bean
    @LoadBalanced
    public RestClient.Builder loadBalancedRestClientBuilder() {
        return RestClient.builder();
    }
}
