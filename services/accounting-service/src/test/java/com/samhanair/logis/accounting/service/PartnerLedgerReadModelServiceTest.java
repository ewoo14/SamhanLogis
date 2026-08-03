package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.client.PartnerLedgerSalesClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.repository.JournalLineRepository;
import com.samhanair.logis.accounting.repository.CashReceiptRepository;
import com.samhanair.logis.accounting.repository.JournalRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/** R18 공통 원장 산출 결과 RED 회귀. */
@ExtendWith(MockitoExtension.class)
class PartnerLedgerReadModelServiceTest {
    private static final LocalDate FROM = LocalDate.of(2026, 1, 1);
    private static final LocalDate TO = LocalDate.of(2026, 3, 31);

    @Mock private PartnerLedgerSalesClient salesClient;
    @Mock private JournalLineRepository journalLineRepository;
    @Mock private CashReceiptRepository cashReceiptRepository;
    @Mock private JournalRepository journalRepository;
    @Mock private PartnerLookupClient partnerLookupClient;

    @Test
    void uuidOnlySalesRemainInTheResolvedPartnerDocuments() {
        UUID partnerId = UUID.randomUUID();
        PartnerSummary partner = new PartnerSummary(partnerId, "P-2026-0017", "대상", "", "");
        when(partnerLookupClient.findByPartnerCodeResult("P-2026-0017"))
                .thenReturn(PartnerLookupClient.LookupResult.found(partner));
        when(journalLineRepository.aggregatePostedByPartnerAccount(FROM, TO)).thenReturn(List.of());
        when(salesClient.find(FROM, TO, "P-2026-0017", partnerId)).thenReturn(List.of(
                new PartnerLedgerSalesClient.Sale("2026/03/08-1", FROM, "COMPLETED", null,
                        partnerId, "대상", "", null,
                        List.of(new PartnerLedgerSalesClient.Line("A", null, 1,
                                new BigDecimal("12276000"), new BigDecimal("12276000"))))));

        var result = new PartnerLedgerReadModelService(
                salesClient, journalLineRepository, cashReceiptRepository, journalRepository,
                partnerLookupClient).read("P-2026-0017", FROM, TO);

        assertThat(result.selected().salesTotal()).isEqualByComparingTo("12276000");
        assertThat(result.selected().documents()).extracting(PartnerLedgerReadModel.Document::amount)
                .containsExactly(new BigDecimal("12276000"));
    }

    @Test
    void unfilteredSaleOnlyPartnersUseTheSameIdentityAsDirectSearch() {
        UUID partnerId = UUID.randomUUID();
        PartnerSummary partner = new PartnerSummary(partnerId, "P-2026-0031", "대상", "5031710961", "");
        PartnerLedgerSalesClient.Sale sale = new PartnerLedgerSalesClient.Sale(
                "2026/01/31-1", FROM, "COMPLETED", "P-2026-0031", partnerId, "대상", "", "5031710961",
                List.of(new PartnerLedgerSalesClient.Line("테스트제품-TEST-MODEL-0011", null, 1,
                        new BigDecimal("229900"), new BigDecimal("229900"))));
        when(journalLineRepository.aggregatePostedByPartnerAccount(FROM, TO)).thenReturn(List.of());
        when(salesClient.find(FROM, TO, null, null)).thenReturn(List.of(sale));
        when(partnerLookupClient.findByPartnerIdsBatch(List.of(partnerId))).thenReturn(Map.of(partnerId, partner));

        var result = new PartnerLedgerReadModelService(
                salesClient, journalLineRepository, cashReceiptRepository, journalRepository,
                partnerLookupClient).read(null, FROM, TO);

        assertThat(result.partners()).extracting(PartnerLedgerReadModel.Partner::partnerCode)
                .containsExactly("P-2026-0031");
        assertThat(result.partners().get(0).salesTotal()).isEqualByComparingTo("229900");
        assertThat(result.partners().get(0).documents()).hasSize(1);
    }

    @Test
    void journalOnlySalesBecomePubliclyUsableSummaryDocumentsWithoutUuid() {
        UUID partnerId = UUID.randomUUID();
        PartnerSummary partner = new PartnerSummary(partnerId, "P-2026-0005", "대상", "1653510155", "");
        when(partnerLookupClient.findByPartnerCodeResult("P-2026-0005"))
                .thenReturn(PartnerLookupClient.LookupResult.found(partner));
        when(journalLineRepository.aggregatePostedByPartnerAccount(FROM, TO)).thenReturn(List.of(
                new Total(partnerId, "401", BigDecimal.ZERO, new BigDecimal("26000000"))));
        when(salesClient.find(FROM, TO, "P-2026-0005", partnerId)).thenReturn(List.of());

        var result = new PartnerLedgerReadModelService(
                salesClient, journalLineRepository, cashReceiptRepository, journalRepository,
                partnerLookupClient).read("P-2026-0005", FROM, TO);

        assertThat(result.selected().salesTotal()).isEqualByComparingTo("26000000");
        assertThat(result.selected().documents()).extracting(PartnerLedgerReadModel.Document::type)
                .containsExactly(PartnerLedgerReadModel.DocumentType.SALE_SUMMARY);
        assertThat(result.selected().documents().get(0).documentNo()).doesNotContain(partnerId.toString());
        assertThat(result.selected().documents().get(0).documentNo()).isEqualTo("P-2026-0005");
        assertThat(result.selected().partnerId()).isNotNull();
    }

    record Total(UUID partnerId, String accountCode, BigDecimal debitTotal, BigDecimal creditTotal)
            implements JournalLineRepository.PartnerAccountTotal {
        @Override public UUID getPartnerId() { return partnerId; }
        @Override public String getAccountCode() { return accountCode; }
        @Override public com.samhanair.logis.accounting.domain.JournalSourceType getSourceType() { return null; }
        @Override public BigDecimal getDebitTotal() { return debitTotal; }
        @Override public BigDecimal getCreditTotal() { return creditTotal; }
    }
}
