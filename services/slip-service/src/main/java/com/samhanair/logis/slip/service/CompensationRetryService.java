package com.samhanair.logis.slip.service;

import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.domain.SerialCompensationFailure;
import com.samhanair.logis.slip.repository.SerialCompensationFailureRepository;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 미해소 보상 실패를 자동 재시도해 정합한다. (D-SER-27, ⑦ outbox/Saga)
 *
 * <p>재시도 가능한 시리얼 보상 동작(RELEASE_INSTANCES / UNRECALL_INSTANCES)은 감사 행에 저장된
 * {@code slipNo + productCode} 만으로 inventory 호출을 재실행할 수 있다. 수량형(RELEASE/RESERVE)은
 * productId/warehouseId/quantity 가 감사 행에 없어 자동 재시도 대상에서 제외하고 수동 정합으로 남긴다.
 *
 * <p>개별 재시도 실패가 배치 전체를 중단시키지 않도록 best-effort 로 처리하며, 실패 시 지수 백오프로
 * 다음 재시도 시각을 미룬다. inventory unrecall/release 는 멱등(#349 advisory+row lock)이라 중복 재호출이 안전하다.
 */
@Slf4j
@Service
public class CompensationRetryService {

    private final SerialCompensationFailureRepository repository;
    private final InventoryClient inventoryClient;
    private final Clock clock;

    public CompensationRetryService(SerialCompensationFailureRepository repository,
                                    InventoryClient inventoryClient,
                                    Clock clock) {
        this.repository = repository;
        this.inventoryClient = inventoryClient;
        this.clock = clock;
    }

    /**
     * 재시도 후보(미해소·한도 미만·백오프 경과)를 조회해 동작별로 inventory 보상을 재실행한다.
     *
     * @param maxRetries 재시도 상한
     * @param backoffBaseMinutes 지수 백오프 기준 분(다음 시각 = now + base * 2^retryCount)
     * @return 재시도 결과 요약(시도/성공/실패/스킵 건수)
     */
    @Transactional
    public RetryResult retryEligible(int maxRetries, long backoffBaseMinutes) {
        LocalDateTime now = LocalDateTime.now(clock);
        List<SerialCompensationFailure> candidates = repository.findRetryCandidates(maxRetries, now);
        int attempted = 0;
        int succeeded = 0;
        int failed = 0;
        int skipped = 0;

        for (SerialCompensationFailure failure : candidates) {
            switch (failure.getAttemptedOperation()) {
                case RELEASE_INSTANCES, UNRECALL_INSTANCES -> {
                    attempted++;
                    if (retryOne(failure, now, backoffBaseMinutes)) {
                        succeeded++;
                    } else {
                        failed++;
                    }
                }
                default -> {
                    // 수량형(RELEASE/RESERVE) 등은 재시도에 필요한 식별자가 감사 행에 없어 자동 재시도 불가.
                    skipped++;
                    log.warn("[CompensationRetry] 자동 재시도 미지원 동작 — slipNo={} op={} (수동 정합 대상 유지)",
                            failure.getSlipNo(), failure.getAttemptedOperation());
                }
            }
        }

        log.info("[CompensationRetry] 재시도 완료 — 후보={} 시도={} 성공={} 실패={} 스킵={}",
                candidates.size(), attempted, succeeded, failed, skipped);
        return new RetryResult(candidates.size(), attempted, succeeded, failed, skipped);
    }

    /**
     * 보상 1건을 동작별로 재실행한다. 성공 시 해소, 실패 시 백오프 갱신(best-effort).
     *
     * @return 성공 여부
     */
    private boolean retryOne(SerialCompensationFailure failure, LocalDateTime now, long backoffBaseMinutes) {
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
            return true;
        } catch (Exception ex) {
            LocalDateTime nextRetryAt = now.plusMinutes(backoffBaseMinutes * (1L << failure.getRetryCount()));
            failure.recordRetryFailure(now, nextRetryAt);
            log.warn("[CompensationRetry] 보상 재시도 실패 — slipNo={} op={} retryCount={} nextRetryAt={} cause={}",
                    failure.getSlipNo(), failure.getAttemptedOperation(), failure.getRetryCount(),
                    nextRetryAt, ex.getMessage());
            return false;
        }
    }

    /**
     * 재시도 배치 결과 요약.
     *
     * @param candidates 후보 건수
     * @param attempted 재시도 시도 건수(지원 동작)
     * @param succeeded 성공·해소 건수
     * @param failed 실패(백오프 갱신) 건수
     * @param skipped 미지원 동작 스킵 건수
     */
    public record RetryResult(int candidates, int attempted, int succeeded, int failed, int skipped) {
    }
}
