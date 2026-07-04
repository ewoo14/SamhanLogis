package com.samhanair.logis.inventory.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.inventory.InventoryServiceApplication;
import com.samhanair.logis.inventory.client.AccountingClient;
import com.samhanair.logis.inventory.client.ProductClient;
import com.samhanair.logis.inventory.client.SlipServiceClient;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * V20/V21 legacy inventory_audits.audit_no normalization regression test.
 */
@SpringBootTest(classes = InventoryServiceApplication.class)
class InventoryAuditNumberMigrationIT extends AbstractPostgresIT {

    private static final UUID WAREHOUSE_ID = UUID.fromString("11111111-1111-1111-1111-000000000001");
    private static final LocalDate POSITIVE_DATE = LocalDate.of(2099, 1, 6);
    private static final LocalDate DUPLICATE_DATE = LocalDate.of(2099, 1, 7);

    @Autowired private JdbcTemplate jdbcTemplate;

    @MockBean private ProductClient productClient;
    @MockBean private AccountingClient accountingClient;
    @MockBean private SlipServiceClient slipServiceClient;

    @BeforeEach
    void cleanRowsBefore() {
        cleanRows();
    }

    @AfterEach
    void cleanRows() {
        jdbcTemplate.update("""
                DELETE FROM inventory_audits
                 WHERE audit_date IN (?, ?)
                """, POSITIVE_DATE, DUPLICATE_DATE);
        jdbcTemplate.update("""
                DELETE FROM inventory_audit_number_sequences
                 WHERE audit_date IN (?, ?)
                """, POSITIVE_DATE, DUPLICATE_DATE);
    }

    @Test
    void v20AndV21_normalizeLegacyAuNumberAndBackfillMaxSequence() throws Exception {
        insertAudit("AU-20990106-000003", POSITIVE_DATE);
        insertAudit("AU-20990106-000009", POSITIVE_DATE);

        jdbcTemplate.execute(readV20Sql());
        jdbcTemplate.execute(readV21Sql());

        List<String> auditNos = jdbcTemplate.queryForList("""
                SELECT audit_no
                  FROM inventory_audits
                 WHERE audit_date = ?
                   AND is_deleted = FALSE
                 ORDER BY audit_no
                """, String.class, POSITIVE_DATE);
        assertThat(auditNos).containsExactly("2099/01/06-3", "2099/01/06-9");

        Integer lastSeq = jdbcTemplate.queryForObject("""
                SELECT last_seq
                  FROM inventory_audit_number_sequences
                 WHERE audit_date = ?
                   AND is_deleted = FALSE
                """, Integer.class, POSITIVE_DATE);
        assertThat(lastSeq).isEqualTo(9);
    }

    @Test
    void v20_rejectsActiveDuplicateCreatedByNormalization() {
        insertAudit("AU-20990107-000001", DUPLICATE_DATE);
        insertAudit("2099/01/07-1", DUPLICATE_DATE);

        assertThatThrownBy(() -> jdbcTemplate.execute(readV20Sql()))
                .isInstanceOf(DataAccessException.class)
                .hasMessageContaining("inventory_audits.audit_no normalization would create active duplicates");
    }

    private void insertAudit(String auditNo, LocalDate auditDate) {
        jdbcTemplate.update("""
                INSERT INTO inventory_audits (
                    id, audit_no, warehouse_id, audit_date, status,
                    total_diff_amount, created_at, created_by, is_deleted
                ) VALUES (
                    ?, ?, ?, ?, 'PLANNED',
                    0, NOW(), 'it', FALSE
                )
                """, UUID.randomUUID(), auditNo, WAREHOUSE_ID, auditDate);
    }

    private static String readV20Sql() throws Exception {
        Path modulePath = Path.of("src/main/resources/db/migration/V20__standardize_inventory_audit_no_slash.sql");
        if (Files.exists(modulePath)) {
            return Files.readString(modulePath);
        }
        return Files.readString(Path.of(
                "services/inventory-service/src/main/resources/db/migration/V20__standardize_inventory_audit_no_slash.sql"));
    }

    private static String readV21Sql() throws Exception {
        Path modulePath = Path.of("src/main/resources/db/migration/V21__create_inventory_audit_number_sequences.sql");
        if (Files.exists(modulePath)) {
            return Files.readString(modulePath);
        }
        return Files.readString(Path.of(
                "services/inventory-service/src/main/resources/db/migration/V21__create_inventory_audit_number_sequences.sql"));
    }
}
