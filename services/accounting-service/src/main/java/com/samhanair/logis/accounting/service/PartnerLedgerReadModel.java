package com.samhanair.logis.accounting.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** 집계·상세·인쇄가 공유하는 거래처 원장 산출 결과. UUID는 내부 조인 전용이다. */
public record PartnerLedgerReadModel(List<Partner> partners, Partner selected) {
    public PartnerLedgerReadModel {
        partners = partners == null ? List.of() : List.copyOf(partners);
    }

    public record Partner(UUID partnerId, String partnerCode, String partnerName, String businessNumber,
                          List<Document> documents, BigDecimal salesTotal, BigDecimal paymentTotal,
                          BigDecimal receivableBalance) {
        public Partner {
            documents = documents == null ? List.of() : List.copyOf(documents);
            salesTotal = salesTotal == null ? BigDecimal.ZERO : salesTotal;
            paymentTotal = paymentTotal == null ? BigDecimal.ZERO : paymentTotal;
            receivableBalance = receivableBalance == null ? BigDecimal.ZERO : receivableBalance;
        }
    }

    public enum DocumentType { SALE, SALE_SUMMARY, CASH_RECEIPT }

    public record Document(DocumentType type, String documentNo, LocalDate date, String partnerCode,
                           String partnerName, String deliveryAddress, BigDecimal amount,
                           List<Line> lines) {
        public Document {
            lines = lines == null ? List.of() : List.copyOf(lines);
        }
    }

    public record Line(String productName, String modelName, int quantity,
                       BigDecimal unitPriceWithVat, BigDecimal lineAmount) { }
}
