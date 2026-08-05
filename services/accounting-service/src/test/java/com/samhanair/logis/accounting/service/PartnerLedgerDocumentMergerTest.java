package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;

class PartnerLedgerDocumentMergerTest {

    @Test
    void combines_only_sales_and_cash_receipts_and_keeps_all_sales_lines() {
        PartnerLedgerDocumentMerger merger = new PartnerLedgerDocumentMerger();

        List<PartnerLedgerDocumentMerger.Document> result = merger.merge(List.of(
                new PartnerLedgerDocumentMerger.Document(
                        PartnerLedgerDocumentMerger.Type.SALE, "2026/08/01-19",
                        LocalDate.of(2026, 8, 1), "P-1", "거래처", "배송 주소",
                        List.of(new PartnerLedgerDocumentMerger.Line(
                                "품목 A", 2, new BigDecimal("11000.00"), new BigDecimal("22000.00")))),
                new PartnerLedgerDocumentMerger.Document(
                        PartnerLedgerDocumentMerger.Type.CASH_RECEIPT, "2026/08/02-3",
                        LocalDate.of(2026, 8, 2), "P-1", "거래처", null, List.of()),
                new PartnerLedgerDocumentMerger.Document(
                        PartnerLedgerDocumentMerger.Type.OTHER, "ignored", LocalDate.of(2026, 8, 3),
                        "P-1", "거래처", "적요에 있는 주소", List.of())));

        assertThat(result).extracting(PartnerLedgerDocumentMerger.Document::type)
                .containsExactly(PartnerLedgerDocumentMerger.Type.SALE,
                        PartnerLedgerDocumentMerger.Type.CASH_RECEIPT);
        assertThat(result.get(0).lines()).hasSize(1);
        assertThat(result.get(0).lines().get(0).lineAmount()).isEqualByComparingTo("22000.00");
        assertThat(result.get(0).deliveryAddress()).isEqualTo("배송 주소");
        assertThat(result.get(1).deliveryAddress()).isNull();
    }
}
