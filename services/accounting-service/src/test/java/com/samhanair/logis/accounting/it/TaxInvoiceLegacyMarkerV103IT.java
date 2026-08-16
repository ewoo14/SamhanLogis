package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Connection;
import java.sql.DriverManager;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.testcontainers.containers.PostgreSQLContainer;

/** V103의 빈 DB 전체 적용과 V102 기준 증분 적용을 격리 Postgres에서 검증한다. */
@ExtendWith(AbstractPostgresIT.DockerAvailableCondition.class)
class TaxInvoiceLegacyMarkerV103IT {

    private static final String TEST_DB_USER = "it_" + UUID.randomUUID().toString().replace("-", "");
    private static final String TEST_DB_PASSWORD = UUID.randomUUID().toString();

    private static final PostgreSQLContainer<?> FULL = new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("tax_invoice_v103_full")
            .withUsername(TEST_DB_USER)
            .withPassword(TEST_DB_PASSWORD);

    private static final PostgreSQLContainer<?> INCREMENTAL = new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("tax_invoice_v103_incremental")
            .withUsername(TEST_DB_USER)
            .withPassword(TEST_DB_PASSWORD);

    @BeforeAll
    static void migrateFreshFullAndIncremental() {
        FULL.start();
        flyway(FULL, null).migrate();

        INCREMENTAL.start();
        flyway(INCREMENTAL, "102").migrate();
        flyway(INCREMENTAL, null).migrate();
    }

    @AfterAll
    static void stopContainers() {
        if (FULL.isRunning()) {
            FULL.stop();
        }
        if (INCREMENTAL.isRunning()) {
            INCREMENTAL.stop();
        }
    }

    @Test
    @DisplayName("fresh Postgres 빈 DB 전체 적용: V103 marker schema/backfill 순서 통과")
    void freshPostgresFullMigration() throws Exception {
        assertV103Result(FULL, "FRESH_FULL");
    }

    @Test
    @DisplayName("V102 형상에서 증분 적용: V103만 추가되고 marker가 backfill 된다")
    void v102IncrementalMigration() throws Exception {
        assertV103Result(INCREMENTAL, "V102_INCREMENTAL");
    }

    private static void assertV103Result(PostgreSQLContainer<?> container, String label) throws Exception {
        try (Connection connection = DriverManager.getConnection(
                container.getJdbcUrl(), container.getUsername(), container.getPassword())) {
            int v102 = singleInt(connection,
                    "SELECT COUNT(*) FROM flyway_schema_history WHERE version='102' AND success=TRUE");
            int v103 = singleInt(connection,
                    "SELECT COUNT(*) FROM flyway_schema_history WHERE version='103' AND success=TRUE");
            int active = singleInt(connection,
                    "SELECT COUNT(*) FROM tax_invoices WHERE is_deleted=FALSE");
            int marked = singleInt(connection,
                    "SELECT COUNT(*) FROM tax_invoices WHERE is_deleted=FALSE AND legacy_read_only=TRUE");
            int markedByMigration = singleInt(connection,
                    "SELECT COUNT(*) FROM tax_invoices WHERE legacy_read_only_marked_by='migration:V103'");
            int unmarkedAfterCutoff = singleInt(connection,
                    "SELECT COUNT(*) FROM tax_invoices WHERE is_deleted=FALSE AND created_at > TIMESTAMP '2026-07-27 03:36:55.268598' AND legacy_read_only=TRUE");

            System.out.printf("V103-%s raw: v102=%d v103=%d active=%d marked=%d markedByMigration=%d unmarkedAfterCutoff=%d%n",
                    label, v102, v103, active, marked, markedByMigration, unmarkedAfterCutoff);
            assertThat(v102).isEqualTo(1);
            assertThat(v103).isEqualTo(1);
            assertThat(marked).isEqualTo(active);
            assertThat(markedByMigration).isEqualTo(active);
            assertThat(unmarkedAfterCutoff).isZero();
        }
    }

    private static Flyway flyway(PostgreSQLContainer<?> container, String target) {
        var configuration = Flyway.configure()
                .dataSource(container.getJdbcUrl(), container.getUsername(), container.getPassword())
                .locations("classpath:db/migration")
                ;
        if (target != null) {
            configuration.target(target);
        }
        return configuration.load();
    }

    private static int singleInt(Connection connection, String sql) throws Exception {
        try (var result = connection.createStatement().executeQuery(sql)) {
            result.next();
            return result.getInt(1);
        }
    }
}
