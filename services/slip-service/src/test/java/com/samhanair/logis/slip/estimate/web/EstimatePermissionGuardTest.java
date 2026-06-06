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

/**
 * EstimatePermissionGuard 단위 테스트.
 *
 * <p>C5-4 전환 후 MASTER bypass 판정 기준:
 * X-Is-System-Master="true" 헤더 → DynamicPermissionClient 미호출.
 * X-User-Role 은 더 이상 사용하지 않는다.
 */
class EstimatePermissionGuardTest {

    private static final UUID ACCOUNT_ID = UUID.fromString("11111111-1111-1111-1111-111111111111");
    /** 비-MASTER 일반 계정 — X-Is-System-Master 부재 시 동적 조회 수행. */
    private static final String NOT_MASTER = null;

    private final DynamicPermissionClient dynamicPermissionClient = mock(DynamicPermissionClient.class);
    private final EstimatePermissionGuard guard = new EstimatePermissionGuard(dynamicPermissionClient);

    @Test
    void checkViewUsesAccountViewPermission() {
        when(dynamicPermissionClient.check(ACCOUNT_ID, EstimatePermissionGuard.PAGE_CODE, PermissionAction.VIEW))
                .thenReturn(true);

        guard.checkView(ACCOUNT_ID, NOT_MASTER);

        verify(dynamicPermissionClient).check(
                eq(ACCOUNT_ID), eq(EstimatePermissionGuard.PAGE_CODE), eq(PermissionAction.VIEW));
    }

    @Test
    void checkEditUsesRequestedMutationAction() {
        when(dynamicPermissionClient.check(ACCOUNT_ID, EstimatePermissionGuard.PAGE_CODE, PermissionAction.CREATE))
                .thenReturn(true);

        guard.checkEdit(ACCOUNT_ID, NOT_MASTER, PermissionAction.CREATE);

        verify(dynamicPermissionClient).check(
                eq(ACCOUNT_ID), eq(EstimatePermissionGuard.PAGE_CODE), eq(PermissionAction.CREATE));
    }

    @Test
    void checkViewDeniesMissingAccountPermission() {
        when(dynamicPermissionClient.check(ACCOUNT_ID, EstimatePermissionGuard.PAGE_CODE, PermissionAction.VIEW))
                .thenReturn(false);

        assertThatThrownBy(() -> guard.checkView(ACCOUNT_ID, NOT_MASTER))
                .isInstanceOf(BusinessException.class);
    }

    /** C5-4 — X-Is-System-Master=true 이면 VIEW override row 조회 없이 통과. */
    @Test
    void checkViewMasterBypassesDynamicCheck() {
        guard.checkView(ACCOUNT_ID, "true");

        verify(dynamicPermissionClient, never()).check(any(), anyString(), any());
    }

    /** C5-4 — X-Is-System-Master=true 이면 mutation override row 조회 없이 통과. */
    @Test
    void checkEditMasterBypassesDynamicCheck() {
        guard.checkEdit(ACCOUNT_ID, "true", PermissionAction.UPDATE);

        verify(dynamicPermissionClient, never()).check(any(), anyString(), any());
    }

    /** C5-4 — X-Is-System-Master 값 대소문자 무관 bypass. */
    @Test
    void checkViewMasterBypassIsCaseInsensitive() {
        guard.checkView(ACCOUNT_ID, "TRUE");

        verify(dynamicPermissionClient, never()).check(any(), anyString(), any());
    }

    /** C5-4 — X-Is-System-Master=false 이면 동적 조회 수행 (fail-secure). */
    @Test
    void checkViewFalseIsSystemMasterPerformsDynamicCheck() {
        when(dynamicPermissionClient.check(ACCOUNT_ID, EstimatePermissionGuard.PAGE_CODE, PermissionAction.VIEW))
                .thenReturn(true);

        guard.checkView(ACCOUNT_ID, "false");

        verify(dynamicPermissionClient).check(
                eq(ACCOUNT_ID), eq(EstimatePermissionGuard.PAGE_CODE), eq(PermissionAction.VIEW));
    }
}
