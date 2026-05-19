package com.samhanair.logis.accounting.web.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public record SalesAccountingSlipResponse(
        String slipNo,
        LocalDate slipDate,
        String partnerCode,
        String partnerName,
        String taxType,
        String status,
        BigDecimal totalSupplyAmount,
        BigDecimal totalVatAmount,
        BigDecimal totalAmount,
        String memo,
        List<LineResponse> lines
) {
    public record LineResponse(
            int lineNo,
            String productCode,
            String productName,
            BigDecimal qty,
            BigDecimal unitPrice,
            BigDecimal supplyAmount,
            BigDecimal vatAmount,
            BigDecimal lineTotal,
            List<AllocationResponse> allocations
    ) {}

    public record AllocationResponse(
            String sourceSlipNo,
            int sourceLineNo,
            BigDecimal allocatedQty,
            BigDecimal allocatedAmount
    ) {}
}
