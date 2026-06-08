package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.fail;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.service.JournalNumberService;
import com.samhanair.logis.accounting.service.TaxInvoiceNumberService;
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
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;

/**
 * 회계 업무번호 계열 동시 채번 회귀 테스트.
 *
 * <p>D-LOAD-04 fix5: 분개번호와 세금계산서 발행번호는 별도 sequence table 을 사용하므로,
 * 각 계열이 자체 row lock 을 통해 같은 날짜 병렬 호출에서도 중복을 만들지 않는지 검증한다.
 */
@SpringBootTest(classes = AccountingServiceApplication.class)
class AccountingNumberServiceIT extends AbstractPostgresIT {

    @Autowired private JournalNumberService journalNumberService;
    @Autowired private TaxInvoiceNumberService taxInvoiceNumberService;

    /** 외부 client 격리 — number service 테스트지만 ApplicationContext 로딩 안정화용. */
    @MockBean private ETaxClient eTaxClient;
    @MockBean private KftcClient kftcClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean(classes = com.samhanair.logis.security.permission.DynamicPermissionClient.class) private DynamicPermissionClient dynamicPermissionClient;

    @Test
    void journalNext_sameDateParallelCreation_returnsUniqueNumbersForEveryCaller() throws Exception {
        LocalDate date = uniqueSequenceDate();

        List<String> journalNos = runParallel(() -> journalNumberService.next(date));

        assertThat(journalNos).hasSize(8);
        assertThat(journalNos).doesNotHaveDuplicates();
        assertThat(journalNos.stream().map(AccountingNumberServiceIT::extractSeqNo).sorted().toList())
                .containsExactly(1, 2, 3, 4, 5, 6, 7, 8);
    }

    @Test
    void taxInvoiceNext_sameDateParallelCreation_returnsUniqueNumbersForEveryCaller() throws Exception {
        LocalDate date = uniqueSequenceDate();

        List<String> taxInvoiceNos = runParallel(() -> taxInvoiceNumberService.next(date));

        assertThat(taxInvoiceNos).hasSize(8);
        assertThat(taxInvoiceNos).doesNotHaveDuplicates();
        assertThat(taxInvoiceNos.stream().map(AccountingNumberServiceIT::extractSeqNo).sorted().toList())
                .containsExactly(1, 2, 3, 4, 5, 6, 7, 8);
    }

    private static LocalDate uniqueSequenceDate() {
        return LocalDate.of(2090, 1, 1)
                .plusDays(Math.floorMod(UUID.randomUUID().getMostSignificantBits(), 30_000));
    }

    private static List<String> runParallel(Callable<String> action) throws Exception {
        int workers = 8;
        ExecutorService executor = Executors.newFixedThreadPool(workers);
        CountDownLatch ready = new CountDownLatch(workers);
        CountDownLatch start = new CountDownLatch(1);
        List<Callable<String>> tasks = new ArrayList<>();
        for (int i = 0; i < workers; i++) {
            tasks.add(() -> {
                ready.countDown();
                if (!start.await(5, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("동시 회계 채번 시작 latch timeout");
                }
                return action.call();
            });
        }

        try {
            List<Future<String>> futures = tasks.stream()
                    .map(executor::submit)
                    .toList();
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();

            List<String> numbers = new ArrayList<>();
            for (Future<String> future : futures) {
                numbers.add(future.get(10, TimeUnit.SECONDS));
            }
            return numbers;
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
            fail("parallel number worker did not terminate within 10 seconds");
        } catch (InterruptedException ex) {
            executor.shutdownNow();
            Thread.currentThread().interrupt();
            throw ex;
        }
    }

    private static int extractSeqNo(String number) {
        int dashIdx = number.lastIndexOf('-');
        return Integer.parseInt(number.substring(dashIdx + 1));
    }
}
