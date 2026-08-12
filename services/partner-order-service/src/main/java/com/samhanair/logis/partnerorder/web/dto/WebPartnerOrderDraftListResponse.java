package com.samhanair.logis.partnerorder.web.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** 데스크톱 목록용 웹 주문서 draft 메타데이터. UUID와 payload는 포함하지 않는다. */
public record WebPartnerOrderDraftListResponse(
        String draftKey,
        String documentLabel,
        String partnerCode,
        LocalDateTime createdAt,
        BigDecimal totalAmount) {
}
