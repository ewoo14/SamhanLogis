package com.samhanair.logis.partnerorder.config;

import com.samhanair.logis.common.http.HttpHeaderConstants;
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
 * Trusts the upstream gateway: when {@code X-User-Id} and {@code X-User-Role} are present,
 * a pre-authenticated token is placed in the SecurityContext so {@code @PreAuthorize} can fire.
 *
 * <p>partner-order-service 의 모든 endpoint 는 거래처 계정 (M2 partner-auth-service JWT 발급)
 * 으로 호출되므로 {@code X-User-Role=PARTNER} 가 일반적. 일부 admin endpoint 는 MASTER/MANAGER
 * role 이 필요 — controller 의 {@code @PreAuthorize} 매트릭스 참조.
 */
public class HeaderAuthenticationFilter extends OncePerRequestFilter {

    private static final String USER_ROLE_HEADER = HttpHeaderConstants.CALLER_ROLE_HEADER;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String userId = request.getHeader(HttpHeaderConstants.CALLER_ID_HEADER);
        String role = request.getHeader(USER_ROLE_HEADER);

        if (userId != null && !userId.isBlank() && role != null && !role.isBlank()
                && SecurityContextHolder.getContext().getAuthentication() == null) {
            var authority = new SimpleGrantedAuthority("ROLE_" + role);
            var auth = new UsernamePasswordAuthenticationToken(userId, null, List.of(authority));
            SecurityContextHolder.getContext().setAuthentication(auth);
        }

        chain.doFilter(request, response);
    }
}
