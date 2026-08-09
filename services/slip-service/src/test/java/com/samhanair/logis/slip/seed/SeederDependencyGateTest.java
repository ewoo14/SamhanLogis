package com.samhanair.logis.slip.seed;

import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.slip.delivery.repository.DeliveryBatchRepository;
import com.samhanair.logis.slip.estimate.repository.EstimateNumberSequenceRepository;
import com.samhanair.logis.slip.estimate.repository.EstimateRepository;
import com.samhanair.logis.slip.repository.SlipRepository;
import java.util.Optional;
import org.springframework.data.domain.PageImpl;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.junit.jupiter.api.extension.ExtendWith;

@ExtendWith(MockitoExtension.class)
class SeederDependencyGateTest {

    @Mock
    private DeliveryBatchRepository batchRepository;

    @Mock
    private SlipRepository slipRepository;

    @Mock
    private SeedDependencyState dependencyState;

    @Mock
    private EstimateRepository estimateRepository;

    @Mock
    private EstimateNumberSequenceRepository sequenceRepository;

    @Test
    void deliveryBatchSeedIsSkippedWhenSlipSeedFailed() {
        when(dependencyState.isSlipSeedSucceeded()).thenReturn(false);

        new DeliveryBatchSeeder(batchRepository, slipRepository, dependencyState).run();

        verifyNoInteractions(batchRepository, slipRepository);
    }

    @Test
    void deliveryBatchSeedRunsAllThirtyBatchesWhenSlipSeedSucceeded() {
        when(dependencyState.isSlipSeedSucceeded()).thenReturn(true);
        when(batchRepository.findByDriverPhoneAndBatchDate(any(), any())).thenReturn(Optional.empty());
        when(slipRepository.findAllBySlipTypeAndSlipNoInAndCreatedByAndStatusAndIsDeletedFalse(
                any(), any(), any(), any())).thenReturn(java.util.List.of());
        when(batchRepository.saveAndFlush(any())).thenAnswer(invocation -> invocation.getArgument(0));

        new DeliveryBatchSeeder(batchRepository, slipRepository, dependencyState).run();

        verify(batchRepository, times(30)).saveAndFlush(any());
    }

    @Test
    void estimateSeedIsSkippedWhenSlipSeedFailed() {
        when(dependencyState.isSlipSeedSucceeded()).thenReturn(false);

        new EstimateSeeder(estimateRepository, sequenceRepository, dependencyState).run();

        verifyNoInteractions(estimateRepository, sequenceRepository);
    }

    @Test
    void estimateSeedRunsAllFortyEstimatesWhenSlipSeedSucceeded() {
        when(dependencyState.isSlipSeedSucceeded()).thenReturn(true);
        when(estimateRepository.findByEstimateNoIncludingDeleted(any())).thenReturn(Optional.empty());
        when(sequenceRepository.findByEstimateDate(any())).thenReturn(Optional.empty());

        new EstimateSeeder(estimateRepository, sequenceRepository, dependencyState).run();

        verify(estimateRepository, times(40)).save(any());
    }
}
