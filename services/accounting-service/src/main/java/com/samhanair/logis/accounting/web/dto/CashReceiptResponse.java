package com.samhanair.logis.accounting.web.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.samhanair.logis.accounting.domain.CashReceipt;
import com.samhanair.logis.accounting.domain.CashReceiptKind;
import com.samhanair.logis.accounting.domain.CashReceiptStatus;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import java.util.List;

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
        String creditAccountCode,
        List<CashReceiptLineResponse> lines
) {
    public static CashReceiptResponse of(CashReceipt receipt, PartnerDisplay partner,
                                         String journalNo, String reverseJournalNo,
                                         List<CashReceiptLineResponse> lines) {
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
                receipt.getCreditAccountCode(), lines);
    }

    /** 같은 응답 형태를 유지하되 신규 통장연계 생성 응답에서는 mutation UUID 를 노출하지 않는다. */
    public CashReceiptResponse withoutId() {
        return new CashReceiptResponse(
                null,
                slipNo,
                partnerCode,
                bizNo,
                partnerName,
                amount,
                transactionDate,
                kind,
                status,
                memo,
                journalNo,
                reverseJournalNo,
                externalRef,
                debitAccountCode,
                creditAccountCode,
                lines);
    }

    /** API 표시용 거래처 정보. */
    public record PartnerDisplay(String partnerCode, String bizNo, String partnerName) {
    }
}
