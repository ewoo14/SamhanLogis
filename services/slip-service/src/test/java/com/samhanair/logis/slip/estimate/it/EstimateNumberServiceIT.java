package com.samhanair.logis.slip.estimate.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.fail;

import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.ArologisDispatchClient;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.NotificationChatRoomClient;
import com.samhanair.logis.slip.client.NotificationClient;
import com.samhanair.logis.slip.client.PartnerBlockClient;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.estimate.service.EstimateNumberService;
import com.samhanair.logis.slip.it.AbstractPostgresIT;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;

/**
 * 견적번호 일자별 채번 동시성 회귀 테스트.
 *
 * <p>D-LOAD-04 fix5: 견적 채번은 SlipNumberService 를 경유하지 않는 별도 sequence 계열이다.
 * 같은 날짜로 8개 트랜잭션이 동시에 진입해도 {@code estimate_number_sequences} row lock 으로
 * {@code estimateNo} 가 중복되지 않아야 한다.
 */
@SpringBootTest(classes = SlipServiceApplication.class)
class EstimateNumberServiceIT extends AbstractPostgresIT {

    @Autowired
    private EstimateNumberService estimateNumberService;

    /** 외부 client 전체 격리 — number service 테스트지만 ApplicationContext 로딩 안정화용. */
    @MockBean private ProductClient productClient;
    @MockBean private InventoryClient inventoryClient;
    @MockBean private NotificationClient notificationClient;
    @MockBean private NotificationChatRoomClient notificationChatRoomClient;
    @MockBean private PartnerBlockClient partnerBlockClient;
    @MockBean private PartnerInternalClient partnerInternalClient;
    @MockBean private UserInternalClient userInternalClient;
    @MockBean private WarehouseInternalClient warehouseInternalClient;
    @MockBean private ArologisDispatchClient arologisDispatchClient;

    @BeforeEach
    void setUpUserInternalClient() {
        Mockito.lenient().when(userInternalClient.resolveFullName(ArgumentMatchers.any()))
                .thenReturn(Optional.of("담당자"));
    }

    @Test
    void next_sameDateParallelCreation_returnsUniqueEstimateNumbersForEveryCaller() throws Exception {
        LocalDate date = LocalDate.of(2026, 6, 9);
        int workers = 8;
        ExecutorService executor = Executors.newFixedThreadPool(workers);
        CountDownLatch ready = new CountDownLatch(workers);
        CountDownLatch start = new CountDownLatch(1);
        List<Callable<String>> tasks = new ArrayList<>();
        for (int i = 0; i < workers; i++) {
            tasks.add(() -> {
                ready.countDown();
                if (!start.await(5, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("동시 견적 채번 시작 latch timeout");
                }
                return estimateNumberService.next(date);
            });
        }

        try {
            List<Future<String>> futures = tasks.stream()
                    .map(executor::submit)
                    .toList();
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();

            List<String> estimateNos = new ArrayList<>();
            for (Future<String> future : futures) {
                estimateNos.add(future.get(10, TimeUnit.SECONDS));
            }

            assertThat(estimateNos).hasSize(workers);
            assertThat(estimateNos).doesNotHaveDuplicates();
            assertThat(estimateNos.stream().map(estimateNumberService::extractSeqNo).sorted().toList())
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
            fail("parallel number worker did not terminate within 10 seconds");
        } catch (InterruptedException ex) {
            executor.shutdownNow();
            Thread.currentThread().interrupt();
            throw ex;
        }
    }
}
