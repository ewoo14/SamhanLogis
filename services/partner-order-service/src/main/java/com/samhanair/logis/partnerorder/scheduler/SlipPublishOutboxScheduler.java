package com.samhanair.logis.partnerorder.scheduler;

import com.samhanair.logis.partnerorder.outbox.OutboxStatus;
import com.samhanair.logis.partnerorder.outbox.SlipPublishOutbox;
import com.samhanair.logis.partnerorder.repository.SlipPublishOutboxRepository;
import java.time.LocalDateTime;
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
 *   <li>PENDING + nextAttemptAt &le; now() pick (attemptCount ASC)</li>
 *   <li>각 row 에 대해 PROCESSING 전이 → slip-service 호출 (동일 idempotencyKey)</li>
 *   <li>200 replay/201 신규 → COMMITTED + PartnerOrder.markSlipPublished + history 기록</li>
 *   <li>4xx(409 충돌 등)/5xx → markRetry (지수 백오프) + max-retry-hours 검사</li>
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
        LocalDateTime now = LocalDateTime.now();
        List<SlipPublishOutbox> candidates = outboxRepository
                .findAllByStatusAndNextAttemptAtLessThanEqualOrderByNextAttemptAtAsc(
                        OutboxStatus.PENDING, now);
        if (candidates.isEmpty()) {
            return;
        }
        log.info("Outbox retry pick: {} rows", Math.min(candidates.size(), BATCH_SIZE));

        int processed = 0;
        for (SlipPublishOutbox row : candidates) {
            if (processed++ >= BATCH_SIZE) {
                break;
            }
            try {
                // 별도 bean 외부 호출로 transaction proxy 를 통과시켜 row 별 독립 tx 를 만든다.
                processor.processOne(row);
            } catch (RuntimeException ex) {
                log.error("Outbox row {} processing failed: {}", row.getId(), ex.getMessage());
            }
        }
    }
}
