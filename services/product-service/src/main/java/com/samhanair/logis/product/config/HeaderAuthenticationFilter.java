package com.samhanair.logis.product.config;

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
 * Gateway 가 검증 후 주입한 사용자 헤더를 product-service 의 Spring Security 인증으로 변환한다.
 *
 * <p>Phase C5 후속 갱신 — X-User-Id 단독 인증 성립:
 * <ul>
 *   <li>X-User-Id 존재 시 인증 성립 — X-User-Role 은 수신되더라도 무시.</li>
 *   <li>X-User-Groups 존재 시 각 UUID 에 대해 {@code GROUP_<uuid>} authority 추가.</li>
 * </ul>
 */
public class HeaderAuthenticationFilter extends OncePerRequestFilter {
    private final String expectedAttestation;

    public HeaderAuthenticationFilter() { this(""); }
    public HeaderAuthenticationFilter(String expectedAttestation) {
        this.expectedAttestation = expectedAttestation == null ? "" : expectedAttestation;
    }

    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String USER_GROUPS_HEADER = "X-User-Groups";

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if (isPublic(request) || isInternalPath(request) || isInternalPrincipal()) {
            chain.doFilter(request, response);
            return;
        }
        if (!isGatewayAttested(request)) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            return;
        }
        String userId = request.getHeader(USER_ID_HEADER);
        String groups = request.getHeader(USER_GROUPS_HEADER);

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
        return "/swagger-ui.html".equals(path) || path.startsWith("/actuator/")
                || path.startsWith("/v3/api-docs/") || path.startsWith("/swagger-ui/");
    }
    private boolean isInternalPath(HttpServletRequest request) { return request.getRequestURI().startsWith("/products/internal/"); }
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
