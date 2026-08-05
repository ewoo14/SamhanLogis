package com.samhanair.logis.slip.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.service.WarehouseCodeSnapshotService;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionTemplate;

/** 발행 commit 이후 정상 창고 code가 실제 PostgreSQL 행에 저장되는지 검증한다. */
@SpringBootTest(
        classes = SlipServiceApplication.class,
        properties = "samhan.warehouse-code.snapshot.retry-backoff-ms=0")
class WarehouseCodeSnapshotServiceIT extends AbstractPostgresIT {

    @Autowired private SlipRepository slipRepository;
    @Autowired private WarehouseCodeSnapshotService snapshotService;
    @Autowired private TransactionTemplate transactionTemplate;

    @MockBean private WarehouseInternalClient warehouseInternalClient;

    @BeforeEach
    void softDeletePendingFixturesFromPreviousCase() {
        List<Slip> pending = slipRepository.findAll().stream()
                .filter(slip -> Boolean.TRUE.equals(
                        ReflectionTestUtils.getField(slip, "sourceWarehouseCodePending")))
                .toList();
        pending.forEach(slip -> slip.markDeleted("r12-test-cleanup"));
        slipRepository.saveAll(pending);
    }

    @Test
    void afterCommit_inventorySuccess_persistsSourceWarehouseCode() {
        UUID warehouseId = UUID.randomUUID();
        AtomicReference<UUID> slipId = new AtomicReference<>();
        when(warehouseInternalClient.findWarehouseCode(warehouseId))
                .thenReturn(Optional.of("WH-R9-NORMAL"));

        transactionTemplate.executeWithoutResult(status -> {
            Slip pendingSlip = Slip.createOutbound(
                    "2026/08/03-1045-R9",
                    LocalDate.of(2026, 8, 3),
                    1045,
                    warehouseId,
                    null,
                    UUID.randomUUID(),
                    "R9 정상 저장 검증",
                    null,
                    "afterCommit code snapshot",
                    "r9-tester");
            pendingSlip.markSourceWarehouseCodePending();
            Slip saved = slipRepository.saveAndFlush(pendingSlip);
            slipId.set(saved.getId());
            snapshotService.scheduleAfterCommit(saved.getId(), warehouseId);
        });

        Slip reloaded = awaitSlip(slipId.get());
        assertThat(reloaded.getSourceWarehouseCode()).isEqualTo("WH-R9-NORMAL");
    }

