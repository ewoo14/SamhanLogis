package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;

class AccountEcountMappingContractTest {

    @Test
    void undecided_codes_have_no_ecount_value_and_are_explicitly_marked() {
        for (String code : List.of("103", "104", "105", "201", "919", "142", "210", "220", "255", "900")) {
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
