package com.samhanair.logis.accounting.web.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;

/** 입금보고서 분할 행 요청. UUID는 사용자 계약에 포함하지 않는다. */
public record CashReceiptLineRequest(
        @Size(max = 100, message = "행 partnerCode 는 최대 100자입니다") String partnerCode,
        @Size(max = 30, message = "행 bizNo 는 최대 30자입니다") String bizNo,
        @Size(max = 100, message = "행 partnerName 는 최대 100자입니다") String partnerName,
        @DecimalMin(value = "0.01", message = "행 amount 는 0보다 커야 합니다") BigDecimal amount,
        @Size(max = 494, message = "행 memo 는 최대 494자입니다") String memo) {
}
