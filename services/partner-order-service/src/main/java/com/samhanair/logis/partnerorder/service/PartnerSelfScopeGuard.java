package com.samhanair.logis.partnerorder.service;

import com.samhanair.logis.common.http.HttpHeaderConstants;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * PARTNER self-service endpoint 의 거래처 자기범위 검증 helper.
 *
 * <p>{@code @RequirePermission(partnerSelfService = true)} 는 aspect 의 PARTNER blanket deny 만
 * 해제한다. 실제 데이터 접근 범위는 service 계층에서 {@code X-Partner-Code} 와 대상 리소스의
 * partnerCode 를 대조해 강제한다.
 *
 * <p>Phase C5-4 P0 수정 — PARTNER 식별을 SecurityContext {@code ROLE_PARTNER} authority 에서
 * {@code X-Is-Partner} 헤더로 전환한다.
 * <ul>
 *   <li>구 방식: {@link org.springframework.security.core.context.SecurityContextHolder} 에서
 *       {@code ROLE_PARTNER} authority 검사 → C5-4 이후 게이트웨이가 role authority 를 미주입하면
 *       항상 false → {@code assertOwnPartner()} 자기범위 검증 skip = 타 거래처 접근(P0 보안 취약점).</li>
 *   <li>신 방식: {@link HttpServletRequest} 의 {@code X-Is-Partner} 헤더 직접 확인.
 *       {@link com.samhanair.logis.security.permission.PermissionAspect} 가 X-Is-Partner 헤더를
 *       읽는 방식과 동일 패턴. 게이트웨이가 JWT {@code partnerCode} claim 기반으로 강제 override
 *       하므로 클라이언트 위조 불가.</li>
 * </ul>
 */
@Component
public class PartnerSelfScopeGuard {

    /**
     * 현재 요청이 PARTNER 계정에서 온 것인지 확인한다.
     *
     * <p>{@code X-Is-Partner} 헤더 값이 {@code "true"} 이면 PARTNER 계정으로 판정한다.
     * 헤더는 게이트웨이가 JWT {@code partnerCode} claim 기반으로 강제 override 하므로 신뢰한다.
     *
     * @return PARTNER 계정이면 true
     */
    public boolean isPartnerAuthority() {
        try {
            ServletRequestAttributes attrs =
                    (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
            if (attrs == null) {
                return false;
            }
            HttpServletRequest request = attrs.getRequest();
            String isPartner = request.getHeader(HttpHeaderConstants.IS_PARTNER_HEADER);
            String role = request.getHeader(HttpHeaderConstants.CALLER_ROLE_HEADER);
            return "true".equalsIgnoreCase(isPartner)
                    && (role == null || role.isBlank() || "PARTNER".equalsIgnoreCase(role.trim()));
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * PARTNER 호출이면 본인 거래처 코드를 필수로 요구한다. 내부 role 은 null 을 반환해 범위 축소를 하지 않는다.
     *
     * @param callerPartnerCode {@code X-Partner-Code}
     * @return PARTNER 호출이면 정규화된 거래처 코드, 내부 role 이면 null
     */
    public String partnerScopeOrNull(String callerPartnerCode) {
        if (!isPartnerAuthority()) {
            return null;
        }
        return requirePartnerCode(callerPartnerCode);
    }

    /**
     * PARTNER 호출에서 요청 필터의 거래처 코드가 본인 거래처와 일치하는지 검증한다.
     *
     * @param requestedPartnerCode 요청 필터의 거래처 코드
     * @param callerPartnerCode {@code X-Partner-Code}
     * @return PARTNER 호출이면 본인 거래처 코드, 내부 role 이면 요청 필터 원본
     */
    public String restrictRequestedPartnerCode(String requestedPartnerCode, String callerPartnerCode) {
        String partnerScope = partnerScopeOrNull(callerPartnerCode);
        if (partnerScope == null) {
            return trimToNull(requestedPartnerCode);
        }
        String requested = trimToNull(requestedPartnerCode);
        if (requested != null && !partnerScope.equals(requested)) {
            throw new AccessDeniedException("본인 거래처 주문만 조회할 수 있습니다.");
        }
        return partnerScope;
    }

    /**
     * PARTNER 호출에서 대상 리소스의 거래처 코드가 본인 거래처인지 검증한다.
     *
     * @param resourcePartnerCode 대상 리소스 거래처 코드
     * @param callerPartnerCode {@code X-Partner-Code}
     * @param message 거부 메시지
     */
    public void assertOwnPartner(String resourcePartnerCode, String callerPartnerCode, String message) {
        if (!isPartnerAuthority()) {
            return;
        }
        String partnerScope = requirePartnerCode(callerPartnerCode);
        if (!partnerScope.equals(trimToNull(resourcePartnerCode))) {
            throw new AccessDeniedException(message);
        }
    }

    private String requirePartnerCode(String callerPartnerCode) {
        String normalized = trimToNull(callerPartnerCode);
        if (normalized == null) {
            throw new AccessDeniedException("거래처 자기범위 검증용 partnerCode 가 필요합니다.");
        }
        return normalized;
    }

    private String trimToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }
}
