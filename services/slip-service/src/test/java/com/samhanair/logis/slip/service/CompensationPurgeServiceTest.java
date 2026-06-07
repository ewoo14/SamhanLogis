package com.samhanair.logis.slip.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.slip.repository.SerialCompensationFailureRepository;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.LocalDateTime;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * 보상 실패 감사 물리 purge service 단위 테스트.
 */
@ExtendWith(MockitoExtension.class)
class CompensationPurgeServiceTest {

    @Mock
    private SerialCompensationFailureRepository failureRepository;

    @Test
    void purgePhysically_recordsHardPurgeCounterByDeletedCount() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        CompensationPurgeService service =
                new CompensationPurgeService(failureRepository, new CompensationMetrics(registry));
        LocalDateTime cutoff = LocalDateTime.of(2026, 6, 7, 4, 0);
        when(failureRepository.deleteSoftDeletedBefore(cutoff, 500)).thenReturn(3);

        int purged = service.purgePhysically(cutoff, 500);

        assertThat(purged).isEqualTo(3);
        verify(failureRepository).deleteSoftDeletedBefore(cutoff, 500);
        assertThat(registry.get(CompensationMetrics.COMPENSATION_RETENTION_PURGED_TOTAL)
                .tag("mode", "hard")
                .counter()
                .count()).isEqualTo(3);
    }
}
