package com.samhanair.logis.partnerauth.dto;

import com.samhanair.logis.partnerauth.domain.PartnerStatus;

/**
 * 데스크탑 영업 "주문서 승인" 화면(`/sales/order-approvals`)에서 사용하는 상태 enum (6종).
 *
 * <p>frontend 의 `PartnerApprovalStatus` (clients/desktop/src/renderer/api/sales.ts) 와 1:1.
 * 내부 {@link PartnerStatus} 10종과는 다대일 매핑 — {@link #fromInternal}/{@link #toInternal} 참고.
 *
 * <p>분리 이유: 내부 status(10종) 는 실제 인증 로직(잠금/만료/임시 비번 등) 디테일까지 표현하지만,
 * 영업 관리자가 보는 화면은 6 카테고리로 충분. UI 토글에서 임의 변경 시에도 backend 가
 * 안전한 매핑으로 흡수.
 */
public enum PartnerApprovalStatus {
    UNAPPROVED,
    APPROVED,
    PASSWORD_RESET_PENDING,
    PASSWORD_ERROR,
    ACCESS_DENIED,
    LONG_PENDING;

    /** 내부 10종 → 외부 6종 매핑. */
    public static PartnerApprovalStatus fromInternal(PartnerStatus internal) {
        return switch (internal) {
            case PENDING, NOT_FOUND_AUTH, NOT_FOUND_SYSTEM -> UNAPPROVED;
            case NEED_PW_INPUT, OK -> APPROVED;
            case NEED_PW_SET -> PASSWORD_RESET_PENDING;
            case LOCKED, PW_EXPIRED -> PASSWORD_ERROR;
            case ACCESS_DENIED -> ACCESS_DENIED;
            case LONG_UNUSED -> LONG_PENDING;
        };
    }

    /** 외부 6종 → 내부 10종 매핑 (영업자 status 변경 시 적용 가능한 대표값). */
    public PartnerStatus toInternal() {
        return switch (this) {
            case UNAPPROVED -> PartnerStatus.PENDING;
            case APPROVED -> PartnerStatus.NEED_PW_INPUT;
            case PASSWORD_RESET_PENDING -> PartnerStatus.NEED_PW_SET;
            case PASSWORD_ERROR -> PartnerStatus.LOCKED;
            case ACCESS_DENIED -> PartnerStatus.ACCESS_DENIED;
            case LONG_PENDING -> PartnerStatus.LONG_UNUSED;
        };
    }
}
