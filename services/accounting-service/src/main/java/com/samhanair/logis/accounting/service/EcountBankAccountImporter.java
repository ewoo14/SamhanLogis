package com.samhanair.logis.accounting.service;

import com.samhanair.logis.common.ecount.EcountCsvSupport;
import com.samhanair.logis.common.ecount.EcountMig6ImportResult;
import com.samhanair.logis.common.ecount.EcountMig6ImportSupport;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.io.InputStream;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** MIG-6 — 이카운트 통장계좌 CSV → bank_accounts 도메인 import. */
@Service
@RequiredArgsConstructor
public class EcountBankAccountImporter {

    private static final UUID IMPORT_LOCK_NAMESPACE =
            UUID.fromString("720e2a5b-c688-4a11-a51f-01ab7d625601");
    private static final Pattern ACCOUNT_CODE = Pattern.compile("\\(([^)]+)\\)\\s*$");
    public static final String[] HEADERS = {
            "계좌코드", "계좌명", "계정명(계정코드)", "검색창내용", "적요", "외화통장", "사용"
    };

    private final NamedParameterJdbcTemplate jdbcTemplate;

    @Transactional(propagation = Propagation.REQUIRES_NEW, isolation = Isolation.READ_COMMITTED)
    public EcountMig6ImportResult importCsv(InputStream csv, String actorUserId) {
        byte[] content = EcountCsvSupport.readRequired(csv);
        String hash = EcountCsvSupport.computeFileHash(content);
        acquireImportLock(hash);
        EcountCsvSupport.ParsedCsv parsed = EcountCsvSupport.parse(content);
        EcountMig6ImportSupport.validateHeader(parsed.header(), HEADERS);

        EcountMig6ImportResult.Builder result =
                EcountMig6ImportResult.builder(parsed.dataRows().size(), hash);
        String actor = EcountMig6ImportSupport.actor(actorUserId);
        for (int i = 0; i < parsed.dataRows().size(); i++) {
            int rowNo = i + 1;
            String[] c = EcountCsvSupport.normalizeRow(parsed.dataRows().get(i), HEADERS.length);
            try {
                String code = require(c[0], "계좌코드", rowNo);
                String name = require(c[1], "계좌명", rowNo);
                String chartAccountCode = parseLinkedAccountCode(c[2], rowNo);
                boolean active = EcountMig6ImportSupport.parseActiveFlag(c[6], rowNo);
                boolean foreignCurrency = EcountCsvSupport.stripCell(c[5]).contains("사용")
                        && !EcountCsvSupport.stripCell(c[5]).contains("미사용");
                if (!insertStaging(hash, rowNo, c, chartAccountCode, actor)) {
                    result.skipped();
                    continue;
                }
                boolean exists = exists("SELECT COUNT(1) FROM bank_accounts WHERE account_code = :code AND is_deleted = FALSE",
                        new MapSqlParameterSource("code", code));
                UUID id = upsertBankAccount(code, name, chartAccountCode, c, foreignCurrency, active, actor);
                updateStatus(hash, rowNo, exists ? "UPDATED" : "IMPORTED", null, id);
                if (exists) {
                    result.updated();
                } else {
                    result.imported();
                }
            } catch (BusinessException ex) {
                insertRejectedStaging(hash, rowNo, c, actor);
                updateStatus(hash, rowNo, ex.getErrorCode().name(), ex.getMessage(), null);
                result.reject(rowNo, ex.getErrorCode().name(), ex.getMessage(), c[0], sampleRawValue(c, ex));
            } catch (DuplicateKeyException ex) {
                insertRejectedStaging(hash, rowNo, c, actor);
                updateStatus(hash, rowNo, ErrorCode.MIG6_BANK_ACCOUNT_CODE_DUPLICATE.name(),
                        ex.getMostSpecificCause().getMessage(), null);
                result.reject(rowNo, ErrorCode.MIG6_BANK_ACCOUNT_CODE_DUPLICATE.name(),
                        "통장계좌 domain upsert 충돌: " + ex.getMostSpecificCause().getMessage(), c[0], c[0]);
            }
        }
        return result.build();
    }

    private boolean insertStaging(String hash, int rowNo, String[] c, String chartAccountCode, String actor) {
        int rows = jdbcTemplate.update("""
                INSERT INTO staging.ecount_bank_account_raw (
                  source_file_hash, source_row_no, account_code, account_name, account_chart_code,
                  account_chart_raw, search_content, memo, foreign_currency_raw, usage_flag_raw,
                  raw_payload, created_by, modified_by
                ) VALUES (
                  :hash, :row, :code, :name, :chartAccountCode,
                  :chartRaw, :searchContent, :memo, :foreignCurrencyRaw, :usageFlagRaw,
                  :payload, :actor, :actor
                )
                ON CONFLICT (source_file_hash, source_row_no) DO NOTHING
                """, params(hash, rowNo, c, actor).addValue("chartAccountCode", chartAccountCode));
        return rows > 0;
    }

    private void insertRejectedStaging(String hash, int rowNo, String[] c, String actor) {
        jdbcTemplate.update("""
                INSERT INTO staging.ecount_bank_account_raw (
                  source_file_hash, source_row_no, account_code, account_name, account_chart_raw,
                  search_content, memo, foreign_currency_raw, usage_flag_raw, raw_payload,
                  transform_status, created_by, modified_by
                ) VALUES (
                  :hash, :row, :code, :name, :chartRaw,
                  :searchContent, :memo, :foreignCurrencyRaw, :usageFlagRaw, :payload,
                  'REJECTED', :actor, :actor
                )
                ON CONFLICT (source_file_hash, source_row_no) DO NOTHING
                """, params(hash, rowNo, c, actor));
    }

