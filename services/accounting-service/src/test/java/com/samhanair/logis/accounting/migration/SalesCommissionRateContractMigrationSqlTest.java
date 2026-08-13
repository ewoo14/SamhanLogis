package com.samhanair.logis.accounting.migration;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

/** D-G1 S2 요율 계약과 정산 snapshot V98 migration의 구조 회귀 검증. */
class SalesCommissionRateContractMigrationSqlTest {

    @Test
    void v98_creates_versioned_contract_and_settlement_snapshot_columns() throws Exception {
        String sql = readMigration();

        assertThat(sql).contains("CREATE TABLE sales_commission_rate_contracts");
        assertThat(sql).contains("version_no");
        assertThat(sql).contains("card_rate");
        assertThat(sql).contains("expense_rate");
        assertThat(sql).contains("withholding_rate");
        assertThat(sql).contains("install_rate");
        assertThat(sql).contains("created_at");
        assertThat(sql).contains("created_by");
        assertThat(sql).contains("modified_at");
        assertThat(sql).contains("modified_by");
        assertThat(sql).contains("deleted_at");
        assertThat(sql).contains("deleted_by");
        assertThat(sql).contains("is_deleted");
        assertThat(sql).contains("UNIQUE (version_no)");
        assertThat(sql).contains("INSERT INTO sales_commission_rate_contracts");
        assertThat(sql).contains("VALUES (1, 0.03, 0.08, 0.033, 0.08, 'd-g1-s2')");
        assertThat(sql).contains("rate_contract_id");
        assertThat(sql).contains("FOREIGN KEY (rate_contract_id)");
        assertThat(sql).contains("applied_expense_rate");
        assertThat(sql).contains("subtotal_amount");
        assertThat(sql).contains("payout_amount");
        assertThat(sql).contains("supply_amount");
        assertThat(sql).contains("vat_amount");
    }

    private static String readMigration() throws Exception {
        Path modulePath = Path.of("src/main/resources/db/migration/V98__add_sales_commission_rate_contract_snapshot.sql");
        Path rootPath = Path.of("services/accounting-service/src/main/resources/db/migration/V98__add_sales_commission_rate_contract_snapshot.sql");
        return Files.readString(Files.exists(modulePath) ? modulePath : rootPath);
    }
}
