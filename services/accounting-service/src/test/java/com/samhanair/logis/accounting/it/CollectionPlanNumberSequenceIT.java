package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.fail;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.domain.CollectionPlanNumberSequence;
import com.samhanair.logis.accounting.repository.CollectionPlanNumberSequenceRepository;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 수금계획 번호 동시 채번 회귀 테스트.
 *
 * <p>{@code collection_plan_number_sequences.planned_date} 행을 먼저 생성한 뒤
 * {@code PESSIMISTIC_WRITE} 로 잠그고 {@code last_seq} 를 증가시키는 V55 패턴을 실제
 * PostgreSQL 트랜잭션에서 검증한다.
 */
@SpringBootTest(classes = AccountingServiceApplication.class)
class CollectionPlanNumberSequenceIT extends AbstractPostgresIT {

    private static final LocalDate PLANNED_DATE = LocalDate.of(2099, 12, 29);

    @Autowired private CollectionPlanNumberSequenceRepository sequenceRepository;
    @Autowired private TransactionTemplate transactionTemplate;
    @Autowired private JdbcTemplate jdbcTemplate;

    @MockBean private ETaxClient eTaxClient;
    @MockBean private KftcClient kftcClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean(classes = DynamicPermissionClient.class)
    private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void cleanSequence() {
        jdbcTemplate.update("DELETE FROM collection_plan_number_sequences WHERE planned_date = ?", PLANNED_DATE);
    }

    @Test
    void next_sameDateParallelTransactions_returnsUniqueSequencesForEveryCaller() throws Exception {
        int workers = 8;
        ExecutorService executor = Executors.newFixedThreadPool(workers);
        CountDownLatch ready = new CountDownLatch(workers);
        CountDownLatch start = new CountDownLatch(1);
        List<Callable<Integer>> tasks = new ArrayList<>();
        for (int i = 0; i < workers; i++) {
            tasks.add(() -> {
                ready.countDown();
                if (!start.await(5, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("parallel collection plan number latch timeout");
                }
                return transactionTemplate.execute(status -> {
                    sequenceRepository.insertIfAbsent(UUID.randomUUID(), PLANNED_DATE);
                    CollectionPlanNumberSequence sequence = sequenceRepository
                            .findLockedByPlannedDate(PLANNED_DATE)
                            .orElseThrow(() -> new IllegalStateException("collection plan number sequence missing"));
                    return sequence.next();
                });
            });
        }

        try {
            List<Future<Integer>> futures = tasks.stream()
                    .map(executor::submit)
                    .toList();
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();

            List<Integer> sequences = new ArrayList<>();
            for (Future<Integer> future : futures) {
                sequences.add(future.get(10, TimeUnit.SECONDS));
            }

            assertThat(sequences).hasSize(workers);
            assertThat(sequences).doesNotHaveDuplicates();
            assertThat(sequences.stream().sorted().toList())
                    .containsExactly(1, 2, 3, 4, 5, 6, 7, 8);
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
            fail("parallel collection plan number worker did not terminate within 10 seconds");
        } catch (InterruptedException ex) {
            executor.shutdownNow();
            Thread.currentThread().interrupt();
            throw ex;
        }
    }
}
