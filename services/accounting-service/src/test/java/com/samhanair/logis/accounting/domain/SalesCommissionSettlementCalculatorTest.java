package com.samhanair.logis.accounting.domain;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.accounting.service.SalesCommissionSettlementCalculator;
import java.math.BigDecimal;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

class SalesCommissionSettlementCalculatorTest {

    private final SalesCommissionSettlementCalculator calculator =
            new SalesCommissionSettlementCalculator();

    @Test
    void legacy_formula_matches_the_original_values() {
        SalesCommissionSettlementCalculationResult result = calculator.calculate(
                input("10000000", "0", "0", "0", "0", SalesCommissionPaymentMethod.CARD, true, null),
                defaultContract());

        assertThat(result.card()).isEqualByComparingTo("-300000");
        assertThat(result.sales()).isEqualByComparingTo("9700000");
        assertThat(result.expense()).isEqualByComparingTo("-776000");
        assertThat(result.withholding()).isEqualByComparingTo("-320100");
        assertThat(result.install()).isEqualByComparingTo("0");
        assertThat(result.subtotal()).isEqualByComparingTo("8603900");
        assertThat(result.payout()).isEqualByComparingTo("8603900");
        assertThat(result.supply()).isEqualByComparingTo("7821727");
        assertThat(result.vat()).isEqualByComparingTo("782173");
    }

    @Test
    void manual_expense_rate_overrides_contract_default_rate() {
        SalesCommissionSettlementCalculationResult result = calculator.calculate(
                input("1000000", "100000", "0", "0", "0", SalesCommissionPaymentMethod.CASH,
                        false, "0.07"),
                defaultContract());

        assertThat(result.expenseRate()).isEqualByComparingTo("0.07");
        assertThat(result.expense()).isEqualByComparingTo("-63000");
        assertThat(result.subtotal()).isEqualByComparingTo("837000");
    }

    @Test
    void missing_manual_expense_rate_uses_contract_default_rate() {
        SalesCommissionSettlementCalculationResult result = calculator.calculate(
                input("1000000", "100000", "0", "0", "0", SalesCommissionPaymentMethod.CASH,
                        false, null),
                defaultContract());

        assertThat(result.expenseRate()).isEqualByComparingTo("0.08");
        assertThat(result.expense()).isEqualByComparingTo("-72000");
    }

    @Test
    void prepaid_is_applied_only_to_payout_after_subtotal() {
        SalesCommissionSettlementCalculationResult result = calculator.calculate(
                input("1000000", "0", "100000", "0", "0", SalesCommissionPaymentMethod.CASH,
                        false, null),
                defaultContract());

        assertThat(result.sales()).isEqualByComparingTo("1000000");
        assertThat(result.subtotal()).isEqualByComparingTo("920000");
        assertThat(result.payout()).isEqualByComparingTo("820000");
        assertThat(result.supply()).isEqualByComparingTo("836364");
    }

    @Test
    void installation_and_safety_are_applied_after_the_sales_base_deductions() {
        SalesCommissionSettlementCalculationResult result = calculator.calculate(
                input("1000", "100", "0", "100", "25", SalesCommissionPaymentMethod.CASH,
                        false, null),
                defaultContract());

        assertThat(result.sales()).isEqualByComparingTo("900");
        assertThat(result.expense()).isEqualByComparingTo("-72");
        assertThat(result.install()).isEqualByComparingTo("-8");
        assertThat(result.safety()).isEqualByComparingTo("-25");
        assertThat(result.subtotal()).isEqualByComparingTo("795");
        assertThat(result.supply()).isEqualByComparingTo("723");
        assertThat(result.vat()).isEqualByComparingTo("72");
    }

    @Test
    void zero_amount_remains_zero() {
        SalesCommissionSettlementCalculationResult result = calculator.calculate(
                input("0", "0", "0", "0", "0", SalesCommissionPaymentMethod.CARD, true, null),
                defaultContract());

        assertThat(result.card()).isZero();
        assertThat(result.subtotal()).isZero();
        assertThat(result.payout()).isZero();
        assertThat(result.supply()).isZero();
        assertThat(result.vat()).isZero();
    }

    @Test
    void half_won_boundary_rounds_away_from_zero() {
        SalesCommissionSettlementCalculationResult result = calculator.calculate(
                input("50", "0", "0", "0", "0", SalesCommissionPaymentMethod.CARD, false, null),
                defaultContract());

        assertThat(result.card()).isEqualByComparingTo("-2");
        assertThat(result.sales()).isEqualByComparingTo("48");
    }

    @Test
    void payout_can_be_negative_when_prepaid_exceeds_subtotal() {
        SalesCommissionSettlementCalculationResult result = calculator.calculate(
                input("0", "0", "100", "0", "0", SalesCommissionPaymentMethod.CASH, false, null),
                defaultContract());

        assertThat(result.subtotal()).isZero();
        assertThat(result.payout()).isEqualByComparingTo("-100");
    }

    @ParameterizedTest(name = "payment={0}, withholding={1}")
    @MethodSource("paymentAndWithholdingCombinations")
    void payment_and_withholding_switches_change_only_their_own_deductions(
            SalesCommissionPaymentMethod payment, boolean withholding, String expectedCard,
            String expectedWithholding) {
        SalesCommissionSettlementCalculationResult result = calculator.calculate(
                input("100000", "0", "0", "0", "0", payment, withholding, null),
                defaultContract());

        assertThat(result.card()).isEqualByComparingTo(expectedCard);
        assertThat(result.withholding()).isEqualByComparingTo(expectedWithholding);
    }

    static Stream<Arguments> paymentAndWithholdingCombinations() {
        return Stream.of(
                Arguments.of(SalesCommissionPaymentMethod.CARD, true, "-3000", "-3201"),
                Arguments.of(SalesCommissionPaymentMethod.CARD, false, "-3000", "0"),
                Arguments.of(SalesCommissionPaymentMethod.CASH, true, "0", "-3300"),
                Arguments.of(SalesCommissionPaymentMethod.CASH, false, "0", "0"));
    }

    private static SalesCommissionSettlementCalculationInput input(
            String total, String equipment, String prepaid, String install, String safety,
            SalesCommissionPaymentMethod payment, boolean withholding, String manualExpenseRate) {
        return new SalesCommissionSettlementCalculationInput(
                decimal(total), decimal(equipment), decimal(prepaid), decimal(install), decimal(safety),
                payment, withholding,
                manualExpenseRate == null ? null : decimal(manualExpenseRate));
    }

    private static SalesCommissionRateContract defaultContract() {
        return SalesCommissionRateContract.create(
                1, decimal("0.03"), decimal("0.08"), decimal("0.033"), decimal("0.08"));
    }

    private static BigDecimal decimal(String value) {
        return new BigDecimal(value);
    }
}
