package com.samhanair.logis.partnerorder.scheduler;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.partnerorder.client.SlipServiceClient.PublishResult;
import com.samhanair.logis.partnerorder.config.OutboxProperties;
import com.samhanair.logis.partnerorder.outbox.OutboxStatus;
import com.samhanair.logis.partnerorder.outbox.SlipPublishOutbox;
import com.samhanair.logis.partnerorder.repository.PartnerOrderHistoryRepository;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.repository.SlipPublishOutboxRepository;
import com.samhanair.logis.partnerorder.realtime.PartnerOrderAuthorityEventPublisher;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Meter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * {@link SlipPublishOutboxResultWriter} 순수 단위 테스트 — DB/Spring 컨텍스트 없이 repository 를 전부
 * Mockito mock 으로 구성해 (1) HIGH-1a eager 계측 등록, (2) MED afterCommit 계측/경보 지연, (3) 미커버
 * 방어 분기(claim-row 부재, 계측 backend 장애, 연결 주문 부재)를 검증한다 (#854 R5).
 *
 * <p>{@link SlipPublishOutbox} 는 claim(native SQL)으로만 PROCESSING 에 도달하도록 설계되어 있어
 * (도메인 메서드 없음) fixture 를 PROCESSING 으로 세팅할 도메인 API 가 존재하지 않는다.
 * {@link ReflectionTestUtils} 로 상태를 직접 세팅한다 — 이 리포에서 test fixture 세팅 목적의 리플렉션은
 * 이미 폭넓게 쓰이는 관용구다({@code ReflectionTestUtils} 사용처 다수). 프로덕션 코드의 상태 변경은
 * 여전히 도메인 메서드만 사용한다.
 */
class SlipPublishOutboxResultWriterTest {

    private static final String TERMINAL_METRIC_NAME = "partner_order_slip_publish_terminal";

    private final SlipPublishOutboxRepository outboxRepository = mock(SlipPublishOutboxRepository.class);
    private final PartnerOrderRepository orderRepository = mock(PartnerOrderRepository.class);
    private final PartnerOrderHistoryRepository historyRepository = mock(PartnerOrderHistoryRepository.class);
    private final OutboxProperties outboxProperties = new OutboxProperties();
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final PartnerOrderAuthorityEventPublisher authorityEventPublisher =
            mock(PartnerOrderAuthorityEventPublisher.class);

    @Test
    @DisplayName("HIGH-1a: 4개 reason 전부 생성자 시점에 값 0으로 사전 등록된다(지연 등록이면 첫 이벤트가 1로 탄생)")
    void constructor_eagerlyRegistersAllFourTerminalReasonsAtZero() {
        SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();

        newWriter(meterRegistry);

        for (String reason : List.of("committed", "invalid_input", "conflict", "max_retry_exhausted")) {
            Counter counter = meterRegistry.find(TERMINAL_METRIC_NAME).tag("reason", reason).counter();
            assertThat(counter)
                    .as("reason=%s 는 생성자 시점에 이미 등록되어 있어야 한다(지연 등록이면 null)", reason)
                    .isNotNull();
            assertThat(counter.count()).as("reason=%s 초기값", reason).isZero();
        }
    }

    @Test
    @DisplayName("expireIfExhausted 방어: claim 소유권을 잃은(PROCESSING 아님/존재하지 않는) row 는 false 를 반환한다")
    void expireIfExhausted_returnsFalseWhenRowNotProcessingOrMissing() {
        SlipPublishOutboxResultWriter writer = newWriter(new SimpleMeterRegistry());
        UUID pendingRowId = UUID.randomUUID();
        SlipPublishOutbox pendingRow = SlipPublishOutbox.queue(UUID.randomUUID(), "PO-PENDING", "{}");
        when(outboxRepository.findWithLockById(pendingRowId)).thenReturn(Optional.of(pendingRow));
        UUID missingRowId = UUID.randomUUID();
        when(outboxRepository.findWithLockById(missingRowId)).thenReturn(Optional.empty());

        assertThat(writer.expireIfExhausted(pendingRowId))
                .as("PENDING(비 PROCESSING) row 는 소유권이 없어 false").isFalse();
        assertThat(writer.expireIfExhausted(missingRowId))
                .as("존재하지 않는 row 도 false").isFalse();
        verify(outboxRepository, never()).save(any());
    }

    @Test
    @DisplayName("recordTerminal 계측 backend 장애: increment() 가 예외를 던져도 commitSuccess 는 outbox 를 COMMITTED 로 저장하고 예외 없이 반환한다")
    void commitSuccess_completesAndPersistsEvenWhenMetricsIncrementThrows() {
        UUID outboxId = UUID.randomUUID();
        SlipPublishOutbox row = processingFixture(outboxId);
        when(outboxRepository.findWithLockById(outboxId)).thenReturn(Optional.of(row));
        when(orderRepository.findById(row.getPartnerOrderId())).thenReturn(Optional.empty());
        SlipPublishOutboxResultWriter writer = newWriter(new ThrowingCounterMeterRegistry());

        // recordTerminal 의 try/catch 가 없으면 계측 예외가 commitSuccess 밖으로 전파되어 이 단언이 RED.
        assertThatCode(() -> writer.commitSuccess(outboxId, PublishResult.published("SLIP-TEST-1")))
                .doesNotThrowAnyException();

        verify(outboxRepository).save(argThat(saved -> saved.getStatus() == OutboxStatus.COMMITTED));
    }

    @Test
    void commitSuccess_publishes_one_authority_event_for_existing_order() {
        UUID outboxId = UUID.randomUUID();
        UUID orderId = UUID.randomUUID();
        SlipPublishOutbox row = processingFixture(outboxId);
        ReflectionTestUtils.setField(row, "partnerOrderId", orderId);
        com.samhanair.logis.partnerorder.domain.PartnerOrder order =
                com.samhanair.logis.partnerorder.domain.PartnerOrder.createFromConfirm(
                        "P001", "1234567890", "2026/08/07-OUTBOX-1", "idem-" + orderId,
                        java.math.BigDecimal.ZERO);
        ReflectionTestUtils.setField(order, "id", orderId);
        when(outboxRepository.findWithLockById(outboxId)).thenReturn(Optional.of(row));
        when(orderRepository.findById(orderId)).thenReturn(Optional.of(order));
        SlipPublishOutboxResultWriter writer = newWriter(new SimpleMeterRegistry());

        writer.commitSuccess(outboxId, PublishResult.published("SLIP-OUTBOX-1"));

        verify(authorityEventPublisher).publish(orderId, "OUTBOX_COMMITTED", null);
    }

    @Test
    @DisplayName("markFailedPermanent 방어: 연결된 주문이 없어도(정합 사고) outbox 는 FAILED 로 저장되고 예외 없이 반환하며 history 는 저장되지 않는다")
    void expireIfExhausted_completesAndPersistsFailedEvenWhenOrderMissing() {
        UUID outboxId = UUID.randomUUID();
        SlipPublishOutbox row = processingFixture(outboxId);
        ReflectionTestUtils.setField(row, "firstAttemptedAt",
                LocalDateTime.now().minusHours(outboxProperties.getMaxRetryHours() + 1L));
        when(outboxRepository.findWithLockById(outboxId)).thenReturn(Optional.of(row));
        when(orderRepository.findById(row.getPartnerOrderId())).thenReturn(Optional.empty());
        SlipPublishOutboxResultWriter writer = newWriter(new SimpleMeterRegistry());

        // 예외가 나면(order-missing 방어 누락 등) 이 호출 자체가 테스트를 실패시킨다 — 별도 doesNotThrow
        // wrapper 없이 boolean 반환값을 직접 받는다.
        boolean expired = writer.expireIfExhausted(outboxId);

        assertThat(expired).as("만료 조건을 만족하면 종결시켰다는 true 를 반환해야 한다").isTrue();
        verify(outboxRepository).save(argThat(saved -> saved.getStatus() == OutboxStatus.FAILED));
        verify(historyRepository, never()).save(any());
    }

    @Test
    @DisplayName("afterCommit 지연: 활성 트랜잭션 동기화가 있으면 commit 확정 전에는 counter 가 증가하지 않는다")
    void commitSuccess_defersMetricIncrementUntilAfterCommit() {
        UUID outboxId = UUID.randomUUID();
        SlipPublishOutbox row = processingFixture(outboxId);
        when(outboxRepository.findWithLockById(outboxId)).thenReturn(Optional.of(row));
        when(orderRepository.findById(row.getPartnerOrderId())).thenReturn(Optional.empty());
        SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
        SlipPublishOutboxResultWriter writer = newWriter(meterRegistry);

        TransactionSynchronizationManager.initSynchronization();
        try {
            writer.commitSuccess(outboxId, PublishResult.published("SLIP-TEST-2"));

            // recordTerminal 을 afterCommit 으로 옮기지 않고 즉시 실행하면 이 시점에 이미 1이라 RED.
            assertThat(meterRegistry.find(TERMINAL_METRIC_NAME).tag("reason", "committed").counter().count())
                    .as("commit 확정 전에는 아직 증가하지 않아야 한다").isZero();

            List<TransactionSynchronization> syncs = TransactionSynchronizationManager.getSynchronizations();
            assertThat(syncs).as("계측 지연 등록이 정확히 1건이어야 한다").hasSize(1);
            syncs.get(0).afterCommit();
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }

        assertThat(meterRegistry.find(TERMINAL_METRIC_NAME).tag("reason", "committed").counter().count())
                .as("afterCommit 호출 후에는 증가해야 한다").isEqualTo(1.0);
    }

    @Test
    @DisplayName("afterCommit fallback: 활성 트랜잭션 동기화가 없으면 기존처럼 즉시 counter 를 증가시킨다")
    void commitSuccess_incrementsImmediatelyWhenNoActiveSynchronization() {
        UUID outboxId = UUID.randomUUID();
        SlipPublishOutbox row = processingFixture(outboxId);
        when(outboxRepository.findWithLockById(outboxId)).thenReturn(Optional.of(row));
        when(orderRepository.findById(row.getPartnerOrderId())).thenReturn(Optional.empty());
        SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
        SlipPublishOutboxResultWriter writer = newWriter(meterRegistry);

        assertThat(TransactionSynchronizationManager.isSynchronizationActive())
                .as("이 테스트는 활성 동기화가 없는 상태를 전제한다").isFalse();

        writer.commitSuccess(outboxId, PublishResult.published("SLIP-TEST-3"));

        assertThat(meterRegistry.find(TERMINAL_METRIC_NAME).tag("reason", "committed").counter().count())
                .isEqualTo(1.0);
    }

    private SlipPublishOutboxResultWriter newWriter(MeterRegistry meterRegistry) {
        return new SlipPublishOutboxResultWriter(
                outboxRepository, orderRepository, historyRepository, outboxProperties, objectMapper,
                meterRegistry, authorityEventPublisher);
    }

    /** claim(native SQL)으로만 도달 가능한 PROCESSING 상태를 리플렉션으로 재현한 fixture. */
    private static SlipPublishOutbox processingFixture(UUID id) {
        SlipPublishOutbox row = SlipPublishOutbox.queue(UUID.randomUUID(), "PO-TEST-" + id, "{}");
        ReflectionTestUtils.setField(row, "id", id);
        ReflectionTestUtils.setField(row, "status", OutboxStatus.PROCESSING);
        return row;
    }

    /** {@code newCounter} 가 반환하는 모든 Counter 의 {@code increment()} 가 예외를 던지는 테스트 전용 registry. */
    private static final class ThrowingCounterMeterRegistry extends SimpleMeterRegistry {
        @Override
        protected Counter newCounter(Meter.Id id) {
            return new Counter() {
                @Override
                public void increment(double amount) {
                    throw new IllegalStateException("계측 backend 장애 강제 주입(테스트)");
                }

                @Override
                public double count() {
                    return 0;
                }

                @Override
                public Meter.Id getId() {
                    return id;
                }
            };
        }
    }
}
