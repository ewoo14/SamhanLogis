package com.samhanair.logis.user.service;

import com.samhanair.logis.common.ecount.EcountCsvSupport;
import com.samhanair.logis.common.ecount.EcountMig6ImportResult;
import com.samhanair.logis.common.ecount.EcountMig6ImportSupport;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.io.InputStream;
import java.time.LocalDate;
import java.util.UUID;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** MIG-6 — 이카운트 인사카드 CSV → employee_cards 도메인 import. */
@Service
@RequiredArgsConstructor
public class EcountEmployeeCardImporter {

    private static final UUID IMPORT_LOCK_NAMESPACE =
            UUID.fromString("720e2a5b-c688-4a11-a51f-01ab7d625603");
    private static final Pattern RESIDENT_NUMBER = Pattern.compile("^\\d{6}-\\d{7}$");
    private static final String RESIDENT_PLACEHOLDER = "XXXXXX-XXXXXXX";
    public static final String[] HEADERS = {
            "사원번호", "성명", "주민등록번호", "부서명", "직위/직급명", "입사일자", "계좌번호", "Email"
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
                String code = require(c[0], "사원번호", rowNo);
                String name = require(c[1], "성명", rowNo);
                String residentNumberMasked = maskResidentNumber(c[2]);
                LocalDate hireDate = EcountMig6ImportSupport.parseDate(c[5], rowNo, true);
                if (!insertStaging(hash, rowNo, c, residentNumberMasked, hireDate, actor)) {
                    result.skipped();
                    continue;
                }
                UUID employeeId = lookupEmployee(code, rowNo);
                boolean exists = exists(employeeId);
                UUID id = upsertCard(employeeId, code, name, residentNumberMasked, c, hireDate, actor);
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
                updateStatus(hash, rowNo, ErrorCode.CONFLICT.name(), ex.getMostSpecificCause().getMessage(), null);
                result.reject(rowNo, ErrorCode.CONFLICT.name(),
                        "인사카드 domain upsert 충돌: " + ex.getMostSpecificCause().getMessage(), c[0], c[0]);
            }
        }
        return result.build();
    }

    public static String maskResidentNumber(String raw) {
        String value = EcountCsvSupport.stripCell(raw);
        if (RESIDENT_PLACEHOLDER.equals(value)) {
            return "XXXXXX-X******";
        }
        if (!RESIDENT_NUMBER.matcher(value).matches()) {
            throw new BusinessException(ErrorCode.MIG6_RESIDENT_NUMBER_INVALID,
                    "주민등록번호 형식 불일치: sample='[MASKED]'");
        }
        return value.substring(0, 8) + "******";
    }

    private boolean insertStaging(String hash, int rowNo, String[] c, String residentNumberMasked,
                                  LocalDate hireDate, String actor) {
        int rows = jdbcTemplate.update("""
                INSERT INTO staging.ecount_employee_card_raw (
                  source_file_hash, source_row_no, employee_code, employee_name, resident_number_masked,
                  department_name, position_name, hire_date, account_number, email,
                  raw_payload, created_by, modified_by
                ) VALUES (
                  :hash, :row, :code, :name, :residentNumberMasked,
                  :departmentName, :positionName, :hireDate, :accountNumber, :email,
                  :payload, :actor, :actor
                )
                ON CONFLICT (source_file_hash, source_row_no) DO NOTHING
                """, params(hash, rowNo, c, actor)
                .addValue("residentNumberMasked", residentNumberMasked)
                .addValue("hireDate", hireDate));
        return rows > 0;
    }

    private void insertRejectedStaging(String hash, int rowNo, String[] c, String actor) {
        jdbcTemplate.update("""
                INSERT INTO staging.ecount_employee_card_raw (
                  source_file_hash, source_row_no, employee_code, employee_name,
                  department_name, position_name, account_number, email, raw_payload,
                  transform_status, created_by, modified_by
                ) VALUES (
                  :hash, :row, :code, :name,
                  :departmentName, :positionName, :accountNumber, :email, :payload,
                  'REJECTED', :actor, :actor
                )
                ON CONFLICT (source_file_hash, source_row_no) DO NOTHING
                """, params(hash, rowNo, c, actor));
    }

    private UUID upsertCard(UUID employeeId, String code, String name, String residentNumberMasked,
                            String[] c, LocalDate hireDate, String actor) {
        return jdbcTemplate.queryForObject("""
                WITH restored AS (
                    UPDATE employee_cards
                       SET employee_code = :code,
                           employee_name = :name,
                           resident_number_masked = :residentNumberMasked,
                           department_name = :departmentName,
                           position_name = :positionName,
                           hire_date = :hireDate,
                           account_number = :accountNumber,
                           email = :email,
                           is_deleted = FALSE,
                           deleted_at = NULL,
                           deleted_by = NULL,
                           modified_at = NOW(),
                           modified_by = :actor
                     WHERE employee_id = :employeeId AND is_deleted = TRUE
                     RETURNING id
                ), upserted AS (
                    INSERT INTO employee_cards (
                      id, employee_id, employee_code, employee_name, resident_number_masked,
                      department_name, position_name, hire_date, account_number, email,
                      created_at, created_by, modified_at, modified_by, is_deleted
                    )
                    SELECT gen_random_uuid(), :employeeId, :code, :name, :residentNumberMasked,
                           :departmentName, :positionName, :hireDate, :accountNumber, :email,
                           NOW(), :actor, NOW(), :actor, FALSE
                    WHERE NOT EXISTS (SELECT 1 FROM restored)
                    ON CONFLICT (employee_id) WHERE is_deleted = FALSE DO UPDATE SET
                      employee_code = EXCLUDED.employee_code,
                      employee_name = EXCLUDED.employee_name,
                      resident_number_masked = EXCLUDED.resident_number_masked,
                      department_name = EXCLUDED.department_name,
                      position_name = EXCLUDED.position_name,
                      hire_date = EXCLUDED.hire_date,
                      account_number = EXCLUDED.account_number,
                      email = EXCLUDED.email,
                      modified_at = NOW(),
                      modified_by = EXCLUDED.modified_by
                    RETURNING id
                )
                SELECT id FROM restored
                UNION ALL
                SELECT id FROM upserted
                LIMIT 1
                """, params(null, 0, c, actor)
                .addValue("employeeId", employeeId)
                .addValue("code", truncate(code, 50))
                .addValue("name", truncate(name, 100))
                .addValue("residentNumberMasked", residentNumberMasked)
                .addValue("hireDate", hireDate), UUID.class);
    }

    private UUID lookupEmployee(String code, int rowNo) {
        try {
            UUID id = jdbcTemplate.queryForObject("""
                    SELECT id FROM employees WHERE ecount_code = :code AND is_deleted = FALSE
                    """, new MapSqlParameterSource("code", code), UUID.class);
            if (id != null) {
                return id;
            }
        } catch (EmptyResultDataAccessException ignored) {
            // Normalize DB lookup miss to the MIG-6 import contract.
        }
        throw new BusinessException(ErrorCode.MIG6_LOOKUP_MISS,
                "사원 lookup miss: sourceRowNo=" + rowNo + ", employeeCode='" + code + "'");
    }

    private boolean exists(UUID employeeId) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(1) FROM employee_cards WHERE employee_id = :employeeId AND is_deleted = FALSE",
                new MapSqlParameterSource("employeeId", employeeId), Integer.class);
        return count != null && count > 0;
    }

    private void updateStatus(String hash, int rowNo, String status, String reason, UUID id) {
        jdbcTemplate.update("""
                UPDATE staging.ecount_employee_card_raw
                   SET transform_status = :status,
                       reject_reason = :reason,
                       target_employee_card_id = :id,
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
                .addValue("departmentName", EcountCsvSupport.nullIfBlank(c[3]))
                .addValue("positionName", EcountCsvSupport.nullIfBlank(c[4]))
                .addValue("accountNumber", EcountCsvSupport.nullIfBlank(c[6]))
                .addValue("email", EcountCsvSupport.nullIfBlank(c[7]))
                .addValue("payload", String.join("\u001F", c))
                .addValue("actor", actor);
    }

    private void acquireImportLock(String sourceFileHash) {
        jdbcTemplate.queryForObject("SELECT pg_advisory_xact_lock(:lockKey)",
                new MapSqlParameterSource("lockKey",
                        EcountCsvSupport.advisoryLockKey(IMPORT_LOCK_NAMESPACE, sourceFileHash)),
                Object.class);
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
            case MIG6_RESIDENT_NUMBER_INVALID -> "[MASKED]";
            case MIG6_DATE_INVALID -> c[5];
            default -> String.join("\u001F", c);
        };
    }

    private static String truncate(String value, int max) {
        return value == null || value.length() <= max ? value : value.substring(0, max);
    }
}
