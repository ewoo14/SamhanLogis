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
        List<Document> documents) {

    public PartnerLedgerResponse(String partnerCode, String partnerName,
                                 LocalDate periodFrom, LocalDate periodTo,
                                 List<Document> documents) {
        this(partnerCode, partnerName, null, periodFrom, periodTo, documents);
    }

    public PartnerLedgerResponse {
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
            List<Line> lines) {
        public Document {
            lines = lines == null ? List.of() : List.copyOf(lines);
        }
    }

    public record Line(String productName, String modelName, int quantity,
                       BigDecimal unitPriceWithVat, BigDecimal lineAmount) {
    }
}
