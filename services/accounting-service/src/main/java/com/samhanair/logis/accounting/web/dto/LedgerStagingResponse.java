package com.samhanair.logis.accounting.web.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/** MIG-14 이카운트 매출장/매입장 staging 조회 응답. */
public record LedgerStagingResponse(
        String transactionRef,
        LocalDate transactionDate,
        Integer sequenceNo,
        String transactionType,
        String electronicType,
        String partnerCode,
        String partnerName,
        String description,
        BigDecimal supplyAmount,
        BigDecimal vatAmount,
        BigDecimal totalAmount,
        String transformStatus,
        String rejectReason,
        LocalDateTime importedAt,
        BigDecimal rawDailyTotal,
        BigDecimal closingDailyTotal,
        BigDecimal dailyDiff
) {
}
