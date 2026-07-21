package com.samhanair.logis.partnerorder.observability;

import com.samhanair.logis.partnerorder.repository.SlipPublishOutboxRepository;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Clock;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.DoubleSupplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * outbox 상태 관측 지표.
 *
 * <p>depth와 oldest age는 이벤트 발생 시점에 값을 저장하지 않고 Prometheus scrape callback에서
 * 현재 DB 상태를 다시 조회한다. 따라서 startup scrape race나 stdout/awslogs 유실이 상태 관측을
 * 끊지 않는다. heartbeat만 scheduler tick에서 마지막 tick 시각을 갱신한다.
 *
 * <p><b>#863 R1 HIGH-1 정정 — 쿼리 실패를 NaN 으로 침묵시키지 않는다</b>: Micrometer
 * {@code Gauge} 는 콜백이 예외를 던지면 내부에서 {@code catch(Throwable)} 후 값을 {@code NaN} 으로
 * 반환한다. {@code NaN > 0} 과 {@code NaN > threshold} 는 둘 다 {@code false} 라 Prometheus 비교식
 * alert 가 <b>발화하지 않는다</b> — DB 장애로 게이지 쿼리가 매번 예외를 던져도 관측상 "정상"이 되어,
 * 이 슬라이스가 없애려던 실패 양상(장애인데 조용함)을 그대로 재현한다. 두 DB 의존 게이지는 예외를
 * 여기서 직접 잡아 {@link #QUERY_FAILURE_SENTINEL}(모든 실사용 임계값보다 항상 큰 값)을 반환해
 * fail-loud 로 전환한다 — CloudWatch 세 알람이 {@code treat_missing_data=breaching} 인 것과 같은
 * 설계 철학이다.
 *
 * <p><b>#863 R1 MED 정정 — TTL 캐시</b>: Micrometer 콜백은 Prometheus scrape 요청을 처리하는
 * Tomcat worker 스레드에서 그 자리(inline)에 실행된다. scrape 마다 매번 DB 를 왕복하면 (1) DB 부하가
 * 늘고 (2) Hikari 풀이 압박 상태일 때 커넥션 획득 대기가 scrape 자체를 지연시켜 이 인스턴스의
 * 다른 모든 metric(heartbeat 포함) 까지 함께 유실될 수 있다. {@link #GAUGE_CACHE_TTL} 이내에는
 * 마지막으로 성공한 값을 재사용하고, 실패는 캐시하지 않는다(다음 호출에서 즉시 재시도해 복구를
 * 빠르게 감지).
 */
@Component
public class OutboxObservabilityMetrics {

    private static final Logger log = LoggerFactory.getLogger(OutboxObservabilityMetrics.class);

    static final String PENDING_DEPTH = "outbox_pending_depth";
    static final String OLDEST_PENDING_AGE = "outbox_oldest_pending_age_seconds";
    static final String SCHEDULER_HEARTBEAT = "outbox_scheduler_heartbeat_seconds";

    /**
     * 쿼리 실패 시 반환하는 fail-loud sentinel. {@code outbox_pending_depth > 0}(임계 0)과
     * {@code outbox_oldest_pending_age_seconds > 86100} 양쪽 임계값보다 항상 크면서, CloudWatch
     * {@code PutMetricData}(허용 범위 대략 ±8.5e307)에서도 안전하게 수용되는 값을 쓴다.
     */
    static final double QUERY_FAILURE_SENTINEL = 1_000_000_000d;

    /** 게이지 값 캐시 유효 기간 — 이 기간 내 재조회는 마지막 성공값을 재사용한다. */
    private static final long GAUGE_CACHE_TTL_MILLIS = 15_000L;

    private final SlipPublishOutboxRepository outboxRepository;
    private final Clock clock;
    private final AtomicLong lastSchedulerTickMillis;
    private final AtomicReference<CachedValue> pendingDepthCache = new AtomicReference<>();
    private final AtomicReference<CachedValue> oldestPendingAgeCache = new AtomicReference<>();

    /** 성공한 조회만 저장한다 — 실패는 캐시하지 않고 매 호출 재시도한다(빠른 복구 감지). */
    private record CachedValue(double value, long computedAtMillis) {
    }

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
        return cachedOrCompute(pendingDepthCache, PENDING_DEPTH, outboxRepository::countPendingDepth);
    }

    private double oldestPendingAgeSeconds() {
        return cachedOrCompute(oldestPendingAgeCache, OLDEST_PENDING_AGE,
                () -> Math.max(0d, outboxRepository.oldestPendingAgeSeconds()));
    }

    private double schedulerHeartbeatSeconds() {
        return Math.max(0d, (clock.millis() - lastSchedulerTickMillis.get()) / 1000d);
    }

    /**
     * TTL 캐시 조회 + 예외 시 fail-loud sentinel 반환.
     *
     * @param cache     게이지 전용 캐시 슬롯
     * @param gaugeName 로그 식별용 게이지 이름
     * @param query     실제 DB 조회(예외를 던질 수 있음)
     */
    private double cachedOrCompute(AtomicReference<CachedValue> cache, String gaugeName, DoubleSupplier query) {
        CachedValue cached = cache.get();
        long now = clock.millis();
        if (cached != null && (now - cached.computedAtMillis()) < GAUGE_CACHE_TTL_MILLIS) {
            return cached.value();
        }
        try {
            double value = query.getAsDouble();
            cache.set(new CachedValue(value, now));
            return value;
        } catch (RuntimeException ex) {
            log.warn("{} 조회 실패 — DB 장애 의심, fail-loud sentinel({}) 반환", gaugeName, QUERY_FAILURE_SENTINEL, ex);
            return QUERY_FAILURE_SENTINEL;
        }
    }
}
