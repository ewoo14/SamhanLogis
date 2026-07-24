package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.domain.Journal;
import com.samhanair.logis.accounting.domain.JournalSourceType;
import com.samhanair.logis.accounting.domain.TaxInvoice;
import com.samhanair.logis.accounting.repository.JournalRepository;
import com.samhanair.logis.accounting.repository.TaxInvoiceRepository;
import com.samhanair.logis.accounting.service.AccountingDocumentSearchService;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.transaction.annotation.Transactional;

/** 결재 첨부 회계 문서 4종 검색의 PostgreSQL wildcard literal 계약 IT. */
@SpringBootTest(classes = AccountingServiceApplication.class)
@Transactional
class AccountingDocumentSearchWildcardIT extends AbstractPostgresIT {

    @Autowired private AccountingDocumentSearchService searchService;
    @Autowired private JournalRepository journalRepository;
    @Autowired private TaxInvoiceRepository taxInvoiceRepository;
    @MockBean private com.samhanair.logis.security.permission.DynamicPermissionClient dynamicPermissionClient;

    @Test
    void all_four_document_searches_treat_percent_as_literal() {
        String marker = "LUNA%";
        journalRepository.save(Journal.create(
                "LUNA%-JOURNAL", LocalDate.of(2026, 7, 24), "LUNA% journal",
                JournalSourceType.MANUAL, null));
        journalRepository.save(Journal.create(
                "LUNAX-JOURNAL", LocalDate.of(2026, 7, 24), "LUNAX journal",
                JournalSourceType.MANUAL, null));

        saveIssuedInvoice("LUNA%-TAX", "LUNA% 거래처", "LUNA%");
        saveIssuedInvoice("LUNAX-TAX", "LUNAX 거래처", "LUNAX");
        journalRepository.flush();
        taxInvoiceRepository.flush();

        assertThat(searchService.searchJournals(marker, 20)).hasSize(1);
        assertThat(searchService.searchTaxInvoices(marker, 20)).hasSize(1);
        assertThat(searchService.searchStatements(marker, 20)).hasSize(1);
        assertThat(searchService.searchLedgerPartners(marker, 20)).hasSize(1);
    }

    private void saveIssuedInvoice(String invoiceNo, String partnerName, String partnerCode) {
        TaxInvoice invoice = TaxInvoice.createInbound(
                invoiceNo, LocalDate.of(2026, 7, 24), UUID.randomUUID(), partnerCode,
                partnerName, null, new BigDecimal("100"), new BigDecimal("10"),
                new BigDecimal("110"), "it");
        invoice.markReceived("it");
        taxInvoiceRepository.save(invoice);
    }
}
