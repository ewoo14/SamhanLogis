package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.domain.SalesCommissionSettlementNumberSequence;
import com.samhanair.logis.accounting.repository.SalesCommissionSettlementNumberSequenceRepository;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class SalesCommissionSettlementNumberServiceTest {

    @Mock SalesCommissionSettlementNumberSequenceRepository sequenceRepository;

    @Test
    void next_usesSettlementDate_andStartsEachDateAtOne() {
        LocalDate firstDate = LocalDate.of(2026, 8, 11);
        LocalDate secondDate = LocalDate.of(2026, 8, 12);
        SalesCommissionSettlementNumberSequence first =
                SalesCommissionSettlementNumberSequence.create(firstDate);
        SalesCommissionSettlementNumberSequence second =
                SalesCommissionSettlementNumberSequence.create(secondDate);
        SalesCommissionSettlementNumberService service =
                new SalesCommissionSettlementNumberService(sequenceRepository);
        when(sequenceRepository.findLockedBySettlementDate(firstDate)).thenReturn(Optional.of(first));
        when(sequenceRepository.findLockedBySettlementDate(secondDate)).thenReturn(Optional.of(second));

        assertThat(service.next(firstDate)).isEqualTo("2026/08/11-1");
        assertThat(service.next(secondDate)).isEqualTo("2026/08/12-1");

        verify(sequenceRepository).insertIfAbsent(any(UUID.class), eq(firstDate));
        verify(sequenceRepository).insertIfAbsent(any(UUID.class), eq(secondDate));
    }
}
