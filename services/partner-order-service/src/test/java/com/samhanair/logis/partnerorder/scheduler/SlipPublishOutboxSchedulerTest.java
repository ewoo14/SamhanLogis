package com.samhanair.logis.partnerorder.scheduler;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.RETURNS_DEEP_STUBS;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.partnerorder.config.OutboxProperties;
import com.samhanair.logis.partnerorder.observability.OutboxObservabilityMetrics;
import com.samhanair.logis.partnerorder.outbox.SlipPublishOutbox;
import com.samhanair.logis.partnerorder.repository.SlipPublishOutboxRepository;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

/**
 * {@link SlipPublishOutboxScheduler} 순수 단위 테스트 — DB/Spring 컨텍스트 없이 Mockito mock 으로
 * heartbeat 갱신 순서(#863 R1 HIGH-1)를 검증한다.
 *
 * <p>이 클래스가 잡는 mutation: {@code retryPending()} 에서 {@code markSchedulerTick()} 호출을
 * 완전히 삭제하는 mutation 은 {@link #retryPending_marksHeartbeat_whenClaimSucceeds()} 가,
 * {@code markSchedulerTick()} 을 {@code claimReadyBatch()} 호출보다 앞으로 되돌리는 회귀는
 * {@link #retryPending_doesNotMarkHeartbeat_whenClaimThrows()} 가 잡는다.
 *
 * <p>R1 원문: "DB 가 죽어 매 tick 예외를 던져도 heartbeat 는 계속 갱신 → 정상으로 보임" — claim
 * 이전에 markSchedulerTick 을 호출하면 DB 장애 tick 도 heartbeat 를 갱신시켜 SchedulerStalled
 * 알람이 DB 장애를 영원히 못 잡는다. claim 이 성공(빈 리스트 포함)한 뒤에만 heartbeat 를 갱신해야
 * "돌던 scheduler 가 멈췄다"는 양성 신호가 된다.
 */
class SlipPublishOutboxSchedulerTest {

    private final SlipPublishOutboxRepository outboxRepository = mock(SlipPublishOutboxRepository.class);
    private final SlipPublishOutboxProcessor processor = mock(SlipPublishOutboxProcessor.class);
    private final SlipPublishOutboxResultWriter resultWriter =
            mock(SlipPublishOutboxResultWriter.class, RETURNS_DEEP_STUBS);
    private final OutboxProperties outboxProperties = new OutboxProperties();
    private final OutboxObservabilityMetrics observabilityMetrics = mock(OutboxObservabilityMetrics.class);

    private final SlipPublishOutboxScheduler scheduler = new SlipPublishOutboxScheduler(
            outboxRepository, processor, resultWriter, outboxProperties, observabilityMetrics);

    @Test
    @DisplayName("HIGH-1: claim(DB 접근)이 성공하면(후보 0건 포함) heartbeat를 갱신한다")
    void retryPending_marksHeartbeat_whenClaimSucceeds() {
        when(outboxRepository.claimReadyBatch(anyInt(), anyInt())).thenReturn(List.of());

        scheduler.retryPending();

        verify(observabilityMetrics, times(1)).markSchedulerTick();
    }

    @Test
    @DisplayName("HIGH-1 핵심: claim이 예외를 던지면(DB 장애) heartbeat를 갱신하지 않는다 — "
            + "claim 이전에 갱신하면 DB 장애 tick도 heartbeat가 살아있는 것처럼 보여 SchedulerStalled가 못 잡는다")
    void retryPending_doesNotMarkHeartbeat_whenClaimThrows() {
        when(outboxRepository.claimReadyBatch(anyInt(), anyInt()))
                .thenThrow(new org.springframework.dao.QueryTimeoutException("DB 장애 시뮬레이션"));

        // @Scheduled 메서드가 던지는 예외는 Spring 의 기본 LoggingErrorHandler 가 흡수하지만, 이
        // 단위 테스트는 스케줄러 인프라 없이 메서드를 직접 호출하므로 예외가 그대로 전파된다 —
        // 이는 claim 실패 시 정상적인 동작이다(예외 자체를 삼키지 않음).
        assertThatThrownBy(scheduler::retryPending)
                .isInstanceOf(org.springframework.dao.QueryTimeoutException.class);

        verify(observabilityMetrics, never()).markSchedulerTick();
    }

    @Test
    @DisplayName("HIGH-1 순서: claimReadyBatch 호출이 markSchedulerTick 호출보다 먼저 일어난다")
    void retryPending_callsClaimBeforeMarkingHeartbeat() {
        when(outboxRepository.claimReadyBatch(anyInt(), anyInt())).thenReturn(List.of());

        scheduler.retryPending();

        InOrder order = inOrder(outboxRepository, observabilityMetrics);
        order.verify(outboxRepository).claimReadyBatch(anyInt(), anyInt());
        order.verify(observabilityMetrics).markSchedulerTick();
    }

    @Test
    @DisplayName("후보가 있으면 각 row에 대해 expireIfExhausted 선검사 후 processor.processOne을 호출한다")
    void retryPending_processesEachCandidate() {
        SlipPublishOutbox row = SlipPublishOutbox.queue(UUID.randomUUID(), "PO-1", "{}");
        when(outboxRepository.claimReadyBatch(anyInt(), anyInt())).thenReturn(List.of(row));
        when(resultWriter.expireIfExhausted(row.getId())).thenReturn(false);

        assertThatCode(scheduler::retryPending).doesNotThrowAnyException();

        verify(observabilityMetrics, times(1)).markSchedulerTick();
        verify(processor, times(1)).processOne(row);
    }
}
