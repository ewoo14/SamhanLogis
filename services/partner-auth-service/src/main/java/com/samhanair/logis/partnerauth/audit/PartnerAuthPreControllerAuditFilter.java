package com.samhanair.logis.partnerauth.audit;

import com.samhanair.logis.shared.audit.contract.AuditEventV2;
import com.samhanair.logis.shared.audit.publisher.AuditPublisher;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * partner-login의 MVC validation/security-chain 이전 실패를 감사한다.
 * 요청 본문, Authorization, User-Agent는 감사 이벤트에 복사하지 않는다.
 */
@Component
@ConditionalOnBean(AuditPublisher.class)
@Order(Ordered.HIGHEST_PRECEDENCE)
public class PartnerAuthPreControllerAuditFilter extends OncePerRequestFilter {
    private static final String LOGIN_PATH = "/api/v1/auth/partner-login";
    private final AuditPublisher auditPublisher;

    public PartnerAuthPreControllerAuditFilter(AuditPublisher auditPublisher) {
        this.auditPublisher = auditPublisher;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !LOGIN_PATH.equals(request.getRequestURI());
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        filterChain.doFilter(request, response);
        if (response.getStatus() >= 400) {
            auditPublisher.publishAfterCommit(AuditEventV2.authentication(
                    "partner-auth-service", false, LOGIN_PATH,
                    "인증 요청이 거부되었습니다", resolveClientIp(request), null));
        }
    }

    private static String resolveClientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            int comma = forwarded.indexOf(',');
            return (comma > 0 ? forwarded.substring(0, comma) : forwarded).trim();
        }
        return request.getRemoteAddr();
    }
}
