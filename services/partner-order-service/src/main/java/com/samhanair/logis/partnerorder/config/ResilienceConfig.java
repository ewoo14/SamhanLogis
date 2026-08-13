package com.samhanair.logis.partnerorder.config;

import io.github.resilience4j.circuitbreaker.CircuitBreakerConfig;
import io.github.resilience4j.timelimiter.TimeLimiterConfig;
import java.time.Duration;
import org.springframework.cloud.circuitbreaker.resilience4j.Resilience4JCircuitBreakerFactory;
import org.springframework.cloud.circuitbreaker.resilience4j.Resilience4JConfigBuilder;
import org.springframework.cloud.client.circuitbreaker.Customizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Resilience4J Circuit Breaker 기본 설정. M5 §3 옵션 A — slip-service 호출 5xx/timeout 시
 * outbox + scheduler 흐름으로 fallback 하기 위한 회로 차단기.
 *
 * <p>인스턴스 키 매트릭스:
 * <ul>
 *   <li>{@code slipServiceClient} — slip-service /from-partner-order 호출 (가장 중요)</li>
 *   <li>{@code dcConfigClient} — dc-config-service (장애 시 가격 확정 차단)</li>
 *   <li>{@code productClient} — product-service (카탈로그 fail-soft)</li>
 *   <li>{@code inventoryClient} — inventory-service (reservation/commit)</li>
 *   <li>{@code partnerAuthClient} — partner-auth-service (JWT 검증)</li>
 * </ul>
 *
 * <p>application.yml 의 {@code resilience4j.circuitbreaker.instances.*} 에서 인스턴스별 override.
 * 기본은 slidingWindowSize=10, failureRateThreshold=50, waitDurationInOpenState=30s, timeout=3s.
 */
@Configuration
public class ResilienceConfig {

    @Bean
    public Customizer<Resilience4JCircuitBreakerFactory> defaultCustomizer() {
        return factory -> factory.configureDefault(id -> new Resilience4JConfigBuilder(id)
                .timeLimiterConfig(TimeLimiterConfig.custom()
                        .timeoutDuration(Duration.ofSeconds(3))
                        .build())
                .circuitBreakerConfig(CircuitBreakerConfig.custom()
                        .slidingWindowSize(10)
                        .failureRateThreshold(50.0f)
                        .waitDurationInOpenState(Duration.ofSeconds(30))
                        .permittedNumberOfCallsInHalfOpenState(3)
                        .build())
                .build());
    }
}
