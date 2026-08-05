package com.samhanair.logis.common.ledger;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 거래처 원장 원자 evidence의 유일한 문서 분류 계약.
 *
 * <p>기간 합계가 아니라 sourceKey로 묶인 문서 단위를 판정한다. 호출자는 이 결과를
 * 기초와 기간에 동일하게 공급해야 하며, public 응답에는 sourceKey를 노출하지 않는다.
 */
public final class PartnerLedgerCollectionContract {
    private static final Set<String> LEGACY_REVENUE_CODES = Set.of("401");
    private static final Set<String> LEGACY_RECEIVABLE_CODES = Set.of("110");

    public record Evidence(String sourceKey, LocalDate date, String sourceType, String sourceRefKey,
                           String accountCode, BigDecimal debit, BigDecimal credit,
                           boolean systemSeed, boolean canonicalSlip,
                           BigDecimal effectDebit, BigDecimal effectCredit) {
        public Evidence(String sourceKey, LocalDate date, String sourceType, String sourceRefKey,
                        String accountCode, BigDecimal debit, BigDecimal credit,
                        boolean systemSeed, boolean canonicalSlip) {
            this(sourceKey, date, sourceType, sourceRefKey, accountCode, debit, credit,
                    systemSeed, canonicalSlip, debit, credit);
        }

        public Evidence {
            if (sourceKey == null || sourceKey.isBlank()) throw new IllegalArgumentException("sourceKey 필수");
            date = date == null ? LocalDate.MIN : date;
            debit = debit == null ? BigDecimal.ZERO : debit;
            credit = credit == null ? BigDecimal.ZERO : credit;
            effectDebit = effectDebit == null ? BigDecimal.ZERO : effectDebit;
            effectCredit = effectCredit == null ? BigDecimal.ZERO : effectCredit;
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
        return classify(evidence, LEGACY_RECEIVABLE_CODES, LEGACY_REVENUE_CODES);
    }

    /**
     * 차트 정본의 채권·매출 계정 코드를 주입해 journal bundle을 분류한다.
     *
     * <p>{@link Evidence#debit()}·{@link Evidence#credit()}는 대상 거래처에 귀속된 금액이고,
     * effectDebit/effectCredit는 전표 전체 상대 라인의 금액이다. 두 축을 분리해야 다중 거래처
     * 수수료 전표에서 상대 차변을 effect 판정에 사용하면서도 다른 거래처 금액을 대상 원장에
     * 넣지 않는다.
     */
    public static List<Classified> classify(Collection<Evidence> evidence,
                                            Set<String> receivableCodes,
                                            Set<String> revenueCodes) {
        Set<String> resolvedReceivableCodes = normalizeCodes(receivableCodes, LEGACY_RECEIVABLE_CODES);
        Set<String> resolvedRevenueCodes = normalizeCodes(revenueCodes, LEGACY_REVENUE_CODES);
        Map<String, Bundle> bundles = new LinkedHashMap<>();
        if (evidence != null) {
            for (Evidence item : evidence) {
                if (item == null) continue;
                Bundle bundle = bundles.computeIfAbsent(item.sourceKey(),
                        ignored -> new Bundle(item, resolvedReceivableCodes, resolvedRevenueCodes));
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

    private static Set<String> normalizeCodes(Set<String> codes, Set<String> fallback) {
        if (codes == null || codes.isEmpty()) return fallback;
        return codes.stream().filter(code -> code != null && !code.isBlank()).collect(java.util.stream.Collectors.toUnmodifiableSet());
    }

    private static final class Bundle {
        private final Evidence first;
        private final Set<String> receivableCodes;
        private final Set<String> revenueCodes;
        private BigDecimal attributedRevenue = BigDecimal.ZERO;
        private BigDecimal effectRevenue = BigDecimal.ZERO;
        private BigDecimal receivableDebit = BigDecimal.ZERO;
        private BigDecimal receivableCredit = BigDecimal.ZERO;
        private BigDecimal otherDebit = BigDecimal.ZERO;

        private Bundle(Evidence first, Set<String> receivableCodes, Set<String> revenueCodes) {
            this.first = first;
            this.receivableCodes = receivableCodes;
            this.revenueCodes = revenueCodes;
        }

        private void add(Evidence item) {
            BigDecimal debit = zero(item.debit());
            BigDecimal credit = zero(item.credit());
            BigDecimal effectDebit = zero(item.effectDebit());
            BigDecimal effectCredit = zero(item.effectCredit());
            if (revenueCodes.contains(item.accountCode())) {
                attributedRevenue = attributedRevenue.add(credit).subtract(debit);
                effectRevenue = effectRevenue.add(effectCredit).subtract(effectDebit);
            }
            if (receivableCodes.contains(item.accountCode())) {
                receivableDebit = receivableDebit.add(debit);
                receivableCredit = receivableCredit.add(credit);
            } else if (!revenueCodes.contains(item.accountCode()) && !"SLIP".equals(item.accountCode())) {
                otherDebit = otherDebit.add(effectDebit);
            }
        }

        private Classified classify() {
            if (first.canonicalSlip()) {
                return new Classified(first.sourceKey(), first.date(), PartnerLedgerContract.DocumentType.SALE,
                        PartnerLedgerContract.Effect.SALE, first.debit(), first.debit(), BigDecimal.ZERO);
            }
            if (first.systemSeed()) return none();
            if ("CASH_RECEIPT".equals(first.sourceType())) {
                return payment(receivableCredit.signum() == 0 ? attributedRevenue.abs() : receivableCredit);
            }
            if (receivableCredit.signum() > 0 && otherDebit.signum() > 0) return payment(receivableCredit);
            if (receivableDebit.signum() > 0) {
                return new Classified(first.sourceKey(), first.date(), PartnerLedgerContract.DocumentType.SALE_SUMMARY,
                        PartnerLedgerContract.Effect.SALE, receivableDebit, receivableDebit, BigDecimal.ZERO);
            }
            if (receivableCredit.signum() > 0 && effectRevenue.signum() < 0) {
                BigDecimal amount = receivableCredit.negate();
                var direction = PartnerLedgerContract.direction(amount);
                return new Classified(first.sourceKey(), first.date(), PartnerLedgerContract.DocumentType.SALE_SUMMARY,
                        PartnerLedgerContract.Effect.SALE, amount, direction.debit(), direction.credit());
            }
            if (attributedRevenue.signum() != 0) {
                BigDecimal amount = attributedRevenue;
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
                    PartnerLedgerContract.Effect.NONE, attributedRevenue, BigDecimal.ZERO, BigDecimal.ZERO);
        }
    }

    private PartnerLedgerCollectionContract() { }
}
