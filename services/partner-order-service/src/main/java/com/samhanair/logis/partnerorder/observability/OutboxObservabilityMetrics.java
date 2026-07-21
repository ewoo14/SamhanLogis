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
 * 여기서 직접 잡아 {@link #QUERY_FAILURE_SENTINEL}(모든 실사용 임계값보다 항상 큰 값)을 반환한다.
 *
 * <p><b>#863 N-1 정정(2026-07-22, R1 라이브QA 실측) — sentinel 의 실제 도달 범위는 부분 장애로
 * 한정된다</b>: 위 sentinel 반환은 쿼리 <b>실행</b> 자체가 예외를 던지는 부분 장애(SQL 오류, 제약
 * 위반, 순간적 락 대기 등)에서는 scrape 응답에 실려 Prometheus 에 실제로 도달해 fail-loud 값을
 * 노출한다. 그러나 DB 가 완전히 응답 불가한 경우(다운·네트워크 단절), {@code jakarta.persistence.
 * query.timeout} 는 쿼리 실행 자체만 제한할 뿐 Hikari <b>커넥션 획득 대기</b>는 막지 못한다
 * ({@link com.samhanair.logis.partnerorder.repository.SlipPublishOutboxRepository} Javadoc 참조).
 * 이 경우 게이지 콜백은 커넥션 획득 단계에서 멈추고, Micrometer 콜백이 scrape 요청을 처리하는
 * Tomcat worker 스레드에서 inline 실행되므로 scrape HTTP 응답 자체가 Prometheus
 * {@code scrape_timeout}(기본 10s)을 넘겨 실패한다 — sentinel 값은 이 경로에서 Prometheus 에
 * <b>단 한 번도 도달하지 못한다</b>(라이브 실측: {@code docs/qa/863-r1-liveqa/
 * db-failure-failloud-raw.txt} — {@code /actuator/prometheus} 18회 연속 타임아웃, 모든 알람
 * 평가값이 {@code 1e+00}, sentinel 이었다면 {@code 1e+09} 여야 했다). 이 완전 장애에서 알람을
 * 실제로 발화시키는 것은 sentinel 이 아니라 Prometheus rule 의 {@code or absent(...)} 가드(H-4,
 * {@code infrastructure/prometheus/rules/partner-order-outbox.yml})다 — 메트릭 시리즈 자체가
 * scrape 실패로 사라지면 비교식은 "거짓"이 아니라 "결과 없음"이 되어 원래는 영구 침묵하지만,
 * {@code absent()} 는 그 소실 자체를 감지해 발화한다. 정리하면 <b>sentinel 은 부분 장애(쿼리
 * 실행 실패, 커넥션은 획득됨)용 1차 방어선이고, {@code absent()} 가드가 완전 장애(서비스 다운
 * 포함, 메트릭 시리즈 자체의 소실)까지 커버하는 최종 방어선이다</b> — CloudWatch 세 알람의
 * {@code treat_missing_data=breaching} 도 "메트릭 소실 자체"를 발화 조건으로 삼는 동일한 설계
 * 철학이다. 이 슬라이스의 관측 목적(장애 시 알람이 green 으로 남지 않고 실제로 발화)은 이미
 * 실측으로 달성돼 있으며, 본 정정은 그 달성 경로에 대한 서술만 실측에 맞게 고친 것이다(동작
 * 변경 없음). 게이지 콜백의 비동기화/캐시화로 완전 장애에서도 sentinel 이 도달하게 만드는
 * 것은 근본적으로 다른 설계이며 이 슬라이스 범위 밖이다(개발책임자 결정, 2026-07-22).
 *
 * <p><b>#863 R1 MED 정정 — TTL 캐시</b>: Micrometer 콜백은 Prometheus scrape 요청을 처리하는
 * Tomcat worker 스레드에서 그 자리(inline)에 실행된다. scrape 마다 매번 DB 를 왕복하면 (1) DB 부하가
 * 늘고 (2) Hikari 풀이 압박 상태일 때 커넥션 획득 대기가 scrape 자체를 지연시켜 이 인스턴스의
 * 다른 모든 metric(heartbeat 포함) 까지 함께 유실될 수 있다. {@link #GAUGE_CACHE_TTL} 이내에는
 * 마지막으로 성공한 값을 재사용하고, 실패는 캐시하지 않는다(다음 호출에서 즉시 재시도해 복구를
 * 빠르게 감지). ※ 이 부수 영향은 R1 라이브QA 로 실측 확인됐다 — DB 완전 장애 시 heartbeat 를
 * 포함한 인스턴스 전체 metric 이 scrape 실패로 함께 관측 불가가 됐다({@code db-failure-failloud-
 * raw.txt} D-5). 이 TTL 캐시는 부분 장애의 영향 범위를 줄이는 완화책이며, 완전 장애(scrape 자체
 * 실패)는 위 sentinel 정정에서 설명한 대로 {@code absent()} 가드가 담당한다.
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
     *
     * <p>이 값이 Prometheus/CloudWatch 에 실제로 도달하는 것은 쿼리 실행 자체가 실패하는 부분
     * 장애로 한정된다 — DB 완전 장애(커넥션 획득 자체 불가) 시의 실제 발화 경로는 클래스 Javadoc
     * "#863 N-1 정정" 항목 참조({@code absent()} 가드가 최종 방어선).
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
     * <p>이 메서드 자체는 항상 이 계약대로 동작한다(라이브 실측 — DB 완전 장애 중에도 이 메서드의
     * WARN 로그가 실제로 반복 기록됐다). 다만 DB 완전 장애에서는 이 메서드가 호출되는 게이지 콜백
     * 자체가 Hikari 커넥션 획득 대기에서 먼저 막혀 scrape HTTP 응답이 완성되지 못할 수 있다 —
     * 이 경우 이 메서드가 만든 sentinel 값은 Prometheus 에 도달하지 못한다. 클래스 Javadoc
     * "#863 N-1 정정" 항목 참조.
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
