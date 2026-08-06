package com.samhanair.logis.slip.seed;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.slip.estimate.domain.Estimate;
import com.samhanair.logis.slip.estimate.domain.EstimateLine;
import com.samhanair.logis.slip.estimate.repository.EstimateNumberSequenceRepository;
import com.samhanair.logis.slip.estimate.repository.EstimateRepository;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * EstimateSeeder 품목 카탈로그 정합 검증.
 *
 * <p>product-service HvacProductSeeder 와 동일한 modelName 기반
 * {@code samhan-seed:product:<modelName>} UUID 를 견적 라인에 사용해야 한다.
 */
@ExtendWith(MockitoExtension.class)
class EstimateSeederTest {

    @Mock
    private EstimateRepository estimateRepository;

    @Mock
    private EstimateNumberSequenceRepository sequenceRepository;

    private EstimateSeeder seeder;

    @BeforeEach
    void setUp() {
        seeder = new EstimateSeeder(estimateRepository, sequenceRepository);
    }

    @Test
    void seedLinesUseHvacProductModelNamesAndDeterministicProductUuid() {
        when(estimateRepository.findByEstimateNoIncludingDeleted(any())).thenReturn(Optional.empty());
        when(sequenceRepository.findByEstimateDate(any())).thenReturn(Optional.empty());

        seeder.run();

        ArgumentCaptor<Estimate> estimateCaptor = ArgumentCaptor.forClass(Estimate.class);
        verify(estimateRepository, times(40)).save(estimateCaptor.capture());

        Estimate firstEstimate = estimateCaptor.getAllValues().get(0);
        EstimateLine firstLine = firstEstimate.getLines().get(0);

        assertThat(firstLine.getModelName()).isEqualTo("AR05TXEAAWKNEU-01");
        assertThat(firstLine.getProductName()).isEqualTo("삼성 윈드프리 5평형");
        assertThat(firstLine.getProductId())
                .isEqualTo(UUID.fromString("01949ab7-e922-35c6-b289-5337d867a0ee"));
    }

    @Test
    void existingEstimateNoKeepsIdempotentSkip() {
        when(estimateRepository.findByEstimateNoIncludingDeleted(any()))
                .thenReturn(Optional.of(Estimate.create(
                        "2026/01/01-1", LocalDate.of(2026, 1, 1), 1,
                        UUID.randomUUID(), "거래처", "123-45-67890", "서울",
                        LocalDate.of(2026, 2, 1), null, "kimmiseon")));

        seeder.run();

        verify(estimateRepository, never()).save(any());
    }
}
