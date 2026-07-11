package com.samhanair.logis.arologis.realtime.service;

import com.samhanair.logis.shared.realtime.lock.EditLockPolicy;

/**
 * arologis 도메인 잠금 정책 — PR-H4b (Phase 12 Step 4b).
 *
 * <p>사용자 명시 정책 (D-P12-04b):
 * <ul>
 *   <li>Dispatch PLANNED — 작성자 자유 mutation</li>
 *   <li>Dispatch DISPATCHED — LOCKED_REQUIRES_APPROVAL (MANAGER 수락 1회 소진)</li>
 *   <li>Dispatch DELIVERED — LOCKED_REQUIRES_APPROVAL (MANAGER 수락 1회 소진)</li>
 * </ul>
 *
 * <p><b>설계 결정</b>: DELIVERED 도 영구 잠금이 아닌 "MANAGER 수락 후 정정 가능" 정책 — 배송
 * 후 누락된 stop 추가 / 사후 보정 시나리오 대응. inventory 의 COMPLETED 와 동일 의미.
 */
public final class ArologisLockPolicies {

    /** Dispatch derived status 잠금 정책. */
    public static final EditLockPolicy<DispatchDerivedStatus> DISPATCH_POLICY =
            EditLockPolicy.<DispatchDerivedStatus>builder()
                    .freeStatuses(DispatchDerivedStatus.PLANNED)
                    .lockedRequiresApproval(
                            DispatchDerivedStatus.DISPATCHED,
                            DispatchDerivedStatus.DELIVERED)
                    .displayName(DispatchDerivedStatus::getDisplayName)
                    .build();

    private ArologisLockPolicies() {
        // utility class
    }
}
