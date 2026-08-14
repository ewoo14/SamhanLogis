package com.samhanair.logis.accounting.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Objects;

/** 거래처별 원장에 표시할 문서 원천을 두 종류로 제한하는 순수 read 조합기. */
public final class PartnerLedgerDocumentMerger {

    /** 원장에 허용되는 문서 종류. */
    public enum Type {
        SALE,
        CASH_RECEIPT,
        OTHER
    }

    /** 원장 표시용 품목 라인. 금액은 VAT 포함 단가×수량의 권위 결과다. */
    public record Line(String productName, int quantity, BigDecimal unitPriceWithVat,
                       BigDecimal lineAmount) {
    }

    /** 출고전표/입금보고서 공통 원장 행. */
    public record Document(Type type, String documentNo, LocalDate date, String partnerCode,
                           String partnerName, String deliveryAddress, BigDecimal amount,
                           List<Line> lines) {
        public Document(Type type, String documentNo, LocalDate date, String partnerCode,
                        String partnerName, String deliveryAddress, List<Line> lines) {
            this(type, documentNo, date, partnerCode, partnerName, deliveryAddress, null, lines);
        }

        public Document {
            lines = lines == null ? List.of() : List.copyOf(lines);
        }
    }

    /** 출고전표와 입금보고서만 보존한다. 주소는 원본 구조화 필드 그대로 유지한다. */
    public List<Document> merge(List<Document> documents) {
        if (documents == null) {
            return List.of();
        }
        return documents.stream()
                .filter(Objects::nonNull)
                .filter(document -> document.type() == Type.SALE
                        || document.type() == Type.CASH_RECEIPT)
                .toList();
    }
}
