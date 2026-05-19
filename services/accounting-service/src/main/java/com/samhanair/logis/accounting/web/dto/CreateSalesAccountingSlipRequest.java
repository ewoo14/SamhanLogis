package com.samhanair.logis.accounting.web.dto;

import com.samhanair.logis.accounting.domain.SalesTaxType;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record CreateSalesAccountingSlipRequest(
        LocalDate slipDate,
        UUID partnerId,
        String partnerCode,
        String partnerName,
        SalesTaxType taxType,
        String memo,
        List<LineRequest> lines
) {
    public record LineRequest(
            String productCode,
            String productName,
            BigDecimal qty,
            BigDecimal unitPrice,
            List<AllocationRequest> allocations
    ) {}

    public record AllocationRequest(
            UUID sourceSlipId,
            String sourceSlipNo,
            UUID sourceLineId,
            int sourceLineNo,
            BigDecimal allocatedQty,
            BigDecimal allocatedAmount
    ) {}
}
