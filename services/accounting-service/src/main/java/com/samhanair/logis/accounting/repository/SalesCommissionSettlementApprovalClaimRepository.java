package com.samhanair.logis.accounting.repository;

import com.samhanair.logis.accounting.domain.SalesCommissionSettlementApprovalClaim;
import com.samhanair.logis.accounting.domain.SalesCommissionSettlementApprovalClaimStatus;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** 정산 결재 참조 claim 저장소. 정산 행 잠금은 상위 service가 보유한다. */
public interface SalesCommissionSettlementApprovalClaimRepository
        extends JpaRepository<SalesCommissionSettlementApprovalClaim, UUID> {

    Optional<SalesCommissionSettlementApprovalClaim> findByClaimToken(UUID claimToken);

    Optional<SalesCommissionSettlementApprovalClaim> findBySettlementIdAndApprovalId(
            UUID settlementId, UUID approvalId);

    List<SalesCommissionSettlementApprovalClaim> findAllBySettlementIdAndStatusIn(
            UUID settlementId, List<SalesCommissionSettlementApprovalClaimStatus> statuses);

    List<SalesCommissionSettlementApprovalClaim> findAllByApprovalIdAndStatusIn(
            UUID approvalId, List<SalesCommissionSettlementApprovalClaimStatus> statuses);
}
