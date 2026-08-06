package com.samhanair.logis.accounting.web.dto;

import java.math.BigDecimal;

/** 입금보고서 분할 행 응답. 내부 거래처 UUID는 노출하지 않는다. */
public record CashReceiptLineResponse(
        String partnerCode,
        String bizNo,
        String partnerName,
        BigDecimal amount,
        String memo) {
}
