package com.samhanair.logis.accounting.web.dto;

import java.util.List;
import java.util.UUID;

public record RegisterInboundTaxInvoiceRequest(
        List<UUID> purchaseSlipIds,
        String issuedDate
) {}
