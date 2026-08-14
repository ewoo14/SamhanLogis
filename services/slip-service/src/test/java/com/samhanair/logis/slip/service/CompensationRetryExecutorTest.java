package com.samhanair.logis.slip.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.domain.CompensationOperation;
import com.samhanair.logis.slip.domain.CompensationPhase;
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.SerialCompensationFailure;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.repository.SerialCompensationFailureRepository;
import com.samhanair.logis.slip.service.CompensationRetryExecutor.Outcome;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * CompensationRetryExecutor 의 동작별 디스패치/스킵/백오프/락 후 재확인 단위 테스트. (D-SER-27)
 */
@ExtendWith(MockitoExtension.class)
class CompensationRetryExecutorTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 6, 3, 10, 0);

    @Mock
    private SerialCompensationFailureRepository repository;

    @Mock
    private InventoryClient inventoryClient;

    private SerialCompensationFailure failure(String suffix, CompensationOperation op) {
        Slip slip = Slip.createOutbound("2026/06/03-RETRY-" + suffix, LocalDate.of(2026, 6, 3), 1,
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "삼한", DeliveryTag.SALE, null, "u");
        ReflectionTestUtils.setField(slip, "id", UUID.randomUUID());
        SerialCompensationFailure f = SerialCompensationFailure.of(slip, CompensationPhase.ACCEPT_RESERVE,
                "AC-" + suffix, op, "보상 실패", "원본 실패", LocalDateTime.of(2026, 6, 3, 10, 0));
        ReflectionTestUtils.setField(f, "id", UUID.randomUUID());
        return f;
    }

    private CompensationRetryExecutor executor() {
        return new CompensationRetryExecutor(repository, inventoryClient);
    }

    @Test
    void releaseInstances_success_resolvesAndReturnsSucceeded() {
        SerialCompensationFailure f = failure("R", CompensationOperation.RELEASE_INSTANCES);
        when(repository.findByIdForUpdate(f.getId())).thenReturn(Optional.of(f));

        Outcome outcome = executor().retryOne(f.getId(), NOW, 10);

        assertThat(outcome).isEqualTo(Outcome.SUCCEEDED);
        org.mockito.Mockito.verify(inventoryClient).releaseInstances("2026/06/03-RETRY-R", "AC-R");
        assertThat(f.isResolved()).isTrue();
        assertThat(f.getRetryCount()).isEqualTo(1);
    }

    @Test
    void quantityOperation_skipped_noInventoryCall() {
        SerialCompensationFailure f = failure("Q", CompensationOperation.RELEASE);
        when(repository.findByIdForUpdate(f.getId())).thenReturn(Optional.of(f));

        Outcome outcome = executor().retryOne(f.getId(), NOW, 10);

        assertThat(outcome).isEqualTo(Outcome.SKIPPED);
        verifyNoInteractions(inventoryClient);
        assertThat(f.isResolved()).isFalse();
        assertThat(f.getRetryCount()).isZero();
    }

    @Test
    void failure_returnsFailed_withExponentialBackoff() {
        SerialCompensationFailure f = failure("F", CompensationOperation.UNRECALL_INSTANCES);
        ReflectionTestUtils.setField(f, "retryCount", 2);
        when(repository.findByIdForUpdate(f.getId())).thenReturn(Optional.of(f));
        org.mockito.Mockito.doThrow(new RuntimeException("down"))
                .when(inventoryClient).unrecallInstances(anyString(), anyString());

        Outcome outcome = executor().retryOne(f.getId(), NOW, 10);

        assertThat(outcome).isEqualTo(Outcome.FAILED);
        assertThat(f.isResolved()).isFalse();
        assertThat(f.getRetryCount()).isEqualTo(3);
        // 백오프 지수 = 갱신 전 retryCount(2) → base(10) * 2^2 = 40분
        assertThat(f.getNextRetryAt()).isEqualTo(NOW.plusMinutes(40));
    }

    @Test
    void notFound_returnsGone() {
        UUID id = UUID.randomUUID();
        when(repository.findByIdForUpdate(id)).thenReturn(Optional.empty());

        assertThat(executor().retryOne(id, NOW, 10)).isEqualTo(Outcome.GONE);
        verifyNoInteractions(inventoryClient);
    }

    @Test
    void alreadyResolved_returnsGone_noInventoryCall() {
        SerialCompensationFailure f = failure("D", CompensationOperation.RELEASE_INSTANCES);
        f.resolve();
        when(repository.findByIdForUpdate(f.getId())).thenReturn(Optional.of(f));

        assertThat(executor().retryOne(f.getId(), NOW, 10)).isEqualTo(Outcome.GONE);
        verifyNoInteractions(inventoryClient);
    }
}
