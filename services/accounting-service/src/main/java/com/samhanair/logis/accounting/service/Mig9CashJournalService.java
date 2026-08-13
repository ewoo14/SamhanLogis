package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.domain.CashReceipt;
import com.samhanair.logis.accounting.domain.JournalSourceType;
import com.samhanair.logis.common.ecount.EcountCsvSupport;
import com.samhanair.logis.common.ecount.EcountMig9JournalResult;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** MIG-9 — MIG-7 CashDisbursement/CashReceipt 를 POSTED Journal 로 자동 생성한다. */
@Service
@Slf4j
@RequiredArgsConstructor
public class Mig9CashJournalService {

    private static final UUID CASH_JOURNAL_LOCK_NAMESPACE =
            UUID.fromString("089643fd-b8f0-4f88-9c4a-a69512e8c901");
    private static final int DEFAULT_BATCH_SIZE = 500;
    private static final int MAX_BATCH_SIZE = 5_000;

    // V101 canonical targets를 사용한다: 지급수수료는 8319, 보통예금은 1039.
    // V101의 정본 명칭은 지급수수료(판)이므로 이름 lookup은 legacy seed와 달라진다.
    private static final String ACCOUNT_EXPENSE_CODE = "8319";
    private static final String ACCOUNT_CASH_CODE = CashReceipt.DEFAULT_DEBIT_ACCOUNT_CODE;

    private final NamedParameterJdbcTemplate jdbcTemplate;
    @Autowired(required = false)
    private MigOpsMetricsRecorder metricsRecorder;

    @Transactional(propagation = Propagation.REQUIRES_NEW, isolation = Isolation.READ_COMMITTED)
    public EcountMig9JournalResult generateFromDisbursements(int batchSize, String actorUserId) {
        acquireCashJournalLock();
        List<CashRow> rows = pendingRows("cash_disbursements", normalizeBatchSize(batchSize));
        if (rows.isEmpty()) {
            throw new BusinessException(ErrorCode.MIG9_CASH_ROW_NOT_FOUND,
                    "MIG-9 CashDisbursement Journal 생성 대상 row 가 없습니다.");
        }
        EcountMig9JournalResult.Builder result = EcountMig9JournalResult.builder(rows.size());
        for (CashRow row : rows) {
            processDisbursement(row, normalizeActor(actorUserId), result);
        }
        EcountMig9JournalResult built = result.build();
        EcountMigMetricsSupport.recordJournalResult(metricsRecorder, "mig-9", built);
        return built;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW, isolation = Isolation.READ_COMMITTED)
    public EcountMig9JournalResult generateFromReceipts(int batchSize, String actorUserId) {
        acquireCashJournalLock();
        List<CashRow> rows = pendingRows("cash_receipts", normalizeBatchSize(batchSize));
        if (rows.isEmpty()) {
            throw new BusinessException(ErrorCode.MIG9_CASH_ROW_NOT_FOUND,
                    "MIG-9 CashReceipt Journal 생성 대상 row 가 없습니다.");
        }
        EcountMig9JournalResult.Builder result = EcountMig9JournalResult.builder(rows.size());
        for (CashRow row : rows) {
            processReceipt(row, normalizeActor(actorUserId), result);
        }
        EcountMig9JournalResult built = result.build();
        EcountMigMetricsSupport.recordJournalResult(metricsRecorder, "mig-9", built);
        return built;
    }

    private void processDisbursement(CashRow row, String actor, EcountMig9JournalResult.Builder result) {
        if (skipLinked(row, result)) {
            return;
        }
        if (rejectInvalidAmount(row, result)) {
            return;
        }
        try {
            String expenseCode = requireAccountCode(ACCOUNT_EXPENSE_CODE);
            String cashCode = requireAccountCode(ACCOUNT_CASH_CODE);
            UUID journalId = insertJournal(row, JournalSourceType.CASH_DISBURSEMENT, actor);
            if (skipDuplicateSource(journalId, result)) {
                return;
            }
            insertLine(journalId, 1, expenseCode, row.amount(), BigDecimal.ZERO, row.partnerId(), row.memo(), actor);
            insertLine(journalId, 2, cashCode, BigDecimal.ZERO, row.amount(), row.partnerId(), row.memo(), actor);
            if (!linkCash("cash_disbursements", row.id(), row.version(), journalId, actor)) {
                log.warn("MIG-9 CashDisbursement journal link race — compensating orphan journal. cashId={}, journalId={}",
                        row.id(), journalId);
                deleteGeneratedJournal(journalId);
                result.skipped();
                return;
            }
            result.cashDisbursementCreated();
        } catch (EmptyResultDataAccessException ex) {
            reject(row, ErrorCode.MIG9_DEFAULT_ACCOUNT_MISSING,
                    "MIG-9 기본 계정 조회 실패: 지급수수료(" + ACCOUNT_EXPENSE_CODE
                            + ")/보통예금(" + ACCOUNT_CASH_CODE + ")", result);
        }
    }

