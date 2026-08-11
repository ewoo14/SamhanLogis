package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.fail;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.domain.SalesCommissionSettlement;
import com.samhanair.logis.accounting.repository.SalesCommissionSettlementRepository;
import com.samhanair.logis.accounting.service.SalesCommissionSettlementNumberService;
import com.samhanair.logis.accounting.service.SalesCommissionSettlementService;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

/** 영업수수료 정산서 생성과 문서번호 일자별 row-lock 채번의 PostgreSQL 왕복 검증. */
@SpringBootTest(classes = AccountingServiceApplication.class)
class SalesCommissionSettlementNumberSequenceIT extends AbstractPostgresIT {

    private static final LocalDate FIRST_DATE = LocalDate.of(2099, 12, 28);
    private static final LocalDate SECOND_DATE = LocalDate.of(2099, 12, 29);

    @Autowired private SalesCommissionSettlementNumberService numberService;
    @Autowired private SalesCommissionSettlementService settlementService;
    @Autowired private SalesCommissionSettlementRepository settlementRepository;
    @Autowired private TransactionTemplate transactionTemplate;
    @Autowired private JdbcTemplate jdbcTemplate;

    @MockBean private ETaxClient eTaxClient;
    @MockBean private KftcClient kftcClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean(classes = DynamicPermissionClient.class)
    private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void cleanFixtures() {
        jdbcTemplate.update("DELETE FROM sales_commission_settlements WHERE settlement_date IN (?, ?)",
                FIRST_DATE, SECOND_DATE);
        jdbcTemplate.update(
                "DELETE FROM sales_commission_settlement_number_sequences WHERE settlement_date IN (?, ?)",
                FIRST_DATE, SECOND_DATE);
    }

    @Test
    void createDraft_thenConfirm_thenFindByDocumentNo_roundTripsTheSameSettlement() {
        var draft = settlementService.createDraft(FIRST_DATE);

        assertThat(draft.getDocumentNo()).isNull();

        var confirmed = settlementService.confirm(draft.getId());
        var loaded = settlementService.findByDocumentNo(confirmed.getDocumentNo());
        var loadedWithPadding = settlementService.findByDocumentNo("  " + confirmed.getDocumentNo() + "  ");

        assertThat(confirmed.getDocumentNo()).isEqualTo("2099/12/28-1");
        assertThat(loaded.getId()).isEqualTo(confirmed.getId());
        assertThat(loaded.getDocumentNo()).isEqualTo(confirmed.getDocumentNo());
        assertThat(loadedWithPadding.getId()).isEqualTo(confirmed.getId());
    }

    @Test
    void findByDocumentNo_null_rejectsSingleDraft_withoutReturningIt() {
        var draft = settlementService.createDraft(FIRST_DATE);

        BusinessException exception = assertThrows(
                BusinessException.class, () -> settlementService.findByDocumentNo(null));

        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.INVALID_INPUT);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sales_commission_settlements WHERE id = ? AND status = 'DRAFT' AND document_no IS NULL",
                Integer.class, draft.getId())).isEqualTo(1);
    }

    @Test
    void findByDocumentNo_null_rejectsMultipleDrafts_beforeQueryCanReturnMultipleRows() {
        var first = settlementService.createDraft(FIRST_DATE);
        var second = settlementService.createDraft(FIRST_DATE);

        BusinessException exception = assertThrows(
                BusinessException.class, () -> settlementService.findByDocumentNo(null));

        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.INVALID_INPUT);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sales_commission_settlements WHERE id IN (?, ?) AND document_no IS NULL",
                Integer.class, first.getId(), second.getId())).isEqualTo(2);
    }

    @Test
    void findByDocumentNo_emptyOrWhitespace_rejectsDraftLookupKey() {
        settlementService.createDraft(FIRST_DATE);

        for (String invalidDocumentNo : List.of("", "   ")) {
            BusinessException exception = assertThrows(
                    BusinessException.class, () -> settlementService.findByDocumentNo(invalidDocumentNo));
            assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.INVALID_INPUT);
        }
    }

    @Test
    void findByDocumentNo_unknownValidNumber_returnsNotFound() {
        BusinessException exception = assertThrows(
                BusinessException.class, () -> settlementService.findByDocumentNo("2099/12/28-999"));

        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.NOT_FOUND);
    }

    @Test
    void findByDocumentNo_draftCannotBeFoundByNumber() {
        settlementService.createDraft(FIRST_DATE);

        BusinessException exception = assertThrows(
                BusinessException.class, () -> settlementService.findByDocumentNo("2099/12/28-1"));

        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.NOT_FOUND);
    }

    @Test
    void activeConfirmedSettlements_cannotShareDocumentNumber() {
        var first = settlementService.confirm(settlementService.createDraft(FIRST_DATE).getId());
        SalesCommissionSettlement duplicate = SalesCommissionSettlement.createDraft(FIRST_DATE)
                .confirm(first.getDocumentNo());

        assertThatThrownBy(() -> settlementRepository.saveAndFlush(duplicate))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void sameDate_incrementsAndDateChange_restartsAtOne() {
        var first = settlementService.confirm(settlementService.createDraft(FIRST_DATE).getId());
        var second = settlementService.confirm(settlementService.createDraft(FIRST_DATE).getId());
        var nextDate = settlementService.confirm(settlementService.createDraft(SECOND_DATE).getId());

        assertThat(first.getDocumentNo()).isEqualTo("2099/12/28-1");
        assertThat(second.getDocumentNo()).isEqualTo("2099/12/28-2");
        assertThat(nextDate.getDocumentNo()).isEqualTo("2099/12/29-1");
        assertThat(nextDate.getDocumentNo()).hasSizeLessThanOrEqualTo(40);
    }

    @Test
    void sameDate_concurrentNumberAllocation_hasNoDuplicates() throws Exception {
        int workers = 8;
        ExecutorService executor = Executors.newFixedThreadPool(workers);
        CountDownLatch ready = new CountDownLatch(workers);
        CountDownLatch start = new CountDownLatch(1);
        List<Callable<String>> tasks = new ArrayList<>();
        for (int i = 0; i < workers; i++) {
            tasks.add(() -> {
                ready.countDown();
                if (!start.await(5, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("sales commission number latch timeout");
                }
                return transactionTemplate.execute(status -> numberService.next(FIRST_DATE));
            });
        }

        try {
            List<Future<String>> futures = tasks.stream().map(executor::submit).toList();
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();

            List<String> numbers = new ArrayList<>();
            for (Future<String> future : futures) {
                numbers.add(future.get(10, TimeUnit.SECONDS));
            }

            assertThat(numbers).doesNotHaveDuplicates();
            assertThat(numbers.stream().sorted().toList())
                    .containsExactly(
                            "2099/12/28-1", "2099/12/28-2", "2099/12/28-3", "2099/12/28-4",
                            "2099/12/28-5", "2099/12/28-6", "2099/12/28-7", "2099/12/28-8");
        } finally {
            shutdownAndAwaitTermination(executor);
        }
    }

    private static void shutdownAndAwaitTermination(ExecutorService executor) throws InterruptedException {
        executor.shutdown();
        try {
            if (executor.awaitTermination(10, TimeUnit.SECONDS)) {
                return;
            }
            executor.shutdownNow();
            fail("sales commission number worker did not terminate within 10 seconds");
        } catch (InterruptedException ex) {
            executor.shutdownNow();
            Thread.currentThread().interrupt();
            throw ex;
        }
    }
}
