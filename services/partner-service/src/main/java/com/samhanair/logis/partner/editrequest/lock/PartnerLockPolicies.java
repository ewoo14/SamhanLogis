package com.samhanair.logis.partner.editrequest.lock;

import com.samhanair.logis.partner.domain.PartnerStatus;
import com.samhanair.logis.shared.realtime.lock.EditLockPolicy;

/**
 * 거래처 도메인 잠금 정책 — PR-H4b (Phase 12 Step 4b).
 *
 * <p>shared:realtime-abstraction 의 {@link EditLockPolicy} 인스턴스 — partner-service 의 도메인
 * entity 용 정책 상수.
 *
 * <p>사용자 명시 정책:
 *
 * <table>
 *   <caption>partner 도메인 잠금 정책</caption>
 *   <tr><th>entity</th><th>FREE</th><th>LOCKED_REQUIRES_APPROVAL</th><th>FULLY_LOCKED</th><th>TERMINAL</th></tr>
 *   <tr><td>Partner</td><td>ACTIVE / SUSPENDED</td><td>(없음)</td><td>(없음)</td><td>TERMINATED</td></tr>
 *   <tr><td>BlockedPartner</td><td colspan="4">단일 status — soft-delete 자체가 차단 해제. 별도 정책은
 *     status enum 가 없으므로 service layer 에서 markDeleted 가드로 처리</td></tr>
 * </table>
 *
 * <p><b>BlockedPartner 잠금 정책 보강</b> — BlockedPartner 는 별도 status enum 이 없으므로 본
 * 정책은 Partner status 만 노출. BlockedPartner 자체의 BLOCKED 상태 잠금은 service layer 에서
 * editRequestService.findActiveApproval 가드 + markDeleted 토글로 처리 (PartnerBlockService 가
 * 본 매뉴얼 패턴 보완).
 */
public final class PartnerLockPolicies {

    private PartnerLockPolicies() {
        // utility class
    }

    /** Partner 잠금 정책 — ACTIVE/SUSPENDED 자유, TERMINATED 종결. */
    public static final EditLockPolicy<PartnerStatus> PARTNER =
            EditLockPolicy.<PartnerStatus>builder()
                    .freeStatuses(PartnerStatus.ACTIVE, PartnerStatus.SUSPENDED)
                    .terminalStatuses(PartnerStatus.TERMINATED)
                    .displayName(PartnerStatus::getDisplayName)
                    .build();
}
