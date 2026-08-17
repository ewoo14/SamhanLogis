package com.samhanair.logis.slip.domain.vat;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

/**
 * P1-03 V124가 전표·견적의 실제 HALF_UP 불일치 행만 갱신하고, 잠긴 전표와 비대상 행을 보존하는지 검증한다.
 */
class VatHalfUpRecalculationMigrationSqlTest {

    private static final String MIGRATION =
            "src/main/resources/db/migration/V124__recalculate_saved_vat_amounts_half_up.sql";
    private static final String ROOT_MIGRATION =
            "services/slip-service/src/main/resources/db/migration/V124__recalculate_saved_vat_amounts_half_up.sql";

    @Test
    void v124_has_same_half_up_target_predicate_for_slips_and_estimates() throws Exception {
        String sql = readMigration();

        assertThat(sql).contains("CREATE TEMP TABLE vat_half_up_recalculation_targets");
        assertThat(sql).contains("ROUND(sl.unit_price_with_vat * sl.quantity / 1.1, 0)");
        assertThat(sql).contains("ROUND(el.unit_price_with_vat * el.quantity / 1.1, 0)");
        assertThat(sql).contains("s.lock_flag = FALSE");
        assertThat(sql).contains("sl.supply_amount <> ROUND(sl.unit_price_with_vat * sl.quantity / 1.1, 0)");
        assertThat(sql).contains("el.supply_amount <> ROUND(el.unit_price_with_vat * el.quantity / 1.1, 0)");
        assertThat(sql).contains("line_total = t.new_supply");
        assertThat(sql).contains("vat_amount = t.new_vat");
    }

    @Test
    void v124_asserts_changed_row_count_and_non_target_immutability() throws Exception {
        String sql = readMigration();

        assertThat(sql).contains("v124_changed_rows");
        assertThat(sql).contains("RAISE EXCEPTION 'V124 changed row count mismatch");
        assertThat(sql).contains("v124_non_target_before");
        assertThat(sql).contains("RAISE EXCEPTION 'V124 changed a non-target row");
        assertThat(sql).contains("GET DIAGNOSTICS v124_updated_rows = ROW_COUNT");
    }

    private static String readMigration() throws Exception {
        Path modulePath = Path.of(MIGRATION);
        Path rootPath = Path.of(ROOT_MIGRATION);
        return Files.readString(Files.exists(modulePath) ? modulePath : rootPath);
    }
}
