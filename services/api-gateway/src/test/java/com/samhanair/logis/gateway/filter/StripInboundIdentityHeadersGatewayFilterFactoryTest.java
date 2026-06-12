package com.samhanair.logis.gateway.filter;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.common.http.HttpHeaderConstants;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.cloud.gateway.filter.GatewayFilter;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.http.HttpHeaders;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

/**
 * {@link StripInboundIdentityHeadersGatewayFilterFactory} 공개 라우트 identity header strip 회귀 테스트.
 */
class StripInboundIdentityHeadersGatewayFilterFactoryTest {

    private final StripInboundIdentityHeadersGatewayFilterFactory factory =
            new StripInboundIdentityHeadersGatewayFilterFactory();

    @Test
    @DisplayName("#465: /auth/register 공개 라우트 위조 identity header 7개 전부 제거")
    void publicRegisterRoute_stripsAllSpoofedIdentityHeaders() {
        ServerHttpRequest captured = filterAndCapture("/auth/register");

        assertThat(captured).isNotNull();
        assertIdentityHeadersRemoved(captured);
        assertThat(captured.getHeaders().getFirst(HttpHeaders.AUTHORIZATION)).isEqualTo("Bearer public-token");
        assertThat(captured.getHeaders().getFirst("X-Request-Id")).isEqualTo("req-465");
    }

    @Test
    @DisplayName("#465: /auth/login 공개 라우트도 위조 identity header 7개 전부 제거")
    void publicLoginRoute_stripsAllSpoofedIdentityHeaders() {
        ServerHttpRequest captured = filterAndCapture("/auth/login");

        assertThat(captured).isNotNull();
        assertIdentityHeadersRemoved(captured);
        assertThat(captured.getHeaders().getFirst(HttpHeaders.AUTHORIZATION)).isEqualTo("Bearer public-token");
    }

    private ServerHttpRequest filterAndCapture(String path) {
        GatewayFilter filter = factory.apply(new StripInboundIdentityHeadersGatewayFilterFactory.Config());

        MockServerHttpRequest request = MockServerHttpRequest.post(path)
                .header(HttpHeaders.AUTHORIZATION, "Bearer public-token")
                .header("X-Request-Id", "req-465")
                .header(HttpHeaderConstants.CALLER_ID_HEADER, "spoof-user")
                .header(HttpHeaderConstants.IS_SYSTEM_MASTER_HEADER, "true")
                .header(HttpHeaderConstants.USER_GROUPS_HEADER, "00000000-0000-0000-0000-000000000100")
                .header(HttpHeaderConstants.IS_PARTNER_HEADER, "true")
                .header(HttpHeaderConstants.CALLER_NAME_HEADER, "%EA%B4%80%EB%A6%AC%EC%9E%90")
                .header(HttpHeaderConstants.USER_DEPARTMENT_HEADER, "%EB%8C%80%ED%91%9C%EC%8B%A4")
                .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "MASTER")
                .build();
        MockServerWebExchange exchange = MockServerWebExchange.from(request);

        ServerHttpRequest[] captured = new ServerHttpRequest[1];
        GatewayFilterChain chain = e -> {
            captured[0] = e.getRequest();
            return Mono.empty();
        };

        StepVerifier.create(filter.filter(exchange, chain)).verifyComplete();
        return captured[0];
    }

    private static void assertIdentityHeadersRemoved(ServerHttpRequest request) {
        for (String header : HttpHeaderConstants.INBOUND_IDENTITY_HEADERS) {
            assertThat(request.getHeaders().containsKey(header))
                    .as("%s 는 공개 라우트 downstream 으로 전달되면 안 된다", header)
                    .isFalse();
        }
    }
}
