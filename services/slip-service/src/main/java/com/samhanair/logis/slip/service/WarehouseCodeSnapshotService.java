package com.samhanair.logis.slip.service;

import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient.WarehouseNotFoundException;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.repository.SlipRepository;
import jakarta.annotation.PostConstruct;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.task.TaskExecutor;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 전표 발행 후 창고 업무 code를 보강한다.
 *
 * <p>창고 code는 가배차 보조 projection이므로 핵심 전표 저장 트랜잭션과 분리한다.
 * inventory 조회 실패는 code를 채우지 않고 UNKNOWN으로 남기며 전표 발행에는 영향을 주지 않는다.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class WarehouseCodeSnapshotService {

    private static final int CANDIDATE_LIMIT = 100;
    /** inventory client read timeout(3s)보다 충분히 길어 stale worker만 회수한다. */
    private static final long CLAIM_LEASE_SECONDS = 30L;
    private static final long MAX_BACKOFF_MILLIS = 60L * 60L * 1000L;

    private final WarehouseInternalClient warehouseInternalClient;
    private final SlipRepository slipRepository;
    private final TransactionTemplate transactionTemplate;
    @Qualifier("applicationTaskExecutor")
    private final TaskExecutor taskExecutor;

    /** 일시 장애 backoff 기본값. IT는 0으로 주입해 시간에 의존하지 않는다. */
    @Value("${samhan.warehouse-code.snapshot.retry-backoff-ms:30000}")
    private long retryBackoffBaseMillis = 30_000L;

    @PostConstruct
    void configureIndependentTransaction() {
        transactionTemplate.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    /** 현재 발행 트랜잭션이 커밋된 뒤에만 inventory 보강을 시작한다. */
    public void scheduleAfterCommit(UUID slipId, UUID warehouseId) {
        if (slipId == null || warehouseId == null) return;
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            taskExecutor.execute(() -> snapshot(slipId, warehouseId));
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                taskExecutor.execute(() -> snapshot(slipId, warehouseId));
            }
        });
    }

    /** pending으로 표시된 신규 전표와 lease 만료 PROCESSING 전표를 주기적으로 재시도한다. */
    @Scheduled(fixedDelayString = "${samhan.warehouse-code.snapshot.retry-delay-ms:30000}")
    public void retryPendingSnapshots() {
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime leaseCutoff = now.minusSeconds(CLAIM_LEASE_SECONDS);
        slipRepository.findWarehouseCodeSnapshotCandidates(
                        now, leaseCutoff, PageRequest.of(0, CANDIDATE_LIMIT))
                .forEach(slip -> snapshot(slip.getId(), slip.getSourceWarehouseId()));
    }

    private void snapshot(UUID slipId, UUID warehouseId) {
        UUID claimToken = UUID.randomUUID();
        try {
            LocalDateTime now = LocalDateTime.now();
            int claimed = slipRepository.claimWarehouseCodeSnapshot(
                    slipId, claimToken, now, now.minusSeconds(CLAIM_LEASE_SECONDS));
            if (claimed != 1) return;

            Optional<String> code = Optional.ofNullable(
                    warehouseInternalClient.findWarehouseCode(warehouseId))
                    .orElseGet(Optional::empty);
            if (code.isEmpty()) {
                abandonSnapshot(claimToken, slipId, "inventory 응답에 warehouse code가 없습니다");
                return;
            }
            transactionTemplate.executeWithoutResult(status ->
                    slipRepository.completeWarehouseCodeSnapshot(slipId, claimToken, code.get()));
        } catch (WarehouseNotFoundException ex) {
            abandonSnapshot(claimToken, slipId, ex.getMessage());
        } catch (RuntimeException ex) {
            if (isPermanentFailure(ex)) {
                abandonSnapshot(claimToken, slipId, ex.getMessage());
            } else {
                retrySnapshot(claimToken, slipId, ex);
            }
            log.warn("warehouse code snapshot skipped: slipId={} reason={}", slipId, ex.getMessage());
        }
    }

    /** 레거시 client mock/adapter가 보존하는 404 메시지도 영구 부재로 분류한다. */
    private boolean isPermanentFailure(RuntimeException failure) {
        return failure.getMessage() != null && failure.getMessage().contains("HTTP 404");
    }

    private void retrySnapshot(UUID claimToken, UUID slipId, RuntimeException failure) {
        transactionTemplate.executeWithoutResult(status ->
                slipRepository.findById(slipId).ifPresent(slip -> {
                    if (!slip.ownsSourceWarehouseCodeClaim(claimToken)) return;
                    long delay = calculateBackoffMillis(slip.getSourceWarehouseCodeAttemptCount());
                    slipRepository.retryWarehouseCodeSnapshot(
                            slipId,
                            claimToken,
                            LocalDateTime.now().plusNanos(delay * 1_000_000L),
                            normalizeError(failure.getMessage()));
                }));
    }

    private void abandonSnapshot(UUID claimToken, UUID slipId, String reason) {
        transactionTemplate.executeWithoutResult(status ->
                slipRepository.abandonWarehouseCodeSnapshot(
                        slipId, claimToken, LocalDateTime.now(), normalizeError(reason)));
        log.error("warehouse code snapshot abandoned: slipId={} reason={}", slipId, reason);
    }

    private String normalizeError(String error) {
        if (error == null || error.isBlank()) return "알 수 없는 inventory snapshot 오류";
        return error.length() <= 2000 ? error : error.substring(0, 2000);
    }

    private long calculateBackoffMillis(int attemptCount) {
        if (retryBackoffBaseMillis <= 0) return 0L;
        int exponent = Math.min(Math.max(attemptCount - 1, 0), 10);
        long multiplier = 1L << exponent;
        return Math.min(MAX_BACKOFF_MILLIS, retryBackoffBaseMillis * multiplier);
    }
}
