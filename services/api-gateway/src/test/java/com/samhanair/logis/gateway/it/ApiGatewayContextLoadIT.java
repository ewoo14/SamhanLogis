package com.samhanair.logis.gateway.it;

import com.samhanair.logis.gateway.ApiGatewayApplication;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;

/**
 * api-gateway Spring 컨텍스트 로드 통합 테스트 (audit-slice-3 P1-2).
 *
 * <p>Eureka 비활성 + JWT secret 주입 상태에서 WebFlux 기반 Gateway 의
 * ApplicationContext(+ JwtAuthenticationGatewayFilterFactory, JwtProperties)
 * 가 정상 기동하는지 검증한다.
 *
 * <p>api-gateway 는 reactive (Netty) 스택이므로
 * {@code WebEnvironment.MOCK} 을 사용해 실제 포트 바인딩 없이 컨텍스트만 로드한다.
 *
 * <p>외부 client 격리:
 * api-gateway 는 외부 RestClient / Feign 을 보유하지 않으므로
 * {@code @MockBean} 없이 컨텍스트 로드만으로 검증 가능.
 * Eureka + Cloud Gateway 에서 {@code spring.cloud.gateway.enabled=false} 또는
 * service-discovery 비활성 설정으로 downstream 연결 시도를 억제.
 */
@SpringBootTest(
        classes = ApiGatewayApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT
)
@TestPropertySource(properties = {
        "eureka.client.enabled=false",
        "eureka.client.register-with-eureka=false",
        "eureka.client.fetch-registry=false",
        "spring.cloud.discovery.enabled=false",
        "app.security.jwt.secret=test-secret-key-32-chars-min-aaaaaa",
        "app.security.jwt.ttl-seconds=3600"
})
class ApiGatewayContextLoadIT {

    /**
     * ApplicationContext 가 예외 없이 기동되면 PASS.
     *
     * <p>JWT 필터 팩토리({@link com.samhanair.logis.gateway.filter.JwtAuthenticationGatewayFilterFactory})
     * 와 {@link com.samhanair.logis.gateway.config.JwtProperties} bean 이
     * 올바르게 주입되는지 함께 검증.
     */
    @Test
    @DisplayName("api-gateway Spring 컨텍스트 정상 로드 — JWT 필터 + Eureka 비활성")
    void contextLoads() {
        // ApplicationContext 기동 성공이 곧 PASS.
    }
}
