package com.samhanair.logis.accounting.migration;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

/** V39 회계전표/세금계산서 번호 0제거 SQL 범위 회귀 검증. */
class AccountingSlipNoZeroStripMigrationSqlTest {

    @Test
    void v39_strips_only_date_based_slip_number_tokens() throws Exception {
        String sql = readMigration();

        assertThat(sql).contains("^[0-9]{4}/[0-9]{2}/[0-9]{2}-0+[1-9][0-9]*$");
        assertThat(sql).contains("([0-9]{4}/[0-9]{2}/[0-9]{2})-0+([1-9][0-9]*)");
        assertThat(sql).contains("regexp_replace(excluded_slip_nos, '([0-9]{4}/[0-9]{2}/[0-9]{2})-0+([1-9][0-9]*)', '\\1-\\2', 'g')");
        assertThat(sql).doesNotContain("WHERE tax_invoice_no ~ '-0[0-9]'");
        assertThat(sql).doesNotContain("regexp_replace(tax_invoice_no, '-0+([0-9])'");
    }

    private static String readMigration() throws Exception {
        Path modulePath = Path.of("src/main/resources/db/migration/V39__strip_slip_no_zeros_accounting_slips.sql");
        Path rootPath = Path.of("services/accounting-service/src/main/resources/db/migration/V39__strip_slip_no_zeros_accounting_slips.sql");
        return Files.readString(Files.exists(modulePath) ? modulePath : rootPath);
    }
}
