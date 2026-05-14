package com.samhanair.logis.arologis.config;

import com.samhanair.logis.arologis.service.auth.JwtIssuer;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Collections;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * 아로로지스 JWT filter — 2026-05-14 분리.
 *
 * <p>Bearer JWT → 검증 → SecurityContext 적재 + 헤더 (X-User-Id / X-User-Role) 주입.
 * 헤더 주입은 {@link HttpServletRequestWrapper} 로 controller 의 {@code @RequestHeader}
 * 매개변수 호환 ({@link HeaderAuthenticationFilter} 패턴 일관).
 *
 * <p>Bearer 미존재 시 chain 진행 (다른 filter 또는 anonymous 권한). 위변조/만료 시 401.
 */
@Component
@RequiredArgsConstructor
public class ArologisJwtFilter extends OncePerRequestFilter {

    private static final String AUTH_HEADER = "Authorization";
    private static final String BEARER_PREFIX = "Bearer ";

    private final JwtIssuer issuer;

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        String authz = req.getHeader(AUTH_HEADER);
        if (authz == null || !authz.startsWith(BEARER_PREFIX)) {
            chain.doFilter(req, res);
            return;
        }

        String token = authz.substring(BEARER_PREFIX.length());
        Claims claims;
        try {
            claims = issuer.parse(token);
        } catch (JwtException e) {
            res.sendError(HttpStatus.UNAUTHORIZED.value(), "invalid jwt");
            return;
        }

        String userId = claims.getSubject();
        String role = claims.get("role", String.class);
        if (userId == null || role == null) {
            res.sendError(HttpStatus.UNAUTHORIZED.value(), "invalid jwt claims");
            return;
        }

        UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                userId, null, List.of(new SimpleGrantedAuthority("ROLE_" + role)));
        SecurityContextHolder.getContext().setAuthentication(auth);

        // Controller 의 @RequestHeader("X-User-Id") / @RequestHeader("X-User-Role") 호환
        // (HeaderAuthenticationFilter 패턴 일관).
        Map<String, String> injected = new HashMap<>();
        injected.put("X-User-Id", userId);
        injected.put("X-User-Role", role);

        chain.doFilter(new HeaderInjectingRequestWrapper(req, injected), res);
    }

    /**
     * 신규 헤더 주입 wrapper — 기존 헤더 우선 (외부에서 헤더 위조 차단), 신규 키만 추가.
     */
    private static final class HeaderInjectingRequestWrapper extends HttpServletRequestWrapper {
        private final Map<String, String> headers;

        HeaderInjectingRequestWrapper(HttpServletRequest req, Map<String, String> headers) {
            super(req);
            this.headers = headers;
        }

        @Override
        public String getHeader(String name) {
            String original = super.getHeader(name);
            if (original != null) {
                return original;
            }
            return headers.get(name);
        }

        @Override
        public Enumeration<String> getHeaders(String name) {
            String original = super.getHeader(name);
            if (original != null) {
                return super.getHeaders(name);
            }
            String injected = headers.get(name);
            if (injected != null) {
                return Collections.enumeration(List.of(injected));
            }
            return Collections.emptyEnumeration();
        }

        @Override
        public Enumeration<String> getHeaderNames() {
            // 기존 + 신규 키 union.
            Enumeration<String> originalNames = super.getHeaderNames();
            java.util.Set<String> all = new java.util.LinkedHashSet<>();
            while (originalNames != null && originalNames.hasMoreElements()) {
                all.add(originalNames.nextElement());
            }
            all.addAll(headers.keySet());
            return Collections.enumeration(all);
        }
    }
}
