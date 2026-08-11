package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.eq;

import com.samhanair.logis.accounting.domain.SalesCommissionSettlement;
import com.samhanair.logis.accounting.domain.SalesCommissionSettlementApprovalClaim;
import com.samhanair.logis.accounting.domain.SalesCommissionSettlementApprovalClaimStatus;
import com.samhanair.logis.accounting.repository.SalesCommissionSettlementApprovalClaimRepository;
import com.samhanair.logis.accounting.repository.SalesCommissionSettlementRepository;
import com.samhanair.logis.common.exception.BusinessException;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** D-G7 claim/CAS service 계약. */
class SalesCommissionSettlementApprovalClaimServiceTest {

    private final SalesCommissionSettlementRepository settlementRepository =
            mock(SalesCommissionSettlementRepository.class);
    private final SalesCommissionSettlementApprovalClaimRepository claimRepository =
            mock(SalesCommissionSettlementApprovalClaimRepository.class);
    private final Clock clock = Clock.fixed(Instant.parse("2026-08-11T03:00:00Z"), ZoneOffset.UTC);
    private final UUID settlementId = UUID.randomUUID();
    private final SalesCommissionSettlement settlement = SalesCommissionSettlement
            .createDraft(LocalDate.of(2026, 8, 11)).confirm("2026/08/11-3");

    private SalesCommissionSettlementApprovalClaimService service;

    @BeforeEach
    void setUp() {
        when(settlementRepository.findByDocumentNoAndIsDeletedFalseForUpdate("2026/08/11-3"))
                .thenReturn(Optional.of(settlement));
        when(settlementRepository.findByIdAndIsDeletedFalseForUpdate(settlementId))
                .thenReturn(Optional.of(settlement));
        when(claimRepository.findBySettlementIdAndApprovalId(any(), any())).thenReturn(Optional.empty());
        when(claimRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        service = new SalesCommissionSettlementApprovalClaimService(
                settlementRepository, claimRepository, clock);
    }

    @Test
    void reserve_createsIndependentClaimForEachApprovalOnConfirmedSettlement() {
        UUID firstApproval = UUID.randomUUID();
        UUID secondApproval = UUID.randomUUID();

        SalesCommissionSettlementApprovalClaim first = service.reserve("2026/08/11-3", firstApproval);
        SalesCommissionSettlementApprovalClaim second = service.reserve("2026/08/11-3", secondApproval);

        assertThat(first.getApprovalId()).isEqualTo(firstApproval);
        assertThat(second.getApprovalId()).isEqualTo(secondApproval);
        assertThat(first.getStatus()).isEqualTo(SalesCommissionSettlementApprovalClaimStatus.RESERVED);
        assertThat(second.getStatus()).isEqualTo(SalesCommissionSettlementApprovalClaimStatus.RESERVED);
    }

    @Test
    void assertNoActiveClaims_rejectsCancellationWhenAnyClaimIsReservedOrActive() {
        SalesCommissionSettlementApprovalClaim claim = SalesCommissionSettlementApprovalClaim.reserve(
                settlement, UUID.randomUUID(), java.time.LocalDateTime.of(2026, 8, 11, 12, 0));
        when(claimRepository.findAllBySettlementIdAndStatusIn(any(), any())).thenReturn(List.of(claim));

        assertThatThrownBy(() -> service.assertNoActiveClaims(settlementId))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void releaseByApproval_isIdempotentAndPersistsReleasedState() {
        UUID approvalId = UUID.randomUUID();
        SalesCommissionSettlementApprovalClaim claim = SalesCommissionSettlementApprovalClaim.reserve(
                settlement, approvalId, java.time.LocalDateTime.of(2026, 8, 11, 12, 0));
        when(claimRepository.findAllByApprovalIdAndStatusIn(eq(approvalId), any())).thenReturn(List.of(claim));

        service.releaseByApproval(approvalId);
        service.releaseByApproval(approvalId);

        assertThat(claim.getStatus()).isEqualTo(SalesCommissionSettlementApprovalClaimStatus.RELEASED);
        verify(claimRepository, org.mockito.Mockito.atLeastOnce()).save(claim);
    }

}
