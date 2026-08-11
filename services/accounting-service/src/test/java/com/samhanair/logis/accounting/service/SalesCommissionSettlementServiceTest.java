package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.domain.SalesCommissionSettlement;
import com.samhanair.logis.accounting.domain.SalesCommissionSettlementStatus;
import com.samhanair.logis.accounting.domain.SalesCommissionRateContract;
import com.samhanair.logis.accounting.domain.SalesCommissionSettlementCalculationInput;
import com.samhanair.logis.accounting.domain.SalesCommissionPaymentMethod;
import com.samhanair.logis.accounting.client.GroupwareSettlementApprovalClient;
import com.samhanair.logis.accounting.repository.SalesCommissionRateContractRepository;
import com.samhanair.logis.accounting.repository.SalesCommissionSettlementRepository;
import com.samhanair.logis.accounting.repository.SalesCommissionSettlementSnapshotHistoryRepository;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.time.LocalDate;
import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

@ExtendWith(MockitoExtension.class)
class SalesCommissionSettlementServiceTest {

    @Mock SalesCommissionSettlementRepository repository;
    @Mock SalesCommissionRateContractRepository rateContractRepository;
    @Mock SalesCommissionSettlementNumberService numberService;
    @Mock SalesCommissionSettlementSnapshotHistoryRepository historyRepository;
    @Mock GroupwareSettlementApprovalClient groupwareApprovalClient;
    @Mock SalesCommissionSettlementApprovalClaimService claimService;

