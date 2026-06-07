package com.samhanair.logis.slip.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.slip.domain.CompensationOperation;
import com.samhanair.logis.slip.domain.CompensationPhase;
import com.samhanair.logis.slip.service.CompensationRetryExecutor.Outcome;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

/**
 * CompensationMetrics 단위 테스트.
 *
 * <p>SimpleMeterRegistry 로 Spring 부팅 없이 사전 등록과 increment 를 검증한다.
 */
class CompensationMetricsTest {

    @Test
    void constructor_preRegistersAllCompensationCounters() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();

        new CompensationMetrics(registry);

        assertThat(registry.find(CompensationMetrics.COMPENSATION_FAILURE_RECORDED_TOTAL)
                .tag("operation", "RELEASE_INSTANCES")
                .tag("phase", "ACCEPT_RESERVE")
                .counter()).isNotNull();
        assertThat(registry.find(CompensationMetrics.COMPENSATION_ALERT_SEND_TOTAL)
                .tag("result", "success")
                .counter()).isNotNull();
        assertThat(registry.find(CompensationMetrics.COMPENSATION_ALERT_SEND_TOTAL)
                .tag("result", "failure")
                .counter()).isNotNull();
        assertThat(registry.find(CompensationMetrics.COMPENSATION_ALERT_SEND_TOTAL)
                .tag("result", "skipped")
                .counter()).isNotNull();
        assertThat(registry.find(CompensationMetrics.COMPENSATION_RETRY_TOTAL)
                .tag("outcome", "GONE")
                .counter()).isNotNull();
        assertThat(registry.find(CompensationMetrics.COMPENSATION_RETENTION_PURGED_TOTAL)
                .tag("mode", "soft")
                .counter()).isNotNull();
        assertThat(registry.find(CompensationMetrics.COMPENSATION_RETENTION_PURGED_TOTAL)
                .tag("mode", "hard")
                .counter()).isNotNull();
    }

    @Test
    void recordMethods_incrementExpectedCountersOnly() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        CompensationMetrics metrics = new CompensationMetrics(registry);

        metrics.recordFailureRecorded(CompensationOperation.RELEASE_INSTANCES,
                CompensationPhase.ACCEPT_RESERVE);
        metrics.recordAlertSendSuccess();
        metrics.recordAlertSendFailure();
        metrics.recordAlertSendSkipped();
        metrics.recordRetryOutcome(Outcome.SUCCEEDED);
        metrics.recordRetryOutcome(Outcome.GONE);
        metrics.recordRetentionPurgedSoft(3);
        metrics.recordRetentionPurgedHard(2);

        assertThat(registry.get(CompensationMetrics.COMPENSATION_FAILURE_RECORDED_TOTAL)
                .tag("operation", "RELEASE_INSTANCES")
                .tag("phase", "ACCEPT_RESERVE")
                .counter()
                .count()).isEqualTo(1);
        assertThat(registry.get(CompensationMetrics.COMPENSATION_ALERT_SEND_TOTAL)
                .tag("result", "success")
                .counter()
                .count()).isEqualTo(1);
        assertThat(registry.get(CompensationMetrics.COMPENSATION_ALERT_SEND_TOTAL)
                .tag("result", "failure")
                .counter()
                .count()).isEqualTo(1);
        assertThat(registry.get(CompensationMetrics.COMPENSATION_ALERT_SEND_TOTAL)
                .tag("result", "skipped")
                .counter()
                .count()).isEqualTo(1);
        assertThat(registry.get(CompensationMetrics.COMPENSATION_RETRY_TOTAL)
                .tag("outcome", "SUCCEEDED")
                .counter()
                .count()).isEqualTo(1);
        assertThat(registry.get(CompensationMetrics.COMPENSATION_RETRY_TOTAL)
                .tag("outcome", "GONE")
                .counter()
                .count()).isEqualTo(1);
        assertThat(registry.get(CompensationMetrics.COMPENSATION_RETENTION_PURGED_TOTAL)
                .tag("mode", "soft")
                .counter()
                .count()).isEqualTo(3);
        assertThat(registry.get(CompensationMetrics.COMPENSATION_RETENTION_PURGED_TOTAL)
                .tag("mode", "hard")
                .counter()
                .count()).isEqualTo(2);
    }
}
