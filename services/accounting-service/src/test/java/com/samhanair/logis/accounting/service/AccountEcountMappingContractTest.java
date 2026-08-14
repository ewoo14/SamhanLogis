package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class AccountEcountMappingContractTest {

    @Test
    void undecided_codes_have_no_ecount_value_and_are_explicitly_marked() {
        for (String code : List.of("103", "104", "105", "900")) {
            AccountEcountMapping.Mapping mapping = AccountEcountMapping.resolve(code);
            assertThat(mapping.status()).isEqualTo(AccountEcountMapping.Status.UNDETERMINED);
            assertThat(mapping.ecountCode()).isNull();
            assertThat(mapping.displayLabel()).isEqualTo("미정");
        }
    }

    @Test
    void mapping_reconciliation_preserves_journal_count_and_amount_totals() {
        List<AccountEcountMapping.JournalSnapshot> before = List.of(
                new AccountEcountMapping.JournalSnapshot("2026/01/01-1", "110", new BigDecimal("19800000"), BigDecimal.ZERO),
                new AccountEcountMapping.JournalSnapshot("2026/01/01-1", "401", BigDecimal.ZERO, new BigDecimal("18000000")));

        AccountEcountMapping.Reconciliation after = AccountEcountMapping.reconcile(before);

        assertThat(after.journalCount()).isEqualTo(1);
        assertThat(after.debitTotal()).isEqualByComparingTo("19800000");
        assertThat(after.creditTotal()).isEqualByComparingTo("18000000");
    }

    @Test
    void every_confirmed_v101_legacy_input_is_normalized_to_its_target() {
        Map<String, String> expected = Map.ofEntries(
                Map.entry("101", "1019"), Map.entry("102", "1039"), Map.entry("110", "1089"),
                Map.entry("142", "2024"), Map.entry("146", "2054"), Map.entry("201", "2519"),
                Map.entry("210", "2539"), Map.entry("220", "2559"), Map.entry("221", "2549"),
                Map.entry("255", "2559"), Map.entry("260", "2954"), Map.entry("301", "3329"),
                Map.entry("343", "3779"), Map.entry("401", "4019"), Map.entry("404", "4049"),
                Map.entry("501", "4511"), Map.entry("801", "8029"), Map.entry("814", "8139"),
                Map.entry("818", "8239"), Map.entry("819", "8249"), Map.entry("831", "8319"),
                Map.entry("901", "9019"), Map.entry("919", "9399"), Map.entry("991", "9719"));

        expected.forEach((legacy, target) -> assertThat(AccountEcountMapping.normalizeInputCode(legacy))
                .as("legacy account code %s", legacy)
                .isEqualTo(target));
    }

    @Test
    void mapping_reconciliation_preserves_representative_debit_credit_lines() {
        List<AccountEcountMapping.JournalSnapshot> before = List.of(
                new AccountEcountMapping.JournalSnapshot("2026/01/01-1", "110", new BigDecimal("19800000"), BigDecimal.ZERO),
                new AccountEcountMapping.JournalSnapshot("2026/01/01-1", "401", BigDecimal.ZERO, new BigDecimal("18000000")));

        AccountEcountMapping.Reconciliation after = AccountEcountMapping.reconcile(before);

        assertThat(after.lines()).containsExactly(
                new AccountEcountMapping.JournalSnapshot("2026/01/01-1", "1089", new BigDecimal("19800000"), BigDecimal.ZERO),
                new AccountEcountMapping.JournalSnapshot("2026/01/01-1", "4019", BigDecimal.ZERO, new BigDecimal("18000000")));
    }
}
