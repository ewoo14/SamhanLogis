package com.samhanair.logis.arologis.config;

import java.time.Duration;
import org.springframework.cloud.client.loadbalancer.LoadBalanced;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/**
 * 3 외부 client (PartnerClient / SlipClient / NotificationClient) 가 사용하는
 * {@link RestClient.Builder} bean — multi-target 재사용.
 *
 * <p>Phase 10 W10-1 — ServiceDiscoveryClient 5번째 소비자 (partner / groupware / notification /
 * dashboard → arologis). 2026-05-14 분리 — UserClient 제거 (자체 user 도메인 도입).
 *
 * <p>W10-4 종합 TM (DV-1 채택, 2026-05-07) — connect 2s / read 3s timeout 적용. slip-service /
 * partner-service / user-service / notification-service hang 시 driver-app sign 응답 동기 차단
 * SLA 위협 회피. Spring Boot 3.3.5 표준 {@link ClientHttpRequestFactories} 사용.
 *
 * <p>테스트 시 {@code MockRestServiceServer.bindTo(builder)} 호출 시점에 builder 의 requestFactory
 * 가 mock interceptor 로 교체되므로 본 production timeout 은 bypass — 테스트 격리 보존.
 */
@Configuration
public class WebClientConfig {

    @Bean
    @Primary
    public RestClient.Builder restClientBuilder() {
        SimpleClientHttpRequestFactory rf = new SimpleClientHttpRequestFactory();
        rf.setConnectTimeout((int) Duration.ofSeconds(2).toMillis());
        rf.setReadTimeout((int) Duration.ofSeconds(3).toMillis());
        return RestClient.builder().requestFactory(rf);
    }

    /**
     * Spring Cloud LoadBalancer 통합 RestClient.Builder bean.
     *
     * <p>SP-D4 동적 RBAC 권한 조회처럼 서비스명 기반 내부 호출에 사용한다.
     */
    @Bean
    @LoadBalanced
    public RestClient.Builder loadBalancedRestClientBuilder() {
        return RestClient.builder();
    }
}
