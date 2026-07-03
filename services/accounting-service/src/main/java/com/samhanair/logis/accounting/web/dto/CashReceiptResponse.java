package com.samhanair.logis.accounting.web.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.samhanair.logis.accounting.domain.CashReceipt;
import com.samhanair.logis.accounting.domain.CashReceiptKind;
import com.samhanair.logis.accounting.domain.CashReceiptStatus;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

/** 입금보고서 응답. id 는 mutation path 용이며 화면 표시는 slipNo/거래처 표시필드를 사용한다. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record CashReceiptResponse(
        UUID id,
        String slipNo,
        String partnerCode,
        String bizNo,
        String partnerName,
        BigDecimal amount,
        LocalDate transactionDate,
        CashReceiptKind kind,
        CashReceiptStatus status,
        String memo,
        String journalNo,
        String reverseJournalNo,
        String externalRef,
        String debitAccountCode,
        String creditAccountCode
) {
    public static CashReceiptResponse of(CashReceipt receipt, PartnerDisplay partner,
                                         String journalNo, String reverseJournalNo) {
        return new CashReceiptResponse(
                receipt.getId(),
                receipt.getSlipNo(),
                partner.partnerCode(),
                partner.bizNo(),
                partner.partnerName(),
                receipt.getAmount(),
                receipt.getTransactionDate(),
                receipt.getKind(),
                receipt.getStatus(),
                receipt.getMemo(),
                journalNo,
                reverseJournalNo,
                receipt.getExternalRef(),
                receipt.getDebitAccountCode(),
                receipt.getCreditAccountCode());
    }

    /** API 표시용 거래처 정보. */
    public record PartnerDisplay(String partnerCode, String bizNo, String partnerName) {
    }
}
