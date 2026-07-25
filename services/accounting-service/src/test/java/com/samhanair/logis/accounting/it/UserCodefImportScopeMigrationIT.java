package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;

/** V64가 backfill한 legacy CODEF scope 행을 보존한 채 V65가 적용되는지 검증한다. */
class UserCodefImportScopeMigrationIT {

    private static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("accounting_upgrade_db");

    @BeforeAll
    static void startContainer() {
        POSTGRES.start();
    }

    @AfterAll
    static void stopContainer() {
        if (POSTGRES.isRunning()) {
            POSTGRES.stop();
        }
    }

    @Test
    @DisplayName("V64 legacy SELECTED+빈 refs 행이 있어도 V65 upgrade가 성공하고 행을 보존한다")
    void v65UpgradePreservesLegacySelectedEmptyRows() throws Exception {
        migrateTo(64);
        insertLegacyRows();

        assertThatCode(() -> migrateToLatest()).doesNotThrowAnyException();

        try (Connection connection = connection()) {
            assertThat(singleInt(connection,
                    "SELECT COUNT(*) FROM flyway_schema_history WHERE version = '65' AND success = TRUE"))
                    .isEqualTo(1);
            assertThat(singleInt(connection,
                    "SELECT COUNT(*) FROM user_codef_import_scope WHERE created_by = 'migration-regression'"))
                    .isEqualTo(3);
            assertThat(singleInt(connection,
                    "SELECT COUNT(*) FROM user_codef_import_scope "
                            + "WHERE created_by = 'migration-regression' AND scope_mode = 'SELECTED' "
                            + "AND account_ref_selections = '[]' AND card_ref_selections = '[]' "
                            + "AND loan_ref_selections = '[]'"))
                    .isEqualTo(3);
            assertThat(singleLong(connection,
                    "SELECT MIN(version) FROM user_codef_import_scope "
                            + "WHERE created_by = 'migration-regression'"))
                    .isEqualTo(0L);
            assertThat(singleBoolean(connection,
                    "SELECT convalidated FROM pg_constraint "
                            + "WHERE conname = 'ck_user_codef_import_scope_refs_consistency'"))
                    .isFalse();
        }

        assertThatThrownBy(UserCodefImportScopeMigrationIT::insertInvalidSelectedEmptyRow)
                .isInstanceOf(SQLException.class)
                .hasMessageContaining("ck_user_codef_import_scope_refs_consistency");
    }

    private static void migrateTo(int target) {
        Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .locations("classpath:db/migration")
                .target(String.valueOf(target))
                .load()
                .migrate();
    }

    private static void migrateToLatest() {
        Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .locations("classpath:db/migration")
                .load()
                .migrate();
    }

    private static void insertLegacyRows() throws Exception {
        try (Connection connection = connection()) {
            try (var statement = connection.prepareStatement("""
                    INSERT INTO user_codef_import_scope
                        (user_id, connected_id, account_ref_selections, card_ref_selections,
                         loan_ref_selections, default_import_type, created_by, is_deleted)
                    VALUES (gen_random_uuid(), ?, '[]', '[]', '[]', 'ALL', 'migration-regression', FALSE)
                    """)) {
                for (int i = 1; i <= 3; i++) {
                    statement.setString(1, "legacy-migration-" + i);
                    statement.addBatch();
                }
                statement.executeBatch();
            }
        }
    }

    private static void insertInvalidSelectedEmptyRow() throws Exception {
        try (Connection connection = connection()) {
            connection.createStatement().executeUpdate("""
                    INSERT INTO user_codef_import_scope
                        (user_id, connected_id, account_ref_selections, card_ref_selections,
                         loan_ref_selections, default_import_type, created_by, is_deleted, scope_mode)
                    VALUES (gen_random_uuid(), 'new-invalid-selected-empty', '[]', '[]', '[]',
                            'ALL', 'migration-regression-invalid', FALSE, 'SELECTED')
                    """);
        }
    }

    private static Connection connection() throws Exception {
        return DriverManager.getConnection(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
    }

    private static int singleInt(Connection connection, String sql) throws Exception {
        try (ResultSet result = connection.createStatement().executeQuery(sql)) {
            result.next();
            return result.getInt(1);
        }
    }

    private static long singleLong(Connection connection, String sql) throws Exception {
        try (ResultSet result = connection.createStatement().executeQuery(sql)) {
            result.next();
            return result.getLong(1);
        }
    }

    private static boolean singleBoolean(Connection connection, String sql) throws Exception {
        try (ResultSet result = connection.createStatement().executeQuery(sql)) {
            result.next();
            return result.getBoolean(1);
        }
    }
}
