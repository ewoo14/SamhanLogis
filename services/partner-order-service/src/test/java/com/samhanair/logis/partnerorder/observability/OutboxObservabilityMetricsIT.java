package com.samhanair.logis.partnerorder.observability;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import com.samhanair.logis.partnerorder.PartnerOrderServiceApplication;
import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.it.AbstractPostgresIT;
import com.samhanair.logis.partnerorder.outbox.OutboxStatus;
import com.samhanair.logis.partnerorder.outbox.SlipPublishOutbox;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.repository.SlipPublishOutboxRepository;
import com.samhanair.logis.partnerorder.scheduler.SlipPublishOutboxScheduler;
import io.micrometer.core.instrument.MeterRegistry;
import java.math.BigDecimal;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * #863 R1 MED — outbox 관측 게이지·쿼리·heartbeat 실 Postgres 산출 IT.
 *
 * <p>R1 적대검증이 지목한 대로 이 슬라이스는 게이지·SQL·heartbeat 를 건드리는 테스트가 0건이었고,
 * 뮤테이션 4종이 전부 생존했다. 아래 테스트들은 그 4종을 개별로 RED 처리하도록 설계했다:
 * <ul>
 *   <li>{@code SlipPublishOutboxScheduler.retryPending()} 의 {@code markSchedulerTick()} 호출 삭제
 *       → {@link #retryPending_withNoCandidates_stillMarksSchedulerTick()}</li>
 *   <li>{@code OutboxObservabilityMetrics} 생성자의 {@code Gauge.builder(...).register(...)} 삭제
 *       → 아래 게이지 조회 테스트들이 {@code MeterNotFoundException} 으로 즉시 RED</li>
 *   <li>{@code SlipPublishOutboxRepository} 쿼리의 {@code IN ('PENDING','PROCESSING')} →
 *       {@code IN ('PENDING')} 축소 → {@link #countPendingDepth_countsOnlyPendingAndProcessing()}
 *       및 {@link #oldestPendingAgeSeconds_reflectsOldestAcrossPendingAndProcessing()} (오래된 행을
 *       일부러 PROCESSING 으로 시딩해 depth 테스트와 독립적으로 이 mutation 을 잡는다)</li>
 *   <li>{@code OutboxObservabilityMetrics.pendingDepth()} → {@code return 0} 상수화 →
 *       {@link #pendingDepthGauge_isRegisteredAndReflectsDbState()}</li>
 * </ul>
 *
 * <p>게이지는 in-JVM registry 델타가 아니라 {@link MeterRegistry#get(String)} 을 통해 실제 등록된
 * 값을 읽어 검증한다([[feedback_prometheus_rule_runtime_load_and_eager_counter]] 의 구조적
 * false-green 회피 원칙과 동일 사상).
 */
@SpringBootTest(classes = PartnerOrderServiceApplication.class)
class OutboxObservabilityMetricsIT extends AbstractPostgresIT {

    @Autowired
    private SlipPublishOutboxRepository outboxRepository;

    @Autowired
    private PartnerOrderRepository orderRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private SlipPublishOutboxScheduler scheduler;

    @Autowired
    private MeterRegistry meterRegistry;

    @SpyBean
    private OutboxObservabilityMetrics observabilityMetrics;

    /**
     * outbox/order 는 {@code BaseEntity} soft-delete(@SQLRestriction("is_deleted = false"))가
     * 적용돼 있어, 이미 soft-delete 된 행을 남기는 테스트(countPendingDepth_excludesSoftDeleted)
     * 뒤에는 {@code repository.deleteAll()}(내부적으로 findAll() 로 활성 행만 조회)이 그 행을 보지
     * 못해 지우지 못한다. 그 orphan outbox 가 남은 채 다음 테스트가 부모 partner_orders 를 지우려
     * 하면 FK 위반으로 죽으므로, 원자 JDBC DELETE 로 soft-delete 여부와 무관하게 정리한다. 순서는
     * FK 방향(outbox → line → order)과 동일하게 유지한다.
     */
    @BeforeEach
    void cleanDatabase() {
        jdbcTemplate.update("DELETE FROM slip_publish_outbox");
        jdbcTemplate.update("DELETE FROM partner_order_lines");
        jdbcTemplate.update("DELETE FROM partner_orders");
    }

    @Test
    @DisplayName("countPendingDepth: PENDING+PROCESSING 만 세고 FAILED/COMMITTED 는 제외한다")
    void countPendingDepth_countsOnlyPendingAndProcessing() {
        seedOutbox(OutboxStatus.PENDING);
        seedOutbox(OutboxStatus.PROCESSING);
        seedOutbox(OutboxStatus.FAILED);
        seedOutbox(OutboxStatus.COMMITTED);

        assertThat(outboxRepository.countPendingDepth())
                .as("PENDING+PROCESSING 2건만 집계 — IN 절이 PENDING 단독으로 축소되면 1로 RED")
                .isEqualTo(2L);
    }

    @Test
    @DisplayName("countPendingDepth: soft-delete 행은 집계에서 제외한다")
    void countPendingDepth_excludesSoftDeleted() {
        UUID id = seedOutbox(OutboxStatus.PENDING);
        jdbcTemplate.update("UPDATE slip_publish_outbox SET is_deleted = true WHERE id = ?", id);

        assertThat(outboxRepository.countPendingDepth()).isZero();
    }

    @Test
    @DisplayName("oldestPendingAgeSeconds: PENDING/PROCESSING 통틀어 가장 오래된 first_attempted_at 기준 경과 초를 반환한다")
    void oldestPendingAgeSeconds_reflectsOldestAcrossPendingAndProcessing() {
        // 가장 오래된 행을 일부러 PROCESSING 으로 시딩한다 — PENDING 으로만 시딩하면 IN 절이
        // ('PENDING','PROCESSING')→('PENDING') 으로 축소돼도 우연히 값이 맞아 mutation 이 생존한다.
        UUID oldestProcessing = seedOutbox(OutboxStatus.PROCESSING);
        seedOutbox(OutboxStatus.PENDING);
        jdbcTemplate.update(
                "UPDATE slip_publish_outbox SET first_attempted_at = now() - interval '1000 seconds' WHERE id = ?",
                oldestProcessing);

        double age = outboxRepository.oldestPendingAgeSeconds();

        assertThat(age)
                .as("가장 오래된 PROCESSING 행(1000초 전) 기준으로 계산돼야 한다 — IN 절 축소나 MIN 오적용 시 RED")
                .isCloseTo(1000.0, within(30.0));
    }

    @Test
    @DisplayName("oldestPendingAgeSeconds: 미처리 행이 없으면 0을 반환한다")
    void oldestPendingAgeSeconds_returnsZeroWhenNoPendingRows() {
        assertThat(outboxRepository.oldestPendingAgeSeconds()).isZero();
    }

    @Test
    @DisplayName("게이지 등록: MeterRegistry 에 outbox_pending_depth 가 실제로 등록되어 DB 상태(PROCESSING 포함)를 반영한다")
    void pendingDepthGauge_isRegisteredAndReflectsDbState() {
        seedOutbox(OutboxStatus.PENDING);
        seedOutbox(OutboxStatus.PROCESSING);

        double depth = meterRegistry.get(OutboxObservabilityMetrics.PENDING_DEPTH).gauge().value();

        assertThat(depth)
                .as("register() 가 삭제되면 이 조회 자체가 MeterNotFoundException 으로 실패한다."
                        + " pendingDepth() 가 return 0 으로 상수화되면 0.0 으로 RED")
                .isEqualTo(2.0);
    }

    @Test
    @DisplayName("게이지 등록: MeterRegistry 에 outbox_oldest_pending_age_seconds 가 실제로 등록된다")
    void oldestPendingAgeGauge_isRegisteredAndReflectsDbState() {
        UUID id = seedOutbox(OutboxStatus.PENDING);
        jdbcTemplate.update(
                "UPDATE slip_publish_outbox SET first_attempted_at = now() - interval '500 seconds' WHERE id = ?",
                id);

        double age = meterRegistry.get(OutboxObservabilityMetrics.OLDEST_PENDING_AGE).gauge().value();

        assertThat(age).isCloseTo(500.0, within(30.0));
    }

    @Test
    @DisplayName("게이지 등록: MeterRegistry 에 outbox_scheduler_heartbeat_seconds 가 실제로 등록된다")
    void schedulerHeartbeatGauge_isRegistered() {
        assertThat(meterRegistry.get(OutboxObservabilityMetrics.SCHEDULER_HEARTBEAT).gauge().value())
                .as("등록만 확인 — 절대값은 프로세스 기동 이후 경과시간에 의존")
                .isGreaterThanOrEqualTo(0.0);
    }

    @Test
    @DisplayName("heartbeat: 후보가 0건인 정상 claim 성공 tick도 markSchedulerTick을 호출한다")
    void retryPending_withNoCandidates_stillMarksSchedulerTick() {
        // BeforeEach 가 outbox 를 비웠으므로 claimReadyBatch 는 정상적으로 0건을 반환한다(DB 접근
        // 자체는 성공) — "claim 성공(후보 0건 포함)이면 tick" 계약을 실 Postgres 로 검증한다.
        // markSchedulerTick() 호출이 삭제되면 이 verify 가 0회 호출로 RED 된다. claim 자체가
        // 실패했을 때 markSchedulerTick 이 호출되지 않아야 하는 반대 경로(#863 R1 H-1)는
        // SlipPublishOutboxSchedulerTest(순수 mock 단위 테스트)가 담당한다 — 여기서는 실
        // DB claim 을 실패시킬 수 없다.
        scheduler.retryPending();

        verify(observabilityMetrics, times(1)).markSchedulerTick();
    }

    private UUID seedOutbox(OutboxStatus status) {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        PartnerOrder order = orderRepository.save(PartnerOrder.create(
                "P-863-" + suffix, "BIZ-" + suffix, "2026/07/21-" + suffix, "PO-863-" + suffix,
                BigDecimal.ZERO));
        SlipPublishOutbox outbox = outboxRepository.save(SlipPublishOutbox.queue(
                order.getId(), order.getIdempotencyKey(),
                "{\"partnerCode\":\"P-863-" + suffix + "\"}"));
        jdbcTemplate.update("UPDATE slip_publish_outbox SET status = ? WHERE id = ?",
                status.name(), outbox.getId());
        return outbox.getId();
    }
}
