package com.samhanair.logis.groupware.config;

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

public class HeaderAuthenticationFilter extends OncePerRequestFilter {
    private final String expectedAttestation;
    private final boolean enforceAttestation;

    public HeaderAuthenticationFilter() { this("", false); }
    public HeaderAuthenticationFilter(String expectedAttestation, boolean enforceAttestation) {
        this.expectedAttestation = expectedAttestation == null ? "" : expectedAttestation;
        this.enforceAttestation = enforceAttestation;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if (isPublic(request) || isInternal(request) || isInternalPrincipal()) { chain.doFilter(request, response); return; }
        if (enforceAttestation && !isAttested(request)) { response.setStatus(HttpServletResponse.SC_UNAUTHORIZED); return; }
        String userId = request.getHeader(HttpHeaderConstants.CALLER_ID_HEADER);
        String groups = request.getHeader(HttpHeaderConstants.USER_GROUPS_HEADER);
        if (userId != null && !userId.isBlank() && SecurityContextHolder.getContext().getAuthentication() == null) {
            List<SimpleGrantedAuthority> authorities = new ArrayList<>();
            if (groups != null && !groups.isBlank()) for (String group : groups.split(",")) {
                if (!group.isBlank()) authorities.add(new SimpleGrantedAuthority("GROUP_" + group.trim()));
            }
            SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(userId, null, authorities));
        }
        chain.doFilter(request, response);
    }

    private boolean isPublic(HttpServletRequest r) { String p=r.getRequestURI(); return p.startsWith("/actuator/") || p.startsWith("/v3/api-docs/") || p.startsWith("/swagger-ui/") || "/swagger-ui.html".equals(p); }
    private boolean isInternal(HttpServletRequest r) { return r.getRequestURI().startsWith("/internal/"); }
    private boolean isInternalPrincipal() { var a=SecurityContextHolder.getContext().getAuthentication(); return a != null && com.samhanair.logis.security.InternalTokenFilter.INTERNAL_PRINCIPAL.equals(a.getName()); }
    private boolean isAttested(HttpServletRequest r) { String a=r.getHeader(HttpHeaderConstants.GATEWAY_ATTESTATION_HEADER); return !expectedAttestation.isBlank() && a != null && MessageDigest.isEqual(expectedAttestation.getBytes(StandardCharsets.UTF_8), a.getBytes(StandardCharsets.UTF_8)); }
}
