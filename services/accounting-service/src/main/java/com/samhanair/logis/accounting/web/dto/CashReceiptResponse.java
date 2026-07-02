package com.samhanair.logis.accounting.web.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.samhanair.logis.accounting.domain.CashReceipt;
import com.samhanair.logis.accounting.domain.CashReceiptKind;
import com.samhanair.logis.accounting.domain.CashReceiptStatus;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

/** 입금보고서 응답. UUID 는 mutation 식별자이며 화면 표시 키는 slipNo 다. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record CashReceiptResponse(
        UUID id,
        String slipNo,
        UUID partnerId,
        BigDecimal amount,
        LocalDate transactionDate,
        CashReceiptKind kind,
        CashReceiptStatus status,
        String memo,
        UUID journalId,
        String externalRef,
        String debitAccountCode,
        String creditAccountCode
) {
    public static CashReceiptResponse of(CashReceipt receipt) {
        return new CashReceiptResponse(
                receipt.getId(),
                receipt.getSlipNo(),
                receipt.getPartnerId(),
                receipt.getAmount(),
                receipt.getTransactionDate(),
                receipt.getKind(),
                receipt.getStatus(),
                receipt.getMemo(),
                receipt.getJournalId(),
                receipt.getExternalRef(),
                receipt.getDebitAccountCode(),
                receipt.getCreditAccountCode());
    }
}
