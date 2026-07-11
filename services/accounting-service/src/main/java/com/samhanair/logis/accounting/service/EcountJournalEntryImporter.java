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
import java.util.Objects;
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
        String hash = EcountCsvSupport.computeFileHash(content);
        acquireImportLock(hash);
        EcountCsvSupport.ParsedCsv parsed = EcountCsvSupport.parse(content);
        EcountVoucherImportSupport.validateHeader(parsed.header(), HEADERS);

        EcountVoucherImportResult.Builder result =
                EcountVoucherImportResult.builder(parsed.dataRows().size(), hash);
        String actor = EcountVoucherImportSupport.actor(actorUserId);
        // group 단위 row 수집. group key = journalNo.
        // sibling row 가 reject 된 경우 group 전체 reject 처리 (Codex H2 cycle 2).
        Map<String, GroupAccumulator> groups = new LinkedHashMap<>();

        for (int i = 0; i < parsed.dataRows().size(); i++) {
            int rowNo = i + 1;
            String[] c = EcountCsvSupport.normalizeRow(parsed.dataRows().get(i), HEADERS.length);
            String journalNo = null;
            try {
                EcountVoucherImportSupport.JournalEntryKey key =
                        EcountVoucherImportSupport.parseJournalEntryKey(c[0], rowNo);
                journalNo = key.journalNo();
                GroupAccumulator group = groups.computeIfAbsent(journalNo, GroupAccumulator::new);
                BigDecimal debit = EcountVoucherImportSupport.parseAmount(c[3], rowNo);
                BigDecimal credit = EcountVoucherImportSupport.parseAmount(c[4], rowNo);
                if (debit.signum() == 0 && credit.signum() == 0 || debit.signum() > 0 && credit.signum() > 0) {
                    throw new BusinessException(ErrorCode.MIG3_SLIP_AMOUNT_INVALID,
                            "차변/대변 금액은 한쪽만 0보다 커야 합니다: sourceRowNo=" + rowNo);
                }
                if (!insertStaging(hash, rowNo, c, key, debit, credit, actor)) {
                    group.addSkipped(rowNo);
                    continue;
                }
                Optional<PartnerSummary> partner = resolvePartner(c[2]);
                if (partner.isEmpty() && !EcountVoucherImportSupport.isBlankOrPlaceholder(c[2])) {
                    String message = "거래처명 lookup miss: " + c[2];
                    reject(hash, rowNo, "MIG3_LOOKUP_MISS", message, journalNo);
                    group.addRowReject(rowNo, "MIG3_LOOKUP_MISS", message, c[2]);
                    continue;
                }
                Optional<String> accountCode = resolveAccountCode(c[1]);
                if (accountCode.isEmpty()) {
                    String message = "계정명 lookup miss: " + c[1];
                    reject(hash, rowNo, "MIG3_LOOKUP_MISS", message, journalNo);
                    group.addRowReject(rowNo, "MIG3_LOOKUP_MISS", message, c[1]);
                    continue;
                }
                EntryRow row = new EntryRow(rowNo, key.journalDate(), key.journalNo(), key.lineSequence(),
                        accountCode.get(), partner.map(PartnerSummary::partnerId).orElse(null),
                        debit, credit, c[5]);
                group.addRow(row);
            } catch (BusinessException ex) {
                String safeJournalNo = journalNo;
                GroupAccumulator group = safeJournalNo == null
                        ? null
                        : groups.computeIfAbsent(safeJournalNo, GroupAccumulator::new);
                if (ex.getErrorCode() == ErrorCode.MIG3_SLIP_AMOUNT_INVALID) {
                    if (safeJournalNo != null) {
                        EcountVoucherImportSupport.JournalEntryKey key =
                                EcountVoucherImportSupport.parseJournalEntryKey(c[0], rowNo);
                        insertStaging(hash, rowNo, c, key, null, null, actor);
                    }
                    reject(hash, rowNo, "MIG3_SLIP_AMOUNT_INVALID", ex.getMessage(), safeJournalNo);
                    if (group != null) {
                        group.addRowReject(rowNo, "MIG3_SLIP_AMOUNT_INVALID", ex.getMessage(), c[3] + "/" + c[4]);
                    } else {
                        result.reject(rowNo, "MIG3_SLIP_AMOUNT_INVALID", ex.getMessage(), null, c[3] + "/" + c[4]);
                    }
                } else {
                    if (safeJournalNo != null) {
                        reject(hash, rowNo, ex.getErrorCode().name(), ex.getMessage(), safeJournalNo);
                        group.addRowReject(rowNo, ex.getErrorCode().name(), ex.getMessage(), sampleRawValue(c, ex));
                    } else {
                        result.reject(rowNo, ex.getErrorCode().name(), ex.getMessage(), null, sampleRawValue(c, ex));
                    }
                }
            }
        }

        for (Map.Entry<String, GroupAccumulator> entry : groups.entrySet()) {
            GroupAccumulator group = entry.getValue();
            // Codex H2 cycle 2 — sibling row 가 reject 됐다면 그룹 전체 reject.
            if (group.hasRejected()) {
                // 본인 row 들은 이미 reject 카운트에 포함된다 (per-row).
                for (GroupRowReject rj : group.rowRejects()) {
                    result.reject(rj.rowNo(), rj.errorCode(), rj.message(), group.journalNo(), rj.rawSample());
                }
                // 정상이었던 row 들은 group 차원에서 추가 reject 처리 (poison 방지).
                for (EntryRow row : group.rows()) {
                    String message = "동일 분개 group 안에 reject row 가 있어 전체 group 가 거부되었습니다: journalNo="
                            + group.journalNo();
                    reject(hash, row.rowNo(), "MIG3_JOURNAL_GROUP_INVALID", message, group.journalNo());
                    result.reject(row.rowNo(), "MIG3_JOURNAL_GROUP_INVALID", message, group.journalNo(),
                            row.journalNo() + "-" + row.lineSequence());
                }
                continue;
            }
            if (group.rows().isEmpty()) {
                // 모든 row 가 skipped (idempotent reimport 등) — skipped 카운트만 반영.
                int skippedCount = group.skippedRows().size();
                for (int i = 0; i < skippedCount; i++) {
                    result.skipped();
                }
                continue;
            }
            List<EntryRow> rows = group.rows().stream()
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
                    balanced ? "POSTED" : "DRAFT", balanced ? actor : null, actor,
                    activeExists, deletedExists);
            softDeleteExistingLines(journalId, actor);
            boolean lineDuplicateRejected = false;
            for (EntryRow row : rows) {
                try {
                    insertLine(journalId, row.lineSequence(), row.accountCode(), row.debit(), row.credit(),
                            row.partnerId(), row.memo(), actor);
                    updateStatus(hash, row.rowNo(), activeExists || deletedExists ? "UPDATED" : "IMPORTED",
                            null, row.journalNo());
                } catch (BusinessException ex) {
                    if (ex.getErrorCode() == ErrorCode.MIG3_JOURNAL_LINE_DUPLICATE) {
                        reject(hash, row.rowNo(), "MIG3_JOURNAL_LINE_DUPLICATE", ex.getMessage(), row.journalNo());
                        result.reject(row.rowNo(), "MIG3_JOURNAL_LINE_DUPLICATE", ex.getMessage(),
                                row.journalNo(), row.journalNo() + "-" + row.lineSequence());
                        lineDuplicateRejected = true;
                    } else {
                        throw ex;
                    }
                }
            }
            if (lineDuplicateRejected) {
                // 일부 line 이 reject 됐어도 journal upsert 는 이미 적용. import/posted 카운트는 정상 처리하되,
                // line duplicate row 는 reject 로 별도 카운트되어 사용자 가시화.
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
        return partnerLookupClient.findByPartnerNameStrict(partnerName);
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
                 LIMIT 2
                """,
                new MapSqlParameterSource("accountName", EcountCsvSupport.stripCell(accountName)),
                String.class);
        if (matches.size() > 1) {
            throw new BusinessException(ErrorCode.MIG3_LOOKUP_AMBIGUOUS,
                    "계정명 lookup ambiguous: " + accountName);
        }
        return matches.size() == 1 ? Optional.of(matches.get(0)) : Optional.empty();
    }

    /**
     * upsertJournal — soft-deleted journal 복구 시 active 같은 journal_no 가 이미 있으면
     * 복구하지 않고 active 를 그대로 update (Codex M4 cycle 2 fix — partial unique conflict 회피).
     */
    private UUID upsertJournal(String journalNo, LocalDate journalDate, String description,
                               String status, String postedBy, String actor,
                               boolean activeExists, boolean deletedExists) {
        // 정책:
        //   - active 가 있으면 active 만 UPDATE (deleted 는 그대로 둠, partial unique conflict 회피).
        //   - active 없고 deleted 만 있으면 deleted 를 복구.
        //   - 둘 다 없으면 신규 INSERT.
        if (activeExists) {
            return jdbcTemplate.queryForObject("""
                    UPDATE journals
                       SET journal_date = :journalDate,
                           description = :description,
                           source_type = 'MANUAL',
                           source_ref_id = NULL,
                           status = :status,
                           posted_at = CASE WHEN :status = 'POSTED' THEN NOW() ELSE NULL END,
                           posted_by = :postedBy,
                           modified_at = NOW(),
                           modified_by = :actor
                     WHERE journal_no = :journalNo AND is_deleted = FALSE
                    RETURNING id
                    """,
                    journalParams(journalNo, journalDate, description, status, postedBy, actor),
                    UUID.class);
        }
        if (deletedExists) {
            return jdbcTemplate.queryForObject("""
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
                    """,
                    journalParams(journalNo, journalDate, description, status, postedBy, actor),
                    UUID.class);
        }
        return jdbcTemplate.queryForObject("""
                INSERT INTO journals (
                  id, journal_no, journal_date, description, source_type, source_ref_id,
                  status, posted_at, posted_by, version, created_at, created_by, modified_at,
                  modified_by, is_deleted
                ) VALUES (
                  gen_random_uuid(), :journalNo, :journalDate, :description, 'MANUAL', NULL,
                  :status, CASE WHEN :status = 'POSTED' THEN NOW() ELSE NULL END, :postedBy,
                  0, NOW(), :actor, NOW(), :actor, FALSE
                )
                RETURNING id
                """,
                journalParams(journalNo, journalDate, description, status, postedBy, actor),
                UUID.class);
    }

    private MapSqlParameterSource journalParams(String journalNo, LocalDate journalDate,
            String description, String status, String postedBy, String actor) {
        return new MapSqlParameterSource()
                .addValue("journalNo", journalNo)
                .addValue("journalDate", journalDate)
                .addValue("description", EcountCsvSupport.nullIfBlank(description))
                .addValue("status", status)
                .addValue("postedBy", postedBy)
                .addValue("actor", actor);
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

    /**
     * insertLine — Codex H1 cycle 2 fix.
     *
     * <p>동일 (journal_id, line_no) 에 다른 데이터가 이미 존재하면 silent overwrite 대신
     * {@link ErrorCode#MIG3_JOURNAL_LINE_DUPLICATE} 로 reject. 동일 데이터면 idempotent.
     */
    private void insertLine(UUID journalId, int lineNo, String accountCode, BigDecimal debit, BigDecimal credit,
                            UUID partnerId, String memo, String actor) {
        Map<String, Object> existing = findExistingLine(journalId, lineNo);
        if (existing != null) {
            // (1) 동일 데이터면 idempotent (modified_at 만 갱신).
            // (2) 다른 데이터면 reject.
            boolean isDeleted = Boolean.TRUE.equals(existing.get("is_deleted"));
            boolean sameData = !isDeleted
                    && equalsNullable(accountCode, (String) existing.get("account_code"))
                    && equalsAmount(debit, (BigDecimal) existing.get("debit_amount"))
                    && equalsAmount(credit, (BigDecimal) existing.get("credit_amount"))
                    && Objects.equals(partnerId, existing.get("partner_id"))
                    && equalsNullable(EcountCsvSupport.nullIfBlank(memo), (String) existing.get("memo"));
            if (isDeleted) {
                // restored 경로 (CTE 와 동일하게 soft-deleted line 복구).
                jdbcTemplate.update("""
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
                        """,
                        lineParams(journalId, lineNo, accountCode, debit, credit, partnerId, memo, actor));
                return;
            }
            if (sameData) {
                // idempotent — modified_at 만 touch.
                jdbcTemplate.update("""
                        UPDATE journal_lines
                           SET modified_at = NOW(),
                               modified_by = :actor
                         WHERE journal_id = :journalId AND line_no = :lineNo AND is_deleted = FALSE
                        """,
                        new MapSqlParameterSource()
                                .addValue("journalId", journalId)
                                .addValue("lineNo", lineNo)
                                .addValue("actor", actor));
                return;
            }
            throw new BusinessException(ErrorCode.MIG3_JOURNAL_LINE_DUPLICATE,
                    "동일 라인 번호(" + lineNo + ")에 다른 데이터가 이미 존재합니다");
        }
        // (3) 신규 INSERT.
        jdbcTemplate.update("""
                INSERT INTO journal_lines (
                  id, journal_id, line_no, account_code, debit_amount, credit_amount,
                  partner_id, memo, created_at, created_by, modified_at, modified_by, is_deleted
                ) VALUES (
                  gen_random_uuid(), :journalId, :lineNo, :accountCode, :debit, :credit,
                  :partnerId, :memo, NOW(), :actor, NOW(), :actor, FALSE
                )
                """,
                lineParams(journalId, lineNo, accountCode, debit, credit, partnerId, memo, actor));
    }

    private MapSqlParameterSource lineParams(UUID journalId, int lineNo, String accountCode,
            BigDecimal debit, BigDecimal credit, UUID partnerId, String memo, String actor) {
        return new MapSqlParameterSource()
                .addValue("journalId", journalId)
                .addValue("lineNo", lineNo)
                .addValue("accountCode", accountCode)
                .addValue("debit", debit)
                .addValue("credit", credit)
                .addValue("partnerId", partnerId)
                .addValue("memo", EcountCsvSupport.nullIfBlank(memo))
                .addValue("actor", actor);
    }

    private Map<String, Object> findExistingLine(UUID journalId, int lineNo) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList("""
                SELECT account_code, debit_amount, credit_amount, partner_id, memo, is_deleted
                  FROM journal_lines
                 WHERE journal_id = :journalId AND line_no = :lineNo
                """,
                new MapSqlParameterSource()
                        .addValue("journalId", journalId)
                        .addValue("lineNo", lineNo));
        return rows.isEmpty() ? null : rows.get(0);
    }

    private static boolean equalsAmount(BigDecimal a, BigDecimal b) {
        if (a == null && b == null) {
            return true;
        }
        if (a == null || b == null) {
            return false;
        }
        return a.compareTo(b) == 0;
    }

    private static boolean equalsNullable(String a, String b) {
        return Objects.equals(a, b);
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

    private static String sampleRawValue(String[] c, BusinessException ex) {
        ErrorCode code = ex.getErrorCode();
        if (code == ErrorCode.MIG3_VOUCHER_NO_INVALID) {
            return c[0];
        }
        if (code == ErrorCode.MIG3_SLIP_AMOUNT_INVALID) {
            return c[3] + "/" + c[4];
        }
        if (code == ErrorCode.MIG3_LOOKUP_MISS || code == ErrorCode.MIG3_LOOKUP_AMBIGUOUS) {
            return c[1];
        }
        return String.join("\u001F", c);
    }

    private record EntryRow(int rowNo, LocalDate journalDate, String journalNo, int lineSequence,
                            String accountCode, UUID partnerId, BigDecimal debit, BigDecimal credit,
                            String memo) {
    }

    private record GroupRowReject(int rowNo, String errorCode, String message, String rawSample) {
    }

    /**
     * 분개 group 별 row + reject 누적. Codex H2 cycle 2 — sibling row 가 하나라도 reject 되면
     * 전체 group reject (이미 valid 한 row 도 MIG3_JOURNAL_GROUP_INVALID 로 처리).
     */
    private static final class GroupAccumulator {
        private final String journalNo;
        private final List<EntryRow> rows = new ArrayList<>();
        private final List<GroupRowReject> rowRejects = new ArrayList<>();
        private final List<Integer> skippedRows = new ArrayList<>();

        GroupAccumulator(String journalNo) {
            this.journalNo = journalNo;
        }

        String journalNo() {
            return journalNo;
        }

        void addRow(EntryRow row) {
            rows.add(row);
        }

        void addRowReject(int rowNo, String code, String message, String rawSample) {
            rowRejects.add(new GroupRowReject(rowNo, code, message, rawSample));
        }

        void addSkipped(int rowNo) {
            skippedRows.add(rowNo);
        }

        boolean hasRejected() {
            return !rowRejects.isEmpty();
        }

        List<EntryRow> rows() {
            return rows;
        }

        List<GroupRowReject> rowRejects() {
            return rowRejects;
        }

        List<Integer> skippedRows() {
            return skippedRows;
        }
    }
}
