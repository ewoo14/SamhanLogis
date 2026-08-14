package com.samhanair.logis.partner.config;

import com.samhanair.logis.common.http.HttpHeaderConstants;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/** 게이트웨이 attestation을 검증하고 서명된 identity 헤더를 SecurityContext로 변환한다. */
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
        if ((userId == null || userId.isBlank()) && groups != null && !groups.isBlank()) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            return;
        }
        if (userId != null && !userId.isBlank()
                && SecurityContextHolder.getContext().getAuthentication() == null) {
            List<SimpleGrantedAuthority> authorities = new ArrayList<>();
            if (groups != null && !groups.isBlank()) {
                for (String groupId : groups.split(",")) {
                    String trimmed = groupId.trim();
                    if (!trimmed.isEmpty()) authorities.add(new SimpleGrantedAuthority("GROUP_" + trimmed));
                }
            }
            SecurityContextHolder.getContext().setAuthentication(
                    new UsernamePasswordAuthenticationToken(userId, null, authorities));
        }
        chain.doFilter(request, response);
    }

    private boolean isPublic(HttpServletRequest request) {
        String path = request.getRequestURI();
        return "/swagger-ui.html".equals(path) || path.startsWith("/actuator/")
                || path.startsWith("/v3/api-docs/") || path.startsWith("/swagger-ui/");
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
