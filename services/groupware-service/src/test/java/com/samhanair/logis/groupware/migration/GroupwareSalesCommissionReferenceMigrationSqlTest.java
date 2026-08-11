package com.samhanair.logis.groupware.migration;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

/** S3 V19 참조 문서 CHECK 확장·역방향 인덱스 계약을 검증한다. */
class GroupwareSalesCommissionReferenceMigrationSqlTest {

    @Test
    void v19_preserves_all_existing_reference_and_attachment_values_while_adding_settlement() throws Exception {
        String sql = readMigration();

        assertThat(sql).contains("DROP CONSTRAINT IF EXISTS ck_approval_attachments_ref_doc_type");
        assertThat(sql).contains("ADD CONSTRAINT ck_approval_attachments_ref_doc_type");
        assertThat(sql).contains("'OUTBOUND_SLIP'");
        assertThat(sql).contains("'INBOUND_SLIP'");
        assertThat(sql).contains("'JOURNAL'");
        assertThat(sql).contains("'TAX_INVOICE'");
        assertThat(sql).contains("'STATEMENT'");
        assertThat(sql).contains("'PARTNER_LEDGER'");
        assertThat(sql).contains("'SALES_COMMISSION_SETTLEMENT'");
        assertThat(sql).doesNotContain("DROP CONSTRAINT IF EXISTS approval_attachments_attachment_type_check");
        assertThat(sql).doesNotContain("attachment_type CHECK");
        assertThat(sql).doesNotContain("UPDATE approval_attachments");
        assertThat(sql).doesNotContain("DELETE FROM approval_attachments");
        assertThat(sql).doesNotContain("INSERT INTO approval_attachments");
    }

    @Test
    void v19_adds_active_reverse_lookup_index_without_changing_reference_meaning() throws Exception {
        String sql = readMigration();

        assertThat(sql).contains("CREATE INDEX IF NOT EXISTS ix_approval_attachments_ref_doc_active");
        assertThat(sql).contains("ON approval_attachments (ref_doc_type, ref_doc_no)");
        assertThat(sql).contains("WHERE is_deleted = FALSE");
    }

    private static String readMigration() throws Exception {
        Path modulePath = Path.of("src/main/resources/db/migration/V19__extend_approval_reference_doc_type.sql");
        Path rootPath = Path.of(
                "services/groupware-service/src/main/resources/db/migration/V19__extend_approval_reference_doc_type.sql");
        return Files.readString(Files.exists(modulePath) ? modulePath : rootPath);
    }
}
