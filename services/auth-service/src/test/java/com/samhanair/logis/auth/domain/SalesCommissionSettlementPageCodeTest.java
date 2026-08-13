package com.samhanair.logis.auth.domain;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** D-G6 전용 영업수수료 정산 pageCode 등록 계약. */
class SalesCommissionSettlementPageCodeTest {

    @Test
    void dedicatedPageCode_isRegisteredIndependentlyFromAccountingReports() {
        assertThat(PageCode.isValid("accounting.sales-commission-settlement")).isTrue();
        assertThat(PageCode.fromCode("accounting.sales-commission-settlement").getDisplayName())
                .isEqualTo("영업수수료 정산");
        assertThat(PageCode.fromCode("accounting.sales-commission-settlement"))
                .isNotEqualTo(PageCode.ACCOUNTING_REPORTS);
    }
}
