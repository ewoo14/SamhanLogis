package com.samhanair.logis.partnerorder.scheduler;

import com.samhanair.logis.partnerorder.config.OutboxProperties;
import com.samhanair.logis.partnerorder.config.PartnerOrderTaskSchedulerConfiguration;
import com.samhanair.logis.partnerorder.observability.OutboxObservabilityMetrics;
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
    private final SlipPublishOutboxResultWriter resultWriter;
    private final OutboxProperties outboxProperties;
    private final OutboxObservabilityMetrics observabilityMetrics;

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
        int leaseSeconds = outboxProperties.getLeaseSeconds();
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
    @Scheduled(
            cron = "${samhan.outbox.cron:0 */5 * * * *}",
            scheduler = PartnerOrderTaskSchedulerConfiguration.OUTBOX_TASK_SCHEDULER_BEAN_NAME)
    public void retryPending() {
        // #863 R1 HIGH-1: heartbeat는 claim(DB 접근) 이 성공한 뒤에만 갱신한다. claim 이전에 갱신하면
        // DB 가 죽어 매 tick 이 예외를 던져도 heartbeat 는 계속 새 값으로 살아있는 것처럼 보여
        // SchedulerStalled 알람이 DB 장애를 영원히 못 잡는다 — 이 슬라이스가 없애려던 실패 양상
        // 그 자체다. claim 이 성공(후보 0건 포함)해야만 scheduler 가 실제로 DB 와 통신 가능함을
        // 증명한 것이므로, 그 성공 뒤에만 heartbeat 를 갱신한다.
        List<SlipPublishOutbox> candidates = outboxRepository.claimReadyBatch(
                outboxProperties.getBatchSize(), outboxProperties.getLeaseSeconds());
        observabilityMetrics.markSchedulerTick();
        if (candidates.isEmpty()) {
            return;
        }
        log.info("Outbox claim: {} rows", candidates.size());

        for (SlipPublishOutbox row : candidates) {
            try {
                // #854 R4 HIGH-C: 종결 판정이 handleRetry 안에만 있으면 결과 tx 실패 루프·lease 재점유
                // 루프가 영원히 terminal 에 도달하지 못한다. 두 경로 모두 claim 을 거치므로 claim 직후
                // 벽시계 상한을 먼저 검사해 소진된 row 를 재발행 없이 종결시킨다.
                if (resultWriter.expireIfExhausted(row.getId())) {
                    continue;
                }
                // processor에는 DB tx가 없고, 결과 writer만 row별 짧은 tx를 연다.
                processor.processOne(row);
            } catch (RuntimeException ex) {
                log.error("Outbox row {} processing failed: {}", row.getId(), ex.getMessage());
            }
        }
    }
}
