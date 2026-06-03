package com.samhanair.logis.slip.service;

import java.time.Clock;
import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 보상 실패 감사 retention 스케줄러.
 *
 * <p>운영자가 수동 정합을 완료한({@code resolved=true}) 오래된 감사 행만 soft-delete 한다.
 * 기본은 비활성이고, 운영 환경에서 {@code samhan.compensation.retention.enabled=true} 를
 * 명시한 경우에만 등록된다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(
        prefix = "samhan.compensation.retention",
        name = "enabled",
        havingValue = "true",
        matchIfMissing = false)
public class CompensationRetentionScheduler {

    private static final String RETENTION_ACTOR = "system-retention";

    private final CompensationRetentionService retentionService;
    private final Clock clock;

    @Value("${samhan.compensation.retention.retention-days}")
    private long retentionDays;

    /**
     * 설정된 cron 주기로 해소 완료 보상 실패 감사 행의 보존기간 만료분을 정리한다.
     */
    // zone 명시 — UTC 서버(Linux/EC2)에서도 한국시간 기준으로 cron 발화한다(cutoff Clock 과 동일 ZoneId).
    @Scheduled(cron = "${samhan.compensation.retention.cron}", zone = "${samhan.compensation.retention.zone:Asia/Seoul}")
    public void purgeResolvedFailures() {
        LocalDateTime cutoff = LocalDateTime.now(clock).minusDays(retentionDays);
        int purged = retentionService.purge(cutoff, RETENTION_ACTOR);
        log.info("[CompensationRetentionScheduler] retention 실행 완료 — retentionDays={}, purged={}",
                retentionDays, purged);
    }
}
