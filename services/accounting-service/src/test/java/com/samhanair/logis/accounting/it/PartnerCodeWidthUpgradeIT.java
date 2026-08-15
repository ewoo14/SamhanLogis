package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.testcontainers.containers.PostgreSQLContainer;

/** 독립 PostgreSQL에서 Flyway target 62 fixture가 V63 upgrade 후 보존되는지 검증한다. */
@ExtendWith(AbstractPostgresIT.DockerAvailableCondition.class)
class PartnerCodeWidthUpgradeIT {

    private static final String POSTGRES_PASSWORD = UUID.randomUUID().toString();
    private static final PostgreSQLContainer<?> UPGRADE_POSTGRES =
            new PostgreSQLContainer<>("postgres:16-alpine")
                    .withDatabaseName("accounting_upgrade_db")
            .withUsername(UUID.randomUUID().toString())
                    .withPassword(POSTGRES_PASSWORD);

    private static final String CODE = "U".repeat(50);

    @BeforeAll
    static void migrateV62ThenV63() throws Exception {
        UPGRADE_POSTGRES.start();
        Flyway.configure()
                .dataSource(UPGRADE_POSTGRES.getJdbcUrl(), UPGRADE_POSTGRES.getUsername(), UPGRADE_POSTGRES.getPassword())
                .locations("classpath:db/migration")
                .target("62")
                .load()
                .migrate();
        try (Connection connection = DriverManager.getConnection(
                UPGRADE_POSTGRES.getJdbcUrl(), UPGRADE_POSTGRES.getUsername(), UPGRADE_POSTGRES.getPassword())) {
            connection.createStatement().executeUpdate("""
                    INSERT INTO tax_invoice_batch_exclusions
                        (partner_code, partner_name, created_by, is_deleted)
                    VALUES ('%s', 'upgrade fixture', 'upgrade-it', FALSE)
                    """.formatted(CODE));
            connection.createStatement().executeUpdate("""
                    INSERT INTO bank_depositor_partner_mapping
                        (raw_name, normalized_name, partner_id, partner_code, created_by, is_deleted)
                    VALUES ('upgrade depositor', 'UPGRADE DEPOSITOR', gen_random_uuid(), '%s', 'upgrade-it', FALSE)
                    """.formatted(CODE));
            connection.createStatement().executeUpdate("""
                    INSERT INTO staging.ecount_sales_ledger_raw
                        (source_file_hash, source_row_no, partner_code, imported_by, created_by)
                    VALUES ('upgrade-sales', 1, '%s', 'upgrade-it', 'upgrade-it')
                    """.formatted(CODE));
            connection.createStatement().executeUpdate("""
                    INSERT INTO staging.ecount_purchase_ledger_raw
                        (source_file_hash, source_row_no, partner_code, imported_by, created_by)
                    VALUES ('upgrade-purchase', 1, '%s', 'upgrade-it', 'upgrade-it')
                    """.formatted(CODE));
        }
        Flyway.configure()
                .dataSource(UPGRADE_POSTGRES.getJdbcUrl(), UPGRADE_POSTGRES.getUsername(), UPGRADE_POSTGRES.getPassword())
                .locations("classpath:db/migration")
                .load()
                .migrate();
    }

    @AfterAll
    static void stopContainer() {
        if (UPGRADE_POSTGRES.isRunning()) {
            UPGRADE_POSTGRES.stop();
        }
    }

    @Test
    @DisplayName("V62 fixture 데이터와 partial unique/B-tree 인덱스가 V63 upgrade 후 보존된다")
    void v63UpgradePreservesRowsAndIndexes() throws Exception {
        try (Connection connection = DriverManager.getConnection(
                UPGRADE_POSTGRES.getJdbcUrl(), UPGRADE_POSTGRES.getUsername(), UPGRADE_POSTGRES.getPassword())) {
            assertThat(singleInt(connection, "SELECT version::int FROM flyway_schema_history WHERE version = '63'"))
                    .isEqualTo(63);
            assertThat(singleInt(connection, "SELECT COUNT(*) FROM tax_invoice_batch_exclusions WHERE partner_code = '" + CODE + "'"))
                    .isEqualTo(1);
            assertThat(singleInt(connection, "SELECT COUNT(*) FROM bank_depositor_partner_mapping WHERE partner_code = '" + CODE + "'"))
                    .isEqualTo(1);
            assertThat(singleInt(connection, "SELECT COUNT(*) FROM staging.ecount_sales_ledger_raw WHERE partner_code = '" + CODE + "'"))
                    .isEqualTo(1);
            assertThat(singleInt(connection, "SELECT COUNT(*) FROM staging.ecount_purchase_ledger_raw WHERE partner_code = '" + CODE + "'"))
                    .isEqualTo(1);
            assertThat(singleInt(connection, """
                    SELECT COUNT(*) FROM information_schema.columns
                     WHERE (table_schema, table_name, column_name) IN
                         (('public','tax_invoice_batch_exclusions','partner_code'),
                          ('public','bank_depositor_partner_mapping','partner_code'),
                          ('staging','ecount_sales_ledger_raw','partner_code'),
                          ('staging','ecount_purchase_ledger_raw','partner_code'))
                       AND character_maximum_length = 100
                    """)).isEqualTo(4);

            Set<String> indexes = Set.of(
                    "uidx_tax_invoice_batch_exclusions_partner_code_active",
                    "ix_ecount_sales_ledger_raw_partner_code",
                    "ix_ecount_purchase_ledger_raw_partner_code");
            Set<String> actual = new java.util.HashSet<>();
            try (ResultSet result = connection.createStatement().executeQuery("""
                    SELECT indexname FROM pg_indexes
                     WHERE indexname IN ('uidx_tax_invoice_batch_exclusions_partner_code_active',
                                         'ix_ecount_sales_ledger_raw_partner_code',
                                         'ix_ecount_purchase_ledger_raw_partner_code')
                    """)) {
                while (result.next()) {
                    actual.add(result.getString(1));
                }
            }
            assertThat(actual).containsExactlyInAnyOrderElementsOf(indexes);
        }
    }

    private static int singleInt(Connection connection, String sql) throws Exception {
        try (ResultSet result = connection.createStatement().executeQuery(sql)) {
            result.next();
            return result.getInt(1);
        }
    }
}
