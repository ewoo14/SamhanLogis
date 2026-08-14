package com.samhanair.logis.accounting.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.common.http.HttpHeaderConstants;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Gateway 가 검증 후 주입한 사용자 헤더를 accounting-service 의 Spring Security 인증으로 변환한다.
 *
 * <p>Phase C5 후속 갱신 — X-User-Role 헤더가 게이트웨이에서 더 이상 주입되지 않는다.
 * 수신되더라도 ROLE_ authority 로 변환하지 않고 무시한다.
 * 401 강화 분기는 <b>identity 부분-헤더 기준으로 재키잉</b>: X-User-Id 없이 다른 identity
 * 헤더(groups/isSystemMaster)만 있으면 비정상 조합 = 명시적 401 (기존 accounting-service
 * 강화 패턴 의미 보존 — 게이트웨이는 항상 userId 를 함께 주입하므로 정상 트래픽 미해당).
 *
 * <ul>
 *   <li>X-User-Id 존재 시 인증 성립 — X-User-Role 부재여도 허용.</li>
 *   <li>X-User-Groups 존재 시 각 UUID 에 대해 {@code GROUP_<uuid>} authority 추가.</li>
 *   <li>{@code /accounting/codef/} 하위 경로는 X-User-Id 가 없으면 명시적으로 401 을 반환한다.</li>
 * </ul>
 */
public class HeaderAuthenticationFilter extends OncePerRequestFilter {

    private static final String UNAUTHORIZED_MESSAGE = "인증 정보가 올바르지 않습니다";

    private final ObjectMapper objectMapper;

    public HeaderAuthenticationFilter(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String userId = request.getHeader(HttpHeaderConstants.CALLER_ID_HEADER);
        String groups = request.getHeader(HttpHeaderConstants.USER_GROUPS_HEADER);

        // Phase C5-4 재키잉: userId 부재 + 다른 identity 헤더 존재 = 비정상 조합 → 명시적 401
        boolean hasPartialIdentity = (groups != null && !groups.isBlank())
                || request.getHeader(HttpHeaderConstants.IS_SYSTEM_MASTER_HEADER) != null;
        if ((userId == null || userId.isBlank()) && hasPartialIdentity) {
            writeUnauthorized(response);
            return;
        }
        if ((userId == null || userId.isBlank()) && request.getRequestURI().startsWith("/accounting/codef/")) {
            writeUnauthorized(response);
            return;
        }
        if (userId != null && !userId.isBlank()
                && request.getRequestURI().startsWith("/accounting/codef/")
                && !isUuid(userId)) {
            writeUnauthorized(response);
            return;
        }

        // X-User-Id 존재 시 인증 성립 (role 부재여도 허용)
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
            if ("true".equalsIgnoreCase(
                    request.getHeader(HttpHeaderConstants.IS_SYSTEM_MASTER_HEADER))) {
                authorities.add(new SimpleGrantedAuthority("SYSTEM_MASTER"));
            }
            var auth = new UsernamePasswordAuthenticationToken(userId, null, authorities);
            SecurityContextHolder.getContext().setAuthentication(auth);
        }

        chain.doFilter(request, response);
    }

    private boolean isUuid(String value) {
        try {
            UUID.fromString(value);
            return true;
        } catch (IllegalArgumentException ex) {
            return false;
        }
    }

    private void writeUnauthorized(HttpServletResponse response) throws IOException {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setCharacterEncoding("UTF-8");
        response.setContentType("application/json");
        objectMapper.writeValue(response.getWriter(),
                ApiResponse.fail(ErrorCode.UNAUTHORIZED, UNAUTHORIZED_MESSAGE));
    }
}
