package com.samhanair.logis.accounting.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import com.samhanair.logis.common.ledger.PartnerLedgerContract;

/** 집계·상세·인쇄가 공유하는 거래처 원장 산출 결과. UUID는 내부 조인 전용이다. */
public record PartnerLedgerReadModel(List<Partner> partners, Partner selected) {
    public PartnerLedgerReadModel {
        partners = partners == null ? List.of() : List.copyOf(partners);
    }

    public record Partner(UUID partnerId, String partnerCode, String partnerName, String businessNumber,
                          List<Document> documents, BigDecimal salesTotal, BigDecimal paymentTotal,
                          BigDecimal openingBalance, BigDecimal receivableBalance) {
        public Partner(UUID partnerId, String partnerCode, String partnerName, String businessNumber,
                       List<Document> documents, BigDecimal salesTotal, BigDecimal paymentTotal,
                       BigDecimal receivableBalance) {
            this(partnerId, partnerCode, partnerName, businessNumber, documents, salesTotal,
                    paymentTotal, BigDecimal.ZERO, receivableBalance);
        }

        public Partner {
            documents = documents == null ? List.of() : List.copyOf(documents);
            salesTotal = salesTotal == null ? BigDecimal.ZERO : salesTotal;
            paymentTotal = paymentTotal == null ? BigDecimal.ZERO : paymentTotal;
            openingBalance = openingBalance == null ? BigDecimal.ZERO : openingBalance;
            receivableBalance = receivableBalance == null ? BigDecimal.ZERO : receivableBalance;
        }
    }

    /** SALE_SUMMARY는 신규 slip 없는 매출과 구형 snapshot 양쪽에서 허용한다. */
    public enum DocumentType { SALE, SALE_SUMMARY, CASH_RECEIPT, JOURNAL_ONLY }

    public record Document(DocumentType type, String documentNo, LocalDate date, String partnerCode,
                           String partnerName, String deliveryAddress, BigDecimal amount,
                           List<Line> lines, String accountCode, String description,
                           BigDecimal debit, BigDecimal credit) {
        public Document(DocumentType type, String documentNo, LocalDate date, String partnerCode,
                        String partnerName, String deliveryAddress, BigDecimal amount,
                        List<Line> lines) {
            this(type, documentNo, date, partnerCode, partnerName, deliveryAddress, amount, lines,
                    null, null, defaultDebit(type, amount), defaultCredit(type, amount));
        }

        public Document {
            lines = lines == null ? List.of() : List.copyOf(lines);
            amount = amount == null ? BigDecimal.ZERO : amount;
            debit = debit == null ? BigDecimal.ZERO : debit;
            credit = credit == null ? BigDecimal.ZERO : credit;
        }

        private static BigDecimal defaultDebit(DocumentType type, BigDecimal amount) {
            BigDecimal value = amount == null ? BigDecimal.ZERO : amount;
            if (type == DocumentType.CASH_RECEIPT) {
                return PartnerLedgerContract.direction(value.negate()).debit();
            }
            return PartnerLedgerContract.direction(value).debit();
        }

        private static BigDecimal defaultCredit(DocumentType type, BigDecimal amount) {
            BigDecimal value = amount == null ? BigDecimal.ZERO : amount;
            if (type == DocumentType.CASH_RECEIPT) {
                return PartnerLedgerContract.direction(value.negate()).credit();
            }
            return PartnerLedgerContract.direction(value).credit();
        }
    }

    public record Line(String productName, String modelName, int quantity,
                       BigDecimal unitPriceWithVat, BigDecimal lineAmount) { }
}
