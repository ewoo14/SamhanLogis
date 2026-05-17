package com.samhanair.logis.slip.web;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.domain.SlipType;

/**
 * 매입(INBOUND) 전표 조회 권한 정책 공통 guard.
 *
 * <p>구매관리 화면과 기존 전표 목록 API가 동일한 정책을 사용하도록 한 곳에서 관리한다.
 *
 * <p>허용 역할: {@code WAREHOUSE} / {@code MANAGER} / {@code MASTER}
 * <br>금지 역할: {@code INVENTORY} / {@code SALES} / {@code ACCOUNTANT} — 매입 전표 조회 미허용 (403)
 * <br>정책 근거: SP-03 권한 매트릭스 §4.2 — 입고(INBOUND) 전표는 창고 직군 전용.
 *
 * @see <a href="https://docs.samhanair.com/sp-03#section-4-2">SP-03 권한 매트릭스 §4.2</a>
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
