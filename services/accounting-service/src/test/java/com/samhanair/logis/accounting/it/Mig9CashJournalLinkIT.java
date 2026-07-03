package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ApprovalLineAuthorizeClient;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.service.Mig9CashJournalService;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * MIG-9 link SQL 의 실 PG 스키마 실행성 IT.
 *
 * <p>단위 테스트의 SQL 문자열 pin 은 컬럼 실존(스키마 정합)을 검증하지 못한다 — PR #710 의
 * {@code version = version + 1} 이 cash_disbursements(version 컬럼 없음, V49=cash_receipts 전용)
 * 를 42703 으로 전면 실패시키는 결함이 mock-green 으로 생존한 실례. 본 IT 는 receipts/disbursements
 * 양 경로의 링크 UPDATE 를 실 Postgres 에 실행해 스키마 회귀를 고정한다.
 *
 * <p>서비스가 REQUIRES_NEW 로 자체 커밋하므로 NOT_SUPPORTED + finally cleanup 패턴을 쓴다.
 */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
class Mig9CashJournalLinkIT extends AbstractPostgresIT {

    private static final String RECEIPT_SLIP_NO = "IT-MIG9-R1";
    private static final String RECEIPT_EXTERNAL_REF = "IT:MIG9:R1";
    private static final String DISBURSEMENT_SLIP_NO = "IT-MIG9-D1";
    private static final String DISBURSEMENT_EXTERNAL_REF = "IT:MIG9:D1";

    @Autowired private Mig9CashJournalService service;
    @Autowired private JdbcTemplate jdbcTemplate;

    @MockBean private ETaxClient eTaxClient;
    @MockBean private KftcClient kftcClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private ApprovalLineAuthorizeClient approvalLineAuthorizeClient;
    @MockBean(classes = DynamicPermissionClient.class) private DynamicPermissionClient dynamicPermissionClient;

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    @DisplayName("MIG-9 링크 UPDATE 는 receipts(status·version 포함)/disbursements(미포함) 실 스키마에서 실행된다")
    void linkSqlExecutesAgainstRealSchemaForBothTables() {
        UUID receiptId = UUID.randomUUID();
        UUID disbursementId = UUID.randomUUID();
        try {
            cleanupTestRows();
            jdbcTemplate.update("""
                    INSERT INTO cash_receipts (
                        id, slip_no, partner_id, amount, transaction_date, kind, status,
                        memo, journal_id, external_ref, version, created_at, created_by, is_deleted
                    ) VALUES (?, ?, ?, 12345.00, DATE '0001-01-01', 'DEPOSIT_REPORT', 'CONFIRMED',
                        'MIG9 link IT', NULL, ?, 0, NOW(), 'it', FALSE)
                    """, receiptId, RECEIPT_SLIP_NO, UUID.randomUUID(), RECEIPT_EXTERNAL_REF);
            jdbcTemplate.update("""
                    INSERT INTO cash_disbursements (
                        id, slip_no, partner_id, amount, transaction_date, kind,
                        memo, journal_id, external_ref, created_at, created_by, is_deleted
                    ) VALUES (?, ?, ?, 23456.00, DATE '0001-01-02', 'EXPENSE_VOUCHER',
                        'MIG9 link IT', NULL, ?, NOW(), 'it', FALSE)
                    """, disbursementId, DISBURSEMENT_SLIP_NO, UUID.randomUUID(), DISBURSEMENT_EXTERNAL_REF);

            var receiptResult = service.generateFromReceipts(1, "it-actor");
            // 공유 컨테이너에 타 IT 커밋 잔류가 있어도 견고하도록 하한 단언 + 본 시드 행 개별 단언.
            assertThat(receiptResult.cashReceiptJournalsCreated()).isGreaterThanOrEqualTo(1);
            UUID receiptJournalId = jdbcTemplate.queryForObject(
                    "SELECT journal_id FROM cash_receipts WHERE id = ?", UUID.class, receiptId);
            assertThat(receiptJournalId).isNotNull();
            Long receiptVersion = jdbcTemplate.queryForObject(
                    "SELECT version FROM cash_receipts WHERE id = ?", Long.class, receiptId);
            assertThat(receiptVersion).isEqualTo(1L);

            // PR #710 회귀 고정 — version 컬럼이 없는 disbursements 링크가 42703 없이 성공해야 한다.
            var disbursementResult = service.generateFromDisbursements(1, "it-actor");
            assertThat(disbursementResult.cashDisbursementJournalsCreated()).isGreaterThanOrEqualTo(1);
            UUID disbursementJournalId = jdbcTemplate.queryForObject(
                    "SELECT journal_id FROM cash_disbursements WHERE id = ?", UUID.class, disbursementId);
            assertThat(disbursementJournalId).isNotNull();
        } finally {
            cleanupTestRows();
        }
    }

    private void cleanupTestRows() {
        jdbcTemplate.update("""
                DELETE FROM journal_lines
                 WHERE journal_id IN (
                       SELECT id FROM journals WHERE source_ref IN (?, ?))
                """, RECEIPT_EXTERNAL_REF, DISBURSEMENT_EXTERNAL_REF);
        jdbcTemplate.update("DELETE FROM journals WHERE source_ref IN (?, ?)",
                RECEIPT_EXTERNAL_REF, DISBURSEMENT_EXTERNAL_REF);
        jdbcTemplate.update("DELETE FROM cash_receipts WHERE slip_no = ? OR external_ref = ?",
                RECEIPT_SLIP_NO, RECEIPT_EXTERNAL_REF);
        jdbcTemplate.update("DELETE FROM cash_disbursements WHERE slip_no = ? OR external_ref = ?",
                DISBURSEMENT_SLIP_NO, DISBURSEMENT_EXTERNAL_REF);
    }
}
