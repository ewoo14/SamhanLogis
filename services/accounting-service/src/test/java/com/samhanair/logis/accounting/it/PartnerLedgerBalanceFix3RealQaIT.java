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

/**
 * fix3 금액 계약을 격리 PostgreSQL 왕복으로 검증한다.
 *
 * <p>분개를 실제 Flyway 스키마에 저장하고, slip projection만 mock으로 보조 주입한다.
 * projection은 화면에 남지만 잔액 fold에는 들어가지 않는다.</p>
 */
@SpringBootTest(classes = AccountingServiceApplication.class)
@Transactional
class PartnerLedgerBalanceFix3RealQaIT extends AbstractPostgresIT {

    private static final LocalDate DATE = LocalDate.of(2090, 1, 17);
    private static final UUID PARTNER_ID = UUID.randomUUID();
    private static final String PARTNER_CODE = "P-FIX3-REAL-QA";

    @Autowired private PartnerLedgerReadModelService ledger;
    @Autowired private JournalRepository journalRepository;

    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private PartnerLedgerSalesClient salesClient;
    @MockBean private ETaxClient eTaxClient;
    @MockBean private KftcClient kftcClient;
    @MockBean(classes = DynamicPermissionClient.class)
    private DynamicPermissionClient permissionClient;

    @Test
    void realQa_sameDayOrderAndNoSlipJournalAreAppliedOnlyBeforeTheTarget() {
        PartnerSummary partner = partner();
        when(partnerLookupClient.findByPartnerCodeResult(PARTNER_CODE))
                .thenReturn(PartnerLookupClient.LookupResult.found(partner));

        postJournal(DATE + "/1", DATE, JournalSourceType.SLIP, 100);
        postJournal(DATE + "/3", DATE, JournalSourceType.SLIP, 200);
        postJournal("manual-fix3-real-qa", DATE, JournalSourceType.MANUAL, 300);

        String targetSlipNo = DATE + "/2";
        when(salesClient.findBySlipNo(targetSlipNo)).thenReturn(sale(targetSlipNo, "DRAFT", 1));
        lenient().when(salesClient.find(any(LocalDate.class), any(LocalDate.class),
                eq(PARTNER_CODE), eq(PARTNER_ID))).thenReturn(List.of());

        var result = ledger.read(PARTNER_CODE, DATE, DATE, targetSlipNo).selected();

        assertThat(result.openingBalance()).isEqualByComparingTo("100");
        assertThat(result.salesTotal()).isZero();
        assertThat(result.receivableBalance()).isEqualByComparingTo("100");
    }

    @Test
    void realQa_postedJournalIsTheOnlyAmountSourceAndCanceledProjectionIsZero() {
        PartnerSummary partner = partner();
        when(partnerLookupClient.findByPartnerCodeResult(PARTNER_CODE))
                .thenReturn(PartnerLookupClient.LookupResult.found(partner));

        postJournal(DATE + "/8", DATE, JournalSourceType.SLIP, 100);
        when(salesClient.find(DATE, DATE, PARTNER_CODE, PARTNER_ID))
                .thenReturn(List.of(sale(DATE + "/8", "CONFIRMED", 100)));

        var posted = ledger.read(PARTNER_CODE, DATE, DATE).selected();
        assertThat(posted.salesTotal()).isEqualByComparingTo("100");
        assertThat(posted.receivableBalance()).isEqualByComparingTo("100");

        String canceledSlipNo = DATE + "/9";
        when(salesClient.find(DATE, DATE, PARTNER_CODE, PARTNER_ID)).thenReturn(List.of());
        when(salesClient.findBySlipNo(canceledSlipNo)).thenReturn(sale(canceledSlipNo, "CANCELED", 100));

        var canceled = ledger.read(PARTNER_CODE, DATE, DATE, canceledSlipNo).selected();
        assertThat(canceled.salesTotal()).isZero();
        assertThat(canceled.receivableBalance()).isEqualByComparingTo("100");
    }

    private PartnerSummary partner() {
        return new PartnerSummary(PARTNER_ID, PARTNER_CODE, "fix3 real qa", "", "");
    }

    private void postJournal(String journalNo, LocalDate date, JournalSourceType sourceType, int amount) {
        Journal journal = Journal.create(journalNo, date, "fix3 real qa", sourceType, null);
        journal.addLine(JournalLine.create(journal, 1, "110", BigDecimal.valueOf(amount), BigDecimal.ZERO,
                PARTNER_ID, "fix3 real qa"));
        journal.addLine(JournalLine.create(journal, 2, "401", BigDecimal.ZERO, BigDecimal.valueOf(amount),
                null, "fix3 real qa"));
        journal.post("fix3-real-qa");
        journalRepository.saveAndFlush(journal);
    }

    private PartnerLedgerSalesClient.Sale sale(String slipNo, String status, int amount) {
        return new PartnerLedgerSalesClient.Sale(slipNo, DATE, status, PARTNER_CODE, PARTNER_ID,
                "fix3 real qa", "", "", List.of(new PartnerLedgerSalesClient.Line(
                        "fix3", null, 1, BigDecimal.valueOf(amount), BigDecimal.valueOf(amount))));
    }

}
