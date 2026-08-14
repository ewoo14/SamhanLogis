package com.samhanair.logis.gateway.filter;

import com.samhanair.logis.common.http.HttpHeaderConstants;
import com.samhanair.logis.common.security.JwtTokenProvider;
import com.samhanair.logis.common.security.Role;
import com.samhanair.logis.gateway.config.JwtProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jws;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import lombok.Getter;
import lombok.Setter;
import org.springframework.cloud.gateway.filter.GatewayFilter;
import org.springframework.cloud.gateway.filter.factory.AbstractGatewayFilterFactory;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.core.io.buffer.DataBufferFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

/**
 * Reactive gateway filter that verifies an HS256 JWT and forwards identity
 * headers downstream.
 *
 * <h2>Configuration</h2>
 * Declared per-route in {@code application.yml}:
 * <pre>
 *   filters:
 *     - JwtAuthentication
 *     - name: JwtAuthentication
 *       args:
 *         allowedGroups:
 *           - 00000000-0000-0000-0000-000000000100
 *           - 00000000-0000-0000-0000-000000000101
 * </pre>
 *
 * <h2>Behavior</h2>
 * <ul>
 *   <li>{@code Authorization: Bearer ...} 우선 검증. 부재 시 웹 {@code access_token} 쿠키 fallback.</li>
 *   <li>둘 다 없으면 {@code 401 UNAUTHORIZED}.</li>
 *   <li>Signature/expiry/parse failure → {@code 401 INVALID_TOKEN}.</li>
 *   <li>Authenticated but allowedGroups 가 비어있지 않고 X-User-Groups 와 교집합이 없으면
 *       → {@code 403 FORBIDDEN}.</li>
 *   <li>Otherwise: mutate request to add {@code X-User-Id}, {@code X-User-Department},
 *       {@code X-User-Name},
 *       {@code X-Is-System-Master}, {@code X-User-Groups}, {@code X-Is-Partner},
 *       {@code X-Partner-Code} headers,
 *       then continue.</li>
 * </ul>
 *
 * <h2>Phase C5-4 role 와이어 제거</h2>
 * {@code X-User-Role} 헤더 주입이 제거되었다. allowedRoles Config 는 소스 계약 호환을 위해
 * 잔존하나 신규 라우트에서는 사용하지 않는다. 두 목록이 모두 비어있으면
 * 역할/그룹 제한 없음 — 인증만 확인.
 *
 * <h2>Phase C5-4 PARTNER 식별 — X-Is-Partner / X-Partner-Code 헤더 (P1-a 강화)</h2>
 * JWT {@code partnerCode} claim 존재 시 {@code X-Is-Partner: true},
 * 부재 시 {@code X-Is-Partner: false} 를 <b>항상</b> 전송한다 (remove-then-set semantics).
 * {@code X-Partner-Code} 는 claim 존재 시 claim 값으로만 주입하고, 부재 시 제거만 수행한다.
 * 이전에는 claim 존재 시만 {@code true} 를 append 했으나 Spring WebFlux
 * {@code ServerHttpRequest.Builder.header()} 가 append semantics 라 클라이언트가 위조한
 * {@code X-Is-Partner:true} 또는 {@code X-Partner-Code} 가 downstream 으로 유출될 수 있었다.
 * P1-a 에서 모든 identity
 * 헤더({@code X-User-Id/X-Is-System-Master/X-User-Groups/X-Is-Partner/X-Partner-Code/X-User-Name})를
 * {@code headers(h -> h.remove().add())} 패턴으로 강제 override 한다.
 *
 * <h2>Phase 12 인사 카테고리 가드</h2>
 * JWT claim {@code departmentName} 존재 시 {@code X-User-Department} 헤더로 전파.
 * JWT claim {@code name} 존재 시 같은 인코딩 방식으로 {@code X-User-Name} 헤더로 전파.
 * claim 미존재 시 헤더 미전송 → downstream 인사 가드는 부재로 판정 → 403.
 * 기존 {@code X-User-Department} 를 사용하지 않는 endpoint 는 영향 0건 (backward compatible).
 *
 * <p>{@link JwtTokenProvider} is a stateless utility (static methods) — it
 * is intentionally instantiated nowhere; we just call its static API.
 */
