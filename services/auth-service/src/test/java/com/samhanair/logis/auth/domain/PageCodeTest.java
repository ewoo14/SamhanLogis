package com.samhanair.logis.auth.domain;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class PageCodeTest {

    @Test
    void accounting_salesSlip_label_회계분개_명확화() {
        assertThat(PageCode.ACCOUNTING_SALES_SLIP_LIST.getDisplayName())
                .isEqualTo("매출전표(회계분개)");
    }

    @Test
    void accounting_purchaseSlip_label_회계분개_명확화() {
        assertThat(PageCode.ACCOUNTING_PURCHASE_SLIP_LIST.getDisplayName())
                .isEqualTo("매입전표(회계분개)");
    }

    @Test
    void accounting_taxInvoiceInbound_label_세금계산서_수신() {
        assertThat(PageCode.ACCOUNTING_TAX_INVOICE_INBOUND.getCode())
                .isEqualTo("accounting.tax-invoice.inbound");
        assertThat(PageCode.ACCOUNTING_TAX_INVOICE_INBOUND.getDisplayName())
                .isEqualTo("세금계산서 수신");
    }
}
