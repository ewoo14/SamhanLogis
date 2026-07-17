package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.boot.test.mock.mockito.MockBean;

/** fresh PostgreSQL/Testcontainers에서 V57 partial unique와 provenance schema를 확인한다. */
@SpringBootTest
class BankDepositorPartnerMappingMigrationIT extends AbstractPostgresIT {

    @Autowired private JdbcTemplate jdbcTemplate;
    @MockBean private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void clean() {
        jdbcTemplate.update("DELETE FROM bank_depositor_partner_mapping");
    }

    @Test
    @DisplayName("Flyway V57이 적용되고 provenance 컬럼과 mapping table이 존재한다")
    void v57SchemaExists() {
        Integer version = jdbcTemplate.queryForObject(
                "SELECT version::int FROM flyway_schema_history WHERE version = '57'", Integer.class);
        Integer mappingColumns = jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_name = 'bank_transaction'
                   AND column_name IN ('partner_match_source', 'matched_mapping_id',
                                       'partner_matched_at', 'partner_matched_by')
                """, Integer.class);

        assertThat(version).isEqualTo(57);
        assertThat(mappingColumns).isEqualTo(4);
    }

    @Test
    @DisplayName("활성 normalized key만 unique이고 soft-deleted key는 재생성할 수 있다")
    void partialUniqueExcludesSoftDeletedRows() {
        UUID partnerId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO bank_depositor_partner_mapping
                    (raw_name, normalized_name, partner_id, created_by, is_deleted)
                VALUES (?, ?, ?, 'probe', FALSE)
                """, "Acme", "ACME", partnerId);

        assertThatThrownBy(() -> jdbcTemplate.update("""
                INSERT INTO bank_depositor_partner_mapping
                    (raw_name, normalized_name, partner_id, created_by, is_deleted)
                VALUES (?, ?, ?, 'probe', FALSE)
                """, "ACME 2", "ACME", UUID.randomUUID()))
                .isInstanceOf(Exception.class);

        jdbcTemplate.update("UPDATE bank_depositor_partner_mapping SET is_deleted = TRUE WHERE normalized_name = 'ACME'");
        jdbcTemplate.update("""
                INSERT INTO bank_depositor_partner_mapping
                    (raw_name, normalized_name, partner_id, created_by, is_deleted)
                VALUES (?, ?, ?, 'probe', FALSE)
                """, "Acme 2", "ACME", UUID.randomUUID());
        Integer activeCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM bank_depositor_partner_mapping WHERE normalized_name = 'ACME' AND is_deleted = FALSE",
                Integer.class);
        assertThat(activeCount).isEqualTo(1);
    }
}