    private void processReceipt(CashRow row, String actor, EcountMig9JournalResult.Builder result) {
        if (skipLinked(row, result)) {
            return;
        }
        if (rejectInvalidAmount(row, result)) {
            return;
        }
        try {
            String cashCode = requireAccountCode(CashReceipt.DEFAULT_DEBIT_ACCOUNT_CODE);
            String receivableCode = requireAccountCode(CashReceipt.DEFAULT_CREDIT_ACCOUNT_CODE);
            UUID journalId = insertJournal(row, JournalSourceType.CASH_RECEIPT, actor);
            if (skipDuplicateSource(journalId, result)) {
                return;
            }
            insertLine(journalId, 1, cashCode,
                    row.amount(), BigDecimal.ZERO, row.partnerId(), row.memo(), actor);
            insertLine(journalId, 2, receivableCode,
                    BigDecimal.ZERO, row.amount(), row.partnerId(), row.memo(), actor);
            if (!linkCash("cash_receipts", row.id(), row.version(), journalId, actor)) {
                log.warn("MIG-9 CashReceipt journal link race — compensating orphan journal. cashId={}, journalId={}",
                        row.id(), journalId);
                deleteGeneratedJournal(journalId);
                result.skipped();
                return;
            }
            result.cashReceiptCreated();
        } catch (EmptyResultDataAccessException ex) {
            reject(row, ErrorCode.MIG9_DEFAULT_ACCOUNT_MISSING,
                    "MIG-9 기본 계정 조회 실패: 보통예금(" + CashReceipt.DEFAULT_DEBIT_ACCOUNT_CODE
                            + ")/외상매출금(" + CashReceipt.DEFAULT_CREDIT_ACCOUNT_CODE + ")", result);
        }
    }

    private boolean skipDuplicateSource(UUID journalId, EcountMig9JournalResult.Builder result) {
        if (journalId == null) {
            result.skipped();
            return true;
        }
        return false;
    }

    private boolean skipLinked(CashRow row, EcountMig9JournalResult.Builder result) {
        if (row.journalId() != null) {
            result.skipped();
            return true;
        }
        return false;
    }

    private boolean rejectInvalidAmount(CashRow row, EcountMig9JournalResult.Builder result) {
        if (row.amount() == null || row.amount().compareTo(BigDecimal.ZERO) <= 0) {
            reject(row, ErrorCode.MIG9_CASH_AMOUNT_INVALID,
                    "MIG-9 Cash 금액이 0 이하입니다: slipNo=" + row.slipNo(), result);
            return true;
        }
        return false;
    }

    private String requireAccountCode(String accountCode) {
        return jdbcTemplate.queryForObject("""
                SELECT code
                  FROM chart_of_accounts
                 WHERE code = :code
                   AND is_leaf = TRUE
                   AND is_deleted = FALSE
                 LIMIT 1
                """, new MapSqlParameterSource("code", accountCode), String.class);
    }

