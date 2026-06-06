package com.samhanair.logis.partnerorder.config;

import com.samhanair.logis.common.http.HttpHeaderConstants;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Gateway 가 검증 후 주입한 사용자 헤더를 partner-order-service 의 Spring Security 인증으로 변환한다.
 *
 * <p>partner-order-service 의 모든 endpoint 는 거래처 계정 (M2 partner-auth-service JWT 발급)
 * 으로 호출되므로 {@code X-User-Role=PARTNER} 가 일반적. 일부 admin endpoint 는 MASTER/MANAGER
 * role 이 필요 — controller 의 {@code @PreAuthorize} 매트릭스 참조.
 *
 * <p>Phase C5-3 갱신 — X-User-Id 단독 인증 성립:
 * <ul>
 *   <li>X-User-Id 존재 시 인증 성립 — X-User-Role 부재여도 허용.</li>
 *   <li>X-User-Role 존재 시 {@code ROLE_<role>} authority 추가 (기존 동작 보존).</li>
 *   <li>X-User-Groups 존재 시 각 UUID 에 대해 {@code GROUP_<uuid>} authority 추가 (신규).</li>
 * </ul>
 */
public class HeaderAuthenticationFilter extends OncePerRequestFilter {

    private static final String USER_ROLE_HEADER = HttpHeaderConstants.CALLER_ROLE_HEADER;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String userId = request.getHeader(HttpHeaderConstants.CALLER_ID_HEADER);
        String role = request.getHeader(USER_ROLE_HEADER);
        String groups = request.getHeader(HttpHeaderConstants.USER_GROUPS_HEADER);

        if (userId != null && !userId.isBlank()
                && SecurityContextHolder.getContext().getAuthentication() == null) {
            List<SimpleGrantedAuthority> authorities = new ArrayList<>();
            if (role != null && !role.isBlank()) {
                authorities.add(new SimpleGrantedAuthority("ROLE_" + role));
            }
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
