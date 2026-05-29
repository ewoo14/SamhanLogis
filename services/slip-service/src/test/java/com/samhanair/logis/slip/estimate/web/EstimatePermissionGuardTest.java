package com.samhanair.logis.slip.estimate.web;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class EstimatePermissionGuardTest {

    private static final UUID ACCOUNT_ID = UUID.fromString("11111111-1111-1111-1111-111111111111");

    private final DynamicPermissionClient dynamicPermissionClient = mock(DynamicPermissionClient.class);
    private final EstimatePermissionGuard guard = new EstimatePermissionGuard(dynamicPermissionClient);

    @Test
    void checkViewUsesAccountViewPermission() {
        when(dynamicPermissionClient.check(ACCOUNT_ID, EstimatePermissionGuard.PAGE_CODE, PermissionAction.VIEW))
                .thenReturn(true);

        guard.checkView(ACCOUNT_ID);

        verify(dynamicPermissionClient).check(
                eq(ACCOUNT_ID), eq(EstimatePermissionGuard.PAGE_CODE), eq(PermissionAction.VIEW));
    }

    @Test
    void checkEditUsesRequestedMutationAction() {
        when(dynamicPermissionClient.check(ACCOUNT_ID, EstimatePermissionGuard.PAGE_CODE, PermissionAction.CREATE))
                .thenReturn(true);

        guard.checkEdit(ACCOUNT_ID, PermissionAction.CREATE);

        verify(dynamicPermissionClient).check(
                eq(ACCOUNT_ID), eq(EstimatePermissionGuard.PAGE_CODE), eq(PermissionAction.CREATE));
    }

    @Test
    void checkViewDeniesMissingAccountPermission() {
        when(dynamicPermissionClient.check(ACCOUNT_ID, EstimatePermissionGuard.PAGE_CODE, PermissionAction.VIEW))
                .thenReturn(false);

        assertThatThrownBy(() -> guard.checkView(ACCOUNT_ID))
                .isInstanceOf(BusinessException.class);
    }
}
