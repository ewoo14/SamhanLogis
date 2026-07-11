package com.samhanair.logis.shared.realtime.lock;

/**
 * {@link EditLockGuard} default 구현 — PR-H4a (Phase 12 Step 4a).
 *
 * <p>{@link EditLockPolicy} 의 4 카테고리에 따라 직선 분기. 14 service 동일 패턴.
 *
 * <p>분기 우선 순위:
 * <ol>
 *   <li>{@code policy.isFree(status)} — 자유 단계, return (no-op)</li>
 *   <li>{@code policy.isFullyLocked(status)} — 항상 throw</li>
 *   <li>{@code policy.isTerminal(status)} — 종결됨, throw (mutation 의미 없음)</li>
 *   <li>{@code policy.isLockedRequiresApproval(status)} — APPROVED 요청 부재 시 throw</li>
 *   <li>그 외 status — 자유 진행 (정책 외 status 는 도메인 service 가 별도 가드)</li>
 * </ol>
 */
public class DefaultEditLockGuard implements EditLockGuard {

    @Override
    public <T> void guardCanEdit(T status, EditLockPolicy<T> policy, boolean hasActiveApproval) {
        guard(status, policy, hasActiveApproval, "수정");
    }

    @Override
    public <T> void guardCanDelete(T status, EditLockPolicy<T> policy, boolean hasActiveApproval) {
        guard(status, policy, hasActiveApproval, "삭제");
    }

    private <T> void guard(T status, EditLockPolicy<T> policy, boolean hasActiveApproval,
                           String actionLabel) {
        if (policy.isFree(status)) {
            return;
        }
        if (policy.isFullyLocked(status)) {
            throw new LockedException(
                    "현 단계 (" + policy.displayName(status) + ") 는 완전 잠금 — "
                            + actionLabel + " 불가 (사용자 명시 정책)");
        }
        if (policy.isTerminal(status)) {
            throw new LockedException(
                    "현 단계 (" + policy.displayName(status) + ") 는 종결됨 — "
                            + actionLabel + " 불가");
        }
        if (policy.isLockedRequiresApproval(status)) {
            if (!hasActiveApproval) {
                throw new LockedException(
                        "현 단계 (" + policy.displayName(status) + ") 는 권한자 수락 후 "
                                + actionLabel + " 가능 — APPROVED 요청 부재");
            }
            return;
        }
        // 정책 외 status — 도메인 service 가 별도 가드 (no-op)
    }
}
