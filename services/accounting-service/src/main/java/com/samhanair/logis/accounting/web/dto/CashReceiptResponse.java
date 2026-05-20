package com.samhanair.logis.accounting.web.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/** MIG-14 입금보고서 admin 조회 응답. 내부 UUID 는 노출하지 않는다. */
public record CashReceiptResponse(
        String slipNo,
        String partnerName,
        BigDecimal amount,
        LocalDate transactionDate,
        String kind,
        String memo,
        String journalNo
) {
}
