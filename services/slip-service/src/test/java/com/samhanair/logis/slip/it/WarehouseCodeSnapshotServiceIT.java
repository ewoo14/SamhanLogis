package com.samhanair.logis.slip.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.service.WarehouseCodeSnapshotService;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.transaction.support.TransactionTemplate;

/** 발행 commit 이후 정상 창고 code가 실제 PostgreSQL 행에 저장되는지 검증한다. */
@SpringBootTest(classes = SlipServiceApplication.class)
class WarehouseCodeSnapshotServiceIT extends AbstractPostgresIT {

    @Autowired private SlipRepository slipRepository;
    @Autowired private WarehouseCodeSnapshotService snapshotService;
    @Autowired private TransactionTemplate transactionTemplate;

    @MockBean private WarehouseInternalClient warehouseInternalClient;

    @Test
    void afterCommit_inventorySuccess_persistsSourceWarehouseCode() {
        UUID warehouseId = UUID.randomUUID();
        AtomicReference<UUID> slipId = new AtomicReference<>();
        when(warehouseInternalClient.findWarehouseCode(warehouseId))
                .thenReturn(Optional.of("WH-R9-NORMAL"));

        transactionTemplate.executeWithoutResult(status -> {
            Slip saved = slipRepository.saveAndFlush(Slip.createOutbound(
                    "2026/08/03-1045-R9",
                    LocalDate.of(2026, 8, 3),
                    1045,
                    warehouseId,
                    null,
                    UUID.randomUUID(),
                    "R9 정상 저장 검증",
                    null,
                    "afterCommit code snapshot",
                    "r9-tester"));
            slipId.set(saved.getId());
            snapshotService.scheduleAfterCommit(saved.getId(), warehouseId);
        });

        Slip reloaded = slipRepository.findById(slipId.get()).orElseThrow();
        assertThat(reloaded.getSourceWarehouseCode()).isEqualTo("WH-R9-NORMAL");
    }

    @Test
    void afterCommit_inventoryCall_blocksPublishingThreadUntilItReturns() throws Exception {
        UUID warehouseId = UUID.randomUUID();
        CountDownLatch inventoryEntered = new CountDownLatch(1);
        CountDownLatch releaseInventory = new CountDownLatch(1);
        when(warehouseInternalClient.findWarehouseCode(warehouseId)).thenAnswer(invocation -> {
            inventoryEntered.countDown();
            assertThat(releaseInventory.await(10, TimeUnit.SECONDS)).isTrue();
            return Optional.empty();
        });

        CompletableFuture<Void> publishing = CompletableFuture.runAsync(() ->
                transactionTemplate.executeWithoutResult(status -> {
                    Slip saved = slipRepository.saveAndFlush(Slip.createOutbound(
                            "2026/08/03-1045-R9-LATENCY",
                            LocalDate.of(2026, 8, 3),
                            1046,
                            warehouseId,
                            null,
                            UUID.randomUUID(),
                            "R9 응답 지연 검증",
                            null,
                            "afterCommit request-thread blocking",
                            "r9-tester"));
                    snapshotService.scheduleAfterCommit(saved.getId(), warehouseId);
                }));

        assertThat(inventoryEntered.await(10, TimeUnit.SECONDS)).isTrue();
        assertThat(publishing).isNotDone();
        releaseInventory.countDown();
        publishing.get(10, TimeUnit.SECONDS);
    }
}
