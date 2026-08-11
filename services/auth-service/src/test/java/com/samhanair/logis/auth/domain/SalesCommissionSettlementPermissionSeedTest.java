package com.samhanair.logis.auth.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.junit.jupiter.api.Test;

/** D-G6 역할별 7-action seed와 과다 권한 방지 계약 테스트. */
class SalesCommissionSettlementPermissionSeedTest {

    private static final String PAGE_CODE = "accounting.sales-commission-settlement";
    private static final List<String> ACCOUNTING_ROLES =
            List.of("MASTER", "MANAGER", "ACCOUNTANT");
    private static final List<String> DENIED_ROLES =
            List.of("SALES", "WAREHOUSE", "DISPATCH", "INVENTORY", "DEVELOPER", "PARTNER", "STAFF", "DRIVER");

    @Test
    void migrationSeedsExactlyViewCreateUpdateForAccountantAndAbove() throws IOException {
        String sql = migrationSql();

        assertThat(sql).contains(PAGE_CODE);
        assertThat(sql).contains("can_view, can_create, can_update, can_delete,");
        assertThat(sql).contains("can_restore, can_download, can_print,");
        assertThat(sql).contains("VALUES ('MASTER', TRUE, TRUE, TRUE),");
        assertThat(sql).contains("('MANAGER', TRUE, TRUE, TRUE),");
        assertThat(sql).contains("('ACCOUNTANT', TRUE, TRUE, TRUE)");
        assertThat(sql).contains("FALSE, FALSE, FALSE, FALSE");
    }

    @Test
    void migrationKeepsEveryNonAccountantRoleExplicitlyDenied() throws IOException {
        String sql = migrationSql();

        for (String role : DENIED_ROLES) {
            assertThat(sql).as("role %s must remain in the explicit zero-bit seed", role).contains("('" + role + "')");
        }
        for (String role : ACCOUNTING_ROLES) {
            assertThat(sql).as("role %s must be granted", role).contains("('" + role + "', TRUE");
        }
    }

    private String migrationSql() throws IOException {
        try (InputStream input = getClass().getResourceAsStream(
                "/db/migration/V101__seed_sales_commission_settlement_page_permission.sql")) {
            assertThat(input).as("V101 permission seed must be packaged").isNotNull();
            return new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
