package com.samhanair.logis.accounting.web.dto;

import com.samhanair.logis.accounting.domain.PurchaseAccountingSlip;
import com.samhanair.logis.accounting.domain.PurchaseAccountingSlipAllocation;
import com.samhanair.logis.accounting.domain.PurchaseAccountingSlipLine;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public record PurchaseAccountingSlipResponse(
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

    public static PurchaseAccountingSlipResponse of(PurchaseAccountingSlip slip) {
        List<LineResponse> lines = slip.getLines().stream()
                .map(PurchaseAccountingSlipResponse::toLineResponse)
                .toList();
        return new PurchaseAccountingSlipResponse(
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

    private static LineResponse toLineResponse(PurchaseAccountingSlipLine line) {
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
                        .map(PurchaseAccountingSlipResponse::toAllocationResponse)
                        .toList());
    }

    private static AllocationResponse toAllocationResponse(PurchaseAccountingSlipAllocation allocation) {
        return new AllocationResponse(
                allocation.getSourceSlipNo(),
                allocation.getSourceLineNo(),
                allocation.getAllocatedQty(),
                allocation.getAllocatedAmount());
    }
}
