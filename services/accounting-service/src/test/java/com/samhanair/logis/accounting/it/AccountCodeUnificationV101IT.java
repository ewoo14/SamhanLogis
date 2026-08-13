package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Connection;
import java.sql.DriverManager;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.testcontainers.containers.PostgreSQLContainer;

/** V1~V100 상태에서 legacy 255 journal line을 V101이 2559로 이관하는지 검증한다. */
@ExtendWith(AbstractPostgresIT.DockerAvailableCondition.class)
class AccountCodeUnificationV101IT {

    private static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>("postgres:16-alpine")
                    .withDatabaseName("account_code_v101_db");

    @BeforeAll
    static void seedLegacy255ThenApplyV101() throws Exception {
        POSTGRES.start();
        Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .locations("classpath:db/migration")
                .target("100")
                .load()
                .migrate();

        try (Connection connection = DriverManager.getConnection(
                POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())) {
            connection.createStatement().executeUpdate("""
                    INSERT INTO journals (
                        id, journal_no, journal_date, description, source_type, status,
                        created_at, created_by, is_deleted
                    ) VALUES (
                        gen_random_uuid(), 'V101-255-RED', DATE '2026-08-13',
                        'V101 255 regression', 'MANUAL', 'POSTED', NOW(), 'v101-it', FALSE
                    )
                    """);
            connection.createStatement().executeUpdate("""
                    INSERT INTO journal_lines (
                        id, journal_id, line_no, account_code, debit_amount, credit_amount,
                        memo, created_at, created_by, is_deleted
                    )
                    SELECT gen_random_uuid(), id, 1, '255', 100.00, 0,
                           'V101 255 regression line', NOW(), 'v101-it', FALSE
                      FROM journals
                     WHERE journal_no = 'V101-255-RED'
                    """);
        }

        Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .locations("classpath:db/migration")
                .load()
                .migrate();
    }

    @AfterAll
    static void stopContainer() {
        if (POSTGRES.isRunning()) {
            POSTGRES.stop();
        }
    }

    @Test
    @DisplayName("V101은 사용 중인 legacy 255를 2559로 이관하고 3자리 잔존 가드에 걸리지 않는다")
    void migratesUsed255To2559() throws Exception {
        try (Connection connection = DriverManager.getConnection(
                POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())) {
            assertThat(singleString(connection, """
                    SELECT account_code FROM journal_lines
                     WHERE memo = 'V101 255 regression line'
                    """)).isEqualTo("2559");
            assertThat(singleInt(connection, """
                    SELECT COUNT(*) FROM journal_lines
                     WHERE account_code = '255' AND is_deleted = FALSE
                    """)).isZero();
            assertThat(singleInt(connection, """
                    SELECT COUNT(*) FROM flyway_schema_history
                     WHERE version = '101' AND success = TRUE
                    """)).isEqualTo(1);
        }
    }

    private static String singleString(Connection connection, String sql) throws Exception {
        try (var result = connection.createStatement().executeQuery(sql)) {
            result.next();
            return result.getString(1);
        }
    }

    private static int singleInt(Connection connection, String sql) throws Exception {
        try (var result = connection.createStatement().executeQuery(sql)) {
            result.next();
            return result.getInt(1);
        }
    }
}
