package com.samhanair.logis.common.financial;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.math.RoundingMode;
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
    @DisplayName("VAT 포함 합계 기본 분리는 기존 주문의 원 단위 절사를 보존한다")
    void splitPreservesLegacyDefault() {
        VatAmountCalculator.Split split = VatAmountCalculator.splitVatInclusive(
                new BigDecimal("110005"));

        assertThat(split.supplyAmount()).isEqualByComparingTo("100004");
        assertThat(split.vatAmount()).isEqualByComparingTo("10001");
        assertThat(split.supplyAmount().add(split.vatAmount()))
                .isEqualByComparingTo(split.lineTotal());
    }

    @Test
    @DisplayName("발행 경로는 견적과 같은 HALF_UP을 명시할 수 있다")
    void splitSupportsIssueRounding() {
        VatAmountCalculator.Split split = VatAmountCalculator.splitVatInclusive(
                new BigDecimal("110005"), RoundingMode.HALF_UP);

        assertThat(split.supplyAmount()).isEqualByComparingTo("100005");
        assertThat(split.vatAmount()).isEqualByComparingTo("10000");
    }
}
