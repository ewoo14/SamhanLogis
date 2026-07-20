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
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Outbox 단건 처리기.
 *
 * <p>스케줄러와 별도 bean 으로 분리하여 스케줄러의 batch loop 가 이 bean 의 Spring proxy 를
 * 통과하도록 한다. 따라서 한 row 의 외부 호출과 상태 전이가 독립 transaction 안에서 실행된다.
 */
@Component
@RequiredArgsConstructor
public class SlipPublishOutboxProcessor {

    private static final Logger log = LoggerFactory.getLogger(SlipPublishOutboxProcessor.class);

    private final SlipPublishOutboxRepository outboxRepository;
    private final PartnerOrderRepository orderRepository;
    private final PartnerOrderHistoryRepository historyRepository;
    private final SlipServiceClient slipServiceClient;
    private final OutboxProperties outboxProperties;
    private final ObjectMapper objectMapper;

    /**
     * 한 outbox row 를 처리한다.
     *
     * <p>비관적 쓰기 락으로 최신 row 를 다시 읽은 뒤 상태를 재검사한다. 이미 다른 worker 가
     * 종결한 row 는 외부 발행을 호출하지 않고 반환한다.
     *
     * @param row 스케줄러가 pick 한 후보 row
     */
    @Transactional
    public void processOne(SlipPublishOutbox row) {
        SlipPublishOutbox locked = outboxRepository.findWithLockById(row.getId()).orElse(null);
        if (locked == null || locked.getStatus() != OutboxStatus.PENDING) {
            return;
        }
        locked.markProcessing();

        Map<String, Object> payload = parsePayload(locked.getRequestPayload());

        try {
            PublishResult result = slipServiceClient.publishFromPartnerOrder(
                    payload, locked.getIdempotencyKey());
            locked.markCommitted();
            // 종결 상태는 명시 save 로 outbox 영속 계약을 드러낸다.
            outboxRepository.save(locked);

            // PartnerOrder 갱신 + history
            orderRepository.findById(locked.getPartnerOrderId()).ifPresent(order -> {
                order.markSlipPublished(result.slipNo());
                orderRepository.save(order);
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
            // 실패 종결도 명시 save 하여 max-retry 상태의 유실을 막는다.
            outboxRepository.save(row);
            orderRepository.findById(row.getPartnerOrderId()).ifPresent(order -> {
                order.markSlipFailedPermanent();
                orderRepository.save(order);
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
        // 재시도 상태도 명시 save 하여 attemptCount/nextAttemptAt 을 보존한다.
        outboxRepository.save(row);
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
