package com.samhanair.logis.gateway.filter;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.common.http.HttpHeaderConstants;
import com.samhanair.logis.common.security.JwtTokenProvider;
import com.samhanair.logis.gateway.config.JwtProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
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
 * <p>Phase C5-4: X-User-Role 주입 제거 검증, X-Is-Partner 주입 신규 검증, allowedGroups 단독 logging-service.
 */
@SuppressWarnings("deprecation")
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
    @DisplayName("#P3: required=false 무-토큰 익명 통과는 위조 identity header 전부 제거")
    void optionalJwtMissingAuthorizationHeader_stripsSpoofedIdentityHeadersBeforePassingDownstream() {
        JwtAuthenticationGatewayFilterFactory.Config config =
                new JwtAuthenticationGatewayFilterFactory.Config();
        config.setRequired(false);
        GatewayFilter filter = factory.apply(config);

        MockServerHttpRequest request = MockServerHttpRequest.get("/api/public/optional")
                .header(HttpHeaderConstants.CALLER_ID_HEADER, "spoof-user")
                .header(HttpHeaderConstants.IS_SYSTEM_MASTER_HEADER, "true")
                .header(HttpHeaderConstants.USER_GROUPS_HEADER, "00000000-0000-0000-0000-000000000100")
                .header(HttpHeaderConstants.IS_PARTNER_HEADER, "true")
                .header(HttpHeaderConstants.PARTNER_CODE_HEADER, "SPOOF-PARTNER")
                .header(HttpHeaderConstants.CALLER_NAME_HEADER, "%EA%B4%80%EB%A6%AC%EC%9E%90")
                .header(HttpHeaderConstants.USER_DEPARTMENT_HEADER, "%EB%8C%80%ED%91%9C%EC%8B%A4")
                .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "MASTER")
                .header("X-Request-Id", "req-optional")
                .build();
        MockServerWebExchange exchange = MockServerWebExchange.from(request);

        ServerHttpRequest[] captured = new ServerHttpRequest[1];
        GatewayFilterChain chain = e -> {
            captured[0] = e.getRequest();
            return Mono.empty();
        };

        StepVerifier.create(filter.filter(exchange, chain)).verifyComplete();

        assertThat(captured[0]).isNotNull();
        assertIdentityHeadersRemoved(captured[0]);
        assertThat(captured[0].getHeaders().getFirst("X-Request-Id")).isEqualTo("req-optional");
        assertThat(exchange.getResponse().getStatusCode()).isNull();
    }

    @Test
    @DisplayName("#P3: required=true 무-토큰은 위조 identity header 여부와 무관하게 downstream 차단")
    void requiredJwtMissingAuthorizationHeaderWithSpoofedIdentityHeaders_returns401AndDoesNotCallDownstream() {
        GatewayFilter filter = factory.apply(new JwtAuthenticationGatewayFilterFactory.Config());

        MockServerHttpRequest request = MockServerHttpRequest.get("/api/users/me")
                .header(HttpHeaderConstants.CALLER_ID_HEADER, "spoof-user")
                .header(HttpHeaderConstants.IS_SYSTEM_MASTER_HEADER, "true")
                .header(HttpHeaderConstants.USER_GROUPS_HEADER, "00000000-0000-0000-0000-000000000100")
                .header(HttpHeaderConstants.IS_PARTNER_HEADER, "true")
                .header(HttpHeaderConstants.PARTNER_CODE_HEADER, "SPOOF-PARTNER")
                .header(HttpHeaderConstants.CALLER_NAME_HEADER, "%EA%B4%80%EB%A6%AC%EC%9E%90")
                .header(HttpHeaderConstants.USER_DEPARTMENT_HEADER, "%EB%8C%80%ED%91%9C%EC%8B%A4")
                .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "MASTER")
                .build();
        MockServerWebExchange exchange = MockServerWebExchange.from(request);

        boolean[] downstreamCalled = {false};
        GatewayFilterChain chain = e -> {
            downstreamCalled[0] = true;
            return Mono.empty();
        };

        StepVerifier.create(filter.filter(exchange, chain)).verifyComplete();

        assertThat(downstreamCalled[0]).isFalse();
        assertThat(exchange.getResponse().getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        String body = readBody(exchange);
        assertThat(body).contains("UNAUTHORIZED");
    }

    @Test
    @DisplayName("C5-4: 유효 토큰 → X-User-Id/X-Is-System-Master/X-User-Groups 전파, X-User-Role 미전파")
    void validToken_propagatesIdentityHeadersDownstream_noRoleHeader() {
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
        // C5-4: X-User-Role 헤더 미전파
        assertThat(captured[0].getHeaders().getFirst("X-User-Role")).isNull();
        // Phase C4: isSystemMaster claim 없음 → X-Is-System-Master: false
        assertThat(captured[0].getHeaders().getFirst("X-Is-System-Master")).isEqualTo("false");
    }

    @Test
    @DisplayName("C5-4: isSystemMaster=true 토큰 → X-Is-System-Master: true 전파, X-User-Role 미전파")
    void masterToken_withSystemMasterClaim_propagatesIsSystemMasterTrue_noRoleHeader() {
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
        // C5-4: X-User-Role 미전파
        assertThat(captured[0].getHeaders().getFirst("X-User-Role")).isNull();
        assertThat(captured[0].getHeaders().getFirst("X-Is-System-Master")).isEqualTo("true");
    }

    @Test
    @DisplayName("C5-4: 구버전 토큰(isSystemMaster claim 없음) → X-Is-System-Master: false 전파")
    void legacyToken_withoutSystemMasterClaim_propagatesIsSystemMasterFalse() {
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
        assertThat(captured[0].getHeaders().getFirst("X-Is-System-Master")).isEqualTo("false");
    }

    @Test
    @DisplayName("C5-1: groups claim 없는 토큰 → X-User-Groups 빈 문자열 전파")
    void validToken_withoutGroups_propagatesEmptyUserGroupsHeader() {
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
        assertThat(captured[0].getHeaders().getFirst("X-User-Groups")).isEqualTo("");
    }

    @Test
    @DisplayName("C5-1+C5-4: groups claim 포함 토큰 → X-User-Groups comma-join 전파, X-User-Role 미전파")
    void validToken_withGroups_propagatesUserGroupsHeader_noRoleHeader() {
        String groups = "g-uuid-1,g-uuid-2";
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
        assertThat(captured[0].getHeaders().getFirst("X-User-Id")).isEqualTo("user-g");
        // C5-4: X-User-Role 미전파
        assertThat(captured[0].getHeaders().getFirst("X-User-Role")).isNull();
        assertThat(captured[0].getHeaders().getFirst("X-Is-System-Master")).isEqualTo("false");
    }

    @Test
    @DisplayName("#465: JwtAuthentication 보호 라우트는 위조 identity 제거 후 claim 기반 값만 재주입")
    void jwtProtectedSlipRoute_overridesSpoofedIdentityHeadersWithClaims() {
        String groups = "group-a,group-b";
        String token = JwtTokenProvider.generate(
                "jwt-user", "MANAGER", "영업팀", "홍길동", false, groups, 3600L, props.getSecretBytes());

        GatewayFilter filter = factory.apply(new JwtAuthenticationGatewayFilterFactory.Config());

        MockServerHttpRequest request = MockServerHttpRequest.get("/api/v1/slips/query")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .header(HttpHeaderConstants.CALLER_ID_HEADER, "spoof-user")
                .header(HttpHeaderConstants.IS_SYSTEM_MASTER_HEADER, "true")
                .header(HttpHeaderConstants.USER_GROUPS_HEADER, "spoof-group")
                .header(HttpHeaderConstants.IS_PARTNER_HEADER, "true")
                .header(HttpHeaderConstants.PARTNER_CODE_HEADER, "SPOOF-PARTNER")
                .header(HttpHeaderConstants.CALLER_NAME_HEADER, "spoof-name")
                .header(HttpHeaderConstants.USER_DEPARTMENT_HEADER, "spoof-department")
                .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "MASTER")
                .build();
        MockServerWebExchange exchange = MockServerWebExchange.from(request);

        ServerHttpRequest[] captured = new ServerHttpRequest[1];
        GatewayFilterChain chain = e -> {
            captured[0] = e.getRequest();
            return Mono.empty();
        };

        StepVerifier.create(filter.filter(exchange, chain)).verifyComplete();

        assertThat(captured[0]).isNotNull();
        assertThat(captured[0].getHeaders().get(HttpHeaderConstants.CALLER_ID_HEADER))
                .containsExactly("jwt-user");
        assertThat(captured[0].getHeaders().get(HttpHeaderConstants.IS_SYSTEM_MASTER_HEADER))
                .containsExactly("false");
        assertThat(captured[0].getHeaders().get(HttpHeaderConstants.USER_GROUPS_HEADER))
                .containsExactly(groups);
        assertThat(captured[0].getHeaders().get(HttpHeaderConstants.IS_PARTNER_HEADER))
                .containsExactly("false");
        assertThat(captured[0].getHeaders().containsKey(HttpHeaderConstants.PARTNER_CODE_HEADER))
                .as("직원 JWT 에는 partnerCode claim 이 없으므로 위조 X-Partner-Code 는 제거돼야 한다")
                .isFalse();
        assertThat(captured[0].getHeaders().get(HttpHeaderConstants.CALLER_NAME_HEADER))
                .containsExactly(java.net.URLEncoder.encode("홍길동", java.nio.charset.StandardCharsets.UTF_8));
        assertThat(captured[0].getHeaders().get(HttpHeaderConstants.USER_DEPARTMENT_HEADER))
                .containsExactly(java.net.URLEncoder.encode("영업팀", java.nio.charset.StandardCharsets.UTF_8));
        assertThat(captured[0].getHeaders().containsKey(HttpHeaderConstants.CALLER_ROLE_HEADER))
                .as("X-User-Role 은 JWT claim 재주입 대상이 아니므로 위조 입력도 제거돼야 한다")
                .isFalse();
    }

    @Test
    @DisplayName("displayName claim(name) → X-User-Name URL-encoded 전파, 위조 헤더는 제거")
    void validToken_withDisplayName_propagatesEncodedUserNameHeader() {
        String token = JwtTokenProvider.generate(
                "user-name", "MANAGER", "배차팀", "홍길동", false, "", 3600L, props.getSecretBytes());
        String expectedEncodedName = java.net.URLEncoder.encode(
                "홍길동", java.nio.charset.StandardCharsets.UTF_8);

        GatewayFilter filter = factory.apply(new JwtAuthenticationGatewayFilterFactory.Config());

        MockServerHttpRequest request = MockServerHttpRequest.get("/api/dispatch")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .header("X-User-Name", "system")
                .build();
        MockServerWebExchange exchange = MockServerWebExchange.from(request);

        ServerHttpRequest[] captured = new ServerHttpRequest[1];
        GatewayFilterChain chain = e -> {
            captured[0] = e.getRequest();
            return Mono.empty();
        };

        StepVerifier.create(filter.filter(exchange, chain)).verifyComplete();

        assertThat(captured[0]).isNotNull();
        assertThat(captured[0].getHeaders().get("X-User-Name")).containsExactly(expectedEncodedName);
        assertThat(captured[0].getHeaders().getFirst("X-User-Department")).isEqualTo(
                java.net.URLEncoder.encode("배차팀", java.nio.charset.StandardCharsets.UTF_8));
    }

    @Test
    @DisplayName("name claim 부재 구토큰 + 위조 X-User-Name 입력 → downstream X-User-Name strip")
    void legacyToken_withoutDisplayNameClaim_stripsSpoofedUserNameHeader() {
        String token = JwtTokenProvider.generate(
                "legacy-name", "MANAGER", 3600, props.getSecretBytes());

        GatewayFilter filter = factory.apply(new JwtAuthenticationGatewayFilterFactory.Config());

        MockServerHttpRequest request = MockServerHttpRequest.get("/api/dispatch")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .header("X-User-Name", "%ED%99%8D%EA%B8%B8%EB%8F%99")
                .build();
        MockServerWebExchange exchange = MockServerWebExchange.from(request);

        ServerHttpRequest[] captured = new ServerHttpRequest[1];
        GatewayFilterChain chain = e -> {
            captured[0] = e.getRequest();
            return Mono.empty();
        };

        StepVerifier.create(filter.filter(exchange, chain)).verifyComplete();

        assertThat(captured[0]).isNotNull();
        assertThat(captured[0].getHeaders().containsKey("X-User-Name")).isFalse();
    }

    @Test
    @DisplayName("departmentName claim 부재 구토큰 + 위조 X-User-Department 입력 → downstream X-User-Department strip")
    void legacyToken_withoutDepartmentNameClaim_stripsSpoofedUserDepartmentHeader() {
        String token = JwtTokenProvider.generate(
                "legacy-department", "MANAGER", 3600, props.getSecretBytes());

        GatewayFilter filter = factory.apply(new JwtAuthenticationGatewayFilterFactory.Config());

        MockServerHttpRequest request = MockServerHttpRequest.get("/api/hr/employees")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .header("X-User-Department", "%EB%8C%80%ED%91%9C%EC%8B%A4")
                .build();
        MockServerWebExchange exchange = MockServerWebExchange.from(request);

        ServerHttpRequest[] captured = new ServerHttpRequest[1];
        GatewayFilterChain chain = e -> {
            captured[0] = e.getRequest();
            return Mono.empty();
        };

        StepVerifier.create(filter.filter(exchange, chain)).verifyComplete();

        assertThat(captured[0]).isNotNull();
        assertThat(captured[0].getHeaders().containsKey("X-User-Department")).isFalse();
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

    // -----------------------------------------------------------------------
    // Phase C5-4: X-Is-Partner 헤더 주입 테스트
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("C5-4: partner JWT (partnerCode claim) → X-Is-Partner=true + X-Partner-Code claim 값 주입")
    void partnerToken_withPartnerCodeClaim_propagatesIsPartnerTrue() {
        String token = JwtTokenProvider.generateForPartner(
                "partner-uuid-001", "P001", 3600L, props.getSecretBytes());

        GatewayFilter filter = factory.apply(new JwtAuthenticationGatewayFilterFactory.Config());

        MockServerHttpRequest request = MockServerHttpRequest.get("/api/v1/partner-orders")
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
        assertThat(captured[0].getHeaders().getFirst("X-User-Id")).isEqualTo("partner-uuid-001");
        // C5-4: partnerCode claim 있음 → X-Is-Partner: true
        assertThat(captured[0].getHeaders().getFirst("X-Is-Partner")).isEqualTo("true");
        assertThat(captured[0].getHeaders().getFirst(HttpHeaderConstants.PARTNER_CODE_HEADER)).isEqualTo("P001");
        // X-User-Role 미전파
        assertThat(captured[0].getHeaders().getFirst("X-User-Role")).isNull();
    }

    @Test
    @DisplayName("C5-4: Samhan 직원 JWT → X-Is-Partner=false 전파 (partnerCode claim 없음, P1-a 강화)")
    void samhanToken_withoutPartnerCodeClaim_propagatesIsPartnerFalse() {
        // Phase C5-4 P1-a: Samhan 직원 JWT 에 partnerCode claim 없음
        // → X-Is-Partner: false 를 항상 전송 (기존: 헤더 미전송 → append 취약점)
        String token = JwtTokenProvider.generate(
                "samhan-user", "MANAGER", null, false, "grp-1", 3600L, props.getSecretBytes());

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
        // C5-4 P1-a: partnerCode claim 없음 → X-Is-Partner: false (이전에는 헤더 미전송)
        assertThat(captured[0].getHeaders().getFirst("X-Is-Partner")).isEqualTo("false");
        assertThat(captured[0].getHeaders().containsKey(HttpHeaderConstants.PARTNER_CODE_HEADER)).isFalse();
    }

    @Test
    @DisplayName("P1-a: Samhan JWT + 위조 X-Is-Partner:true 입력 → downstream X-Is-Partner: false 로 강제 덮어쓰기")
    void samhanToken_withSpoofedIsPartnerHeader_downstreamReceivesFalse() {
        // P1-a 스푸핑 방지: Samhan 직원이 X-Is-Partner:true 를 위조 주입해도
        // 게이트웨이가 JWT claim 기반으로 false 로 강제 override 해야 한다.
        String token = JwtTokenProvider.generate(
                "samhan-attacker", "MANAGER", null, false, "", 3600L, props.getSecretBytes());

        GatewayFilter filter = factory.apply(new JwtAuthenticationGatewayFilterFactory.Config());

        // 공격자가 X-Is-Partner:true 를 위조 주입
        MockServerHttpRequest request = MockServerHttpRequest.get("/api/v1/partner-orders")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .header("X-Is-Partner", "true")  // 위조 입력
                .build();
        MockServerWebExchange exchange = MockServerWebExchange.from(request);

        ServerHttpRequest[] captured = new ServerHttpRequest[1];
        GatewayFilterChain chain = e -> {
            captured[0] = e.getRequest();
            return Mono.empty();
        };

        StepVerifier.create(filter.filter(exchange, chain)).verifyComplete();

        assertThat(captured[0]).isNotNull();
        // P1-a: JWT claim 기반 강제 덮어쓰기 → downstream 은 "false" 수신 (위조 "true" 차단)
        // remove-then-set 으로 위조 헤더를 제거하고 claim 기반 값으로 설정
        assertThat(captured[0].getHeaders().get("X-Is-Partner")).hasSize(1);
        assertThat(captured[0].getHeaders().getFirst("X-Is-Partner")).isEqualTo("false");
    }

    @Test
    @DisplayName("P1-a: partner JWT + 위조 X-Is-Partner:false 입력 → downstream X-Is-Partner: true 로 강제 덮어쓰기")
    void partnerToken_withSpoofedIsPartnerFalseHeader_downstreamReceivesTrue() {
        // P1-a: 파트너 계정이 X-Is-Partner:false 로 자신의 파트너 식별을 숨기려 해도
        // 게이트웨이가 JWT partnerCode claim 기반으로 true 로 강제 override 해야 한다.
        String token = JwtTokenProvider.generateForPartner(
                "partner-uuid-002", "P002", 3600L, props.getSecretBytes());

        GatewayFilter filter = factory.apply(new JwtAuthenticationGatewayFilterFactory.Config());

        // 파트너가 X-Is-Partner:false 를 위조 주입 (자기 식별 숨기기 시도)
        MockServerHttpRequest request = MockServerHttpRequest.get("/api/v1/partner-orders")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .header("X-Is-Partner", "false")  // 위조 입력
                .build();
        MockServerWebExchange exchange = MockServerWebExchange.from(request);

        ServerHttpRequest[] captured = new ServerHttpRequest[1];
        GatewayFilterChain chain = e -> {
            captured[0] = e.getRequest();
            return Mono.empty();
        };

        StepVerifier.create(filter.filter(exchange, chain)).verifyComplete();

        assertThat(captured[0]).isNotNull();
        // P1-a: JWT claim 기반 강제 덮어쓰기 → downstream 은 "true" 수신 (위조 "false" 차단)
        assertThat(captured[0].getHeaders().get("X-Is-Partner")).hasSize(1);
        assertThat(captured[0].getHeaders().getFirst("X-Is-Partner")).isEqualTo("true");
    }

    @Test
    @DisplayName("#467: partner JWT + 위조 X-Partner-Code 입력 → downstream 은 claim 값 1개만 수신")
    void partnerToken_withSpoofedPartnerCodeHeader_downstreamReceivesClaimPartnerCodeOnly() {
        String token = JwtTokenProvider.generateForPartner(
                "partner-uuid-467", "1234567890", 3600L, props.getSecretBytes());

        GatewayFilter filter = factory.apply(new JwtAuthenticationGatewayFilterFactory.Config());

        MockServerHttpRequest request = MockServerHttpRequest.get("/api/v1/partner-orders")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .header(HttpHeaderConstants.PARTNER_CODE_HEADER, "OTHER")
                .build();
        MockServerWebExchange exchange = MockServerWebExchange.from(request);

        ServerHttpRequest[] captured = new ServerHttpRequest[1];
        GatewayFilterChain chain = e -> {
            captured[0] = e.getRequest();
            return Mono.empty();
        };

        StepVerifier.create(filter.filter(exchange, chain)).verifyComplete();

        assertThat(captured[0]).isNotNull();
        assertThat(captured[0].getHeaders().get(HttpHeaderConstants.PARTNER_CODE_HEADER)).hasSize(1);
        assertThat(captured[0].getHeaders().getFirst(HttpHeaderConstants.PARTNER_CODE_HEADER))
                .isEqualTo("1234567890");
        assertThat(captured[0].getHeaders().getFirst(HttpHeaderConstants.IS_PARTNER_HEADER)).isEqualTo("true");
    }

    @Test
    @DisplayName("#467: 직원 JWT + 위조 X-Partner-Code 입력 → downstream X-Partner-Code 제거")
    void samhanToken_withSpoofedPartnerCodeHeader_downstreamPartnerCodeRemoved() {
        String token = JwtTokenProvider.generate(
                "samhan-user-467", "MANAGER", null, false, "", 3600L, props.getSecretBytes());

        GatewayFilter filter = factory.apply(new JwtAuthenticationGatewayFilterFactory.Config());

        MockServerHttpRequest request = MockServerHttpRequest.get("/api/v1/partner-orders")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .header(HttpHeaderConstants.PARTNER_CODE_HEADER, "OTHER")
                .build();
        MockServerWebExchange exchange = MockServerWebExchange.from(request);

        ServerHttpRequest[] captured = new ServerHttpRequest[1];
        GatewayFilterChain chain = e -> {
            captured[0] = e.getRequest();
            return Mono.empty();
        };

        StepVerifier.create(filter.filter(exchange, chain)).verifyComplete();

        assertThat(captured[0]).isNotNull();
        assertThat(captured[0].getHeaders().containsKey(HttpHeaderConstants.PARTNER_CODE_HEADER)).isFalse();
        assertThat(captured[0].getHeaders().getFirst(HttpHeaderConstants.IS_PARTNER_HEADER)).isEqualTo("false");
    }

    // -----------------------------------------------------------------------
    // Phase C5-3: allowedGroups 검사 테스트
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("C5-3-(a) allowedGroups 일치 → 통과 (allowedRoles 비어있음)")
    void allowedGroups_matching_passes() {
        String masterGroupId = "00000000-0000-0000-0000-000000000100";
        String managerGroupId = "00000000-0000-0000-0000-000000000101";
        String groups = masterGroupId + "," + managerGroupId;
        String token = JwtTokenProvider.generate(
                "user-mg", "MASTER", null, true, groups, 3600L, props.getSecretBytes());

        JwtAuthenticationGatewayFilterFactory.Config config =
                new JwtAuthenticationGatewayFilterFactory.Config();
        config.getAllowedGroups().add(masterGroupId);
        config.getAllowedGroups().add(managerGroupId);
        GatewayFilter filter = factory.apply(config);

        MockServerHttpRequest request = MockServerHttpRequest.get("/api/logs/audit")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .build();
        MockServerWebExchange exchange = MockServerWebExchange.from(request);

        ServerHttpRequest[] captured = new ServerHttpRequest[1];
        GatewayFilterChain chain = e -> { captured[0] = e.getRequest(); return Mono.empty(); };

        StepVerifier.create(filter.filter(exchange, chain)).verifyComplete();

        assertThat(captured[0]).isNotNull();
        assertThat(exchange.getResponse().getStatusCode()).isNotEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    @DisplayName("C5-3-(b) allowedGroups 불일치 → 403")
    void allowedGroups_notMatching_returns403() {
        String salesGroupId = "00000000-0000-0000-0000-000000000102";
        String token = JwtTokenProvider.generate(
                "user-sales", "SALES", null, false, salesGroupId, 3600L, props.getSecretBytes());

        JwtAuthenticationGatewayFilterFactory.Config config =
                new JwtAuthenticationGatewayFilterFactory.Config();
        config.getAllowedGroups().add("00000000-0000-0000-0000-000000000100");
        config.getAllowedGroups().add("00000000-0000-0000-0000-000000000101");
        GatewayFilter filter = factory.apply(config);

        MockServerHttpRequest request = MockServerHttpRequest.get("/api/logs/audit")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .build();
        MockServerWebExchange exchange = MockServerWebExchange.from(request);

        GatewayFilterChain chain = e -> Mono.empty();

        StepVerifier.create(filter.filter(exchange, chain)).verifyComplete();

        assertThat(exchange.getResponse().getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    @DisplayName("C5-3-(c) allowedGroups 비어있으면 그룹 제한 없음 (기존 라우트 영향 0)")
    void allowedGroups_empty_noGroupRestriction() {
        String token = JwtTokenProvider.generate(
                "user-plain", "MANAGER", 3600, props.getSecretBytes());

        JwtAuthenticationGatewayFilterFactory.Config config =
                new JwtAuthenticationGatewayFilterFactory.Config();
        GatewayFilter filter = factory.apply(config);

        MockServerHttpRequest request = MockServerHttpRequest.get("/api/users/me")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .build();
        MockServerWebExchange exchange = MockServerWebExchange.from(request);

        ServerHttpRequest[] captured = new ServerHttpRequest[1];
        GatewayFilterChain chain = e -> { captured[0] = e.getRequest(); return Mono.empty(); };

        StepVerifier.create(filter.filter(exchange, chain)).verifyComplete();

        assertThat(captured[0]).isNotNull();
    }

    @Test
    @DisplayName("C5-3-(d) allowedRoles 일치 + allowedGroups 불일치 → allowedGroups 로 403 (AND)")
    void allowedRolesPassButAllowedGroupsFails_returns403() {
        String token = JwtTokenProvider.generate(
                "user-m", "MASTER", null, false, "", 3600L, props.getSecretBytes());

        JwtAuthenticationGatewayFilterFactory.Config config =
                new JwtAuthenticationGatewayFilterFactory.Config();
        config.getAllowedRoles().add(com.samhanair.logis.common.security.Role.MASTER);
        config.getAllowedGroups().add("00000000-0000-0000-0000-000000000100");
        GatewayFilter filter = factory.apply(config);

        MockServerHttpRequest request = MockServerHttpRequest.get("/api/logs/audit")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .build();
        MockServerWebExchange exchange = MockServerWebExchange.from(request);

        GatewayFilterChain chain = e -> Mono.empty();

        StepVerifier.create(filter.filter(exchange, chain)).verifyComplete();

        assertThat(exchange.getResponse().getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    @DisplayName("C5-4: allowedGroups 단독 (logging-service 패턴) — 그룹 일치 시 통과, X-User-Role 미전파")
    void loggingServicePattern_allowedGroupsOnly_passesWithMatchingGroup() {
        String masterGroupId = "00000000-0000-0000-0000-000000000100";
        String token = JwtTokenProvider.generate(
                "user-admin", "MASTER", null, true, masterGroupId, 3600L, props.getSecretBytes());

        JwtAuthenticationGatewayFilterFactory.Config config =
                new JwtAuthenticationGatewayFilterFactory.Config();
        config.getAllowedGroups().add(masterGroupId);
        config.getAllowedGroups().add("00000000-0000-0000-0000-000000000101");
        GatewayFilter filter = factory.apply(config);

        MockServerHttpRequest request = MockServerHttpRequest.get("/api/logs/audit")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .build();
        MockServerWebExchange exchange = MockServerWebExchange.from(request);

        ServerHttpRequest[] captured = new ServerHttpRequest[1];
        GatewayFilterChain chain = e -> { captured[0] = e.getRequest(); return Mono.empty(); };

        StepVerifier.create(filter.filter(exchange, chain)).verifyComplete();

        assertThat(captured[0]).isNotNull();
        // C5-4: X-User-Role 미전파
        assertThat(captured[0].getHeaders().getFirst("X-User-Role")).isNull();
        assertThat(captured[0].getHeaders().getFirst("X-Is-System-Master")).isEqualTo("true");
    }

    @Test
    @DisplayName("DLQ 운영 경로: 서명된 시스템 MASTER는 그룹 claim이 없어도 통과")
    void systemMasterBypassesAllowedGroupsWhenClaimIsTrue() {
        String token = JwtTokenProvider.generate(
                "dev-master", "MASTER", null, true, "", 3600L, props.getSecretBytes());

        JwtAuthenticationGatewayFilterFactory.Config config =
                new JwtAuthenticationGatewayFilterFactory.Config();
        config.getAllowedGroups().add("00000000-0000-0000-0000-000000000100");
        config.setAllowSystemMaster(true);
        GatewayFilter filter = factory.apply(config);

        MockServerHttpRequest request = MockServerHttpRequest.get("/api/logs/dlq")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .build();
        MockServerWebExchange exchange = MockServerWebExchange.from(request);
        ServerHttpRequest[] captured = new ServerHttpRequest[1];

        StepVerifier.create(filter.filter(exchange, e -> {
            captured[0] = e.getRequest();
            return Mono.empty();
        })).verifyComplete();

        assertThat(captured[0]).isNotNull();
        assertThat(captured[0].getHeaders().getFirst("X-Is-System-Master")).isEqualTo("true");
    }

    @Test
    @DisplayName("DLQ 운영 경로: 시스템 MASTER가 아닌 계정은 그룹 없으면 계속 403")
    void nonSystemMasterStillRequiresAllowedGroup() {
        String token = JwtTokenProvider.generate(
                "manager-without-group", "MANAGER", null, false, "", 3600L, props.getSecretBytes());
        JwtAuthenticationGatewayFilterFactory.Config config =
                new JwtAuthenticationGatewayFilterFactory.Config();
        config.getAllowedGroups().add("00000000-0000-0000-0000-000000000100");
        config.setAllowSystemMaster(true);
        GatewayFilter filter = factory.apply(config);

        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/logs/dlq")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token).build());

        StepVerifier.create(filter.filter(exchange, e -> Mono.empty())).verifyComplete();

        assertThat(exchange.getResponse().getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    private static String readBody(ServerWebExchange exchange) {
        return ((MockServerHttpResponse) exchange.getResponse()).getBodyAsString().block();
    }

    private static void assertIdentityHeadersRemoved(ServerHttpRequest request) {
        for (String header : HttpHeaderConstants.INBOUND_IDENTITY_HEADERS) {
            assertThat(request.getHeaders().containsKey(header))
                    .as("%s 는 익명 요청 downstream 으로 전달되면 안 된다", header)
                    .isFalse();
        }
    }
}
