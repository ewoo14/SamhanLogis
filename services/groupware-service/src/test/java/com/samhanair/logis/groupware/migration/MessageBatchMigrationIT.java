package com.samhanair.logis.groupware.migration;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.groupware.GroupwareServiceApplication;
import com.samhanair.logis.groupware.it.AbstractPostgresIT;
import com.samhanair.logis.discovery.ServiceDiscoveryClient;
import java.time.LocalDateTime;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationVersion;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;

/** V13 기존 messages row에 V14 batch_id를 적용하는 upgrade 계약. */
@SpringBootTest(classes = GroupwareServiceApplication.class)
class MessageBatchMigrationIT extends AbstractPostgresIT {

    @MockBean
    @SuppressWarnings("unused")
    private ServiceDiscoveryClient serviceDiscoveryClient;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void v14_preservesExistingMessageRowsWithNullBatchId() {
        String schema = "s6_v14_message_upgrade";
        String url = POSTGRES.getJdbcUrl();
        String user = POSTGRES.getUsername();
        String password = POSTGRES.getPassword();
        UUID messageId = UUID.randomUUID();

        jdbcTemplate.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
        jdbcTemplate.execute("CREATE SCHEMA " + schema);
        try {
            Flyway.configure().dataSource(url, user, password)
                    .schemas(schema)
                    .locations("classpath:db/migration")
                    .target(MigrationVersion.fromVersion("13"))
                    .load().migrate();

            LocalDateTime now = LocalDateTime.now();
            jdbcTemplate.update("""
                    INSERT INTO %s.messages
                        (id, sender_id, recipient_id, body, status, sent_at,
                         created_at, created_by, is_deleted)
                    VALUES (?, ?, ?, ?, 'UNREAD', ?, ?, ?, false)
                    """.formatted(schema),
                    messageId, UUID.randomUUID(), UUID.randomUUID(), "V13 legacy message",
                    now, now, "migration-test");

            Flyway.configure().dataSource(url, user, password)
                    .schemas(schema)
                    .locations("classpath:db/migration")
                    .target(MigrationVersion.fromVersion("14"))
                    .load().migrate();

            assertThat(jdbcTemplate.queryForObject(
                    "SELECT batch_id FROM " + schema + ".messages WHERE id=?",
                    UUID.class, messageId)).isNull();
            assertThat(jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM " + schema + ".messages", Integer.class)).isEqualTo(1);
            assertThat(jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM pg_catalog.pg_indexes "
                            + "WHERE schemaname=? AND indexname='ix_messages_batch_active'",
                    Integer.class, schema)).isEqualTo(1);
        } finally {
            jdbcTemplate.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
        }
    }
}
