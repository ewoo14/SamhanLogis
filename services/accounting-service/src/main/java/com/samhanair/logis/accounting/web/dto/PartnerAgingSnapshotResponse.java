package com.samhanair.logis.accounting.web.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** MIG-14 거래처 aging materialized view 조회 응답. 내부 partner UUID 는 노출하지 않는다. */
public record PartnerAgingSnapshotResponse(
        String partnerName,
        BigDecimal totalReceivable,
        BigDecimal totalPayable,
        BigDecimal totalReceipt,
        BigDecimal totalDisbursement,
        BigDecimal netReceivable,
        BigDecimal netPayable,
        BigDecimal netCash,
        LocalDateTime lastRefreshedAt
) {
}
