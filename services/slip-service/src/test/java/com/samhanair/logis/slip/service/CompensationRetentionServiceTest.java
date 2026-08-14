package com.samhanair.logis.slip.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.slip.domain.CompensationOperation;
import com.samhanair.logis.slip.domain.CompensationPhase;
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.SerialCompensationFailure;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.repository.SerialCompensationFailureRepository;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * 보상 실패 감사 retention service 단위 테스트.
 */
@ExtendWith(MockitoExtension.class)
class CompensationRetentionServiceTest {

    @Mock
    private SerialCompensationFailureRepository failureRepository;

    @Test
    void purge_softDeletesOnlyResolvedFailuresOlderThanCutoff() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        LocalDateTime cutoff = LocalDateTime.of(2026, 6, 3, 3, 30);
        SerialCompensationFailure oldResolved = failure("001", true);
        SerialCompensationFailure recentResolved = failure("002", true);
        SerialCompensationFailure oldUnresolved = failure("003", false);
        CompensationRetentionService service =
                new CompensationRetentionService(failureRepository, new CompensationMetrics(registry));

        when(failureRepository.findByResolvedTrueAndCreatedAtBefore(cutoff))
                .thenReturn(List.of(oldResolved));

        int purged = service.purge(cutoff, "system-retention");

        assertThat(purged).isEqualTo(1);
        assertThat(oldResolved.getIsDeleted()).isTrue();
        assertThat(oldResolved.getDeletedBy()).isEqualTo("system-retention");
        assertThat(oldResolved.getDeletedAt()).isNotNull();
        // recentResolved/oldUnresolved 는 mock 리포지토리가 반환하지 않아 서비스 루프에 진입하지 않음을 확인
        // (리포지토리 쿼리 필터 resolved=true AND created_at<cutoff 의 정확성은 IT 에서 실 DB 로 검증). (QA P2)
        assertThat(recentResolved.getIsDeleted()).isFalse();
        assertThat(oldUnresolved.getIsDeleted()).isFalse();
        verify(failureRepository).findByResolvedTrueAndCreatedAtBefore(cutoff);
        assertThat(registry.get(CompensationMetrics.COMPENSATION_RETENTION_PURGED_TOTAL)
                .tag("mode", "soft")
                .counter()
                .count()).isEqualTo(1);
    }

    @Test
    void purge_blankActor_usesSystemRetentionActor() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        LocalDateTime cutoff = LocalDateTime.of(2026, 6, 3, 3, 30);
        SerialCompensationFailure oldResolved = failure("010", true);
        CompensationRetentionService service =
                new CompensationRetentionService(failureRepository, new CompensationMetrics(registry));

        when(failureRepository.findByResolvedTrueAndCreatedAtBefore(cutoff))
                .thenReturn(List.of(oldResolved));

        int purged = service.purge(cutoff, " ");

        assertThat(purged).isEqualTo(1);
        assertThat(oldResolved.getDeletedBy()).isEqualTo("system-retention");
        assertThat(registry.get(CompensationMetrics.COMPENSATION_RETENTION_PURGED_TOTAL)
                .tag("mode", "soft")
                .counter()
                .count()).isEqualTo(1);
    }

    private SerialCompensationFailure failure(String suffix, boolean resolved) {
        Slip slip = Slip.createOutbound(
                "2026/06/03-RET-" + suffix,
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
                "AC-RET-" + suffix,
                CompensationOperation.RELEASE_INSTANCES,
                "BusinessException: release 실패",
                "BusinessException: reserve 실패",
                LocalDateTime.of(2026, 6, 3, 10, 0));
        if (resolved) {
            failure.resolve();
        }
        return failure;
    }
}
