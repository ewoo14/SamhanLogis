package com.samhanair.logis.accounting.config;

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
 * Gateway 가 검증 후 주입한 사용자 헤더를 accounting-service 의 Spring Security 인증으로 변환한다.
 *
 * <p>Phase C5-4 갱신 — X-User-Role 헤더가 게이트웨이에서 더 이상 주입되지 않는다.
 * userId 없이 role 만 있으면 401 반환하는 강화 분기는 role 헤더 소멸로 의미 상실 → 제거.
 * X-User-Id 없으면 인증 미설정 (anyRequest().authenticated() 로 401 응답).
 *
 * <ul>
 *   <li>X-User-Id 존재 시 인증 성립 — X-User-Role 부재여도 허용.</li>
 *   <li>X-User-Role 존재 시 {@code ROLE_<role>} authority 추가 (잔존 토큰 호환).</li>
 *   <li>X-User-Groups 존재 시 각 UUID 에 대해 {@code GROUP_<uuid>} authority 추가.</li>
 * </ul>
 */
public class HeaderAuthenticationFilter extends OncePerRequestFilter {

    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String USER_ROLE_HEADER = "X-User-Role";
    private static final String USER_GROUPS_HEADER = "X-User-Groups";

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String userId = request.getHeader(USER_ID_HEADER);
        String role = request.getHeader(USER_ROLE_HEADER);
        String groups = request.getHeader(USER_GROUPS_HEADER);

        // Phase C5-4: userId 없이 role 만 있으면 401 분기 제거 (role 헤더 소멸로 의미 상실).
        // X-User-Id 없으면 인증 미설정 → Spring Security anyRequest().authenticated() 가 401 처리.

        // X-User-Id 존재 시 인증 성립 (role 부재여도 허용)
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
