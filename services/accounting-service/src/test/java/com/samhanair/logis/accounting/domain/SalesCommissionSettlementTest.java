package com.samhanair.logis.accounting.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.accounting.service.SalesCommissionSettlementCalculator;
import java.math.BigDecimal;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;

class SalesCommissionSettlementTest {

    @Test
    void draft_hasNoDocumentNumber_untilConfirmed() {
        LocalDate settlementDate = LocalDate.of(2026, 8, 11);

        SalesCommissionSettlement settlement = SalesCommissionSettlement.createDraft(settlementDate);

        assertThat(settlement.getSettlementDate()).isEqualTo(settlementDate);
        assertThat(settlement.getStatus()).isEqualTo(SalesCommissionSettlementStatus.DRAFT);
        assertThat(settlement.getDocumentNo()).isNull();
    }

    @Test
    void confirm_assignsDocumentNumber_andReturnsDomainForChaining() {
        SalesCommissionSettlement settlement = SalesCommissionSettlement
                .createDraft(LocalDate.of(2026, 8, 11));

        SalesCommissionSettlement result = settlement.confirm("2026/08/11-1");

        assertThat(result).isSameAs(settlement);
        assertThat(settlement.getDocumentNo()).isEqualTo("2026/08/11-1");
        assertThat(settlement.getStatus()).isEqualTo(SalesCommissionSettlementStatus.CONFIRMED);
    }

    @Test
    void cancelConfirmation_returnsDraft_keepsNumber_andRequiresRecalculation() {
        SalesCommissionSettlement settlement = SalesCommissionSettlement
                .createDraft(LocalDate.of(2026, 8, 11))
                .confirm("2026/08/11-1");

        SalesCommissionSettlement result = settlement.cancelConfirmation();

        assertThat(result).isSameAs(settlement);
        assertThat(settlement.getStatus()).isEqualTo(SalesCommissionSettlementStatus.DRAFT);
        assertThat(settlement.getDocumentNo()).isEqualTo("2026/08/11-1");
        assertThat(settlement.isRecalculationRequired()).isTrue();
    }

    @Test
    void changeSettlementDate_isDraftOnly() {
        SalesCommissionSettlement settlement = SalesCommissionSettlement
                .createDraft(LocalDate.of(2026, 8, 11));

        settlement.changeSettlementDate(LocalDate.of(2026, 8, 12));

        assertThat(settlement.getSettlementDate()).isEqualTo(LocalDate.of(2026, 8, 12));
        assertThatThrownBy(() -> settlement.confirm("2026/08/12-1").changeSettlementDate(
                LocalDate.of(2026, 8, 13)))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.CONFLICT));
    }

    @Test
    void reconfirm_keepsOriginalDocumentNumber() {
        SalesCommissionSettlement settlement = SalesCommissionSettlement
                .createDraft(LocalDate.of(2026, 8, 11))
                .confirm("2026/08/11-1")
                .cancelConfirmation();

        SalesCommissionRateContract contract = SalesCommissionRateContract.create(
                2, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO);
        SalesCommissionSettlementCalculationInput input = new SalesCommissionSettlementCalculationInput(
                BigDecimal.TEN, BigDecimal.ONE, BigDecimal.ZERO, BigDecimal.ONE, BigDecimal.ZERO,
                SalesCommissionPaymentMethod.CASH, false, null);
        SalesCommissionSettlementCalculator calculator = new SalesCommissionSettlementCalculator();
        settlement.recordCalculation(contract, input, calculator.calculate(input, contract));

        settlement.confirm("2026/08/11-1");

        assertThat(settlement.getDocumentNo()).isEqualTo("2026/08/11-1");
        assertThat(settlement.getStatus()).isEqualTo(SalesCommissionSettlementStatus.CONFIRMED);
    }

    @Test
    void reconfirm_cannotReplaceOriginalDocumentNumber() {
        SalesCommissionSettlement settlement = SalesCommissionSettlement
                .createDraft(LocalDate.of(2026, 8, 11))
                .confirm("2026/08/11-1")
                .cancelConfirmation();

        assertThatThrownBy(() -> settlement.confirm("2026/08/12-1"))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.CONFLICT));
    }

    @Test
    void cancelSnapshotHistory_keepsPreviousRateAndAmountSeparateFromCurrentDraft() {
        SalesCommissionRateContract contract = SalesCommissionRateContract.create(
                7, new BigDecimal("0.03"), new BigDecimal("0.08"),
                new BigDecimal("0.033"), new BigDecimal("0.08"));
        SalesCommissionSettlementCalculationInput input = new SalesCommissionSettlementCalculationInput(
                new BigDecimal("10000"), BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO,
                BigDecimal.ZERO, SalesCommissionPaymentMethod.CASH, false, null);
        SalesCommissionSettlement settlement = SalesCommissionSettlement.createDraft(
                LocalDate.of(2026, 8, 11));
        SalesCommissionSettlementCalculator calculator = new SalesCommissionSettlementCalculator();
        settlement.recordCalculation(contract, input, calculator.calculate(input, contract))
                .confirm("2026/08/11-1");

        SalesCommissionSettlementSnapshotHistory history =
                SalesCommissionSettlementSnapshotHistory.capture(settlement);
        settlement.cancelConfirmation();

        assertThat(history.getRateContract().getVersionNo()).isEqualTo(7);
        assertThat(history.getTotalAmount()).isEqualByComparingTo("10000");
        assertThat(settlement.getRateContract()).isNull();
        assertThat(settlement.getTotalAmount()).isNull();
    }
}
