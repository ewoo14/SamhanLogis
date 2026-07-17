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

/** fresh PostgreSQL/Testcontainers에서 V57/V58 partial unique·CHECK와 provenance schema를 확인한다. */
@SpringBootTest
class BankDepositorPartnerMappingMigrationIT extends AbstractPostgresIT {

    @Autowired private JdbcTemplate jdbcTemplate;
    @MockBean private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void clean() {
        jdbcTemplate.update("DELETE FROM bank_transaction");
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

    /** #810 적대검증 R1 (L1-T1) — V57 3중 + V58 snapshot CHECK가 오염 행을 거부하는지 probe. */
    @Test
    @DisplayName("provenance CHECK는 오염 행(무출처 매칭/매핑 id·snapshot 불일치)을 거부한다")
    void provenanceChecksRejectBadRows() {
        // 1) 매칭 거래처는 있는데 출처(source)가 NULL → ck_bank_transaction_partner_match_pair 거부.
        assertThatThrownBy(() -> insertProvenanceRow("probe-bad-pair",
                UUID.randomUUID(), null, null, null, null))
                .hasStackTraceContaining("ck_bank_transaction_partner_match_pair");

        // 2) DEPOSITOR_MAPPING인데 matched_mapping_id NULL → ck_bank_transaction_depositor_mapping_id 거부.
        assertThatThrownBy(() -> insertProvenanceRow("probe-bad-mapping-id",
                UUID.randomUUID(), "DEPOSITOR_MAPPING", null, "Acme", "ACME"))
                .hasStackTraceContaining("ck_bank_transaction_depositor_mapping_id");

        // 3) 매핑 출처가 아닌데 matched_mapping_id 보유 → ck_bank_transaction_non_mapping_id 거부.
        assertThatThrownBy(() -> insertProvenanceRow("probe-bad-non-mapping",
                UUID.randomUUID(), "MANUAL", UUID.randomUUID(), null, null))
                .hasStackTraceContaining("ck_bank_transaction_non_mapping_id");

        // 4) V58: 매핑 출처가 아닌데 snapshot(raw/normalized) 보유 → ck_bank_transaction_mapping_snapshot 거부.
        assertThatThrownBy(() -> insertProvenanceRow("probe-bad-snapshot",
                UUID.randomUUID(), "MANUAL", null, "Acme", "ACME"))
                .hasStackTraceContaining("ck_bank_transaction_mapping_snapshot");

        // 5) 허용 소스 목록 밖 출처 → ck_bank_transaction_partner_match_source 거부.
        assertThatThrownBy(() -> insertProvenanceRow("probe-bad-source",
                UUID.randomUUID(), "GUESSED", null, null, null))
                .hasStackTraceContaining("ck_bank_transaction_partner_match_source");
    }

    @Test
    @DisplayName("provenance CHECK는 정상 행(MANUAL/DEPOSITOR_MAPPING/미매칭)을 수용한다")
    void provenanceChecksAcceptValidRows() {
        // 미매칭 import 행 (전부 NULL).
        insertProvenanceRow("probe-ok-null", null, null, null, null, null);
        // MANUAL 매칭 행 (snapshot 없음).
        insertProvenanceRow("probe-ok-manual", UUID.randomUUID(), "MANUAL", null, null, null);
        // DEPOSITOR_MAPPING 매칭 행 (매핑 id + snapshot).
        insertProvenanceRow("probe-ok-mapping", UUID.randomUUID(), "DEPOSITOR_MAPPING",
                UUID.randomUUID(), "Acme", "ACME");

        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM bank_transaction WHERE external_ref LIKE 'probe-ok-%'", Integer.class);
        assertThat(count).isEqualTo(3);
    }

    @Test
    @DisplayName("Flyway V58 mapping snapshot CHECK가 적용되어 있다")
    void v58SnapshotCheckExists() {
        Integer version = jdbcTemplate.queryForObject(
                "SELECT version::int FROM flyway_schema_history WHERE version = '58'", Integer.class);
        Integer constraintCount = jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM pg_constraint
                 WHERE conname = 'ck_bank_transaction_mapping_snapshot'
                   AND conrelid = 'bank_transaction'::regclass
                """, Integer.class);

        assertThat(version).isEqualTo(58);
        assertThat(constraintCount).isEqualTo(1);
    }

    private void insertProvenanceRow(String externalRef, UUID matchedPartnerId, String source,
                                     UUID matchedMappingId, String mappingRawName, String mappingNormalizedName) {
        jdbcTemplate.update("""
                INSERT INTO bank_transaction (
                    id, transacted_at, txn_type, amount, description, bank_account_label,
                    source, external_ref, match_status, matched_partner_id, partner_match_source,
                    matched_mapping_id, partner_matched_at, partner_matched_by,
                    matched_mapping_raw_name, matched_mapping_normalized_name,
                    created_at, created_by, is_deleted
                ) VALUES (
                    ?, TIMESTAMP '2026-06-23 09:00:00', 'DEPOSIT', 1000.00, 'probe', '국민 probe',
                    'CSV_IMPORT', ?, 'UNREFLECTED', ?, ?::varchar,
                    ?, ?::timestamp, ?::varchar,
                    ?::varchar, ?::varchar,
                    NOW(), 'probe', FALSE
                )
                """, UUID.randomUUID(), externalRef, matchedPartnerId, source,
                matchedMappingId,
                source == null ? null : java.sql.Timestamp.valueOf("2026-06-23 09:00:00"),
                source == null ? null : "probe",
                mappingRawName, mappingNormalizedName);
    }
}
