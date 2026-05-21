package com.samhanair.logis.accounting.service;

import com.samhanair.logis.common.ecount.EcountCsvSupport;
import com.samhanair.logis.common.ecount.EcountMig6ImportResult;
import com.samhanair.logis.common.ecount.EcountMig6ImportSupport;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.io.InputStream;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** MIG-6 — 이카운트 고정자산유형 CSV → fixed_asset_types 도메인 import. */
@Service
@RequiredArgsConstructor
public class EcountFixedAssetTypeImporter {

    private static final UUID IMPORT_LOCK_NAMESPACE =
            UUID.fromString("720e2a5b-c688-4a11-a51f-01ab7d625605");
    public static final String[] HEADERS = {"고정자산유형코드", "고정자산유형명", "사용여부"};

    private final NamedParameterJdbcTemplate jdbcTemplate;
    @Autowired(required = false)
    private MigOpsMetricsRecorder metricsRecorder;

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
        Set<String> seenTypeCodes = new HashSet<>();
        for (int i = 0; i < parsed.dataRows().size(); i++) {
            int rowNo = i + 1;
            String[] c = EcountCsvSupport.normalizeRow(parsed.dataRows().get(i), HEADERS.length);
            try {
                String code = require(c[0], "고정자산유형코드", rowNo);
                String name = require(c[1], "고정자산유형명", rowNo);
                rejectDuplicateBusinessKey(seenTypeCodes, code, rowNo);
                boolean active = EcountMig6ImportSupport.parseActiveFlag(c[2], rowNo);
                if (!insertStaging(hash, rowNo, c, actor)) {
                    result.skipped();
                    continue;
                }
                boolean exists = exists(code);
                UUID id = upsertType(code, name, active, actor);
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
                        "고정자산유형 domain upsert 충돌: " + ex.getMostSpecificCause().getMessage(), c[0], c[0]);
            }
        }
        EcountMig6ImportResult built = result.build();
        EcountMigMetricsSupport.recordImportResult(metricsRecorder, "mig-6", built);
        return built;
    }

    private boolean insertStaging(String hash, int rowNo, String[] c, String actor) {
        int rows = jdbcTemplate.update("""
                INSERT INTO staging.ecount_fixed_asset_type_raw (
                  source_file_hash, source_row_no, type_code, type_name, usage_flag_raw,
                  raw_payload, created_by, modified_by
                ) VALUES (
                  :hash, :row, :code, :name, :usageFlagRaw, :payload, :actor, :actor
                )
                ON CONFLICT (source_file_hash, source_row_no) DO NOTHING
                """, params(hash, rowNo, c, actor));
        return rows > 0;
    }

    private void insertRejectedStaging(String hash, int rowNo, String[] c, String actor) {
        jdbcTemplate.update("""
                INSERT INTO staging.ecount_fixed_asset_type_raw (
                  source_file_hash, source_row_no, type_code, type_name, usage_flag_raw,
                  raw_payload, transform_status, created_by, modified_by
                ) VALUES (
                  :hash, :row, :code, :name, :usageFlagRaw, :payload, 'REJECTED', :actor, :actor
                )
                ON CONFLICT (source_file_hash, source_row_no) DO NOTHING
                """, params(hash, rowNo, c, actor));
    }

    private UUID upsertType(String code, String name, boolean active, String actor) {
        return jdbcTemplate.queryForObject("""
                WITH restored AS (
                    UPDATE fixed_asset_types
                       SET type_name = :name,
                           active = :active,
                           is_deleted = FALSE,
                           deleted_at = NULL,
                           deleted_by = NULL,
                           modified_at = NOW(),
                           modified_by = :actor
                     WHERE type_code = :code AND is_deleted = TRUE
                     RETURNING id
                ), upserted AS (
                    INSERT INTO fixed_asset_types (
                      id, type_code, type_name, active, created_at, created_by, modified_at, modified_by, is_deleted
                    )
                    SELECT gen_random_uuid(), :code, :name, :active, NOW(), :actor, NOW(), :actor, FALSE
                    WHERE NOT EXISTS (SELECT 1 FROM restored)
                    ON CONFLICT (type_code) WHERE is_deleted = FALSE DO UPDATE SET
                      type_name = EXCLUDED.type_name,
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
                .addValue("active", active)
                .addValue("actor", actor), UUID.class);
    }

    private void updateStatus(String hash, int rowNo, String status, String reason, UUID id) {
        jdbcTemplate.update("""
                UPDATE staging.ecount_fixed_asset_type_raw
                   SET transform_status = :status,
                       reject_reason = :reason,
                       target_fixed_asset_type_id = :id,
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
                .addValue("usageFlagRaw", EcountCsvSupport.nullIfBlank(c[2]))
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
                "SELECT COUNT(1) FROM fixed_asset_types WHERE type_code = :code AND is_deleted = FALSE",
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
        return ex.getErrorCode() == ErrorCode.MIG6_BOOLEAN_FLAG_INVALID ? c[2] : String.join("\u001F", c);
    }

    private static void rejectDuplicateBusinessKey(Set<String> seenKeys, String code, int rowNo) {
        if (!seenKeys.add(code)) {
            throw new BusinessException(ErrorCode.MIG6_FIXED_ASSET_TYPE_CODE_DUPLICATE,
                    "동일 source_file 내 고정자산유형코드 중복: sourceRowNo=" + rowNo + ", typeCode='" + code + "'");
        }
    }

    private static String truncate(String value, int max) {
        return value == null || value.length() <= max ? value : value.substring(0, max);
    }
}
