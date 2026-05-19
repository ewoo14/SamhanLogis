package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.domain.CardType;
import com.samhanair.logis.accounting.web.dto.EcountCardImportResult;
import com.samhanair.logis.common.ecount.EcountCsvSupport;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/** MIG-2 — 이카운트 통장계좌 CSV → card_master import. */
@Slf4j
@Service
@RequiredArgsConstructor
public class EcountCardImporter {

    private static final String[] HEADERS = {
            "계좌코드", "계좌명", "계정명(계정코드)", "검색창내용", "적요", "외화통장", "사용"
    };
    private static final Pattern PLACEHOLDER_CODE =
            Pattern.compile("^(-|0+|0+[- ]?0+[- ]?0+)$");
    private static final Pattern ACCOUNT_CODE = Pattern.compile("\\(([^)]+)\\)\\s*$");
    private static final int REJECT_SAMPLE_MAX = 20;

    private final NamedParameterJdbcTemplate jdbcTemplate;

    public EcountCardImportResult importCsv(InputStream csv, String actorUserId) {
        byte[] content = EcountCsvSupport.readRequired(csv);
        String hash = EcountCsvSupport.computeFileHash(content);
        EcountCsvSupport.ParsedCsv parsed = EcountCsvSupport.parse(content);
        EcountCsvSupport.validateHeader(parsed.header(), HEADERS);

        int imported = 0;
        int updated = 0;
        int rejectedNullName = 0;
        int skippedPlaceholder = 0;
        List<EcountCardImportResult.RejectedRow> rejected = new ArrayList<>();

        for (int i = 0; i < parsed.dataRows().size(); i++) {
            int rowNo = parsed.headerIndex() + 2 + i;
            String[] c = EcountCsvSupport.normalizeRow(parsed.dataRows().get(i), HEADERS.length);
            stagingUpsert(hash, rowNo, c, actorUserId);
            String code = c[0];
            String name = c[1];
            if (name.isBlank()) {
                rejectedNullName++;
                updateStatus(hash, rowNo, "REJECT_NAME_NULL", "계좌명 빈값", null);
                addRejectSample(rejected, rowNo, "REJECT_NAME_NULL", code, name);
                continue;
            }
            if (isPlaceholder(code)) {
                skippedPlaceholder++;
                updateStatus(hash, rowNo, "SKIPPED_PLACEHOLDER", "계좌코드 placeholder (" + code + ")", null);
                addRejectSample(rejected, rowNo, "SKIPPED_PLACEHOLDER", code, name);
                continue;
            }
            boolean exists = exists("SELECT COUNT(1) FROM card_master WHERE card_code = :code AND is_deleted = FALSE",
                    new MapSqlParameterSource("code", code));
            UUID cardId = upsertCard(code, name, c, actorUserId);
            updateStatus(hash, rowNo, exists ? "UPDATED" : "IMPORTED", null, cardId);
            if (exists) {
                updated++;
            } else {
                imported++;
            }
        }
        log.info("MIG-2 card import 완료 total={} imported={} updated={} rejected={} placeholder={} hash={}",
                parsed.dataRows().size(), imported, updated, rejectedNullName, skippedPlaceholder, hash);
        return new EcountCardImportResult(parsed.dataRows().size(), imported, updated,
                rejectedNullName, skippedPlaceholder, hash, rejected);
    }

    private UUID upsertCard(String code, String name, String[] c, String actor) {
        return jdbcTemplate.queryForObject("""
                INSERT INTO card_master (
                  card_code, card_name, card_type, account_number, linked_account_code,
                  note, created_at, created_by, is_deleted
                ) VALUES (
                  :code, :name, :type, :accountNumber, :linkedAccountCode,
                  :note, NOW(), :actor, FALSE
                )
                ON CONFLICT (card_code) WHERE is_deleted = FALSE DO UPDATE SET
                  card_name = EXCLUDED.card_name,
                  card_type = EXCLUDED.card_type,
                  account_number = EXCLUDED.account_number,
                  linked_account_code = EXCLUDED.linked_account_code,
                  note = EXCLUDED.note,
                  modified_at = NOW(),
                  modified_by = EXCLUDED.created_by
                RETURNING id
                """,
                new MapSqlParameterSource()
                        .addValue("code", truncate(code, 50))
                        .addValue("name", truncate(name, 100))
                        .addValue("type", inferType(name, c[2]).name())
                        .addValue("accountNumber", truncate(code, 50))
                        .addValue("linkedAccountCode", parseLinkedAccountCode(c[2]))
                        .addValue("note", EcountCsvSupport.nullIfBlank(c[4]))
                        .addValue("actor", actor == null || actor.isBlank() ? "system" : actor),
                UUID.class);
    }

