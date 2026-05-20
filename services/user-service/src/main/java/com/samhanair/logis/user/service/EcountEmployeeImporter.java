package com.samhanair.logis.user.service;

import com.samhanair.logis.common.ecount.EcountCsvSupport;
import com.samhanair.logis.common.ecount.EcountMig6ImportResult;
import com.samhanair.logis.common.ecount.EcountMig6ImportSupport;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.io.InputStream;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** MIG-6 — 이카운트 사원 CSV → employees 도메인 import. */
@Service
@RequiredArgsConstructor
public class EcountEmployeeImporter {

    private static final UUID IMPORT_LOCK_NAMESPACE =
            UUID.fromString("720e2a5b-c688-4a11-a51f-01ab7d625602");
    public static final String[] HEADERS = {
            "사원(담당)코드", "사원(담당)명", "검색창내용", "담당자연락처", "담당자Email", "사용"
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
                String code = require(c[0], "사원(담당)코드", rowNo);
                String name = require(c[1], "사원(담당)명", rowNo);
                boolean active = EcountMig6ImportSupport.parseActiveFlag(c[5], rowNo);
                if (!insertStaging(hash, rowNo, c, actor)) {
                    result.skipped();
                    continue;
                }
                boolean exists = exists(code);
                UUID id = upsertEmployee(code, name, c[3], c[4], active, actor);
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
                updateStatus(hash, rowNo, ErrorCode.MIG6_EMPLOYEE_CODE_DUPLICATE.name(),
                        ex.getMostSpecificCause().getMessage(), null);
                result.reject(rowNo, ErrorCode.MIG6_EMPLOYEE_CODE_DUPLICATE.name(),
                        "사원 domain upsert 충돌: " + ex.getMostSpecificCause().getMessage(), c[0], c[0]);
            }
        }
        return result.build();
    }

    private boolean insertStaging(String hash, int rowNo, String[] c, String actor) {
        int rows = jdbcTemplate.update("""
                INSERT INTO staging.ecount_employee_raw (
                  source_file_hash, source_row_no, employee_code, employee_name, search_content,
                  phone, email, usage_flag_raw, raw_payload, created_by, modified_by
                ) VALUES (
                  :hash, :row, :code, :name, :searchContent, :phone, :email, :usageFlagRaw,
                  :payload, :actor, :actor
                )
                ON CONFLICT (source_file_hash, source_row_no) DO NOTHING
                """, params(hash, rowNo, c, actor));
        return rows > 0;
    }

    private void insertRejectedStaging(String hash, int rowNo, String[] c, String actor) {
        jdbcTemplate.update("""
                INSERT INTO staging.ecount_employee_raw (
                  source_file_hash, source_row_no, employee_code, employee_name, search_content,
                  phone, email, usage_flag_raw, raw_payload, transform_status, created_by, modified_by
                ) VALUES (
                  :hash, :row, :code, :name, :searchContent, :phone, :email, :usageFlagRaw,
                  :payload, 'REJECTED', :actor, :actor
                )
                ON CONFLICT (source_file_hash, source_row_no) DO NOTHING
                """, params(hash, rowNo, c, actor));
    }

    private UUID upsertEmployee(String code, String name, String phone, String email, boolean active, String actor) {
        return jdbcTemplate.queryForObject("""
                WITH dept AS (
                    INSERT INTO departments (id, code, name, display_order, created_at, created_by, is_deleted)
                    VALUES (gen_random_uuid(), 'MIG6_ECOUNT', '이카운트 사원', 9999, NOW(), :actor, FALSE)
                    ON CONFLICT (code) WHERE is_deleted = FALSE DO UPDATE SET name = EXCLUDED.name
                    RETURNING id
                ), dept_id AS (
                    SELECT id FROM dept
                    UNION ALL
                    SELECT id FROM departments WHERE code = 'MIG6_ECOUNT' AND is_deleted = FALSE
                    LIMIT 1
                ), new_employee AS (
                    SELECT gen_random_uuid() AS id
                ), restored AS (
                    UPDATE employees
                       SET full_name = :name,
                           phone = :phone,
                           email = :email,
                           termination_date = CASE WHEN :active THEN NULL ELSE COALESCE(termination_date, CURRENT_DATE) END,
                           is_deleted = FALSE,
                           deleted_at = NULL,
                           deleted_by = NULL,
                           modified_at = NOW(),
                           modified_by = :actor
                     WHERE ecount_code = :code AND is_deleted = TRUE
                     RETURNING id
                ), upserted AS (
                    INSERT INTO employees (
                      id, account_id, login_id, full_name, job_title, role_snapshot, department_id,
                      is_team_lead, hire_date, termination_date, email, phone, ecount_code,
                      created_at, created_by, modified_at, modified_by, is_deleted
                    )
                    SELECT (SELECT id FROM new_employee), (SELECT id FROM new_employee),
                           'ecount-' || :code, :name, '사원', 'MEMBER',
                           (SELECT id FROM dept_id), FALSE, DATE '2026-01-01',
                           CASE WHEN :active THEN NULL ELSE CURRENT_DATE END,
                           :email, :phone, :code, NOW(), :actor, NOW(), :actor, FALSE
                    WHERE NOT EXISTS (SELECT 1 FROM restored)
                    ON CONFLICT (ecount_code) WHERE ecount_code IS NOT NULL AND is_deleted = FALSE DO UPDATE SET
                      full_name = EXCLUDED.full_name,
                      phone = EXCLUDED.phone,
                      email = EXCLUDED.email,
                      termination_date = EXCLUDED.termination_date,
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
                .addValue("name", truncate(name, 50))
                .addValue("phone", truncate(EcountCsvSupport.nullIfBlank(phone), 20))
                .addValue("email", truncate(EcountCsvSupport.nullIfBlank(email), 100))
                .addValue("active", active)
                .addValue("actor", actor), UUID.class);
    }

    private void updateStatus(String hash, int rowNo, String status, String reason, UUID id) {
        jdbcTemplate.update("""
                UPDATE staging.ecount_employee_raw
                   SET transform_status = :status,
                       reject_reason = :reason,
                       target_employee_id = :id,
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
                .addValue("searchContent", EcountCsvSupport.nullIfBlank(c[2]))
                .addValue("phone", EcountCsvSupport.nullIfBlank(c[3]))
                .addValue("email", EcountCsvSupport.nullIfBlank(c[4]))
                .addValue("usageFlagRaw", EcountCsvSupport.nullIfBlank(c[5]))
                .addValue("payload", String.join("\u001F", c))
                .addValue("actor", actor);
    }

    private void acquireImportLock(String sourceFileHash) {
        jdbcTemplate.queryForObject("SELECT pg_advisory_xact_lock(:lockKey)",
                new MapSqlParameterSource("lockKey",
                        EcountCsvSupport.advisoryLockKey(IMPORT_LOCK_NAMESPACE, sourceFileHash)),
                Object.class);
    }

    private boolean exists(String code) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(1) FROM employees WHERE ecount_code = :code AND is_deleted = FALSE",
                new MapSqlParameterSource("code", code), Integer.class);
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
        return ex.getErrorCode() == ErrorCode.MIG6_BOOLEAN_FLAG_INVALID ? c[5] : String.join("\u001F", c);
    }

    private static String truncate(String value, int max) {
        return value == null || value.length() <= max ? value : value.substring(0, max);
    }
}
