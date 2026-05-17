package com.samhanair.logis.slip.web;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.domain.SlipType;

/**
 * 매출(OUTBOUND) 전표 조회 권한 정책 공통 guard.
 *
 * <p>SP-08-6-1 (매출 목록/상세 R1/R2 endpoint 잠금) 신규.
 * 매출 화면과 전표 단건 조회 API 가 동일한 정책을 사용하도록 한 곳에서 관리한다.
 *
 * <p>허용 역할: {@code SALES} / {@code MANAGER} / {@code MASTER}
 * <br>금지 역할: {@code INVENTORY} / {@code WAREHOUSE} — 매출 전표 조회 미허용 (403)
 * <br>정책 근거: SP-03 권한 매트릭스 §4.2 — 출고(OUTBOUND) 전표는 영업/관리 직군 전용.
 * 창고/재고 직군은 배송/검수 단계(ACCEPT~COMPLETE)만 처리권한, 목록 조회권 없음.
 *
 * @see <a href="https://docs.samhanair.com/sp-03#section-4-2">SP-03 권한 매트릭스 §4.2</a>
 */
final class SlipSalesAccessGuard {

    private SlipSalesAccessGuard() {
    }

    /**
     * OUTBOUND(매출) 전표 조회 시 role 이 허용 목록에 없으면 {@link BusinessException}(FORBIDDEN) 을 발생시킨다.
     *
     * <p>{@code slipType} 이 {@code OUTBOUND} 가 아니면 즉시 반환 (INBOUND 가드는 별도 {@link SlipPurchaseAccessGuard}).
     *
     * @param slipType 전표 유형 (null 이면 가드 스킵)
     * @param role     X-User-Role 헤더 값 (null/blank 이면 403)
     * @throws BusinessException(FORBIDDEN) INVENTORY / WAREHOUSE 또는 기타 미허용 역할
     */
    static void guardOutboundSalesRead(SlipType slipType, String role) {
        if (slipType != SlipType.OUTBOUND) {
            return;
        }
        if (canReadOutboundSales(role)) {
            return;
        }
        throw new BusinessException(ErrorCode.FORBIDDEN,
                "매출 전표 조회는 SALES / MANAGER / MASTER 권한만 허용합니다.");
    }

    /**
     * {@code slipType} 이 null 이고 OUTBOUND 열람 권한이 없으면 INBOUND 만 허용하도록 강제한다.
     *
     * <p>type 미지정 전체 목록 조회 시 INVENTORY/WAREHOUSE 역할은 OUTBOUND 행을 볼 수 없다.
     * {@link SlipPurchaseAccessGuard#restrictInboundWhenTypeOmitted} 와 유사한 역할 제한.
     *
     * @param slipType null 이면 전체 요청
     * @param role     X-User-Role 헤더 값
     * @return OUTBOUND 조회 가능하면 {@code slipType} 그대로 반환; 아니면 {@code SlipType.INBOUND}
     */
    static SlipType restrictOutboundWhenTypeOmitted(SlipType slipType, String role) {
        if (slipType != null || canReadOutboundSales(role)) {
            return slipType;
        }
        return SlipType.INBOUND;
    }

    /**
     * 주어진 역할이 OUTBOUND 매출 전표를 조회할 수 있는지 여부.
     *
     * @param role X-User-Role 헤더 값
     * @return SALES / MANAGER / MASTER 이면 true, 그 외 false
     */
    static boolean canReadOutboundSales(String role) {
        // ACCOUNTANT 제외 — SP-03 권한 매트릭스 §4.2 (ACCOUNTANT 는 INBOUND 확정 권한만 보유)
        // INVENTORY / WAREHOUSE 제외 — 배송/검수 단계 처리 권한만 있고 매출 전표 열람 불가
        return "SALES".equals(role) || "MANAGER".equals(role) || "MASTER".equals(role);
    }
}
