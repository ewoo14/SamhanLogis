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
        LocalDateTime outDate,
        LocalDateTime orderDate,
        String addr,
        String note,
        boolean isDeleted) {

    /** 기존 내부 테스트/호출자의 confirmedAt 계약을 새 화면 필드로 연결한다. */
    public HistoryResponse(String orderNo, String slipNo, String status, String slipPublishStatus,
                           BigDecimal totalAmount, LocalDateTime confirmedAt, boolean isDeleted) {
        this(orderNo, slipNo, status, slipPublishStatus, totalAmount,
                confirmedAt, null, null, null, isDeleted);
    }

    public static HistoryResponse from(PartnerOrder order) {
        return new HistoryResponse(
                order.getOrderNo(),
                order.getSlipNo(),
                order.getStatus().name(),
                order.getSlipPublishStatus().name(),
                order.getTotalAmount(),
                order.getConfirmedAt(),
                order.getCreatedAt(),
                order.getDeliveryAddress(),
                order.getMemo(),
                Boolean.TRUE.equals(order.getIsDeleted()));
    }
}
