package com.samhanair.logis.partnerorder.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Field;
import java.util.Arrays;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("주문 품목행 공급가액·부가세")
class PartnerOrderLineSupplyVatTest {

    @Test
    @DisplayName("주문 라인은 공급가액과 부가세를 보유하고 VAT 포함 subtotal 항등식을 제공한다")
    void orderLineExposesSupplyAndVatAmounts() {
        PartnerOrderLine line = PartnerOrderLine.create(
                UUID.randomUUID(), "MODEL-RED", "품목", "singleSets", 1,
                new java.math.BigDecimal("110005"), "끝수 검증");

        assertThat(Arrays.stream(PartnerOrderLine.class.getDeclaredFields())
                .map(Field::getName)
                .toList()).contains("supplyAmount", "vatAmount");
        assertThat(line.getSupplyAmount()).isEqualByComparingTo("100005");
        assertThat(line.getVatAmount()).isEqualByComparingTo("10000");
        assertThat(line.getSubtotal()).isEqualByComparingTo("110005");
        assertThat(line.getSupplyAmount().add(line.getVatAmount()))
                .isEqualByComparingTo(line.getLineTotal());
    }

    @Test
    @DisplayName("PRICE/SUPPLY/VAT/TOTAL 네 권위 경로가 같은 항등식을 보장한다")
    void allAuthoritiesPreserveIdentity() {
        PartnerOrderLine price = PartnerOrderLine.createFromAuthoritativeAmounts(
                UUID.randomUUID(), "PRICE", "품목", "singleSets", 1,
                new java.math.BigDecimal("110005"), null, null, null,
                PartnerOrderLine.AmountAuthority.PRICE, null);
        PartnerOrderLine supply = PartnerOrderLine.createFromAuthoritativeAmounts(
                UUID.randomUUID(), "SUPPLY", "품목", "singleSets", 1,
                null, new java.math.BigDecimal("100005"), null, null,
                PartnerOrderLine.AmountAuthority.SUPPLY, null);
        PartnerOrderLine vat = PartnerOrderLine.createFromAuthoritativeAmounts(
                UUID.randomUUID(), "VAT", "품목", "singleSets", 1,
                null, new java.math.BigDecimal("100005"), new java.math.BigDecimal("9999"), null,
                PartnerOrderLine.AmountAuthority.VAT, null);
        PartnerOrderLine total = PartnerOrderLine.createFromAuthoritativeAmounts(
                UUID.randomUUID(), "TOTAL", "품목", "singleSets", 1,
                null, null, null, new java.math.BigDecimal("110005"),
                PartnerOrderLine.AmountAuthority.TOTAL, null);

        for (PartnerOrderLine line : java.util.List.of(price, supply, vat, total)) {
            assertThat(line.getSupplyAmount().add(line.getVatAmount()))
                    .isEqualByComparingTo(line.getLineTotal());
        }
        assertThat(price.getVatAmount()).isEqualByComparingTo("10000");
        assertThat(supply.getVatAmount()).isEqualByComparingTo("10000");
        assertThat(vat.getVatAmount()).isEqualByComparingTo("9999");
        assertThat(total.getSupplyAmount()).isEqualByComparingTo("100005");
        assertThat(price.getAmountAuthority()).isEqualTo(PartnerOrderLine.AmountAuthority.PRICE);
        assertThat(supply.getAmountAuthority()).isEqualTo(PartnerOrderLine.AmountAuthority.SUPPLY);
        assertThat(vat.getAmountAuthority()).isEqualTo(PartnerOrderLine.AmountAuthority.VAT);
        assertThat(total.getAmountAuthority()).isEqualTo(PartnerOrderLine.AmountAuthority.TOTAL);
    }

    @Test
    @DisplayName("기존 주문의 DC 최종가 800000원은 레거시 HALF_UP 공급가액을 산출한다")
    void preservesLegacyDiscountedTotalSplit() {
        PartnerOrderLine line = PartnerOrderLine.createFromAuthoritativeAmounts(
                UUID.randomUUID(), "DC-800000", "품목", "singleSets", 1,
                null, null, null, new java.math.BigDecimal("800000"),
                PartnerOrderLine.AmountAuthority.TOTAL, null);

        assertThat(line.getSupplyAmount()).isEqualByComparingTo("727273");
        assertThat(line.getVatAmount()).isEqualByComparingTo("72727");
        assertThat(line.getLineTotal()).isEqualByComparingTo("800000");
    }

    @Test
    @DisplayName("레거시 주문서웹 VAT 포함 110005원은 공급가 100005원·VAT 10000원이고 음수 부호를 보존한다")
    void legacyPriceUsesLegacyVatRoundingAndNegativeSign() {
        PartnerOrderLine positive = PartnerOrderLine.createFromLegacyPrice(
                UUID.randomUUID(), "LEGACY", "품목", "singleSets", 1,
                new java.math.BigDecimal("110005"), null);
        PartnerOrderLine negative = PartnerOrderLine.createFromLegacyPrice(
                UUID.randomUUID(), "LEGACY-NEG", "품목", "singleSets", 1,
                new java.math.BigDecimal("-110005"), null);

        assertThat(positive.getSupplyAmount()).isEqualByComparingTo("100005");
        assertThat(positive.getVatAmount()).isEqualByComparingTo("10000");
        assertThat(negative.getSupplyAmount()).isEqualByComparingTo("-100005");
        assertThat(negative.getVatAmount()).isEqualByComparingTo("-10000");
    }

    @Test
    @DisplayName("R15 VAT 경계는 주문서웹 가격 경로에서도 HALF_UP으로 분리한다")
    void priceAuthorityUsesGasVatBoundaries() {
        assertSplit("5", "5", "0");
        assertSplit("6", "5", "1");
        assertSplit("11", "10", "1");
        assertSplit("800000", "727273", "72727");
    }

    private static void assertSplit(String total, String supply, String vat) {
        PartnerOrderLine line = PartnerOrderLine.create(
                UUID.randomUUID(), "R15", "품목", "singleSets", 1,
                new java.math.BigDecimal(total), null);
        assertThat(line.getSupplyAmount()).isEqualByComparingTo(supply);
        assertThat(line.getVatAmount()).isEqualByComparingTo(vat);
        assertThat(line.getSupplyAmount().add(line.getVatAmount()))
                .isEqualByComparingTo(total);
    }
}
