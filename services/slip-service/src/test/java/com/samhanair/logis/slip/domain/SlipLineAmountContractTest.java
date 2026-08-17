package com.samhanair.logis.slip.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.api.Test;

/** 일마감 금액 편집 경로의 VAT 포함 단가 기준 금액 계약. */
class SlipLineAmountContractTest {

    @ParameterizedTest(name = "단가 {0}원, 수량 {1}")
    @MethodSource("경계금액")
    void 경계금액도_일마감_변경에서는_단가축_계약을_따른다(String unit, int quantity, String supply, String vat, String total) {
        SlipLine line = SlipLine.createFromVatInclusive(
                null, UUID.randomUUID(), "경계 품목", null, null, 1,
                BigDecimal.ZERO, null, null);
        line.changeQuantity(quantity);
        line.changeUnitPriceWithVat(new BigDecimal(unit));

        assertThat(line.getSupplyAmount()).isEqualByComparingTo(supply);
        assertThat(line.getVatAmount()).isEqualByComparingTo(vat);
        assertThat(line.getSupplyAmount().add(line.getVatAmount())).isEqualByComparingTo(total);
    }

    static Stream<Arguments> 경계금액() {
        return Stream.of(
                Arguments.of("0", 1, "0", "0", "0"),
                Arguments.of("5", 1, "5", "0", "5"),
                Arguments.of("101", 1, "92", "9", "101"),
                Arguments.of("105", 2, "190", "20", "210"),
                Arguments.of("105", 3, "285", "30", "315"),
                Arguments.of("999999999", 3, "2727272724", "272727273", "2999999997"));
    }

    @Test
    void 음수_단가는_금액_계약에서_거부한다() {
        org.assertj.core.api.Assertions.assertThatThrownBy(() ->
                SlipLine.createFromVatInclusive(null, UUID.randomUUID(), "음수", null, null,
                        1, new BigDecimal("-1"), null, null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void VAT포함_단가를_먼저_원단위_반올림한_뒤_수량을_곱한다() {
        SlipLine line = SlipLine.createFromVatInclusive(
                null, UUID.randomUUID(), "경계 품목", null, null, 2,
                BigDecimal.ZERO, null, null);
        line.changeUnitPriceWithVat(new BigDecimal("105"));

        assertThat(line.getUnitPriceWithVat()).isEqualByComparingTo("105");
        assertThat(line.getSupplyAmount()).isEqualByComparingTo("190");
        assertThat(line.getVatAmount()).isEqualByComparingTo("20");
        assertThat(line.getLineTotal()).isEqualByComparingTo("190");
    }

    @Test
    void 단가_변경도_저장_후_재조회할_금액을_같은_계약으로_계산한다() {
        SlipLine line = SlipLine.createFromVatInclusive(
                null, UUID.randomUUID(), "경계 품목", null, null, 2,
                new BigDecimal("100"), null, null);

        line.changeUnitPriceWithVat(new BigDecimal("105"));

        assertThat(line.getSupplyAmount().add(line.getVatAmount()))
                .isEqualByComparingTo("210");
        assertThat(line.getSupplyAmount()).isEqualByComparingTo("190");
        assertThat(line.getVatAmount()).isEqualByComparingTo("20");
    }
}
