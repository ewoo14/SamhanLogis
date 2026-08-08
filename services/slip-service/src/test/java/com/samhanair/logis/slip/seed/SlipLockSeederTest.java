package com.samhanair.logis.slip.seed;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.repository.SlipRepository;
import java.util.List;
import org.junit.jupiter.api.Test;

class SlipLockSeederTest {

    @Test
    void seeds_only_the_five_confirmed_slip_seed_keys_with_system_provenance() {
        SlipRepository repository = mock(SlipRepository.class);
        SeedDependencyState dependencyState = new SeedDependencyState();
        dependencyState.markSlipSeedSucceeded();
        List<Slip> outboundTargets = List.of(mock(Slip.class), mock(Slip.class), mock(Slip.class), mock(Slip.class));
        List<Slip> inboundTargets = List.of(mock(Slip.class));
        List<String> outboundSlipNos = List.of(
                "2026/02/15-1", "2026/02/16-1", "2026/02/17-1", "2026/02/18-1");
        List<String> inboundSlipNos = List.of("2026/04/08-1");
        when(repository.findAllBySlipTypeAndSlipNoInAndCreatedByAndStatusAndLockFlagFalseAndIsDeletedFalse(
                eq(SlipType.OUTBOUND), eq(outboundSlipNos), eq("system"), eq(SlipStatus.CONFIRMED)))
                .thenReturn(outboundTargets);
        when(repository.findAllBySlipTypeAndSlipNoInAndCreatedByAndStatusAndLockFlagFalseAndIsDeletedFalse(
                eq(SlipType.INBOUND), eq(inboundSlipNos), eq("system"), eq(SlipStatus.CONFIRMED)))
                .thenReturn(inboundTargets);

        new SlipLockSeeder(repository, dependencyState).run();

        verify(repository).findAllBySlipTypeAndSlipNoInAndCreatedByAndStatusAndLockFlagFalseAndIsDeletedFalse(
                SlipType.OUTBOUND, outboundSlipNos, "system", SlipStatus.CONFIRMED);
        verify(repository).findAllBySlipTypeAndSlipNoInAndCreatedByAndStatusAndLockFlagFalseAndIsDeletedFalse(
                SlipType.INBOUND, inboundSlipNos, "system", SlipStatus.CONFIRMED);
        outboundTargets.forEach(slip -> verify(slip).lock());
        inboundTargets.forEach(slip -> verify(slip).lock());
        verifyNoMoreInteractions(repository);
    }
}
