package com.samhanair.logis.slip.it.dispatch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.it.AbstractPostgresIT;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * V41 배차 차량 2축 마이그레이션 실 DB 검증.
 *
 * <p>{@link com.samhanair.logis.slip.domain.dispatch.DispatchVehicle2AxisMigrationSqlTest}
 * 는 SQL 파일에 핵심 토큰이 남아있는지 보는 보조 계약 테스트다. 본 IT 는 V41 UPDATE 본문을
 * PostgreSQL 에 실제 실행해 legacy 9값 backfill 결과와 신규 tonnage CHECK 통과를 검증한다.
 */
@SpringBootTest(classes = SlipServiceApplication.class)
class DispatchVehicle2AxisMigrationBackfillIT extends AbstractPostgresIT {

    @Autowired JdbcTemplate jdbcTemplate;

    @AfterEach
    void cleanup() {
        jdbcTemplate.execute("DROP TABLE IF EXISTS dispatch_vehicle_group_v41_probe");
        jdbcTemplate.update("""
                DELETE FROM dispatch_vehicle_group
                WHERE dispatch_task_id IN (
                    SELECT id FROM dispatch_task WHERE created_by = 'migration-it'
                )
                """);
        jdbcTemplate.update("DELETE FROM dispatch_task WHERE created_by = 'migration-it'");
    }

    @Test
    void v41_update_backfills_legacy_vehicle_type_rows_in_postgres() throws Exception {
        jdbcTemplate.execute("DROP TABLE IF EXISTS dispatch_vehicle_group_v41_probe");
        jdbcTemplate.execute("""
                CREATE TABLE dispatch_vehicle_group_v41_probe (
                    id UUID PRIMARY KEY,
                    vehicle_type VARCHAR(32) NOT NULL,
                    vehicle_body_type VARCHAR(32),
                    tonnage VARCHAR(16)
                )
                """);

        List<String> legacyTypes = List.of(
                "MOTORCYCLE",
                "DAMAS",
                "TONNAGE_1",
                "TONNAGE_1_5",
                "TONNAGE_2_5",
                "TONNAGE_3",
                "TONNAGE_5",
                "TONNAGE_10",
                "TONNAGE_20");
        for (int i = 0; i < legacyTypes.size(); i++) {
            jdbcTemplate.update(
                    "INSERT INTO dispatch_vehicle_group_v41_probe(id, vehicle_type) VALUES (?::uuid, ?)",
                    String.format("00000000-0000-0000-0000-%012d", i + 1),
                    legacyTypes.get(i));
        }

        jdbcTemplate.execute(readV41BackfillUpdateSql()
                .replace("UPDATE dispatch_vehicle_group", "UPDATE dispatch_vehicle_group_v41_probe"));

        Map<String, String> backfilled = jdbcTemplate.query(
                        "SELECT vehicle_type, vehicle_body_type, tonnage "
                                + "FROM dispatch_vehicle_group_v41_probe ORDER BY vehicle_type",
                        (rs, rowNum) -> Map.entry(
                                rs.getString("vehicle_type"),
                                rs.getString("vehicle_body_type") + "/" + rs.getString("tonnage")))
                .stream()
                .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));

        assertThat(backfilled).containsExactlyInAnyOrderEntriesOf(Map.of(
                "MOTORCYCLE", "MOTORCYCLE/null",
                "DAMAS", "DAMAS/null",
                "TONNAGE_1", "CARGO/T_1",
                "TONNAGE_1_5", "CARGO/T_1_4",
                "TONNAGE_2_5", "CARGO/T_2_5",
                "TONNAGE_3", "CARGO/T_3_5",
                "TONNAGE_5", "CARGO/T_5",
                "TONNAGE_10", "CARGO/T_11",
                "TONNAGE_20", "CARGO/T_25"));
    }

    @Test
    void v41_check_constraints_accept_new_tonnage_values() {
        UUID taskId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO dispatch_task(
                    id, task_code, dispatch_date, status, created_at, created_by, is_deleted
                ) VALUES (?::uuid, ?, DATE '2026-06-12', 'DRAFT', NOW(), 'migration-it', FALSE)
                """, taskId.toString(), "V41-CHECK-" + taskId.toString().substring(0, 8));

        jdbcTemplate.update("""
                INSERT INTO dispatch_vehicle_group(
                    id, dispatch_task_id, sequence, vehicle_type, vehicle_body_type, tonnage,
                    created_at, created_by, is_deleted
                ) VALUES (?::uuid, ?::uuid, 1, 'TONNAGE_20', 'CARGO', 'T_18',
                    NOW(), 'migration-it', FALSE)
                """, groupId.toString(), taskId.toString());

        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM dispatch_vehicle_group WHERE id = ?::uuid AND tonnage = 'T_18'",
                Integer.class,
                groupId.toString());
        assertThat(count).isEqualTo(1);
    }

    @Test
    void v41_check_constraints_reject_body_type_tonnage_mismatch() {
        UUID taskId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO dispatch_task(
                    id, task_code, dispatch_date, status, created_at, created_by, is_deleted
                ) VALUES (?::uuid, ?, DATE '2026-06-12', 'DRAFT', NOW(), 'migration-it', FALSE)
                """, taskId.toString(), "V41-REJECT-" + taskId.toString().substring(0, 8));

        assertThatThrownBy(() -> jdbcTemplate.update("""
                INSERT INTO dispatch_vehicle_group(
                    id, dispatch_task_id, sequence, vehicle_type, vehicle_body_type, tonnage,
                    created_at, created_by, is_deleted
                ) VALUES (?::uuid, ?::uuid, 1, 'DAMAS', 'SEDAN', 'T_5',
                    NOW(), 'migration-it', FALSE)
                """, groupId.toString(), taskId.toString()))
                .hasRootCauseInstanceOf(java.sql.SQLException.class);
    }

    private String readV41BackfillUpdateSql() throws Exception {
        Path modulePath = Path.of("src/main/resources/db/migration/V41__dispatch_vehicle_2axis.sql");
        Path rootPath = Path.of("services/slip-service/src/main/resources/db/migration/V41__dispatch_vehicle_2axis.sql");
        String sql = Files.readString(Files.exists(modulePath) ? modulePath : rootPath);
        int start = sql.indexOf("UPDATE dispatch_vehicle_group");
        int end = sql.indexOf("ALTER TABLE dispatch_vehicle_group", start);
        assertThat(start).isGreaterThanOrEqualTo(0);
        assertThat(end).isGreaterThan(start);
        return sql.substring(start, end).trim();
    }
}
