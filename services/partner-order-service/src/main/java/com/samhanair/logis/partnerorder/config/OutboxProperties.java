package com.samhanair.logis.partnerorder.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Outbox scheduler 옵션. yml 키 {@code samhan.outbox.*}.
 *
 * <ul>
 *   <li>{@code samhan.outbox.cron} — Spring {@code @Scheduled} cron 표현식 (기본 5분)</li>
 *   <li>{@code samhan.outbox.max-retry-hours} — retry 최대 시간. 초과 시 outbox row 는
 *       {@link com.samhanair.logis.partnerorder.outbox.OutboxStatus#FAILED} 로, 주문
 *       slipPublishStatus·history event 는 FAILED_PERMANENT 로 전이(alert)</li>
 *   <li>{@code samhan.outbox.lease-seconds} — PROCESSING lease. 만료 시 stale PROCESSING 재점유</li>
 *   <li>{@code samhan.outbox.batch-size} — 한 claim 사이클이 점유할 최대 row 수</li>
 * </ul>
 *
 * <p>lease/batch 불변식: {@code lease-seconds ≥ batch-size × 7}(perRow 최악 = connect 2s + read 5s).
 * 위반 시 순차 batch dwell 이 lease 를 초과해 멀티 인스턴스 lease overlap 재발행이 상시화된다
 * ({@link com.samhanair.logis.partnerorder.scheduler.SlipPublishOutboxScheduler} 의 {@code @PostConstruct}
 * 가 위반 시 warn). 기본값 batch-size=10 · lease-seconds=120 → 10×7=70 &lt; 120 로 여유를 둔다.
 */
@Data
@ConfigurationProperties(prefix = "samhan.outbox")
public class OutboxProperties {

    /** 5분 마다 재시도 (Spring `@Scheduled(cron=...)` 형식 6-필드). */
    private String cron = "0 */5 * * * *";

    /** 초과 시 outbox row=FAILED, 주문 slipPublishStatus=FAILED_PERMANENT + alert. */
    private int maxRetryHours = 24;

    /**
     * PROCESSING lease(초). HTTP connect(2s)/read(5s) 및 batch 최악 dwell 을 넘도록 설정한다.
     * 불변식 {@code lease-seconds ≥ batch-size × 7} 을 만족해야 lease overlap 재발행을 억제한다.
     */
    private int leaseSeconds = 120;

    /** 한 claim 사이클이 점유할 최대 row 수. lease/batch 불변식의 계수(batch-size × perRow). */
    private int batchSize = 10;
}
