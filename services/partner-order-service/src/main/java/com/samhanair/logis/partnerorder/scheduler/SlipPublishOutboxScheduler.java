package com.samhanair.logis.partnerorder.scheduler;

import com.samhanair.logis.partnerorder.outbox.SlipPublishOutbox;
import com.samhanair.logis.partnerorder.repository.SlipPublishOutboxRepository;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Outbox 재시도 스케줄러 — 5분 cron ({@code samhan.outbox.cron}).
 *
 * <p>처리 흐름:
 * <ol>
 *   <li>짧은 native claim tx에서 PENDING 또는 lease 만료 PROCESSING row를 SKIP LOCKED로 claim</li>
 *   <li>claim된 각 row에 대해 DB 락/tx 밖에서 slip-service 호출 (동일 idempotencyKey)</li>
 *   <li>200 replay/201 신규 → COMMITTED + PartnerOrder.markSlipPublished + history 기록</li>
 *   <li>INVALID_INPUT/CONFLICT → 즉시 FAILED, 그 외 오류 → markRetry (지수 백오프)</li>
 *   <li>max-retry-hours 초과 → markFailed + PartnerOrder.markSlipFailedPermanent + alert log</li>
 * </ol>
 *
 * <p>설계서 §6 — at-least-once 보장. slip-service 의 Idempotency-Key 차단으로 중복 발행 안전.
 */
@Component
@RequiredArgsConstructor
public class SlipPublishOutboxScheduler {

    private static final Logger log = LoggerFactory.getLogger(SlipPublishOutboxScheduler.class);
    private static final int BATCH_SIZE = 50;

    private final SlipPublishOutboxRepository outboxRepository;
    private final SlipPublishOutboxProcessor processor;

    /**
     * 본 스케줄러는 yml 의 {@code samhan.outbox.cron} (기본 5분) 으로 실행.
     */
    @Scheduled(cron = "${samhan.outbox.cron:0 */5 * * * *}")
    public void retryPending() {
        List<SlipPublishOutbox> candidates = outboxRepository.claimReadyBatch(
                BATCH_SIZE, processor.getLeaseSeconds());
        if (candidates.isEmpty()) {
            return;
        }
        log.info("Outbox claim: {} rows", candidates.size());

        for (SlipPublishOutbox row : candidates) {
            try {
                // processor에는 DB tx가 없고, 결과 writer만 row별 짧은 tx를 연다.
                processor.processOne(row);
            } catch (RuntimeException ex) {
                log.error("Outbox row {} processing failed: {}", row.getId(), ex.getMessage());
            }
        }
    }
}
