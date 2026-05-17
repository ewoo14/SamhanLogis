package com.samhanair.logis.partnerorder.web.dto;

import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 주문 목록 행 응답.
 *
 * <p>UUID 는 노출하지 않고 사용자 표시용 주문번호와 거래처 코드만 반환한다.
 */
public record PartnerOrderSummaryResponse(
        String orderNumber,
        String partnerCode,
        String partnerName,
        LocalDateTime submittedAt,
        String status,
        BigDecimal totalAmount,
        String linkedSlipNo
) {

    /** Entity 를 목록 행 DTO 로 변환한다. */
    public static PartnerOrderSummaryResponse from(PartnerOrder order) {
        return new PartnerOrderSummaryResponse(
                order.getOrderNo(),
                order.getPartnerCode(),
                order.getPartnerCode(),
                order.getConfirmedAt(),
                order.getStatus().name(),
                order.getTotalAmount(),
                order.getSlipNo());
    }
}
