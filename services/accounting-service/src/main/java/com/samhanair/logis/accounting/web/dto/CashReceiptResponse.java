package com.samhanair.logis.accounting.web.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.samhanair.logis.accounting.domain.CashReceipt;
import com.samhanair.logis.accounting.domain.CashReceiptKind;
import com.samhanair.logis.accounting.domain.CashReceiptStatus;
import java.math.BigDecimal;
import java.time.LocalDate;

/** 입금보고서 응답. 내부 partnerId/journalId 대신 화면 표시 식별자만 반환한다. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record CashReceiptResponse(
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
        String externalRef,
        String debitAccountCode,
        String creditAccountCode
) {
    public static CashReceiptResponse of(CashReceipt receipt, PartnerDisplay partner, String journalNo) {
        return new CashReceiptResponse(
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
                receipt.getExternalRef(),
                receipt.getDebitAccountCode(),
                receipt.getCreditAccountCode());
    }

    /** API 표시용 거래처 정보. */
    public record PartnerDisplay(String partnerCode, String bizNo, String partnerName) {
    }
}
