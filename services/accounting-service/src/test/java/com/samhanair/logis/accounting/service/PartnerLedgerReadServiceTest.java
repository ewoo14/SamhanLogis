package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.client.PartnerLedgerSalesClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.domain.CashReceipt;
import com.samhanair.logis.accounting.domain.CashReceiptKind;
import com.samhanair.logis.accounting.domain.Journal;
import com.samhanair.logis.accounting.repository.CashReceiptRepository;
import com.samhanair.logis.accounting.repository.JournalLineRepository;
import com.samhanair.logis.accounting.repository.JournalRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.test.util.ReflectionTestUtils;

/** R13 code-only 거래처 원장 상세 회귀 테스트. */
@ExtendWith(MockitoExtension.class)
class PartnerLedgerReadServiceTest {

    private static final LocalDate FROM = LocalDate.of(2026, 6, 1);
    private static final LocalDate TO = LocalDate.of(2026, 6, 30);

    @Mock private PartnerLedgerSalesClient salesClient;
    @Mock private CashReceiptRepository cashReceiptRepository;
    @Mock private PartnerLookupClient partnerLookupClient;
    @Mock private JournalRepository journalRepository;
    @Mock private JournalLineRepository journalLineRepository;

    @InjectMocks private PartnerLedgerReadService service;

    @Test
    @DisplayName("미등록 code-only 판매전표는 전체 자료나 빈 원장으로 노출하지 않는다")
    void codeOnlyExistingSaleWithoutPartnerMasterIsNotReadable() {
        when(partnerLookupClient.findByPartnerCodeResult("QA-GATE-A"))
                .thenReturn(PartnerLookupClient.LookupResult.notFound());
        when(partnerLookupClient.searchDirectoryResult("QA-GATE-A", 10))
                .thenReturn(PartnerLookupClient.DirectoryLookupResult.notFound());
        PartnerLedgerReadModelService readModel = new PartnerLedgerReadModelService(
                salesClient, journalLineRepository, cashReceiptRepository, journalRepository,
                partnerLookupClient);
        PartnerLedgerReadService strictService = new PartnerLedgerReadService(
                salesClient, cashReceiptRepository, journalRepository, partnerLookupClient, readModel);
        lenient().when(salesClient.find(FROM, TO, "QA-GATE-A", null))
                .thenReturn(List.of(new PartnerLedgerSalesClient.Sale(
                        "2026/06/24-901", LocalDate.of(2026, 6, 24), "COMPLETED",
                        "QA-GATE-A", "대구공조(검수완료)", null,
                        List.of(new PartnerLedgerSalesClient.Line(
                                "원장 품목", null, 2, new BigDecimal("1200000"),
                                new BigDecimal("2400000"))))));
        lenient().when(cashReceiptRepository.findAll(any(Specification.class))).thenReturn(List.of());

        var response = strictService.read("QA-GATE-A", FROM, TO);

        assertThat(response.documents()).isEmpty();
    }

    @Test
    @DisplayName("정상 거래처 상세는 기존 partnerId 조회 계약을 유지한다")
    void masterBackedPartnerStillReadsByPartnerId() {
        UUID partnerId = UUID.randomUUID();
        when(partnerLookupClient.findByPartnerCodeResult("P-2026-0001"))
                .thenReturn(PartnerLookupClient.LookupResult.found(
                        new com.samhanair.logis.accounting.client.PartnerSummary(
                                partnerId, "P-2026-0001", "정상 거래처", "1234567890", "")));
        when(salesClient.find(FROM, TO, "P-2026-0001", partnerId))
                .thenReturn(List.of(new PartnerLedgerSalesClient.Sale(
                        "2026/06/24-903", LocalDate.of(2026, 6, 24), "COMPLETED",
                        "P-2026-0001", "정상 거래처", null,
                        List.of(new PartnerLedgerSalesClient.Line(
                                "정상 품목", null, 1, new BigDecimal("100"), new BigDecimal("100"))))));
        lenient().when(cashReceiptRepository.findAll(any(Specification.class))).thenReturn(List.of());

        var response = service.read("P-2026-0001", FROM, TO);

        assertThat(response.partnerCode()).isEqualTo("P-2026-0001");
        assertThat(response.partnerName()).isEqualTo("정상 거래처");
        assertThat(response.documents()).hasSize(1);
        assertThat(response.partnerBusinessNo()).isEqualTo("1234567890");
    }

