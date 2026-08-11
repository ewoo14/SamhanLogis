package com.samhanair.logis.accounting.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

class SalesCommissionRateContractTest {

    @Test
    void stores_each_rate_under_an_explicit_version() {
        SalesCommissionRateContract contract = SalesCommissionRateContract.create(
                7, new BigDecimal("0.03"), new BigDecimal("0.07"),
                new BigDecimal("0.033"), new BigDecimal("0.08"));

        assertThat(contract.getVersionNo()).isEqualTo(7);
        assertThat(contract.getCardRate()).isEqualByComparingTo("0.03");
        assertThat(contract.getExpenseRate()).isEqualByComparingTo("0.07");
        assertThat(contract.getWithholdingRate()).isEqualByComparingTo("0.033");
        assertThat(contract.getInstallRate()).isEqualByComparingTo("0.08");
    }

    @Test
    void rejects_a_non_positive_version() {
        assertThatThrownBy(() -> SalesCommissionRateContract.create(
                0, new BigDecimal("0.03"), new BigDecimal("0.08"),
                new BigDecimal("0.033"), new BigDecimal("0.08")))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
