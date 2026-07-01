package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ChatRoomMappingClient;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.ProductClient;
import com.samhanair.logis.accounting.client.SlipQueryClient;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;

/**
 * 회계전표 DRAFT PUT full-form coedit 리뷰 FIX 2 회귀 가드 — journal_lines partial UNIQUE.
 *
 * <p>V49 이전에는 {@code ux_journal_lines_journal_line} 이 전체(soft-delete 무관) UNIQUE 라
 * 라인 재편집(물리 삭제 대신 markDeleted) 시 동일 line_no 재사용이 불가능했다. V49 이후에는
 * {@code ux_journal_lines_journal_line_active} 가 {@code WHERE is_deleted = FALSE} 인 활성
 * 라인만 검사한다 (tax_invoice_lines 의 MIG-12 {@link TaxInvoiceLineSoftDeleteIT} 패턴 답습).
 */
@SpringBootTest(classes = AccountingServiceApplication.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class JournalLineSoftDeleteIT extends AbstractPostgresIT {

    @Autowired private JdbcTemplate jdbcTemplate;

    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private SlipQueryClient slipQueryClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private ProductClient productClient;
    @MockBean private ChatRoomMappingClient chatRoomMappingClient;
    @MockBean private ETaxClient eTaxClient;
    @MockBean private KftcClient kftcClient;
    @MockBean(classes = DynamicPermissionClient.class) private DynamicPermissionClient dynamicPermissionClient;

    @Test
    @DisplayName("soft-delete 된 line_no 는 같은 분개에 재사용 가능")
    void softDeletedLineNo_canBeReused() {
        UUID journalId = insertJournal("JLSD-SD-1");
        insertLine(journalId, 1, false);

        jdbcTemplate.update("""
                UPDATE journal_lines
                   SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = 'it'
                 WHERE journal_id = ? AND line_no = 1
                """, journalId);

        insertLine(journalId, 1, false);

        Integer activeCount = jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM journal_lines
                 WHERE journal_id = ? AND line_no = 1 AND is_deleted = FALSE
                """, Integer.class, journalId);
        Integer totalCount = jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM journal_lines
                 WHERE journal_id = ? AND line_no = 1
                """, Integer.class, journalId);

        assertThat(activeCount).isEqualTo(1);
        assertThat(totalCount).isEqualTo(2);
    }

    @Test
    @DisplayName("active line_no 중복은 UNIQUE 충돌")
    void duplicateActiveLineNo_isRejected() {
        UUID journalId = insertJournal("JLSD-DUP-1");
        insertLine(journalId, 1, false);

        assertThatThrownBy(() -> insertLine(journalId, 1, false))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("서로 다른 active line_no 2건은 정상 저장")
    void twoActiveLines_areAllowed() {
        UUID journalId = insertJournal("JLSD-OK-1");

        insertLine(journalId, 1, false);
        insertLine(journalId, 2, false);

        Integer activeCount = jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM journal_lines
                 WHERE journal_id = ? AND is_deleted = FALSE
                """, Integer.class, journalId);

        assertThat(activeCount).isEqualTo(2);
    }

    private UUID insertJournal(String journalNo) {
        UUID id = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO journals (
                    id, journal_no, journal_date, description, source_type, status,
                    version, created_at, created_by, is_deleted
                ) VALUES (
                    ?, ?, ?, 'JLSD IT', 'MANUAL', 'DRAFT',
                    0, NOW(), 'it', FALSE
                )
                """, id, journalNo, LocalDate.of(2026, 5, 21));
        return id;
    }

    private void insertLine(UUID journalId, int lineNo, boolean deleted) {
        jdbcTemplate.update("""
                INSERT INTO journal_lines (
                    id, journal_id, line_no, account_code, debit_amount, credit_amount,
                    memo, created_at, created_by, is_deleted
                ) VALUES (
                    ?, ?, ?, '101', 1000.00, 0.00,
                    NULL, NOW(), 'it', ?
                )
                """, UUID.randomUUID(), journalId, lineNo, deleted);
    }
}
