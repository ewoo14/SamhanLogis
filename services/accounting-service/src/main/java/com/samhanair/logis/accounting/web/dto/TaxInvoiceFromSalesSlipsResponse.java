package com.samhanair.logis.accounting.web.dto;

import java.math.BigDecimal;
import java.util.List;

public record TaxInvoiceFromSalesSlipsResponse(
        String taxInvoiceNo,
        String partnerCode,
        String partnerName,
        BigDecimal totalSupplyAmount,
        BigDecimal totalVatAmount,
        BigDecimal totalAmount,
        int linkedSalesSlipCount,
        List<String> linkedSalesSlipNos,
        String status
) {}
