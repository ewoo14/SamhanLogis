package com.samhanair.logis.partnerorder.scheduler;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.partnerorder.client.SlipServiceClient;
import com.samhanair.logis.partnerorder.client.SlipServiceClient.PublishResult;
import com.samhanair.logis.partnerorder.config.OutboxProperties;
import com.samhanair.logis.partnerorder.domain.HistoryEventType;
import com.samhanair.logis.partnerorder.domain.PartnerOrderHistory;
import com.samhanair.logis.partnerorder.outbox.OutboxStatus;
import com.samhanair.logis.partnerorder.outbox.SlipPublishOutbox;
import com.samhanair.logis.partnerorder.repository.PartnerOrderHistoryRepository;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.repository.SlipPublishOutboxRepository;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Outbox 재시도 스케줄러 — 5분 cron ({@code samhan.outbox.cron}).
 *
 * <p>처리 흐름:
 * <ol>
 *   <li>PENDING + nextAttemptAt &le; now() pick (attemptCount ASC)</li>
 *   <li>각 row 에 대해 PROCESSING 전이 → slip-service 호출 (동일 idempotencyKey)</li>
 *   <li>200/409 → COMMITTED + PartnerOrder.markSlipPublished + history 기록</li>
 *   <li>5xx → markRetry (지수 백오프) + max-retry-hours 검사</li>
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
    private final PartnerOrderRepository orderRepository;
    private final PartnerOrderHistoryRepository historyRepository;
    private final SlipServiceClient slipServiceClient;
    private final OutboxProperties outboxProperties;
    private final ObjectMapper objectMapper;

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
                processOne(row);
            } catch (RuntimeException ex) {
                log.error("Outbox row {} processing failed: {}", row.getId(), ex.getMessage());
            }
        }
    }

    /**
     * 단건 처리 — 트랜잭션 분리 (개별 row 실패가 batch 전체를 막지 않도록).
     */
    @Transactional
    public void processOne(SlipPublishOutbox row) {
        SlipPublishOutbox locked = outboxRepository.findById(row.getId()).orElse(null);
        if (locked == null || locked.getStatus() != OutboxStatus.PENDING) {
            return;
        }
        locked.markProcessing();

        Map<String, Object> payload = parsePayload(locked.getRequestPayload());

        try {
            PublishResult result = slipServiceClient.publishFromPartnerOrder(
                    payload, locked.getIdempotencyKey());
            locked.markCommitted();

            // PartnerOrder 갱신 + history
            orderRepository.findById(locked.getPartnerOrderId()).ifPresent(order -> {
                order.markSlipPublished(result.slipNo());
                historyRepository.save(PartnerOrderHistory.ofOrder(
                        order.getId(), order.getPartnerCode(), HistoryEventType.SLIP_PUBLISHED,
                        "system",
                        "{\"slipNo\":\"" + result.slipNo()
                                + "\",\"viaOutbox\":true,\"attempts\":" + locked.getAttemptCount() + "}"));
            });
            log.info("Outbox COMMITTED: orderId={}, slipNo={}, attempts={}",
                    locked.getPartnerOrderId(), result.slipNo(), locked.getAttemptCount());
        } catch (BusinessException ex) {
            handleRetry(locked, ex.getMessage());
        } catch (RuntimeException ex) {
            handleRetry(locked, ex.getMessage());
        }
    }

    private void handleRetry(SlipPublishOutbox row, String error) {
        Duration elapsed = Duration.between(row.getFirstAttemptedAt(), LocalDateTime.now());
        if (elapsed.toHours() >= outboxProperties.getMaxRetryHours()) {
            row.markFailed(error);
            orderRepository.findById(row.getPartnerOrderId()).ifPresent(order -> {
                order.markSlipFailedPermanent();
                historyRepository.save(PartnerOrderHistory.ofOrder(
                        order.getId(), order.getPartnerCode(), HistoryEventType.SLIP_RETRY_QUEUED,
                        "system",
                        "{\"event\":\"FAILED_PERMANENT\",\"attempts\":"
                                + row.getAttemptCount() + ",\"error\":\""
                                + safeJson(error) + "\"}"));
            });
            log.error("Outbox FAILED_PERMANENT: orderId={}, attempts={}, error={}",
                    row.getPartnerOrderId(), row.getAttemptCount(), error);
            return;
        }
        // 지수 백오프 (5min × 2^attempt, max 60min)
        long delayMin = Math.min(60L, 5L * (1L << Math.min(row.getAttemptCount(), 4)));
        row.markRetry(error, LocalDateTime.now().plusMinutes(delayMin));
    }

    private Map<String, Object> parsePayload(String json) {
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {});
        } catch (JsonProcessingException ex) {
            throw new RuntimeException("outbox payload 파싱 실패: " + ex.getMessage(), ex);
        }
    }

    private String safeJson(String raw) {
        if (raw == null) {
            return "";
        }
        return raw.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
