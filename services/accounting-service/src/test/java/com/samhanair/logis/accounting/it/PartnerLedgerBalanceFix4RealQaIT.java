package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.PartnerLedgerSalesClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.domain.Journal;
import com.samhanair.logis.accounting.domain.JournalLine;
import com.samhanair.logis.accounting.domain.JournalSourceType;
import com.samhanair.logis.accounting.repository.JournalRepository;
import com.samhanair.logis.accounting.service.PartnerLedgerReadModelService;
import com.samhanair.logis.common.ledger.PartnerLedgerContract;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.transaction.annotation.Transactional;

/** R22 전표 상태와 journalNo == slipNo exact dedup을 격리 PostgreSQL 왕복으로 검증한다. */
@SpringBootTest(classes = AccountingServiceApplication.class)
@Transactional
class PartnerLedgerBalanceFix4RealQaIT extends AbstractPostgresIT {

    private static final LocalDate DATE = LocalDate.of(2090, 1, 18);
    private static final UUID PARTNER_ID = UUID.randomUUID();
    private static final String PARTNER_CODE = "P-FIX4-REAL-QA";

    @Autowired private PartnerLedgerReadModelService ledger;
    @Autowired private JournalRepository journalRepository;

    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private PartnerLedgerSalesClient salesClient;
    @MockBean private ETaxClient eTaxClient;
    @MockBean private KftcClient kftcClient;
    @MockBean(classes = DynamicPermissionClient.class)
    private DynamicPermissionClient permissionClient;

    @Test
    void realQa_confirmedProjectionIsTheSameSaleAmountAsTheLedgerContract() {
        givenPartner();
        String slipNo = slipNo(2);
        givenPeriodSales(List.of(sale(slipNo, PartnerLedgerContract.CANONICAL_SALE_STATUSES.get(0), 100)));

        var result = ledger.read(PARTNER_CODE, DATE, DATE).selected();

        assertThat(result.salesTotal()).isEqualByComparingTo("100");
        assertThat(result.receivableBalance()).isEqualByComparingTo("100");
        assertThat(result.documents()).extracting(document -> document.documentNo())
                .containsExactly(slipNo);
    }

    @Test
    void realQa_exactSlipJournalAndProjectionAreCountedOnceButManualJournalIsKept() {
        givenPartner();
        String slipNo = slipNo(4);
        postJournal(slipNo, JournalSourceType.SLIP, 100);
        postJournal("manual-fix4-real-qa", JournalSourceType.MANUAL, 300);
        givenPeriodSales(List.of(sale(slipNo, PartnerLedgerContract.CANONICAL_SALE_STATUSES.get(0), 100)));

        var result = ledger.read(PARTNER_CODE, DATE, DATE).selected();

        assertThat(result.salesTotal()).isEqualByComparingTo("400");
        assertThat(result.receivableBalance()).isEqualByComparingTo("400");
        assertThat(result.documents()).hasSize(2);
        assertThat(result.documents()).extracting(document -> document.amount())
                .containsExactlyInAnyOrder(new BigDecimal("100"), new BigDecimal("300"));
    }

    @Test
    void realQa_manualJournalUsingSameTextIsNotMistakenForSlipJournal() {
        givenPartner();
        String slipNo = slipNo(5);
        postJournal(slipNo, JournalSourceType.MANUAL, 100);
        givenPeriodSales(List.of(sale(slipNo, PartnerLedgerContract.CANONICAL_SALE_STATUSES.get(0), 100)));

        var result = ledger.read(PARTNER_CODE, DATE, DATE).selected();

        assertThat(result.salesTotal()).isEqualByComparingTo("200");
        assertThat(result.receivableBalance()).isEqualByComparingTo("200");
        assertThat(result.documents()).hasSize(2);
    }

