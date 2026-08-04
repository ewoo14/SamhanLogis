package com.samhanair.logis.accounting.web.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/** 거래처별 원장 read 응답 — 출고 판매전표와 입금보고서만 포함한다. */
public record PartnerLedgerResponse(
        String partnerCode,
        String partnerName,
        String partnerBusinessNo,
        LocalDate periodFrom,
        LocalDate periodTo,
        BigDecimal openingBalance,
        BigDecimal salesTotal,
        BigDecimal paymentTotal,
        BigDecimal closingBalance,
        List<Document> documents) {

    public PartnerLedgerResponse(String partnerCode, String partnerName,
                                 LocalDate periodFrom, LocalDate periodTo,
                                 List<Document> documents) {
        this(partnerCode, partnerName, null, periodFrom, periodTo,
                BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, documents);
    }

    public PartnerLedgerResponse(String partnerCode, String partnerName, String partnerBusinessNo,
                                 LocalDate periodFrom, LocalDate periodTo,
                                 List<Document> documents) {
        this(partnerCode, partnerName, partnerBusinessNo, periodFrom, periodTo,
                BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, documents);
    }

    public PartnerLedgerResponse {
        openingBalance = openingBalance == null ? BigDecimal.ZERO : openingBalance;
        salesTotal = salesTotal == null ? BigDecimal.ZERO : salesTotal;
        paymentTotal = paymentTotal == null ? BigDecimal.ZERO : paymentTotal;
        closingBalance = closingBalance == null ? BigDecimal.ZERO : closingBalance;
        documents = documents == null ? List.of() : List.copyOf(documents);
    }

    public record Document(
            String type,
            String documentNo,
            LocalDate date,
            String partnerCode,
            String partnerName,
            String deliveryAddress,
            BigDecimal amount,
            List<Line> lines,
            String accountCode,
            String description,
            BigDecimal debit,
            BigDecimal credit) {
        public Document(String type, String documentNo, LocalDate date, String partnerCode,
                        String partnerName, String deliveryAddress, BigDecimal amount,
                        List<Line> lines) {
            this(type, documentNo, date, partnerCode, partnerName, deliveryAddress, amount, lines,
                    null, null, null, null);
        }

        public Document {
            amount = amount == null ? BigDecimal.ZERO : amount;
            lines = lines == null ? List.of() : List.copyOf(lines);
            debit = debit == null ? BigDecimal.ZERO : debit;
            credit = credit == null ? BigDecimal.ZERO : credit;
        }
    }

    public record Line(String productName, String modelName, int quantity,
                       BigDecimal unitPriceWithVat, BigDecimal lineAmount) {
    }
}
