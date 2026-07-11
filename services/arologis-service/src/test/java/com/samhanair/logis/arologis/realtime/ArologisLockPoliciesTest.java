package com.samhanair.logis.arologis.realtime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.arologis.realtime.service.ArologisLockPolicies;
import com.samhanair.logis.arologis.realtime.service.DispatchDerivedStatus;
import com.samhanair.logis.shared.realtime.lock.DefaultEditLockGuard;
import com.samhanair.logis.shared.realtime.lock.EditLockGuard;
import com.samhanair.logis.shared.realtime.lock.LockedException;
import org.junit.jupiter.api.Test;

/**
 * PR-H4b — ArologisLockPolicies 단위 테스트.
 *
 * <p>사용자 명시 정책 (D-P12-04b):
 * <ul>
 *   <li>PLANNED — 자유</li>
 *   <li>DISPATCHED — APPROVED 활성 시 통과, 부재 시 LockedException</li>
 *   <li>DELIVERED — APPROVED 활성 시 통과, 부재 시 LockedException</li>
 * </ul>
 */
class ArologisLockPoliciesTest {

    private final EditLockGuard guard = new DefaultEditLockGuard();

    @Test
    void planned_isFree_passesWithoutApproval() {
        guard.guardCanEdit(DispatchDerivedStatus.PLANNED, ArologisLockPolicies.DISPATCH_POLICY, false);
        guard.guardCanDelete(DispatchDerivedStatus.PLANNED, ArologisLockPolicies.DISPATCH_POLICY, false);
    }

    @Test
    void dispatched_withoutApproval_throws() {
        assertThatThrownBy(() -> guard.guardCanEdit(
                DispatchDerivedStatus.DISPATCHED, ArologisLockPolicies.DISPATCH_POLICY, false))
                .isInstanceOf(LockedException.class)
                .hasMessageContaining("배차중")
                .hasMessageNotContaining("DISPATCHED");
    }

    @Test
    void dispatched_withApproval_passes() {
        guard.guardCanEdit(DispatchDerivedStatus.DISPATCHED, ArologisLockPolicies.DISPATCH_POLICY, true);
    }

    @Test
    void delivered_withoutApproval_throws() {
        assertThatThrownBy(() -> guard.guardCanDelete(
                DispatchDerivedStatus.DELIVERED, ArologisLockPolicies.DISPATCH_POLICY, false))
                .isInstanceOf(LockedException.class)
                .hasMessageContaining("배송완료")
                .hasMessageNotContaining("DELIVERED");
    }

    @Test
    void delivered_withApproval_passes() {
        guard.guardCanDelete(DispatchDerivedStatus.DELIVERED, ArologisLockPolicies.DISPATCH_POLICY, true);
    }

    @Test
    void policyCategoryMembership_matchesUserSpec() {
        assertThat(ArologisLockPolicies.DISPATCH_POLICY.isFree(DispatchDerivedStatus.PLANNED)).isTrue();
        assertThat(ArologisLockPolicies.DISPATCH_POLICY.isLockedRequiresApproval(
                DispatchDerivedStatus.DISPATCHED)).isTrue();
        assertThat(ArologisLockPolicies.DISPATCH_POLICY.isLockedRequiresApproval(
                DispatchDerivedStatus.DELIVERED)).isTrue();
    }
}
