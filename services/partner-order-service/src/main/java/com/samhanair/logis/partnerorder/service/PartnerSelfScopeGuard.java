package com.samhanair.logis.partnerorder.service;

import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

/**
 * PARTNER self-service endpoint 의 거래처 자기범위 검증 helper.
 *
 * <p>{@code @RequirePermission(partnerSelfService = true)} 는 aspect 의 PARTNER blanket deny 만
 * 해제한다. 실제 데이터 접근 범위는 service 계층에서 {@code X-Partner-Code} 와 대상 리소스의
 * partnerCode 를 대조해 강제한다.
 */
@Component
public class PartnerSelfScopeGuard {

    /**
     * 현재 인증 주체가 PARTNER role 인지 확인한다.
     *
     * @return PARTNER 권한이면 true
     */
    public boolean isPartnerAuthority() {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null) {
            return false;
        }
        return authentication.getAuthorities().stream()
                .anyMatch(authority -> "ROLE_PARTNER".equals(authority.getAuthority()));
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