    private void stagingUpsert(String hash, int rowNo, String[] c, String actor) {
        jdbcTemplate.update("""
                INSERT INTO staging.ecount_card_raw (
                  source_file_hash, source_row_no, raw_account_code, raw_account_name,
                  raw_linked_account, raw_search_keyword, raw_memo, raw_foreign_account,
                  raw_usage_flag, transform_status, imported_by
                ) VALUES (:hash, :row, :c0, :c1, :c2, :c3, :c4, :c5, :c6, 'PENDING', :actor)
                ON CONFLICT (source_file_hash, source_row_no) DO UPDATE SET
                  raw_account_code = EXCLUDED.raw_account_code,
                  raw_account_name = EXCLUDED.raw_account_name,
                  raw_linked_account = EXCLUDED.raw_linked_account,
                  raw_search_keyword = EXCLUDED.raw_search_keyword,
                  raw_memo = EXCLUDED.raw_memo,
                  raw_foreign_account = EXCLUDED.raw_foreign_account,
                  raw_usage_flag = EXCLUDED.raw_usage_flag,
                  transform_status = 'PENDING',
                  target_card_id = NULL,
                  reject_reason = NULL,
                  imported_at = NOW(),
                  imported_by = EXCLUDED.imported_by
                """,
                new MapSqlParameterSource()
                        .addValue("hash", hash)
                        .addValue("row", rowNo)
                        .addValue("c0", EcountCsvSupport.nullIfBlank(c[0]))
                        .addValue("c1", EcountCsvSupport.nullIfBlank(c[1]))
                        .addValue("c2", EcountCsvSupport.nullIfBlank(c[2]))
                        .addValue("c3", EcountCsvSupport.nullIfBlank(c[3]))
                        .addValue("c4", EcountCsvSupport.nullIfBlank(c[4]))
                        .addValue("c5", EcountCsvSupport.nullIfBlank(c[5]))
                        .addValue("c6", EcountCsvSupport.nullIfBlank(c[6]))
                        .addValue("actor", actor == null || actor.isBlank() ? "system" : actor));
    }

    private void updateStatus(String hash, int rowNo, String status, String reason, UUID cardId) {
        jdbcTemplate.update("""
                UPDATE staging.ecount_card_raw
                   SET transform_status = :status,
                       reject_reason = :reason,
                       target_card_id = :cardId
                 WHERE source_file_hash = :hash AND source_row_no = :row
                """,
                new MapSqlParameterSource()
                        .addValue("status", status)
                        .addValue("reason", reason)
                        .addValue("cardId", cardId)
                        .addValue("hash", hash)
                        .addValue("row", rowNo));
    }

    static CardType inferType(String name, String linkedAccount) {
        String text = (name == null ? "" : name) + " " + (linkedAccount == null ? "" : linkedAccount);
        if (text.contains("체크")) {
            return CardType.DEBIT;
        }
        if (text.contains("카드")) {
            return CardType.CREDIT;
        }
        return CardType.BANK_ACCOUNT;
    }

    static String parseLinkedAccountCode(String raw) {
        if (raw == null) {
            return null;
        }
        Matcher matcher = ACCOUNT_CODE.matcher(raw);
        return matcher.find() ? truncate(matcher.group(1), 10) : null;
    }

    private boolean exists(String sql, MapSqlParameterSource p) {
        Integer count = jdbcTemplate.queryForObject(sql, p, Integer.class);
        return count != null && count > 0;
    }

    private boolean isPlaceholder(String code) {
        return code == null || code.isBlank() || PLACEHOLDER_CODE.matcher(code).matches();
    }

    private static String truncate(String value, int max) {
        if (value == null) {
            return null;
        }
        return value.length() <= max ? value : value.substring(0, max);
    }

    private static void addRejectSample(List<EcountCardImportResult.RejectedRow> sample,
                                        int rowNo, String reason, String code, String name) {
        if (sample.size() < REJECT_SAMPLE_MAX) {
            sample.add(new EcountCardImportResult.RejectedRow(rowNo, reason, code, name));
        }
    }
}
