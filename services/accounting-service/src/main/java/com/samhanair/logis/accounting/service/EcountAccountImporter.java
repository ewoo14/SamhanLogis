package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.domain.AccountCategory;
import com.samhanair.logis.accounting.web.dto.EcountAccountImportResult;
import com.samhanair.logis.common.ecount.EcountCsvSupport;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** MIG-2 — 이카운트 계정상세내역 CSV → chart_of_accounts + account lookup map import. */
@Slf4j
@Service
@RequiredArgsConstructor
public class EcountAccountImporter {

    private static final UUID IMPORT_LOCK_NAMESPACE = UUID.fromString("cf87a538-57bf-4c90-ae44-4e54b588caab");
    // raw: docs/migration/ecount-data/raw/계정상세내역-Excel다운로드.csv
    static final String[] HEADERS = {
            "계정코드", "계정명", "검색창내용", "대차구분", "계정속성", "계정종류", "수입지출구분",
            "재무제표상위계정", "수입지출상위계정", "잔액집계구분", "재무제표하이퍼링크대상",
            "추가항목유형코드", "추가항목유형명", "관련업무", "수표", "적요1", "적요2",
            "평가계정구분", "평가계정대상계정코드", "평가순서", "평가계정잔액",
            "재무제표표시여부계정표시방법1", "재무제표표시명1", "재무제표인쇄위치계정표시방법1",
            "재무제표금액굵기계정표시방법1", "재무재표금액괄호계정표시방법1",
            "재무제표표시여부(국외용)", "재무제표표시명2", "재무제표인쇄위치(국외용)",
            "재무제표금액굵기(국외용)", "재무제표금액괄호(국외용)", "사용중단"
    };
    private static final Pattern PLACEHOLDER_CODE =
            Pattern.compile("^(-|0+|0+[- ]?0+[- ]?0+)$");
    private static final int REJECT_SAMPLE_MAX = 20;

    private final NamedParameterJdbcTemplate jdbcTemplate;

    @Transactional(propagation = Propagation.REQUIRES_NEW, isolation = Isolation.READ_COMMITTED)
    public EcountAccountImportResult importCsv(InputStream csv, String actorUserId) {
        byte[] content = EcountCsvSupport.readRequired(csv);
        String hash = EcountCsvSupport.computeFileHash(content);
        acquireImportLock(hash);
        EcountCsvSupport.ParsedCsv parsed = EcountCsvSupport.parse(content);
        EcountCsvSupport.validateHeader(parsed.header(), HEADERS);

        int imported = 0;
        int updated = 0;
        int rejectedNullName = 0;
        int skippedPlaceholder = 0;
        List<EcountAccountImportResult.RejectedRow> rejected = new ArrayList<>();

        for (int i = 0; i < parsed.dataRows().size(); i++) {
            int rowNo = i + 1;
            String[] c = EcountCsvSupport.normalizeRow(parsed.dataRows().get(i), HEADERS.length);
            stagingUpsert(hash, rowNo, c, actorUserId);
            String code = c[0];
            String name = c[1];
            if (name.isBlank()) {
                rejectedNullName++;
                updateStatus(hash, rowNo, "REJECT_NAME_NULL", "계정명 빈값", null);
                addRejectSample(rejected, rowNo, "REJECT_NAME_NULL", code, name);
                continue;
            }
            if (isPlaceholder(code)) {
                skippedPlaceholder++;
                updateStatus(hash, rowNo, "SKIPPED_PLACEHOLDER", "계정코드 placeholder (" + code + ")", null);
                addRejectSample(rejected, rowNo, "SKIPPED_PLACEHOLDER", code, name);
                continue;
            }

            boolean exists = exists("SELECT COUNT(1) FROM chart_of_accounts WHERE code = :code AND is_deleted = FALSE",
                    new MapSqlParameterSource("code", code));
            upsertAccount(code, name, c, actorUserId);
            upsertAccountMap(code, name, hash);
            updateStatus(hash, rowNo, exists ? "UPDATED" : "IMPORTED", null, code);
            if (exists) {
                updated++;
            } else {
                imported++;
            }
        }

        log.info("MIG-2 account import 완료 total={} imported={} updated={} rejected={} placeholder={} hash={}",
                parsed.dataRows().size(), imported, updated, rejectedNullName, skippedPlaceholder, hash);
        return new EcountAccountImportResult(parsed.dataRows().size(), imported, updated,
                rejectedNullName, skippedPlaceholder, hash, rejected);
    }