    private UUID insertJournal(CashRow row, JournalSourceType sourceType, String actor) {
        // cash_receipt_id — CASH_RECEIPT 배치 게시분만 채운다(#772 fix). row 는 이 브랜치에서
        // cash_receipts 테이블 조회 결과이므로 row.id() 가 곧 CashReceipt UUID (linkCash 가
        // cash_receipts.id = row.id() 로 링크하는 것과 동일 값) — Journal.linkCashReceipt 의 라이브
        // 경로(JournalService.postAutoJournal)와 대칭. CASH_DISBURSEMENT 는 row.id() 가
        // cash_disbursements.id 로 CashReceipt 와 무관하므로 반드시 NULL 로 둔다(오배선 방지 가드).
        UUID cashReceiptId = sourceType == JournalSourceType.CASH_RECEIPT ? row.id() : null;
        List<UUID> ids = jdbcTemplate.query("""
                INSERT INTO journals (
                    id, journal_no, journal_date, description, source_type, source_ref, cash_receipt_id,
                    status, posted_at, posted_by, version, created_at, created_by, is_deleted
                )
                VALUES (
                    gen_random_uuid(), :journalNo, :journalDate, :description, :sourceType, :sourceRef, :cashReceiptId,
                    'POSTED', NOW(), :actor, 0, NOW(), :actor, FALSE
                )
                ON CONFLICT (source_type, source_ref) DO NOTHING
                RETURNING id
                """, new MapSqlParameterSource()
                .addValue("journalNo", journalNo(sourceType, row.slipNo()))
                .addValue("journalDate", row.transactionDate())
                .addValue("description", row.memo())
                .addValue("sourceType", sourceType.name())
                .addValue("sourceRef", row.externalRef())
                .addValue("cashReceiptId", cashReceiptId)
                .addValue("actor", actor), (rs, rowNum) -> rs.getObject("id", UUID.class));
        return ids.stream().findFirst().orElse(null);
    }

    private void insertLine(UUID journalId, int lineNo, String accountCode,
                            BigDecimal debitAmount, BigDecimal creditAmount,
                            UUID partnerId, String memo, String actor) {
        jdbcTemplate.update("""
                INSERT INTO journal_lines (
                    id, journal_id, line_no, account_code, debit_amount, credit_amount, partner_id,
                    memo, created_at, created_by, is_deleted
                )
                VALUES (
                    gen_random_uuid(), :journalId, :lineNo, :accountCode, :debitAmount, :creditAmount, :partnerId,
                    :memo, NOW(), :actor, FALSE
                )
                """, new MapSqlParameterSource()
                .addValue("journalId", journalId)
                .addValue("lineNo", lineNo)
                .addValue("accountCode", accountCode)
                .addValue("debitAmount", debitAmount)
                .addValue("creditAmount", creditAmount)
                .addValue("partnerId", partnerId)
                .addValue("memo", memo)
                .addValue("actor", actor));
    }

    private boolean linkCash(String tableName, UUID cashId, Long cashVersion, UUID journalId, String actor) {
        // journal_id IS NULL 가드 — 라이브 confirm/PATCH(E3 S2)가 배치와 동시에 같은 행에 분개를
        // 링크하는 레이스에서 last-write-wins 로 분개가 고아화되는 것을 차단한다 (@Version 은 raw
        // UPDATE 를 타지 않으므로 SQL 레벨로 방어).
        // status='CONFIRMED' 재확인 + version 비교/bump 는 cash_receipts 한정 — ①TOCTOU: pendingRows
        // SELECT 이후~UPDATE 사이에 라이브 cancel 이 커밋되면(CANCELLED, journal_id 는 NULL 유지)
        // 취소행에 유령 POSTED 분개가 링크되고 역분개 경로(409)가 영구 차단됨. 0행 → 보상삭제+skipped.
        // ②version 컬럼은 V49 가 cash_receipts 에만 추가(라이브 편집 @Version 낙관락 무효화 목적) —
        // cash_disbursements 는 컬럼 자체가 없어 bump 포함 시 배치 전면 실패(42703).
        boolean isReceipts = "cash_receipts".equals(tableName);
        String receiptOnlyClauses = isReceipts
                ? "                       ,version = version + 1\n"
                : "";
        String receiptStatusFilter = isReceipts
                ? "                   AND status = 'CONFIRMED'\n"
                        + "                   AND version = :cashVersion\n"
                : "";
        int updated = jdbcTemplate.update("""
                UPDATE %s
                   SET journal_id = :journalId,
                       modified_at = NOW(),
                       modified_by = :actor
%s                 WHERE id = :cashId
                   AND is_deleted = FALSE
                   AND journal_id IS NULL
%s""".formatted(tableName, receiptOnlyClauses, receiptStatusFilter), new MapSqlParameterSource()
                .addValue("journalId", journalId)
                .addValue("actor", actor)
                .addValue("cashVersion", cashVersion)
                .addValue("cashId", cashId));
        return updated == 1;
    }

