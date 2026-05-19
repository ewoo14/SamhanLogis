package com.samhanair.logis.accounting.web.dto;

import java.math.BigDecimal;
import java.util.List;

public record InboundTaxInvoiceResponse(
        String taxInvoiceNo,
        String partnerCode,
        String partnerName,
        BigDecimal totalSupplyAmount,
        BigDecimal totalVatAmount,
        BigDecimal totalAmount,
        int linkedPurchaseSlipCount,
        List<String> linkedPurchaseSlipNos,
        String status,
        List<AttachmentResponse> attachments
) {
    public record AttachmentResponse(
            String filename,
            String minioObjectKey,
            String contentType,
            long sizeBytes
    ) {}
}
