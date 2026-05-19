package com.samhanair.logis.accounting.web.dto;

import com.samhanair.logis.accounting.domain.SalesAccountingSlip;
import com.samhanair.logis.accounting.domain.SalesAccountingSlipAllocation;
import com.samhanair.logis.accounting.domain.SalesAccountingSlipLine;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public record SalesAccountingSlipResponse(
        String id,
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

    public static SalesAccountingSlipResponse of(SalesAccountingSlip slip) {
        List<LineResponse> lines = slip.getLines().stream()
                .map(SalesAccountingSlipResponse::toLineResponse)
                .toList();
        return new SalesAccountingSlipResponse(
                slip.getId() != null ? slip.getId().toString() : null,
                slip.getSlipNo(),
                slip.getSlipDate(),
                slip.getPartnerCode(),
                slip.getPartnerName(),
                slip.getTaxType().name(),
                slip.getStatus().name(),
                slip.getTotalSupplyAmount(),
                slip.getTotalVatAmount(),
                slip.getTotalAmount(),
                slip.getMemo(),
                lines);
    }

    private static LineResponse toLineResponse(SalesAccountingSlipLine line) {
        return new LineResponse(
                line.getLineNo(),
                line.getProductCode(),
                line.getProductName(),
                line.getQty(),
                line.getUnitPrice(),
                line.getSupplyAmount(),
                line.getVatAmount(),
                line.getLineTotal(),
                line.getAllocations().stream()
                        .map(SalesAccountingSlipResponse::toAllocationResponse)
                        .toList());
    }

    private static AllocationResponse toAllocationResponse(SalesAccountingSlipAllocation allocation) {
        return new AllocationResponse(
                allocation.getSourceSlipNo(),
                allocation.getSourceLineNo(),
                allocation.getAllocatedQty(),
                allocation.getAllocatedAmount());
    }
}