    @Test
    void createDraft_doesNotAllocateNumber() {
        LocalDate date = LocalDate.of(2026, 8, 11);
        when(repository.save(any(SalesCommissionSettlement.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        SalesCommissionSettlementService service =
                new SalesCommissionSettlementService(repository, rateContractRepository, numberService);

        SalesCommissionSettlement saved = service.createDraft(date);

        assertThat(saved.getStatus()).isEqualTo(SalesCommissionSettlementStatus.DRAFT);
        assertThat(saved.getDocumentNo()).isNull();
    }

    @Test
    void confirm_allocatesNumber_thenSavesConfirmedSettlement() {
        UUID id = UUID.randomUUID();
        LocalDate date = LocalDate.of(2026, 8, 11);
        SalesCommissionSettlement draft = SalesCommissionSettlement.createDraft(date);
        when(repository.findById(id)).thenReturn(Optional.of(draft));
        when(numberService.next(date)).thenReturn("2026/08/11-1");
        when(repository.save(draft)).thenReturn(draft);
        SalesCommissionSettlementService service =
                new SalesCommissionSettlementService(repository, rateContractRepository, numberService);

        SalesCommissionSettlement confirmed = service.confirm(id);

        assertThat(confirmed.getDocumentNo()).isEqualTo("2026/08/11-1");
        assertThat(confirmed.getStatus()).isEqualTo(SalesCommissionSettlementStatus.CONFIRMED);
        verify(numberService).next(date);
        verify(repository).save(draft);
    }

    @ParameterizedTest(name = "documentNo={0}")
    @NullSource
    @ValueSource(strings = {"", "   "})
    void findByDocumentNo_rejectsNullOrBlank_beforeRepository(String documentNo) {
        SalesCommissionSettlementService service =
                new SalesCommissionSettlementService(repository, rateContractRepository, numberService);

        assertThatThrownBy(() -> service.findByDocumentNo(documentNo))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.INVALID_INPUT));

        verifyNoInteractions(repository);
    }

    @Test
    void findByDocumentNo_trimsInputBeforeRepositoryLookup() {
        SalesCommissionSettlement settlement = SalesCommissionSettlement
                .createDraft(LocalDate.of(2026, 8, 11))
                .confirm("2026/08/11-1");
        when(repository.findByDocumentNoAndIsDeletedFalse("2026/08/11-1"))
                .thenReturn(Optional.of(settlement));
        SalesCommissionSettlementService service =
                new SalesCommissionSettlementService(repository, rateContractRepository, numberService);

        SalesCommissionSettlement loaded = service.findByDocumentNo("  2026/08/11-1  ");

        assertThat(loaded).isSameAs(settlement);
        verify(repository).findByDocumentNoAndIsDeletedFalse("2026/08/11-1");
    }

    @Test
    void findByDocumentNo_returnsNotFoundForUnknownValidNumber() {
        when(repository.findByDocumentNoAndIsDeletedFalse("2099/12/28-999"))
                .thenReturn(Optional.empty());
        SalesCommissionSettlementService service =
                new SalesCommissionSettlementService(repository, rateContractRepository, numberService);

        assertThatThrownBy(() -> service.findByDocumentNo("2099/12/28-999"))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.NOT_FOUND));
    }

    @Test
    void cancelConfirmation_withoutApproval_archivesHistory_andKeepsNumber() {
        UUID id = UUID.randomUUID();
        SalesCommissionSettlement settlement = SalesCommissionSettlement.createDraft(
                LocalDate.of(2026, 8, 11)).confirm("2026/08/11-1");
        when(repository.findById(id)).thenReturn(Optional.of(settlement));
        when(groupwareApprovalClient.hasActiveSettlementApproval("2026/08/11-1")).thenReturn(false);
        when(historyRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(repository.save(settlement)).thenReturn(settlement);
        SalesCommissionSettlementService service = serviceWithApprovalGateway();

        SalesCommissionSettlement result = service.cancelConfirmation(id);

        assertThat(result.getStatus()).isEqualTo(SalesCommissionSettlementStatus.DRAFT);
        assertThat(result.getDocumentNo()).isEqualTo("2026/08/11-1");
        assertThat(result.isRecalculationRequired()).isTrue();
        verify(historyRepository).save(any());
        verify(repository).save(settlement);
    }

    @Test
    void cancelConfirmation_withApproval_isRejectedWithUserFacingReason() {
        UUID id = UUID.randomUUID();
        SalesCommissionSettlement settlement = SalesCommissionSettlement.createDraft(
                LocalDate.of(2026, 8, 11)).confirm("2026/08/11-1");
        when(repository.findById(id)).thenReturn(Optional.of(settlement));
        when(groupwareApprovalClient.hasActiveSettlementApproval("2026/08/11-1")).thenReturn(true);
        SalesCommissionSettlementService service = serviceWithApprovalGateway();

        assertThatThrownBy(() -> service.cancelConfirmation(id))
                .isInstanceOfSatisfying(BusinessException.class, exception -> {
                    assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.CONFLICT);
                    assertThat(exception.getMessage()).contains("결재가 올라가 있어");
                });

        verifyNoInteractions(historyRepository);
        verify(repository, org.mockito.Mockito.never()).save(any());
    }

    @Test
    void cancelConfirmation_withClaim_isRejectedEvenWhenGroupwareReadWasEmpty() {
        UUID id = UUID.randomUUID();
        SalesCommissionSettlement settlement = SalesCommissionSettlement.createDraft(
                LocalDate.of(2026, 8, 11)).confirm("2026/08/11-1");
        when(repository.findByIdAndIsDeletedFalseForUpdate(id)).thenReturn(Optional.of(settlement));
        when(groupwareApprovalClient.hasActiveSettlementApproval("2026/08/11-1")).thenReturn(false);
        org.mockito.Mockito.doThrow(new BusinessException(ErrorCode.CONFLICT, "claim active"))
                .when(claimService).assertNoActiveClaimsForLockedSettlement(settlement);
        SalesCommissionSettlementService service = new SalesCommissionSettlementService(
                repository, rateContractRepository, numberService, new SalesCommissionSettlementCalculator(),
                historyRepository, groupwareApprovalClient, claimService);

        assertThatThrownBy(() -> service.cancelConfirmation(id))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.CONFLICT));
        verifyNoInteractions(historyRepository);
    }

    @Test
    void confirm_afterCancellation_requiresNewCalculation() {
        UUID id = UUID.randomUUID();
        SalesCommissionSettlement settlement = SalesCommissionSettlement.createDraft(
                LocalDate.of(2026, 8, 11)).confirm("2026/08/11-1").cancelConfirmation();
        when(repository.findById(id)).thenReturn(Optional.of(settlement));
        SalesCommissionSettlementService service = serviceWithApprovalGateway();

        assertThatThrownBy(() -> service.confirm(id))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getMessage()).contains("재계산해야 합니다"));
        verifyNoInteractions(numberService);
    }

    @Test
    void changeSettlementDate_onConfirmed_isRejected() {
        UUID id = UUID.randomUUID();
        SalesCommissionSettlement settlement = SalesCommissionSettlement.createDraft(
                LocalDate.of(2026, 8, 11)).confirm("2026/08/11-1");
        when(repository.findById(id)).thenReturn(Optional.of(settlement));
        SalesCommissionSettlementService service = serviceWithApprovalGateway();

        assertThatThrownBy(() -> service.changeSettlementDate(id, LocalDate.of(2026, 8, 12)))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.CONFLICT));
    }

    @Test
    void cancelConfirmation_twice_isRejected() {
        UUID id = UUID.randomUUID();
        SalesCommissionSettlement settlement = SalesCommissionSettlement.createDraft(
                LocalDate.of(2026, 8, 11)).confirm("2026/08/11-1");
        when(repository.findById(id)).thenReturn(Optional.of(settlement));
        when(groupwareApprovalClient.hasActiveSettlementApproval("2026/08/11-1")).thenReturn(false);
        when(historyRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(repository.save(settlement)).thenReturn(settlement);
        SalesCommissionSettlementService service = serviceWithApprovalGateway();

        service.cancelConfirmation(id);

        assertThatThrownBy(() -> service.cancelConfirmation(id))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.CONFLICT));
    }

    @Test
    void dateChangedAfterCancellation_reconfirmsWithSameNumber_withoutNewSequence() {
        UUID id = UUID.randomUUID();
        SalesCommissionSettlement settlement = calculatedConfirmedSettlement();
        when(repository.findById(id)).thenReturn(Optional.of(settlement));
        when(groupwareApprovalClient.hasActiveSettlementApproval("2026/08/11-1")).thenReturn(false);
        when(historyRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(repository.save(any(SalesCommissionSettlement.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        SalesCommissionRateContract newContract = SalesCommissionRateContract.create(
                8, new BigDecimal("0.04"), new BigDecimal("0.09"),
                new BigDecimal("0.033"), new BigDecimal("0.08"));
        when(rateContractRepository.findByVersionNoAndIsDeletedFalse(8))
                .thenReturn(Optional.of(newContract));
        SalesCommissionSettlementService service = serviceWithApprovalGateway();

        service.cancelConfirmation(id);
        service.changeSettlementDate(id, LocalDate.of(2026, 8, 12));
        service.calculate(id, 8, input());
        SalesCommissionSettlement reconfirmed = service.confirm(id);

        assertThat(reconfirmed.getDocumentNo()).isEqualTo("2026/08/11-1");
        assertThat(reconfirmed.getSettlementDate()).isEqualTo(LocalDate.of(2026, 8, 12));
        assertThat(reconfirmed.getStatus()).isEqualTo(SalesCommissionSettlementStatus.CONFIRMED);
        verifyNoInteractions(numberService);
    }

    @Test
    void reconfirm_twice_isRejected() {
        UUID id = UUID.randomUUID();
        SalesCommissionSettlement settlement = SalesCommissionSettlement.createDraft(
                LocalDate.of(2026, 8, 11)).confirm("2026/08/11-1");
        when(repository.findById(id)).thenReturn(Optional.of(settlement));
        SalesCommissionSettlementService service = serviceWithApprovalGateway();

        assertThatThrownBy(() -> service.confirm(id))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.CONFLICT));
    }

    private SalesCommissionSettlement calculatedConfirmedSettlement() {
        SalesCommissionRateContract contract = SalesCommissionRateContract.create(
                7, new BigDecimal("0.03"), new BigDecimal("0.08"),
                new BigDecimal("0.033"), new BigDecimal("0.08"));
        return SalesCommissionSettlement.createDraft(LocalDate.of(2026, 8, 11))
                .recordCalculation(contract, input(), new SalesCommissionSettlementCalculator()
                        .calculate(input(), contract))
                .confirm("2026/08/11-1");
    }

    private static SalesCommissionSettlementCalculationInput input() {
        return new SalesCommissionSettlementCalculationInput(
                new BigDecimal("10000"), BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO,
                BigDecimal.ZERO, SalesCommissionPaymentMethod.CASH, false, null);
    }

    private SalesCommissionSettlementService serviceWithApprovalGateway() {
        return new SalesCommissionSettlementService(repository, rateContractRepository, numberService,
                new SalesCommissionSettlementCalculator(), historyRepository, groupwareApprovalClient);
    }
}
