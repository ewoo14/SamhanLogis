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
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** MIG-3 — 이카운트 회계전표분개 CSV → Journal + JournalLine import. */
@Service
@RequiredArgsConstructor
public class EcountJournalEntryImporter {

    private static final UUID IMPORT_LOCK_NAMESPACE =
            UUID.fromString("84fa87c1-2ee8-477f-ae0e-413c42f9fa8e");
    static final String[] HEADERS = {"일자-No-순번", "계정명", "거래처명", "차변금액", "대변금액", "적요"};

    private final NamedParameterJdbcTemplate jdbcTemplate;
    private final PartnerLookupClient partnerLookupClient;

    @Transactional(propagation = Propagation.REQUIRES_NEW, isolation = Isolation.READ_COMMITTED)
    public EcountVoucherImportResult importCsv(InputStream csv, String actorUserId) {
        byte[] content = EcountCsvSupport.readRequired(csv);
        String hash = EcountCsvSupport.computeMd5FileHash(content);
        acquireImportLock(hash);
        EcountCsvSupport.ParsedCsv parsed = EcountCsvSupport.parse(content);
        EcountVoucherImportSupport.validateHeader(parsed.header(), HEADERS);

        EcountVoucherImportResult.Builder result =
                EcountVoucherImportResult.builder(parsed.dataRows().size(), hash);
        String actor = EcountVoucherImportSupport.actor(actorUserId);
        Map<String, List<EntryRow>> groups = new LinkedHashMap<>();

        for (int i = 0; i < parsed.dataRows().size(); i++) {
            int rowNo = i + 1;
            String[] c = EcountCsvSupport.normalizeRow(parsed.dataRows().get(i), HEADERS.length);
            String journalNo = null;
            try {
                EcountVoucherImportSupport.JournalEntryKey key =
                        EcountVoucherImportSupport.parseJournalEntryKey(c[0], rowNo);
                journalNo = key.journalNo();
                BigDecimal debit = EcountVoucherImportSupport.parseAmount(c[3], rowNo);
                BigDecimal credit = EcountVoucherImportSupport.parseAmount(c[4], rowNo);
                if (debit.signum() == 0 && credit.signum() == 0 || debit.signum() > 0 && credit.signum() > 0) {
                    throw new BusinessException(ErrorCode.MIG3_SLIP_AMOUNT_INVALID,
                            "차변/대변 금액은 한쪽만 0보다 커야 합니다: sourceRowNo=" + rowNo);
                }
                if (!insertStaging(hash, rowNo, c, key, debit, credit, actor)) {
                    result.skipped();
                    continue;
                }
                Optional<PartnerSummary> partner = resolvePartner(c[2]);
                if (partner.isEmpty() && !EcountVoucherImportSupport.isBlankOrPlaceholder(c[2])) {
                    String message = "거래처명 lookup miss: " + c[2];
                    reject(hash, rowNo, "MIG3_LOOKUP_MISS", message, journalNo);
                    result.reject(rowNo, "MIG3_LOOKUP_MISS", message, journalNo, c[2]);
                    continue;
                }
                Optional<String> accountCode = resolveAccountCode(c[1]);
                if (accountCode.isEmpty()) {
                    String message = "계정명 lookup miss: " + c[1];
                    reject(hash, rowNo, "MIG3_LOOKUP_MISS", message, journalNo);
                    result.reject(rowNo, "MIG3_LOOKUP_MISS", message, journalNo, c[1]);
                    continue;
                }
                EntryRow row = new EntryRow(rowNo, key.journalDate(), key.journalNo(), key.lineSequence(),
                        accountCode.get(), partner.map(PartnerSummary::partnerId).orElse(null),
                        debit, credit, c[5]);
                groups.computeIfAbsent(key.journalNo(), ignored -> new ArrayList<>()).add(row);
            } catch (BusinessException ex) {
                if (ex.getErrorCode() == ErrorCode.MIG3_SLIP_AMOUNT_INVALID) {
                    reject(hash, rowNo, "MIG3_SLIP_AMOUNT_INVALID", ex.getMessage(), journalNo);
                    result.reject(rowNo, "MIG3_SLIP_AMOUNT_INVALID", ex.getMessage(), journalNo, c[0]);
                } else {
                    throw ex;
                }
            }
        }

        for (Map.Entry<String, List<EntryRow>> entry : groups.entrySet()) {
            List<EntryRow> rows = entry.getValue().stream()
                    .sorted(Comparator.comparingInt(EntryRow::lineSequence))
                    .toList();
            EntryRow first = rows.get(0);
            BigDecimal debitSum = rows.stream().map(EntryRow::debit).reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal creditSum = rows.stream().map(EntryRow::credit).reduce(BigDecimal.ZERO, BigDecimal::add);
            boolean balanced = debitSum.compareTo(creditSum) == 0;
            boolean activeExists = exists("SELECT COUNT(1) FROM journals WHERE journal_no = :journalNo AND is_deleted = FALSE",
                    new MapSqlParameterSource("journalNo", first.journalNo()));
            boolean deletedExists = exists("SELECT COUNT(1) FROM journals WHERE journal_no = :journalNo AND is_deleted = TRUE",
                    new MapSqlParameterSource("journalNo", first.journalNo()));
            UUID journalId = upsertJournal(first.journalNo(), first.journalDate(), first.memo(),
                    balanced ? "POSTED" : "DRAFT", balanced ? actor : null, actor);
            softDeleteExistingLines(journalId, actor);
            for (EntryRow row : rows) {
                insertLine(journalId, row.lineSequence(), row.accountCode(), row.debit(), row.credit(),
                        row.partnerId(), row.memo(), actor);
                updateStatus(hash, row.rowNo(), activeExists || deletedExists ? "UPDATED" : "IMPORTED",
                        null, row.journalNo());
            }
            if (activeExists || deletedExists) {
                result.updated();
            } else {
                result.imported();
            }
            if (balanced) {
                result.posted();
            } else {
                result.draft();
                result.warning("MIG3_JOURNAL_BALANCE_MISMATCH",
                        "차변 합계(" + debitSum + ")와 대변 합계(" + creditSum + ")가 일치하지 않습니다",
                        first.journalNo());
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

    private boolean insertStaging(String hash, int rowNo, String[] c,
                                  EcountVoucherImportSupport.JournalEntryKey key,
                                  BigDecimal debit, BigDecimal credit, String actor) {
        int rows = jdbcTemplate.update("""
                INSERT INTO staging.ecount_journal_entry_raw (
                  source_file_hash, source_row_no, journal_no, transaction_date, line_sequence,
                  account_name, partner_name, debit_amount, credit_amount, description,
                  raw_payload, transform_status, imported_by
                ) VALUES (
                  :hash, :row, :journalNo, :date, :lineSeq, :accountName, :partnerName,
                  :debit, :credit, :description, :payload, 'PENDING', :actor
                )
                ON CONFLICT (source_file_hash, source_row_no) DO NOTHING
                """,
                new MapSqlParameterSource()
                        .addValue("hash", hash)
                        .addValue("row", rowNo)
                        .addValue("journalNo", key.journalNo())
                        .addValue("date", key.journalDate())
                        .addValue("lineSeq", key.lineSequence())
                        .addValue("accountName", EcountCsvSupport.nullIfBlank(c[1]))
                        .addValue("partnerName", EcountCsvSupport.nullIfBlank(c[2]))
                        .addValue("debit", debit)
                        .addValue("credit", credit)
                        .addValue("description", EcountCsvSupport.nullIfBlank(c[5]))
                        .addValue("payload", String.join("\u001F", c))
                        .addValue("actor", actor));
        return rows > 0;
    }

    private Optional<PartnerSummary> resolvePartner(String partnerName) {
        if (EcountVoucherImportSupport.isBlankOrPlaceholder(partnerName)) {
            return Optional.empty();
        }
        return partnerLookupClient.findByPartnerName(partnerName);
    }

    private Optional<String> resolveAccountCode(String accountName) {
        if (EcountVoucherImportSupport.isBlankOrPlaceholder(accountName)) {
            return Optional.empty();
        }
        List<String> matches = jdbcTemplate.queryForList("""
                SELECT account_uuid
                  FROM staging.ecount_account_map
                 WHERE account_name = :accountName
                 ORDER BY ecount_code
                """,
                new MapSqlParameterSource("accountName", EcountCsvSupport.stripCell(accountName)),
                String.class);
        return matches.size() == 1 ? Optional.of(matches.get(0)) : Optional.empty();
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

    private void softDeleteExistingLines(UUID journalId, String actor) {
        jdbcTemplate.update("""
                UPDATE journal_lines
                   SET is_deleted = TRUE,
                       deleted_at = NOW(),
                       deleted_by = :actor,
                       modified_at = NOW(),
                       modified_by = :actor
                 WHERE journal_id = :journalId AND is_deleted = FALSE
                """,
                new MapSqlParameterSource()
                        .addValue("journalId", journalId)
                        .addValue("actor", actor));
    }

    private void insertLine(UUID journalId, int lineNo, String accountCode, BigDecimal debit, BigDecimal credit,
                            UUID partnerId, String memo, String actor) {
        jdbcTemplate.update("""
                INSERT INTO journal_lines (
                  id, journal_id, line_no, account_code, debit_amount, credit_amount,
                  partner_id, memo, created_at, created_by, modified_at, modified_by, is_deleted
                ) VALUES (
                  gen_random_uuid(), :journalId, :lineNo, :accountCode, :debit, :credit,
                  :partnerId, :memo, NOW(), :actor, NOW(), :actor, FALSE
                )
                """,
                new MapSqlParameterSource()
                        .addValue("journalId", journalId)
                        .addValue("lineNo", lineNo)
                        .addValue("accountCode", accountCode)
                        .addValue("debit", debit)
                        .addValue("credit", credit)
                        .addValue("partnerId", partnerId)
                        .addValue("memo", EcountCsvSupport.nullIfBlank(memo))
                        .addValue("actor", actor));
    }

    private void updateStatus(String hash, int rowNo, String status, String reason, String targetJournalNo) {
        jdbcTemplate.update("""
                UPDATE staging.ecount_journal_entry_raw
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

    private record EntryRow(int rowNo, LocalDate journalDate, String journalNo, int lineSequence,
                            String accountCode, UUID partnerId, BigDecimal debit, BigDecimal credit,
                            String memo) {
    }
}
