package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
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
 * V55 legacy collection_plan.plan_no normalization regression test.
 */
@SpringBootTest(classes = AccountingServiceApplication.class)
class CollectionPlanNumberMigrationIT extends AbstractPostgresIT {

    private static final UUID PARTNER_ID = UUID.fromString("00000000-0000-0000-0000-00000000c055");
    private static final LocalDate POSITIVE_DATE = LocalDate.of(2099, 1, 4);
    private static final LocalDate DUPLICATE_DATE = LocalDate.of(2099, 1, 5);

    @Autowired private JdbcTemplate jdbcTemplate;

    @MockBean private ETaxClient eTaxClient;
    @MockBean private KftcClient kftcClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean(classes = DynamicPermissionClient.class)
    private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void cleanRowsBefore() {
        cleanRows();
    }

    @AfterEach
    void cleanRows() {
        jdbcTemplate.update("""
                DELETE FROM collection_plan
                 WHERE partner_id = ?
                    OR planned_date IN (?, ?)
                """, PARTNER_ID, POSITIVE_DATE, DUPLICATE_DATE);
        jdbcTemplate.update("""
                DELETE FROM collection_plan_number_sequences
                 WHERE planned_date IN (?, ?)
                """, POSITIVE_DATE, DUPLICATE_DATE);
    }

    @Test
    void v55_normalizesLegacyCpNumberAndBackfillsMaxSequence() throws Exception {
        insertPlan("CP-20990104-000007", POSITIVE_DATE);
        insertPlan("CP-20990104-000011", POSITIVE_DATE);

        jdbcTemplate.execute(readV55Sql());

        List<String> planNos = jdbcTemplate.queryForList("""
                SELECT plan_no
                  FROM collection_plan
                 WHERE planned_date = ?
                   AND is_deleted = FALSE
                 ORDER BY plan_no
                """, String.class, POSITIVE_DATE);
        assertThat(planNos).containsExactly("2099/01/04-11", "2099/01/04-7");

        Integer lastSeq = jdbcTemplate.queryForObject("""
                SELECT last_seq
                  FROM collection_plan_number_sequences
                 WHERE planned_date = ?
                   AND is_deleted = FALSE
                """, Integer.class, POSITIVE_DATE);
        assertThat(lastSeq).isEqualTo(11);
    }

    @Test
    void v55_rejectsActiveDuplicateCreatedByNormalization() {
        insertPlan("CP-20990105-000001", DUPLICATE_DATE);
        insertPlan("2099/01/05-1", DUPLICATE_DATE);

        assertThatThrownBy(() -> jdbcTemplate.execute(readV55Sql()))
                .isInstanceOf(DataAccessException.class)
                .hasMessageContaining("collection_plan.plan_no normalization would create active duplicates");
    }

    private void insertPlan(String planNo, LocalDate plannedDate) {
        jdbcTemplate.update("""
                INSERT INTO collection_plan (
                    id, plan_no, partner_id, planned_date, planned_amount,
                    basis, status, created_at, created_by, is_deleted
                ) VALUES (
                    ?, ?, ?, ?, 1000.00,
                    'MANUAL', 'PLANNED', NOW(), 'it', FALSE
                )
                """, UUID.randomUUID(), planNo, PARTNER_ID, plannedDate);
    }

    private static String readV55Sql() throws Exception {
        Path modulePath = Path.of("src/main/resources/db/migration/V55__standardize_collection_plan_no_slash.sql");
        if (Files.exists(modulePath)) {
            return Files.readString(modulePath);
        }
        return Files.readString(Path.of(
                "services/accounting-service/src/main/resources/db/migration/V55__standardize_collection_plan_no_slash.sql"));
    }
}