    @Test
    @DisplayName("상세 조회도 화면 사업자번호를 거래처 exact lookup으로 해석한다")
    void businessNumberLookupReadsSelectedPartnerLedger() {
        UUID partnerId = UUID.randomUUID();
        PartnerSummary partner = new PartnerSummary(
                partnerId, "P-2026-0005", "대상 거래처", "165-35-10155", "");
        when(partnerLookupClient.findByPartnerCodeResult("1653510155"))
                .thenReturn(PartnerLookupClient.LookupResult.notFound());
        when(partnerLookupClient.searchDirectoryResult("1653510155", 10))
                .thenReturn(PartnerLookupClient.DirectoryLookupResult.found(List.of(partner)));
        when(salesClient.find(FROM, TO, "P-2026-0005", partnerId)).thenReturn(List.of(
                new PartnerLedgerSalesClient.Sale(
                        "2026/06/24-905", FROM, "COMPLETED", "P-2026-0005",
                        "대상 거래처", "165-35-10155", null,
                        List.of(new PartnerLedgerSalesClient.Line(
                                "대상", null, 1, new BigDecimal("100"), new BigDecimal("100"))))));
        lenient().when(cashReceiptRepository.findAll(any(Specification.class))).thenReturn(List.of());

        var response = service.read("1653510155", FROM, TO);

        assertThat(response.partnerCode()).isEqualTo("P-2026-0005");
        assertThat(response.documents()).hasSize(1);
        assertThat(response.documents().get(0).amount()).isEqualByComparingTo("100");
    }

    @Test
    @DisplayName("입금보고서 행은 저장된 journals.journal_no를 그대로 반환한다")
    void cashReceiptUsesStoredJournalNo() {
        UUID partnerId = UUID.randomUUID();
        UUID journalId = UUID.randomUUID();
        String storedJournalNo = "JR-2026-05-06-003";
        PartnerSummary partner = new PartnerSummary(
                partnerId, "8428102605", "주식회사 제이시스템", "8428102605", "");
        when(partnerLookupClient.findByPartnerCodeResult("8428102605"))
                .thenReturn(PartnerLookupClient.LookupResult.found(partner));
        when(partnerLookupClient.findByPartnerIdsBatch(any())).thenReturn(Map.of(partnerId, partner));
        when(salesClient.find(FROM, TO, "8428102605", partnerId)).thenReturn(List.of());

        CashReceipt receipt = CashReceipt.fromMig7Staging(
                "2026-05-06-003", partnerId, new BigDecimal("90402200"), LocalDate.of(2026, 5, 6),
                CashReceiptKind.DEPOSIT_REPORT, "입금보고서", "journal-no-r1");
        ReflectionTestUtils.setField(receipt, "journalId", journalId);
        when(cashReceiptRepository.findAll(any(Specification.class))).thenReturn(List.of(receipt));

        Journal journal = org.mockito.Mockito.mock(Journal.class);
        when(journal.getId()).thenReturn(journalId);
        when(journal.getJournalNo()).thenReturn(storedJournalNo);
        lenient().when(journalRepository.findAllById(any())).thenReturn(List.of(journal));

        var response = service.read("8428102605", FROM, TO);

        assertThat(response.documents()).hasSize(1);
        assertThat(response.documents().get(0).documentNo()).isEqualTo(storedJournalNo);
    }
}
