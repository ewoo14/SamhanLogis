package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.web.dto.EcountVoucherImportResult;
import com.samhanair.logis.common.ecount.EcountCsvSupport;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.io.InputStream;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** MIG-3 — 이카운트 일반전표 CSV → Journal(DRAFT) import. */
@Service
@RequiredArgsConstructor
public class EcountGeneralVoucherImporter {

    private static final UUID IMPORT_LOCK_NAMESPACE =
            UUID.fromString("f2f5f584-6c4a-4233-97f9-f022d4329e7f");
    static final String[] HEADERS = {"전표번호", "거래유형", "금액", "거래처명", "적요명"};
    private static final String MIGRATION_ACCOUNT_CODE = "MIGRATION";

    private final NamedParameterJdbcTemplate jdbcTemplate;
    private final PartnerLookupClient partnerLookupClient;

    @Transactional(propagation = Propagation.REQUIRES_NEW, isolation = Isolation.READ_COMMITTED)
    public EcountVoucherImportResult importCsv(InputStream csv, String actorUserId) {
        byte[] content = EcountCsvSupport.readRequired(csv);
        String hash = EcountCsvSupport.computeFileHash(content);
        acquireImportLock(hash);
        EcountCsvSupport.ParsedCsv parsed = EcountCsvSupport.parse(content);
        EcountVoucherImportSupport.validateHeader(parsed.header(), HEADERS);

        EcountVoucherImportResult.Builder result =
                EcountVoucherImportResult.builder(parsed.dataRows().size(), hash);
        String actor = EcountVoucherImportSupport.actor(actorUserId);
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < parsed.dataRows().size(); i++) {
            int rowNo = i + 1;
            String[] c = EcountCsvSupport.normalizeRow(parsed.dataRows().get(i), HEADERS.length);
            String journalNo = null;
            try {
                journalNo = EcountVoucherImportSupport.normalizeVoucherNo(c[0], rowNo);
                LocalDate journalDate = EcountVoucherImportSupport.parseVoucherDate(c[0], rowNo);
                BigDecimal amount;
                try {
                    amount = EcountVoucherImportSupport.parsePositiveAmount(c[2], rowNo);
                } catch (BusinessException ex) {
                    if (ex.getErrorCode() != ErrorCode.MIG3_SLIP_AMOUNT_INVALID) {
                        throw ex;
                    }
                    insertStaging(hash, rowNo, c, journalNo, journalDate, null, actor);
                    reject(hash, rowNo, "MIG3_SLIP_AMOUNT_INVALID", ex.getMessage(), journalNo);
                    result.reject(rowNo, "MIG3_SLIP_AMOUNT_INVALID", ex.getMessage(), journalNo, c[2]);
                    continue;
                }
                if (!insertStaging(hash, rowNo, c, journalNo, journalDate, amount, actor)) {
                    result.skipped();
                    continue;
                }
                if (!seen.add(journalNo)) {
                    reject(hash, rowNo, "MIG3_VOUCHER_NO_DUPLICATE", "동일 파일 내 전표번호 중복", journalNo);
                    result.reject(rowNo, "MIG3_VOUCHER_NO_DUPLICATE", "동일 파일 내 전표번호 중복", journalNo, c[0]);
                    continue;
                }
                Optional<PartnerSummary> partner = partnerLookupClient.findByPartnerNameStrict(c[3]);
                if (partner.isEmpty() || partner.get().partnerId() == null) {
                    String message = "거래처명 lookup miss: " + c[3];
                    reject(hash, rowNo, "MIG3_LOOKUP_MISS", message, journalNo);
                    result.reject(rowNo, "MIG3_LOOKUP_MISS", message, journalNo, c[3]);
                    continue;
                }
                boolean activeExists = exists("SELECT COUNT(1) FROM journals WHERE journal_no = :journalNo AND is_deleted = FALSE",
                        new MapSqlParameterSource("journalNo", journalNo));
                boolean deletedExists = exists("SELECT COUNT(1) FROM journals WHERE journal_no = :journalNo AND is_deleted = TRUE",
                        new MapSqlParameterSource("journalNo", journalNo));
                UUID journalId = upsertJournal(journalNo, journalDate, c[4], "DRAFT", null, actor);
                replaceLine(journalId, 1, amount, BigDecimal.ZERO, partner.get().partnerId(), c[4], actor);
                updateStatus(hash, rowNo, activeExists || deletedExists ? "UPDATED" : "IMPORTED", null, journalNo);
                if (activeExists || deletedExists) {
                    result.updated();
                } else {
                    result.imported();
                }
                result.draft();
            } catch (BusinessException ex) {
                if (journalNo != null) {
                    reject(hash, rowNo, ex.getErrorCode().name(), ex.getMessage(), journalNo);
                }
                result.reject(rowNo, ex.getErrorCode().name(), ex.getMessage(), journalNo, sampleRawValue(c, ex));
            }
        }
        return result.build();
    }

    private void acquireImportLock(String sourceFileHash) {
        jdbcTemplate.queryForObject("SELECT pg_advisory_xact_lock(:lockKey)",
                new MapSqlParameterSource("lockKey",
                        EcountCsvSupport.advisoryLockKey(IMPORT_LOCK_NAMESPACE, sourceFileHash)),
                Object.class);
    }

    private boolean insertStaging(String hash, int rowNo, String[] c, String journalNo,
                                  LocalDate journalDate, BigDecimal amount, String actor) {
        int rows = jdbcTemplate.update("""
                INSERT INTO staging.ecount_general_voucher_raw (
                  source_file_hash, source_row_no, journal_no, transaction_date, transaction_type,
                  amount, partner_name, description, raw_payload, transform_status, imported_by
                ) VALUES (
                  :hash, :row, :journalNo, :date, :type, :amount, :partnerName, :description,
                  :payload, 'PENDING', :actor
                )
                ON CONFLICT (source_file_hash, source_row_no) DO NOTHING
                """,
                new MapSqlParameterSource()
                        .addValue("hash", hash)
                        .addValue("row", rowNo)
                        .addValue("journalNo", journalNo)
                        .addValue("date", journalDate)
                        .addValue("type", EcountCsvSupport.nullIfBlank(c[1]))
                        .addValue("amount", amount)
                        .addValue("partnerName", EcountCsvSupport.nullIfBlank(c[3]))
                        .addValue("description", EcountCsvSupport.nullIfBlank(c[4]))
                        .addValue("payload", String.join("\u001F", c))
                        .addValue("actor", actor));
        return rows > 0;
    }

    private UUID upsertJournal(String journalNo, LocalDate journalDate, String description,
                               String status, String postedBy, String actor) {
        return jdbcTemplate.queryForObject("""
                WITH restored AS (
                    UPDATE journals
                       SET journal_date = :journalDate,
                           description = :description,
                           source_type = 'MANUAL',
                           source_ref_id = NULL,
                           status = :status,
                           posted_at = CASE WHEN :status = 'POSTED' THEN NOW() ELSE NULL END,
                           posted_by = :postedBy,
                           is_deleted = FALSE,
                           deleted_at = NULL,
                           deleted_by = NULL,
                           modified_at = NOW(),
                           modified_by = :actor
                     WHERE journal_no = :journalNo AND is_deleted = TRUE
                     RETURNING id
                ), upserted AS (
                    INSERT INTO journals (
                      id, journal_no, journal_date, description, source_type, source_ref_id,
                      status, posted_at, posted_by, version, created_at, created_by, modified_at,
                      modified_by, is_deleted
                    )
                    SELECT gen_random_uuid(), :journalNo, :journalDate, :description, 'MANUAL', NULL,
                      :status, CASE WHEN :status = 'POSTED' THEN NOW() ELSE NULL END, :postedBy,
                      0, NOW(), :actor, NOW(), :actor, FALSE
                    WHERE NOT EXISTS (SELECT 1 FROM restored)
                    ON CONFLICT (journal_no) WHERE is_deleted = FALSE DO UPDATE SET
                      journal_date = EXCLUDED.journal_date,
                      description = EXCLUDED.description,
                      status = EXCLUDED.status,
                      posted_at = EXCLUDED.posted_at,
                      posted_by = EXCLUDED.posted_by,
                      modified_at = NOW(),
                      modified_by = EXCLUDED.created_by
                    RETURNING id
                )
                SELECT id FROM restored
                UNION ALL
                SELECT id FROM upserted
                LIMIT 1
                """,
                new MapSqlParameterSource()
                        .addValue("journalNo", journalNo)
                        .addValue("journalDate", journalDate)
                        .addValue("description", EcountCsvSupport.nullIfBlank(description))
                        .addValue("status", status)
                        .addValue("postedBy", postedBy)
                        .addValue("actor", actor),
                UUID.class);
    }

    private void replaceLine(UUID journalId, int lineNo, BigDecimal debit, BigDecimal credit,
                             UUID partnerId, String memo, String actor) {
        jdbcTemplate.update("""
                WITH restored AS (
                    UPDATE journal_lines
                       SET account_code = :accountCode,
                           debit_amount = :debit,
                           credit_amount = :credit,
                           partner_id = :partnerId,
                           memo = :memo,
                           is_deleted = FALSE,
                           deleted_at = NULL,
                           deleted_by = NULL,
                           modified_at = NOW(),
                           modified_by = :actor
                     WHERE journal_id = :journalId AND line_no = :lineNo AND is_deleted = TRUE
                     RETURNING line_no
                )
                INSERT INTO journal_lines (
                  id, journal_id, line_no, account_code, debit_amount, credit_amount,
                  partner_id, memo, created_at, created_by, modified_at, modified_by, is_deleted
                )
                SELECT gen_random_uuid(), :journalId, :lineNo, :accountCode, :debit, :credit,
                  :partnerId, :memo, NOW(), :actor, NOW(), :actor, FALSE
                WHERE NOT EXISTS (SELECT 1 FROM restored)
                ON CONFLICT (journal_id, line_no) WHERE is_deleted = FALSE DO UPDATE SET
                  account_code = EXCLUDED.account_code,
                  debit_amount = EXCLUDED.debit_amount,
                  credit_amount = EXCLUDED.credit_amount,
                  partner_id = EXCLUDED.partner_id,
                  memo = EXCLUDED.memo,
                  is_deleted = FALSE,
                  deleted_at = NULL,
                  deleted_by = NULL,
                  modified_at = NOW(),
                  modified_by = EXCLUDED.created_by
                """,
                new MapSqlParameterSource()
                        .addValue("journalId", journalId)
                        .addValue("lineNo", lineNo)
                        .addValue("accountCode", MIGRATION_ACCOUNT_CODE)
                        .addValue("debit", debit)
                        .addValue("credit", credit)
                        .addValue("partnerId", partnerId)
                        .addValue("memo", EcountCsvSupport.nullIfBlank(memo))
                        .addValue("actor", actor));
    }

    private void updateStatus(String hash, int rowNo, String status, String reason, String targetJournalNo) {
        jdbcTemplate.update("""
                UPDATE staging.ecount_general_voucher_raw
                   SET transform_status = :status,
                       reject_reason = :reason,
                       target_journal_no = :targetJournalNo
                 WHERE source_file_hash = :hash AND source_row_no = :row
                """,
                new MapSqlParameterSource()
                        .addValue("status", status)
                        .addValue("reason", reason)
                        .addValue("targetJournalNo", targetJournalNo)
                        .addValue("hash", hash)
                        .addValue("row", rowNo));
    }

    private void reject(String hash, int rowNo, String code, String reason, String targetJournalNo) {
        updateStatus(hash, rowNo, code, reason, targetJournalNo);
    }

    private boolean exists(String sql, MapSqlParameterSource p) {
        Integer count = jdbcTemplate.queryForObject(sql, p, Integer.class);
        return count != null && count > 0;
    }

    private static String sampleRawValue(String[] c, BusinessException ex) {
        ErrorCode code = ex.getErrorCode();
        if (code == ErrorCode.MIG3_VOUCHER_NO_INVALID) {
            return c[0];
        }
        if (code == ErrorCode.MIG3_SLIP_AMOUNT_INVALID) {
            return c[2];
        }
        if (code == ErrorCode.MIG3_LOOKUP_MISS || code == ErrorCode.MIG3_LOOKUP_AMBIGUOUS) {
            return c[3];
        }
        return String.join("\u001F", c);
    }
}
