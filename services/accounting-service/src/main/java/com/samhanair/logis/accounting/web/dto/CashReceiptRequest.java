package com.samhanair.logis.accounting.web.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;

/** 입금보고서 수기 생성/수정 요청. */
public record CashReceiptRequest(
        @Size(max = 50, message = "partnerCode 는 최대 50자입니다")
        String partnerCode,

        @Size(max = 30, message = "bizNo 는 최대 30자입니다")
        String bizNo,

        @Size(max = 100, message = "partnerName 는 최대 100자입니다")
        String partnerName,

        @NotNull(message = "amount 는 필수입니다")
        @DecimalMin(value = "0.01", message = "amount 는 0보다 커야 합니다")
        BigDecimal amount,

        @NotNull(message = "transactionDate 는 필수입니다")
        LocalDate transactionDate,

        String memo,

        @Size(max = 20, message = "debitAccountCode 는 최대 20자입니다")
        String debitAccountCode,

        @Size(max = 20, message = "creditAccountCode 는 최대 20자입니다")
        String creditAccountCode
) {
}
