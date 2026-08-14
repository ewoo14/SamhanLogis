package com.samhanair.logis.user.config;

import com.samhanair.logis.common.http.HttpHeaderConstants;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Gateway 가 검증 후 주입한 사용자 헤더를 user-service 의 Spring Security 인증으로 변환한다.
 *
 * <p>Phase C5 후속 갱신 — X-User-Role 헤더가 게이트웨이에서 더 이상 주입되지 않는다.
 * 수신되더라도 ROLE_ authority 로 변환하지 않고 무시한다.
 * 401 강화 분기는 <b>identity 부분-헤더 기준으로 재키잉</b>: X-User-Id 없이 다른 identity
 * 헤더(groups/isSystemMaster)만 있으면 비정상 조합 = 명시적 401 (기존 user-service
 * 강화 패턴 의미 보존 — 게이트웨이는 항상 userId 를 함께 주입하므로 정상 트래픽 미해당).
 *
 * <ul>
 *   <li>X-User-Id 존재 시 인증 성립 — X-User-Role 부재여도 허용.</li>
 *   <li>X-User-Groups 존재 시 각 UUID 에 대해 {@code GROUP_<uuid>} authority 추가.</li>
 * </ul>
 */
public class HeaderAuthenticationFilter extends OncePerRequestFilter {
    private final String expectedAttestation;
    private final boolean enforceAttestation;

    public HeaderAuthenticationFilter() { this("", false); }
    public HeaderAuthenticationFilter(String expectedAttestation) { this(expectedAttestation, true); }
    public HeaderAuthenticationFilter(String expectedAttestation, boolean enforceAttestation) {
        this.expectedAttestation = expectedAttestation == null ? "" : expectedAttestation;
        this.enforceAttestation = enforceAttestation;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if (isPublic(request) || isInternalPath(request) || isInternalPrincipal()) {
            chain.doFilter(request, response);
            return;
        }
        if (enforceAttestation && !isGatewayAttested(request)) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            return;
        }
        String userId = request.getHeader(HttpHeaderConstants.CALLER_ID_HEADER);
        String groups = request.getHeader(HttpHeaderConstants.USER_GROUPS_HEADER);

        // Phase C5-4 재키잉: userId 부재 + 다른 identity 헤더 존재 = 비정상 조합 → 명시적 401
        boolean hasPartialIdentity = (groups != null && !groups.isBlank())
                || request.getHeader(HttpHeaderConstants.IS_SYSTEM_MASTER_HEADER) != null;
        if ((userId == null || userId.isBlank()) && hasPartialIdentity) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            return;
        }

        // X-User-Id 존재 시 인증 성립 (role 부재여도 허용)
        if (userId != null && !userId.isBlank()
                && SecurityContextHolder.getContext().getAuthentication() == null) {
            List<SimpleGrantedAuthority> authorities = new ArrayList<>();
            if (groups != null && !groups.isBlank()) {
                for (String groupId : groups.split(",")) {
                    String trimmed = groupId.trim();
                    if (!trimmed.isEmpty()) {
                        authorities.add(new SimpleGrantedAuthority("GROUP_" + trimmed));
                    }
                }
            }
            var auth = new UsernamePasswordAuthenticationToken(userId, null, authorities);
            SecurityContextHolder.getContext().setAuthentication(auth);
        }

        chain.doFilter(request, response);
    }

    private boolean isPublic(HttpServletRequest request) {
        String path = request.getRequestURI();
        return path.startsWith("/actuator/") || path.startsWith("/public/");
    }
    private boolean isInternalPath(HttpServletRequest request) { return request.getRequestURI().startsWith("/internal/"); }
    private boolean isInternalPrincipal() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null && com.samhanair.logis.security.InternalTokenFilter.INTERNAL_PRINCIPAL.equals(auth.getName());
    }
    private boolean isGatewayAttested(HttpServletRequest request) {
        String actual = request.getHeader(HttpHeaderConstants.GATEWAY_ATTESTATION_HEADER);
        if (expectedAttestation.isBlank() || actual == null || actual.isBlank()) return false;
        return MessageDigest.isEqual(expectedAttestation.getBytes(StandardCharsets.UTF_8),
                actual.getBytes(StandardCharsets.UTF_8));
    }
}
