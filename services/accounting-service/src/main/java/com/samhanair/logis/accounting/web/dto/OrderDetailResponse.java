package com.samhanair.logis.accounting.web.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/** MIG-14 주문서 상세 admin 조회 응답. 내부 UUID 는 노출하지 않는다. */
public record OrderDetailResponse(
        String orderNo,
        String partnerName,
        String managerName,
        String progressStatus,
        String linkedSlipNo,
        LocalDate validUntil,
        String paymentTerms,
        String reference,
        BigDecimal totalSupplyAmount,
        BigDecimal totalVatAmount,
        BigDecimal totalAmount,
        List<LineResponse> lines
) {
    public record LineResponse(
            int lineNo,
            String itemName,
            BigDecimal quantity,
            BigDecimal unitPrice,
            BigDecimal supplyAmount,
            BigDecimal vatAmount,
            BigDecimal lineTotal,
            LocalDate itemDueDate,
            boolean unresolved
    ) {
    }
}
