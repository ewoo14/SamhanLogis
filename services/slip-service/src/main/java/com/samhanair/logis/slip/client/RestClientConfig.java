package com.samhanair.logis.slip.client;

import org.springframework.cloud.client.loadbalancer.LoadBalanced;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

/** 내부 서비스 client가 공유하는 load-balanced RestClient builder를 제공한다. */
@Configuration
public class RestClientConfig {

    /** Eureka 서비스 이름을 해석하는 공용 builder. */
    @Bean
    @LoadBalanced
    public RestClient.Builder loadBalancedRestClientBuilder() {
        return RestClient.builder();
    }
}
