package com.samhanair.logis.accounting.migration;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

/** D-G7 claim 저장소 migration 구조 회귀 검증. */
class SalesCommissionSettlementApprovalClaimMigrationSqlTest {

    @Test
    void v100_createsPerApprovalClaimTableWithExpiryAndActiveIndex() throws Exception {
        String sql = readMigration();

        assertThat(sql).contains("CREATE TABLE sales_commission_settlement_approval_claims");
        assertThat(sql).contains("settlement_id");
        assertThat(sql).contains("approval_id");
        assertThat(sql).contains("claim_token");
        assertThat(sql).contains("expires_at");
        assertThat(sql).contains("is_deleted");
        assertThat(sql).contains("REFERENCES sales_commission_settlements (id)");
        assertThat(sql).contains("sales_commission_settlement_approval_claims_active_idx");
    }

    private static String readMigration() throws Exception {
        Path modulePath = Path.of("src/main/resources/db/migration/V100__add_sales_commission_settlement_approval_claim.sql");
        Path rootPath = Path.of("services/accounting-service/src/main/resources/db/migration/V100__add_sales_commission_settlement_approval_claim.sql");
        return Files.readString(Files.exists(modulePath) ? modulePath : rootPath);
    }
}
