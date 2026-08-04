package com.samhanair.logis.common.ledger;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 거래처 원장 원자 evidence의 유일한 문서 분류 계약.
 *
 * <p>기간 합계가 아니라 sourceKey로 묶인 문서 단위를 판정한다. 호출자는 이 결과를
 * 기초와 기간에 동일하게 공급해야 하며, public 응답에는 sourceKey를 노출하지 않는다.
 */
public final class PartnerLedgerCollectionContract {
    private static final String REVENUE = "401";
    private static final String RECEIVABLES = "110";

    public record Evidence(String sourceKey, LocalDate date, String sourceType, String sourceRefKey,
                           String accountCode, BigDecimal debit, BigDecimal credit,
                           boolean systemSeed, boolean canonicalSlip) {
        public Evidence {
            if (sourceKey == null || sourceKey.isBlank()) throw new IllegalArgumentException("sourceKey 필수");
            date = date == null ? LocalDate.MIN : date;
            debit = debit == null ? BigDecimal.ZERO : debit;
            credit = credit == null ? BigDecimal.ZERO : credit;
            accountCode = accountCode == null ? "" : accountCode;
        }

        public static Evidence slip(String sourceKey, LocalDate date, BigDecimal amount) {
            return new Evidence(sourceKey, date, "SLIP", sourceKey, "SLIP", amount, BigDecimal.ZERO,
                    false, true);
        }

        public static Evidence journal(String sourceKey, LocalDate date, String sourceType,
                                       String sourceRefKey, String accountCode,
                                       BigDecimal debit, BigDecimal credit, boolean systemSeed) {
            return new Evidence(sourceKey, date, sourceType, sourceRefKey, accountCode,
                    debit, credit, systemSeed, false);
        }
    }

    public record Classified(String sourceKey, LocalDate date, PartnerLedgerContract.DocumentType type,
                             PartnerLedgerContract.Effect effect, BigDecimal amount,
                             BigDecimal debit, BigDecimal credit) { }

    public static List<Classified> classify(Collection<Evidence> evidence) {
        Map<String, Bundle> bundles = new LinkedHashMap<>();
        if (evidence != null) {
            for (Evidence item : evidence) {
                if (item == null) continue;
                Bundle bundle = bundles.computeIfAbsent(item.sourceKey(), ignored -> new Bundle(item));
                bundle.add(item);
            }
        }
        List<Classified> result = new ArrayList<>();
        for (Bundle bundle : bundles.values()) result.add(bundle.classify());
        return List.copyOf(result);
    }

    public static List<PartnerLedgerContract.Entry> toEntries(Collection<Classified> documents) {
        if (documents == null) return List.of();
        return documents.stream().map(document -> new PartnerLedgerContract.Entry(
                document.type(), document.amount(), document.debit(), document.credit(), document.effect())).toList();
    }

    private static BigDecimal zero(BigDecimal value) { return value == null ? BigDecimal.ZERO : value; }

    private static final class Bundle {
        private final Evidence first;
        private BigDecimal revenue = BigDecimal.ZERO;
        private BigDecimal receivableDebit = BigDecimal.ZERO;
        private BigDecimal receivableCredit = BigDecimal.ZERO;
        private BigDecimal otherDebit = BigDecimal.ZERO;

        private Bundle(Evidence first) { this.first = first; }

        private void add(Evidence item) {
            BigDecimal debit = zero(item.debit());
            BigDecimal credit = zero(item.credit());
            if (REVENUE.equals(item.accountCode())) revenue = revenue.add(credit).subtract(debit);
            if (RECEIVABLES.equals(item.accountCode())) {
                receivableDebit = receivableDebit.add(debit);
                receivableCredit = receivableCredit.add(credit);
            } else if (!REVENUE.equals(item.accountCode()) && !"SLIP".equals(item.accountCode())) {
                otherDebit = otherDebit.add(debit);
            }
        }

        private Classified classify() {
            if (first.canonicalSlip()) {
                return new Classified(first.sourceKey(), first.date(), PartnerLedgerContract.DocumentType.SALE,
                        PartnerLedgerContract.Effect.SALE, first.debit(), first.debit(), BigDecimal.ZERO);
            }
            if (first.systemSeed()) return none();
            if ("CASH_RECEIPT".equals(first.sourceType())) {
                return payment(receivableCredit.signum() == 0 ? revenue.abs() : receivableCredit);
            }
            if (receivableCredit.signum() > 0 && otherDebit.signum() > 0) return payment(receivableCredit);
            if (receivableDebit.signum() > 0) {
                return new Classified(first.sourceKey(), first.date(), PartnerLedgerContract.DocumentType.SALE_SUMMARY,
                        PartnerLedgerContract.Effect.SALE, receivableDebit, receivableDebit, BigDecimal.ZERO);
            }
            if (revenue.signum() != 0) {
                BigDecimal amount = revenue;
                var direction = PartnerLedgerContract.direction(amount);
                return new Classified(first.sourceKey(), first.date(), PartnerLedgerContract.DocumentType.SALE_SUMMARY,
                        PartnerLedgerContract.Effect.SALE, amount, direction.debit(), direction.credit());
            }
            return none();
        }

        private Classified payment(BigDecimal amount) {
            return new Classified(first.sourceKey(), first.date(), PartnerLedgerContract.DocumentType.JOURNAL_ONLY,
                    PartnerLedgerContract.Effect.PAYMENT, amount, BigDecimal.ZERO, amount);
        }

        private Classified none() {
            return new Classified(first.sourceKey(), first.date(), PartnerLedgerContract.DocumentType.JOURNAL_ONLY,
                    PartnerLedgerContract.Effect.NONE, revenue, BigDecimal.ZERO, BigDecimal.ZERO);
        }
    }

    private PartnerLedgerCollectionContract() { }
}
