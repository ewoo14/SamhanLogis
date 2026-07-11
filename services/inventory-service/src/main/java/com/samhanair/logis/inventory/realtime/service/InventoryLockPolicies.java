package com.samhanair.logis.inventory.realtime.service;

import com.samhanair.logis.inventory.domain.AuditStatus;
import com.samhanair.logis.shared.realtime.lock.EditLockPolicy;

/**
 * inventory 도메인 잠금 정책 — PR-H4b (Phase 12 Step 4b).
 *
 * <p>사용자 명시 정책 (D-P12-04b):
 * <ul>
 *   <li>InventoryAudit PLANNED / IN_PROGRESS — 작성자 자유 mutation</li>
 *   <li>InventoryAudit COMPLETED — LOCKED_REQUIRES_APPROVAL (MANAGER 수락 1회 소진 후 mutation)</li>
 *   <li>InventoryAudit CANCELLED — TERMINAL (수정 의미 없음)</li>
 * </ul>
 *
 * <p><b>설계 결정</b>: COMPLETED 단계에서 차이 자동 분개 trigger + Stock 조정이 끝났으므로 본문
 * 수정은 회계 감사 추적이 필요. 따라서 작성자 직접 mutation 차단 → 본 정책 + 요청 채널만 가능.
 *
 * <p>{@link EditLockPolicy} 의 {@code freeStatuses / lockedRequiresApproval / fullyLocked /
 * terminalStatuses} 4 카테고리에 매핑.
 */
public final class InventoryLockPolicies {

    /** InventoryAudit 잠금 정책 (사용자 명시 — D-P12-04b). */
    public static final EditLockPolicy<AuditStatus> AUDIT_POLICY = EditLockPolicy.<AuditStatus>builder()
            .freeStatuses(AuditStatus.PLANNED, AuditStatus.IN_PROGRESS)
            .lockedRequiresApproval(AuditStatus.COMPLETED)
            .terminalStatuses(AuditStatus.CANCELLED)
            .displayName(AuditStatus::getDisplayName)
            .build();

    private InventoryLockPolicies() {
        // utility class
    }
}
