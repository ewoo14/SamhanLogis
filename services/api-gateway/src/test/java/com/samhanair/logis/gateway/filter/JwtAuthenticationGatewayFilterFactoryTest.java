package com.samhanair.logis.gateway.filter;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.common.security.JwtTokenProvider;
import com.samhanair.logis.gateway.config.JwtProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.cloud.gateway.filter.GatewayFilter;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.http.server.reactive.MockServerHttpResponse;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

/**
 * Unit tests for {@link JwtAuthenticationGatewayFilterFactory}.
 *
 * <p>The filter is exercised end-to-end against
 * {@link MockServerWebExchange}; the downstream chain is a no-op that
 * captures the mutated request so we can assert on the headers that would
 * have been forwarded.
 *
 * <p>Phase C5-1: X-User-Groups 헤더 주입 검증 추가.
 */
class JwtAuthenticationGatewayFilterFactoryTest {

    // 32+ byte HS256 secret so JJWT key generation is happy.
    private static final String SECRET = "test-secret-key-test-secret-key-test!";

    private JwtAuthenticationGatewayFilterFactory factory;
    private JwtProperties props;

    @BeforeEach
    void setUp() {
        props = new JwtProperties();
        props.setSecret(SECRET);
        props.setTtlSeconds(3600);
        factory = new JwtAuthenticationGatewayFilterFactory(props);
    }

