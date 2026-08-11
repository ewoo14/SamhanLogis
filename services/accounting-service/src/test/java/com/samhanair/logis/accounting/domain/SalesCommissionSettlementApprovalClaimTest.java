package com.samhanair.logis.accounting.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.common.exception.BusinessException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** D-G7 결재별 claim 상태 전이와 owner/expiry 계약. */
class SalesCommissionSettlementApprovalClaimTest {

    @Test
    void claim_isOwnedByApproval_andMovesReservedToActiveThenReleased() {
        SalesCommissionSettlement settlement = SalesCommissionSettlement.createDraft(LocalDate.of(2026, 8, 11))
                .confirm("2026/08/11-3");
        UUID approvalId = UUID.randomUUID();
        LocalDateTime now = LocalDateTime.of(2026, 8, 11, 12, 0);

        SalesCommissionSettlementApprovalClaim claim =
                SalesCommissionSettlementApprovalClaim.reserve(settlement, approvalId, now);

        assertThat(claim.getApprovalId()).isEqualTo(approvalId);
        assertThat(claim.getStatus()).isEqualTo(SalesCommissionSettlementApprovalClaimStatus.RESERVED);
        assertThat(claim.getExpiresAt()).isAfter(now);

        claim.activate(now.plusSeconds(1));
        assertThat(claim.getStatus()).isEqualTo(SalesCommissionSettlementApprovalClaimStatus.ACTIVE);
        assertThat(claim.getExpiresAt()).isAfter(now.plusSeconds(1));

        claim.release();
        assertThat(claim.getStatus()).isEqualTo(SalesCommissionSettlementApprovalClaimStatus.RELEASED);
    }

    @Test
    void claim_cannotBeReservedForDraftOrActivatedAfterExpiry() {
        SalesCommissionSettlement draft = SalesCommissionSettlement.createDraft(LocalDate.of(2026, 8, 11));
        UUID approvalId = UUID.randomUUID();
        LocalDateTime now = LocalDateTime.of(2026, 8, 11, 12, 0);

        assertThatThrownBy(() -> SalesCommissionSettlementApprovalClaim.reserve(draft, approvalId, now))
                .isInstanceOf(BusinessException.class);

        SalesCommissionSettlement confirmed = draft.confirm("2026/08/11-3");
        SalesCommissionSettlementApprovalClaim claim =
                SalesCommissionSettlementApprovalClaim.reserve(confirmed, approvalId, now);

        assertThatThrownBy(() -> claim.activate(claim.getExpiresAt().plusSeconds(1)))
                .isInstanceOf(BusinessException.class);
    }
}
