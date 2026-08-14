package com.samhanair.logis.slip.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.samhanair.logis.slip.domain.CompensationOperation;
import com.samhanair.logis.slip.domain.CompensationPhase;
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.SerialCompensationFailure;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.repository.SerialCompensationFailureRepository;
import com.samhanair.logis.slip.service.CompensationRetryExecutor.Outcome;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * CompensationRetryService 오케스트레이션 단위 테스트 — 혼합 배치 집계 검증. (D-SER-27)
 */
@ExtendWith(MockitoExtension.class)
class CompensationRetryServiceTest {

    private static final Clock CLOCK =
            Clock.fixed(Instant.parse("2026-06-03T01:00:00Z"), ZoneId.of("Asia/Seoul"));

    @Mock
    private SerialCompensationFailureRepository repository;

    @Mock
    private CompensationRetryExecutor executor;

    private SerialCompensationFailure candidate(String suffix, CompensationOperation op) {
        Slip slip = Slip.createOutbound("2026/06/03-RETRY-" + suffix, LocalDate.of(2026, 6, 3), 1,
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "삼한", DeliveryTag.SALE, null, "u");
        ReflectionTestUtils.setField(slip, "id", UUID.randomUUID());
        SerialCompensationFailure f = SerialCompensationFailure.of(slip, CompensationPhase.ACCEPT_RESERVE,
                "AC-" + suffix, op, "보상 실패", "원본 실패", LocalDateTime.of(2026, 6, 3, 10, 0));
        ReflectionTestUtils.setField(f, "id", UUID.randomUUID());
        return f;
    }

    @Test
    void mixedBatch_tallies_succeeded_failed_skipped_gone() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        CompensationMetrics metrics = new CompensationMetrics(registry);
        SerialCompensationFailure s = candidate("S", CompensationOperation.RELEASE_INSTANCES);
        SerialCompensationFailure f = candidate("F", CompensationOperation.UNRECALL_INSTANCES);
        SerialCompensationFailure k = candidate("K", CompensationOperation.RELEASE);
        SerialCompensationFailure g = candidate("G", CompensationOperation.RELEASE_INSTANCES);
        when(repository.findRetryCandidates(eq(5), any())).thenReturn(List.of(s, f, k, g));
        when(executor.retryOne(eq(s.getId()), any(), anyLong())).thenReturn(Outcome.SUCCEEDED);
        when(executor.retryOne(eq(f.getId()), any(), anyLong())).thenReturn(Outcome.FAILED);
        when(executor.retryOne(eq(k.getId()), any(), anyLong())).thenReturn(Outcome.SKIPPED);
        when(executor.retryOne(eq(g.getId()), any(), anyLong())).thenReturn(Outcome.GONE);

        CompensationRetryService service = new CompensationRetryService(repository, executor, metrics, CLOCK);
        CompensationRetryService.RetryResult result = service.retryEligible(5, 10);

        // 후보 4 / 시도 2(성공+실패) / 성공 1 / 실패 1 / 스킵 1 / GONE 은 집계 제외
        assertThat(result.candidates()).isEqualTo(4);
        assertThat(result.attempted()).isEqualTo(2);
        assertThat(result.succeeded()).isEqualTo(1);
        assertThat(result.failed()).isEqualTo(1);
        assertThat(result.skipped()).isEqualTo(1);
        assertThat(retryCount(registry, Outcome.SUCCEEDED)).isEqualTo(1);
        assertThat(retryCount(registry, Outcome.FAILED)).isEqualTo(1);
        assertThat(retryCount(registry, Outcome.SKIPPED)).isEqualTo(1);
        assertThat(retryCount(registry, Outcome.GONE)).isEqualTo(1);
    }

    @Test
    void noCandidates_returnsZero_noExecutorCall() {
        when(repository.findRetryCandidates(eq(5), any())).thenReturn(List.of());

        CompensationRetryService service =
                new CompensationRetryService(repository, executor, new CompensationMetrics(new SimpleMeterRegistry()),
                        CLOCK);
        CompensationRetryService.RetryResult result = service.retryEligible(5, 10);

        assertThat(result.candidates()).isZero();
        verifyNoInteractions(executor);
    }

    @Test
    void passesNowAndBackoffToExecutor() {
        SerialCompensationFailure s = candidate("S", CompensationOperation.RELEASE_INSTANCES);
        when(repository.findRetryCandidates(eq(5), any())).thenReturn(List.of(s));
        when(executor.retryOne(eq(s.getId()), any(), anyLong())).thenReturn(Outcome.SUCCEEDED);

        new CompensationRetryService(repository, executor, new CompensationMetrics(new SimpleMeterRegistry()), CLOCK)
                .retryEligible(5, 10);

        verify(executor).retryOne(eq(s.getId()), eq(LocalDateTime.now(CLOCK)), eq(10L));
    }

    private double retryCount(SimpleMeterRegistry registry, Outcome outcome) {
        return registry.get(CompensationMetrics.COMPENSATION_RETRY_TOTAL)
                .tag("outcome", outcome.name())
                .counter()
                .count();
    }
}