    @Test
    void realQa_canceledProjectionIsVisibleOnlyAsZeroEffect() {
        givenPartner();
        String canceledSlipNo = slipNo(8);
        PartnerLedgerSalesClient.Sale canceled = sale(canceledSlipNo, "CANCELED", 900);
        when(salesClient.findBySlipNo(canceledSlipNo)).thenReturn(canceled);
        lenient().when(salesClient.find(any(LocalDate.class), any(LocalDate.class),
                eq(PARTNER_CODE), eq(PARTNER_ID))).thenReturn(List.of());

        var result = ledger.read(PARTNER_CODE, DATE, DATE, canceledSlipNo).selected();

        assertThat(result.salesTotal()).isZero();
        assertThat(result.receivableBalance()).isZero();
        assertThat(result.documents()).singleElement()
                .satisfies(document -> assertThat(document.effect())
                        .isEqualTo(PartnerLedgerContract.Effect.NONE));
    }

    @Test
    void realQa_sameDaySlipNumberComesBeforeNoSlipJournal() {
        givenPartner();
        String slipNo = slipNo(2);
        postJournal("manual-fix4-order-real-qa", JournalSourceType.MANUAL, 300);
        givenPeriodSales(List.of(sale(slipNo, PartnerLedgerContract.CANONICAL_SALE_STATUSES.get(0), 100)));

        var result = ledger.read(PARTNER_CODE, DATE, DATE).selected();

        assertThat(result.documents()).extracting(document -> document.documentNo())
                .first().isEqualTo(slipNo);
        assertThat(result.documents()).hasSize(2);
    }

    @Test
    void realQa_sameDayEarlierSlipIsOpeningAndLaterSlipIsNot() {
        givenPartner();
        postJournal(slipNo(1), JournalSourceType.SLIP, 100);
        postJournal(slipNo(3), JournalSourceType.SLIP, 200);
        postJournal("manual-fix4-target-real-qa", JournalSourceType.MANUAL, 300);
        String targetSlipNo = slipNo(2);
        when(salesClient.findBySlipNo(targetSlipNo))
                .thenReturn(sale(targetSlipNo, "DRAFT", 1));
        lenient().when(salesClient.find(any(LocalDate.class), any(LocalDate.class),
                eq(PARTNER_CODE), eq(PARTNER_ID))).thenReturn(List.of());

        var result = ledger.read(PARTNER_CODE, DATE, DATE, targetSlipNo).selected();

        assertThat(result.openingBalance()).isEqualByComparingTo("100");
        assertThat(result.salesTotal()).isZero();
        assertThat(result.receivableBalance()).isEqualByComparingTo("100");
    }

    private void givenPartner() {
        when(partnerLookupClient.findByPartnerCodeResult(PARTNER_CODE))
                .thenReturn(PartnerLookupClient.LookupResult.found(partner()));
    }

    private void givenPeriodSales(List<PartnerLedgerSalesClient.Sale> sales) {
        lenient().when(salesClient.find(any(LocalDate.class), any(LocalDate.class),
                eq(PARTNER_CODE), eq(PARTNER_ID))).thenReturn(List.of());
        when(salesClient.find(DATE, DATE, PARTNER_CODE, PARTNER_ID)).thenReturn(sales);
    }

    private PartnerSummary partner() {
        return new PartnerSummary(PARTNER_ID, PARTNER_CODE, "fix4 real qa", "", "");
    }

    private void postJournal(String journalNo, JournalSourceType sourceType, int amount) {
        Journal journal = Journal.create(journalNo, DATE, "fix4 real qa", sourceType, null);
        journal.addLine(JournalLine.create(journal, 1, "1089", BigDecimal.valueOf(amount), BigDecimal.ZERO,
                PARTNER_ID, "fix4 real qa"));
        journal.addLine(JournalLine.create(journal, 2, "4019", BigDecimal.ZERO, BigDecimal.valueOf(amount),
                null, "fix4 real qa"));
        journal.post("fix4-real-qa");
        journalRepository.saveAndFlush(journal);
    }

    private PartnerLedgerSalesClient.Sale sale(String slipNo, String status, int amount) {
        return new PartnerLedgerSalesClient.Sale(slipNo, DATE, status, PARTNER_CODE, PARTNER_ID,
                "fix4 real qa", "", "", List.of(new PartnerLedgerSalesClient.Line(
                        "fix4", null, 1, BigDecimal.valueOf(amount), BigDecimal.valueOf(amount))));
    }

    private static String slipNo(int sequence) {
        return String.format("%04d/%02d/%02d-%d", DATE.getYear(), DATE.getMonthValue(), DATE.getDayOfMonth(), sequence);
    }
}
