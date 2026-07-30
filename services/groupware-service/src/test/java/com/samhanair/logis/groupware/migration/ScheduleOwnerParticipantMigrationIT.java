package com.samhanair.logis.groupware.migration;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.discovery.ServiceDiscoveryClient;
import com.samhanair.logis.groupware.GroupwareServiceApplication;
import com.samhanair.logis.groupware.it.AbstractPostgresIT;
import java.time.LocalDateTime;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationVersion;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;

/** V16까지 존재하던 owner-less 일정 행을 V17에서 대상자로 backfill하는 upgrade 계약. */
@SpringBootTest(classes = GroupwareServiceApplication.class)
class ScheduleOwnerParticipantMigrationIT extends AbstractPostgresIT {

    @MockBean
    @SuppressWarnings("unused")
    private ServiceDiscoveryClient serviceDiscoveryClient;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void v17_backfills_owner_as_active_participant_for_legacy_schedule() {
        String schema = "s17_schedule_owner_upgrade";
        String url = POSTGRES.getJdbcUrl();
        String user = POSTGRES.getUsername();
        String password = POSTGRES.getPassword();
        UUID scheduleId = UUID.randomUUID();
        UUID ownerId = UUID.randomUUID();
        LocalDateTime now = LocalDateTime.now();

        jdbcTemplate.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
        jdbcTemplate.execute("CREATE SCHEMA " + schema);
        try {
            Flyway.configure().dataSource(url, user, password)
                    .schemas(schema)
                    .locations("classpath:db/migration")
                    .target(MigrationVersion.fromVersion("16"))
                    .load().migrate();

            // V16까지의 ScheduleService/GroupwareSeeder가 실제로 저장하던 owner-less 상태.
            jdbcTemplate.update("""
                    INSERT INTO %s.schedules
                        (id, owner_id, title, description, starts_at, ends_at, status,
                         created_at, created_by, is_deleted)
                    VALUES (?, ?, ?, ?, ?, ?, 'CONFIRMED', ?, ?, false)
                    """.formatted(schema),
                    scheduleId, ownerId, "기존 일정", "기존 본문", now, now.plusHours(1),
                    now, "migration-test");

            assertThat(jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM " + schema + ".schedule_participants WHERE schedule_id=?",
                    Integer.class, scheduleId)).isZero();

            Flyway.configure().dataSource(url, user, password)
                    .schemas(schema)
                    .locations("classpath:db/migration")
                    .target(MigrationVersion.fromVersion("17"))
                    .load().migrate();

            assertThat(jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM " + schema
                            + ".schedule_participants WHERE schedule_id=? AND participant_id=?"
                            + " AND is_deleted=false",
                    Integer.class, scheduleId, ownerId)).isEqualTo(1);
        } finally {
            jdbcTemplate.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
        }
    }
}
