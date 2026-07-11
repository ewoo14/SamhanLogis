package com.samhanair.logis.shared.realtime.lock;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Map;

import org.junit.jupiter.api.Test;

/**
 * PR-H4a — DefaultEditLockGuard 단위 (6 case).
 *
 * <ol>
 *   <li>guardCanEdit — free status (DRAFT) → no throw</li>
 *   <li>guardCanEdit — fully locked (SHIPPING) → LockedException</li>
 *   <li>guardCanEdit — terminal (REJECTED) → LockedException</li>
 *   <li>guardCanEdit — locked-requires-approval + hasActiveApproval=false → LockedException</li>
 *   <li>guardCanEdit — locked-requires-approval + hasActiveApproval=true → no throw</li>
 *   <li>guardCanDelete — fully locked → LockedException (action label = "삭제")</li>
 * </ol>
 */
class DefaultEditLockGuardTest {

    /** 테스트용 도메인 status enum — slip lifecycle 일관 example. */
    enum SampleStatus {
        DRAFT, SAVED, SENT,
        CONFIRMED, ACCEPTED, PROCESSING,
        INSPECTING, SHIPPING, DELIVERED,
        REJECTED, CANCELED, COMPLETED
    }

    private final EditLockPolicy<SampleStatus> policy = EditLockPolicy.<SampleStatus>builder()
            .freeStatuses(SampleStatus.DRAFT, SampleStatus.SAVED, SampleStatus.SENT)
            .lockedRequiresApproval(SampleStatus.CONFIRMED, SampleStatus.ACCEPTED, SampleStatus.PROCESSING)
            .fullyLocked(SampleStatus.INSPECTING, SampleStatus.SHIPPING, SampleStatus.DELIVERED)
            .terminalStatuses(SampleStatus.REJECTED, SampleStatus.CANCELED)
            .build();

    private final EditLockGuard guard = new DefaultEditLockGuard();

    @Test
    void guardCanEdit_freeStatus_noThrow() {
        assertThatCode(() -> guard.guardCanEdit(SampleStatus.DRAFT, policy, false))
                .doesNotThrowAnyException();
    }

    @Test
    void guardCanEdit_fullyLocked_throwsLockedException() {
        assertThatThrownBy(() -> guard.guardCanEdit(SampleStatus.SHIPPING, policy, false))
                .isInstanceOf(LockedException.class)
                .hasMessageContaining("완전 잠금")
                .hasMessageContaining("수정");
    }

    @Test
    void guardCanEdit_terminalStatus_throwsLockedException() {
        assertThatThrownBy(() -> guard.guardCanEdit(SampleStatus.REJECTED, policy, false))
                .isInstanceOf(LockedException.class)
                .hasMessageContaining("종결됨");
    }

    @Test
    void guardCanEdit_lockedRequiresApproval_noApproval_throws() {
        assertThatThrownBy(() -> guard.guardCanEdit(SampleStatus.CONFIRMED, policy, false))
                .isInstanceOf(LockedException.class)
                .hasMessageContaining("권한자 수락")
                .hasMessageContaining("APPROVED 요청 부재");
    }

    @Test
    void guardCanEdit_lockedRequiresApproval_withApproval_noThrow() {
        assertThatCode(() -> guard.guardCanEdit(SampleStatus.CONFIRMED, policy, true))
                .doesNotThrowAnyException();
    }

    @Test
    void guardCanDelete_fullyLocked_throwsWithDeleteLabel() {
        assertThatThrownBy(() -> guard.guardCanDelete(SampleStatus.DELIVERED, policy, false))
                .isInstanceOf(LockedException.class)
                .hasMessageContaining("삭제");
    }

    @Test
    void guardCanEdit_fullyLocked_usesPolicyDisplayName() {
        Map<SampleStatus, String> labels = Map.of(
                SampleStatus.SHIPPING, "배송중"
        );
        EditLockPolicy<SampleStatus> displayNamePolicy = EditLockPolicy.<SampleStatus>builder()
                .fullyLocked(SampleStatus.SHIPPING)
                .displayName(labels::get)
                .build();

        assertThatThrownBy(() -> guard.guardCanEdit(SampleStatus.SHIPPING, displayNamePolicy, false))
                .isInstanceOf(LockedException.class)
                .hasMessageContaining("현 단계 (배송중)")
                .hasMessageNotContaining("SHIPPING");
    }

    @Test
    void guardCanEdit_fullyLocked_withoutDisplayNameFallsBackToRawStatus() {
        EditLockPolicy<SampleStatus> rawPolicy = EditLockPolicy.<SampleStatus>builder()
                .fullyLocked(SampleStatus.SHIPPING)
                .build();

        assertThatThrownBy(() -> guard.guardCanEdit(SampleStatus.SHIPPING, rawPolicy, false))
                .isInstanceOf(LockedException.class)
                .hasMessageContaining("현 단계 (SHIPPING)");
    }
}
