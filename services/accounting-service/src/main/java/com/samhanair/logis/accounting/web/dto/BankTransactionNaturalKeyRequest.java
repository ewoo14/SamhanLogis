package com.samhanair.logis.accounting.web.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/** 통장거래 UUID 대신 사용하는 자연키 4-키 튜플. */
public record BankTransactionNaturalKeyRequest(
        @NotBlank(message = "bankAccountLabel 은 필수입니다")
        @Size(max = 120, message = "bankAccountLabel 은 최대 120자입니다")
        String bankAccountLabel,

        @NotNull(message = "transactedAt 은 필수입니다")
        LocalDateTime transactedAt,

        @NotNull(message = "amount 는 필수입니다")
        @DecimalMin(value = "0.01", message = "amount 는 0보다 커야 합니다")
        BigDecimal amount,

        @NotBlank(message = "externalRef 는 필수입니다")
        @Size(max = 128, message = "externalRef 는 최대 128자입니다")
        String externalRef
) {
}
