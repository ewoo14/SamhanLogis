package com.samhanair.logis.common.financial;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("부가가치세 공통 계산기")
class VatAmountCalculatorTest {

    @Test
    @DisplayName("공급가액 100005의 10%는 원 단위 절사 10000이다")
    void truncatesFractionalWon() {
        assertThat(VatAmountCalculator.fromSupply(new BigDecimal("100005")))
                .isEqualByComparingTo("10000");
    }

    @Test
    @DisplayName("VAT 포함 합계 분리도 공급가액+부가세 항등식을 보존한다")
    void splitPreservesIdentity() {
        VatAmountCalculator.Split split = VatAmountCalculator.splitVatInclusive(
                new BigDecimal("110005"));

        assertThat(split.supplyAmount()).isEqualByComparingTo("100004");
        assertThat(split.vatAmount()).isEqualByComparingTo("10001");
        assertThat(split.supplyAmount().add(split.vatAmount()))
                .isEqualByComparingTo(split.lineTotal());
    }
}
