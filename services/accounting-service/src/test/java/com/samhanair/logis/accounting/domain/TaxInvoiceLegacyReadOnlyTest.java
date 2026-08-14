package com.samhanair.logis.accounting.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.lang.reflect.Field;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class TaxInvoiceLegacyReadOnlyTest {

    @Test
    void marker_없는_신규_세금계산서는_기존처럼_수정_가능하다() {
        TaxInvoice invoice = TaxInvoice.create(
                UUID.randomUUID(), "P-001", "정상 거래처", null,
                LocalDate.of(2026, 8, 14), "메모", TaxInvoiceType.SALES);

        invoice.updateBasic(invoice.getPartnerId(), invoice.getPartnerCode(),
                invoice.getPartnerBusinessNo(), "수정 거래처", invoice.getPartnerAddress(),
                invoice.getSupplyDate(), invoice.getDescription());

        assertThat(invoice.isLegacyReadOnly()).isFalse();
        assertThat(invoice.getPartnerName()).isEqualTo("수정 거래처");
    }

    @Test
    void marker가_붙은_legacy는_수정과_발행_경로를_거부한다() throws Exception {
        TaxInvoice invoice = TaxInvoice.create(
                UUID.randomUUID(), "P-001", "legacy 거래처", null,
                LocalDate.of(2026, 8, 14), null, TaxInvoiceType.SALES);
        Field marker = TaxInvoice.class.getDeclaredField("legacyReadOnly");
        marker.setAccessible(true);
        marker.setBoolean(invoice, true);

        assertThatThrownBy(() -> invoice.updateBasic(
                invoice.getPartnerId(), invoice.getPartnerCode(), invoice.getPartnerBusinessNo(),
                "변경 시도", invoice.getPartnerAddress(), invoice.getSupplyDate(),
                invoice.getDescription()))
                .isInstanceOf(com.samhanair.logis.common.exception.BusinessException.class)
                .hasMessageContaining("legacy");
        assertThatThrownBy(() -> invoice.requireMutable("발행은 "))
                .isInstanceOf(com.samhanair.logis.common.exception.BusinessException.class)
                .hasMessageContaining("legacy");
    }
}
