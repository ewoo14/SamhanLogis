package com.samhanair.logis.accounting.web.dto;

import com.samhanair.logis.accounting.domain.SalesCommissionSettlementApprovalClaim;
import com.samhanair.logis.accounting.domain.SalesCommissionSettlementApprovalClaimStatus;
import java.time.LocalDateTime;
import java.util.UUID;

/** claim token은 내부 service 간 호출에만 전달한다. */
public record SettlementApprovalClaimResponse(
        UUID claimToken,
        SalesCommissionSettlementApprovalClaimStatus status,
        LocalDateTime expiresAt) {

    public static SettlementApprovalClaimResponse from(SalesCommissionSettlementApprovalClaim claim) {
        return new SettlementApprovalClaimResponse(claim.getClaimToken(), claim.getStatus(), claim.getExpiresAt());
    }
}
