package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verifyNoInteractions;

import com.samhanair.logis.accounting.client.PartnerLedgerSalesClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.domain.AccountCategory;
import com.samhanair.logis.accounting.repository.JournalLineRepository;
import com.samhanair.logis.accounting.repository.CashReceiptRepository;
import com.samhanair.logis.accounting.repository.ChartOfAccountRepository;
import com.samhanair.logis.accounting.repository.JournalRepository;
import com.samhanair.logis.accounting.domain.ChartOfAccount;
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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.data.jpa.domain.Specification;

/** R18 공통 원장 산출 결과 RED 회귀. */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PartnerLedgerReadModelServiceTest {
    private static final LocalDate FROM = LocalDate.of(2026, 1, 1);
    private static final LocalDate TO = LocalDate.of(2026, 3, 31);

    @Mock private PartnerLedgerSalesClient salesClient;
    @Mock private JournalLineRepository journalLineRepository;
    @Mock private CashReceiptRepository cashReceiptRepository;
    @Mock private JournalRepository journalRepository;
    @Mock private PartnerLookupClient partnerLookupClient;
    @Mock private ChartOfAccountRepository chartOfAccountRepository;

    @BeforeEach
    void canonicalAggregateUsesTheFixtureAggregateByDefault() {
        lenient().when(journalLineRepository.aggregatePostedOnlyByPartnerAccount(
                any(LocalDate.class), any(LocalDate.class)))
                .thenAnswer(invocation -> journalLineRepository.aggregatePostedByPartnerAccount(
                        invocation.getArgument(0), invocation.getArgument(1)));
    }

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

        assertThat(result.selected().salesTotal()).isZero();
        assertThat(result.selected().documents()).extracting(PartnerLedgerReadModel.Document::amount)
                .containsExactly(new BigDecimal("12276000"));
    }

    @Test
    void targetDraftSaleIsIncludedExactlyOnceInSalesSlipClosingBalance() {
        UUID partnerId = UUID.randomUUID();
        String partnerCode = "P-TARGET-001";
        String slipNo = "2026/01/01-99";
        PartnerSummary partner = new PartnerSummary(partnerId, partnerCode, "저장 대상", "", "");
        PartnerLedgerSalesClient.Sale target = new PartnerLedgerSalesClient.Sale(
                slipNo, FROM, "DRAFT", partnerCode, partnerId, "저장 대상", "", "",
                List.of(new PartnerLedgerSalesClient.Line(
                        "저장 품목", null, 1, new BigDecimal("1100"), new BigDecimal("1100"))));
        when(partnerLookupClient.findByPartnerCodeResult(partnerCode))
                .thenReturn(PartnerLookupClient.LookupResult.found(partner));
        when(journalLineRepository.aggregatePostedByPartnerAccount(FROM, TO)).thenReturn(List.of());
        lenient().when(salesClient.find(FROM, TO, partnerCode, partnerId)).thenReturn(List.of());
        when(salesClient.findBySlipNo(slipNo)).thenReturn(target);

        var result = new PartnerLedgerReadModelService(
                salesClient, journalLineRepository, cashReceiptRepository, journalRepository,
                partnerLookupClient).read(partnerCode, FROM, TO, slipNo);

        assertThat(result.selected().salesTotal()).isZero();
        assertThat(result.selected().receivableBalance()).isZero();
        assertThat(result.selected().documents()).extracting(PartnerLedgerReadModel.Document::documentNo)
                .containsExactly(slipNo);
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
        when(cashReceiptRepository.findAll(any(Specification.class))).thenReturn(List.of(), List.of(receipt));
        lenient().when(salesClient.find(FROM, TO, "P-VAT-001", partnerId)).thenReturn(List.of(
                new PartnerLedgerSalesClient.Sale("2026/01/10-1", FROM, "COMPLETED", "P-VAT-001",
                        partnerId, "VAT 교차 거래처", "", "1234567890", List.of(
                        new PartnerLedgerSalesClient.Line("VAT 상품", null, 1,
                                new BigDecimal("1100"), new BigDecimal("1100"))))));

        var result = new PartnerLedgerReadModelService(
                salesClient, journalLineRepository, cashReceiptRepository, journalRepository,
                partnerLookupClient).read("P-VAT-001", FROM, TO);

        assertThat(result.selected().salesTotal()).isZero();
        assertThat(result.selected().paymentTotal()).isZero();
        assertThat(result.selected().documents()).extracting(PartnerLedgerReadModel.Document::amount)
                .containsExactly(new BigDecimal("1100"));
        assertThat(result.selected().receivableBalance()).isZero();
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
        assertThat(result.partners().get(0).salesTotal()).isZero();
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
        assertThat(result.selected().openingBalance()).isZero();
        assertThat(result.selected().receivableBalance()).isZero();
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
        assertThat(result.selected().salesTotal()).isZero();
        assertThat(result.selected().receivableBalance()).isZero();
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
        when(cashReceiptRepository.findAll(any(Specification.class))).thenReturn(List.of(), List.of(receipt));

        var result = new PartnerLedgerReadModelService(
                salesClient, journalLineRepository, cashReceiptRepository, journalRepository,
                partnerLookupClient).read("P-PAYMENT-001", FROM, TO);

        assertThat(result.selected()).isNotNull();
        assertThat(result.selected().salesTotal()).isZero();
        assertThat(result.selected().paymentTotal()).isZero();
        assertThat(result.selected().receivableBalance()).isZero();
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
            assertThat(row.openingBalance()).isZero();
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
        lenient().when(line.getPartnerId()).thenReturn(partnerId);
        when(journalLineRepository.findJournalLinesInRangeForPartner(partnerId, FROM, TO)).thenReturn(List.of(line));

        var result = new PartnerLedgerReadModelService(
                salesClient, journalLineRepository, cashReceiptRepository, journalRepository,
                partnerLookupClient).read("P-JOURNAL-110", FROM, TO);

        assertThat(result.selected().documents()).hasSize(1);
        assertThat(result.selected().documents().get(0).description())
                .contains("판매전표 없음 / 전표 미이관");
    }

    @Test
    void RED_A1_singlePartnerJournalSaleRemainsAReceivableSale() {
        UUID partnerId = UUID.randomUUID();
        PartnerSummary partner = partner(partnerId, "P-RED-A1");
        when(partnerLookupClient.findByPartnerCodeResult(partner.partnerCode()))
                .thenReturn(PartnerLookupClient.LookupResult.found(partner));
        when(journalLineRepository.aggregatePostedByPartnerAccount(FROM, TO)).thenReturn(List.of(
                new Total(partnerId, "110", new BigDecimal("100"), BigDecimal.ZERO)));
        Journal journal = journal("RED-A1", FROM);
        org.mockito.Mockito.doReturn(List.of(
                        line(journal, 1, "110", "100", "0", partnerId),
                        line(journal, 2, "401", "0", "100", null)))
                .when(journalLineRepository).findJournalLinesInRangeForPartner(partnerId, FROM, TO);
        when(cashReceiptRepository.findAll(any(Specification.class))).thenReturn(List.of());
        lenient().when(salesClient.find(FROM, TO, partner.partnerCode(), partnerId)).thenReturn(List.of());

        var result = new PartnerLedgerReadModelService(
                salesClient, journalLineRepository, cashReceiptRepository, journalRepository,
                partnerLookupClient).read(partner.partnerCode(), FROM, TO);

        assertThat(result.selected().salesTotal()).isEqualByComparingTo("100");
        assertThat(result.selected().paymentTotal()).isZero();
        assertThat(result.selected().documents()).singleElement()
                .satisfies(document -> {
                    assertThat(document.effect()).isEqualTo(PartnerLedgerContract.Effect.SALE);
                    assertThat(document.amount()).isEqualByComparingTo("100");
                });
    }

    @Test
    void RED_A2_unconnectedCounterLineStillClassifiesTheJournalAsPayment() {
        UUID partnerId = UUID.randomUUID();
        PartnerSummary partner = partner(partnerId, "P-RED-A2");
        when(partnerLookupClient.findByPartnerCodeResult(partner.partnerCode()))
                .thenReturn(PartnerLookupClient.LookupResult.found(partner));
        when(journalLineRepository.aggregatePostedByPartnerAccount(FROM, TO)).thenReturn(List.of(
                new Total(partnerId, "110", BigDecimal.ZERO, new BigDecimal("100"))));
        Journal journal = journal("RED-A2", FROM);
        org.mockito.Mockito.doReturn(List.of(
                        line(journal, 1, "110", "0", "100", partnerId),
                        line(journal, 2, "102", "100", "0", null)))
                .when(journalLineRepository).findJournalLinesInRangeForPartner(partnerId, FROM, TO);
        when(cashReceiptRepository.findAll(any(Specification.class))).thenReturn(List.of());
        lenient().when(salesClient.find(FROM, TO, partner.partnerCode(), partnerId)).thenReturn(List.of());

        var result = new PartnerLedgerReadModelService(
                salesClient, journalLineRepository, cashReceiptRepository, journalRepository,
                partnerLookupClient).read(partner.partnerCode(), FROM, TO);

        assertThat(result.selected().salesTotal()).isZero();
        assertThat(result.selected().paymentTotal()).isEqualByComparingTo("100");
        assertThat(result.selected().receivableBalance()).isEqualByComparingTo("-100");
    }

    @Test
    void RED_FIX3_sameDayEarlierSlipJournalIsOpeningButLaterSlipJournalIsNot() {
        UUID partnerId = UUID.randomUUID();
        PartnerSummary partner = partner(partnerId, "P-FIX3-ORDER");
        String targetSlipNo = FROM + "-2";
        Journal earlierSlipJournal = journal(FROM + "-1", FROM);
        org.mockito.Mockito.lenient().doReturn(com.samhanair.logis.accounting.domain.JournalSourceType.SLIP)
                .when(earlierSlipJournal).getSourceType();
        Journal laterSlipJournal = journal(FROM + "-3", FROM);
        org.mockito.Mockito.lenient().doReturn(com.samhanair.logis.accounting.domain.JournalSourceType.SLIP)
                .when(laterSlipJournal).getSourceType();
        when(partnerLookupClient.findByPartnerCodeResult(partner.partnerCode()))
                .thenReturn(PartnerLookupClient.LookupResult.found(partner));
        when(journalLineRepository.aggregatePostedByPartnerAccount(FROM, TO)).thenReturn(List.of(
                new Total(partnerId, "110", new BigDecimal("100"), BigDecimal.ZERO)));
        when(journalLineRepository.aggregateAgingByAccount(any(String.class), any(LocalDate.class)))
                .thenReturn(List.of(new Total(partnerId, "110", new BigDecimal("100"), BigDecimal.ZERO)));
        org.mockito.Mockito.doReturn(List.of(
                        line(earlierSlipJournal, 1, "110", "100", "0", partnerId),
                        line(earlierSlipJournal, 2, "401", "0", "100", null),
                        line(laterSlipJournal, 1, "110", "200", "0", partnerId),
                        line(laterSlipJournal, 2, "401", "0", "200", null)))
                .when(journalLineRepository).findJournalLinesUpToForPartner(
                        org.mockito.ArgumentMatchers.eq(partnerId), any(LocalDate.class));
        lenient().when(journalLineRepository.findJournalLinesInRangeForPartner(partnerId, FROM, TO))
                .thenReturn(List.of());
        when(cashReceiptRepository.findAll(any(Specification.class))).thenReturn(List.of());
        lenient().when(salesClient.find(any(LocalDate.class), any(LocalDate.class),
                org.mockito.ArgumentMatchers.eq(partner.partnerCode()),
                org.mockito.ArgumentMatchers.eq(partnerId))).thenReturn(List.of());
        org.mockito.Mockito.doReturn(List.of(sale(targetSlipNo, FROM, "DRAFT", partner)))
                .when(salesClient).find(FROM, TO, partner.partnerCode(), partnerId);
        when(salesClient.findBySlipNo(targetSlipNo)).thenReturn(sale(targetSlipNo, FROM, "DRAFT", partner));

        var result = new PartnerLedgerReadModelService(
                salesClient, journalLineRepository, cashReceiptRepository, journalRepository,
                partnerLookupClient).read(partner.partnerCode(), FROM, TO, targetSlipNo).selected();

        assertThat(result.openingBalance()).isEqualByComparingTo("100");
        assertThat(result.receivableBalance()).isEqualByComparingTo("100");
    }

    @Test
    void RED_FIX3_sameDayNoSlipJournalIsAfterTargetSlip() {
        UUID partnerId = UUID.randomUUID();
        PartnerSummary partner = partner(partnerId, "P-FIX3-TIE");
        String targetSlipNo = FROM + "-2";
        Journal noSlipJournal = journal("manual-journal", FROM);
        org.mockito.Mockito.lenient().doReturn(com.samhanair.logis.accounting.domain.JournalSourceType.MANUAL)
                .when(noSlipJournal).getSourceType();
        when(partnerLookupClient.findByPartnerCodeResult(partner.partnerCode()))
                .thenReturn(PartnerLookupClient.LookupResult.found(partner));
        when(journalLineRepository.aggregatePostedByPartnerAccount(FROM, TO)).thenReturn(List.of(
                new Total(partnerId, "110", new BigDecimal("100"), BigDecimal.ZERO)));
        when(journalLineRepository.aggregateAgingByAccount(any(String.class), any(LocalDate.class)))
                .thenReturn(List.of(new Total(partnerId, "110", new BigDecimal("100"), BigDecimal.ZERO)));
        org.mockito.Mockito.doReturn(List.of(line(noSlipJournal, 1, "110", "100", "0", partnerId)))
                .when(journalLineRepository).findJournalLinesUpToForPartner(
                        org.mockito.ArgumentMatchers.eq(partnerId), any(LocalDate.class));
        when(journalLineRepository.findJournalLinesInRangeForPartner(partnerId, FROM, TO))
                .thenReturn(List.of());
        when(cashReceiptRepository.findAll(any(Specification.class))).thenReturn(List.of());
        lenient().when(salesClient.find(any(LocalDate.class), any(LocalDate.class),
                org.mockito.ArgumentMatchers.eq(partner.partnerCode()),
                org.mockito.ArgumentMatchers.eq(partnerId))).thenReturn(List.of());
        org.mockito.Mockito.doReturn(List.of(sale(targetSlipNo, FROM, "DRAFT", partner)))
                .when(salesClient).find(FROM, TO, partner.partnerCode(), partnerId);
        when(salesClient.findBySlipNo(targetSlipNo)).thenReturn(sale(targetSlipNo, FROM, "DRAFT", partner));

        var result = new PartnerLedgerReadModelService(
                salesClient, journalLineRepository, cashReceiptRepository, journalRepository,
                partnerLookupClient).read(partner.partnerCode(), FROM, TO, targetSlipNo).selected();

        assertThat(result.openingBalance()).isZero();
    }

    @Test
    void RED_FIX3_canceledSlipProjectionIsDisplayOnlyAndDoesNotAffectClosing() {
        UUID partnerId = UUID.randomUUID();
        PartnerSummary partner = partner(partnerId, "P-FIX3-CANCELED");
        String targetSlipNo = FROM + "-7";
        when(partnerLookupClient.findByPartnerCodeResult(partner.partnerCode()))
                .thenReturn(PartnerLookupClient.LookupResult.found(partner));
        when(journalLineRepository.aggregatePostedByPartnerAccount(FROM, TO)).thenReturn(List.of());
        when(journalLineRepository.aggregateAgingByAccount(any(String.class), any(LocalDate.class)))
                .thenReturn(List.of());
        when(journalLineRepository.findJournalLinesInRangeForPartner(partnerId, FROM, TO))
                .thenReturn(List.of());
        when(cashReceiptRepository.findAll(any(Specification.class))).thenReturn(List.of());
        lenient().when(salesClient.find(any(LocalDate.class), any(LocalDate.class),
                org.mockito.ArgumentMatchers.eq(partner.partnerCode()),
                org.mockito.ArgumentMatchers.eq(partnerId))).thenReturn(List.of());
        when(salesClient.findBySlipNo(targetSlipNo)).thenReturn(sale(targetSlipNo, FROM, "CANCELED", partner));

        var result = new PartnerLedgerReadModelService(
                salesClient, journalLineRepository, cashReceiptRepository, journalRepository,
                partnerLookupClient).read(partner.partnerCode(), FROM, TO, targetSlipNo).selected();

        assertThat(result.documents()).singleElement()
                .satisfies(document -> assertThat(document.effect())
                        .isEqualTo(PartnerLedgerContract.Effect.NONE));
        assertThat(result.salesTotal()).isZero();
        assertThat(result.receivableBalance()).isZero();
    }

    @Test
    void RED_FIX3_postedJournalAndSlipProjectionAreCountedOnce() {
        UUID partnerId = UUID.randomUUID();
        PartnerSummary partner = partner(partnerId, "P-FIX3-DOUBLE");
        String slipNo = FROM + "-8";
        Journal journal = journal(FROM + "-1", FROM);
        org.mockito.Mockito.lenient().doReturn(com.samhanair.logis.accounting.domain.JournalSourceType.SLIP)
                .when(journal).getSourceType();
        when(partnerLookupClient.findByPartnerCodeResult(partner.partnerCode()))
                .thenReturn(PartnerLookupClient.LookupResult.found(partner));
        when(journalLineRepository.aggregatePostedByPartnerAccount(FROM, TO)).thenReturn(List.of(
                new Total(partnerId, "110", new BigDecimal("100"), BigDecimal.ZERO)));
        when(journalLineRepository.aggregateAgingByAccount(any(String.class), any(LocalDate.class)))
                .thenReturn(List.of());
        org.mockito.Mockito.doReturn(List.of(
                        line(journal, 1, "110", "100", "0", partnerId),
                        line(journal, 2, "401", "0", "100", null)))
                .when(journalLineRepository).findJournalLinesInRangeForPartner(partnerId, FROM, TO);
        when(cashReceiptRepository.findAll(any(Specification.class))).thenReturn(List.of());
        lenient().when(salesClient.find(any(LocalDate.class), any(LocalDate.class),
                org.mockito.ArgumentMatchers.eq(partner.partnerCode()),
                org.mockito.ArgumentMatchers.eq(partnerId))).thenReturn(List.of());
        org.mockito.Mockito.doReturn(List.of(sale(slipNo, FROM, "CONFIRMED", partner)))
                .when(salesClient).find(FROM, TO, partner.partnerCode(), partnerId);

        var result = new PartnerLedgerReadModelService(
                salesClient, journalLineRepository, cashReceiptRepository, journalRepository,
                partnerLookupClient).read(partner.partnerCode(), FROM, TO).selected();

        assertThat(result.salesTotal()).isEqualByComparingTo("100");
        assertThat(result.receivableBalance()).isEqualByComparingTo("100");
    }

    private static PartnerLedgerSalesClient.Sale sale(String slipNo, LocalDate date, String status,
                                                       PartnerSummary partner) {
        return new PartnerLedgerSalesClient.Sale(slipNo, date, status, partner.partnerCode(),
                partner.partnerId(), partner.name(), partner.bizNo(), "주소",
                List.of(new PartnerLedgerSalesClient.Line("품목", null, 1,
                        new BigDecimal("100"), new BigDecimal("100"))));
    }

    @Test
    void RED_A3_openingPlusSalesMinusPaymentEqualsClosing() {
        UUID partnerId = UUID.randomUUID();
        PartnerSummary partner = partner(partnerId, "P-RED-A3");
        LocalDate asOf = FROM.minusDays(1);
        when(partnerLookupClient.findByPartnerCodeResult(partner.partnerCode()))
                .thenReturn(PartnerLookupClient.LookupResult.found(partner));
        when(journalLineRepository.aggregatePostedByPartnerAccount(FROM, TO)).thenReturn(List.of(
                new Total(partnerId, "110", new BigDecimal("100"), new BigDecimal("30"))));
        when(journalLineRepository.aggregateAgingByAccount("110", asOf)).thenReturn(List.of(
                new Total(partnerId, "110", new BigDecimal("50"), BigDecimal.ZERO)));
        Journal openingJournal = journal("RED-A3-OPEN", asOf);
        org.mockito.Mockito.doReturn(List.of(
                        line(openingJournal, 1, "110", "50", "0", partnerId),
                        line(openingJournal, 2, "401", "0", "50", null)))
                .when(journalLineRepository).findJournalLinesUpToForPartner(partnerId, asOf);
        Journal saleJournal = journal("RED-A3-SALE", FROM);
        Journal paymentJournal = journal("RED-A3-PAY", FROM.plusDays(1));
        org.mockito.Mockito.doReturn(List.of(
                        line(saleJournal, 1, "110", "100", "0", partnerId),
                        line(saleJournal, 2, "401", "0", "100", null),
                        line(paymentJournal, 1, "110", "0", "30", partnerId),
                        line(paymentJournal, 2, "102", "30", "0", null)))
                .when(journalLineRepository).findJournalLinesInRangeForPartner(partnerId, FROM, TO);
        when(cashReceiptRepository.findAll(any(Specification.class))).thenReturn(List.of());
        lenient().when(salesClient.find(any(LocalDate.class), any(LocalDate.class),
                org.mockito.ArgumentMatchers.eq(partner.partnerCode()), org.mockito.ArgumentMatchers.eq(partnerId)))
                .thenReturn(List.of());

        var result = new PartnerLedgerReadModelService(
                salesClient, journalLineRepository, cashReceiptRepository, journalRepository,
                partnerLookupClient).read(partner.partnerCode(), FROM, TO);

        assertThat(result.selected().openingBalance()).isEqualByComparingTo("50");
        assertThat(result.selected().salesTotal()).isEqualByComparingTo("100");
        assertThat(result.selected().paymentTotal()).isEqualByComparingTo("30");
        assertThat(result.selected().receivableBalance()).isEqualByComparingTo(
                result.selected().openingBalance()
                        .add(result.selected().salesTotal())
                        .subtract(result.selected().paymentTotal()));
    }

    @Test
    void RED_A4_aggregateDetailAndPrintPathsExposeTheSameClosingBalance() throws Exception {
        UUID partnerId = UUID.randomUUID();
        PartnerSummary partner = partner(partnerId, "P-RED-A4");
        when(partnerLookupClient.findByPartnerCodeResult(partner.partnerCode()))
                .thenReturn(PartnerLookupClient.LookupResult.found(partner));
        when(journalLineRepository.aggregatePostedByPartnerAccount(FROM, TO)).thenReturn(List.of(
                new Total(partnerId, "110", new BigDecimal("100"), BigDecimal.ZERO)));
        Journal journal = journal("RED-A4", FROM);
        org.mockito.Mockito.doReturn(List.of(
                        line(journal, 1, "110", "100", "0", partnerId),
                        line(journal, 2, "401", "0", "100", null)))
                .when(journalLineRepository).findJournalLinesInRangeForPartner(partnerId, FROM, TO);
        when(cashReceiptRepository.findAll(any(Specification.class))).thenReturn(List.of());
        lenient().when(salesClient.find(FROM, TO, partner.partnerCode(), partnerId)).thenReturn(List.of());

        var readModel = new PartnerLedgerReadModelService(
                salesClient, journalLineRepository, cashReceiptRepository, journalRepository,
                partnerLookupClient);
        var detailService = new PartnerLedgerReadService(
                salesClient, cashReceiptRepository, journalRepository, partnerLookupClient, readModel);
        var aggregateService = new SalesAggregateService(
                journalLineRepository, cashReceiptRepository, partnerLookupClient, salesClient, readModel);

        var model = readModel.read(partner.partnerCode(), FROM, TO).selected();
        var detail = detailService.read(partner.partnerCode(), FROM, TO);
        var aggregate = aggregateService.aggregate(FROM, TO, partner.partnerCode()).get(0);
        var method = com.samhanair.logis.accounting.web.AccountingReportController.class
                .getDeclaredMethod("toLegacyLedgerResponse",
                        com.samhanair.logis.accounting.web.dto.PartnerLedgerResponse.class);
        method.setAccessible(true);
        var print = (com.samhanair.logis.accounting.web.dto.LedgerImageResponse)
                method.invoke(null, detail);

        assertThat(model.receivableBalance()).isEqualByComparingTo("100");
        assertThat(detail.closingBalance()).isEqualByComparingTo(model.receivableBalance());
        assertThat(aggregate.receivableBalance()).isEqualByComparingTo(model.receivableBalance());
        assertThat(print.lines()).last().satisfies(line ->
                assertThat(line.balance()).isEqualByComparingTo(model.receivableBalance()));
    }

    @Test
    void RED_B1_eachPartnerOwnsOnlyItsReceivableLinesInOneJournal() {
        UUID partnerAId = UUID.randomUUID();
        UUID partnerBId = UUID.randomUUID();
        PartnerSummary partnerA = partner(partnerAId, "P-RED-B1-A");
        PartnerSummary partnerB = partner(partnerBId, "P-RED-B1-B");
        when(partnerLookupClient.findByPartnerCodeResult(partnerA.partnerCode()))
                .thenReturn(PartnerLookupClient.LookupResult.found(partnerA));
        when(partnerLookupClient.findByPartnerCodeResult(partnerB.partnerCode()))
                .thenReturn(PartnerLookupClient.LookupResult.found(partnerB));
        when(journalLineRepository.aggregatePostedByPartnerAccount(FROM, TO)).thenReturn(List.of(
                new Total(partnerAId, "110", new BigDecimal("100"), BigDecimal.ZERO),
                new Total(partnerBId, "110", new BigDecimal("200"), BigDecimal.ZERO)));
        Journal journal = journal("RED-B1", FROM);
        List<JournalLine> lines = List.of(
                line(journal, 1, "110", "100", "0", partnerAId),
                line(journal, 2, "110", "200", "0", partnerBId),
                line(journal, 3, "401", "0", "300", null));
        when(journalLineRepository.findJournalLinesInRangeForPartner(partnerAId, FROM, TO)).thenReturn(lines);
        when(journalLineRepository.findJournalLinesInRangeForPartner(partnerBId, FROM, TO)).thenReturn(lines);
        when(cashReceiptRepository.findAll(any(Specification.class))).thenReturn(List.of());
        lenient().when(salesClient.find(any(LocalDate.class), any(LocalDate.class),
                org.mockito.ArgumentMatchers.anyString(), any(UUID.class))).thenReturn(List.of());

        var service = new PartnerLedgerReadModelService(
                salesClient, journalLineRepository, cashReceiptRepository, journalRepository,
                partnerLookupClient);

        var resultA = service.read(partnerA.partnerCode(), FROM, TO).selected();
        var resultB = service.read(partnerB.partnerCode(), FROM, TO).selected();

        assertThat(resultA.salesTotal()).isEqualByComparingTo("100");
        assertThat(resultB.salesTotal()).isEqualByComparingTo("200");
    }

    @Test
    void RED_B2_reversalPairBeforePeriodUsesTheSameCollectionContractAsThePeriod() {
        UUID partnerId = UUID.randomUUID();
        PartnerSummary partner = partner(partnerId, "P-RED-B2");
        LocalDate priorDate = FROM.minusDays(1);
        when(partnerLookupClient.findByPartnerCodeResult(partner.partnerCode()))
                .thenReturn(PartnerLookupClient.LookupResult.found(partner));
        when(journalLineRepository.aggregatePostedByPartnerAccount(FROM, TO)).thenReturn(List.of(
                new Total(partnerId, "110", BigDecimal.ONE, BigDecimal.ZERO)));
        when(journalLineRepository.aggregateAgingByAccount("110", priorDate)).thenReturn(List.of(
                new Total(partnerId, "110", new BigDecimal("777"), new BigDecimal("777"))));
        Journal original = journal("RED-B2-ORIGINAL", priorDate);
        Journal reversal = journal("RED-B2-REVERSAL", priorDate);
        org.mockito.Mockito.doReturn(List.of(
                        line(original, 1, "110", "777", "0", partnerId),
                        line(original, 2, "401", "0", "777", null),
                        line(reversal, 1, "110", "0", "777", partnerId),
                        line(reversal, 2, "401", "777", "0", null)))
                .when(journalLineRepository).findJournalLinesUpToForPartner(partnerId, priorDate);
        when(cashReceiptRepository.findAll(any(Specification.class))).thenReturn(List.of());
        lenient().when(salesClient.find(any(LocalDate.class), any(LocalDate.class),
                org.mockito.ArgumentMatchers.eq(partner.partnerCode()), org.mockito.ArgumentMatchers.eq(partnerId)))
                .thenReturn(List.of());

        var result = new PartnerLedgerReadModelService(
                salesClient, journalLineRepository, cashReceiptRepository, journalRepository,
                partnerLookupClient).read(partner.partnerCode(), FROM, TO).selected();

        assertThat(result.openingBalance()).isZero();
    }

    @Test
    void ecountCanonicalAccountsKeepSalesAndMultiPartnerPaymentSeparate() {
        UUID customerId = UUID.randomUUID();
        UUID counterpartyId = UUID.randomUUID();
        PartnerSummary customer = partner(customerId, "P-ECOUNT-001");
        when(partnerLookupClient.findByPartnerCodeResult(customer.partnerCode()))
                .thenReturn(PartnerLookupClient.LookupResult.found(customer));
        when(chartOfAccountRepository.findAllByOrderByCodeAsc()).thenReturn(ecountLedgerAccounts());
        lenient().when(journalLineRepository.aggregateAgingByAccount(any(String.class), any(LocalDate.class)))
                .thenReturn(List.of());
        when(journalLineRepository.aggregatePostedByPartnerAccount(FROM, TO)).thenReturn(List.of(
                new Total(customerId, "1089", new BigDecimal("100"), new BigDecimal("33")),
                new Total(customerId, "4019", BigDecimal.ZERO, new BigDecimal("100")),
                new Total(customerId, "2519", new BigDecimal("33"), BigDecimal.ZERO)));
        Journal sale = journal("ECOUNT-SALE", FROM);
        Journal payment = journal("ECOUNT-PAYMENT", FROM.plusDays(1));
        org.mockito.Mockito.doReturn(List.of(
                line(sale, 1, "1089", "100", "0", customerId),
                line(sale, 2, "4019", "0", "100", null),
                line(payment, 1, "1089", "0", "33", customerId),
                line(payment, 2, "2519", "33", "0", counterpartyId)))
                .when(journalLineRepository).findJournalLinesInRangeForPartner(customerId, FROM, TO);
        when(cashReceiptRepository.findAll(any(Specification.class))).thenReturn(List.of(), List.of());
        lenient().when(salesClient.find(any(LocalDate.class), any(LocalDate.class),
                org.mockito.ArgumentMatchers.eq(customer.partnerCode()), org.mockito.ArgumentMatchers.eq(customerId)))
                .thenReturn(List.of());

        var result = new PartnerLedgerReadModelService(
                salesClient, journalLineRepository, cashReceiptRepository, journalRepository,
                partnerLookupClient, chartOfAccountRepository).read(customer.partnerCode(), FROM, TO).selected();

        assertThat(result.salesTotal()).isEqualByComparingTo("100");
        assertThat(result.paymentTotal()).isEqualByComparingTo("33");
        assertThat(result.receivableBalance()).isEqualByComparingTo("67");
        assertThat(result.documents()).extracting(PartnerLedgerReadModel.Document::effect)
                .containsExactly(PartnerLedgerContract.Effect.SALE, PartnerLedgerContract.Effect.PAYMENT);
        assertThat(result.documents().get(1).amount()).isEqualByComparingTo("33");
        assertThat(result.documents().get(1).accountCode()).isEqualTo("1089");
    }

    @Test
    void fourEcountFeeSettlementsArePaymentsForEachCustomer() {
        UUID counterpartyId = UUID.randomUUID();
        List<UUID> customerIds = List.of(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID());
        List<BigDecimal> amounts = List.of(
                new BigDecimal("33000"), new BigDecimal("165000"),
                new BigDecimal("165000"), new BigDecimal("49500"));
        List<JournalLineRepository.PartnerAccountTotal> totals = customerIds.stream()
                .map(id -> (JournalLineRepository.PartnerAccountTotal) new Total(
                        id, "1089", BigDecimal.ZERO, amounts.get(customerIds.indexOf(id))))
                .toList();
        when(chartOfAccountRepository.findAllByOrderByCodeAsc()).thenReturn(ecountLedgerAccounts());
        lenient().when(journalLineRepository.aggregateAgingByAccount(any(String.class), any(LocalDate.class)))
                .thenReturn(List.of());
        when(journalLineRepository.aggregatePostedByPartnerAccount(FROM, TO)).thenReturn(totals);
        when(cashReceiptRepository.findAll(any(Specification.class))).thenReturn(List.of());

        for (int i = 0; i < customerIds.size(); i++) {
            UUID customerId = customerIds.get(i);
            String code = "P-ECOUNT-FEE-" + (i + 1);
            PartnerSummary customer = partner(customerId, code);
            BigDecimal amount = amounts.get(i);
            when(partnerLookupClient.findByPartnerCodeResult(code))
                    .thenReturn(PartnerLookupClient.LookupResult.found(customer));
            Journal journal = journal("ECOUNT-FEE-" + (i + 1), FROM);
            org.mockito.Mockito.doReturn(List.of(
                    line(journal, 1, "1089", "0", amount.toPlainString(), customerId),
                    line(journal, 2, "2519", amount.toPlainString(), "0", counterpartyId)))
                    .when(journalLineRepository).findJournalLinesInRangeForPartner(customerId, FROM, TO);
            lenient().when(salesClient.find(FROM, TO, code, customerId)).thenReturn(List.of());
        }

        var service = new PartnerLedgerReadModelService(
                salesClient, journalLineRepository, cashReceiptRepository, journalRepository,
                partnerLookupClient, chartOfAccountRepository);
        for (int i = 0; i < customerIds.size(); i++) {
            var result = service.read("P-ECOUNT-FEE-" + (i + 1), FROM, TO).selected();
            assertThat(result.paymentTotal()).isEqualByComparingTo(amounts.get(i));
            assertThat(result.salesTotal()).isZero();
            assertThat(result.documents()).singleElement()
                    .satisfies(document -> assertThat(document.effect())
                            .isEqualTo(PartnerLedgerContract.Effect.PAYMENT));
        }
    }

    @Test
    void confirmedReceiptBeforePeriodBecomesOpeningAndOpeningOnlyPartnerRemainsVisible() {
        UUID partnerId = UUID.randomUUID();
        PartnerSummary partner = partner(partnerId, "P-OPENING-RECEIPT");
        when(partnerLookupClient.findByPartnerCodeResult(partner.partnerCode()))
                .thenReturn(PartnerLookupClient.LookupResult.found(partner));
        when(journalLineRepository.aggregatePostedByPartnerAccount(FROM, TO)).thenReturn(List.of());
        CashReceipt priorReceipt = CashReceipt.fromMig7Staging(
                "OPENING-RECEIPT", partnerId, new BigDecimal("500"), FROM.minusDays(1),
                com.samhanair.logis.accounting.domain.CashReceiptKind.DEPOSIT_REPORT,
                "기간 밖 확정수금", "OPENING-RECEIPT");
        when(cashReceiptRepository.findAll(any(Specification.class))).thenReturn(
                List.of(priorReceipt), List.of());
        lenient().when(salesClient.find(any(LocalDate.class), any(LocalDate.class),
                org.mockito.ArgumentMatchers.eq(partner.partnerCode()), org.mockito.ArgumentMatchers.eq(partnerId)))
                .thenReturn(List.of());

        var result = new PartnerLedgerReadModelService(
                salesClient, journalLineRepository, cashReceiptRepository, journalRepository,
                partnerLookupClient).read(partner.partnerCode(), FROM, TO).selected();

        assertThat(result).isNotNull();
        assertThat(result.documents()).isEmpty();
        assertThat(result.openingBalance()).isZero();
        assertThat(result.salesTotal()).isZero();
        assertThat(result.paymentTotal()).isZero();
        assertThat(result.receivableBalance()).isZero();
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

    private static PartnerSummary partner(UUID id, String code) {
        return new PartnerSummary(id, code, code + " 거래처", "", "");
    }

    private static List<ChartOfAccount> ecountLedgerAccounts() {
        return List.of(
                ChartOfAccount.create("110", "외상매출금", AccountCategory.ASSET, "100", true, 1),
                ChartOfAccount.create("1089", "외상매출금", AccountCategory.ASSET, "1087", true, 2),
                ChartOfAccount.create("201", "외상매입금", AccountCategory.LIABILITY, "200", true, 3),
                ChartOfAccount.create("2519", "외상매입금", AccountCategory.LIABILITY, "2518", true, 4),
                ChartOfAccount.create("401", "상품매출", AccountCategory.REVENUE, "400", true, 5),
                ChartOfAccount.create("4019", "상품매출", AccountCategory.REVENUE, "4011", true, 6));
    }

    private static Journal journal(String journalNo, LocalDate date) {
        Journal journal = org.mockito.Mockito.mock(Journal.class);
        org.mockito.Mockito.lenient().doReturn(UUID.randomUUID()).when(journal).getId();
        org.mockito.Mockito.lenient().doReturn(journalNo).when(journal).getJournalNo();
        org.mockito.Mockito.lenient().doReturn(date).when(journal).getJournalDate();
        org.mockito.Mockito.lenient().doReturn(com.samhanair.logis.accounting.domain.JournalSourceType.MANUAL)
                .when(journal).getSourceType();
        org.mockito.Mockito.lenient().doReturn(com.samhanair.logis.accounting.domain.JournalStatus.POSTED)
                .when(journal).getStatus();
        org.mockito.Mockito.lenient().doReturn("RED-TEST").when(journal).getPostedBy();
        return journal;
    }

    private static JournalLine line(Journal journal, int lineNo, String accountCode,
                                    String debit, String credit, UUID partnerId) {
        JournalLine line = org.mockito.Mockito.mock(JournalLine.class);
        org.mockito.Mockito.lenient().doReturn(journal).when(line).getJournal();
        org.mockito.Mockito.lenient().doReturn(lineNo).when(line).getLineNo();
        org.mockito.Mockito.lenient().doReturn(accountCode).when(line).getAccountCode();
        org.mockito.Mockito.lenient().doReturn(new BigDecimal(debit)).when(line).getDebitAmount();
        org.mockito.Mockito.lenient().doReturn(new BigDecimal(credit)).when(line).getCreditAmount();
        org.mockito.Mockito.lenient().doReturn(partnerId).when(line).getPartnerId();
        return line;
    }
}
