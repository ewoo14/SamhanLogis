package com.samhanair.logis.slip.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.domain.CompensationOperation;
import com.samhanair.logis.slip.domain.CompensationPhase;
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.SerialCompensationFailure;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.repository.SerialCompensationFailureRepository;
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
 * CompensationRetryService 의 동작별 디스패치/스킵/백오프 단위 테스트. (D-SER-27)
 */
@ExtendWith(MockitoExtension.class)
class CompensationRetryServiceTest {

    private static final Clock CLOCK =
            Clock.fixed(Instant.parse("2026-06-03T01:00:00Z"), ZoneId.of("Asia/Seoul"));

    @Mock
    private SerialCompensationFailureRepository repository;

    @Mock
    private InventoryClient inventoryClient;

    private SerialCompensationFailure failure(String suffix, CompensationOperation op) {
        Slip slip = Slip.createOutbound("2026/06/03-RETRY-" + suffix, LocalDate.of(2026, 6, 3), 1,
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "삼한", DeliveryTag.DAY, null, "u");
        ReflectionTestUtils.setField(slip, "id", UUID.randomUUID());
        return SerialCompensationFailure.of(slip, CompensationPhase.ACCEPT_RESERVE, "AC-" + suffix,
                op, "보상 실패", "원본 실패", LocalDateTime.of(2026, 6, 3, 10, 0));
    }

    private CompensationRetryService service() {
        return new CompensationRetryService(repository, inventoryClient, CLOCK);
    }

    @Test
    void quantityOperation_isSkipped_noInventoryCall() {
        SerialCompensationFailure release = failure("Q", CompensationOperation.RELEASE);
        when(repository.findRetryCandidates(5, LocalDateTime.now(CLOCK))).thenReturn(List.of(release));

        CompensationRetryService.RetryResult result = service().retryEligible(5, 10);

        assertThat(result.skipped()).isEqualTo(1);
        assertThat(result.attempted()).isZero();
        verifyNoInteractions(inventoryClient);
        assertThat(release.isResolved()).isFalse();
    }

    @Test
    void releaseInstances_success_resolves() {
        SerialCompensationFailure f = failure("R", CompensationOperation.RELEASE_INSTANCES);
        when(repository.findRetryCandidates(5, LocalDateTime.now(CLOCK))).thenReturn(List.of(f));

        CompensationRetryService.RetryResult result = service().retryEligible(5, 10);

        verify(inventoryClient).releaseInstances("2026/06/03-RETRY-R", "AC-R");
        assertThat(result.succeeded()).isEqualTo(1);
        assertThat(f.isResolved()).isTrue();
        assertThat(f.getRetryCount()).isEqualTo(1);
    }

    @Test
    void failure_setsExponentialBackoff() {
        SerialCompensationFailure f = failure("F", CompensationOperation.UNRECALL_INSTANCES);
        // retryCount 를 2 로 만들어 백오프 = base * 2^2 = 40분 검증
        ReflectionTestUtils.setField(f, "retryCount", 2);
        when(repository.findRetryCandidates(5, LocalDateTime.now(CLOCK))).thenReturn(List.of(f));
        org.mockito.Mockito.doThrow(new RuntimeException("down"))
                .when(inventoryClient).unrecallInstances(anyString(), anyString());

        CompensationRetryService.RetryResult result = service().retryEligible(5, 10);

        assertThat(result.failed()).isEqualTo(1);
        assertThat(f.isResolved()).isFalse();
        assertThat(f.getRetryCount()).isEqualTo(3);
        // base(10) * 2^2 = 40분 후
        assertThat(f.getNextRetryAt()).isEqualTo(LocalDateTime.now(CLOCK).plusMinutes(40));
    }

    @Test
    void noCandidates_returnsZeroResult() {
        when(repository.findRetryCandidates(5, LocalDateTime.now(CLOCK))).thenReturn(List.of());

        CompensationRetryService.RetryResult result = service().retryEligible(5, 10);

        assertThat(result.candidates()).isZero();
        verify(inventoryClient, never()).releaseInstances(anyString(), anyString());
    }
}
