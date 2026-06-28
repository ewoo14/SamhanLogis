package com.samhanair.logis.log.config;

import org.springframework.cloud.client.loadbalancer.LoadBalanced;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

/** auth-service 동적 권한 조회용 LoadBalancer 통합 RestClient builder. */
@Configuration
public class RestClientConfig {

    /** shared:security DefaultDynamicPermissionClient 가 사용하는 bean 이름. */
    @Bean("loadBalancedRestClientBuilder")
    @LoadBalanced
    public RestClient.Builder loadBalancedRestClientBuilder() {
        return RestClient.builder();
    }
}
