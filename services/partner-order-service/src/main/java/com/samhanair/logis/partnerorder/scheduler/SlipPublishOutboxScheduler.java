package com.samhanair.logis.partnerorder.scheduler;

import com.samhanair.logis.partnerorder.config.OutboxProperties;
import com.samhanair.logis.partnerorder.outbox.SlipPublishOutbox;
import com.samhanair.logis.partnerorder.repository.SlipPublishOutboxRepository;
import jakarta.annotation.PostConstruct;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
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
 *
 * <p>{@code @Profile("!local")} — claim SQL 이 PostgreSQL 전용 문법({@code make_interval}·
 * {@code FOR UPDATE SKIP LOCKED}·{@code RETURNING})을 사용하므로 local(H2) 프로파일에서는 스케줄러
 * 빈을 생성하지 않는다. IT 는 default 프로파일(Testcontainers PostgreSQL)이라 빈이 존재한다.
 */
@Component
@Profile("!local")
@RequiredArgsConstructor
public class SlipPublishOutboxScheduler {

    private static final Logger log = LoggerFactory.getLogger(SlipPublishOutboxScheduler.class);

    /**
     * 한 row 처리 최악 소요 시간(초) — HTTP connect(2s) + read(5s) 상한.
     * {@code lease-seconds ≥ batch-size × PER_ROW_MAX_SECONDS} 불변식의 계수.
     */
    private static final int PER_ROW_MAX_SECONDS = 7;

    private final SlipPublishOutboxRepository outboxRepository;
    private final SlipPublishOutboxProcessor processor;
    private final OutboxProperties outboxProperties;

    /**
     * lease/batch 불변식 검증 — 위반 시 순차 batch 최악 dwell 이 lease 를 넘어 멀티 인스턴스 lease
     * overlap 재발행이 상시화되므로 부팅 시 경고한다.
     *
     * <p>HIGH 원자 소유권 가드가 부패(clobber)는 이미 차단하므로 위반해도 정합성은 유지되나, 잉여
     * 재발행(idempotency replay)이 증가한다. 따라서 실패가 아닌 warn 으로만 알린다.
     */
    @PostConstruct
    void validateLeaseBatchInvariant() {
        int batchSize = outboxProperties.getBatchSize();
        int leaseSeconds = processor.getLeaseSeconds();
        int worstDwell = batchSize * PER_ROW_MAX_SECONDS;
        if (leaseSeconds < worstDwell) {
            log.warn("Outbox lease/batch 불변식 위반: lease-seconds={} < batch-size({})×perRow({}s)={}"
                            + " — 멀티 인스턴스 lease overlap 재발행 위험. lease-seconds 상향 또는 batch-size 하향 권장.",
                    leaseSeconds, batchSize, PER_ROW_MAX_SECONDS, worstDwell);
        }
    }

    /**
     * 본 스케줄러는 yml 의 {@code samhan.outbox.cron} (기본 5분) 으로 실행.
     */
    @Scheduled(cron = "${samhan.outbox.cron:0 */5 * * * *}")
    public void retryPending() {
        List<SlipPublishOutbox> candidates = outboxRepository.claimReadyBatch(
                outboxProperties.getBatchSize(), processor.getLeaseSeconds());
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
