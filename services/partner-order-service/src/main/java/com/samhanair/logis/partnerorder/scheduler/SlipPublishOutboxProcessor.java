package com.samhanair.logis.partnerorder.scheduler;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
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
     * 종결했거나(상태 != PENDING), 다른 worker 가 markRetry 로 미래 nextAttemptAt 을 부여해
     * 되돌린 row 는 외부 발행을 호출하지 않고 반환한다(재시도 double-fire 차단).
     *
     * <p>try 는 payload 파싱 + slip 발행만 감싼다. 파싱 실패도 {@link #handleRetry} 로 종결시켜
     * 무한 즉시 재-pick storm 을 막는다. 발행 성공이 확정된 뒤에야 markCommitted + 명시 save +
     * order/history 영속을 수행하며, 이 구간의 DB 오류는 잡지 않는다 — tx 롤백 후 다음 cron 이
     * 동일 idempotency-key 로 replay 하도록 두어(실발행됐는데 PENDING 회귀·attemptCount 인플레 방지)
     * 발행 성공과 상태 영속의 원자성을 보존한다.
     *
     * <p>{@code timeout=20} 은 connect 2s + read 5s HTTP 상한과 DB 쓰기 시간을 감안한 tx 상한으로,
     * 비관 락을 잡은 채 지연되는 최대 시간을 제한한다.
     *
     * @param row 스케줄러가 pick 한 후보 row
     */
    @Transactional(timeout = 20)
    public void processOne(SlipPublishOutbox row) {
        LocalDateTime now = LocalDateTime.now();
        SlipPublishOutbox locked = outboxRepository.findWithLockById(row.getId()).orElse(null);
        if (locked == null
                || locked.getStatus() != OutboxStatus.PENDING
                || locked.getNextAttemptAt().isAfter(now)) {
            // 종결됨 / 다른 worker 가 미래 nextAttemptAt 으로 되돌림 → 발행 skip.
            return;
        }
        locked.markProcessing();

        PublishResult result;
        try {
            // 파싱을 try 안에 두어 불량 payload 도 재시도 백오프(→max-retry 후 FAILED)로 종결한다.
            Map<String, Object> payload = parsePayload(locked.getRequestPayload());
            result = slipServiceClient.publishFromPartnerOrder(
                    payload, locked.getIdempotencyKey());
        } catch (RuntimeException ex) {
            // BusinessException 포함 모든 발행/파싱 실패 → 재시도 처리 후 종료.
            handleRetry(locked, ex.getMessage());
            return;
        }

        // ── 발행 성공 확정 이후 ── (catch 밖: 아래 DB 오류는 tx 롤백 → 다음 cron 이 replay)
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
                    writeDetailJson(Map.of(
                            "slipNo", result.slipNo(),
                            "viaOutbox", true,
                            "attempts", locked.getAttemptCount()))));
        });
        log.info("Outbox COMMITTED: orderId={}, slipNo={}, attempts={}",
                locked.getPartnerOrderId(), result.slipNo(), locked.getAttemptCount());
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
                // 주: 전용 SLIP_FAILED_PERMANENT enum 부재로 SLIP_RETRY_QUEUED 재사용 + detailJson 마커.
                //     enum 오표기 정정은 후속 작업(#854 범위 외).
                historyRepository.save(PartnerOrderHistory.ofOrder(
                        order.getId(), order.getPartnerCode(), HistoryEventType.SLIP_RETRY_QUEUED,
                        "system",
                        writeDetailJson(Map.of(
                                "event", "FAILED_PERMANENT",
                                "attempts", row.getAttemptCount(),
                                "error", error == null ? "" : error))));
            });
            log.error("Outbox FAILED_PERMANENT: orderId={}, attempts={}, error={}",
                    row.getPartnerOrderId(), row.getAttemptCount(), error);
            return;
        }
        // 지수 백오프 (5min × 2^attempt, max 60min)
        long delayMin = Math.min(60L, 5L * (1L << Math.min(row.getAttemptCount(), 4)));
        LocalDateTime nextAttemptAt = LocalDateTime.now().plusMinutes(delayMin);
        row.markRetry(error, nextAttemptAt);
        // 재시도 상태도 명시 save 하여 attemptCount/nextAttemptAt 을 보존한다.
        outboxRepository.save(row);
        // 재시도 관측성 — 운영에서 백오프 진행(다음 시도 시각·누적 시도수)을 추적한다.
        log.warn("Outbox retry: orderId={}, attempt={}, nextAttemptAt={}, error={}",
                row.getPartnerOrderId(), row.getAttemptCount(), nextAttemptAt, error);
    }

    private Map<String, Object> parsePayload(String json) {
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {});
        } catch (JsonProcessingException ex) {
            throw new RuntimeException("outbox payload 파싱 실패: " + ex.getMessage(), ex);
        }
    }

    /**
     * history detailJson 직렬화 — 수동 문자열 조립 대신 ObjectMapper 로 제어문자/따옴표를 안전하게
     * 이스케이프한다(slipNo·error 미이스케이프 위험 제거). 관측용 detail 이므로 직렬화 실패는 발행
     * 성패에 영향 주지 않도록 최소 fallback({@code "{}"})으로 처리한다.
     *
     * @param detail 직렬화할 key/value 맵
     * @return JSON 문자열 (실패 시 빈 객체)
     */
    private String writeDetailJson(Map<String, Object> detail) {
        try {
            return objectMapper.writeValueAsString(detail);
        } catch (JsonProcessingException ex) {
            log.warn("Outbox detailJson 직렬화 실패: {}", ex.getMessage());
            return "{}";
        }
    }
}
