package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verifyNoInteractions;

import com.samhanair.logis.accounting.client.PartnerLedgerSalesClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.repository.JournalLineRepository;
import com.samhanair.logis.accounting.repository.CashReceiptRepository;
import com.samhanair.logis.accounting.repository.JournalRepository;
import com.samhanair.logis.accounting.domain.Journal;
import com.samhanair.logis.accounting.domain.JournalLine;
import com.samhanair.logis.accounting.domain.CashReceipt;
import com.samhanair.logis.common.ledger.PartnerLedgerContract;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.jpa.domain.Specification;

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
        lenient().when(salesClient.find(FROM, TO, "P-2026-0017", partnerId)).thenReturn(List.of(
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
    void vatIncludedDocumentAmountWinsWhenLegacyRevenueJournalUsesNetAmount() {
        UUID partnerId = UUID.randomUUID();
        PartnerSummary partner = new PartnerSummary(partnerId, "P-VAT-001", "VAT 교차 거래처", "1234567890", "");
        when(partnerLookupClient.findByPartnerCodeResult("P-VAT-001"))
                .thenReturn(PartnerLookupClient.LookupResult.found(partner));
        when(journalLineRepository.aggregatePostedByPartnerAccount(FROM, TO)).thenReturn(List.of(
                // 교차 경로 fixture: legacy 401 순액 1,000, 정상 판매전표 VAT 포함 문서금액 1,100.
                new Total(partnerId, "401", BigDecimal.ZERO, new BigDecimal("1000")),
                new Total(partnerId, "110", new BigDecimal("1100"), BigDecimal.ZERO)));
        CashReceipt receipt = CashReceipt.fromMig7Staging(
                "2026/01/11-1", partnerId, new BigDecimal("400"), FROM,
                com.samhanair.logis.accounting.domain.CashReceiptKind.DEPOSIT_REPORT,
                "교차 fixture 수금", "VAT-CROSS-400");
        when(cashReceiptRepository.findAll(any(Specification.class))).thenReturn(List.of(receipt));
        lenient().when(salesClient.find(FROM, TO, "P-VAT-001", partnerId)).thenReturn(List.of(
                new PartnerLedgerSalesClient.Sale("2026/01/10-1", FROM, "COMPLETED", "P-VAT-001",
                        partnerId, "VAT 교차 거래처", "", "1234567890", List.of(
                        new PartnerLedgerSalesClient.Line("VAT 상품", null, 1,
                                new BigDecimal("1100"), new BigDecimal("1100"))))));

        var result = new PartnerLedgerReadModelService(
                salesClient, journalLineRepository, cashReceiptRepository, journalRepository,
                partnerLookupClient).read("P-VAT-001", FROM, TO);

        assertThat(result.selected().salesTotal()).isEqualByComparingTo("1100");
        assertThat(result.selected().paymentTotal()).isEqualByComparingTo("400");
        assertThat(result.selected().documents()).extracting(PartnerLedgerReadModel.Document::amount)
                .containsExactly(new BigDecimal("1100"), new BigDecimal("400"));
        assertThat(result.selected().receivableBalance()).isEqualByComparingTo("700");
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
        lenient().when(salesClient.find(FROM, TO, null, null)).thenReturn(List.of(sale));
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
    void journalOnlySalesBecomeJournalBasedDocumentsWithMigrationNotice() {
        UUID partnerId = UUID.randomUUID();
        PartnerSummary partner = new PartnerSummary(partnerId, "P-2026-0005", "대상", "1653510155", "");
        when(partnerLookupClient.findByPartnerCodeResult("P-2026-0005"))
                .thenReturn(PartnerLookupClient.LookupResult.found(partner));
        when(journalLineRepository.aggregatePostedByPartnerAccount(FROM, TO)).thenReturn(List.of(
                new Total(partnerId, "401", BigDecimal.ZERO, new BigDecimal("26000000")),
                new Total(partnerId, "110", new BigDecimal("28600000"), BigDecimal.ZERO)));
        lenient().when(salesClient.find(FROM, TO, "P-2026-0005", partnerId)).thenReturn(List.of());
        var result = new PartnerLedgerReadModelService(
                salesClient, journalLineRepository, cashReceiptRepository, journalRepository,
                partnerLookupClient).read("P-2026-0005", FROM, TO);

        assertThat(result.selected().salesTotal()).isEqualByComparingTo("28600000");
        assertThat(result.selected().documents()).singleElement()
                .satisfies(document -> {
                    assertThat(document.type()).isEqualTo(PartnerLedgerReadModel.DocumentType.SALE_SUMMARY);
                    assertThat(document.amount()).isEqualByComparingTo("28600000");
                    assertThat(document.debit()).isEqualByComparingTo("28600000");
                    assertThat(document.credit()).isZero();
                    assertThat(document.description()).contains("판매전표 없음 / 전표 미이관");
                });
        assertThat(result.selected().receivableBalance()).isEqualByComparingTo("28600000");
        assertThat(result.selected().partnerId()).isNotNull();
    }

    @Test
    void RED_A1_priorConfirmedSaleBecomesOpeningBalanceWithoutPeriodDocument() {
        UUID partnerId = UUID.randomUUID();
        PartnerSummary partner = new PartnerSummary(partnerId, "P-OPENING-001", "기초 거래처", "", "");
        LocalDate priorDate = FROM.minusDays(1);
        when(partnerLookupClient.findByPartnerCodeResult("P-OPENING-001"))
                .thenReturn(PartnerLookupClient.LookupResult.found(partner));
        when(journalLineRepository.aggregatePostedByPartnerAccount(FROM, TO)).thenReturn(List.of());
        lenient().when(salesClient.find(FROM, TO, "P-OPENING-001", partnerId)).thenReturn(List.of());
        lenient().when(salesClient.find(any(LocalDate.class), org.mockito.ArgumentMatchers.eq(priorDate),
                org.mockito.ArgumentMatchers.eq("P-OPENING-001"), org.mockito.ArgumentMatchers.eq(partnerId)))
                .thenReturn(List.of(new PartnerLedgerSalesClient.Sale(
                        "2025/12/31-1", priorDate, "COMPLETED", "P-OPENING-001", partnerId,
                        "기초 거래처", "", "", List.of(new PartnerLedgerSalesClient.Line(
                                "기초 품목", null, 1, new BigDecimal("1100"), new BigDecimal("1100"))))));

        var result = new PartnerLedgerReadModelService(
                salesClient, journalLineRepository, cashReceiptRepository, journalRepository,
                partnerLookupClient).read("P-OPENING-001", FROM, TO);

        assertThat(result.selected()).isNotNull();
        assertThat(result.selected().openingBalance()).isEqualByComparingTo("1100");
        assertThat(result.selected().receivableBalance()).isEqualByComparingTo("1100");
        assertThat(result.selected().documents()).isEmpty();
    }

    @Test
    void periodStartSaleIsNotDuplicatedIntoOpeningBalance() {
        UUID partnerId = UUID.randomUUID();
        PartnerSummary partner = new PartnerSummary(partnerId, "P-BOUNDARY-001", "경계 거래처", "", "");
        when(partnerLookupClient.findByPartnerCodeResult("P-BOUNDARY-001"))
                .thenReturn(PartnerLookupClient.LookupResult.found(partner));
        when(journalLineRepository.aggregatePostedByPartnerAccount(FROM, TO)).thenReturn(List.of());
        lenient().when(salesClient.find(any(LocalDate.class), org.mockito.ArgumentMatchers.eq(FROM.minusDays(1)),
                org.mockito.ArgumentMatchers.eq("P-BOUNDARY-001"), org.mockito.ArgumentMatchers.eq(partnerId)))
                .thenReturn(List.of());
        lenient().when(salesClient.find(FROM, TO, "P-BOUNDARY-001", partnerId)).thenReturn(List.of(
                new PartnerLedgerSalesClient.Sale("2026/01/01-1", FROM, "CONFIRMED", "P-BOUNDARY-001",
                        partnerId, "경계 거래처", "", "", List.of(new PartnerLedgerSalesClient.Line(
                                "당일 품목", null, 1, new BigDecimal("3300"), new BigDecimal("3300"))))));

        var result = new PartnerLedgerReadModelService(
                salesClient, journalLineRepository, cashReceiptRepository, journalRepository,
                partnerLookupClient).read("P-BOUNDARY-001", FROM, TO);

        assertThat(result.selected().openingBalance()).isZero();
        assertThat(result.selected().salesTotal()).isEqualByComparingTo("3300");
        assertThat(result.selected().receivableBalance()).isEqualByComparingTo("3300");
    }

    @Test
    void confirmedPaymentOnlyPartnerRemainsVisibleWithOpeningBalance() {
        UUID partnerId = UUID.randomUUID();
        PartnerSummary partner = new PartnerSummary(partnerId, "P-PAYMENT-001", "수금 거래처", "", "");
        when(partnerLookupClient.findByPartnerCodeResult("P-PAYMENT-001"))
                .thenReturn(PartnerLookupClient.LookupResult.found(partner));
        when(journalLineRepository.aggregatePostedByPartnerAccount(FROM, TO)).thenReturn(List.of());
        lenient().when(salesClient.find(any(LocalDate.class), org.mockito.ArgumentMatchers.eq(FROM.minusDays(1)),
                org.mockito.ArgumentMatchers.eq("P-PAYMENT-001"), org.mockito.ArgumentMatchers.eq(partnerId)))
                .thenReturn(List.of());
        lenient().when(salesClient.find(FROM, TO, "P-PAYMENT-001", partnerId)).thenReturn(List.of());
        CashReceipt receipt = CashReceipt.fromMig7Staging(
                "PAY-001", partnerId, new BigDecimal("500"), FROM,
                com.samhanair.logis.accounting.domain.CashReceiptKind.DEPOSIT_REPORT,
                "수금만", "PAYMENT-ONLY");
        when(cashReceiptRepository.findAll(any(Specification.class))).thenReturn(List.of(receipt));

        var result = new PartnerLedgerReadModelService(
                salesClient, journalLineRepository, cashReceiptRepository, journalRepository,
                partnerLookupClient).read("P-PAYMENT-001", FROM, TO);

        assertThat(result.selected()).isNotNull();
        assertThat(result.selected().salesTotal()).isZero();
        assertThat(result.selected().paymentTotal()).isEqualByComparingTo("500");
        assertThat(result.selected().receivableBalance()).isEqualByComparingTo("-500");
    }

    @Test
    void RED_B2_unfilteredPriorSaleKeepsNormalPartnerRowAndCanonicalStatusSet() {
        UUID partnerId = UUID.randomUUID();
        PartnerSummary partner = new PartnerSummary(partnerId, "P-OPENING-ALL", "전체조회 거래처", "", "");
        LocalDate priorDate = FROM.minusDays(1);
        when(journalLineRepository.aggregatePostedByPartnerAccount(FROM, TO)).thenReturn(List.of());
        lenient().when(salesClient.find(FROM, TO, null, null)).thenReturn(List.of());
        lenient().when(salesClient.find(any(LocalDate.class), org.mockito.ArgumentMatchers.eq(priorDate),
                org.mockito.ArgumentMatchers.isNull(), org.mockito.ArgumentMatchers.isNull()))
                .thenReturn(List.of(new PartnerLedgerSalesClient.Sale(
                        "2025/12/31-2", priorDate, "SHIPPING", "P-OPENING-ALL", partnerId,
                        "전체조회 거래처", "", "", List.of(new PartnerLedgerSalesClient.Line(
                                "기초 품목", null, 1, new BigDecimal("2200"), new BigDecimal("2200"))))));
        when(partnerLookupClient.findByPartnerIdsBatch(List.of(partnerId)))
                .thenReturn(Map.of(partnerId, partner));

        var result = new PartnerLedgerReadModelService(
                salesClient, journalLineRepository, cashReceiptRepository, journalRepository,
                partnerLookupClient).read(null, FROM, TO);

        assertThat(PartnerLedgerContract.CANONICAL_SALE_STATUSES)
                .containsExactly("CONFIRMED", "DELIVERED", "COMPLETED", "INSPECTING", "SHIPPING");
        assertThat(result.partners()).singleElement().satisfies(row -> {
            assertThat(row.partnerCode()).isEqualTo("P-OPENING-ALL");
            assertThat(row.openingBalance()).isEqualByComparingTo("2200");
        });
    }

    @Test
    void journalOnlyReceivableActivityStillHasAVisibleJournalRow() {
        UUID partnerId = UUID.randomUUID();
        PartnerSummary partner = new PartnerSummary(partnerId, "P-JOURNAL-110", "분개 전용 거래처", "", "");
        when(partnerLookupClient.findByPartnerCodeResult("P-JOURNAL-110"))
                .thenReturn(PartnerLookupClient.LookupResult.found(partner));
        when(journalLineRepository.aggregatePostedByPartnerAccount(FROM, TO)).thenReturn(List.of(
                new Total(partnerId, "110", new BigDecimal("500"), BigDecimal.ZERO)));
        lenient().when(salesClient.find(FROM, TO, "P-JOURNAL-110", partnerId)).thenReturn(List.of());
        JournalLine line = org.mockito.Mockito.mock(JournalLine.class);
        lenient().when(line.getLineNo()).thenReturn(1);
        lenient().when(line.getAccountCode()).thenReturn("110");
        lenient().when(line.getDebitAmount()).thenReturn(new BigDecimal("500"));
        lenient().when(line.getCreditAmount()).thenReturn(BigDecimal.ZERO);
        lenient().when(line.getMemo()).thenReturn("분개만 존재");
        when(journalLineRepository.findJournalLinesInRangeForPartner(partnerId, FROM, TO)).thenReturn(List.of(line));

        var result = new PartnerLedgerReadModelService(
                salesClient, journalLineRepository, cashReceiptRepository, journalRepository,
                partnerLookupClient).read("P-JOURNAL-110", FROM, TO);

        assertThat(result.selected().documents()).hasSize(1);
        assertThat(result.selected().documents().get(0).description())
                .contains("판매전표 없음 / 전표 미이관");
    }

    @Test
    void unknownFilterDoesNotFallBackToUnfilteredData() {
        when(partnerLookupClient.findByPartnerCodeResult("NOSUCH9999"))
                .thenReturn(PartnerLookupClient.LookupResult.notFound());
        when(partnerLookupClient.searchDirectoryResult("NOSUCH9999", 10))
                .thenReturn(PartnerLookupClient.DirectoryLookupResult.notFound());

        var result = new PartnerLedgerReadModelService(
                salesClient, journalLineRepository, cashReceiptRepository, journalRepository,
                partnerLookupClient).read("NOSUCH9999", FROM, TO);

        assertThat(result.partners()).isEmpty();
        assertThat(result.selected()).isNull();
        verifyNoInteractions(journalLineRepository, cashReceiptRepository, journalRepository, salesClient);
    }

    @Test
    void unfilteredCodeOnlySaleIsIncludedOnlyWhenActivePartnerMasterResolvesIt() {
        UUID partnerId = UUID.randomUUID();
        PartnerSummary partner = new PartnerSummary(partnerId, "P-2026-0042", "정상 거래처", "1234567890", "",
                null, "SUSPENDED");
        when(journalLineRepository.aggregatePostedByPartnerAccount(FROM, TO)).thenReturn(List.of());
        lenient().when(salesClient.find(FROM, TO, null, null)).thenReturn(List.of(
                new PartnerLedgerSalesClient.Sale("2026/02/01-1", FROM, "COMPLETED", "P-2026-0042",
                        null, "정상 거래처", "", "1234567890", List.of(
                        new PartnerLedgerSalesClient.Line("A", null, 1, new BigDecimal("1100"),
                                new BigDecimal("1100"))))));
        when(partnerLookupClient.findByPartnerCodeResult("P-2026-0042"))
                .thenReturn(PartnerLookupClient.LookupResult.found(partner));
        when(partnerLookupClient.findByPartnerIdsBatch(List.of(partnerId)))
                .thenReturn(Map.of(partnerId, partner));

        var result = new PartnerLedgerReadModelService(
                salesClient, journalLineRepository, cashReceiptRepository, journalRepository,
                partnerLookupClient).read(null, FROM, TO);

        assertThat(result.partners()).extracting(PartnerLedgerReadModel.Partner::partnerCode)
                .containsExactly("P-2026-0042");
    }

    @Test
    void unfilteredCodeOnlySaleWithoutPartnerMasterIsNotExposed() {
        when(journalLineRepository.aggregatePostedByPartnerAccount(FROM, TO)).thenReturn(List.of());
        lenient().when(salesClient.find(FROM, TO, null, null)).thenReturn(List.of(
                new PartnerLedgerSalesClient.Sale("2026/02/01-unknown", FROM, "COMPLETED", "UNKNOWN-CODE",
                        null, "미등록", "", null, List.of(
                        new PartnerLedgerSalesClient.Line("A", null, 1, new BigDecimal("1100"),
                                new BigDecimal("1100"))))));
        when(partnerLookupClient.findByPartnerCodeResult("UNKNOWN-CODE"))
                .thenReturn(PartnerLookupClient.LookupResult.notFound());
        when(partnerLookupClient.searchDirectoryResult("UNKNOWN-CODE", 10))
                .thenReturn(PartnerLookupClient.DirectoryLookupResult.notFound());

        var result = new PartnerLedgerReadModelService(
                salesClient, journalLineRepository, cashReceiptRepository, journalRepository,
                partnerLookupClient).read(null, FROM, TO);

        assertThat(result.partners()).isEmpty();
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
