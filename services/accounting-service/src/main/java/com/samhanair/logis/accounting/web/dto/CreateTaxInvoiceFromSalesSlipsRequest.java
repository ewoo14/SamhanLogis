package com.samhanair.logis.accounting.web.dto;

import java.util.List;
import java.util.UUID;

public record CreateTaxInvoiceFromSalesSlipsRequest(
        List<UUID> salesSlipIds,
        String issuedDate
) {}