    /**
     * 같은 REQUIRES_NEW tx 내 미커밋 orphan 보상 — 커밋된 분개에 사용 금지(원장 불변).
     */
    private void deleteGeneratedJournal(UUID journalId) {
        jdbcTemplate.update("DELETE FROM journal_lines WHERE journal_id = :journalId",
                new MapSqlParameterSource("journalId", journalId));
        jdbcTemplate.update("DELETE FROM journals WHERE id = :journalId",
                new MapSqlParameterSource("journalId", journalId));
    }

    private List<CashRow> pendingRows(String tableName, int batchSize) {
        // cash_receipts 는 E3 S2 라이브 취소(CANCELLED)가 가능하므로 CONFIRMED 만 배치 대상 —
        // journal_id NULL 인 CANCELLED 행(라이브 취소된 MIG 행)에 유령 POSTED 분개가 생기는 것을 차단.
        boolean isReceipts = "cash_receipts".equals(tableName);
        String receiptKindFilter = isReceipts
                ? "                   AND kind = 'DEPOSIT_REPORT'\n"
                        + "                   AND status = 'CONFIRMED'\n"
                : "";
        String versionProjection = isReceipts ? "version" : "NULL::bigint AS version";
        return jdbcTemplate.query("""
                SELECT ROW_NUMBER() OVER (ORDER BY transaction_date, slip_no, id) AS source_row_no,
                       id, slip_no, partner_id, amount, transaction_date, memo, journal_id, external_ref, %s
                   FROM %s
                  WHERE is_deleted = FALSE
                    AND journal_id IS NULL
 %s
                  ORDER BY transaction_date, slip_no, id
                  LIMIT :batchSize
                """.formatted(versionProjection, tableName, receiptKindFilter),
                new MapSqlParameterSource("batchSize", batchSize), cashRowMapper());
    }

    private RowMapper<CashRow> cashRowMapper() {
        return (rs, rowNum) -> new CashRow(
                rs.getInt("source_row_no"),
                rs.getObject("id", UUID.class),
                rs.getString("slip_no"),
                rs.getObject("partner_id", UUID.class),
                rs.getBigDecimal("amount"),
                rs.getObject("transaction_date", LocalDate.class),
                rs.getString("memo"),
                rs.getObject("journal_id", UUID.class),
                rs.getString("external_ref"),
                rs.getObject("version", Long.class));
    }

    private void reject(CashRow row, ErrorCode code, String message, EcountMig9JournalResult.Builder result) {
        result.reject(row.sourceRowNo(), code.name(), message, row.slipNo(), sampleRawValue(row, code));
    }

    private void acquireCashJournalLock() {
        jdbcTemplate.queryForObject("SELECT pg_advisory_xact_lock(:lockKey)",
                new MapSqlParameterSource("lockKey",
                        EcountCsvSupport.advisoryLockKey(CASH_JOURNAL_LOCK_NAMESPACE, "MIG9_CASH_JOURNAL")),
                Object.class);
    }

    private static String sampleRawValue(CashRow row, ErrorCode code) {
        return switch (code) {
            case MIG9_CASH_AMOUNT_INVALID -> row.amount() == null ? null : row.amount().toPlainString();
            case MIG9_DEFAULT_ACCOUNT_MISSING -> row.externalRef();
            case MIG9_JOURNAL_DUPLICATE -> row.externalRef();
            default -> row.externalRef();
        };
    }

    private static int normalizeBatchSize(int batchSize) {
        if (batchSize <= 0) {
            return DEFAULT_BATCH_SIZE;
        }
        return Math.min(batchSize, MAX_BATCH_SIZE);
    }

    private static String normalizeActor(String actorUserId) {
        return actorUserId == null || actorUserId.isBlank() ? "system" : actorUserId;
    }

    private static String journalNo(JournalSourceType sourceType, String slipNo) {
        return switch (sourceType) {
            case CASH_DISBURSEMENT -> "JD-" + slipNo;
            case CASH_RECEIPT -> "JR-" + slipNo;
            default -> "J-" + slipNo;
        };
    }

    record CashRow(int sourceRowNo, UUID id, String slipNo, UUID partnerId, BigDecimal amount,
                   LocalDate transactionDate, String memo, UUID journalId, String externalRef, Long version) {
    }
}
