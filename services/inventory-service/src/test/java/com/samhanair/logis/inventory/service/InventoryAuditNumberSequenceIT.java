package com.samhanair.logis.inventory.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.fail;

import com.samhanair.logis.inventory.InventoryServiceApplication;
import com.samhanair.logis.inventory.client.AccountingClient;
import com.samhanair.logis.inventory.client.ProductClient;
import com.samhanair.logis.inventory.client.SlipServiceClient;
import com.samhanair.logis.inventory.domain.InventoryAuditNumberSequence;
import com.samhanair.logis.inventory.it.AbstractPostgresIT;
import com.samhanair.logis.inventory.repository.InventoryAuditNumberSequenceRepository;
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
 * 재고 실사번호 동시 채번 회귀 테스트.
 *
 * <p>{@code inventory_audit_number_sequences.audit_date} row 를 먼저 생성 수렴한 뒤
 * {@code PESSIMISTIC_WRITE} 로 잠그고 {@code last_seq} 를 증가시키는 V21 패턴을 실제
 * PostgreSQL 트랜잭션에서 검증한다.
 */
@SpringBootTest(classes = InventoryServiceApplication.class)
class InventoryAuditNumberSequenceIT extends AbstractPostgresIT {

    private static final LocalDate AUDIT_DATE = LocalDate.of(2099, 12, 30);

    @Autowired private InventoryAuditNumberSequenceRepository sequenceRepository;
    @Autowired private TransactionTemplate transactionTemplate;
    @Autowired private JdbcTemplate jdbcTemplate;

    @MockBean private ProductClient productClient;
    @MockBean private AccountingClient accountingClient;
    @MockBean private SlipServiceClient slipServiceClient;

    @BeforeEach
    void cleanSequence() {
        jdbcTemplate.update("DELETE FROM inventory_audit_number_sequences WHERE audit_date = ?", AUDIT_DATE);
    }

    @Test
    void next_sameDateParallelTransactions_returnsUniqueSequencesForEveryCaller() throws Exception {
        int workers = 6;
        ExecutorService executor = Executors.newFixedThreadPool(workers);
        CountDownLatch ready = new CountDownLatch(workers);
        CountDownLatch start = new CountDownLatch(1);
        List<Callable<Integer>> tasks = new ArrayList<>();
        for (int i = 0; i < workers; i++) {
            tasks.add(() -> {
                ready.countDown();
                if (!start.await(5, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("동시 실사번호 채번 시작 latch timeout");
                }
                return transactionTemplate.execute(status -> {
                    sequenceRepository.insertIfAbsent(UUID.randomUUID(), AUDIT_DATE);
                    InventoryAuditNumberSequence sequence = sequenceRepository
                            .findLockedByAuditDate(AUDIT_DATE)
                            .orElseThrow(() -> new IllegalStateException("실사번호 시퀀스 생성 실패"));
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
                    .containsExactly(1, 2, 3, 4, 5, 6);
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
            fail("parallel audit number worker did not terminate within 10 seconds");
        } catch (InterruptedException ex) {
            executor.shutdownNow();
            Thread.currentThread().interrupt();
            throw ex;
        }
    }
}
