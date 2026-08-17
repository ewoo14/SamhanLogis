package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.domain.SalesCommissionPaymentMethod;
import com.samhanair.logis.accounting.domain.SalesCommissionRateContract;
import com.samhanair.logis.accounting.domain.SalesCommissionSettlement;
import com.samhanair.logis.accounting.domain.SalesCommissionSettlementCalculationInput;
import com.samhanair.logis.accounting.repository.SalesCommissionRateContractRepository;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.accounting.repository.SalesCommissionSettlementRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class SalesCommissionSettlementCalculationServiceTest {

    @Mock SalesCommissionSettlementRepository repository;
    @Mock SalesCommissionRateContractRepository rateContractRepository;
    @Mock SalesCommissionSettlementNumberService numberService;

    @Test
    void calculate_records_the_contract_version_and_result_snapshot() {
        UUID id = UUID.randomUUID();
        SalesCommissionRateContract contract = SalesCommissionRateContract.create(
                1, new BigDecimal("0.03"), new BigDecimal("0.08"),
                new BigDecimal("0.033"), new BigDecimal("0.08"));
        SalesCommissionSettlementCalculationInput input =
                new SalesCommissionSettlementCalculationInput(
                        new BigDecimal("10000"), BigDecimal.ZERO, BigDecimal.ZERO,
                        BigDecimal.ZERO, BigDecimal.ZERO, SalesCommissionPaymentMethod.CASH,
                        false, null);
        SalesCommissionSettlement draft = SalesCommissionSettlement
                .createDraft(LocalDate.of(2026, 8, 11));
        when(repository.findById(id)).thenReturn(Optional.of(draft));
        when(repository.save(draft)).thenReturn(draft);
        when(rateContractRepository.findByVersionNoAndIsDeletedFalse(1)).thenReturn(Optional.of(contract));
        SalesCommissionSettlementService service =
                new SalesCommissionSettlementService(repository, rateContractRepository, numberService,
                        new SalesCommissionSettlementCalculator());

        SalesCommissionSettlement saved = service.calculate(id, 1, input);

        assertThat(saved.getRateContract()).isSameAs(contract);
        assertThat(saved.getExpenseAmount()).isEqualByComparingTo("-800");
        verify(repository).save(draft);
        verify(rateContractRepository).findByVersionNoAndIsDeletedFalse(1);
    }

    @Test
    void late_arriving_older_request_cannot_overwrite_newer_request_in_persistence() {
        UUID id = UUID.randomUUID();
        SalesCommissionRateContract contract = contract(1, "0.08");
        SalesCommissionSettlement draft = SalesCommissionSettlement.createDraft(LocalDate.of(2026, 8, 11));
        when(repository.findByIdForCalculationUpdate(id)).thenReturn(Optional.of(draft));
        when(repository.save(draft)).thenReturn(draft);
        when(rateContractRepository.findByVersionNoAndIsDeletedFalse(1)).thenReturn(Optional.of(contract));
        SalesCommissionSettlementService service = service();

        service.calculate(id, 1, inputWithTotal("828282"), 2L);
        service.calculate(id, 1, inputWithTotal("717171"), 1L);

        assertThat(draft.getTotalAmount()).isEqualByComparingTo("828282");
        verify(repository, org.mockito.Mockito.times(1)).save(draft);
    }

    @Test
    void normally_arriving_newer_request_is_persisted() {
        UUID id = UUID.randomUUID();
        SalesCommissionRateContract contract = contract(1, "0.08");
        SalesCommissionSettlement draft = SalesCommissionSettlement.createDraft(LocalDate.of(2026, 8, 11));
        when(repository.findByIdForCalculationUpdate(id)).thenReturn(Optional.of(draft));
        when(repository.save(draft)).thenReturn(draft);
        when(rateContractRepository.findByVersionNoAndIsDeletedFalse(1)).thenReturn(Optional.of(contract));
        SalesCommissionSettlementService service = service();

        service.calculate(id, 1, inputWithTotal("717171"), 1L);
        service.calculate(id, 1, inputWithTotal("828282"), 2L);

        assertThat(draft.getTotalAmount()).isEqualByComparingTo("828282");
        verify(repository, org.mockito.Mockito.times(2)).save(draft);
    }

    @Test
    void draft_recalculation_uses_the_new_repository_contract_version() {
        UUID id = UUID.randomUUID();
        SalesCommissionRateContract version1 = contract(1, "0.08");
        SalesCommissionRateContract version2 = contract(2, "0.07");
        SalesCommissionSettlementCalculationInput input = input();
        SalesCommissionSettlement draft = SalesCommissionSettlement
                .createDraft(LocalDate.of(2026, 8, 11));
        when(repository.findById(id)).thenReturn(Optional.of(draft));
        when(repository.save(draft)).thenReturn(draft);
        when(rateContractRepository.findByVersionNoAndIsDeletedFalse(1)).thenReturn(Optional.of(version1));
        when(rateContractRepository.findByVersionNoAndIsDeletedFalse(2)).thenReturn(Optional.of(version2));
        SalesCommissionSettlementService service = service();

        service.calculate(id, 1, input);
        service.calculate(id, 2, input);

        assertThat(draft.getStatus()).isEqualTo(
                com.samhanair.logis.accounting.domain.SalesCommissionSettlementStatus.DRAFT);
        assertThat(draft.getRateContract().getVersionNo()).isEqualTo(2);
        assertThat(draft.getAppliedExpenseRate()).isEqualByComparingTo("0.07");
        assertThat(draft.getExpenseAmount()).isEqualByComparingTo("-700");
        verify(rateContractRepository).findByVersionNoAndIsDeletedFalse(1);
        verify(rateContractRepository).findByVersionNoAndIsDeletedFalse(2);
    }

    @Test
    void calculate_returns_not_found_for_missing_active_contract_version() {
        UUID id = UUID.randomUUID();
        SalesCommissionSettlement draft = SalesCommissionSettlement
                .createDraft(LocalDate.of(2026, 8, 11));
        when(repository.findById(id)).thenReturn(Optional.of(draft));
        when(rateContractRepository.findByVersionNoAndIsDeletedFalse(99)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service().calculate(id, 99, input()))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.NOT_FOUND));
    }

    @Test
    void manual_expense_rate_overrides_only_the_expense_snapshot_for_resolved_contract() {
        UUID id = UUID.randomUUID();
        SalesCommissionRateContract version2 = contract(2, "0.07");
        SalesCommissionSettlement draft = SalesCommissionSettlement
                .createDraft(LocalDate.of(2026, 8, 11));
        when(repository.findById(id)).thenReturn(Optional.of(draft));
        when(repository.save(draft)).thenReturn(draft);
        when(rateContractRepository.findByVersionNoAndIsDeletedFalse(2)).thenReturn(Optional.of(version2));

        SalesCommissionSettlement saved = service().calculate(id, 2,
                new SalesCommissionSettlementCalculationInput(
                        new BigDecimal("10000"), BigDecimal.ZERO, BigDecimal.ZERO,
                        BigDecimal.ZERO, BigDecimal.ZERO, SalesCommissionPaymentMethod.CASH,
                        false, new BigDecimal("0.06")));

        assertThat(saved.getRateContract()).isSameAs(version2);
        assertThat(saved.getRateContract().getExpenseRate()).isEqualByComparingTo("0.07");
        assertThat(saved.getManualExpenseRate()).isEqualByComparingTo("0.06");
        assertThat(saved.getAppliedExpenseRate()).isEqualByComparingTo("0.06");
        assertThat(saved.getExpenseAmount()).isEqualByComparingTo("-600");
    }

    private SalesCommissionSettlementService service() {
        return new SalesCommissionSettlementService(repository, rateContractRepository, numberService,
                new SalesCommissionSettlementCalculator());
    }

    private static SalesCommissionRateContract contract(int version, String expenseRate) {
        return SalesCommissionRateContract.create(
                version, new BigDecimal("0.03"), new BigDecimal(expenseRate),
                new BigDecimal("0.033"), new BigDecimal("0.08"));
    }

    private static SalesCommissionSettlementCalculationInput input() {
        return new SalesCommissionSettlementCalculationInput(
                new BigDecimal("10000"), BigDecimal.ZERO, BigDecimal.ZERO,
                BigDecimal.ZERO, BigDecimal.ZERO, SalesCommissionPaymentMethod.CASH,
                false, null);
    }

    private static SalesCommissionSettlementCalculationInput inputWithTotal(String total) {
        return new SalesCommissionSettlementCalculationInput(
                new BigDecimal(total), BigDecimal.ZERO, BigDecimal.ZERO,
                BigDecimal.ZERO, BigDecimal.ZERO, SalesCommissionPaymentMethod.CASH,
                false, null);
    }

    @Test
    void confirmed_settlement_rejects_recalculation_and_keeps_original_contract_snapshot() {
        UUID id = UUID.randomUUID();
        SalesCommissionRateContract version1 = SalesCommissionRateContract.create(
                1, new BigDecimal("0.03"), new BigDecimal("0.08"),
                new BigDecimal("0.033"), new BigDecimal("0.08"));
        SalesCommissionRateContract version2 = SalesCommissionRateContract.create(
                2, new BigDecimal("0.03"), new BigDecimal("0.07"),
                new BigDecimal("0.033"), new BigDecimal("0.08"));
        SalesCommissionSettlementCalculationInput input =
                new SalesCommissionSettlementCalculationInput(
                        new BigDecimal("10000"), BigDecimal.ZERO, BigDecimal.ZERO,
                        BigDecimal.ZERO, BigDecimal.ZERO, SalesCommissionPaymentMethod.CASH,
                        false, null);
        SalesCommissionSettlement settlement = SalesCommissionSettlement
                .createDraft(LocalDate.of(2026, 8, 11));
        when(repository.findById(id)).thenReturn(Optional.of(settlement));
        when(repository.save(settlement)).thenReturn(settlement);
        when(numberService.next(settlement.getSettlementDate())).thenReturn("2026/08/11-1");
        when(rateContractRepository.findByVersionNoAndIsDeletedFalse(1)).thenReturn(Optional.of(version1));
        SalesCommissionSettlementService service =
                new SalesCommissionSettlementService(repository, rateContractRepository, numberService,
                        new SalesCommissionSettlementCalculator());

        service.calculate(id, 1, input);
        CalculationSnapshot originalSnapshot = snapshotOf(settlement);
        service.confirm(id);

        assertThatThrownBy(() -> service.calculate(id, 2, input))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.CONFLICT));
        assertThat(snapshotOf(settlement)).isEqualTo(originalSnapshot);
        assertThat(settlement.getRateContract()).isSameAs(version1);
        assertThat(settlement.getAppliedExpenseRate()).isEqualByComparingTo("0.08");
        assertThat(settlement.getExpenseAmount()).isEqualByComparingTo("-800");
        assertThat(settlement.getStatus()).isEqualTo(
                com.samhanair.logis.accounting.domain.SalesCommissionSettlementStatus.CONFIRMED);
    }

    @Test
    void confirmed_recalculation_is_rejected_before_any_rate_contract_lookup() {
        UUID id = UUID.randomUUID();
        SalesCommissionRateContract version1 = contract(1, "0.08");
        SalesCommissionSettlement settlement = SalesCommissionSettlement
                .createDraft(LocalDate.of(2026, 8, 11));
        when(repository.findById(id)).thenReturn(Optional.of(settlement));
        when(repository.save(settlement)).thenReturn(settlement);
        when(numberService.next(settlement.getSettlementDate())).thenReturn("2026/08/11-1");
        when(rateContractRepository.findByVersionNoAndIsDeletedFalse(1)).thenReturn(Optional.of(version1));
        SalesCommissionSettlementService service = service();

        service.calculate(id, 1, input());
        service.confirm(id);
        clearInvocations(rateContractRepository);

        assertThatThrownBy(() -> service.calculate(id, 999, input()))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.CONFLICT));
        assertThat(settlement.getRateContract()).isSameAs(version1);
        assertThat(settlement.getExpenseAmount()).isEqualByComparingTo("-800");
        verifyNoInteractions(rateContractRepository);
    }

    private static CalculationSnapshot snapshotOf(SalesCommissionSettlement settlement) {
        return new CalculationSnapshot(
                settlement.getRateContract(), settlement.getTotalAmount(), settlement.getEquipmentAmount(),
                settlement.getPrepaidAmount(), settlement.getInstallInputAmount(),
                settlement.getSafetyInputAmount(), settlement.getPaymentMethod(),
                settlement.getWithholdingApplied(), settlement.getManualExpenseRate(),
                settlement.getAppliedExpenseRate(), settlement.getCardAmount(), settlement.getSalesAmount(),
                settlement.getExpenseAmount(), settlement.getWithholdingAmount(), settlement.getInstallAmount(),
                settlement.getSafetyAmount(), settlement.getSubtotalAmount(), settlement.getPayoutAmount(),
                settlement.getSupplyAmount(), settlement.getVatAmount());
    }

    private record CalculationSnapshot(
            SalesCommissionRateContract rateContract,
            BigDecimal totalAmount,
            BigDecimal equipmentAmount,
            BigDecimal prepaidAmount,
            BigDecimal installInputAmount,
            BigDecimal safetyInputAmount,
            SalesCommissionPaymentMethod paymentMethod,
            Boolean withholdingApplied,
            BigDecimal manualExpenseRate,
            BigDecimal appliedExpenseRate,
            BigDecimal cardAmount,
            BigDecimal salesAmount,
            BigDecimal expenseAmount,
            BigDecimal withholdingAmount,
            BigDecimal installAmount,
            BigDecimal safetyAmount,
            BigDecimal subtotalAmount,
            BigDecimal payoutAmount,
            BigDecimal supplyAmount,
            BigDecimal vatAmount) {
    }
}