@Component
public class JwtAuthenticationGatewayFilterFactory
        extends AbstractGatewayFilterFactory<JwtAuthenticationGatewayFilterFactory.Config> {

    private static final Logger log = LoggerFactory.getLogger(JwtAuthenticationGatewayFilterFactory.class);

    private static final String BEARER_PREFIX = "Bearer ";
    /** 웹 httpOnly 인증 쿠키 이름. Bearer 가 없을 때만 fallback 으로 사용한다. */
    private static final String ACCESS_TOKEN_COOKIE = "access_token";
    // C5-1 P2: identity 헤더 이름은 shared HttpHeaderConstants 단일 출처로 통일
    // (게이트웨이 로컬 중복 상수 제거 — downstream 필터/Aspect 와 문자열 불일치 위험 차단).
    /** 호출자 UUID 헤더. */
    private static final String HEADER_USER_ID = HttpHeaderConstants.CALLER_ID_HEADER;
    /** Phase 12 인사 가드 — 소속 부서명 헤더. JWT claim {@code departmentName} 에서 추출. */
    private static final String HEADER_USER_DEPARTMENT = HttpHeaderConstants.USER_DEPARTMENT_HEADER;
    /**
     * Phase C4 — 시스템 마스터 그룹 멤버십 헤더.
     * JWT claim {@code isSystemMaster} 가 {@code true} 이면 {@code "true"}, 그 외 {@code "false"} 전송.
     * downstream {@link PermissionAspect} 가 bypass 판정에 사용.
     */
    private static final String HEADER_IS_SYSTEM_MASTER = HttpHeaderConstants.IS_SYSTEM_MASTER_HEADER;
    /**
     * Phase C5-1 — 계정의 활성 그룹 UUID 집합 헤더.
     * JWT claim {@code groups} (comma-join UUID 문자열) 을 그대로 전파.
     * 그룹이 없으면 빈 문자열 전송 — 헤더 부재와 구분.
     */
    private static final String HEADER_USER_GROUPS = HttpHeaderConstants.USER_GROUPS_HEADER;
    /**
     * Phase C5-4 — 파트너(거래처) 계정 식별 헤더.
     * JWT {@code partnerCode} claim 존재 시 {@code "true"} 주입, 부재 시 헤더 미전송.
     * downstream {@link PermissionAspect} 가 PARTNER 거절 판정에 사용한다.
     */
    private static final String HEADER_IS_PARTNER = HttpHeaderConstants.IS_PARTNER_HEADER;
    /**
     * 파트너 자기범위 검증용 거래처 코드 헤더.
     * JWT {@code partnerCode} claim 값만 신뢰해 주입한다.
     */
    private static final String HEADER_PARTNER_CODE = HttpHeaderConstants.PARTNER_CODE_HEADER;
    /** 표시명 헤더. JWT claim {@code name} 에서 추출. */
    private static final String HEADER_USER_NAME = HttpHeaderConstants.CALLER_NAME_HEADER;
    private static final String HEADER_GATEWAY_ATTESTATION = HttpHeaderConstants.GATEWAY_ATTESTATION_HEADER;

    private final JwtProperties props;
    private final String gatewayAttestation;

    public JwtAuthenticationGatewayFilterFactory(JwtProperties props) {
        this(props, null);
    }

    @Autowired
    public JwtAuthenticationGatewayFilterFactory(
            JwtProperties props,
            @Value("${app.security.gateway-attestation:}") String gatewayAttestation) {
        super(Config.class);
        this.props = props;
        this.gatewayAttestation = gatewayAttestation;
    }

    @Override
    public List<String> shortcutFieldOrder() {
        return List.of("required");
    }

    @Override
    public GatewayFilter apply(Config config) {
        return (exchange, chain) -> {
            ServerHttpRequest request = exchange.getRequest();
            String token = extractToken(request);

            if (token == null || token.isBlank()) {
                if (config.isRequired()) {
                    return writeError(exchange, HttpStatus.UNAUTHORIZED,
                            "UNAUTHORIZED", "인증 토큰이 없습니다");
                }
                // required=false 익명 통과도 신뢰된 identity 가 없으므로 클라이언트 위조 헤더는 제거만 수행한다.
                return chain.filter(stripInboundIdentityHeaders(exchange));
            }

            Jws<Claims> jws;
            try {
                jws = JwtTokenProvider.parse(token, props.getSecretBytes());
            } catch (Exception ex) {
                return writeError(exchange, HttpStatus.UNAUTHORIZED,
                        "INVALID_TOKEN", "유효하지 않은 토큰입니다");
            }

            String userId = JwtTokenProvider.getUserId(jws);
            // Phase 12 인사 가드: JWT claim departmentName → X-User-Department 헤더 전파.
            // claim 미존재(구버전 토큰 포함) 시 null → 헤더 미전송.
            String departmentName = JwtTokenProvider.getDepartmentName(jws);
            // 표시명 claim name → X-User-Name 헤더 전파. claim 미존재 시 위조 헤더 strip 만 수행.
            String displayName = JwtTokenProvider.getDisplayName(jws);
            // Phase C4: JWT claim isSystemMaster → X-Is-System-Master 헤더 전파.
            // claim 미포함(구버전 토큰 또는 비-MASTER) 시 false → "false" 전송.
            boolean isSystemMaster = JwtTokenProvider.getIsSystemMaster(jws);
            // Phase C5-1: JWT claim groups → X-User-Groups 헤더 전파.
            // claim 미포함(구버전 토큰 또는 그룹 미배속) 시 "" → 빈 문자열 전송.
            String groups = JwtTokenProvider.getGroups(jws);
            // Phase C5-4: JWT partnerCode claim 존재 시 X-Is-Partner: true 주입.
            // partner-auth-service 가 발급한 파트너 JWT 에만 포함된 claim — 신뢰 경계.
            // Samhan 직원 JWT 에는 partnerCode 없음 → 헤더 미전송.
            String partnerCode = JwtTokenProvider.getPartnerCode(jws);
            boolean isPartner = partnerCode != null && !partnerCode.isBlank();

            // allowedRoles 검사 — Phase C5-4 이후 신규 라우트는 allowedGroups 단독 사용.
            // 소스 계약 호환을 위해 잔존. 비어있으면 검사 skip.
            if (!config.getAllowedRoles().isEmpty()) {
                // Phase C5-4: role 클레임이 Samhan JWT 에서 제거되었으나 arologis JWT 는 여전히
                // role 을 포함한다. getRole 은 deprecated — 잔존 토큰 호환용.
                // role 클레임이 없으면 (Samhan JWT C5-4 이후) null 반환 → allowedRoles 검사 실패(403).
                @SuppressWarnings("deprecation")
                String roleName = JwtTokenProvider.getRole(jws);
                if (roleName == null || roleName.isBlank()) {
                    return writeError(exchange, HttpStatus.FORBIDDEN,
                            "FORBIDDEN", "권한이 없습니다");
                }
                Role role;
                try {
                    role = Role.valueOf(roleName);
                } catch (IllegalArgumentException ex) {
                    return writeError(exchange, HttpStatus.FORBIDDEN,
                            "FORBIDDEN", "권한이 없습니다");
                }
                if (!config.getAllowedRoles().contains(role)) {
                    return writeError(exchange, HttpStatus.FORBIDDEN,
                            "FORBIDDEN", "권한이 없습니다");
                }
            }

            // allowedGroups 검사 — Phase C5-3 신규. 비어있으면 그룹 제한 없음 (기존 라우트 영향 0).
            // groups claim 과 allowedGroups 의 교집합이 없으면 403.
            if (!config.getAllowedGroups().isEmpty()) {
                Set<String> tokenGroups = new java.util.HashSet<>(
                        Arrays.asList(groups.split(",")));
                // 빈 문자열 토큰 제거 (groups claim 부재 시 "" → [""] 방지)
                tokenGroups.remove("");
                boolean groupMatch = config.getAllowedGroups().stream()
                        .anyMatch(tokenGroups::contains);
                if (!groupMatch) {
                    return writeError(exchange, HttpStatus.FORBIDDEN,
                            "FORBIDDEN", "권한이 없습니다");
                }
            }

            // Phase C5-4 P1-a 스푸핑 방지: HEADER_IS_PARTNER/HEADER_PARTNER_CODE 는 JWT claim 기준으로
            // 강제 덮어써야 한다.
            // Spring WebFlux ServerHttpRequest.Builder.header() 는 append semantics 라
            // 클라이언트가 X-Is-Partner:true 또는 X-Partner-Code 를 위조 주입해도 기존 값이 남을 수 있다.
            // → 기존 헤더를 먼저 제거(headers().remove)한 뒤 claim 기반 값을 설정한다.
            // 동일하게 X-Is-System-Master, X-User-Id, X-User-Groups 도 remove-then-set 으로 보강한다.
            ServerHttpRequest.Builder requestBuilder = request.mutate()
                    .headers(h -> {
                        // 클라이언트 위조 identity 헤더를 단일 목록으로 제거 후 JWT claim 기반 값만 재주입한다.
                        // X-User-Role 도 legacy 인가 폴백 오용을 막기 위해 명시적으로 제거한다.
                        HttpHeaderConstants.INBOUND_IDENTITY_HEADERS.forEach(h::remove);
                        h.add(HEADER_USER_ID, userId);
                        // Phase C4: isSystemMaster 는 항상 전송 ("true"/"false") — 헤더 부재와 false 를 구분
                        h.add(HEADER_IS_SYSTEM_MASTER, String.valueOf(isSystemMaster));
                        // Phase C5-1: groups 는 항상 전송 (빈 문자열 포함) — 헤더 일관
                        h.add(HEADER_USER_GROUPS, groups);
                        if (gatewayAttestation != null && !gatewayAttestation.isBlank()) {
                            h.add(HEADER_GATEWAY_ATTESTATION, gatewayAttestation);
                        }
                        // Phase C5-4 P1-a: X-Is-Partner 는 항상 전송("true"/"false") — 클레임 기반 강제 덮어쓰기.
                        // isPartner=false 이면 "false" 전송 → downstream 이 "true" 위조 입력을 신뢰할 수 없게 차단.
                        h.add(HEADER_IS_PARTNER, String.valueOf(isPartner));
                        if (isPartner) {
                            // X-Partner-Code 는 PARTNER self-scope 의 테넌트 키이므로 클라이언트 입력을 신뢰하지 않고
                            // 서명 검증된 JWT partnerCode claim 값만 downstream 으로 전파한다.
                            h.add(HEADER_PARTNER_CODE, partnerCode);
                            log.debug("[C5-4-P1a] X-Is-Partner=true 강제 set — partnerCode={}", partnerCode);
                        }
                    });
            // departmentName 이 존재할 때만 헤더 추가 — 미배정 계정은 헤더 미전송.
            // [RC7] HTTP 헤더는 ISO-8859-1 인코딩이라 한글 부서명("대표실")을 그대로 넣으면 다운스트림
            // Tomcat 이 모지바케로 역디코딩 → @hr.isExecutiveOffice() 비교 실패. UTF-8 URL-encode 하여
            // 전파하고, 수신 측(HrAuthorizationHelper)이 URL-decode 한다.
            if (departmentName != null && !departmentName.isBlank()) {
                requestBuilder.headers(h -> {
                    h.remove(HEADER_USER_DEPARTMENT);
                    h.add(HEADER_USER_DEPARTMENT,
                            java.net.URLEncoder.encode(departmentName, java.nio.charset.StandardCharsets.UTF_8));
                });
            }
            // displayName 이 존재할 때만 헤더 추가 — 구토큰은 헤더 미전송.
            // X-User-Department 와 같은 UTF-8 URL-encode 방식으로 한글 표시명 헤더 손상을 방지한다.
            if (displayName != null && !displayName.isBlank()) {
                requestBuilder.headers(h -> {
                    h.remove(HEADER_USER_NAME);
                    h.add(HEADER_USER_NAME,
                            java.net.URLEncoder.encode(displayName, java.nio.charset.StandardCharsets.UTF_8));
                });
            }

            return chain.filter(exchange.mutate().request(requestBuilder.build()).build());
        };
    }

    /**
     * 요청에서 JWT 를 추출한다.
     *
     * <p>Electron 무회귀를 위해 Authorization Bearer 를 최우선으로 사용하고, Bearer 가 없을 때만
     * 웹 httpOnly {@code access_token} 쿠키를 fallback 으로 사용한다.
     */
    private static String extractToken(ServerHttpRequest request) {
        String header = request.getHeaders().getFirst(HttpHeaders.AUTHORIZATION);
        if (header != null && header.startsWith(BEARER_PREFIX)) {
            return header.substring(BEARER_PREFIX.length()).trim();
        }
        org.springframework.http.HttpCookie cookie =
                request.getCookies().getFirst(ACCESS_TOKEN_COOKIE);
        return cookie == null ? null : cookie.getValue();
    }

    private static Mono<Void> writeError(ServerWebExchange exchange,
                                         HttpStatus status,
                                         String code,
                                         String message) {
        ServerHttpResponse response = exchange.getResponse();
        response.setStatusCode(status);
        response.getHeaders().setContentType(
                MediaType.parseMediaType("application/json;charset=UTF-8"));

        String body = "{\"success\":false,\"code\":\"" + code
                + "\",\"message\":\"" + message + "\"}";
        DataBufferFactory factory = response.bufferFactory();
        DataBuffer buffer = factory.wrap(body.getBytes(StandardCharsets.UTF_8));
        return response.writeWith(Mono.just(buffer));
    }

    private static ServerWebExchange stripInboundIdentityHeaders(ServerWebExchange exchange) {
        return exchange.mutate()
                .request(exchange.getRequest().mutate()
                        .headers(headers -> HttpHeaderConstants.INBOUND_IDENTITY_HEADERS.forEach(headers::remove))
                        .build())
                .build();
    }

    /** Per-route configuration knobs for the JWT filter. */
    @Getter
    @Setter
    public static class Config {
        /** When false, the filter is permissive on missing tokens. */
        private boolean required = true;
        /** When non-empty, role must be one of these (else 403). */
        private List<Role> allowedRoles = new ArrayList<>();
        /**
         * Phase C5-3 — 허용 그룹 UUID 문자열 목록.
         *
         * <p>비어있지 않으면 JWT {@code groups} claim 과의 교집합을 검사한다.
         * 교집합이 없으면 403. 빈 리스트이면 그룹 제한 없음 (기존 라우트 영향 0).
         * allowedRoles 와 AND 아님 — 각각 독립 검사.
         */
        private List<String> allowedGroups = new ArrayList<>();
    }
}
