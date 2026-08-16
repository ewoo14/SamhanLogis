package com.samhanair.logis.partnerorder.web.dto;

import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 거래처 history 응답. UUID 미노출 (orderNo / slipNo / partnerCode / bizCode 만).
 */
public record HistoryResponse(
        String orderNo,
        String slipNo,
        String status,
        String slipPublishStatus,
        BigDecimal totalAmount,
        LocalDateTime confirmedAt,
        boolean isDeleted) {

    public static HistoryResponse from(PartnerOrder order) {
        return new HistoryResponse(
                order.getOrderNo(),
                order.getSlipNo(),
                order.getStatus().name(),
                order.getSlipPublishStatus().name(),
                order.getTotalAmount(),
                order.getConfirmedAt(),
                Boolean.TRUE.equals(order.getIsDeleted()));
    }
}