    @Test
    void missingAuthorizationHeader_returns401Unauthorized() {
        GatewayFilter filter = factory.apply(new JwtAuthenticationGatewayFilterFactory.Config());

        MockServerHttpRequest request = MockServerHttpRequest.get("/api/users/me").build();
        MockServerWebExchange exchange = MockServerWebExchange.from(request);

        GatewayFilterChain chain = e -> Mono.empty();

        StepVerifier.create(filter.filter(exchange, chain)).verifyComplete();

        assertThat(exchange.getResponse().getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        String body = readBody(exchange);
        assertThat(body).contains("UNAUTHORIZED");
        assertThat(body).contains("\"success\":false");
    }

    @Test
    void validToken_propagatesIdentityHeadersDownstream() {
        String token = JwtTokenProvider.generate(
                "user-42", "MANAGER", 3600, props.getSecretBytes());

        GatewayFilter filter = factory.apply(new JwtAuthenticationGatewayFilterFactory.Config());

        MockServerHttpRequest request = MockServerHttpRequest.get("/api/users/me")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .build();
        MockServerWebExchange exchange = MockServerWebExchange.from(request);

        ServerHttpRequest[] captured = new ServerHttpRequest[1];
        GatewayFilterChain chain = e -> {
            captured[0] = e.getRequest();
            return Mono.empty();
        };

        StepVerifier.create(filter.filter(exchange, chain)).verifyComplete();

        assertThat(captured[0]).isNotNull();
        assertThat(captured[0].getHeaders().getFirst("X-User-Id")).isEqualTo("user-42");
        assertThat(captured[0].getHeaders().getFirst("X-User-Role")).isEqualTo("MANAGER");
        // Phase C4: isSystemMaster claim 없음 → X-Is-System-Master: false
        assertThat(captured[0].getHeaders().getFirst("X-Is-System-Master")).isEqualTo("false");
    }

    @Test
    void masterToken_withSystemMasterClaim_propagatesIsSystemMasterTrue() {
        // Phase C4: isSystemMaster=true claim 포함 토큰 → X-Is-System-Master: true 전파
        String token = JwtTokenProvider.generate(
                "master-user", "MASTER", null, true, 3600L, props.getSecretBytes());

        GatewayFilter filter = factory.apply(new JwtAuthenticationGatewayFilterFactory.Config());

        MockServerHttpRequest request = MockServerHttpRequest.get("/api/admin/users")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .build();
        MockServerWebExchange exchange = MockServerWebExchange.from(request);

        ServerHttpRequest[] captured = new ServerHttpRequest[1];
        GatewayFilterChain chain = e -> {
            captured[0] = e.getRequest();
            return Mono.empty();
        };

        StepVerifier.create(filter.filter(exchange, chain)).verifyComplete();

        assertThat(captured[0]).isNotNull();
        assertThat(captured[0].getHeaders().getFirst("X-User-Id")).isEqualTo("master-user");
        assertThat(captured[0].getHeaders().getFirst("X-User-Role")).isEqualTo("MASTER");
        assertThat(captured[0].getHeaders().getFirst("X-Is-System-Master")).isEqualTo("true");
    }

    @Test
    void legacyToken_withoutSystemMasterClaim_propagatesIsSystemMasterFalse() {
        // Phase C4 backward compat: 구버전 토큰(claim 없음) → X-Is-System-Master: false
        String token = JwtTokenProvider.generate(
                "legacy-master", "MASTER", 3600, props.getSecretBytes());

        GatewayFilter filter = factory.apply(new JwtAuthenticationGatewayFilterFactory.Config());

        MockServerHttpRequest request = MockServerHttpRequest.get("/api/admin/users")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .build();
        MockServerWebExchange exchange = MockServerWebExchange.from(request);

        ServerHttpRequest[] captured = new ServerHttpRequest[1];
        GatewayFilterChain chain = e -> {
            captured[0] = e.getRequest();
            return Mono.empty();
        };

        StepVerifier.create(filter.filter(exchange, chain)).verifyComplete();

        assertThat(captured[0]).isNotNull();
        // 구버전 토큰이어도 role=MASTER 이므로 role 폴백으로 bypass 가능 (PermissionAspect 에서)
        assertThat(captured[0].getHeaders().getFirst("X-Is-System-Master")).isEqualTo("false");
    }

    @Test
    @org.junit.jupiter.api.DisplayName("C5-1: groups claim 없는 토큰 → X-User-Groups 빈 문자열 전파")
    void validToken_withoutGroups_propagatesEmptyUserGroupsHeader() {
        // groups claim 미포함 토큰 (6-arg 사용)
        String token = JwtTokenProvider.generate(
                "user-ng", "SALES", 3600, props.getSecretBytes());

        GatewayFilter filter = factory.apply(new JwtAuthenticationGatewayFilterFactory.Config());

        MockServerHttpRequest request = MockServerHttpRequest.get("/api/orders")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .build();
        MockServerWebExchange exchange = MockServerWebExchange.from(request);

        ServerHttpRequest[] captured = new ServerHttpRequest[1];
        GatewayFilterChain chain = e -> {
            captured[0] = e.getRequest();
            return Mono.empty();
        };

        StepVerifier.create(filter.filter(exchange, chain)).verifyComplete();

        assertThat(captured[0]).isNotNull();
        // C5-1: groups 미포함 토큰 → X-User-Groups 빈 문자열 (헤더 일관)
        assertThat(captured[0].getHeaders().getFirst("X-User-Groups")).isEqualTo("");
    }

    @Test
    @org.junit.jupiter.api.DisplayName("C5-1: groups claim 포함 토큰 → X-User-Groups comma-join 전파")
    void validToken_withGroups_propagatesUserGroupsHeader() {
        String groups = "g-uuid-1,g-uuid-2";
        // 7-arg: groups claim 포함
        String token = JwtTokenProvider.generate(
                "user-g", "MANAGER", null, false, groups, 3600L, props.getSecretBytes());

        GatewayFilter filter = factory.apply(new JwtAuthenticationGatewayFilterFactory.Config());

        MockServerHttpRequest request = MockServerHttpRequest.get("/api/orders")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .build();
        MockServerWebExchange exchange = MockServerWebExchange.from(request);

        ServerHttpRequest[] captured = new ServerHttpRequest[1];
        GatewayFilterChain chain = e -> {
            captured[0] = e.getRequest();
            return Mono.empty();
        };

        StepVerifier.create(filter.filter(exchange, chain)).verifyComplete();

        assertThat(captured[0]).isNotNull();
        assertThat(captured[0].getHeaders().getFirst("X-User-Groups")).isEqualTo(groups);
        // 기존 헤더들도 영향 없는지 확인
        assertThat(captured[0].getHeaders().getFirst("X-User-Id")).isEqualTo("user-g");
        assertThat(captured[0].getHeaders().getFirst("X-User-Role")).isEqualTo("MANAGER");
        assertThat(captured[0].getHeaders().getFirst("X-Is-System-Master")).isEqualTo("false");
    }

    @Test
    void invalidToken_returns401InvalidToken() {
        GatewayFilter filter = factory.apply(new JwtAuthenticationGatewayFilterFactory.Config());

        MockServerHttpRequest request = MockServerHttpRequest.get("/api/users/me")
                .header(HttpHeaders.AUTHORIZATION, "Bearer not.a.valid.jwt")
                .build();
        MockServerWebExchange exchange = MockServerWebExchange.from(request);

        GatewayFilterChain chain = e -> Mono.empty();

        StepVerifier.create(filter.filter(exchange, chain)).verifyComplete();

        assertThat(exchange.getResponse().getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        String body = readBody(exchange);
        assertThat(body).contains("INVALID_TOKEN");
    }

    private static String readBody(ServerWebExchange exchange) {
        return ((MockServerHttpResponse) exchange.getResponse()).getBodyAsString().block();
    }
}
