package com.samhanair.logis.gateway.filter;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.common.http.HttpHeaderConstants;
import com.samhanair.logis.common.security.JwtTokenProvider;
import com.samhanair.logis.gateway.config.JwtProperties;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.cloud.gateway.filter.GatewayFilter;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.http.HttpCookie;
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
 * 모바일 슬1 웹 쿠키 인증 gateway 계약 검증.
 *
 * <p>Bearer 우선순위와 access_token 쿠키 fallback 이 동일한 JWT 검증/식별헤더 주입 경로를
 * 사용하는지 확인한다.
 */
class CookieAuthGatewayIT {

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
    @DisplayName("Bearer 없이 access_token 쿠키만 있어도 동일 JWT 검증 후 통과")
    void validAccessTokenCookieWithoutBearer_propagatesIdentityHeaders() {
        String token = JwtTokenProvider.generate(
                "cookie-user", "MANAGER", "영업팀", "홍길동", false, "grp-cookie", 3600L,
                props.getSecretBytes());
        GatewayFilter filter = factory.apply(new JwtAuthenticationGatewayFilterFactory.Config());

        MockServerHttpRequest request = MockServerHttpRequest.get("/api/users/me")
                .cookie(new HttpCookie("access_token", token))
                .build();
        MockServerWebExchange exchange = MockServerWebExchange.from(request);

        ServerHttpRequest[] captured = new ServerHttpRequest[1];
        GatewayFilterChain chain = e -> {
            captured[0] = e.getRequest();
            return Mono.empty();
        };

        StepVerifier.create(filter.filter(exchange, chain)).verifyComplete();

        assertThat(captured[0]).isNotNull();
        assertThat(captured[0].getHeaders().getFirst(HttpHeaderConstants.CALLER_ID_HEADER))
                .isEqualTo("cookie-user");
        assertThat(captured[0].getHeaders().getFirst(HttpHeaderConstants.USER_GROUPS_HEADER))
                .isEqualTo("grp-cookie");
    }

    @Test
    @DisplayName("Bearer 와 쿠키가 동시에 있으면 Bearer 를 우선한다")
    void bearerAndCookiePresent_prefersBearerToken() {
        String bearerToken = JwtTokenProvider.generate(
                "bearer-user", "MANAGER", null, false, "grp-bearer", 3600L, props.getSecretBytes());
        String cookieToken = JwtTokenProvider.generate(
                "cookie-user", "MANAGER", null, false, "grp-cookie", 3600L, props.getSecretBytes());
        GatewayFilter filter = factory.apply(new JwtAuthenticationGatewayFilterFactory.Config());

        MockServerHttpRequest request = MockServerHttpRequest.get("/api/users/me")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + bearerToken)
                .cookie(new HttpCookie("access_token", cookieToken))
                .build();
        MockServerWebExchange exchange = MockServerWebExchange.from(request);

        ServerHttpRequest[] captured = new ServerHttpRequest[1];
        GatewayFilterChain chain = e -> {
            captured[0] = e.getRequest();
            return Mono.empty();
        };

        StepVerifier.create(filter.filter(exchange, chain)).verifyComplete();

        assertThat(captured[0]).isNotNull();
        assertThat(captured[0].getHeaders().getFirst(HttpHeaderConstants.CALLER_ID_HEADER))
                .isEqualTo("bearer-user");
        assertThat(captured[0].getHeaders().getFirst(HttpHeaderConstants.USER_GROUPS_HEADER))
                .isEqualTo("grp-bearer");
    }

    @Test
    @DisplayName("access_token 쿠키가 유효하지 않으면 401")
    void invalidAccessTokenCookie_returns401InvalidToken() {
        GatewayFilter filter = factory.apply(new JwtAuthenticationGatewayFilterFactory.Config());

        MockServerHttpRequest request = MockServerHttpRequest.get("/api/users/me")
                .cookie(new HttpCookie("access_token", "not-a-jwt"))
                .build();
        MockServerWebExchange exchange = MockServerWebExchange.from(request);

        StepVerifier.create(filter.filter(exchange, e -> Mono.empty())).verifyComplete();

        assertThat(exchange.getResponse().getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(readBody(exchange)).contains("INVALID_TOKEN");
    }

    @Test
    @DisplayName("/auth/me bootstrap 라우트는 legacy/public catch-all 보다 먼저 JwtAuthentication 을 적용한다")
    void authMeRoutes_areAuthenticatedBeforeCatchAll() throws Exception {
        String yml = Files.readString(
                Path.of(CookieAuthGatewayIT.class.getClassLoader()
                        .getResource("application.yml")
                        .toURI()),
                StandardCharsets.UTF_8);

        int legacyMe = yml.indexOf("id: auth-service-me-authenticated");
        int legacyCatchAll = yml.indexOf("id: auth-service-legacy");
        int v1Me = yml.indexOf("id: auth-service-me-v1-authenticated");
        int v1CatchAll = yml.indexOf("id: auth-service-v1");

        assertThat(legacyMe).isGreaterThanOrEqualTo(0);
        assertThat(v1Me).isGreaterThanOrEqualTo(0);
        assertThat(legacyMe).isLessThan(legacyCatchAll);
        assertThat(v1Me).isLessThan(v1CatchAll);
        assertThat(yml).contains(
                "- Path=/auth/me",
                "- Path=/api/v1/auth/me",
                "- StripPrefix=2",
                "- JwtAuthentication");
    }

    private static String readBody(ServerWebExchange exchange) {
        return ((MockServerHttpResponse) exchange.getResponse()).getBodyAsString().block();
    }
}
