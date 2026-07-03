package com.samhanair.logis.accounting.web.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.List;

/** 통장거래 N건을 입금보고서 1건으로 확정 생성하는 요청. */
public record BankDepositReceiptRequest(
        @NotEmpty(message = "transactions 는 1건 이상이어야 합니다")
        @Size(max = 100, message = "transactions 는 최대 100건입니다")
        List<@NotNull @Valid BankTransactionNaturalKeyRequest> transactions,

        @NotNull(message = "transactionDate 는 필수입니다")
        LocalDate transactionDate,

        @Size(max = 494, message = "memo 는 최대 494자입니다")
        String memo,

        @Size(max = 20, message = "debitAccountCode 는 최대 20자입니다")
        String debitAccountCode,

        @Size(max = 20, message = "creditAccountCode 는 최대 20자입니다")
        String creditAccountCode
) {
}
