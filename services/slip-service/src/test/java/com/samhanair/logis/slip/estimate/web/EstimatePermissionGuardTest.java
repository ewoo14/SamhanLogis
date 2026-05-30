package com.samhanair.logis.slip.estimate.web;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class EstimatePermissionGuardTest {

    private static final UUID ACCOUNT_ID = UUID.fromString("11111111-1111-1111-1111-111111111111");
    private static final String SALES = "SALES";
    private static final String MASTER = "MASTER";

    private final DynamicPermissionClient dynamicPermissionClient = mock(DynamicPermissionClient.class);
    private final EstimatePermissionGuard guard = new EstimatePermissionGuard(dynamicPermissionClient);

    @Test
    void checkViewUsesAccountViewPermission() {
        when(dynamicPermissionClient.check(ACCOUNT_ID, EstimatePermissionGuard.PAGE_CODE, PermissionAction.VIEW))
                .thenReturn(true);

        guard.checkView(ACCOUNT_ID, SALES);

        verify(dynamicPermissionClient).check(
                eq(ACCOUNT_ID), eq(EstimatePermissionGuard.PAGE_CODE), eq(PermissionAction.VIEW));
    }

    @Test
    void checkEditUsesRequestedMutationAction() {
        when(dynamicPermissionClient.check(ACCOUNT_ID, EstimatePermissionGuard.PAGE_CODE, PermissionAction.CREATE))
                .thenReturn(true);

        guard.checkEdit(ACCOUNT_ID, SALES, PermissionAction.CREATE);

        verify(dynamicPermissionClient).check(
                eq(ACCOUNT_ID), eq(EstimatePermissionGuard.PAGE_CODE), eq(PermissionAction.CREATE));
    }

    @Test
    void checkViewDeniesMissingAccountPermission() {
        when(dynamicPermissionClient.check(ACCOUNT_ID, EstimatePermissionGuard.PAGE_CODE, PermissionAction.VIEW))
                .thenReturn(false);

        assertThatThrownBy(() -> guard.checkView(ACCOUNT_ID, SALES))
                .isInstanceOf(BusinessException.class);
    }

    /** RC5 — MASTER 는 VIEW override row 조회 없이 통과 (동적 client 미호출). */
    @Test
    void checkViewMasterBypassesDynamicCheck() {
        guard.checkView(ACCOUNT_ID, MASTER);

        verify(dynamicPermissionClient, never()).check(any(), anyString(), any());
    }

    /** RC5 — MASTER 는 mutation override row 조회 없이 통과 (동적 client 미호출). */
    @Test
    void checkEditMasterBypassesDynamicCheck() {
        guard.checkEdit(ACCOUNT_ID, MASTER, PermissionAction.UPDATE);

        verify(dynamicPermissionClient, never()).check(any(), anyString(), any());
    }

    /** RC5 — MASTER 는 대소문자 무관하게 bypass. */
    @Test
    void checkViewMasterBypassIsCaseInsensitive() {
        guard.checkView(ACCOUNT_ID, "master");

        verify(dynamicPermissionClient, never()).check(any(), anyString(), any());
    }
}
