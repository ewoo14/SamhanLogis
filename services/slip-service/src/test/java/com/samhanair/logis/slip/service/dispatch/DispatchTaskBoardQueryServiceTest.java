package com.samhanair.logis.slip.service.dispatch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.domain.dispatch.SlipDispatchStatus;
import com.samhanair.logis.slip.repository.SlipRepository;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

/**
 * {@link DispatchTaskBoardQueryService} 단위 검증 — BE Task B7.
 */
@ExtendWith(MockitoExtension.class)
class DispatchTaskBoardQueryServiceTest {

    @Mock SlipRepository slipRepo;
    @InjectMocks DispatchTaskBoardQueryService svc;

    @Test
    void default_uses_seoul_today_pm1_and_UNDISPATCHED() {
        when(slipRepo.findAllBySlipTypeAndSlipDateBetweenAndDispatchStatusInAndIsDeletedFalse(
                any(SlipType.class), any(LocalDate.class), any(LocalDate.class),
                any(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of()));

        Page<Slip> page = svc.findUnDispatchedSlips(null, null, null, 0, 50);
        assertThat(page).isNotNull();

        ArgumentCaptor<LocalDate> fromC = ArgumentCaptor.forClass(LocalDate.class);
        ArgumentCaptor<LocalDate> toC = ArgumentCaptor.forClass(LocalDate.class);
        ArgumentCaptor<Set<SlipDispatchStatus>> statusC = ArgumentCaptor.forClass(Set.class);
        verify(slipRepo).findAllBySlipTypeAndSlipDateBetweenAndDispatchStatusInAndIsDeletedFalse(
                eq(SlipType.OUTBOUND), fromC.capture(), toC.capture(),
                statusC.capture(), any(Pageable.class));

        LocalDate today = LocalDate.now(ZoneId.of("Asia/Seoul"));
        assertThat(fromC.getValue()).isEqualTo(today.minusDays(1));
        assertThat(toC.getValue()).isEqualTo(today.plusDays(1));
        assertThat(statusC.getValue()).containsExactly(SlipDispatchStatus.UNDISPATCHED);
    }

    @Test
    void custom_range_and_statuses() {
        when(slipRepo.findAllBySlipTypeAndSlipDateBetweenAndDispatchStatusInAndIsDeletedFalse(
                any(SlipType.class), any(LocalDate.class), any(LocalDate.class),
                any(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of()));

        svc.findUnDispatchedSlips(
                LocalDate.of(2026, 5, 10), LocalDate.of(2026, 5, 20),
                Set.of(SlipDispatchStatus.UNDISPATCHED, SlipDispatchStatus.DISPATCHING),
                1, 30);

        ArgumentCaptor<Pageable> pageableC = ArgumentCaptor.forClass(Pageable.class);
        verify(slipRepo).findAllBySlipTypeAndSlipDateBetweenAndDispatchStatusInAndIsDeletedFalse(
                eq(SlipType.OUTBOUND),
                eq(LocalDate.of(2026, 5, 10)), eq(LocalDate.of(2026, 5, 20)),
                any(), pageableC.capture());

        Pageable used = pageableC.getValue();
        assertThat(used.getPageNumber()).isEqualTo(1);
        assertThat(used.getPageSize()).isEqualTo(30);
    }

    @Test
    void invalid_range_throws() {
        assertThatThrownBy(() -> svc.findUnDispatchedSlips(
                LocalDate.of(2026, 5, 20), LocalDate.of(2026, 5, 10),
                null, 0, 50))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void invalid_size_defaults_to_50() {
        when(slipRepo.findAllBySlipTypeAndSlipDateBetweenAndDispatchStatusInAndIsDeletedFalse(
                any(SlipType.class), any(LocalDate.class), any(LocalDate.class),
                any(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of()));

        svc.findUnDispatchedSlips(null, null, null, 0, -1);

        ArgumentCaptor<Pageable> pageableC = ArgumentCaptor.forClass(Pageable.class);
        verify(slipRepo).findAllBySlipTypeAndSlipDateBetweenAndDispatchStatusInAndIsDeletedFalse(
                any(SlipType.class), any(LocalDate.class), any(LocalDate.class),
                any(), pageableC.capture());
        assertThat(pageableC.getValue().getPageSize()).isEqualTo(50);
    }
}