    private void upsertAccount(String code, String name, String[] c, String actor) {
        jdbcTemplate.update("""
                INSERT INTO chart_of_accounts (
                  code, name, category, parent_code, is_leaf, display_order,
                  created_at, created_by, is_deleted
                ) VALUES (
                  :code, :name, :category, :parentCode, :isLeaf, :displayOrder,
                  NOW(), :actor, FALSE
                )
                ON CONFLICT (code) DO UPDATE SET
                  name = EXCLUDED.name,
                  category = EXCLUDED.category,
                  parent_code = EXCLUDED.parent_code,
                  is_leaf = EXCLUDED.is_leaf,
                  display_order = EXCLUDED.display_order,
                  modified_at = NOW(),
                  modified_by = EXCLUDED.created_by
                """,
                new MapSqlParameterSource()
                        .addValue("code", truncate(code, 10))
                        .addValue("name", truncate(name, 100))
                        .addValue("category", mapCategory(code, c[5]).name())
                        .addValue("parentCode", normalizeParentCode(c[7]))
                        .addValue("isLeaf", c[4].contains("전표입력계정"))
                        .addValue("displayOrder", parseDisplayOrder(code))
                        .addValue("actor", actor == null || actor.isBlank() ? "system" : actor));
    }

    private void upsertAccountMap(String code, String name, String hash) {
        int rows = jdbcTemplate.update("""
                INSERT INTO staging.ecount_account_map
                    (ecount_code, account_uuid, account_name, source_file_hash, updated_at)
                VALUES (:code, :code, :name, :hash, NOW())
                ON CONFLICT (ecount_code) DO UPDATE SET
                  account_uuid = EXCLUDED.account_uuid,
                  account_name = EXCLUDED.account_name,
                  source_file_hash = EXCLUDED.source_file_hash,
                  updated_at = NOW()
                WHERE staging.ecount_account_map.account_uuid = EXCLUDED.account_uuid
                """,
                new MapSqlParameterSource()
                        .addValue("code", truncate(code, 10))
                        .addValue("name", truncate(name, 100))
                        .addValue("hash", hash));
        if (rows == 0) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "계정 lookup map 이 다른 account_uuid 를 가리킵니다: code=" + code);
        }
    }

    private void acquireImportLock(String sourceFileHash) {
        jdbcTemplate.queryForObject("SELECT pg_advisory_xact_lock(:lockKey)",
                new MapSqlParameterSource("lockKey",
                        EcountCsvSupport.advisoryLockKey(IMPORT_LOCK_NAMESPACE, sourceFileHash)),
                Object.class);
    }

    private void stagingUpsert(String hash, int rowNo, String[] c, String actor) {
        jdbcTemplate.update("""
                INSERT INTO staging.ecount_account_raw (
                  source_file_hash, source_row_no, raw_account_code, raw_account_name,
                  raw_search_keyword, raw_debit_credit, raw_account_attribute, raw_account_type,
                  raw_income_expense_type, raw_fs_parent_code, raw_disabled, raw_payload,
                  transform_status, imported_by
                ) VALUES (
                  :hash, :row, :c0, :c1, :c2, :c3, :c4, :c5, :c6, :c7, :c31, :payload,
                  'PENDING', :actor
                )
                ON CONFLICT (source_file_hash, source_row_no) DO UPDATE SET
                  raw_account_code = EXCLUDED.raw_account_code,
                  raw_account_name = EXCLUDED.raw_account_name,
                  raw_search_keyword = EXCLUDED.raw_search_keyword,
                  raw_debit_credit = EXCLUDED.raw_debit_credit,
                  raw_account_attribute = EXCLUDED.raw_account_attribute,
                  raw_account_type = EXCLUDED.raw_account_type,
                  raw_income_expense_type = EXCLUDED.raw_income_expense_type,
                  raw_fs_parent_code = EXCLUDED.raw_fs_parent_code,
                  raw_disabled = EXCLUDED.raw_disabled,
                  raw_payload = EXCLUDED.raw_payload,
                  transform_status = 'PENDING',
                  target_account_code = NULL,
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
                        .addValue("c7", EcountCsvSupport.nullIfBlank(c[7]))
                        .addValue("c31", EcountCsvSupport.nullIfBlank(c[31]))
                        .addValue("payload", String.join("\u001F", c))
                        .addValue("actor", actor == null || actor.isBlank() ? "system" : actor));
    }

    private void updateStatus(String hash, int rowNo, String status, String reason, String targetCode) {
        jdbcTemplate.update("""
                UPDATE staging.ecount_account_raw
                   SET transform_status = :status,
                       reject_reason = :reason,
                       target_account_code = :targetCode
                 WHERE source_file_hash = :hash AND source_row_no = :row
                """,
                new MapSqlParameterSource()
                        .addValue("status", status)
                        .addValue("reason", reason)
                        .addValue("targetCode", targetCode)
                        .addValue("hash", hash)
                        .addValue("row", rowNo));
    }

    static AccountCategory mapCategory(String code, String rawType) {
        String type = rawType == null ? "" : rawType;
        if (type.contains("자산") || code.startsWith("1") || code.startsWith("0")) {
            return AccountCategory.ASSET;
        }
        if (type.contains("부채") || code.startsWith("2")) {
            return AccountCategory.LIABILITY;
        }
        if (type.contains("자본") || code.startsWith("3")) {
            return AccountCategory.EQUITY;
        }
        if (type.contains("매출") || type.contains("수익") || code.startsWith("4")) {
            return AccountCategory.REVENUE;
        }
        if (code.startsWith("5")) {
            return AccountCategory.COST_OF_SALES;
        }
        if (code.startsWith("8")) {
            return AccountCategory.SGA;
        }
        if (code.startsWith("99")) {
            return AccountCategory.INCOME_TAX;
        }
        return AccountCategory.NON_OPERATING;
    }

    private boolean exists(String sql, MapSqlParameterSource p) {
        Integer count = jdbcTemplate.queryForObject(sql, p, Integer.class);
        return count != null && count > 0;
    }

    private boolean isPlaceholder(String code) {
        return code == null || code.isBlank() || PLACEHOLDER_CODE.matcher(code).matches();
    }

    private static String normalizeParentCode(String raw) {
        if (raw == null || raw.isBlank() || PLACEHOLDER_CODE.matcher(raw).matches()) {
            return null;
        }
        return truncate(raw, 10);
    }

    private static int parseDisplayOrder(String code) {
        try {
            return Integer.parseInt(code.replaceFirst("^0+(?!$)", ""));
        } catch (NumberFormatException ex) {
            return 9999;
        }
    }

    private static String truncate(String value, int max) {
        if (value == null) {
            return null;
        }
        return value.length() <= max ? value : value.substring(0, max);
    }

    private static void addRejectSample(List<EcountAccountImportResult.RejectedRow> sample,
                                        int rowNo, String reason, String code, String name) {
        if (sample.size() < REJECT_SAMPLE_MAX) {
            sample.add(new EcountAccountImportResult.RejectedRow(rowNo, reason, code, name));
        }
    }
}
