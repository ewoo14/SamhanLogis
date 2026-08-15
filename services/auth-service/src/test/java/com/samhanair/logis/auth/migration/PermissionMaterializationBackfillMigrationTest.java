package com.samhanair.logis.auth.migration;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class PermissionMaterializationBackfillMigrationTest {

    private static final Path MIGRATION = Path.of(
            "src/main/resources/db/migration/V108__backfill_group_permission_materialization.sql");

    @Test
    void backfill_migration_rehydrates_group_based_account_cache_without_granting_sales_or_accountant() throws Exception {
        String sql = Files.readString(MIGRATION);

        assertThat(sql).contains("group_page_permissions");
        assertThat(sql).contains("account_page_permissions");
        assertThat(sql).contains("'messenger.admin'");
        assertThat(sql).contains("'00000000-0000-0000-0000-000000000101'::uuid");
        assertThat(sql).contains("BOOL_OR(gpp.can_view)");
        assertThat(sql).contains("BOOL_OR(gpp.can_create)");
        assertThat(sql).contains("BOOL_OR(gpp.can_update)");
        assertThat(sql).contains("BOOL_OR(gpp.can_delete)");
        assertThat(sql).contains("ON CONFLICT (account_id, page_code)");
        assertThat(sql).contains("is_system_master = TRUE");
        assertThat(sql).doesNotContain("'00000000-0000-0000-0000-000000000102'::uuid, 'messenger.admin'");
        assertThat(sql).doesNotContain("'00000000-0000-0000-0000-000000000104'::uuid, 'messenger.admin'");
    }
}
