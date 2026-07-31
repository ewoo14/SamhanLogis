package com.samhanair.logis.slip.domain.vat;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

/**
 * 과거 부가세 과다 가산 정정 V61의 대상 집합·롤백 가드·감사 보존 SQL 계약을 검증한다.
 */
class VatOverchargeCorrectionMigrationSqlTest {

    private static final String MIGRATION =
            "src/main/resources/db/migration/V61__correct_partner_order_vat_overcharge.sql";
    private static final String ROOT_MIGRATION =
            "services/slip-service/src/main/resources/db/migration/V61__correct_partner_order_vat_overcharge.sql";

    @Test
    void v61_contains_exactly_nineteen_business_key_targets_and_audit_guard() throws Exception {
        Path modulePath = Path.of(MIGRATION);
        Path rootPath = Path.of(ROOT_MIGRATION);
        String sql = Files.readString(Files.exists(modulePath) ? modulePath : rootPath);

        assertThat(sql).contains("CREATE TEMP TABLE vat_correction_targets");
        assertThat(sql).contains("IF target_count NOT IN (0, 19) THEN");
        assertThat(sql).contains("RAISE EXCEPTION 'VAT correction target count must be 19, got %', target_count");
        assertThat(sql).contains("CREATE TABLE slip_line_correction_audits");
        assertThat(sql).contains("before_values", "JSONB        NOT NULL");
        assertThat(sql).contains("after_values", "JSONB        NOT NULL");
        assertThat(sql).contains("reason", "TEXT         NOT NULL");
        assertThat(sql).contains("2026/05/31-1");
        assertThat(sql).contains("2026/07/05-2");
        assertThat(sql).contains("(19, '2026/07/05-2'");
        assertThat(sql).doesNotContain("'2026/05/30-1'");
        assertThat(sql).doesNotContain("'2026/05/30-2'");
        assertThat(sql).doesNotContain("'2026/05/30-3'");
    }
}
