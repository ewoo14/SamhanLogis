package com.samhanair.logis.auth.config;

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
 * Gateway 가 검증 후 주입한 사용자 헤더를 auth-service 의 Spring Security 인증으로 변환한다.
 *
 * <p>Phase C5-3 갱신 — X-User-Id 단독 인증 성립:
 * <ul>
 *   <li>X-User-Id 존재 시 인증 성립 — X-User-Role 부재여도 허용 (PR-2 이후 role 완전 제거 대비).</li>
 *   <li>X-User-Role 존재 시 {@code ROLE_<role>} authority 추가 (기존 동작 보존).</li>
 *   <li>X-User-Groups 존재 시 각 UUID 에 대해 {@code GROUP_<uuid>} authority 추가 (신규).</li>
 * </ul>
 * 기존 역할 경로는 병행 유지 — behavior-preserving.
 */
public class HeaderAuthenticationFilter extends OncePerRequestFilter {

    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String USER_ROLE_HEADER = "X-User-Role";
    /** Phase C5-3: 그룹 UUID comma-join 헤더. */
    private static final String USER_GROUPS_HEADER = "X-User-Groups";

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String userId = request.getHeader(USER_ID_HEADER);
        String role = request.getHeader(USER_ROLE_HEADER);
        String groups = request.getHeader(USER_GROUPS_HEADER);

        // Phase C5-3: X-User-Id 존재 시 인증 성립 (role 부재여도 허용)
        if (userId != null && !userId.isBlank()
                && SecurityContextHolder.getContext().getAuthentication() == null) {
            List<SimpleGrantedAuthority> authorities = new ArrayList<>();
            // 기존 role 경로 — role 있을 때만 ROLE_* authority 추가 (behavior-preserving)
            if (role != null && !role.isBlank()) {
                authorities.add(new SimpleGrantedAuthority("ROLE_" + role));
            }
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
}
