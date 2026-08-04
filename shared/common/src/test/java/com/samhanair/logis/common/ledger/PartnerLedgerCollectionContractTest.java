package com.samhanair.logis.common.ledger;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
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
}
