package com.samhanair.logis.accounting.domain;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.accounting.service.SalesCommissionSettlementCalculator;
import java.math.BigDecimal;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;

class SalesCommissionSettlementCalculationSnapshotTest {

    private final SalesCommissionSettlementCalculator calculator =
            new SalesCommissionSettlementCalculator();

    @Test
    void settlement_keeps_the_contract_version_and_calculated_snapshot() {
        SalesCommissionRateContract contract = contract(1, "0.08");
        SalesCommissionSettlementCalculationInput input = input("10000", "0");
        SalesCommissionSettlementCalculationResult result = calculator.calculate(input, contract);
        SalesCommissionSettlement settlement = SalesCommissionSettlement
                .createDraft(LocalDate.of(2026, 8, 11));

        SalesCommissionSettlement returned = settlement.recordCalculation(contract, input, result);

        assertThat(returned).isSameAs(settlement);
        assertThat(settlement.getRateContract()).isSameAs(contract);
        assertThat(settlement.getTotalAmount()).isEqualByComparingTo("10000");
        assertThat(settlement.getAppliedExpenseRate()).isEqualByComparingTo("0.08");
        assertThat(settlement.getExpenseAmount()).isEqualByComparingTo("-800");
        assertThat(settlement.getSubtotalAmount()).isEqualByComparingTo("9200");
        assertThat(settlement.getPayoutAmount()).isEqualByComparingTo("9200");
    }

    @Test
    void old_settlement_snapshot_does_not_change_when_a_new_rate_version_is_used() {
        SalesCommissionSettlementCalculationInput input = input("10000", "0");
        SalesCommissionRateContract version1 = contract(1, "0.08");
        SalesCommissionRateContract version2 = contract(2, "0.07");

        SalesCommissionSettlement oldSettlement = SalesCommissionSettlement
                .createDraft(LocalDate.of(2026, 8, 11))
                .recordCalculation(version1, input, calculator.calculate(input, version1));
        SalesCommissionSettlement newSettlement = SalesCommissionSettlement
                .createDraft(LocalDate.of(2026, 8, 12))
                .recordCalculation(version2, input, calculator.calculate(input, version2));

        assertThat(oldSettlement.getRateContract().getVersionNo()).isEqualTo(1);
        assertThat(oldSettlement.getExpenseAmount()).isEqualByComparingTo("-800");
        assertThat(newSettlement.getRateContract().getVersionNo()).isEqualTo(2);
        assertThat(newSettlement.getExpenseAmount()).isEqualByComparingTo("-700");
        assertThat(oldSettlement.getExpenseAmount()).isEqualByComparingTo("-800");
    }

    private static SalesCommissionRateContract contract(int version, String expenseRate) {
        return SalesCommissionRateContract.create(
                version, decimal("0.03"), decimal(expenseRate), decimal("0.033"), decimal("0.08"));
    }

    private static SalesCommissionSettlementCalculationInput input(String total, String prepaid) {
        return new SalesCommissionSettlementCalculationInput(
                decimal(total), decimal("0"), decimal(prepaid), decimal("0"), decimal("0"),
                SalesCommissionPaymentMethod.CASH, false, null);
    }

    private static BigDecimal decimal(String value) {
        return new BigDecimal(value);
    }

}
