package com.samhanair.logis.partnerorder.scheduler;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.ErrorCode;
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
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Outbox HTTP 결과를 짧은 독립 트랜잭션으로 영속화한다.
 *
 * <p>각 메서드는 현재 row를 비관적 쓰기 락({@code SELECT ... FOR UPDATE})으로 잠근 뒤 PROCESSING일
 * 때만 상태를 변경한다. lease 만료로 동일 row 를 두 worker 가 겹쳐 처리해도 per-row 직렬화로 먼저
 * 락을 획득한 전이만 적용되고, 뒤늦은 전이는 non-PROCESSING 을 보고 skip 되어 COMMITTED 가 PENDING
 * 으로 덮이는 clobber 가 발생하지 않는다. 락은 결과 tx 종료까지만 유지되고 HTTP 발행은 tx 밖
 * (processor)에서 수행하므로 락을 물지 않는다.
 */
@Component
@RequiredArgsConstructor
public class SlipPublishOutboxResultWriter {

    private static final Logger log = LoggerFactory.getLogger(SlipPublishOutboxResultWriter.class);

    private final SlipPublishOutboxRepository outboxRepository;
    private final PartnerOrderRepository orderRepository;
    private final PartnerOrderHistoryRepository historyRepository;
    private final OutboxProperties outboxProperties;
    private final ObjectMapper objectMapper;

    /** 성공 결과를 PROCESSING row에만 반영한다. */
    @Transactional
    public void commitSuccess(UUID outboxId, PublishResult result) {
        SlipPublishOutbox row = processingRow(outboxId);
        if (row == null) {
            return;
        }
        row.markCommitted();
        outboxRepository.save(row);

        orderRepository.findById(row.getPartnerOrderId()).ifPresent(order -> {
            order.markSlipPublished(result.slipNo());
            orderRepository.save(order);
            historyRepository.save(PartnerOrderHistory.ofOrder(
                    order.getId(), order.getPartnerCode(), HistoryEventType.SLIP_PUBLISHED,
                    "system",
                    writeDetailJson(Map.of(
                            "slipNo", result.slipNo(),
                            "viaOutbox", true,
                            "attempts", row.getAttemptCount()))));
        });
        log.info("Outbox COMMITTED: orderId={}, slipNo={}, attempts={}",
                row.getPartnerOrderId(), result.slipNo(), row.getAttemptCount());
    }

    /**
     * 외부 발행/파싱 실패를 현재 PROCESSING row에만 반영한다.
     * INVALID_INPUT·CONFLICT는 max-retry와 무관하게 즉시 terminal 처리한다.
     */
    @Transactional
    public void handleRetry(UUID outboxId, ErrorCode errorCode, String error) {
        SlipPublishOutbox row = processingRow(outboxId);
        if (row == null) {
            return;
        }
        boolean permanentError = errorCode == ErrorCode.INVALID_INPUT
                || errorCode == ErrorCode.CONFLICT;
        Duration elapsed = Duration.between(row.getFirstAttemptedAt(), LocalDateTime.now());
        if (permanentError || elapsed.toHours() >= outboxProperties.getMaxRetryHours()) {
            markFailedPermanent(row, errorCode, error);
            return;
        }

        long delayMin = Math.min(60L, 5L * (1L << Math.min(row.getAttemptCount(), 4)));
        LocalDateTime nextAttemptAt = LocalDateTime.now().plusMinutes(delayMin);
        row.markRetry(error, nextAttemptAt);
        outboxRepository.save(row);
        log.warn("Outbox retry: orderId={}, attempt={}, nextAttemptAt={}, error={}",
                row.getPartnerOrderId(), row.getAttemptCount(), nextAttemptAt, error);
    }

    /**
     * HTTP 성공 후 결과 tx가 실패한 경우, 실패한 result tx와 분리하여 PROCESSING을 PENDING으로
     * 되돌린다. 주문/이력 변경은 실패 tx가 롤백하므로 미변경이며 다음 claim은 동일
     * idempotency-key로 at-least-once replay를 수행한다.
     *
     * <p>발행 자체는 성공했으므로 {@code markRetry}(attemptCount++)가 아닌 {@code markRequeue}로
     * 재큐잉한다. 결과 저장 실패는 재시도 횟수를 부풀려선 안 되며(max-retry-hours 판정 왜곡 방지),
     * 순수 결과 영속화 재시도로만 취급한다.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void requeueAfterResultFailure(UUID outboxId, String error) {
        SlipPublishOutbox row = processingRow(outboxId);
        if (row == null) {
            return;
        }
        LocalDateTime nextAttemptAt = LocalDateTime.now().plusMinutes(5);
        row.markRequeue(error, nextAttemptAt);
        outboxRepository.save(row);
        log.error("Outbox result persistence rolled back; requeued: outboxId={}, error={}",
                outboxId, error);
    }

    /**
     * 결과 writer의 원자 소유권 가드 — row 를 비관적 쓰기 락으로 잠근 뒤 PROCESSING 인지 재검한다.
     *
     * <p>{@code findWithLockById}(FOR UPDATE)는 호출 tx 안에서 row 를 직렬화한다. 겹친 다른 worker/reaper
     * 의 결과 tx 는 이 락을 기다렸다가 최신 상태를 읽으므로, 먼저 종결한 전이(COMMITTED/PENDING)를 보고
     * skip 한다(무락 findById 로는 stale PROCESSING 을 읽어 무조건 덮어써 clobber 가 발생).
     */
    private SlipPublishOutbox processingRow(UUID outboxId) {
        SlipPublishOutbox row = outboxRepository.findWithLockById(outboxId).orElse(null);
        return row != null && row.getStatus() == OutboxStatus.PROCESSING ? row : null;
    }

    private void markFailedPermanent(SlipPublishOutbox row, ErrorCode errorCode, String error) {
        row.markFailed(error);
        outboxRepository.save(row);
        orderRepository.findById(row.getPartnerOrderId()).ifPresent(order -> {
            order.markSlipFailedPermanent();
            orderRepository.save(order);
            historyRepository.save(PartnerOrderHistory.ofOrder(
                    order.getId(), order.getPartnerCode(), HistoryEventType.SLIP_FAILED_PERMANENT,
                    "system",
                    writeDetailJson(Map.of(
                            "event", "FAILED_PERMANENT",
                            "errorCode", errorCode == null ? "" : errorCode.name(),
                            "attempts", row.getAttemptCount(),
                            "error", error == null ? "" : error))));
        });
        log.error("Outbox FAILED_PERMANENT: orderId={}, attempts={}, error={}",
                row.getPartnerOrderId(), row.getAttemptCount(), error);
    }

    private String writeDetailJson(Map<String, Object> detail) {
        try {
            return objectMapper.writeValueAsString(detail);
        } catch (JsonProcessingException ex) {
            log.warn("Outbox detailJson 직렬화 실패: {}", ex.getMessage());
            return "{}";
        }
    }
}
