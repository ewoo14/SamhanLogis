package com.samhanair.logis.common.ledger;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

class PartnerLedgerCollectionContractTest {
    private static final LocalDate DAY = LocalDate.of(2026, 8, 4);

    @Test
    void RED_A1_keepsJournalSaleWhenCanonicalSaleAlsoExists() {
        var evidence = List.of(
                PartnerLedgerCollectionContract.Evidence.slip("slip-1", DAY, new BigDecimal("1100")),
                PartnerLedgerCollectionContract.Evidence.journal("journal-1", DAY, "SLIP", "orphan-1",
                        "401", BigDecimal.ZERO, new BigDecimal("2200"), false));

        var classified = PartnerLedgerCollectionContract.classify(evidence);

        assertThat(classified).extracting(PartnerLedgerCollectionContract.Classified::effect)
                .containsExactly(PartnerLedgerContract.Effect.SALE, PartnerLedgerContract.Effect.SALE);
        assertThat(classified).extracting(PartnerLedgerCollectionContract.Classified::amount)
                .containsExactly(new BigDecimal("1100"), new BigDecimal("2200"));
    }

    @Test
    void RED_A2_limitsSaleSummaryToTheJournalOwnReceivableAmount() {
        var classified = PartnerLedgerCollectionContract.classify(List.of(
                PartnerLedgerCollectionContract.Evidence.journal("journal-2", DAY, "SLIP", "orphan-2",
                        "110", new BigDecimal("3300"), BigDecimal.ZERO, false),
                PartnerLedgerCollectionContract.Evidence.journal("seed-1", DAY, "MANUAL", null,
                        "110", new BigDecimal("7700"), BigDecimal.ZERO, true)));

        assertThat(classified.get(0).amount()).isEqualByComparingTo("3300");
        assertThat(classified.get(1).effect()).isEqualTo(PartnerLedgerContract.Effect.NONE);
    }

    @Test
    void RED_A3_classifiesNonCashReceivableCreditAsPayment() {
        var classified = PartnerLedgerCollectionContract.classify(List.of(
                PartnerLedgerCollectionContract.Evidence.journal("payment-1", DAY, "MANUAL", null,
                        "110", BigDecimal.ZERO, new BigDecimal("7600"), false),
                PartnerLedgerCollectionContract.Evidence.journal("payment-1", DAY, "MANUAL", null,
                        "102", new BigDecimal("7600"), BigDecimal.ZERO, false)));

        assertThat(classified).singleElement()
                .extracting(PartnerLedgerCollectionContract.Classified::effect)
                .isEqualTo(PartnerLedgerContract.Effect.PAYMENT);
    }

    @Test
    void RED_A4_partitioningEvidenceByDateProducesTheSameFoldAsOnePeriod() {
        var all = List.of(
                PartnerLedgerCollectionContract.Evidence.journal("before", DAY.minusDays(1), "SLIP", "a",
                        "401", BigDecimal.ZERO, new BigDecimal("100"), false),
                PartnerLedgerCollectionContract.Evidence.journal("on-boundary", DAY, "SLIP", "b",
                        "401", BigDecimal.ZERO, new BigDecimal("200"), false));
        var onePeriod = PartnerLedgerContract.fold(
                PartnerLedgerCollectionContract.toEntries(PartnerLedgerCollectionContract.classify(all)), BigDecimal.ZERO);
        var splitOpening = PartnerLedgerContract.fold(
                PartnerLedgerCollectionContract.toEntries(PartnerLedgerCollectionContract.classify(all.subList(0, 1))), BigDecimal.ZERO);
        var splitPeriod = PartnerLedgerContract.fold(
                PartnerLedgerCollectionContract.toEntries(PartnerLedgerCollectionContract.classify(all.subList(1, 2))),
                splitOpening.closingBalance());

        assertThat(splitPeriod.closingBalance()).isEqualByComparingTo(onePeriod.closingBalance());
    }

    @Test
    void RED_B1_effectIsTheOnlySourceForClosingFormula() {
        var entries = PartnerLedgerCollectionContract.toEntries(PartnerLedgerCollectionContract.classify(List.of(
                PartnerLedgerCollectionContract.Evidence.slip("sale", DAY, new BigDecimal("1000")),
                PartnerLedgerCollectionContract.Evidence.journal("payment", DAY, "MANUAL", null,
                        "110", BigDecimal.ZERO, new BigDecimal("300"), false),
                PartnerLedgerCollectionContract.Evidence.journal("payment", DAY, "MANUAL", null,
                        "102", new BigDecimal("300"), BigDecimal.ZERO, false))));

        var totals = PartnerLedgerContract.fold(entries, new BigDecimal("50"));

        assertThat(totals.closingBalance()).isEqualByComparingTo("750");
        assertThat(totals.closingBalance()).isEqualByComparingTo(
                totals.openingBalance().add(totals.salesTotal()).subtract(totals.paymentTotal()));
    }

