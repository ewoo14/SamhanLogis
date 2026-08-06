package com.samhanair.logis.accounting.web.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/** MIG-14 주문서 목록 admin 조회 응답. 내부 UUID 는 노출하지 않는다. */
public record OrderSummaryResponse(
        String orderNo,
        String partnerName,
        String managerName,
        String progressStatus,
        String linkedSlipNo,
        LocalDate validUntil,
        BigDecimal totalSupplyAmount,
        BigDecimal totalVatAmount,
        BigDecimal totalAmount,
        int unresolvedLineCount
) {
}
