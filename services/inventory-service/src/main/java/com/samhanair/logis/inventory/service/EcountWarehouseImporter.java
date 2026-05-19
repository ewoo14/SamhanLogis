package com.samhanair.logis.inventory.service;

import com.samhanair.logis.common.ecount.EcountCsvSupport;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.inventory.web.dto.EcountWarehouseImportResult;
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

/** MIG-2 — 이카운트 창고 CSV → warehouses + warehouse lookup map import. */
@Slf4j
@Service
@RequiredArgsConstructor
public class EcountWarehouseImporter {

    private static final UUID IMPORT_LOCK_NAMESPACE = UUID.fromString("982b42cc-8a27-4e9e-a554-98cb8a8a45c7");
    // raw: docs/migration/ecount-data/raw/창고-Excel다운로드.csv
    static final String[] HEADERS = {
            "창고코드", "창고명", "구분", "생산공정명", "외주거래처명", "사용", "추가사업장명"
    };
    private static final Pattern PLACEHOLDER_CODE =
            Pattern.compile("^(-|0+|0+[- ]?0+[- ]?0+)$");
    private static final int REJECT_SAMPLE_MAX = 20;

    private final NamedParameterJdbcTemplate jdbcTemplate;

    @Transactional(propagation = Propagation.REQUIRES_NEW, isolation = Isolation.READ_COMMITTED)
    public EcountWarehouseImportResult importCsv(InputStream csv, String actorUserId) {
        byte[] content = EcountCsvSupport.readRequired(csv);
        String hash = EcountCsvSupport.computeFileHash(content);
        acquireImportLock(hash);
        EcountCsvSupport.ParsedCsv parsed = EcountCsvSupport.parse(content);
        EcountCsvSupport.validateHeader(parsed.header(), HEADERS);

        int imported = 0;
        int updated = 0;
        int rejectedNullName = 0;
        int skippedPlaceholder = 0;
        List<EcountWarehouseImportResult.RejectedRow> rejected = new ArrayList<>();

        for (int i = 0; i < parsed.dataRows().size(); i++) {
            int rowNo = i + 1;
            String[] c = EcountCsvSupport.normalizeRow(parsed.dataRows().get(i), HEADERS.length);
            stagingUpsert(hash, rowNo, c, actorUserId);
            String code = c[0];
            String name = c[1];
            if (name.isBlank()) {
                rejectedNullName++;
                updateStatus(hash, rowNo, "REJECT_NAME_NULL", "창고명 빈값", null);
                addRejectSample(rejected, rowNo, "REJECT_NAME_NULL", code, name);
                continue;
            }
            if (isPlaceholder(code)) {
                skippedPlaceholder++;
                updateStatus(hash, rowNo, "SKIPPED_PLACEHOLDER", "창고코드 placeholder (" + code + ")", null);
                addRejectSample(rejected, rowNo, "SKIPPED_PLACEHOLDER", code, name);
                continue;
            }
            boolean exists = exists("SELECT COUNT(1) FROM warehouses WHERE code = :code AND is_deleted = FALSE",
                    new MapSqlParameterSource("code", code));
            UUID warehouseId = upsertWarehouse(code, name, c, actorUserId);
            upsertMap(code, name, warehouseId, hash);
            updateStatus(hash, rowNo, exists ? "UPDATED" : "IMPORTED", null, warehouseId);
            if (exists) {
                updated++;
            } else {
                imported++;
            }
        }
        log.info("MIG-2 warehouse import 완료 total={} imported={} updated={} rejected={} placeholder={} hash={}",
                parsed.dataRows().size(), imported, updated, rejectedNullName, skippedPlaceholder, hash);
        return new EcountWarehouseImportResult(parsed.dataRows().size(), imported, updated,
                rejectedNullName, skippedPlaceholder, hash, rejected);
    }

    private UUID upsertWarehouse(String code, String name, String[] c, String actor) {
        return jdbcTemplate.queryForObject("""
                INSERT INTO warehouses (
                  id, code, name, type, address, display_order, description,
                  created_at, created_by, is_deleted
                ) VALUES (
                  gen_random_uuid(), :code, :name, :type, NULL, :displayOrder, :description,
                  NOW(), :actor, FALSE
                )
                ON CONFLICT (code) WHERE is_deleted = FALSE DO UPDATE SET
                  name = EXCLUDED.name,
                  type = EXCLUDED.type,
                  display_order = EXCLUDED.display_order,
                  description = EXCLUDED.description,
                  modified_at = NOW(),
                  modified_by = EXCLUDED.created_by
                RETURNING id
                """,
                new MapSqlParameterSource()
                        .addValue("code", truncate(code, 50))
                        .addValue("name", truncate(name, 100))
                        .addValue("type", mapType(c[2]))
                        .addValue("displayOrder", parseDisplayOrder(code))
                        .addValue("description", buildDescription(c))
                        .addValue("actor", actor == null || actor.isBlank() ? "system" : actor),
                UUID.class);
    }

