package com.samhanair.logis.slip.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.shared.realtime.collection.CollectionRealtimePublisher;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.repository.SlipLineRepository;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.service.closing.SlipClosedDateGuard;
import jakarta.persistence.EntityManager;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class SlipRestoreServiceTest {

    private static final UUID SLIP_ID = UUID.randomUUID();
    private static final String CALLER_ID = UUID.randomUUID().toString();

    @Mock private SlipRepository slipRepository;
    @Mock private SlipLineRepository slipLineRepository;
    @Mock private CollectionRealtimePublisher publisher;
    @Mock private SlipClosedDateGuard closedDateGuard;
    @Mock private EntityManager entityManager;
    @Mock private Slip slip;

    @Test
    void restore_rejectsClosedDateBeforeReactivatingHeader() {
        when(slipRepository.findByIdIncludingDeleted(SLIP_ID)).thenReturn(Optional.of(slip));
        when(slip.getSlipType()).thenReturn(SlipType.OUTBOUND);
        when(slip.getIsDeleted()).thenReturn(true);
        when(slip.getSlipDate()).thenReturn(LocalDate.of(2026, 8, 7));
        org.mockito.Mockito.doThrow(new BusinessException(
                com.samhanair.logis.common.exception.ErrorCode.CONFLICT, "마감된 날짜입니다"))
                .when(closedDateGuard).assertAllowed(eq(SlipType.OUTBOUND), eq(LocalDate.of(2026, 8, 7)), eq(CALLER_ID));

        SlipRestoreService service = service();

        assertThatThrownBy(() -> service.restore(SLIP_ID, CALLER_ID))
                .isInstanceOf(BusinessException.class)
                .hasMessage("마감된 날짜입니다");
        verify(slip, never()).markRestoredWithNameCleared();
        verify(slipRepository, never()).saveAndFlush(slip);
    }

    @Test
    void restore_openDateUsesTheSharedClosedDatePolicy() {
        when(slipRepository.findByIdIncludingDeleted(SLIP_ID)).thenReturn(Optional.of(slip));
        when(slip.getSlipType()).thenReturn(SlipType.OUTBOUND);
        when(slip.getIsDeleted()).thenReturn(true);
        when(slip.getSlipDate()).thenReturn(LocalDate.of(2026, 8, 8));
        when(slip.getSlipNo()).thenReturn("2026/08/08-1");
        when(slipRepository.findBySlipTypeAndSlipNoAndIsDeletedFalse(SlipType.OUTBOUND, "2026/08/08-1"))
                .thenReturn(Optional.empty());
        when(slipLineRepository.countDeletedLinesBySlipId(SLIP_ID)).thenReturn(0L);
        when(slipRepository.saveAndFlush(slip)).thenReturn(slip);

        service().restore(SLIP_ID, CALLER_ID);

        verify(closedDateGuard).assertAllowed(SlipType.OUTBOUND, LocalDate.of(2026, 8, 8), CALLER_ID);
        verify(slip).markRestoredWithNameCleared();
    }

    private SlipRestoreService service() {
        SlipRestoreService service = new SlipRestoreService(slipRepository, slipLineRepository,
                publisher, closedDateGuard);
        try {
            var field = SlipRestoreService.class.getDeclaredField("entityManager");
            field.setAccessible(true);
            field.set(service, entityManager);
        } catch (ReflectiveOperationException ex) {
            throw new AssertionError(ex);
        }
        return service;
    }
}
