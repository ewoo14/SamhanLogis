package com.samhanair.logis.gateway.filter;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.InetSocketAddress;
import org.junit.jupiter.api.Test;
import org.springframework.cloud.gateway.filter.GatewayFilter;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

class ForwardedClientIpGatewayFilterFactoryTest {

    @Test
    void trustedIngress_forwardsRealClientIp() {
        ForwardedClientIpGatewayFilterFactory.Config config = new ForwardedClientIpGatewayFilterFactory.Config();
        config.setTrustedPeerAddresses("10.20.0.7");
        GatewayFilter filter = new ForwardedClientIpGatewayFilterFactory().apply(config);
        MockServerWebExchange exchange = MockServerWebExchange.from(MockServerHttpRequest.post("/api/v1/auth/partner-login")
                .remoteAddress(new InetSocketAddress("10.20.0.7", 1234))
                .header("X-Real-IP", "198.51.100.24")
                .header("X-Forwarded-For", "198.51.100.24, 10.20.0.7").build());
        ServerHttpRequest[] captured = new ServerHttpRequest[1];
        GatewayFilterChain chain = e -> { captured[0] = e.getRequest(); return Mono.empty(); };

        StepVerifier.create(filter.filter(exchange, chain)).verifyComplete();

        assertThat(captured[0].getHeaders().getFirst("X-Audit-Client-IP")).isEqualTo("198.51.100.24");
    }

    @Test
    void untrustedDirectPeer_cannotInjectAuditClientIp() {
        ForwardedClientIpGatewayFilterFactory.Config config = new ForwardedClientIpGatewayFilterFactory.Config();
        config.setTrustedPeerAddresses("10.20.0.7");
        GatewayFilter filter = new ForwardedClientIpGatewayFilterFactory().apply(config);
        MockServerWebExchange exchange = MockServerWebExchange.from(MockServerHttpRequest.post("/api/v1/auth/partner-login")
                .remoteAddress(new InetSocketAddress("203.0.113.9", 1234))
                .header("X-Audit-Client-IP", "198.51.100.24")
                .header("X-Forwarded-For", "198.51.100.24").build());
        ServerHttpRequest[] captured = new ServerHttpRequest[1];
        GatewayFilterChain chain = e -> { captured[0] = e.getRequest(); return Mono.empty(); };

        StepVerifier.create(filter.filter(exchange, chain)).verifyComplete();

        assertThat(captured[0].getHeaders().getFirst("X-Audit-Client-IP")).isEqualTo("203.0.113.9");
    }
}
