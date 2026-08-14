package com.samhanair.logis.log.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Gateway 가 검증 후 주입한 사용자 헤더를 logging-service 인증으로 변환한다.
 *
 * <p>권한 판정은 {@code @RequirePermission} 이 auth-service 동적 권한을 재확인하므로
 * 이 필터는 사용자 식별자와 그룹 authority 주입만 담당한다.
 */
public class HeaderAuthenticationFilter extends OncePerRequestFilter {

    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String USER_GROUPS_HEADER = "X-User-Groups";

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String userId = request.getHeader(USER_ID_HEADER);
        String groups = request.getHeader(USER_GROUPS_HEADER);

        var existing = SecurityContextHolder.getContext().getAuthentication();
        if (userId != null && !userId.isBlank()
                && (existing == null || existing instanceof AnonymousAuthenticationToken)) {
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
}
