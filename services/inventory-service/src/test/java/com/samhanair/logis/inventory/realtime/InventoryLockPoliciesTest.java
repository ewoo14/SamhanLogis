package com.samhanair.logis.inventory.realtime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.inventory.domain.AuditStatus;
import com.samhanair.logis.inventory.realtime.service.InventoryLockPolicies;
import com.samhanair.logis.shared.realtime.lock.DefaultEditLockGuard;
import com.samhanair.logis.shared.realtime.lock.EditLockGuard;
import com.samhanair.logis.shared.realtime.lock.LockedException;
import org.junit.jupiter.api.Test;

/**
 * PR-H4b — InventoryLockPolicies 단위 테스트.
 *
 * <p>사용자 명시 정책 (D-P12-04b) 검증:
 * <ul>
 *   <li>PLANNED / IN_PROGRESS — 자유 (가드 통과)</li>
 *   <li>COMPLETED — APPROVED 활성 시 통과, 부재 시 LockedException</li>
 *   <li>CANCELLED — TERMINAL (항상 throw)</li>
 * </ul>
 */
class InventoryLockPoliciesTest {

    private final EditLockGuard guard = new DefaultEditLockGuard();

    @Test
    void planned_isFree_passesWithoutApproval() {
        guard.guardCanEdit(AuditStatus.PLANNED, InventoryLockPolicies.AUDIT_POLICY, false);
        guard.guardCanDelete(AuditStatus.PLANNED, InventoryLockPolicies.AUDIT_POLICY, false);
    }

    @Test
    void inProgress_isFree_passesWithoutApproval() {
        guard.guardCanEdit(AuditStatus.IN_PROGRESS, InventoryLockPolicies.AUDIT_POLICY, false);
    }

    @Test
    void completed_withoutApproval_throwsLockedException() {
        assertThatThrownBy(() -> guard.guardCanEdit(
                AuditStatus.COMPLETED, InventoryLockPolicies.AUDIT_POLICY, false))
                .isInstanceOf(LockedException.class)
                .hasMessageContaining("완료")
                .hasMessageNotContaining("COMPLETED");
    }

    @Test
    void completed_withApproval_passes() {
        guard.guardCanEdit(AuditStatus.COMPLETED, InventoryLockPolicies.AUDIT_POLICY, true);
    }

    @Test
    void cancelled_isTerminal_alwaysThrows() {
        assertThatThrownBy(() -> guard.guardCanEdit(
                AuditStatus.CANCELLED, InventoryLockPolicies.AUDIT_POLICY, true))
                .isInstanceOf(LockedException.class)
                .hasMessageContaining("취소")
                .hasMessageNotContaining("CANCELLED");
    }

    @Test
    void policyCategoryMembership_matchesUserSpec() {
        assertThat(InventoryLockPolicies.AUDIT_POLICY.isFree(AuditStatus.PLANNED)).isTrue();
        assertThat(InventoryLockPolicies.AUDIT_POLICY.isFree(AuditStatus.IN_PROGRESS)).isTrue();
        assertThat(InventoryLockPolicies.AUDIT_POLICY.isLockedRequiresApproval(
                AuditStatus.COMPLETED)).isTrue();
        assertThat(InventoryLockPolicies.AUDIT_POLICY.isTerminal(AuditStatus.CANCELLED)).isTrue();
    }
}
