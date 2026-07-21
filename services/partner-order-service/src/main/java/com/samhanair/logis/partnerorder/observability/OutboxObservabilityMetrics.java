package com.samhanair.logis.partnerorder.observability;

import com.samhanair.logis.partnerorder.repository.SlipPublishOutboxRepository;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Clock;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * outbox 상태 관측 지표.
 *
 * <p>depth와 oldest age는 이벤트 발생 시점에 값을 저장하지 않고 Prometheus scrape callback에서
 * 현재 DB 상태를 다시 조회한다. 따라서 startup scrape race나 stdout/awslogs 유실이 상태 관측을
 * 끊지 않는다. heartbeat만 scheduler tick에서 마지막 tick 시각을 갱신한다.
 */
@Component
public class OutboxObservabilityMetrics {

    static final String PENDING_DEPTH = "outbox_pending_depth";
    static final String OLDEST_PENDING_AGE = "outbox_oldest_pending_age_seconds";
    static final String SCHEDULER_HEARTBEAT = "outbox_scheduler_heartbeat_seconds";

    private final SlipPublishOutboxRepository outboxRepository;
    private final Clock clock;
    private final AtomicLong lastSchedulerTickMillis;

    @Autowired
    public OutboxObservabilityMetrics(SlipPublishOutboxRepository outboxRepository,
                                      MeterRegistry meterRegistry) {
        this(outboxRepository, meterRegistry, Clock.systemUTC());
    }

    OutboxObservabilityMetrics(SlipPublishOutboxRepository outboxRepository,
                               MeterRegistry meterRegistry,
                               Clock clock) {
        this.outboxRepository = outboxRepository;
        this.clock = clock;
        this.lastSchedulerTickMillis = new AtomicLong(clock.millis());

        Gauge.builder(PENDING_DEPTH, this, OutboxObservabilityMetrics::pendingDepth)
                .description("PENDING 또는 PROCESSING 상태인 outbox 행 수")
                .register(meterRegistry);
        Gauge.builder(OLDEST_PENDING_AGE, this, OutboxObservabilityMetrics::oldestPendingAgeSeconds)
                .description("가장 오래된 미처리 outbox 행의 경과 초")
                .register(meterRegistry);
        Gauge.builder(SCHEDULER_HEARTBEAT, this, OutboxObservabilityMetrics::schedulerHeartbeatSeconds)
                .description("마지막 outbox scheduler tick 이후 경과 초")
                .register(meterRegistry);
    }

    /** scheduler가 실제 tick을 시작했음을 기록한다. 후보가 0건이어도 반드시 호출한다. */
    public void markSchedulerTick() {
        lastSchedulerTickMillis.set(clock.millis());
    }

    private double pendingDepth() {
        return outboxRepository.countPendingDepth();
    }

    private double oldestPendingAgeSeconds() {
        return Math.max(0d, outboxRepository.oldestPendingAgeSeconds());
    }

    private double schedulerHeartbeatSeconds() {
        return Math.max(0d, (clock.millis() - lastSchedulerTickMillis.get()) / 1000d);
    }
}