    @Test
    void canonicalAccountCodesUseFullEffectButOnlyAttributedAmount() {
        var classified = PartnerLedgerCollectionContract.classify(List.of(
                new PartnerLedgerCollectionContract.Evidence(
                        "payment-ecount", DAY, "MANUAL", null, "1089",
                        BigDecimal.ZERO, new BigDecimal("33000"), false, false,
                        BigDecimal.ZERO, new BigDecimal("33000")),
                new PartnerLedgerCollectionContract.Evidence(
                        "payment-ecount", DAY, "MANUAL", null, "2519",
                        BigDecimal.ZERO, BigDecimal.ZERO, false, false,
                        new BigDecimal("33000"), BigDecimal.ZERO)),
                Set.of("110", "1089"), Set.of("401", "4019"));

        assertThat(classified).singleElement().satisfies(document -> {
            assertThat(document.effect()).isEqualTo(PartnerLedgerContract.Effect.PAYMENT);
            assertThat(document.amount()).isEqualByComparingTo("33000");
            assertThat(document.credit()).isEqualByComparingTo("33000");
        });
    }

    @Test
    void RED_A5_keepsRentAsSaleAndFeeSettlementAsPayment() {
        var rent = PartnerLedgerCollectionContract.classify(List.of(
                PartnerLedgerCollectionContract.Evidence.journal("rent", DAY, "MANUAL", null,
                        "1089", new BigDecimal("4180000"), BigDecimal.ZERO, false),
                PartnerLedgerCollectionContract.Evidence.journal("rent", DAY, "MANUAL", null,
                        "9049", BigDecimal.ZERO, new BigDecimal("3800000"), false),
                PartnerLedgerCollectionContract.Evidence.journal("rent", DAY, "MANUAL", null,
                        "2559", BigDecimal.ZERO, new BigDecimal("380000"), false)),
                Set.of("110", "1089"), Set.of("401", "4019"), Set.of("201", "2519"));
        var fee = PartnerLedgerCollectionContract.classify(List.of(
                new PartnerLedgerCollectionContract.Evidence("fee", DAY, "MANUAL", null, "1089",
                        BigDecimal.ZERO, new BigDecimal("412500"), false, false,
                        BigDecimal.ZERO, new BigDecimal("412500")),
                new PartnerLedgerCollectionContract.Evidence("fee", DAY, "MANUAL", null, "2519",
                        BigDecimal.ZERO, BigDecimal.ZERO, false, false,
                        new BigDecimal("412500"), BigDecimal.ZERO)),
                Set.of("110", "1089"), Set.of("401", "4019"), Set.of("201", "2519"));

        assertThat(rent).singleElement().satisfies(document -> {
            assertThat(document.type()).isEqualTo(PartnerLedgerContract.DocumentType.SALE_SUMMARY);
            assertThat(document.effect()).isEqualTo(PartnerLedgerContract.Effect.SALE);
            assertThat(document.amount()).isEqualByComparingTo("4180000");
        });
        assertThat(fee).singleElement().extracting(PartnerLedgerCollectionContract.Classified::effect)
                .isEqualTo(PartnerLedgerContract.Effect.PAYMENT);
    }

    @Test
    void RED_B2_excludesNonOperatingGainAndLossFromSalesAndPayments() {
        var classified = PartnerLedgerCollectionContract.classify(List.of(
                PartnerLedgerCollectionContract.Evidence.journal("gain", DAY, "MANUAL", null,
                        "1089", new BigDecimal("67"), BigDecimal.ZERO, false),
                PartnerLedgerCollectionContract.Evidence.journal("gain", DAY, "MANUAL", null,
                        "9199", BigDecimal.ZERO, new BigDecimal("67"), false),
                PartnerLedgerCollectionContract.Evidence.journal("loss", DAY, "MANUAL", null,
                        "9549", new BigDecimal("842"), BigDecimal.ZERO, false),
                PartnerLedgerCollectionContract.Evidence.journal("loss", DAY, "MANUAL", null,
                        "1089", BigDecimal.ZERO, new BigDecimal("842"), false)),
                Set.of("110", "1089"), Set.of("401", "4019"), Set.of("201", "2519"));

        assertThat(classified).extracting(PartnerLedgerCollectionContract.Classified::effect)
                .containsOnly(PartnerLedgerContract.Effect.ADJUSTMENT);
        var totals = PartnerLedgerContract.fold(PartnerLedgerCollectionContract.toEntries(classified),
                new BigDecimal("1000"));
        assertThat(totals.salesTotal()).isZero();
        assertThat(totals.paymentTotal()).isZero();
        assertThat(totals.adjustmentTotal()).isEqualByComparingTo("-775");
        assertThat(totals.closingBalance()).isEqualByComparingTo("225");
    }
}
