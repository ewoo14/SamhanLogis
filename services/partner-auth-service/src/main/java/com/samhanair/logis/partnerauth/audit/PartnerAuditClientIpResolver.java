package com.samhanair.logis.partnerauth.audit;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Set;

/** 게이트웨이에서 검증된 감사 전용 client IP만 복원하는 resolver. */
public final class PartnerAuditClientIpResolver {
    private final Set<String> trustedGatewayAddresses;

    public PartnerAuditClientIpResolver(Set<String> trustedGatewayAddresses) {
        this.trustedGatewayAddresses = trustedGatewayAddresses == null ? Set.of() : Set.copyOf(trustedGatewayAddresses);
    }

    public String resolve(HttpServletRequest request) {
        if (isTrustedGateway(request.getRemoteAddr())) {
            String forwarded = request.getHeader("X-Audit-Client-IP");
            if (forwarded != null && !forwarded.isBlank()) return forwarded.trim();
        }
        return request.getRemoteAddr();
    }

    private boolean isTrustedGateway(String address) {
        return trustedGatewayAddresses.contains(address)
                || (trustedGatewayAddresses.contains("private") && isPrivate(address));
    }

    private static boolean isPrivate(String address) {
        if (address == null) return false;
        if (address.startsWith("10.") || address.startsWith("192.168.") || address.startsWith("172.")) {
            if (!address.startsWith("172.")) return true;
            String[] parts = address.split("\\.");
            try { int second = Integer.parseInt(parts[1]); return second >= 16 && second <= 31; }
            catch (RuntimeException ignored) { return false; }
        }
        return address.equals("::1") || address.startsWith("fc") || address.startsWith("fd");
    }
}
