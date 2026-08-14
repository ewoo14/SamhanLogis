package com.samhanair.logis.slip.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.domain.CompensationOperation;
import com.samhanair.logis.slip.domain.CompensationPhase;
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.SerialCompensationFailure;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.repository.SerialCompensationFailureRepository;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * 보상 실패 복구 service 단위 테스트.
 */
@ExtendWith(MockitoExtension.class)
class CompensationRecoveryServiceTest {

    @Mock
    private SerialCompensationFailureRepository failureRepository;

    @InjectMocks
    private CompensationRecoveryService recoveryService;

    @Test
    void resolve_unresolvedFailure_transitionsToResolvedAndSaves() {
        UUID id = UUID.randomUUID();
        SerialCompensationFailure failure = failure(id, false);
        when(failureRepository.findById(id)).thenReturn(Optional.of(failure));
        when(failureRepository.save(any(SerialCompensationFailure.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        var response = recoveryService.resolve(id);

        assertThat(response.resolved()).isTrue();
        assertThat(failure.isResolved()).isTrue();
        verify(failureRepository).save(failure);
    }

    @Test
    void resolve_alreadyResolvedFailure_isIdempotent() {
        UUID id = UUID.randomUUID();
        SerialCompensationFailure failure = failure(id, true);
        when(failureRepository.findById(id)).thenReturn(Optional.of(failure));
        when(failureRepository.save(any(SerialCompensationFailure.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        var first = recoveryService.resolve(id);
        var second = recoveryService.resolve(id);

        assertThat(first.resolved()).isTrue();
        assertThat(second.resolved()).isTrue();
        assertThat(failure.isResolved()).isTrue();
    }

    @Test
    void resolve_missingFailure_throwsNotFound() {
        UUID id = UUID.randomUUID();
        when(failureRepository.findById(id)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> recoveryService.resolve(id))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.NOT_FOUND));
    }

    private SerialCompensationFailure failure(UUID id, boolean resolved) {
        Slip slip = Slip.createOutbound(
                "2026/06/03-UNIT",
                LocalDate.of(2026, 6, 3),
                1,
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                "삼한상사",
                DeliveryTag.SALE,
                null,
                "unit-test");
        ReflectionTestUtils.setField(slip, "id", UUID.randomUUID());
        SerialCompensationFailure failure = SerialCompensationFailure.of(
                slip,
                CompensationPhase.ACCEPT_RESERVE,
                "AC-UNIT",
                CompensationOperation.RELEASE_INSTANCES,
                "BusinessException: release 실패",
                "BusinessException: reserve 실패",
                LocalDateTime.of(2026, 6, 3, 10, 0));
        ReflectionTestUtils.setField(failure, "id", id);
        if (resolved) {
            failure.resolve();
        }
        return failure;
    }
}
