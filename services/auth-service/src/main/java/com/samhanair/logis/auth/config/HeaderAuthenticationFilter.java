package com.samhanair.logis.auth.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import com.samhanair.logis.common.http.HttpHeaderConstants;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Gateway 가 검증 후 주입한 사용자 헤더를 auth-service 의 Spring Security 인증으로 변환한다.
 *
 * <p>Phase C5 후속 갱신 — X-User-Id 단독 인증 성립:
 * <ul>
 *   <li>X-User-Id 존재 시 인증 성립 — X-User-Role 은 수신되더라도 무시.</li>
 *   <li>X-User-Groups 존재 시 각 UUID 에 대해 {@code GROUP_<uuid>} authority 추가.</li>
 * </ul>
 */
public class HeaderAuthenticationFilter extends OncePerRequestFilter {
    private final String expectedAttestation;
    private final boolean enforceAttestation;
    public HeaderAuthenticationFilter() { this("", false); }
    public HeaderAuthenticationFilter(String expectedAttestation, boolean enforceAttestation) {
        this.expectedAttestation = expectedAttestation == null ? "" : expectedAttestation;
        this.enforceAttestation = enforceAttestation;
    }

    private static final String USER_ID_HEADER = "X-User-Id";
    /** Phase C5-3: 그룹 UUID comma-join 헤더. */
    private static final String USER_GROUPS_HEADER = "X-User-Groups";

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String path = request.getRequestURI();
        if (path.startsWith("/actuator/") || path.startsWith("/auth/login") || path.startsWith("/auth/logout")
                || path.startsWith("/auth/password/") || path.startsWith("/auth/password-reset/")) { chain.doFilter(request, response); return; }
        if (enforceAttestation && !isGatewayAttested(request)) { response.setStatus(HttpServletResponse.SC_UNAUTHORIZED); return; }
        String userId = request.getHeader(USER_ID_HEADER);
        String groups = request.getHeader(USER_GROUPS_HEADER);
        if ((userId == null || userId.isBlank()) && groups != null && !groups.isBlank()) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            return;
        }

        // Phase C5-3: X-User-Id 존재 시 인증 성립 (role 부재여도 허용)
        if (userId != null && !userId.isBlank()
                && SecurityContextHolder.getContext().getAuthentication() == null) {
            List<SimpleGrantedAuthority> authorities = new ArrayList<>();
            // Phase C5-3: X-User-Groups → GROUP_<uuid> authority 추가
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

    private boolean isGatewayAttested(HttpServletRequest request) {
        String actual = request.getHeader(HttpHeaderConstants.GATEWAY_ATTESTATION_HEADER);
        if (expectedAttestation.isBlank() || actual == null || actual.isBlank()) return false;
        return MessageDigest.isEqual(expectedAttestation.getBytes(StandardCharsets.UTF_8), actual.getBytes(StandardCharsets.UTF_8));
    }
}
