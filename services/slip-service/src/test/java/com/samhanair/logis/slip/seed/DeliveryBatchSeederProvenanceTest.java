package com.samhanair.logis.slip.seed;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.slip.delivery.domain.DeliveryBatch;
import com.samhanair.logis.slip.delivery.repository.DeliveryBatchRepository;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.repository.SlipRepository;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class DeliveryBatchSeederProvenanceTest {

    @Test
    void links_only_system_seed_slips_and_still_creates_all_thirty_batches() {
        DeliveryBatchRepository batchRepository = mock(DeliveryBatchRepository.class);
        SlipRepository slipRepository = mock(SlipRepository.class);
        SeedDependencyState dependencyState = new SeedDependencyState();
        dependencyState.markSlipSeedSucceeded();

        Slip businessSlip = mock(Slip.class);
        Slip seedSlip = mock(Slip.class);
        when(businessSlip.getSlipType()).thenReturn(SlipType.OUTBOUND);
        when(seedSlip.getSlipType()).thenReturn(SlipType.OUTBOUND);
        when(businessSlip.getDriverPhone()).thenReturn("010-9999-0000");
        when(seedSlip.getDriverPhone()).thenReturn("010-1000-0001");
        when(slipRepository.findAllBySlipTypeAndSlipNoInAndCreatedByAndStatusAndIsDeletedFalse(
                any(), any(), any(), any())).thenAnswer(invocation ->
                invocation.getArgument(3).toString().equals("SHIPPING")
                        ? List.of(seedSlip) : List.of());
        when(batchRepository.findByDriverPhoneAndBatchDate(any(), any())).thenReturn(Optional.empty());
        when(batchRepository.saveAndFlush(any(DeliveryBatch.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        new DeliveryBatchSeeder(batchRepository, slipRepository, dependencyState).run();

        verify(slipRepository, never()).save(businessSlip);
        verify(slipRepository).save(seedSlip);
        verify(batchRepository, org.mockito.Mockito.times(30)).saveAndFlush(any(DeliveryBatch.class));
    }
}