    private void upsertMap(String code, String name, UUID warehouseId, String hash) {
        int rows = jdbcTemplate.update("""
                INSERT INTO staging.ecount_warehouse_map
                    (ecount_code, ecount_name, warehouse_uuid, source_file_hash, updated_at)
                VALUES (:code, :name, :id, :hash, NOW())
                ON CONFLICT (ecount_code) DO UPDATE SET
                  ecount_name = EXCLUDED.ecount_name,
                  warehouse_uuid = EXCLUDED.warehouse_uuid,
                  source_file_hash = EXCLUDED.source_file_hash,
                  updated_at = NOW()
                WHERE staging.ecount_warehouse_map.warehouse_uuid = EXCLUDED.warehouse_uuid
                """,
                new MapSqlParameterSource()
                        .addValue("code", truncate(code, 50))
                        .addValue("name", truncate(name, 100))
                        .addValue("id", warehouseId)
                        .addValue("hash", hash));
        if (rows == 0) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "창고 lookup map 이 다른 warehouse_uuid 를 가리킵니다: code=" + code);
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
                INSERT INTO staging.ecount_warehouse_raw (
                  source_file_hash, source_row_no, raw_warehouse_code, raw_warehouse_name,
                  raw_warehouse_kind, raw_process_name, raw_outsource_partner, raw_usage_flag,
                  raw_extra_business, transform_status, imported_by
                ) VALUES (:hash, :row, :c0, :c1, :c2, :c3, :c4, :c5, :c6, 'PENDING', :actor)
                ON CONFLICT (source_file_hash, source_row_no) DO UPDATE SET
                  raw_warehouse_code = EXCLUDED.raw_warehouse_code,
                  raw_warehouse_name = EXCLUDED.raw_warehouse_name,
                  raw_warehouse_kind = EXCLUDED.raw_warehouse_kind,
                  raw_process_name = EXCLUDED.raw_process_name,
                  raw_outsource_partner = EXCLUDED.raw_outsource_partner,
                  raw_usage_flag = EXCLUDED.raw_usage_flag,
                  raw_extra_business = EXCLUDED.raw_extra_business,
                  transform_status = 'PENDING',
                  target_warehouse_id = NULL,
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

    private void updateStatus(String hash, int rowNo, String status, String reason, UUID id) {
        jdbcTemplate.update("""
                UPDATE staging.ecount_warehouse_raw
                   SET transform_status = :status,
                       reject_reason = :reason,
                       target_warehouse_id = :id
                 WHERE source_file_hash = :hash AND source_row_no = :row
                """,
                new MapSqlParameterSource()
                        .addValue("status", status)
                        .addValue("reason", reason)
                        .addValue("id", id)
                        .addValue("hash", hash)
                        .addValue("row", rowNo));
    }

    static String mapType(String rawKind) {
        if (rawKind != null && rawKind.contains("가상")) {
            return "VIRTUAL";
        }
        if (rawKind != null && rawKind.contains("차량")) {
            return "VEHICLE";
        }
        if (rawKind != null && rawKind.contains("외주")) {
            return "CONSIGNMENT";
        }
        return "HEADQUARTERS";
    }

    private boolean exists(String sql, MapSqlParameterSource p) {
        Integer count = jdbcTemplate.queryForObject(sql, p, Integer.class);
        return count != null && count > 0;
    }

    private boolean isPlaceholder(String code) {
        return code == null || code.isBlank() || PLACEHOLDER_CODE.matcher(code).matches();
    }

    private static String buildDescription(String[] c) {
        String process = c[3].isBlank() ? null : "생산공정=" + c[3];
        String partner = c[4].isBlank() ? null : "외주거래처=" + c[4];
        String business = c[6].isBlank() ? null : "추가사업장=" + c[6];
        return truncate(String.join(" / ",
                java.util.stream.Stream.of(process, partner, business)
                        .filter(v -> v != null && !v.isBlank()).toList()), 500);
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

    private static void addRejectSample(List<EcountWarehouseImportResult.RejectedRow> sample,
                                        int rowNo, String reason, String code, String name) {
        if (sample.size() < REJECT_SAMPLE_MAX) {
            sample.add(new EcountWarehouseImportResult.RejectedRow(rowNo, reason, code, name));
        }
    }
}
