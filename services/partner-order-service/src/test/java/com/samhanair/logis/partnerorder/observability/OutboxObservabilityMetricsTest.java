package com.samhanair.logis.partnerorder.observability;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.partnerorder.repository.SlipPublishOutboxRepository;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * {@link OutboxObservabilityMetrics} 순수 단위 테스트 — 실제 {@link SimpleMeterRegistry} 로
 * {@code Gauge.builder(...).register(...)} 콜백 배선 자체를 실행해 검증한다(Micrometer 를 흉내
 * 내지 않고 진짜로 돌린다 — 이래야 register() 삭제·private 메서드 상수화 mutation 을 잡는다).
 *
 * <p>이 클래스가 잡는 mutation: 생성자의 {@code Gauge.builder(...).register(...)} 3종 삭제(아래
 * 모든 {@code meterRegistry.get(...).gauge()} 조회가 {@code MeterNotFoundException} 으로 즉시
 * RED), {@code pendingDepth()} → {@code return 0} 상수화
 * ({@link #pendingDepthGauge_reflectsRepositoryValue()} 가 0이 아닌 값을 mock 해 RED).
 *
 * <p>추가로 #863 R1 HIGH-1(NaN 침묵 방지)과 MED(TTL 캐시)를 자체 검증한다 — 둘 다 R1 라운드에서
 * 새로 도입한 동작이라 원본 PR 에는 대응하는 mutation 목록이 없다.
 */
class OutboxObservabilityMetricsTest {

    private final SlipPublishOutboxRepository outboxRepository = mock(SlipPublishOutboxRepository.class);

    @Test
    @DisplayName("게이지 3종이 생성자에서 실제로 register 된다 — register() 삭제 시 MeterNotFoundException")
    void constructor_registersAllThreeGauges() {
        SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
        new OutboxObservabilityMetrics(outboxRepository, meterRegistry, Clock.systemUTC());

        assertThat(meterRegistry.get(OutboxObservabilityMetrics.PENDING_DEPTH).gauge()).isNotNull();
        assertThat(meterRegistry.get(OutboxObservabilityMetrics.OLDEST_PENDING_AGE).gauge()).isNotNull();
        assertThat(meterRegistry.get(OutboxObservabilityMetrics.SCHEDULER_HEARTBEAT).gauge()).isNotNull();
    }

    @Test
    @DisplayName("outbox_pending_depth 게이지는 repository 값을 그대로 반영한다 — pendingDepth()가 return 0으로 상수화되면 RED")
    void pendingDepthGauge_reflectsRepositoryValue() {
        when(outboxRepository.countPendingDepth()).thenReturn(7L);
        SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
        new OutboxObservabilityMetrics(outboxRepository, meterRegistry, Clock.systemUTC());

        double depth = meterRegistry.get(OutboxObservabilityMetrics.PENDING_DEPTH).gauge().value();

        assertThat(depth).as("mock이 7을 반환하므로 게이지도 7이어야 한다 — 상수화 mutation은 0을 반환해 RED").isEqualTo(7.0);
    }

    @Test
    @DisplayName("HIGH-1: pendingDepth 조회가 예외를 던지면 NaN이 아니라 fail-loud sentinel을 반환한다")
    void pendingDepthGauge_returnsSentinel_notNaN_whenRepositoryThrows() {
        when(outboxRepository.countPendingDepth())
                .thenThrow(new org.springframework.dao.QueryTimeoutException("DB 장애 시뮬레이션"));
        SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
        new OutboxObservabilityMetrics(outboxRepository, meterRegistry, Clock.systemUTC());

        double depth = meterRegistry.get(OutboxObservabilityMetrics.PENDING_DEPTH).gauge().value();

        assertThat(depth)
                .as("Micrometer 기본 동작(NaN)이면 NaN>0이 false라 PendingBacklog 알람이 DB 장애를 영원히 못 잡는다."
                        + " sentinel은 임계값 0보다 항상 커야 한다")
                .isNotNaN()
                .isGreaterThan(0d)
                .isEqualTo(OutboxObservabilityMetrics.QUERY_FAILURE_SENTINEL);
    }

    @Test
    @DisplayName("HIGH-1: oldestPendingAgeSeconds 조회가 예외를 던지면 NaN이 아니라 fail-loud sentinel(임계값 86100 초과)을 반환한다")
    void oldestPendingAgeGauge_returnsSentinel_notNaN_whenRepositoryThrows() {
        when(outboxRepository.oldestPendingAgeSeconds())
                .thenThrow(new org.springframework.dao.QueryTimeoutException("DB 장애 시뮬레이션"));
        SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
        new OutboxObservabilityMetrics(outboxRepository, meterRegistry, Clock.systemUTC());

        double age = meterRegistry.get(OutboxObservabilityMetrics.OLDEST_PENDING_AGE).gauge().value();

        assertThat(age)
                .isNotNaN()
                .as("Prometheus/CloudWatch 양쪽 OldestPendingTooOld 임계값(72000)보다 커야 알람이 발화한다")
                .isGreaterThan(72_000d);
    }

    @Test
    @DisplayName("MED: TTL(15초) 이내 재조회는 캐시된 값을 반환하고 repository를 다시 호출하지 않는다")
    void pendingDepthGauge_usesCacheWithinTtl() {
        when(outboxRepository.countPendingDepth()).thenReturn(3L);
        MutableClock clock = new MutableClock(Instant.parse("2026-07-21T00:00:00Z"), ZoneOffset.UTC);
        SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
        new OutboxObservabilityMetrics(outboxRepository, meterRegistry, clock);

        double first = meterRegistry.get(OutboxObservabilityMetrics.PENDING_DEPTH).gauge().value();
        clock.advance(Duration.ofSeconds(5));
        double second = meterRegistry.get(OutboxObservabilityMetrics.PENDING_DEPTH).gauge().value();

        assertThat(first).isEqualTo(3.0);
        assertThat(second).as("TTL(15초) 이내라 캐시된 값을 반환해야 한다").isEqualTo(3.0);
        verify(outboxRepository, times(1)).countPendingDepth();
    }

    @Test
    @DisplayName("MED: TTL(15초) 경과 후 재조회는 repository를 다시 호출한다")
    void pendingDepthGauge_refetchesAfterTtlExpires() {
        when(outboxRepository.countPendingDepth()).thenReturn(3L, 9L);
        MutableClock clock = new MutableClock(Instant.parse("2026-07-21T00:00:00Z"), ZoneOffset.UTC);
        SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
        new OutboxObservabilityMetrics(outboxRepository, meterRegistry, clock);

        double first = meterRegistry.get(OutboxObservabilityMetrics.PENDING_DEPTH).gauge().value();
        clock.advance(Duration.ofSeconds(16));
        double second = meterRegistry.get(OutboxObservabilityMetrics.PENDING_DEPTH).gauge().value();

        assertThat(first).isEqualTo(3.0);
        assertThat(second).as("TTL 경과 후에는 새 값(9)을 반영해야 한다").isEqualTo(9.0);
        verify(outboxRepository, times(2)).countPendingDepth();
    }

    @Test
    @DisplayName("MED: 느린 성공 조회의 TTL은 조회 완료 시점부터 시작한다")
    void pendingDepthGauge_startsTtlAfterSuccessfulQueryCompletes() {
        MutableClock clock = new MutableClock(Instant.parse("2026-07-21T00:00:00Z"), ZoneOffset.UTC);
        when(outboxRepository.countPendingDepth()).thenAnswer(invocation -> {
            clock.advance(Duration.ofSeconds(16));
            return 3L;
        }).thenReturn(9L);
        SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
        new OutboxObservabilityMetrics(outboxRepository, meterRegistry, clock);

        double first = meterRegistry.get(OutboxObservabilityMetrics.PENDING_DEPTH).gauge().value();
        double second = meterRegistry.get(OutboxObservabilityMetrics.PENDING_DEPTH).gauge().value();

        assertThat(first).isEqualTo(3.0);
        assertThat(second)
                .as("조회가 완료된 시점부터 15초 이내이므로 느린 성공 조회값을 재사용해야 한다")
                .isEqualTo(3.0);
        verify(outboxRepository, times(1)).countPendingDepth();
    }

    @Test
    @DisplayName("MED: 조회 실패는 캐시하지 않는다 — 다음 호출에서 즉시 재시도해 복구를 빠르게 감지한다")
    void pendingDepthGauge_doesNotCacheFailures() {
        when(outboxRepository.countPendingDepth())
                .thenThrow(new org.springframework.dao.QueryTimeoutException("DB 장애"))
                .thenReturn(5L);
        MutableClock clock = new MutableClock(Instant.parse("2026-07-21T00:00:00Z"), ZoneOffset.UTC);
        SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
        new OutboxObservabilityMetrics(outboxRepository, meterRegistry, clock);

        double first = meterRegistry.get(OutboxObservabilityMetrics.PENDING_DEPTH).gauge().value();
        // TTL 을 진행시키지 않고(같은 clock) 바로 재조회 — 실패가 캐시됐다면 sentinel 이 그대로 나온다.
        double second = meterRegistry.get(OutboxObservabilityMetrics.PENDING_DEPTH).gauge().value();

        assertThat(first).isEqualTo(OutboxObservabilityMetrics.QUERY_FAILURE_SENTINEL);
        assertThat(second).as("실패는 캐시되지 않아 바로 다음 호출에서 복구값(5)을 반영해야 한다").isEqualTo(5.0);
    }

    @Test
    @DisplayName("markSchedulerTick 호출 전에는 heartbeat가 생성 시점부터의 경과 초를 보고한다")
    void schedulerHeartbeatGauge_reflectsElapsedTimeSinceConstruction() {
        MutableClock clock = new MutableClock(Instant.parse("2026-07-21T00:00:00Z"), ZoneOffset.UTC);
        SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
        new OutboxObservabilityMetrics(outboxRepository, meterRegistry, clock);

        clock.advance(Duration.ofSeconds(700));
        double heartbeat = meterRegistry.get(OutboxObservabilityMetrics.SCHEDULER_HEARTBEAT).gauge().value();

        assertThat(heartbeat).isEqualTo(700.0);
    }

    @Test
    @DisplayName("markSchedulerTick 호출 시 heartbeat가 0 근처로 리셋된다")
    void markSchedulerTick_resetsHeartbeat() {
        MutableClock clock = new MutableClock(Instant.parse("2026-07-21T00:00:00Z"), ZoneOffset.UTC);
        SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
        OutboxObservabilityMetrics metrics = new OutboxObservabilityMetrics(outboxRepository, meterRegistry, clock);
        clock.advance(Duration.ofSeconds(700));

        metrics.markSchedulerTick();
        double heartbeat = meterRegistry.get(OutboxObservabilityMetrics.SCHEDULER_HEARTBEAT).gauge().value();

        assertThat(heartbeat).isZero();
    }

    /** 테스트 전용 가변 {@link Clock} — TTL 캐시·heartbeat 경과시간을 결정적으로 검증하기 위함. */
    private static final class MutableClock extends Clock {
        private Instant instant;
        private final ZoneId zone;

        MutableClock(Instant instant, ZoneId zone) {
            this.instant = instant;
            this.zone = zone;
        }

        void advance(Duration duration) {
            instant = instant.plus(duration);
        }

        @Override
        public ZoneId getZone() {
            return zone;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return new MutableClock(instant, zone);
        }

        @Override
        public Instant instant() {
            return instant;
        }
    }
}
