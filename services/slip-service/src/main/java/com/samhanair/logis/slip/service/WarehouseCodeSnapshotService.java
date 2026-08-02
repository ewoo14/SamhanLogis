package com.samhanair.logis.slip.service;

import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.repository.SlipRepository;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
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

    private final WarehouseInternalClient warehouseInternalClient;
    private final SlipRepository slipRepository;
    private final TransactionTemplate transactionTemplate;

    /** 현재 발행 트랜잭션이 커밋된 뒤에만 inventory 보강을 시작한다. */
    public void scheduleAfterCommit(UUID slipId, UUID warehouseId) {
        if (slipId == null || warehouseId == null) return;
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            snapshot(slipId, warehouseId);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                snapshot(slipId, warehouseId);
            }
        });
    }

    private void snapshot(UUID slipId, UUID warehouseId) {
        try {
            Optional<String> code = Optional.ofNullable(
                    warehouseInternalClient.findWarehouseCode(warehouseId))
                    .orElseGet(Optional::empty);
            if (code.isEmpty()) return;
            transactionTemplate.executeWithoutResult(status ->
                    slipRepository.findById(slipId).ifPresent(slip -> {
                        if (slip.getSourceWarehouseCode() == null) {
                            slip.setSourceWarehouseCode(code.get());
                            slipRepository.save(slip);
                        }
                    }));
        } catch (RuntimeException ex) {
            log.warn("warehouse code snapshot skipped: slipId={} reason={}", slipId, ex.getMessage());
        }
    }
}
