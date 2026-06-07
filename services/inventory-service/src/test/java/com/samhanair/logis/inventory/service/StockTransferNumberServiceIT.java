package com.samhanair.logis.inventory.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.fail;
import static org.mockito.Mockito.when;

import com.samhanair.logis.inventory.InventoryServiceApplication;
import com.samhanair.logis.inventory.client.ProductClient;
import com.samhanair.logis.inventory.client.ProductSummary;
import com.samhanair.logis.inventory.domain.TransferReason;
import com.samhanair.logis.inventory.it.AbstractPostgresIT;
import com.samhanair.logis.inventory.repository.WarehouseRepository;
import com.samhanair.logis.inventory.web.dto.CreateTransferRequest;
import java.math.BigDecimal;
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
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;

/**
 * 이동전표번호 동시 채번 회귀 테스트.
 *
 * <p>D-LOAD-04 fix5: {@code stock_transfers.transfer_no} 는 보조 sequence table 없이
 * {@code max(seq)+1} 로 계산하므로, 생성 트랜잭션 전체가 같은 advisory lock 안에서 번호 계산과
 * INSERT 를 끝내야 한다.
 */
@SpringBootTest(classes = InventoryServiceApplication.class)
class StockTransferNumberServiceIT extends AbstractPostgresIT {

    @Autowired private StockTransferService stockTransferService;
    @Autowired private WarehouseRepository warehouseRepository;

    @MockBean private ProductClient productClient;

    private UUID hqId;
    private UUID vehicleId;
    private UUID productId;

    @BeforeEach
    void setUp() {
        hqId = warehouseRepository.findByCode("HQ-001")
                .orElseThrow(() -> new IllegalStateException("HQ-001 창고 시드 누락"))
                .getId();
        vehicleId = warehouseRepository.findByCode("VH-001")
                .orElseThrow(() -> new IllegalStateException("VH-001 창고 시드 누락"))
                .getId();
        productId = UUID.randomUUID();
        when(productClient.lookup(Mockito.anyList()))
                .thenReturn(List.of(new ProductSummary(
                        productId, "테스트 제품", "TEST-001", UUID.randomUUID(),
                        new BigDecimal("100000"), "ACTIVE")));
    }

    @Test
    void create_sameDateParallelCreation_returnsUniqueTransferNumbersForEveryCaller() throws Exception {
        int workers = 8;
        ExecutorService executor = Executors.newFixedThreadPool(workers);
        CountDownLatch ready = new CountDownLatch(workers);
        CountDownLatch start = new CountDownLatch(1);
        List<Callable<String>> tasks = new ArrayList<>();
        for (int i = 0; i < workers; i++) {
            tasks.add(() -> {
                ready.countDown();
                if (!start.await(5, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("동시 이동전표 생성 시작 latch timeout");
                }
                CreateTransferRequest request = new CreateTransferRequest(
                        hqId,
                        vehicleId,
                        TransferReason.OTHER,
                        "동시 채번 회귀",
                        List.of(new CreateTransferRequest.TransferLineRequest(productId, 1)));
                return stockTransferService.create(request, UUID.randomUUID().toString()).transferNo();
            });
        }

        try {
            List<Future<String>> futures = tasks.stream()
                    .map(executor::submit)
                    .toList();
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();

            List<String> transferNos = new ArrayList<>();
            for (Future<String> future : futures) {
                transferNos.add(future.get(10, TimeUnit.SECONDS));
            }

            assertThat(transferNos).hasSize(workers);
            assertThat(transferNos).doesNotHaveDuplicates();
            assertThat(transferNos.stream().map(StockTransferNumberServiceIT::extractSeqNo).sorted().toList())
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

    private static int extractSeqNo(String number) {
        int dashIdx = number.lastIndexOf('-');
        return Integer.parseInt(number.substring(dashIdx + 1));
    }
}
