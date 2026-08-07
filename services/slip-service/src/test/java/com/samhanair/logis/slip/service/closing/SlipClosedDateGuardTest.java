package com.samhanair.logis.slip.service.closing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.slip.domain.SlipType;
import java.time.LocalDate;
import java.time.Clock;
import java.time.ZoneId;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class SlipClosedDateGuardTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 8, 8);
    private static final LocalDate CLOSED_DATE = LocalDate.of(2026, 8, 7);
    private static final UUID ACCOUNT_ID = UUID.fromString("00000000-0000-0000-0000-000000000112");

    @Mock private SlipClosingBaselineRepository baselineRepository;
    @Mock private SlipClosingDateRuleRepository dateRuleRepository;
    @Mock private DynamicPermissionClient permissionClient;

    @Test
    void closedDate_isRejectedForNonPrivilegedCreator() {
        SlipClosedDateGuard guard = guard(true, TODAY);
        when(dateRuleRepository.findBySlipTypeAndClosingDateAndIsDeletedFalse(SlipType.OUTBOUND, CLOSED_DATE))
                .thenReturn(Optional.of(SlipClosingDateRule.manualClosed(SlipType.OUTBOUND, CLOSED_DATE)));
        when(permissionClient.check(ACCOUNT_ID, SlipClosedDateGuard.PAGE_CODE, PermissionAction.CREATE))
                .thenReturn(false);

        assertThatThrownBy(() -> guard.assertCreatable(SlipType.OUTBOUND, CLOSED_DATE, ACCOUNT_ID.toString()))
                .isInstanceOf(SlipClosedDateException.class);
    }

    @Test
    void pastDate_remainsCreatableWhenAutomaticBaselineIsDisabled() {
        SlipClosedDateGuard guard = guard(false, TODAY);

        guard.assertCreatable(SlipType.OUTBOUND, CLOSED_DATE, ACCOUNT_ID.toString());

        verify(permissionClient, never()).check(any(), any(), any());
    }

    @Test
    void outboundClosing_doesNotRejectInboundCreation() {
        SlipClosedDateGuard guard = guard(false, TODAY);
        when(dateRuleRepository.findBySlipTypeAndClosingDateAndIsDeletedFalse(SlipType.INBOUND, CLOSED_DATE))
                .thenReturn(Optional.empty());

        guard.assertCreatable(SlipType.INBOUND, CLOSED_DATE, ACCOUNT_ID.toString());

        verify(dateRuleRepository).findBySlipTypeAndClosingDateAndIsDeletedFalse(SlipType.INBOUND, CLOSED_DATE);
    }

    @Test
    void privilegedCreator_canCreateOnClosedDate() {
        SlipClosedDateGuard guard = guard(false, TODAY);
        when(dateRuleRepository.findBySlipTypeAndClosingDateAndIsDeletedFalse(SlipType.OUTBOUND, CLOSED_DATE))
                .thenReturn(Optional.of(SlipClosingDateRule.manualClosed(SlipType.OUTBOUND, CLOSED_DATE)));
        when(permissionClient.check(ACCOUNT_ID, SlipClosedDateGuard.PAGE_CODE, PermissionAction.CREATE))
                .thenReturn(true);

        guard.assertCreatable(SlipType.OUTBOUND, CLOSED_DATE, ACCOUNT_ID.toString());
    }

    @Test
    void openException_reopensDateBelowEnabledBaseline() {
        SlipClosedDateGuard guard = guard(true, TODAY);
        when(dateRuleRepository.findBySlipTypeAndClosingDateAndIsDeletedFalse(SlipType.OUTBOUND, CLOSED_DATE))
                .thenReturn(Optional.of(SlipClosingDateRule.openException(SlipType.OUTBOUND, CLOSED_DATE)));

        guard.assertCreatable(SlipType.OUTBOUND, CLOSED_DATE, ACCOUNT_ID.toString());

        verify(permissionClient, never()).check(any(), any(), any());
    }

    private SlipClosedDateGuard guard(boolean baselineEnabled, LocalDate baselineDate) {
        lenient().when(baselineRepository.findBySlipTypeAndIsDeletedFalse(SlipType.OUTBOUND))
                .thenReturn(Optional.of(SlipClosingBaseline.active(SlipType.OUTBOUND, baselineDate, baselineEnabled)));
        lenient().when(baselineRepository.findBySlipTypeAndIsDeletedFalse(SlipType.INBOUND))
                .thenReturn(Optional.empty());
        return new SlipClosedDateGuard(baselineRepository, dateRuleRepository, permissionClient,
                Clock.fixed(TODAY.atStartOfDay(ZoneId.of("Asia/Seoul")).toInstant(), ZoneId.of("Asia/Seoul")));
    }
}
