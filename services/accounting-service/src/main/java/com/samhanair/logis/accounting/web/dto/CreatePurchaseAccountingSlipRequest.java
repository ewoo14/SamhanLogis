package com.samhanair.logis.accounting.web.dto;

import com.samhanair.logis.accounting.domain.SalesTaxType;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record CreatePurchaseAccountingSlipRequest(
        LocalDate slipDate,
        UUID partnerId,
        String partnerCode,
        String partnerName,
        SalesTaxType taxType,
        String memo,
        List<@NotNull @Valid LineRequest> lines
) {
    public record LineRequest(
            String productCode,
            String productName,
            BigDecimal qty,
            BigDecimal unitPrice,
            List<@NotNull @Valid AllocationRequest> allocations
    ) {}

    public record AllocationRequest(
            UUID sourceSlipId,
            String sourceSlipNo,
            @NotNull UUID sourceLineId,
            int sourceLineNo,
            @NotNull @Positive @Digits(integer = 9, fraction = 3) BigDecimal allocatedQty,
            @NotNull @Positive @Digits(integer = 13, fraction = 2) BigDecimal allocatedAmount
    ) {}
}
