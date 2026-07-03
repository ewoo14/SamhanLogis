package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ApprovalLineAuthorizeClient;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.service.Mig9CashJournalService;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import javax.sql.DataSource;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;
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
class Mig9CashJournalLinkIT extends AbstractPostgresIT {

    private static final String RECEIPT_SLIP_NO = "IT-MIG9-R1";
    private static final String RECEIPT_EXTERNAL_REF = "IT:MIG9:R1";
    private static final String DISBURSEMENT_SLIP_NO = "IT-MIG9-D1";
    private static final String DISBURSEMENT_EXTERNAL_REF = "IT:MIG9:D1";
    private static final String RACE_RECEIPT_SLIP_NO = "IT-MIG9-R2";
    private static final String RACE_RECEIPT_EXTERNAL_REF = "IT:MIG9:R2";

    @Autowired private Mig9CashJournalService service;
    @Autowired private JdbcTemplate jdbcTemplate;
    @Autowired private DataSource dataSource;

    @MockBean private ETaxClient eTaxClient;
    @MockBean private KftcClient kftcClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private ApprovalLineAuthorizeClient approvalLineAuthorizeClient;
    @MockBean(classes = DynamicPermissionClient.class) private DynamicPermissionClient dynamicPermissionClient;

    // 결정적 TOCTOU 인터리빙 IT 전용 — pendingRows() 의 NamedParameterJdbcTemplate.query 호출을
    // 가로채 별도 커넥션 CANCELLED 선커밋을 주입한다(스레드/sleep 불필요).
    @SpyBean private NamedParameterJdbcTemplate namedParameterJdbcTemplate;

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

