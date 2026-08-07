package com.samhanair.logis.slip.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** R65 #874 전표 저장 전 전역DC/고정DC 가격 계산 계약. */
class DiscountPriceCalculatorTest {

    @Test
    void globalDiscountRateIsAppliedToPartnerPrice() {
        DiscountPriceClient client = mock(DiscountPriceClient.class);
        when(client.calculatePrices(any(), any())).thenReturn(Map.of(
                "AR09TXEAAWKNEU-04", new BigDecimal("561600")));

        SlipDiscountCalculator calculator = new SlipDiscountCalculator(client);

        List<BigDecimal> prices = calculator.calculate("4348703365", List.of(
                new SlipDiscountCalculator.Line("AR09TXEAAWKNEU-04", "HOMEMULTI",
                        new BigDecimal("1080000"), null, 1)));

        assertThat(prices).containsExactly(new BigDecimal("561600"));
    }

    @Test
    void fixedDiscountRateOverridesGlobalDiscountRate() {
        DiscountPriceClient client = mock(DiscountPriceClient.class);
        when(client.calculatePrices(any(), any())).thenReturn(Map.of(
                "MCU-S6NDB1N", new BigDecimal("970200")));

        SlipDiscountCalculator calculator = new SlipDiscountCalculator(client);

        List<BigDecimal> prices = calculator.calculate("4348703365", List.of(
                new SlipDiscountCalculator.Line("MCU-S6NDB1N", "HOMEMULTI",
                        new BigDecimal("1617000"), new BigDecimal("40.00"), 1)));

        assertThat(prices).containsExactly(new BigDecimal("970200"));
    }

    @Test
    void partnerWithoutGlobalDiscountKeepsListPrice() {
        DiscountPriceClient client = mock(DiscountPriceClient.class);
        when(client.calculatePrices(any(), any())).thenReturn(Map.of());

        SlipDiscountCalculator calculator = new SlipDiscountCalculator(client);

        List<BigDecimal> prices = calculator.calculate("NO-DC-PARTNER", List.of(
                new SlipDiscountCalculator.Line("CONTROL", "HOMEMULTI",
                        new BigDecimal("100000"), null, 1)));

        assertThat(prices).containsExactly(new BigDecimal("100000"));
    }

    @Test
    void calculationCarriesDiscountExplanationWithoutUuid() {
        DiscountPriceClient client = mock(DiscountPriceClient.class);
        when(client.calculateDetailed(any(), any())).thenReturn(
                new DiscountPriceClient.CalculationResult(
                        Map.of("0", new BigDecimal("561600")),
                        Map.of("0", new BigDecimal("48")), true));

        SlipDiscountCalculator calculator = new SlipDiscountCalculator(client);

        SlipDiscountCalculator.Calculation calculation = calculator.calculateDetailed("4348703365", List.of(
                new SlipDiscountCalculator.Line("0", "HOMEMULTI", new BigDecimal("1080000"), null, 1)));

        assertThat(calculation.prices()).containsExactly(new BigDecimal("561600"));
        assertThat(calculation.discountInfo()).contains("전역DC 48%");
        assertThat(calculation.discountInfo()).doesNotContain("-");
    }

    @Test
    void requestLineCarriesLegacySingleSetFlags() {
        Map<String, Object> item = DiscountPriceClient.toRequestLine(
                new SlipDiscountCalculator.Line("AC123456P", "OTHER",
                        new BigDecimal("1000000"), null, 1));

        assertThat(item).containsEntry("is360", true);
        assertThat(item).containsEntry("is4Way", false);
        assertThat(item).containsEntry("is1Way", false);
        assertThat(item).containsEntry("isStand", false);
        assertThat(item).containsEntry("isDeluxe", false);
        assertThat(item).containsEntry("isFirstGrade", false);
    }

    @Test
    void requestLineDoesNotFlagNonAcApModel() {
        Map<String, Object> item = DiscountPriceClient.toRequestLine(
                new SlipDiscountCalculator.Line("ZZ123456P", "OTHER",
                        new BigDecimal("1000000"), null, 1));

        assertThat(item).containsEntry("is360", false);
        assertThat(item).containsEntry("is4Way", false);
        assertThat(item).containsEntry("is1Way", false);
        assertThat(item).containsEntry("isStand", false);
        assertThat(item).containsEntry("isDeluxe", false);
        assertThat(item).containsEntry("isFirstGrade", false);
    }
}
