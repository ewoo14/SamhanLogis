package com.samhanair.logis.slip.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 보상 실패 자동 재시도 스케줄러. (D-SER-27, ⑦ outbox/Saga)
 *
 * <p>미해소 보상 실패 중 재시도 가능한 시리얼 보상을 주기적으로 자동 재실행한다. 기본은 비활성이며,
 * 운영 환경에서 {@code samhan.compensation.retry.enabled=true} 를 명시한 경우에만 등록된다.
 * (③ retention 스케줄러와 동일한 운영 toggle 패턴.)
 */
@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(
        prefix = "samhan.compensation.retry",
        name = "enabled",
        havingValue = "true",
        matchIfMissing = false)
public class CompensationRetryScheduler {

    private final CompensationRetryService retryService;

    @Value("${samhan.compensation.retry.max-retries}")
    private int maxRetries;

    @Value("${samhan.compensation.retry.backoff-base-minutes}")
    private long backoffBaseMinutes;

    /**
     * 설정된 cron 주기로 재시도 후보를 자동 재실행한다.
     */
    // zone 명시 — UTC 서버에서도 한국시간 기준 발화(retention 과 일관).
    @Scheduled(cron = "${samhan.compensation.retry.cron}", zone = "${samhan.compensation.retry.zone:Asia/Seoul}")
    public void retryFailures() {
        CompensationRetryService.RetryResult result = retryService.retryEligible(maxRetries, backoffBaseMinutes);
        log.info("[CompensationRetryScheduler] 자동 재시도 실행 — {}", result);
    }
}
