package com.samhanair.logis.user.service;

import com.samhanair.logis.common.ecount.EcountCsvSupport;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.user.web.dto.EcountDepartmentImportResult;
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

/** MIG-2 — 이카운트 부서코드 CSV → departments + department lookup map import. */
@Slf4j
@Service
@RequiredArgsConstructor
public class EcountDepartmentImporter {

    private static final UUID IMPORT_LOCK_NAMESPACE = UUID.fromString("8b03b771-38b8-4134-8dc0-d5b5db0becb7");
    // raw: docs/migration/ecount-data/raw/부서코드-Excel다운로드.csv
    static final String[] HEADERS = {"부서코드", "부서명", "사용", "추가사업장"};
    private static final Pattern PLACEHOLDER_CODE =
            Pattern.compile("^(-|0+|0+[- ]?0+[- ]?0+)$");
    private static final int REJECT_SAMPLE_MAX = 20;

    private final NamedParameterJdbcTemplate jdbcTemplate;

    @Transactional(propagation = Propagation.REQUIRES_NEW, isolation = Isolation.READ_COMMITTED)
    public EcountDepartmentImportResult importCsv(InputStream csv, String actorUserId) {
        byte[] content = EcountCsvSupport.readRequired(csv);
        String hash = EcountCsvSupport.computeFileHash(content);
        acquireImportLock(hash);
        EcountCsvSupport.ParsedCsv parsed = EcountCsvSupport.parse(content);
        EcountCsvSupport.validateHeader(parsed.header(), HEADERS);

        int imported = 0;
        int updated = 0;
        int rejectedNullName = 0;
        int skippedPlaceholder = 0;
        List<EcountDepartmentImportResult.RejectedRow> rejected = new ArrayList<>();

        for (int i = 0; i < parsed.dataRows().size(); i++) {
            int rowNo = i + 1;
            String[] c = EcountCsvSupport.normalizeRow(parsed.dataRows().get(i), HEADERS.length);
            stagingUpsert(hash, rowNo, c, actorUserId);
            String code = c[0];
            String name = c[1];
            if (name.isBlank()) {
                rejectedNullName++;
                updateStatus(hash, rowNo, "REJECT_NAME_NULL", "부서명 빈값", null);
                addRejectSample(rejected, rowNo, "REJECT_NAME_NULL", code, name);
                continue;
            }
            if (isPlaceholder(code)) {
                skippedPlaceholder++;
                updateStatus(hash, rowNo, "SKIPPED_PLACEHOLDER", "부서코드 placeholder (" + code + ")", null);
                addRejectSample(rejected, rowNo, "SKIPPED_PLACEHOLDER", code, name);
                continue;
            }
            boolean exists = exists("SELECT COUNT(1) FROM departments WHERE code = :code AND is_deleted = FALSE",
                    new MapSqlParameterSource("code", code));
            UUID departmentId = upsertDepartment(code, name, actorUserId);
            upsertMap(code, name, departmentId, hash);
            updateStatus(hash, rowNo, exists ? "UPDATED" : "IMPORTED", null, departmentId);
            if (exists) {
                updated++;
            } else {
                imported++;
            }
        }
        log.info("MIG-2 department import 완료 total={} imported={} updated={} rejected={} placeholder={} hash={}",
                parsed.dataRows().size(), imported, updated, rejectedNullName, skippedPlaceholder, hash);
        return new EcountDepartmentImportResult(parsed.dataRows().size(), imported, updated,
                rejectedNullName, skippedPlaceholder, hash, rejected);
    }

    private UUID upsertDepartment(String code, String name, String actor) {
        return jdbcTemplate.queryForObject("""
                INSERT INTO departments (id, code, name, display_order, created_at, created_by, is_deleted)
                VALUES (gen_random_uuid(), :code, :name, :displayOrder, NOW(), :actor, FALSE)
                ON CONFLICT (code) WHERE is_deleted = FALSE DO UPDATE SET
                  name = EXCLUDED.name,
                  display_order = EXCLUDED.display_order,
                  modified_at = NOW(),
                  modified_by = EXCLUDED.created_by
                RETURNING id
                """,
                new MapSqlParameterSource()
                        .addValue("code", truncate(code, 50))
                        .addValue("name", truncate(name, 100))
                        .addValue("displayOrder", parseDisplayOrder(code))
                        .addValue("actor", actor == null || actor.isBlank() ? "system" : actor),
                UUID.class);
    }

    private void upsertMap(String code, String name, UUID departmentId, String hash) {
        int rows = jdbcTemplate.update("""
                INSERT INTO staging.ecount_department_map
                    (ecount_code, ecount_name, department_uuid, source_file_hash, updated_at)
                VALUES (:code, :name, :id, :hash, NOW())
                ON CONFLICT (ecount_code) DO UPDATE SET
                  ecount_name = EXCLUDED.ecount_name,
                  department_uuid = EXCLUDED.department_uuid,
                  source_file_hash = EXCLUDED.source_file_hash,
                  updated_at = NOW()
                WHERE staging.ecount_department_map.department_uuid = EXCLUDED.department_uuid
                """,
                new MapSqlParameterSource()
                        .addValue("code", truncate(code, 50))
                        .addValue("name", truncate(name, 100))
                        .addValue("id", departmentId)
                        .addValue("hash", hash));
        if (rows == 0) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "부서 lookup map 이 다른 department_uuid 를 가리킵니다: code=" + code);
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
                INSERT INTO staging.ecount_department_raw (
                  source_file_hash, source_row_no, raw_department_code, raw_department_name,
                  raw_usage_flag, raw_extra_business, transform_status, imported_by
                ) VALUES (:hash, :row, :c0, :c1, :c2, :c3, 'PENDING', :actor)
                ON CONFLICT (source_file_hash, source_row_no) DO UPDATE SET
                  raw_department_code = EXCLUDED.raw_department_code,
                  raw_department_name = EXCLUDED.raw_department_name,
                  raw_usage_flag = EXCLUDED.raw_usage_flag,
                  raw_extra_business = EXCLUDED.raw_extra_business,
                  transform_status = 'PENDING',
                  target_department_id = NULL,
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
                        .addValue("actor", actor == null || actor.isBlank() ? "system" : actor));
    }

    private void updateStatus(String hash, int rowNo, String status, String reason, UUID id) {
        jdbcTemplate.update("""
                UPDATE staging.ecount_department_raw
                   SET transform_status = :status,
                       reject_reason = :reason,
                       target_department_id = :id
                 WHERE source_file_hash = :hash AND source_row_no = :row
                """,
                new MapSqlParameterSource()
                        .addValue("status", status)
                        .addValue("reason", reason)
                        .addValue("id", id)
                        .addValue("hash", hash)
                        .addValue("row", rowNo));
    }

    private boolean exists(String sql, MapSqlParameterSource p) {
        Integer count = jdbcTemplate.queryForObject(sql, p, Integer.class);
        return count != null && count > 0;
    }

    private boolean isPlaceholder(String code) {
        return code == null || code.isBlank() || PLACEHOLDER_CODE.matcher(code).matches();
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

    private static void addRejectSample(List<EcountDepartmentImportResult.RejectedRow> sample,
                                        int rowNo, String reason, String code, String name) {
        if (sample.size() < REJECT_SAMPLE_MAX) {
            sample.add(new EcountDepartmentImportResult.RejectedRow(rowNo, reason, code, name));
        }
    }
}
