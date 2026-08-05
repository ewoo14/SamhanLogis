package com.samhanair.logis.partnerauth.service;

import com.samhanair.logis.partnerauth.domain.PartnerAuth;
import com.samhanair.logis.partnerauth.domain.PartnerStatus;
import java.time.LocalDateTime;

/** 주문서 앱 접근 대상과 실제 인증 차단이 공유하는 장기미사용 판정. */
final class PartnerAccessPolicy {

    private PartnerAccessPolicy() {}

    /** 외부 원천 장애는 활동 없음으로 확정하지 않고 차단을 보류한다. */
    static PartnerActivity readSafely(PartnerActivityReader reader, String partnerCode) {
        try {
            PartnerActivity activity = reader.read(partnerCode);
            return activity == null ? PartnerActivity.unavailable() : activity;
        } catch (RuntimeException ex) {
            return PartnerActivity.unavailable();
        }
    }

    /** 사업자번호 조회를 우선하고 legacy partner_code fallback을 같은 안전 경계로 감싼다. */
    static PartnerActivity readSafely(
            PartnerActivityReader reader, String businessNumber, String legacyPartnerCode) {
        if (legacyPartnerCode == null || legacyPartnerCode.isBlank()
                || legacyPartnerCode.equals(businessNumber)) {
            return readSafely(reader, businessNumber);
        }
        try {
            PartnerActivity activity = reader.read(businessNumber, legacyPartnerCode);
            return activity == null ? PartnerActivity.unavailable() : activity;
        } catch (RuntimeException ex) {
            return PartnerActivity.unavailable();
        }
    }

    static boolean isLongUnused(PartnerAuth auth, PartnerActivity activity, LocalDateTime now) {
        if (activity == null || !activity.isLookupComplete()) {
            return false;
        }
        LocalDateTime expiresAt = authenticationExpirationAt(auth, activity);
        return expiresAt != null && expiresAt.isBefore(now);
    }

    /** 실제 인증도 미리보기와 같은 레거시 주문·출고 기준을 사용한다. */
    static boolean isAuthenticationLongUnused(PartnerAuth auth, PartnerActivity activity, LocalDateTime now) {
        LocalDateTime expiresAt = authenticationExpirationAt(auth, activity);
        return expiresAt != null && expiresAt.isBefore(now);
    }

    /** 실제 상태조회·로그인·만료 API가 공유하는 만료 시각. */
    static LocalDateTime authenticationExpirationAt(PartnerAuth auth, PartnerActivity activity) {
        if (activity == null || !activity.isLookupComplete()) {
            return null;
        }
        LocalDateTime base = latestBaseline(auth, activity);
        return base == null ? null : base.plusDays(PartnerAuth.LONG_UNUSED_DAYS);
    }

    /** 레거시 기준인 주문·출고·생성시각과 관리자 복구시각의 최댓값. */
    private static LocalDateTime latestBaseline(PartnerAuth auth, PartnerActivity activity) {
        LocalDateTime base = activity.lastActivityAt();
        if (auth.getAccessRestoredAt() != null
                && (base == null || auth.getAccessRestoredAt().isAfter(base))) {
            base = auth.getAccessRestoredAt();
        }
        if (auth.getCreatedAt() != null && (base == null || auth.getCreatedAt().isAfter(base))) {
            base = auth.getCreatedAt();
        }
        return base;
    }

    static boolean isPreviewCandidate(PartnerAuth auth, PartnerActivity activity, LocalDateTime now) {
        if (auth.getStatus() == PartnerStatus.LONG_UNUSED) {
            return true;
        }
        if (auth.getStatus() != PartnerStatus.NEED_PW_INPUT && auth.getStatus() != PartnerStatus.OK) {
            return false;
        }
        return isLongUnused(auth, activity, now);
    }
}
