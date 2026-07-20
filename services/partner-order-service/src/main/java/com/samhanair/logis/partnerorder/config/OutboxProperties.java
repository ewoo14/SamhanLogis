package com.samhanair.logis.partnerorder.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Outbox scheduler 옵션. yml 키 {@code samhan.outbox.*}.
 *
 * <ul>
 *   <li>{@code samhan.outbox.cron} — Quartz-style cron 표현식 (기본 5분)</li>
 *   <li>{@code samhan.outbox.max-retry-hours} — PENDING 상태 최대 retry 시간 (이후 FAILED_PERMANENT)</li>
 *   <li>{@code samhan.outbox.lease-seconds} — PROCESSING stale claim lease (기본 60초)</li>
 * </ul>
 */
@Data
@ConfigurationProperties(prefix = "samhan.outbox")
public class OutboxProperties {

    /** 5분 마다 재시도 (Spring `@Scheduled(cron=...)` 형식 6-필드). */
    private String cron = "0 */5 * * * *";

    /** 24시간 초과 PENDING 은 FAILED_PERMANENT 로 전이 + alert. */
    private int maxRetryHours = 24;

    /** HTTP connect/read timeout(2초/5초)보다 충분히 긴 PROCESSING lease. */
    private int leaseSeconds = 60;
}
