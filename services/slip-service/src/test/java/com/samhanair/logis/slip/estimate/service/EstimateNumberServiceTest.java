package com.samhanair.logis.slip.estimate.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.samhanair.logis.slip.estimate.domain.EstimateNumberSequence;
import com.samhanair.logis.slip.estimate.repository.EstimateNumberSequenceRepository;
import java.time.LocalDate;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/** EstimateNumberService — 견적서 공개번호 표준({@code yyyy/MM/dd-N}) 회귀 테스트. */
@ExtendWith(MockitoExtension.class)
class EstimateNumberServiceTest {

    @Mock private EstimateNumberSequenceRepository sequenceRepository;

    @InjectMocks private EstimateNumberService service;

    private LocalDate today;

    @BeforeEach
    void setUp() {
        today = LocalDate.of(2026, 5, 16);
    }

    @Test
    void next_firstCall_usesBusinessNumberStandardWithoutPrefixOrPadding() {
        when(sequenceRepository.findByEstimateDate(today)).thenReturn(Optional.empty());
        when(sequenceRepository.save(any(EstimateNumberSequence.class))).thenAnswer(inv -> inv.getArgument(0));

        String estimateNo = service.next(today);

        assertThat(estimateNo).isEqualTo("2026/05/16-1");
    }

    @Test
    void next_existingSequence_usesLastSequencePlusOne() {
        EstimateNumberSequence existing = EstimateNumberSequence.create(today);
        existing.next();
        existing.next();
        when(sequenceRepository.findByEstimateDate(today)).thenReturn(Optional.of(existing));

        String estimateNo = service.next(today);

        assertThat(estimateNo).isEqualTo("2026/05/16-3");
    }

    @Test
    void extractSeqNo_parsesTrailingNumber() {
        assertThat(service.extractSeqNo("2026/05/16-37")).isEqualTo(37);
    }
}
