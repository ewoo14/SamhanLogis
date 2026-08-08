package com.samhanair.logis.slip.seed;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.repository.SlipRepository;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;

class SlipLockSeederTest {

    @Test
    void seeds_all_five_confirmed_slips_from_the_actual_slip_seed_dates_only() {
        SlipRepository repository = mock(SlipRepository.class);
        SeedDependencyState dependencyState = new SeedDependencyState();
        dependencyState.markSlipSeedSucceeded();
        List<Slip> targets = List.of(mock(Slip.class), mock(Slip.class), mock(Slip.class), mock(Slip.class), mock(Slip.class));
        when(repository.findAllBySlipDateBetweenAndStatusAndLockFlagFalseAndIsDeletedFalse(
                LocalDate.of(2026, 2, 15), LocalDate.of(2026, 4, 8), SlipStatus.CONFIRMED))
                .thenReturn(targets);

        new SlipLockSeeder(repository, dependencyState).run();

        verify(repository).findAllBySlipDateBetweenAndStatusAndLockFlagFalseAndIsDeletedFalse(
                LocalDate.of(2026, 2, 15), LocalDate.of(2026, 4, 8), SlipStatus.CONFIRMED);
        targets.forEach(slip -> verify(slip).lock());
        verifyNoMoreInteractions(repository);
    }
}
