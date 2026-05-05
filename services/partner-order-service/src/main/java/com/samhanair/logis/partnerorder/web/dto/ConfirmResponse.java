package com.samhanair.logis.partnerorder.web.dto;

import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 확정 응답 — slipNo 는 PUBLISHED 시 채워지고 PENDING_RETRY 시 null.
 * UUID 비공개 — orderNo / slipPublishStatus 만 사용자 노출 (FE 가드).
 */
public record ConfirmResponse(
        String orderNo,
        String slipNo,
        String status,
        String slipPublishStatus,
        BigDecimal totalAmount,
        LocalDateTime confirmedAt) {

    public static ConfirmResponse from(PartnerOrder order) {
        return new ConfirmResponse(
                order.getOrderNo(),
                order.getSlipNo(),
                order.getStatus().name(),
                order.getSlipPublishStatus().name(),
                order.getTotalAmount(),
                order.getConfirmedAt());
    }
}
