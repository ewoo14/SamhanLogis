package com.samhanair.logis.slip.service;

import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.domain.SerialCompensationFailure;
import com.samhanair.logis.slip.repository.SerialCompensationFailureRepository;
import java.time.LocalDateTime;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 보상 재시도 1건을 독립 트랜잭션({@code REQUIRES_NEW})으로 실행한다. (D-SER-27)
 *
 * <p>배치 전체를 하나의 트랜잭션으로 묶으면 inventory HTTP 왕복 × 후보 수만큼 DB 커넥션을 점유하고,
 * 한 건의 flush 예외가 이미 처리한 다른 건까지 롤백시켜 정합이 깨진다. 따라서 건별로 짧은 독립
 * 트랜잭션을 열어 (1) 커넥션을 건 사이에 반납하고 (2) 한 건의 실패/롤백이 다른 건에 전파되지 않게 한다.
 * (선례: {@code CompensationAuditWriter} 의 REQUIRES_NEW.)
 *
 * <p>행 락(PESSIMISTIC_WRITE)으로 동일 행의 동시 재시도(다중 인스턴스/중복 발화)를 직렬화해
 * retry_count 이중 증가를 방지한다. inventory unrecall/release 자체도 멱등(#349)이라 안전망이 이중이다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class CompensationRetryExecutor {

    /** {@code 1L << shift} 오버플로(음수 백오프 → 과거 시각 → 무한 재시도) 방지 상한. */
    private static final int MAX_BACKOFF_SHIFT = 30;

    private final SerialCompensationFailureRepository repository;
    private final InventoryClient inventoryClient;

    /** 재시도 1건의 처리 결과. */
    public enum Outcome { SUCCEEDED, FAILED, SKIPPED, GONE }

    /**
     * 보상 1건을 동작별로 재실행한다(독립 트랜잭션 + 행 락).
     *
     * @param id 감사 행 id
     * @param now 현재 시각
     * @param backoffBaseMinutes 지수 백오프 기준 분
     * @return 처리 결과
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Outcome retryOne(java.util.UUID id, LocalDateTime now, long backoffBaseMinutes) {
        Optional<SerialCompensationFailure> found = repository.findByIdForUpdate(id);
        if (found.isEmpty()) {
            return Outcome.GONE;
        }
        SerialCompensationFailure failure = found.get();
        // 락 획득 사이에 다른 인스턴스가 이미 해소했을 수 있어 재확인(이중 처리 방지).
        if (failure.isResolved()) {
            return Outcome.GONE;
        }

        switch (failure.getAttemptedOperation()) {
            case RELEASE_INSTANCES, UNRECALL_INSTANCES -> {
                return dispatch(failure, now, backoffBaseMinutes);
            }
            default -> {
                // 수량형(RELEASE/RESERVE)은 재시도에 필요한 식별자가 감사 행에 없어 자동 재시도 불가.
                log.warn("[CompensationRetry] 자동 재시도 미지원 동작 — slipNo={} op={} (수동 정합 대상 유지)",
                        failure.getSlipNo(), failure.getAttemptedOperation());
                return Outcome.SKIPPED;
            }
        }
    }

    private Outcome dispatch(SerialCompensationFailure failure, LocalDateTime now, long backoffBaseMinutes) {
        try {
            switch (failure.getAttemptedOperation()) {
                case RELEASE_INSTANCES ->
                        inventoryClient.releaseInstances(failure.getSlipNo(), failure.getProductCode());
                case UNRECALL_INSTANCES ->
                        inventoryClient.unrecallInstances(failure.getSlipNo(), failure.getProductCode());
                default -> throw new IllegalStateException("재시도 미지원 동작: " + failure.getAttemptedOperation());
            }
            failure.recordRetrySuccess(now);
            log.info("[CompensationRetry] 보상 재시도 성공·해소 — slipNo={} op={} product={} retryCount={}",
                    failure.getSlipNo(), failure.getAttemptedOperation(), failure.getProductCode(),
                    failure.getRetryCount());
            return Outcome.SUCCEEDED;
        } catch (Exception ex) {
            // 백오프 지수는 갱신 전 retryCount 를 사용(0회차 실패 → base*2^0). shift 상한으로 오버플로 차단.
            int shift = Math.min(failure.getRetryCount(), MAX_BACKOFF_SHIFT);
            LocalDateTime nextRetryAt = now.plusMinutes(backoffBaseMinutes * (1L << shift));
            failure.recordRetryFailure(now, nextRetryAt);
            log.warn("[CompensationRetry] 보상 재시도 실패 — slipNo={} op={} retryCount={} nextRetryAt={} cause={}",
                    failure.getSlipNo(), failure.getAttemptedOperation(), failure.getRetryCount(),
                    nextRetryAt, ex.getMessage());
            return Outcome.FAILED;
        }
    }
}
