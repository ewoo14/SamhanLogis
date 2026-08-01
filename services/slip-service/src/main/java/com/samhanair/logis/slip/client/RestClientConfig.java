package com.samhanair.logis.slip.client;

import java.time.Duration;
import org.springframework.cloud.client.loadbalancer.LoadBalanced;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/**
 * Exposes a {@link RestClient.Builder} with Spring Cloud LoadBalancer integration so
 * {@code lb://service-name} URIs are resolved through Eureka.
 * Consumers: {@link ProductClient}, {@link InventoryClient}.
 */
@Configuration
public class RestClientConfig {

    @Bean
    @LoadBalanced
    public RestClient.Builder loadBalancedRestClientBuilder() {
        return RestClient.builder();
    }

    /** 창고 내부 조회 전용 load-balanced builder를 제공한다. */
    @Bean
    @LoadBalanced
    public RestClient.Builder warehouseRestClientBuilder() {
        return warehouseClientBuilder(RestClient.builder());
    }

    /** 창고 내부 조회가 기동 스레드를 무기한 점유하지 않도록 네트워크 상한을 설정한다. */
    RestClient.Builder warehouseClientBuilder(RestClient.Builder builder) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout((int) Duration.ofSeconds(2).toMillis());
        requestFactory.setReadTimeout((int) Duration.ofSeconds(3).toMillis());
        return builder.requestFactory(requestFactory);
    }
}
