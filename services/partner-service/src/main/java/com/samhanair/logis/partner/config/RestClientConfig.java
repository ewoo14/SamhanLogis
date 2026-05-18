package com.samhanair.logis.partner.config;

import org.springframework.cloud.client.loadbalancer.LoadBalanced;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

/**
 * Spring Cloud LoadBalancer 통합 {@link RestClient.Builder} 노출 (SP-D4 신규).
 *
 * <p>partner-service 내부 서비스간 호출 (auth-service 권한 조회 등) 에 사용.
 * {@code lb://service-name} URI 는 Eureka 를 통해 resolve 된다.
 */
@Configuration
public class RestClientConfig {

    /**
     * LoadBalancer 통합 RestClient.Builder bean.
     *
     * @return LoadBalanced RestClient.Builder
     */
    @Bean
    @LoadBalanced
    public RestClient.Builder loadBalancedRestClientBuilder() {
        return RestClient.builder();
    }
}
