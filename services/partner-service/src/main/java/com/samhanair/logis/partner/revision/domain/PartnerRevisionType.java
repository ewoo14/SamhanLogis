package com.samhanair.logis.partner.revision.domain;

/**
 * 거래처 버전 스냅샷의 캡처 유형 (권한 재편 Phase 2.3).
 *
 * <ul>
 *   <li>{@link #CREATE} — 거래처 최초 생성 (revision 1).</li>
 *   <li>{@link #EDIT} — 헤더/4탭 자식(단가·배송지·담당자) 변경 후 캡처.</li>
 *   <li>{@link #RESTORE} — 특정 시점(source revision) 으로의 point-in-time 복원.</li>
 * </ul>
 *
 * <p>{@code com.samhanair.logis.slip.estimate.revision.domain.EstimateRevisionType} 미러.
 */
public enum PartnerRevisionType {
    CREATE,
    EDIT,
    RESTORE
}
