package com.samhanair.logis.common.financial;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("VAT 포함 단가 총액 계산기")
class VatInclusiveUnitAmountCalculatorTest {

    @Test
    @DisplayName("수량 합계를 먼저 VAT 분리해 전표 금액에 소수 단위를 만들지 않는다")
    void splitsLineTotalBeforeMultiplying() {
        VatInclusiveUnitAmountCalculator.Breakdown result =
                VatInclusiveUnitAmountCalculator.calculate(new BigDecimal("1000.49"), 2);

        assertThat(result.totalAmount()).isEqualByComparingTo("2001");
        assertThat(result.supplyAmount()).isEqualByComparingTo("1819");
        assertThat(result.vatAmount()).isEqualByComparingTo("182");
        assertThat(result.supplyAmount().add(result.vatAmount()))
                .isEqualByComparingTo(result.totalAmount());
    }
}
