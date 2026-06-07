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
 * 보상 실패 감사 물리 purge 스케줄러. (D-SER-28)
 *
 * <p>retention 이 soft-delete 한 행 중 추가 grace 기간이 지난 행만 물리 삭제한다.
 * 기본은 비활성이고, 운영 환경에서 {@code samhan.compensation.purge.enabled=true} 를
 * 명시한 경우에만 등록된다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(
        prefix = "samhan.compensation.purge",
        name = "enabled",
        havingValue = "true",
        matchIfMissing = false)
public class CompensationPurgeScheduler {

    private final CompensationPurgeService purgeService;
    private final Clock clock;

    @Value("${samhan.compensation.purge.grace-days}")
    private long graceDays;

    @Value("${samhan.compensation.purge.batch-size}")
    private int batchSize;

    /**
     * 설정된 cron 주기로 soft-delete 후 grace 경과 감사 행을 물리 삭제한다.
     */
    // zone 명시 — UTC 서버에서도 한국시간 기준 발화(retention Clock 과 일관).
    @Scheduled(cron = "${samhan.compensation.purge.cron}", zone = "${samhan.compensation.purge.zone:Asia/Seoul}")
    public void purgeSoftDeletedFailures() {
        LocalDateTime cutoff = LocalDateTime.now(clock).minusDays(graceDays);
        int purged = purgeService.purgePhysically(cutoff, batchSize);
        log.info("[CompensationPurgeScheduler] 물리 purge 실행 완료 — graceDays={}, batchSize={}, purged={}",
                graceDays, batchSize, purged);
    }
}
