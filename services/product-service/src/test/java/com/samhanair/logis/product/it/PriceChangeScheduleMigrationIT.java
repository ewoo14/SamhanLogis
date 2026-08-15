package com.samhanair.logis.product.it;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * V26 기준일 정합 migration을 V1부터 fresh PostgreSQL에 적용하는 회귀 IT.
 *
 * <p>V25까지 적용한 뒤 현재 운영 상태와 사용자 수정 상태를 각각 재현한다. 그 후
 * 신규 migration이 V22_MIGRATION 행만 2026-07-01로 바꾸고, 관리 화면에서 수정한
 * 행은 그대로 보존하는지 검증한다.
 */
class PriceChangeScheduleMigrationIT {

    private static final String POSTGRES_PASSWORD = UUID.randomUUID().toString();
    private static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("price_schedule_upgrade_db")
            .withUsername(UUID.randomUUID().toString())
            .withPassword(POSTGRES_PASSWORD);

    @BeforeAll
    static void applyV25Fixture() throws Exception {
        POSTGRES.start();
        migrateTo(25);
        try (Connection connection = connection()) {
            // 현재 운영 상태: homemulti만 V22 재적재값 2026-08-01로 남아 있다.
            execute(connection, """
                    UPDATE price_change_schedule
                       SET effective_date = DATE '2026-08-01'
                     WHERE category = 'homemulti'
                       AND created_by = 'V22_MIGRATION'
                    """);
            // 사용자 관리 화면 수정 행: migration 대상과 날짜가 같아도 덮어쓰면 안 된다.
            execute(connection, """
                    UPDATE price_change_schedule
                       SET effective_date = DATE '2026-09-15',
                           created_by = 'ADMIN_USER',
                           modified_at = now(),
                           modified_by = 'ADMIN_USER'
                     WHERE category = 'oldProducts'
                    """);
        }
    }

    @AfterAll
    static void stopContainer() {
        if (POSTGRES.isRunning()) {
            POSTGRES.stop();
        }
    }

    @Test
    @DisplayName("V26은 V22_MIGRATION 네 행만 라이브 GAS 기준일로 맞추고 사용자 수정 행은 보존한다")
    void v26AlignsMigrationRowsAndPreservesUserEditedRows() throws Exception {
        Map<String, ScheduleRow> before = schedules();
        System.out.println("[V26 before] " + before);
        assertThat(before).containsKeys("commercialMulti", "homemulti", "oldProducts", "singleSets");
        assertThat(before.values()).allSatisfy(row -> assertThat(row.effectiveDate())
                .isNotEqualTo(LocalDate.of(2026, 7, 1)));
        assertThat(before.get("oldProducts")).isEqualTo(
                new ScheduleRow(LocalDate.of(2026, 9, 15), "ADMIN_USER", "ADMIN_USER"));

        migrateToLatest();

        Map<String, ScheduleRow> after = schedules();
        System.out.println("[V26 after] " + after);
        assertThat(after).containsExactlyInAnyOrderEntriesOf(Map.of(
                "commercialMulti", new ScheduleRow(LocalDate.of(2026, 7, 1), "V22_MIGRATION", "V26_MIGRATION"),
                "homemulti", new ScheduleRow(LocalDate.of(2026, 7, 1), "V22_MIGRATION", "V26_MIGRATION"),
                "oldProducts", new ScheduleRow(LocalDate.of(2026, 9, 15), "ADMIN_USER", "ADMIN_USER"),
                "singleSets", new ScheduleRow(LocalDate.of(2026, 7, 1), "V22_MIGRATION", "V26_MIGRATION")));
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

    private static Map<String, ScheduleRow> schedules() throws Exception {
        Map<String, ScheduleRow> rows = new LinkedHashMap<>();
        try (Connection connection = connection();
                ResultSet result = connection.createStatement().executeQuery("""
                        SELECT category, effective_date, created_by, modified_by
                          FROM price_change_schedule
                         WHERE is_deleted = FALSE
                         ORDER BY category
                        """)) {
            while (result.next()) {
                rows.put(result.getString("category"), new ScheduleRow(
                        result.getObject("effective_date", LocalDate.class),
                        result.getString("created_by"),
                        result.getString("modified_by")));
            }
        }
        return rows;
    }

    private static void execute(Connection connection, String sql) throws Exception {
        connection.createStatement().executeUpdate(sql);
    }

    private static Connection connection() throws Exception {
        return DriverManager.getConnection(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
    }

    private record ScheduleRow(LocalDate effectiveDate, String createdBy, String modifiedBy) {
    }
}
