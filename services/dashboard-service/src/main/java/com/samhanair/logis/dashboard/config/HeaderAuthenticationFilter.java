package com.samhanair.logis.dashboard.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Gateway 가 검증 후 주입한 사용자 헤더를 dashboard-service 의 Spring Security 인증으로 변환한다.
 *
 * <p>Phase C5 후속 갱신 — X-User-Id 단독 인증 성립:
 * <ul>
 *   <li>X-User-Id 존재 시 인증 성립 — X-User-Role 은 수신되더라도 무시.</li>
 *   <li>X-User-Groups 존재 시 각 UUID 에 대해 {@code GROUP_<uuid>} authority 추가.</li>
 * </ul>
 */
public class HeaderAuthenticationFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(HeaderAuthenticationFilter.class);

    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String USER_GROUPS_HEADER = "X-User-Groups";
    private static final String ATTESTATION_HEADER = "X-Samhan-Gateway-Attestation";
    private final String expectedAttestation;
    private final boolean enforceAttestation;

    /** 테스트와 비-Spring 호출 호환용 생성자. Spring 런타임은 환경값을 주입한 생성자를 사용한다. */
    public HeaderAuthenticationFilter() {
        this("", false);
    }

    public HeaderAuthenticationFilter(String expectedAttestation) {
        this(expectedAttestation, true);
    }

    public HeaderAuthenticationFilter(String expectedAttestation, boolean enforceAttestation) {
        this.expectedAttestation = expectedAttestation == null ? "" : expectedAttestation;
        this.enforceAttestation = enforceAttestation;
        log.info("dashboard gateway attestation configured={}", !this.expectedAttestation.isBlank());
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
        throws ServletException, IOException {
        if (isPublic(request) || isInternalPath(request) || isInternalPrincipal()) {
            chain.doFilter(request, response);
            return;
        }
        if (enforceAttestation && !isGatewayAttested(request)) {
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED);
            return;
        }
        String userId = request.getHeader(USER_ID_HEADER);
        String groups = request.getHeader(USER_GROUPS_HEADER);

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
            var auth = new UsernamePasswordAuthenticationToken(userId, null, authorities);
            SecurityContextHolder.getContext().setAuthentication(auth);
        }

        chain.doFilter(request, response);
    }

    private boolean isInternalPrincipal() {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        return authentication != null
                && com.samhanair.logis.security.InternalTokenFilter.INTERNAL_PRINCIPAL
                        .equals(authentication.getName());
    }

    private boolean isGatewayAttested(HttpServletRequest request) {
        String actual = request.getHeader(ATTESTATION_HEADER);
        if (expectedAttestation.isBlank() || actual == null || actual.isBlank()) return false;
        return MessageDigest.isEqual(
                expectedAttestation.getBytes(StandardCharsets.UTF_8),
                actual.getBytes(StandardCharsets.UTF_8));
    }

    private boolean isPublic(HttpServletRequest request) {
        String path = request.getRequestURI();
        return "/app/version".equals(path)
                || "/swagger-ui.html".equals(path)
                || path.startsWith("/actuator/")
                || path.startsWith("/v3/api-docs/")
                || path.startsWith("/swagger-ui/");
    }

    private boolean isInternalPath(HttpServletRequest request) {
        return request.getRequestURI().startsWith("/internal/");
    }
}
