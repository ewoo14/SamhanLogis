package com.samhanair.logis.accounting.web.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

/** 입금보고서 수기 생성/수정 요청. */
public record CashReceiptRequest(
        @NotNull(message = "partnerId 는 필수입니다")
        UUID partnerId,

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
