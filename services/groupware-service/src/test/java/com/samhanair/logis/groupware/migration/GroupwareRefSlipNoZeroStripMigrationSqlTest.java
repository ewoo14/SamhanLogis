package com.samhanair.logis.groupware.migration;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

/** V7 결재 첨부 참조 전표번호 0제거 SQL 범위 회귀 검증. */
class GroupwareRefSlipNoZeroStripMigrationSqlTest {

    @Test
    void v7_strips_only_date_based_ref_slip_number() throws Exception {
        String sql = readMigration();

        assertThat(sql).contains("^[0-9]{4}/[0-9]{2}/[0-9]{2}-0+[1-9][0-9]*$");
        assertThat(sql).contains("regexp_replace(ref_slip_no, '^([0-9]{4}/[0-9]{2}/[0-9]{2})-0+([1-9][0-9]*)$', '\\1-\\2')");
        assertThat(sql).contains("regexp_replace(ref_doc_no, '^([0-9]{4}/[0-9]{2}/[0-9]{2})-0+([1-9][0-9]*)$', '\\1-\\2')");
        assertThat(sql).doesNotContain("WHERE ref_slip_no ~ '-0[0-9]'");
        assertThat(sql).doesNotContain("regexp_replace(ref_slip_no, '-0+([0-9])'");
    }

    @Test
    void v7_ref_doc_no_strips_only_date_based_doc_number_copy() throws Exception {
        String sql = readMigration();

        assertThat(stripRefDocNoUsingMigration(sql, "2026/04/01-0001")).isEqualTo("2026/04/01-1");
        assertThat(stripRefDocNoUsingMigration(sql, "SEED-0001")).isEqualTo("SEED-0001");
        assertThat(stripRefDocNoUsingMigration(sql, "2026/04/01-1")).isEqualTo("2026/04/01-1");
    }

    private static String readMigration() throws Exception {
        Path modulePath = Path.of("src/main/resources/db/migration/V7__strip_ref_slip_no_zeros.sql");
        Path rootPath = Path.of("services/groupware-service/src/main/resources/db/migration/V7__strip_ref_slip_no_zeros.sql");
        return Files.readString(Files.exists(modulePath) ? modulePath : rootPath);
    }

    private static String stripRefDocNoUsingMigration(String sql, String value) {
        Matcher matcher = Pattern.compile("regexp_replace\\(ref_doc_no, '([^']+)'").matcher(sql);
        assertThat(matcher.find()).isTrue();
        return value.replaceFirst(matcher.group(1), "$1-$2");
    }
}
