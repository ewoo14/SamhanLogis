package com.samhanair.logis.gateway.filter;

import com.samhanair.logis.common.http.HttpHeaderConstants;
import com.samhanair.logis.common.security.JwtTokenProvider;
import com.samhanair.logis.common.security.Role;
import com.samhanair.logis.gateway.config.JwtProperties;
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
 *         allowedRoles: [MASTER, MANAGER]
 *     - name: JwtAuthentication
 *       args:
 *         allowedGroups:
 *           - 00000000-0000-0000-0000-000000000100
 *           - 00000000-0000-0000-0000-000000000101
 * </pre>
 *
 * <h2>Behavior</h2>
 * <ul>
 *   <li>Missing {@code Authorization: Bearer ...} → {@code 401 UNAUTHORIZED}.</li>
 *   <li>Signature/expiry/parse failure → {@code 401 INVALID_TOKEN}.</li>
 *   <li>Authenticated but role not in allow-list → {@code 403 FORBIDDEN}.</li>
 *   <li>Authenticated but allowedGroups 가 비어있지 않고 X-User-Groups 와 교집합이 없으면
 *       → {@code 403 FORBIDDEN}.</li>
 *   <li>Otherwise: mutate request to add {@code X-User-Id}, {@code X-User-Role},
 *       and (Phase 12) {@code X-User-Department} headers, then continue.</li>
 * </ul>
 *
 * <h2>allowedRoles / allowedGroups 검사 의미 — 🚨 양쪽 동시 지정 시 AND</h2>
 * 각 목록은 비어있지 않을 때 자기 검사를 수행하는 <b>순차 검사</b>다. 따라서 두 목록을
 * <b>동시에 지정하면 양쪽 모두 통과해야 하는 AND</b> 가 된다 — groups claim 없는
 * 구버전 토큰이 role 검사를 통과해도 그룹 검사에서 403 (PR #414 dual review P1).
 * 라우트에는 한쪽만 지정한다: C5-4 전 = allowedRoles 단독, C5-4 후 = allowedGroups 단독.
 * 두 목록이 모두 비어있으면 (기본 JwtAuthentication) 역할/그룹 제한 없음 — 인증만 확인.
 *
 * <h2>Phase 12 인사 카테고리 가드</h2>
 * JWT claim {@code departmentName} 존재 시 {@code X-User-Department} 헤더로 전파.
 * claim 미존재 시 헤더 미전송 → downstream 인사 가드는 부재로 판정 → 403.
 * 기존 {@code X-User-Department} 를 사용하지 않는 endpoint 는 영향 0건 (backward compatible).
 *
 * <p>{@link JwtTokenProvider} is a stateless utility (static methods) — it
 * is intentionally instantiated nowhere; we just call its static API.
 */
@Component
public class JwtAuthenticationGatewayFilterFactory
        extends AbstractGatewayFilterFactory<JwtAuthenticationGatewayFilterFactory.Config> {

    private static final String BEARER_PREFIX = "Bearer ";
    // C5-1 P2: identity 헤더 이름은 shared HttpHeaderConstants 단일 출처로 통일
    // (게이트웨이 로컬 중복 상수 제거 — downstream 필터/Aspect 와 문자열 불일치 위험 차단).
    /** 호출자 UUID 헤더. */
    private static final String HEADER_USER_ID = HttpHeaderConstants.CALLER_ID_HEADER;
    /** 호출자 역할 헤더. */
    private static final String HEADER_USER_ROLE = HttpHeaderConstants.CALLER_ROLE_HEADER;
    /** Phase 12 인사 가드 — 소속 부서명 헤더. JWT claim {@code departmentName} 에서 추출. */
    private static final String HEADER_USER_DEPARTMENT = HttpHeaderConstants.USER_DEPARTMENT_HEADER;
    /**
     * Phase C4 — 시스템 마스터 그룹 멤버십 헤더.
     * JWT claim {@code isSystemMaster} 가 {@code true} 이면 {@code "true"}, 그 외 {@code "false"} 전송.
     * downstream {@link PermissionAspect} 가 {@code role==MASTER} OR 조건으로 bypass 판정에 사용.
     */
    private static final String HEADER_IS_SYSTEM_MASTER = HttpHeaderConstants.IS_SYSTEM_MASTER_HEADER;
    /**
     * Phase C5-1 — 계정의 활성 그룹 UUID 집합 헤더.
     * JWT claim {@code groups} (comma-join UUID 문자열) 을 그대로 전파.
     * 그룹이 없으면 빈 문자열 전송 — 헤더 부재와 구분.
     * 본 슬라이스에서는 소비처 0 (additive 전파만).
     */
    private static final String HEADER_USER_GROUPS = HttpHeaderConstants.USER_GROUPS_HEADER;

    private final JwtProperties props;

    public JwtAuthenticationGatewayFilterFactory(JwtProperties props) {
        super(Config.class);
        this.props = props;
    }

    @Override
    public List<String> shortcutFieldOrder() {
        return List.of("required");
    }

    @Override
    public GatewayFilter apply(Config config) {
        return (exchange, chain) -> {
            ServerHttpRequest request = exchange.getRequest();
            String header = request.getHeaders().getFirst(HttpHeaders.AUTHORIZATION);

            if (header == null || !header.startsWith(BEARER_PREFIX)) {
                if (config.isRequired()) {
                    return writeError(exchange, HttpStatus.UNAUTHORIZED,
                            "UNAUTHORIZED", "인증 토큰이 없습니다");
                }
                return chain.filter(exchange);
            }

            String token = header.substring(BEARER_PREFIX.length()).trim();
            Jws<Claims> jws;
            try {
                jws = JwtTokenProvider.parse(token, props.getSecretBytes());
            } catch (Exception ex) {
                return writeError(exchange, HttpStatus.UNAUTHORIZED,
                        "INVALID_TOKEN", "유효하지 않은 토큰입니다");
            }

            String userId = JwtTokenProvider.getUserId(jws);
            String roleName = JwtTokenProvider.getRole(jws);
            // Phase 12 인사 가드: JWT claim departmentName → X-User-Department 헤더 전파.
            // claim 미존재(구버전 토큰 포함) 시 null → 헤더 미전송.
            String departmentName = JwtTokenProvider.getDepartmentName(jws);
            // Phase C4: JWT claim isSystemMaster → X-Is-System-Master 헤더 전파.
            // claim 미포함(구버전 토큰 또는 비-MASTER) 시 false → "false" 전송.
            boolean isSystemMaster = JwtTokenProvider.getIsSystemMaster(jws);
            // Phase C5-1: JWT claim groups → X-User-Groups 헤더 전파.
            // claim 미포함(구버전 토큰 또는 그룹 미배속) 시 "" → 빈 문자열 전송 (소비처 0, additive).
            String groups = JwtTokenProvider.getGroups(jws);

            // allowedRoles 검사 — 비어있지 않으면 role 검사 (기존 동작 100% 보존)
            if (!config.getAllowedRoles().isEmpty()) {
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

            // allowedGroups 검사 — Phase C5-3 신규. allowedRoles 와 AND 아님·각각 독립 검사.
            // 비어있으면 그룹 제한 없음 (기존 라우트 영향 0).
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

            ServerHttpRequest.Builder requestBuilder = request.mutate()
                    .header(HEADER_USER_ID, userId)
                    .header(HEADER_USER_ROLE, roleName)
                    // Phase C4: isSystemMaster 는 항상 전송 ("true"/"false") — 헤더 부재와 false 를 구분
                    .header(HEADER_IS_SYSTEM_MASTER, String.valueOf(isSystemMaster))
                    // Phase C5-1: groups 는 항상 전송 (빈 문자열 포함) — 헤더 일관, 소비처 0 (additive)
                    .header(HEADER_USER_GROUPS, groups);
            // departmentName 이 존재할 때만 헤더 추가 — 미배정 계정은 헤더 미전송.
            // [RC7] HTTP 헤더는 ISO-8859-1 인코딩이라 한글 부서명("대표실")을 그대로 넣으면 다운스트림
            // Tomcat 이 모지바케로 역디코딩 → @hr.isExecutiveOffice() 비교 실패. UTF-8 URL-encode 하여
            // 전파하고, 수신 측(HrAuthorizationHelper)이 URL-decode 한다.
            if (departmentName != null && !departmentName.isBlank()) {
                requestBuilder.header(HEADER_USER_DEPARTMENT,
                        java.net.URLEncoder.encode(departmentName, java.nio.charset.StandardCharsets.UTF_8));
            }

            return chain.filter(exchange.mutate().request(requestBuilder.build()).build());
        };
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