    /**
     * {@link Mig9CashJournalService#linkCash} 주석 ①(TOCTOU) 인터리빙을 결정적으로 재현·고정한다.
     *
     * <p>pendingRows() 가 CONFIRMED 행을 SELECT 로 읽은 직후 — linkCash() 의 CAS UPDATE
     * (WHERE status='CONFIRMED' AND version=...) 가 실행되기 전 — 라이브 confirm/cancel(E3 S2) 이
     * 같은 행을 CANCELLED 로 먼저 커밋해버리는 레이스를 재현한다. sleep 이나 별도 스레드로 타이밍을
     * 맞추면 플레이키해지므로, 서비스가 실제로 의존하는 {@link NamedParameterJdbcTemplate} 빈을
     * {@code @SpyBean} 으로 감싸 pendingRows 의 SELECT(FROM cash_receipts) 호출을 가로챈다 —
     * 실결과(callRealMethod)를 받은 바로 그 지점이 곧 "SELECT 완료 ~ CAS UPDATE 실행 전" 구간이므로,
     * 그 안에서 별도 auto-commit 커넥션(스레드/트랜잭션 전파 경로 밖)으로 CANCELLED 를 선커밋하면
     * 매 실행 100% 동일한 인터리빙이 만들어진다.
     *
     * <p>단언: linkCash 의 CAS 가 0행이 되어 result.skipped() 에 반영되고, 같은 REQUIRES_NEW tx 내에서
     * 생성됐던 journal/journal_lines 가 보상삭제되어 잔존 0(고아 분개 없음), 해당 receipt 는
     * journal_id NULL 유지·status CANCELLED 유지.
     */
    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    @DisplayName("pendingRows 조회 후 linkCash CAS 전에 CANCELLED 가 선커밋되면 링크 0행 → 고아 분개 보상삭제 + skipped 처리된다")
    @SuppressWarnings({"rawtypes", "unchecked"})
    void linkCashCompensatesWhenReceiptCancelledBetweenPendingRowsAndLinkUpdate() {
        UUID receiptId = UUID.randomUUID();
        AtomicBoolean cancelCommitted = new AtomicBoolean(false);
        try {
            cleanupTestRows();
            jdbcTemplate.update("""
                    INSERT INTO cash_receipts (
                        id, slip_no, partner_id, amount, transaction_date, kind, status,
                        memo, journal_id, external_ref, version, created_at, created_by, is_deleted
                    ) VALUES (?, ?, ?, 34567.00, DATE '0001-01-01', 'DEPOSIT_REPORT', 'CONFIRMED',
                        'MIG9 link race IT', NULL, ?, 0, NOW(), 'it', FALSE)
                    """, receiptId, RACE_RECEIPT_SLIP_NO, UUID.randomUUID(), RACE_RECEIPT_EXTERNAL_REF);

            doAnswer(invocation -> {
                Object rows = invocation.callRealMethod();
                String sql = invocation.getArgument(0, String.class);
                if (sql.contains("FROM cash_receipts") && cancelCommitted.compareAndSet(false, true)) {
                    // dataSource 직접 획득 — DataSourceUtils/스레드 바인딩 트랜잭션을 우회해 현재
                    // REQUIRES_NEW 서비스 트랜잭션과 물리적으로 별도인 커넥션·auto-commit 으로 즉시
                    // 커밋한다(별도 스레드 불필요 — 이미 같은 스레드에서 SELECT 이후 시점이 보장됨).
                    try (Connection raceConnection = dataSource.getConnection()) {
                        raceConnection.setAutoCommit(true);
                        try (PreparedStatement ps = raceConnection.prepareStatement(
                                "UPDATE cash_receipts SET status = 'CANCELLED', modified_at = NOW() WHERE id = ?")) {
                            ps.setObject(1, receiptId);
                            assertThat(ps.executeUpdate()).isEqualTo(1);
                        }
                    }
                }
                return rows;
            }).when(namedParameterJdbcTemplate)
                    .query(anyString(), any(SqlParameterSource.class), any(RowMapper.class));

            var result = service.generateFromReceipts(0, "it-actor");

            assertThat(cancelCommitted.get())
                    .as("가로채기가 실제로 발동해 레이스를 주입했는지")
                    .isTrue();
            // 공유 컨테이너에 타 IT 커밋 잔류가 있어도 견고하도록 하한 단언 + 본 시드 행 개별 단언.
            assertThat(result.skipped()).isGreaterThanOrEqualTo(1);

            UUID journalId = jdbcTemplate.queryForObject(
                    "SELECT journal_id FROM cash_receipts WHERE id = ?", UUID.class, receiptId);
            assertThat(journalId).isNull();
            String status = jdbcTemplate.queryForObject(
                    "SELECT status FROM cash_receipts WHERE id = ?", String.class, receiptId);
            assertThat(status).isEqualTo("CANCELLED");

            Long orphanJournalCount = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM journals WHERE source_ref = ?",
                    Long.class, RACE_RECEIPT_EXTERNAL_REF);
            assertThat(orphanJournalCount).isZero();
            Long orphanLineCount = jdbcTemplate.queryForObject("""
                    SELECT COUNT(*) FROM journal_lines
                     WHERE journal_id IN (SELECT id FROM journals WHERE source_ref = ?)
                    """, Long.class, RACE_RECEIPT_EXTERNAL_REF);
            assertThat(orphanLineCount).isZero();
        } finally {
            cleanupTestRows();
        }
    }

    private void cleanupTestRows() {
        jdbcTemplate.update("""
                DELETE FROM journal_lines
                 WHERE journal_id IN (
                       SELECT id FROM journals WHERE source_ref IN (?, ?, ?))
                """, RECEIPT_EXTERNAL_REF, DISBURSEMENT_EXTERNAL_REF, RACE_RECEIPT_EXTERNAL_REF);
        jdbcTemplate.update("DELETE FROM journals WHERE source_ref IN (?, ?, ?)",
                RECEIPT_EXTERNAL_REF, DISBURSEMENT_EXTERNAL_REF, RACE_RECEIPT_EXTERNAL_REF);
        jdbcTemplate.update("DELETE FROM cash_receipts WHERE slip_no IN (?, ?) OR external_ref IN (?, ?)",
                RECEIPT_SLIP_NO, RACE_RECEIPT_SLIP_NO, RECEIPT_EXTERNAL_REF, RACE_RECEIPT_EXTERNAL_REF);
        jdbcTemplate.update("DELETE FROM cash_disbursements WHERE slip_no = ? OR external_ref = ?",
                DISBURSEMENT_SLIP_NO, DISBURSEMENT_EXTERNAL_REF);
    }
}
