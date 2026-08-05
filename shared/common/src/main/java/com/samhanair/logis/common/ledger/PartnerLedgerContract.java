package com.samhanair.logis.common.ledger;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.List;
import java.util.Objects;

/**
 * 거래처 원장 산출기의 공통 업무 계약. public 응답에는 UUID를 포함하지 않는다.
 *
 * <p>집계·상세·인쇄·snapshot은 이 계약의 {@link #fold(Collection, BigDecimal)} 결과를
 * 공유한다. 화면별로 문서 종류를 추론해 차변/대변을 만들 수 없다.
 */
public final class PartnerLedgerContract {
    /** R22 개발책임자 결정의 원장 판매 상태 집합. */
    public static final List<String> CANONICAL_SALE_STATUSES = List.of(
            "CONFIRMED", "DELIVERED", "COMPLETED", "INSPECTING", "SHIPPING");

    /** 원장 read model이 공개할 문서 종류. */
    public enum DocumentType { SALE, SALE_SUMMARY, CASH_RECEIPT, JOURNAL_ONLY }

    /** 문서가 원장 산식에 미치는 업무 효과. 문서 타입과 효과를 재추론하지 않도록 분리한다. */
    public enum Effect { SALE, PAYMENT, ADJUSTMENT, NONE }

    /** 한 문서의 표시 금액과 원장 방향. journal-only는 분개 방향을 그대로 보관한다. */
    public record Entry(DocumentType type, BigDecimal amount,
                        BigDecimal debit, BigDecimal credit, Effect effect) {
        public Entry(DocumentType type, BigDecimal amount, BigDecimal debit, BigDecimal credit) {
            this(type, amount, debit, credit, defaultEffect(type));
        }

        public Entry {
            type = Objects.requireNonNull(type, "type");
            amount = amount == null ? BigDecimal.ZERO : amount;
            debit = debit == null ? BigDecimal.ZERO : debit;
            credit = credit == null ? BigDecimal.ZERO : credit;
            effect = effect == null ? Effect.NONE : effect;
            if (debit.signum() < 0 || credit.signum() < 0) {
                throw new IllegalArgumentException("debit/credit 금액은 음수일 수 없습니다");
            }
            Direction expected = switch (type) {
                case SALE, SALE_SUMMARY -> PartnerLedgerContract.direction(amount);
                case CASH_RECEIPT -> PartnerLedgerContract.direction(amount.negate());
                case JOURNAL_ONLY -> null;
            };
            if (expected != null && (expected.debit().compareTo(debit) != 0
                    || expected.credit().compareTo(credit) != 0)) {
                throw new IllegalArgumentException(type + " 금액과 차변/대변 방향이 일치하지 않습니다");
            }
        }

        private static Effect defaultEffect(DocumentType type) {
            return switch (type) {
                case SALE, SALE_SUMMARY -> Effect.SALE;
                case CASH_RECEIPT -> Effect.PAYMENT;
                case JOURNAL_ONLY -> Effect.NONE;
            };
        }

        /** VAT 포함 판매전표 금액을 원장 차변 효과로 투영한다. */
        public static Entry sale(BigDecimal amount) {
            Direction direction = PartnerLedgerContract.direction(amount);
            return new Entry(DocumentType.SALE, amount, direction.debit(), direction.credit());
        }

        /** slip 없는 매출을 VAT 포함 문서금액의 판매 요약으로 투영한다. */
        public static Entry saleSummary(BigDecimal amount) {
            Direction direction = PartnerLedgerContract.direction(amount);
            return new Entry(DocumentType.SALE_SUMMARY, amount, direction.debit(), direction.credit());
        }

        /** 확정 수금을 원장 대변 효과로 투영한다. 음수 수금은 방향이 반전된다. */
        public static Entry cashReceipt(BigDecimal amount) {
            BigDecimal value = amount == null ? BigDecimal.ZERO : amount.negate();
            Direction direction = PartnerLedgerContract.direction(value);
            return new Entry(DocumentType.CASH_RECEIPT, amount, direction.debit(), direction.credit());
        }

        /** 판매전표가 없는 legacy 분개를 사용자 판매전표로 위장하지 않고 보관한다. */
        public static Entry journalOnly(BigDecimal amount, BigDecimal debit, BigDecimal credit) {
            return new Entry(DocumentType.JOURNAL_ONLY, amount, debit, credit);
        }
    }

    /** 양수 movement는 차변, 음수 movement는 대변으로 표시한다. */
    public record Direction(BigDecimal debit, BigDecimal credit) { }

    /** 세 화면이 공유하는 원장 fold 결과. */
    public record Totals(BigDecimal openingBalance, BigDecimal salesTotal, BigDecimal paymentTotal,
                         BigDecimal adjustmentTotal,
                         BigDecimal periodDelta, BigDecimal closingBalance) { }

    /**
     * 한 문서 집합을 한 번만 접어 화면 합계와 기말잔액을 계산한다.
     *
     * <p>정상 판매와 SALE_SUMMARY는 반드시 VAT 포함 문서금액이며, JOURNAL_ONLY는
     * 표시용 분개로 합계에 영향을 주지 않는다. 기말잔액은 계약 산식으로만 계산한다.
     */
    public static Totals fold(Collection<Entry> entries, BigDecimal openingBalance) {
        BigDecimal sales = BigDecimal.ZERO;
        BigDecimal payments = BigDecimal.ZERO;
        BigDecimal adjustments = BigDecimal.ZERO;
        BigDecimal delta = BigDecimal.ZERO;
        if (entries != null) {
            for (Entry entry : entries) {
                if (entry == null) continue;
                if (entry.effect() == Effect.SALE) {
                    sales = sales.add(entry.amount());
                }
                if (entry.effect() == Effect.PAYMENT) {
                    payments = payments.add(entry.amount());
                }
                if (entry.effect() == Effect.ADJUSTMENT) {
                    adjustments = adjustments.add(entry.amount());
                }
            }
        }
        BigDecimal opening = openingBalance == null ? BigDecimal.ZERO : openingBalance;
        delta = sales.add(adjustments).subtract(payments);
        return new Totals(opening, sales, payments, adjustments, delta, opening.add(delta));
    }

    /** signed movement를 음수 금액 없이 차변/대변 칸으로 투영한다. */
    public static Direction direction(BigDecimal signedMovement) {
        BigDecimal value = signedMovement == null ? BigDecimal.ZERO : signedMovement;
        return value.signum() >= 0
                ? new Direction(value, BigDecimal.ZERO)
                : new Direction(BigDecimal.ZERO, value.abs());
    }

    private PartnerLedgerContract() { }
}
