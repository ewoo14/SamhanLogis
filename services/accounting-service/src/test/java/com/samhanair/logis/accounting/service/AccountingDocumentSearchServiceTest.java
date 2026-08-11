package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.repository.JournalRepository;
import com.samhanair.logis.accounting.repository.SalesCommissionSettlementRepository;
import com.samhanair.logis.accounting.repository.TaxInvoiceRepository;
import com.samhanair.logis.accounting.domain.SalesCommissionSettlement;
import com.samhanair.logis.accounting.domain.SalesCommissionSettlementStatus;
import com.samhanair.logis.accounting.web.dto.AccountingSalesCommissionSettlementSearchResponse;
import com.samhanair.logis.accounting.web.dto.AccountingJournalSearchResponse;
import com.samhanair.logis.accounting.web.dto.AccountingLedgerPartnerSearchResponse;
import com.samhanair.logis.accounting.web.dto.AccountingStatementSearchResponse;
import com.samhanair.logis.accounting.web.dto.AccountingTaxInvoiceSearchResponse;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Pageable;

/** 회계 문서 자동완성 검색 서비스 단위 테스트. */
@ExtendWith(MockitoExtension.class)
class AccountingDocumentSearchServiceTest {

    @Mock private JournalRepository journalRepository;
    @Mock private TaxInvoiceRepository taxInvoiceRepository;
    @Mock private SalesCommissionSettlementRepository salesCommissionSettlementRepository;

    @InjectMocks private AccountingDocumentSearchService service;

    @Test
    void searchJournals_clampsLimitAndReturnsUuidFreeRows() {
        AccountingJournalSearchResponse row = new AccountingJournalSearchResponse(
                "2026/06/14-1", LocalDate.of(2026, 6, 14), "운송료 매출", new BigDecimal("110000.00"));
        when(journalRepository.searchApprovalReferences(eq("운송"), any(Pageable.class)))
                .thenReturn(List.of(row));

        List<AccountingJournalSearchResponse> result = service.searchJournals("운송", 99);

        assertThat(result).containsExactly(row);
        ArgumentCaptor<Pageable> pageableCaptor = ArgumentCaptor.forClass(Pageable.class);
        verify(journalRepository).searchApprovalReferences(eq("운송"), pageableCaptor.capture());
        assertThat(pageableCaptor.getValue().getPageSize()).isEqualTo(20);
    }

    @Test
    void searchTaxInvoices_usesNumberOrPartnerNameKeyword() {
        AccountingTaxInvoiceSearchResponse row = new AccountingTaxInvoiceSearchResponse(
                "2026/06/14-1", LocalDate.of(2026, 6, 14), "삼한상사", new BigDecimal("220000.00"));
        when(taxInvoiceRepository.searchTaxInvoiceReferences(eq("삼한"), any(Pageable.class)))
                .thenReturn(List.of(row));

        assertThat(service.searchTaxInvoices("삼한", 10)).containsExactly(row);
    }

    @Test
    void searchStatements_usesTaxInvoiceBackedStatementRows() {
        AccountingStatementSearchResponse row = new AccountingStatementSearchResponse(
                "2026/06/14-1", LocalDate.of(2026, 6, 14), "삼한상사", new BigDecimal("220000.00"));
        when(taxInvoiceRepository.searchStatementReferences(eq("2026/06/14"), any(Pageable.class)))
                .thenReturn(List.of(row));

        assertThat(service.searchStatements("2026/06/14", 10)).containsExactly(row);
    }

    @Test
    void searchLedgerPartners_returnsPartnerCodeAndNameOnly() {
        AccountingLedgerPartnerSearchResponse row = new AccountingLedgerPartnerSearchResponse("P-001", "삼한상사");
        when(taxInvoiceRepository.searchLedgerPartnerReferences(eq("P-"), any(Pageable.class)))
                .thenReturn(List.of(row));

        assertThat(service.searchLedgerPartners("P-", 10)).containsExactly(row);
    }

    @Test
    void searchSalesCommissionSettlements_returnsConfirmedRowsWithoutUuid() {
        SalesCommissionSettlement settlement = SalesCommissionSettlement.createDraft(LocalDate.of(2026, 8, 11))
                .confirm("2026/08/11-1");
        when(salesCommissionSettlementRepository.searchApprovalReferences(
                eq("2026/08"), eq(SalesCommissionSettlementStatus.CONFIRMED), any(Pageable.class)))
                .thenReturn(List.of(settlement));

        List<AccountingSalesCommissionSettlementSearchResponse> result =
                service.searchSalesCommissionSettlements("2026/08", 10);

        assertThat(result).extracting(AccountingSalesCommissionSettlementSearchResponse::settlementNo)
                .containsExactly("2026/08/11-1");
        assertThat(result.get(0).status()).isEqualTo("CONFIRMED");
    }

    @Test
    void wildcard_characters_are_escaped_before_repository_calls() {
        when(journalRepository.searchApprovalReferences(eq("LUNA\\%\\_\\\\"), any(Pageable.class)))
                .thenReturn(List.of());

        service.searchJournals("LUNA%_\\", 10);

        verify(journalRepository).searchApprovalReferences(eq("LUNA\\%\\_\\\\"), any(Pageable.class));
    }
}