    private UUID upsertBankAccount(String code, String name, String chartAccountCode, String[] c,
                                   boolean foreignCurrency, boolean active, String actor) {
        return jdbcTemplate.queryForObject("""
                WITH restored AS (
                    UPDATE bank_accounts
                       SET account_name = :name,
                           chart_account_code = :chartAccountCode,
                           search_content = :searchContent,
                           memo = :memo,
                           foreign_currency = :foreignCurrency,
                           active = :active,
                           is_deleted = FALSE,
                           deleted_at = NULL,
                           deleted_by = NULL,
                           modified_at = NOW(),
                           modified_by = :actor
                     WHERE account_code = :code AND is_deleted = TRUE
                     RETURNING id
                ), upserted AS (
                    INSERT INTO bank_accounts (
                      id, account_code, account_name, chart_account_code, search_content, memo,
                      foreign_currency, active, created_at, created_by, modified_at, modified_by, is_deleted
                    )
                    SELECT gen_random_uuid(), :code, :name, :chartAccountCode, :searchContent, :memo,
                           :foreignCurrency, :active, NOW(), :actor, NOW(), :actor, FALSE
                    WHERE NOT EXISTS (SELECT 1 FROM restored)
                    ON CONFLICT (account_code) WHERE is_deleted = FALSE DO UPDATE SET
                      account_name = EXCLUDED.account_name,
                      chart_account_code = EXCLUDED.chart_account_code,
                      search_content = EXCLUDED.search_content,
                      memo = EXCLUDED.memo,
                      foreign_currency = EXCLUDED.foreign_currency,
                      active = EXCLUDED.active,
                      modified_at = NOW(),
                      modified_by = EXCLUDED.modified_by
                    RETURNING id
                )
                SELECT id FROM restored
                UNION ALL
                SELECT id FROM upserted
                LIMIT 1
                """, new MapSqlParameterSource()
                .addValue("code", truncate(code, 50))
                .addValue("name", truncate(name, 100))
                .addValue("chartAccountCode", chartAccountCode)
                .addValue("searchContent", EcountCsvSupport.nullIfBlank(c[3]))
                .addValue("memo", EcountCsvSupport.nullIfBlank(c[4]))
                .addValue("foreignCurrency", foreignCurrency)
                .addValue("active", active)
                .addValue("actor", actor), UUID.class);
    }

    static String parseLinkedAccountCode(String raw, int rowNo) {
        Matcher matcher = ACCOUNT_CODE.matcher(raw == null ? "" : raw);
        if (!matcher.find()) {
            throw new BusinessException(ErrorCode.MIG6_LOOKUP_MISS,
                    "계정명(계정코드) 형식 불일치: sourceRowNo=" + rowNo + ", sample='" + raw + "'");
        }
        String code = EcountCsvSupport.stripCell(matcher.group(1));
        EcountCsvSupport.requireMaxLength(code, 10, "account_chart_code", rowNo);
        return code;
    }

    private void updateStatus(String hash, int rowNo, String status, String reason, UUID id) {
        jdbcTemplate.update("""
                UPDATE staging.ecount_bank_account_raw
                   SET transform_status = :status,
                       reject_reason = :reason,
                       target_bank_account_id = :id,
                       modified_at = NOW()
                 WHERE source_file_hash = :hash AND source_row_no = :row
                """, new MapSqlParameterSource()
                .addValue("status", status)
                .addValue("reason", reason)
                .addValue("id", id)
                .addValue("hash", hash)
                .addValue("row", rowNo));
    }

    private MapSqlParameterSource params(String hash, int rowNo, String[] c, String actor) {
        return new MapSqlParameterSource()
                .addValue("hash", hash)
                .addValue("row", rowNo)
                .addValue("code", EcountCsvSupport.nullIfBlank(c[0]))
                .addValue("name", EcountCsvSupport.nullIfBlank(c[1]))
                .addValue("chartRaw", EcountCsvSupport.nullIfBlank(c[2]))
                .addValue("searchContent", EcountCsvSupport.nullIfBlank(c[3]))
                .addValue("memo", EcountCsvSupport.nullIfBlank(c[4]))
                .addValue("foreignCurrencyRaw", EcountCsvSupport.nullIfBlank(c[5]))
                .addValue("usageFlagRaw", EcountCsvSupport.nullIfBlank(c[6]))
                .addValue("payload", String.join("\u001F", c))
                .addValue("actor", actor);
    }

    private void acquireImportLock(String sourceFileHash) {
        jdbcTemplate.queryForObject("SELECT pg_advisory_xact_lock(:lockKey)",
                new MapSqlParameterSource("lockKey",
                        EcountCsvSupport.advisoryLockKey(IMPORT_LOCK_NAMESPACE, sourceFileHash)),
                Object.class);
    }

    private boolean exists(String sql, MapSqlParameterSource p) {
        Integer count = jdbcTemplate.queryForObject(sql, p, Integer.class);
        return count != null && count > 0;
    }

    private static String require(String value, String field, int rowNo) {
        String normalized = EcountCsvSupport.stripCell(value);
        if (normalized.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    field + " 빈값: sourceRowNo=" + rowNo);
        }
        return normalized;
    }

    private static String sampleRawValue(String[] c, BusinessException ex) {
        return switch (ex.getErrorCode()) {
            case MIG6_BOOLEAN_FLAG_INVALID -> c[6];
            case MIG6_LOOKUP_MISS, MIG6_LOOKUP_AMBIGUOUS -> c[2];
            default -> String.join("\u001F", c);
        };
    }

    private static String truncate(String value, int max) {
        return value == null || value.length() <= max ? value : value.substring(0, max);
    }
}
