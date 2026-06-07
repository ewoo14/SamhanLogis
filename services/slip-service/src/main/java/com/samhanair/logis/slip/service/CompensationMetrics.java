package com.samhanair.logis.slip.service;

import com.samhanair.logis.slip.domain.CompensationOperation;
import com.samhanair.logis.slip.domain.CompensationPhase;
import com.samhanair.logis.slip.service.CompensationRetryExecutor.Outcome;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import java.util.EnumMap;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * 보상 감사/알림/재시도/retention 흐름의 Micrometer counter 를 기록한다.
 *
 * <p>모든 metric 이름은 Prometheus 관례에 맞춰 lower snake_case + {@code _total} suffix 를 사용한다.
 * tag 값은 enum 이름 또는 사전 정의된 고정 문자열만 사용하며 slipNo, UUID, 예외 메시지는 절대 포함하지
 * 않는다. 사용자 화면 UUID 비공개와 metric cardinality 제한을 동시에 지키기 위한 운영 가드다.
 *
 * <p>생성 시점에 모든 tag 조합을 사전 등록해 lazy 등록 race 와 누락을 방지한다.
 */
@Component
public class CompensationMetrics {

    /** 보상 실패 감사 행 저장 성공 누적 counter. */
    public static final String COMPENSATION_FAILURE_RECORDED_TOTAL =
            "compensation_failure_recorded_total";

    /** 보상 실패 운영 알림 발송 결과 누적 counter. */
    public static final String COMPENSATION_ALERT_SEND_TOTAL =
            "compensation_alert_send_total";

    /** 보상 자동 재시도 outcome 누적 counter. */
    public static final String COMPENSATION_RETRY_TOTAL =
            "compensation_retry_total";

    /** 보상 실패 감사 retention/purge 정리 건수 누적 counter. */
    public static final String COMPENSATION_RETENTION_PURGED_TOTAL =
            "compensation_retention_purged_total";

    private final Map<CompensationOperation, Map<CompensationPhase, Counter>> failureRecordedCounters;
    private final Map<AlertSendResult, Counter> alertSendCounters;
    private final Map<Outcome, Counter> retryCounters;
    private final Map<RetentionPurgeMode, Counter> retentionPurgedCounters;

    public CompensationMetrics(MeterRegistry meterRegistry) {
        this.failureRecordedCounters = new EnumMap<>(CompensationOperation.class);
        for (CompensationOperation operation : CompensationOperation.values()) {
            EnumMap<CompensationPhase, Counter> phaseCounters = new EnumMap<>(CompensationPhase.class);
            for (CompensationPhase phase : CompensationPhase.values()) {
                phaseCounters.put(phase, Counter.builder(COMPENSATION_FAILURE_RECORDED_TOTAL)
                        .description("보상 실패 감사 행 저장 성공 누적 카운터")
                        .tag("operation", operation.name())
                        .tag("phase", phase.name())
                        .register(meterRegistry));
            }
            this.failureRecordedCounters.put(operation, phaseCounters);
        }

        this.alertSendCounters = new EnumMap<>(AlertSendResult.class);
        for (AlertSendResult result : AlertSendResult.values()) {
            this.alertSendCounters.put(result, Counter.builder(COMPENSATION_ALERT_SEND_TOTAL)
                    .description("보상 실패 운영 알림 발송 결과 누적 카운터")
                    .tag("result", result.tagValue)
                    .register(meterRegistry));
        }

        this.retryCounters = new EnumMap<>(Outcome.class);
        for (Outcome outcome : Outcome.values()) {
            this.retryCounters.put(outcome, Counter.builder(COMPENSATION_RETRY_TOTAL)
                    .description("보상 자동 재시도 outcome 누적 카운터")
                    .tag("outcome", outcome.name())
                    .register(meterRegistry));
        }

        this.retentionPurgedCounters = new EnumMap<>(RetentionPurgeMode.class);
        for (RetentionPurgeMode mode : RetentionPurgeMode.values()) {
            this.retentionPurgedCounters.put(mode, Counter.builder(COMPENSATION_RETENTION_PURGED_TOTAL)
                    .description("보상 실패 감사 retention/purge 정리 건수 누적 카운터")
                    .tag("mode", mode.tagValue)
                    .register(meterRegistry));
        }
    }

    /**
     * 감사 행 저장 성공을 기록한다.
     *
     * @param operation 실패한 보상 동작
     * @param phase 보상 단계
     */
    public void recordFailureRecorded(CompensationOperation operation, CompensationPhase phase) {
        Map<CompensationPhase, Counter> phaseCounters = failureRecordedCounters.get(operation);
        if (phaseCounters == null) {
            return;
        }
        Counter counter = phaseCounters.get(phase);
        if (counter != null) {
            counter.increment();
        }
    }

    /** 운영 알림 발송 성공을 기록한다. */
    public void recordAlertSendSuccess() {
        recordAlertSend(AlertSendResult.SUCCESS);
    }

    /** 운영 알림 발송 실패를 기록한다. */
    public void recordAlertSendFailure() {
        recordAlertSend(AlertSendResult.FAILURE);
    }

    /** 운영 알림 발송 skip 을 기록한다. */
    public void recordAlertSendSkipped() {
        recordAlertSend(AlertSendResult.SKIPPED);
    }

    /**
     * 보상 자동 재시도 outcome 을 기록한다.
     *
     * @param outcome executor 에서 확정된 재시도 결과
     */
    public void recordRetryOutcome(Outcome outcome) {
        Counter counter = retryCounters.get(outcome);
        if (counter != null) {
            counter.increment();
        }
    }

    /**
     * retention soft-delete 정리 건수를 기록한다.
     *
     * @param count soft-delete 처리 건수
     */
    public void recordRetentionPurgedSoft(int count) {
        recordRetentionPurged(RetentionPurgeMode.SOFT, count);
    }

    /**
     * 물리 purge 정리 건수를 기록한다.
     *
     * @param count hard-delete 처리 건수
     */
    public void recordRetentionPurgedHard(int count) {
        recordRetentionPurged(RetentionPurgeMode.HARD, count);
    }

    private void recordAlertSend(AlertSendResult result) {
        Counter counter = alertSendCounters.get(result);
        if (counter != null) {
            counter.increment();
        }
    }

    private void recordRetentionPurged(RetentionPurgeMode mode, int count) {
        if (count <= 0) {
            return;
        }
        Counter counter = retentionPurgedCounters.get(mode);
        if (counter != null) {
            counter.increment(count);
        }
    }

    private enum AlertSendResult {
        SUCCESS("success"),
        FAILURE("failure"),
        SKIPPED("skipped");

        private final String tagValue;

        AlertSendResult(String tagValue) {
            this.tagValue = tagValue;
        }
    }

    private enum RetentionPurgeMode {
        SOFT("soft"),
        HARD("hard");

        private final String tagValue;

        RetentionPurgeMode(String tagValue) {
            this.tagValue = tagValue;
        }
    }
}
