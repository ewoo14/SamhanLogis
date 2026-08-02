package com.samhanair.logis.partnerauth.service;

import com.samhanair.logis.partnerauth.domain.PartnerAuth;
import com.samhanair.logis.partnerauth.domain.PartnerStatus;
import java.time.LocalDateTime;

/** 주문서 앱 접근 대상과 실제 인증 차단이 공유하는 장기미사용 판정. */
final class PartnerAccessPolicy {

    private PartnerAccessPolicy() {}

    static boolean isLongUnused(PartnerAuth auth, PartnerActivity activity, LocalDateTime now) {
        LocalDateTime base = activity == null ? null : activity.lastActivityAt();
        if (base == null) {
            base = auth.getCreatedAt();
        }
        return base != null && !base.plusDays(PartnerAuth.LONG_UNUSED_DAYS).isAfter(now);
    }

    /** 실제 인증은 로그인 성공을 가장 최근의 활동으로 인정한다. */
    static boolean isAuthenticationLongUnused(PartnerAuth auth, PartnerActivity activity, LocalDateTime now) {
        LocalDateTime expiresAt = authenticationExpirationAt(auth, activity);
        return expiresAt != null && !expiresAt.isAfter(now);
    }

    /** 실제 상태조회·로그인·만료 API가 공유하는 만료 시각. */
    static LocalDateTime authenticationExpirationAt(PartnerAuth auth, PartnerActivity activity) {
        LocalDateTime base = auth.getLastLoginAt();
        LocalDateTime activityAt = activity == null ? null : activity.lastActivityAt();
        if (activityAt != null && (base == null || activityAt.isAfter(base))) {
            base = activityAt;
        }
        if (base == null) {
            base = auth.getCreatedAt();
        }
        return base == null ? null : base.plusDays(PartnerAuth.LONG_UNUSED_DAYS);
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
