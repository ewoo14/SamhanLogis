package com.samhanair.logis.slip.service.dispatch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.dispatch.SlipDispatchStatus;
import com.samhanair.logis.slip.dto.dispatch.SlipBoardResponse;
import com.samhanair.logis.slip.repository.SlipRepository;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;

/**
 * {@link DispatchTaskBoardQueryService} 단위 검증 — BE Task B7.
 */
@ExtendWith(MockitoExtension.class)
class DispatchTaskBoardQueryServiceTest {

    @Mock SlipRepository slipRepo;
    @Mock UserInternalClient userInternalClient;
    @InjectMocks DispatchTaskBoardQueryService svc;

    @Test
    void default_uses_seoul_today_pm1_and_UNDISPATCHED() {
        when(slipRepo.findDispatchReadyOutboundSlips(
                any(LocalDate.class), any(LocalDate.class), any(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of()));

        Page<SlipBoardResponse> page = svc.findUnDispatchedSlips(null, null, null, 0, 50);
        assertThat(page).isNotNull();

        ArgumentCaptor<LocalDate> fromC = ArgumentCaptor.forClass(LocalDate.class);
        ArgumentCaptor<LocalDate> toC = ArgumentCaptor.forClass(LocalDate.class);
        ArgumentCaptor<Set<SlipDispatchStatus>> statusC = ArgumentCaptor.captor();
        verify(slipRepo).findDispatchReadyOutboundSlips(
                fromC.capture(), toC.capture(), statusC.capture(), any(Pageable.class));

        LocalDate today = LocalDate.now(ZoneId.of("Asia/Seoul"));
        assertThat(fromC.getValue()).isEqualTo(today.minusDays(1));
        assertThat(toC.getValue()).isEqualTo(today.plusDays(1));
        assertThat(statusC.getValue()).containsExactly(SlipDispatchStatus.UNDISPATCHED);
    }

    @Test
    void custom_range_and_statuses() {
        when(slipRepo.findDispatchReadyOutboundSlips(
                any(LocalDate.class), any(LocalDate.class), any(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of()));

        svc.findUnDispatchedSlips(
                LocalDate.of(2026, 5, 10), LocalDate.of(2026, 5, 20),
                Set.of(SlipDispatchStatus.UNDISPATCHED, SlipDispatchStatus.DISPATCHING),
                1, 30);

        ArgumentCaptor<Pageable> pageableC = ArgumentCaptor.forClass(Pageable.class);
        verify(slipRepo).findDispatchReadyOutboundSlips(
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
        when(slipRepo.findDispatchReadyOutboundSlips(
                any(LocalDate.class), any(LocalDate.class), any(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of()));

        svc.findUnDispatchedSlips(null, null, null, 0, -1);

        ArgumentCaptor<Pageable> pageableC = ArgumentCaptor.forClass(Pageable.class);
        verify(slipRepo).findDispatchReadyOutboundSlips(
                any(LocalDate.class), any(LocalDate.class), any(), pageableC.capture());
        assertThat(pageableC.getValue().getPageSize()).isEqualTo(50);
    }

    @Test
    void maps_inspector_name_and_signed_at_without_exposing_inspector_user_id() {
        UUID inspectorId = UUID.randomUUID();
        LocalDateTime signedAt = LocalDateTime.of(2026, 6, 24, 9, 30);
        Slip slip = mockSlip(inspectorId.toString(), signedAt);
        when(slipRepo.findDispatchReadyOutboundSlips(
                any(LocalDate.class), any(LocalDate.class), any(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(slip)));
        when(userInternalClient.resolveFullName(inspectorId)).thenReturn(Optional.of("검수담당자"));

        Page<SlipBoardResponse> page = svc.findUnDispatchedSlips(
                LocalDate.of(2026, 6, 24),
                LocalDate.of(2026, 6, 24),
                Set.of(SlipDispatchStatus.UNDISPATCHED),
                0,
                50);

        SlipBoardResponse row = page.getContent().get(0);
        assertThat(row.inspectorName()).isEqualTo("검수담당자");
        assertThat(row.inspectorSignedAt()).isEqualTo(signedAt);
    }

    @Test
    void resolves_each_distinct_inspector_once_and_gracefully_ignores_bad_ids_or_client_failures() {
        UUID sharedInspectorId = UUID.randomUUID();
        UUID failingInspectorId = UUID.randomUUID();
        Slip first = mockSlip(sharedInspectorId.toString(), LocalDateTime.of(2026, 6, 24, 9, 30));
        Slip second = mockSlip(sharedInspectorId.toString(), LocalDateTime.of(2026, 6, 24, 9, 45));
        Slip badId = mockSlip("system", LocalDateTime.of(2026, 6, 24, 10, 0));
        Slip blankId = mockSlip(" ", LocalDateTime.of(2026, 6, 24, 10, 15));
        Slip failing = mockSlip(failingInspectorId.toString(), LocalDateTime.of(2026, 6, 24, 10, 30));
        when(slipRepo.findDispatchReadyOutboundSlips(
                any(LocalDate.class), any(LocalDate.class), any(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(first, second, badId, blankId, failing)));
        when(userInternalClient.resolveFullName(sharedInspectorId)).thenReturn(Optional.of("공유검수자"));
        when(userInternalClient.resolveFullName(failingInspectorId)).thenThrow(new RuntimeException("user-service down"));

        Page<SlipBoardResponse> page = svc.findUnDispatchedSlips(
                LocalDate.of(2026, 6, 24),
                LocalDate.of(2026, 6, 24),
                Set.of(SlipDispatchStatus.UNDISPATCHED),
                0,
                50);

        assertThat(page.getContent())
                .extracting(SlipBoardResponse::inspectorName)
                .containsExactly("공유검수자", "공유검수자", null, null, null);
        verify(userInternalClient, times(1)).resolveFullName(sharedInspectorId);
        verify(userInternalClient, times(1)).resolveFullName(failingInspectorId);
        verify(userInternalClient, never()).resolveFullName(null);
    }

    private Slip mockSlip(String inspectorUserId, LocalDateTime signedAt) {
        Slip slip = org.mockito.Mockito.mock(Slip.class);
        when(slip.getId()).thenReturn(UUID.randomUUID());
        when(slip.getSlipNo()).thenReturn("2026/06/24-1");
        when(slip.getSlipDate()).thenReturn(LocalDate.of(2026, 6, 24));
        when(slip.getPartnerCode()).thenReturn("P-INSPECT-001");
        when(slip.getPartnerName()).thenReturn("검수완료 거래처");
        when(slip.getDeliveryAddress()).thenReturn("서울시 강남구 테스트로 1");
        when(slip.getRecipientPhone()).thenReturn("010-1111-2222");
        when(slip.getDispatchStatus()).thenReturn(SlipDispatchStatus.UNDISPATCHED);
        when(slip.getInspectorUserId()).thenReturn(inspectorUserId);
        when(slip.getInspectorSignedAt()).thenReturn(signedAt);
        return slip;
    }
}
