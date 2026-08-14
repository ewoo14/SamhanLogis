package com.samhanair.logis.arologis.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Gateway 가 검증 후 주입한 사용자 헤더를 arologis-service 의 Spring Security 인증으로 변환한다.
 *
 * <p>기존 인증(자체 JWT ArologisJwtFilter 등) 이 있으면 스킵 — 아로로지스 독립 운영 단위 유지.
 *
 * <p>Phase C5 후속 갱신 — X-User-Id 단독 인증 성립:
 * <ul>
 *   <li>X-User-Id 존재 시 인증 성립 — X-User-Role 은 수신되더라도 무시.</li>
 *   <li>X-User-Groups 존재 시 각 UUID 에 대해 {@code GROUP_<uuid>} authority 추가.</li>
 * </ul>
 */
public class HeaderAuthenticationFilter extends OncePerRequestFilter {

    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String USER_GROUPS_HEADER = "X-User-Groups";
    private static final String GATEWAY_ATTESTATION_HEADER = "X-Samhan-Gateway-Attestation";
    private final String gatewayAttestation;

    public HeaderAuthenticationFilter() {
        this(null);
    }

    public HeaderAuthenticationFilter(String gatewayAttestation) {
        this.gatewayAttestation = gatewayAttestation;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        // 자체 로그인/refresh는 사용자 identity를 아직 만들기 전의 공개 경로다.
        // gateway 공개 route가 헤더를 strip하며, 서비스 직결에서도 inbound 헤더를 인증 입력으로 읽지 않는다.
        String path = request.getServletPath();
        return "/auth/admin/login".equals(path)
                || "/auth/driver/login".equals(path)
                || "/auth/refresh".equals(path);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        // 기존 인증(아로로지스 자체 JWT 등)이 있으면 스킵 — 독립 운영 단위 유지
        var existing = SecurityContextHolder.getContext().getAuthentication();
        if (existing != null && existing.isAuthenticated()) {
            chain.doFilter(request, response);
            return;
        }

        String userId = request.getHeader(USER_ID_HEADER);
        String groups = request.getHeader(USER_GROUPS_HEADER);

        if (userId != null && !userId.isBlank()
                && SecurityContextHolder.getContext().getAuthentication() == null) {
            if (!isValidGatewayAttestation(request.getHeader(GATEWAY_ATTESTATION_HEADER))) {
                response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "gateway attestation required");
                return;
            }
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

    private boolean isValidGatewayAttestation(String supplied) {
        if (gatewayAttestation == null || gatewayAttestation.isBlank()
                || supplied == null || supplied.isBlank()) {
            return false;
        }
        byte[] expected = gatewayAttestation.getBytes(StandardCharsets.UTF_8);
        byte[] actual = supplied.getBytes(StandardCharsets.UTF_8);
        return java.security.MessageDigest.isEqual(expected, actual);
    }
}
