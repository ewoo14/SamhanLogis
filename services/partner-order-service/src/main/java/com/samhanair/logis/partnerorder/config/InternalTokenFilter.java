package com.samhanair.logis.partnerorder.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * X-Internal-Token 헤더 인증 — 형제 마이크로서비스 직접 호출용 (M5 §3 옵션 A 의 slip-service
 * 콜백 또는 운영 admin 도구). 토큰 미제시 → no-op (downstream {@link HeaderAuthenticationFilter}
 * 가 X-User-* 헤더 또는 JWT 처리). 토큰 일치 → ROLE_MASTER 로 모든 endpoint 통과.
 *
 * <p>inventory-service 의 동일 패턴을 가져왔다. 헤더 존재 여부만으로 분기.
 */
public class InternalTokenFilter extends OncePerRequestFilter {

    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    public static final String INTERNAL_PRINCIPAL = "system-internal";

    private final InternalAuthProperties properties;

    public InternalTokenFilter(InternalAuthProperties properties) {
        this.properties = properties;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String supplied = request.getHeader(INTERNAL_TOKEN_HEADER);
        if (supplied == null || supplied.isBlank()) {
            chain.doFilter(request, response);
            return;
        }

        String expected = properties.getInternalToken();
        if (expected == null || expected.isBlank() || !expected.equals(supplied)) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write(
                    "{\"success\":false,\"code\":\"UNAUTHORIZED\",\"message\":\"내부 인증 토큰이 유효하지 않습니다\"}");
            return;
        }

        var authority = new SimpleGrantedAuthority("ROLE_MASTER");
        var auth = new UsernamePasswordAuthenticationToken(INTERNAL_PRINCIPAL, null, List.of(authority));
        SecurityContextHolder.getContext().setAuthentication(auth);

        chain.doFilter(request, response);
    }
}
