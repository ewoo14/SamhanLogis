package com.samhanair.logis.slip.web;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.domain.SlipType;

/**
 * 매입(INBOUND) 전표 조회 권한 정책 공통 guard.
 *
 * <p>구매관리 화면과 기존 전표 목록 API가 동일한 정책을 사용하도록 한 곳에서 관리한다.
 */
final class SlipPurchaseAccessGuard {

    private SlipPurchaseAccessGuard() {
    }

    static void guardInboundPurchaseRead(SlipType slipType, String role) {
        if (slipType != SlipType.INBOUND) {
            return;
        }
        if (canReadInboundPurchase(role)) {
            return;
        }
        throw new BusinessException(ErrorCode.FORBIDDEN,
                "매입 전표 조회는 WAREHOUSE / MANAGER / MASTER 권한만 허용합니다.");
    }

    static SlipType restrictInboundWhenTypeOmitted(SlipType slipType, String role) {
        if (slipType != null || canReadInboundPurchase(role)) {
            return slipType;
        }
        return SlipType.OUTBOUND;
    }

    static boolean canReadInboundPurchase(String role) {
        return "WAREHOUSE".equals(role) || "MANAGER".equals(role) || "MASTER".equals(role);
    }
}
