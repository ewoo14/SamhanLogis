package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import org.junit.jupiter.api.Test;

class PurchaseAccountingSlipNumberGeneratorTest {

    @Test
    void format_회계전표번호는_순번_선행0을_붙이지_않는다() {
        String slipNo = PurchaseAccountingSlipNumberGenerator.format(LocalDate.of(2026, 6, 8), 42);

        assertThat(slipNo).isEqualTo("2026/06/08-42");
        assertThat(slipNo).matches("\\d{4}/\\d{2}/\\d{2}-\\d+");
        assertThat(slipNo).doesNotContain("-0");
    }

    @Test
    void next_회계전표번호_순번은_1이상이다() {
        String slipNo = new PurchaseAccountingSlipNumberGenerator().next(LocalDate.of(2026, 6, 8));

        int sequence = Integer.parseInt(slipNo.substring(slipNo.lastIndexOf('-') + 1));
        assertThat(sequence).isBetween(1, 10_000);
    }
}
