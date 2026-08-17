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
    @DisplayName("VAT 포함 합계 기본 분리는 레거시 원 단위 HALF_UP을 사용한다")
    void splitUsesLegacyHalfUpDefault() {
        VatAmountCalculator.Split split = VatAmountCalculator.splitVatInclusive(
                new BigDecimal("110005"));

        assertThat(split.supplyAmount()).isEqualByComparingTo("100005");
        assertThat(split.vatAmount()).isEqualByComparingTo("10000");
        assertThat(split.supplyAmount().add(split.vatAmount()))
                .isEqualByComparingTo(split.lineTotal());
    }

    @Test
    @DisplayName("기존 저장 금액을 계산해도 입력 금액은 변경하지 않는다")
    void calculationDoesNotMutateStoredAmount() {
        BigDecimal storedLineTotal = new BigDecimal("110005.00");

        VatAmountCalculator.Split split = VatAmountCalculator.splitVatInclusive(storedLineTotal);

        assertThat(storedLineTotal).isEqualByComparingTo("110005.00");
        assertThat(split.lineTotal()).isSameAs(storedLineTotal);
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