    @Test
    void afterCommit_inventoryCall_doesNotBlockPublishingThread() throws Exception {
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
                    Slip pendingSlip = Slip.createOutbound(
                            "2026/08/03-1045-R9-LATENCY",
                            LocalDate.of(2026, 8, 3),
                            1046,
                            warehouseId,
                            null,
                            UUID.randomUUID(),
                            "R9 응답 지연 검증",
                            null,
                            "afterCommit request-thread blocking",
                            "r9-tester");
                    pendingSlip.markSourceWarehouseCodePending();
                    Slip saved = slipRepository.saveAndFlush(pendingSlip);
                    snapshotService.scheduleAfterCommit(saved.getId(), warehouseId);
                }));

        assertThat(inventoryEntered.await(10, TimeUnit.SECONDS)).isTrue();
        assertThat(publishing).isDone();
        releaseInventory.countDown();
        publishing.get(10, TimeUnit.SECONDS);
    }

    private Slip awaitSlip(UUID slipId) {
        for (int attempt = 0; attempt < 100; attempt++) {
            Slip slip = slipRepository.findById(slipId).orElseThrow();
            if ("WH-R9-NORMAL".equals(slip.getSourceWarehouseCode())) return slip;
            try {
                Thread.sleep(50L);
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
                throw new AssertionError("code 보강 대기 중 interrupt", ex);
            }
        }
        return slipRepository.findById(slipId).orElseThrow();
    }

    @Test
    void retryPending_inventoryRecovery_persistsSourceWarehouseCode() {
        UUID warehouseId = UUID.randomUUID();
        Slip saved = transactionTemplate.execute(status -> {
            Slip slip = Slip.createOutbound(
                    "2026/08/03-1045-R10-RETRY",
                    LocalDate.of(2026, 8, 3),
                    1047,
                    warehouseId,
                    null,
                    UUID.randomUUID(),
                    "R10 복구 재시도 검증",
                    null,
                    "pending retry",
                    "r10-tester");
            slip.markSourceWarehouseCodePending();
            return slipRepository.saveAndFlush(slip);
        });

        when(warehouseInternalClient.findWarehouseCode(warehouseId))
                .thenThrow(new IllegalStateException("inventory timeout"))
                .thenReturn(Optional.of("WH-R10-RECOVERED"));

        snapshotService.retryPendingSnapshots();
        assertThat(slipRepository.findById(saved.getId()).orElseThrow().getSourceWarehouseCode())
                .isNull();

        snapshotService.retryPendingSnapshots();
        assertThat(slipRepository.findById(saved.getId()).orElseThrow().getSourceWarehouseCode())
                .isEqualTo("WH-R10-RECOVERED");
    }

    @Test
    void retryPending_permanentNoCodeRows_doNotStarveLaterHealthyRow() throws Exception {
        List<UUID> permanentWarehouseIds = new java.util.ArrayList<>();
        for (int i = 0; i < 101; i++) {
            UUID warehouseId = UUID.randomUUID();
            permanentWarehouseIds.add(warehouseId);
            savePendingSlip("2026/08/03-1045-R12-P-%03d".formatted(i), 2000 + i, warehouseId);
            Thread.sleep(2L);
        }
        UUID healthyWarehouseId = UUID.randomUUID();
        Slip healthy = savePendingSlip("2026/08/03-1045-R12-HEALTHY", 2201, healthyWarehouseId);

        when(warehouseInternalClient.findWarehouseCode(org.mockito.ArgumentMatchers.any()))
                .thenAnswer(invocation -> permanentWarehouseIds.contains(invocation.getArgument(0))
                        ? Optional.empty()
                        : Optional.of("WH-R12-HEALTHY"));

        snapshotService.retryPendingSnapshots();
        snapshotService.retryPendingSnapshots();

        Slip reloaded = slipRepository.findById(healthy.getId()).orElseThrow();
        assertThat(reloaded.getSourceWarehouseCode()).isEqualTo("WH-R12-HEALTHY");
        Slip abandoned = slipRepository.findAll().stream()
                .filter(slip -> permanentWarehouseIds.contains(slip.getSourceWarehouseId()))
                .findFirst()
                .orElseThrow();
        assertThat(String.valueOf(ReflectionTestUtils.getField(abandoned, "sourceWarehouseCodeSnapshotStatus")))
                .isEqualTo("ABANDONED");
    }

    @Test
    void retryPending_transientInventoryFailure_remainsRetryable_notAbandoned() {
        UUID warehouseId = UUID.randomUUID();
        Slip saved = savePendingSlip("2026/08/03-1045-R12-TRANSIENT", 2301, warehouseId);
        when(warehouseInternalClient.findWarehouseCode(warehouseId))
                .thenThrow(new IllegalStateException("inventory restart"));

        snapshotService.retryPendingSnapshots();

        Slip reloaded = slipRepository.findById(saved.getId()).orElseThrow();
        assertThat(String.valueOf(ReflectionTestUtils.getField(reloaded, "sourceWarehouseCodeSnapshotStatus")))
                .isEqualTo("PENDING");
        assertThat(ReflectionTestUtils.getField(reloaded, "sourceWarehouseCodeAttemptCount"))
                .isEqualTo(1);
    }

    @Test
    void retryPending_notFoundWarehouse_isObservableAsAbandoned() {
        UUID warehouseId = UUID.randomUUID();
        Slip saved = savePendingSlip("2026/08/03-1045-R12-NOT-FOUND", 2351, warehouseId);
        when(warehouseInternalClient.findWarehouseCode(warehouseId))
                .thenThrow(new WarehouseInternalClient.WarehouseNotFoundException(
                        "창고 조회 실패: HTTP 404", null));

        snapshotService.retryPendingSnapshots();

        Slip reloaded = slipRepository.findById(saved.getId()).orElseThrow();
        assertThat(String.valueOf(ReflectionTestUtils.getField(
                reloaded, "sourceWarehouseCodeSnapshotStatus")))
                .isEqualTo("ABANDONED");
        assertThat(String.valueOf(ReflectionTestUtils.getField(
                reloaded, "sourceWarehouseCodeLastError")))
                .contains("404");
    }

    @Test
    void executorAndScheduler_sameSlip_claimPreventsDuplicateInventoryCall() throws Exception {
        UUID warehouseId = UUID.randomUUID();
        AtomicInteger callCount = new AtomicInteger();
        CountDownLatch executorEntered = new CountDownLatch(1);
        CountDownLatch releaseExecutor = new CountDownLatch(1);
        when(warehouseInternalClient.findWarehouseCode(warehouseId)).thenAnswer(invocation -> {
            int call = callCount.incrementAndGet();
            if (call == 1) {
                executorEntered.countDown();
                assertThat(releaseExecutor.await(10, TimeUnit.SECONDS)).isTrue();
            }
            return Optional.of("WH-R12-CLAIMED");
        });

        Slip saved = savePendingSlip("2026/08/03-1045-R12-CLAIM", 2401, warehouseId);
        snapshotService.scheduleAfterCommit(saved.getId(), warehouseId);

        assertThat(executorEntered.await(10, TimeUnit.SECONDS)).isTrue();
        try {
            snapshotService.retryPendingSnapshots();
            assertThat(callCount).as("executor가 claim한 전표를 scheduler가 중복 호출하지 않아야 한다")
                    .hasValue(1);
        } finally {
            releaseExecutor.countDown();
        }
        awaitSlip(saved.getId(), "WH-R12-CLAIMED");
    }

    @Test
    void retryPending_staleProcessingClaim_isReclaimedAfterWorkerDeath() {
        UUID warehouseId = UUID.randomUUID();
        Slip saved = savePendingSlip("2026/08/03-1045-R12-RECLAIM", 2451, warehouseId);
        LocalDateTime crashedAt = LocalDateTime.now().minusSeconds(60);
        // backoff가 이미 만료된 PENDING row를 worker가 집은 상황을 API 상태로 재현한다.
        ReflectionTestUtils.setField(saved, "sourceWarehouseCodeNextAttemptAt", crashedAt);
        transactionTemplate.executeWithoutResult(status -> slipRepository.saveAndFlush(saved));
        assertThat(slipRepository.claimWarehouseCodeSnapshot(
                saved.getId(), UUID.randomUUID(), crashedAt, crashedAt.minusSeconds(30)))
                .isEqualTo(1);
        when(warehouseInternalClient.findWarehouseCode(warehouseId))
                .thenReturn(Optional.of("WH-R12-RECLAIMED"));

        snapshotService.retryPendingSnapshots();

        assertThat(slipRepository.findById(saved.getId()).orElseThrow().getSourceWarehouseCode())
                .isEqualTo("WH-R12-RECLAIMED");
    }

    private void awaitSlip(UUID slipId, String expectedCode) {
        for (int attempt = 0; attempt < 100; attempt++) {
            Slip slip = slipRepository.findById(slipId).orElseThrow();
            if (expectedCode.equals(slip.getSourceWarehouseCode())) return;
            try {
                Thread.sleep(50L);
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
                throw new AssertionError("code 보강 대기 중 interrupt", ex);
            }
        }
        assertThat(slipRepository.findById(slipId).orElseThrow().getSourceWarehouseCode())
                .isEqualTo(expectedCode);
    }

    private Slip savePendingSlip(String slipNo, int seqNo, UUID warehouseId) {
        return transactionTemplate.execute(status -> {
            Slip slip = Slip.createOutbound(
                    slipNo,
                    LocalDate.of(2026, 8, 3),
                    seqNo,
                    warehouseId,
                    null,
                    UUID.randomUUID(),
                    "R12 경로 fixture",
                    null,
                    "R12 snapshot fixture",
                    "r12-tester");
            slip.markSourceWarehouseCodePending();
            return slipRepository.saveAndFlush(slip);
        });
    }
}
