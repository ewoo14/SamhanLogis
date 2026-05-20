package com.samhanair.logis.inventory.service;

import com.samhanair.logis.common.ecount.EcountCsvSupport;
import com.samhanair.logis.common.ecount.EcountMig5ImportResult;
import com.samhanair.logis.common.ecount.EcountMig5ImportSupport;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.inventory.client.ProductLookupClient;
import com.samhanair.logis.inventory.client.ProductSummary;
import java.io.InputStream;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** MIG-5 — 이카운트 창고이동 CSV → StockTransfer 도메인 import. */
@Service
@RequiredArgsConstructor
public class EcountStockTransferImporter {

    private static final UUID IMPORT_LOCK_NAMESPACE =
            UUID.fromString("adbf0d0e-01b0-4948-8e66-31890faacb95");
    public static final String[] HEADERS = {
            "일자-No.", "출고창고명", "입고창고명", "품목명[규격]", "수량", "금액(수량*입고단가)", "적요"
    };

    private final NamedParameterJdbcTemplate jdbcTemplate;
    private final ProductLookupClient productLookupClient;

    @Transactional(propagation = Propagation.REQUIRES_NEW, isolation = Isolation.READ_COMMITTED)
    public EcountMig5ImportResult importCsv(InputStream csv, String actorUserId) {
        byte[] content = EcountCsvSupport.readRequired(csv);
        String hash = EcountCsvSupport.computeFileHash(content);
        acquireImportLock(hash);
        EcountCsvSupport.ParsedCsv parsed = EcountCsvSupport.parse(content);
        EcountMig5ImportSupport.validateHeader(parsed.header(), HEADERS);

        EcountMig5ImportResult.Builder result =
                EcountMig5ImportResult.builder(parsed.dataRows().size(), hash);
        String actor = EcountMig5ImportSupport.actor(actorUserId);
        for (int i = 0; i < parsed.dataRows().size(); i++) {
            int rowNo = i + 1;
            String[] c = EcountCsvSupport.normalizeRow(parsed.dataRows().get(i), HEADERS.length);
            try {
                if (EcountMig5ImportSupport.isBlankFooterRow(c)) {
                    result.skipped();
                    continue;
                }
                EcountMig5ImportSupport.SlipKey transferKey =
                        EcountMig5ImportSupport.parseSlipKey(c[0], rowNo);
                int quantity = parseQuantity(c[4], rowNo);
                BigDecimal amount = parseOptionalAmount(c[5], rowNo);
                UUID sourceWarehouseId = lookupWarehouse(c[1], rowNo, "출고창고명");
                UUID destinationWarehouseId = lookupWarehouse(c[2], rowNo, "입고창고명");
                if (sourceWarehouseId.equals(destinationWarehouseId)) {
                    throw new BusinessException(ErrorCode.MIG5_LOOKUP_AMBIGUOUS,
                            "출고/입고 창고가 동일합니다: sourceRowNo=" + rowNo + ", warehouse='" + c[1] + "'");
                }
                UUID productId = lookupProduct(c[3], rowNo);
                if (!insertStaging(hash, rowNo, c, transferKey, quantity, amount, actor)) {
                    result.skipped();
                    continue;
                }
                ExistingTransfer before = findTransfer(transferKey.canonicalNo());
                UUID transferId = upsertTransfer(transferKey.canonicalNo(),
                        sourceWarehouseId, destinationWarehouseId, c[6], actor);
                upsertLine(transferId, productId, quantity, actor);
                updateStatus(hash, rowNo,
                        before == null ? "IMPORTED" : "UPDATED", null, transferKey.canonicalNo());
                if (before == null) {
                    result.imported();
                } else if (before.deleted()) {
                    result.updated();
                } else {
                    result.lineAdded();
                }
            } catch (BusinessException ex) {
                insertRejectedStaging(hash, rowNo, c, actor);
                updateStatus(hash, rowNo, ex.getErrorCode().name(), ex.getMessage(), null);
                result.reject(rowNo, ex.getErrorCode().name(), ex.getMessage(), c[0], sampleRawValue(c, ex));
            } catch (DuplicateKeyException ex) {
                insertRejectedStaging(hash, rowNo, c, actor);
                updateStatus(hash, rowNo, ErrorCode.CONFLICT.name(), ex.getMessage(), null);
                result.reject(rowNo, ErrorCode.CONFLICT.name(),
                        "창고이동 domain upsert 충돌: " + ex.getMostSpecificCause().getMessage(), c[0], c[0]);
            }
        }
        return result.build();
    }

    private UUID lookupWarehouse(String warehouseName, int rowNo, String fieldName) {
        String name = EcountCsvSupport.stripCell(warehouseName);
        List<UUID> rows = jdbcTemplate.query("""
                SELECT warehouse_uuid
                  FROM staging.ecount_warehouse_map
                 WHERE ecount_name = :name
                 ORDER BY updated_at DESC
                 LIMIT 2
                """, new MapSqlParameterSource("name", name),
                (rs, rowNum) -> (UUID) rs.getObject("warehouse_uuid"));
        if (rows.isEmpty()) {
            throw new BusinessException(ErrorCode.MIG5_WAREHOUSE_LOOKUP_MISS,
                    fieldName + " lookup miss: sourceRowNo=" + rowNo + ", warehouseName='" + name + "'");
        }
        if (rows.size() > 1) {
            throw new BusinessException(ErrorCode.MIG5_LOOKUP_AMBIGUOUS,
                    fieldName + " lookup ambiguous: sourceRowNo=" + rowNo + ", warehouseName='" + name + "'");
        }
        return rows.get(0);
    }

    private int parseQuantity(String raw, int rowNo) {
        try {
            return EcountMig5ImportSupport.parsePositiveQuantity(raw, rowNo);
        } catch (BusinessException ex) {
            if (ex.getErrorCode() == ErrorCode.MIG5_AMOUNT_INVALID) {
                throw new BusinessException(ErrorCode.MIG5_AMOUNT_INVALID,
                        "수량 형식 불일치: sourceRowNo=" + rowNo + ", sample='" + raw + "'", ex);
            }
            throw ex;
        }
    }

    private BigDecimal parseOptionalAmount(String raw, int rowNo) {
        try {
            return EcountMig5ImportSupport.parseAmount(raw, rowNo, true);
        } catch (BusinessException ex) {
            if (ex.getErrorCode() == ErrorCode.MIG5_AMOUNT_INVALID) {
                throw new BusinessException(ErrorCode.MIG5_AMOUNT_INVALID,
                        "금액 형식 불일치: sourceRowNo=" + rowNo + ", sample='" + raw + "'", ex);
            }
            throw ex;
        }
    }

    private UUID lookupProduct(String itemName, int rowNo) {
        String name = EcountCsvSupport.stripCell(itemName);
        Optional<ProductSummary> product = productLookupClient.findByProductNameStrict(name);
        if (product.isEmpty() || product.get().id() == null) {
            throw new BusinessException(ErrorCode.MIG5_PRODUCT_LOOKUP_MISS,
                    "품목 lookup miss: sourceRowNo=" + rowNo + ", itemName='" + name + "'");
        }
        return product.get().id();
    }

    private ExistingTransfer findTransfer(String transferNo) {
        List<ExistingTransfer> rows = jdbcTemplate.query("""
                SELECT id, is_deleted
                  FROM stock_transfers
                 WHERE transfer_no = :transferNo
                 ORDER BY CASE WHEN is_deleted = FALSE THEN 0 ELSE 1 END
                 LIMIT 1
                """, new MapSqlParameterSource("transferNo", transferNo),
                (rs, rowNum) -> new ExistingTransfer(
                        (UUID) rs.getObject("id"), rs.getBoolean("is_deleted")));
        return rows.isEmpty() ? null : rows.get(0);
    }

    private UUID upsertTransfer(String transferNo, UUID sourceWarehouseId, UUID destinationWarehouseId,
                                String memo, String actor) {
        return jdbcTemplate.queryForObject("""
                WITH restored AS (
                    UPDATE stock_transfers
                       SET source_warehouse_id = :sourceWarehouseId,
                           destination_warehouse_id = :destinationWarehouseId,
                           reason = 'REBALANCE',
                           reason_detail = :memo,
                           status = 'CONFIRMED',
                           requester_id = :actor,
                           approver_id = :actor,
                           requested_at = NOW(),
                           approved_at = NOW(),
                           shipped_at = NOW(),
                           received_at = NOW(),
                           confirmed_at = NOW(),
                           is_deleted = FALSE,
                           deleted_at = NULL,
                           deleted_by = NULL,
                           modified_at = NOW(),
                           modified_by = :actor
                     WHERE transfer_no = :transferNo AND is_deleted = TRUE
                     RETURNING id
                ), upserted AS (
                    INSERT INTO stock_transfers (
                      id, transfer_no, source_warehouse_id, destination_warehouse_id,
                      reason, reason_detail, status, requester_id, approver_id,
                      requested_at, approved_at, shipped_at, received_at, confirmed_at,
                      created_at, created_by, modified_at, modified_by, is_deleted
                    )
                    SELECT gen_random_uuid(), :transferNo, :sourceWarehouseId, :destinationWarehouseId,
                      'REBALANCE', :memo, 'CONFIRMED', :actor, :actor,
                      NOW(), NOW(), NOW(), NOW(), NOW(), NOW(), :actor, NOW(), :actor, FALSE
                    WHERE NOT EXISTS (SELECT 1 FROM restored)
                    ON CONFLICT (transfer_no) WHERE is_deleted = FALSE DO UPDATE SET
                      reason_detail = COALESCE(EXCLUDED.reason_detail, stock_transfers.reason_detail),
                      modified_at = NOW(),
                      modified_by = EXCLUDED.modified_by
                    RETURNING id
                )
                SELECT id FROM restored
                UNION ALL
                SELECT id FROM upserted
                LIMIT 1
                """, new MapSqlParameterSource()
                .addValue("transferNo", transferNo)
                .addValue("sourceWarehouseId", sourceWarehouseId)
                .addValue("destinationWarehouseId", destinationWarehouseId)
                .addValue("memo", EcountCsvSupport.nullIfBlank(memo))
                .addValue("actor", actor), UUID.class);
    }

    private void upsertLine(UUID transferId, UUID productId, int quantity, String actor) {
        jdbcTemplate.queryForObject("""
                WITH restored AS (
                    UPDATE stock_transfer_lines
                       SET requested_quantity = :quantity,
                           shipped_quantity = :quantity,
                           received_quantity = :quantity,
                           is_deleted = FALSE,
                           deleted_at = NULL,
                           deleted_by = NULL,
                           modified_at = NOW(),
                           modified_by = :actor
                     WHERE transfer_id = :transferId
                       AND product_id = :productId
                       AND requested_quantity = :quantity
                       AND is_deleted = TRUE
                     RETURNING id
                ), inserted AS (
                    INSERT INTO stock_transfer_lines (
                      id, transfer_id, product_id, requested_quantity, shipped_quantity, received_quantity,
                      created_at, created_by, modified_at, modified_by, is_deleted
                    )
                    SELECT gen_random_uuid(), :transferId, :productId, :quantity, :quantity, :quantity,
                      NOW(), :actor, NOW(), :actor, FALSE
                    WHERE NOT EXISTS (SELECT 1 FROM restored)
                    RETURNING id
                )
                SELECT id FROM restored
                UNION ALL
                SELECT id FROM inserted
                LIMIT 1
                """, new MapSqlParameterSource()
                .addValue("transferId", transferId)
                .addValue("productId", productId)
                .addValue("quantity", quantity)
                .addValue("actor", actor), UUID.class);
    }

    private boolean insertStaging(String hash, int rowNo, String[] c,
                                  EcountMig5ImportSupport.SlipKey transferKey,
                                  int quantity, BigDecimal amount, String actor) {
        int rows = jdbcTemplate.update("""
                INSERT INTO staging.ecount_stock_transfer_raw (
                  source_file_hash, source_row_no, transfer_no, transfer_date,
                  source_warehouse_name, destination_warehouse_name, item_name,
                  quantity, amount, memo, raw_payload, created_by, modified_by
                ) VALUES (
                  :hash, :row, :transferNo, :transferDate,
                  :sourceWarehouseName, :destinationWarehouseName, :itemName,
                  :quantity, :amount, :memo, :payload, :actor, :actor
                )
                ON CONFLICT (source_file_hash, source_row_no) DO NOTHING
                """, params(hash, rowNo, c, actor)
                .addValue("transferNo", transferKey.canonicalNo())
                .addValue("transferDate", transferKey.date())
                .addValue("quantity", quantity)
                .addValue("amount", amount));
        return rows > 0;
    }

    private void insertRejectedStaging(String hash, int rowNo, String[] c, String actor) {
        jdbcTemplate.update("""
                INSERT INTO staging.ecount_stock_transfer_raw (
                  source_file_hash, source_row_no, transfer_no, source_warehouse_name,
                  destination_warehouse_name, item_name, memo, raw_payload, transform_status,
                  created_by, modified_by
                ) VALUES (
                  :hash, :row, :rawTransferNo, :sourceWarehouseName,
                  :destinationWarehouseName, :itemName, :memo, :payload, 'REJECTED',
                  :actor, :actor
                )
                ON CONFLICT (source_file_hash, source_row_no) DO NOTHING
                """, params(hash, rowNo, c, actor));
    }

    private MapSqlParameterSource params(String hash, int rowNo, String[] c, String actor) {
        return new MapSqlParameterSource()
                .addValue("hash", hash)
                .addValue("row", rowNo)
                .addValue("rawTransferNo", EcountCsvSupport.nullIfBlank(c[0]))
                .addValue("sourceWarehouseName", EcountCsvSupport.nullIfBlank(c[1]))
                .addValue("destinationWarehouseName", EcountCsvSupport.nullIfBlank(c[2]))
                .addValue("itemName", EcountCsvSupport.nullIfBlank(c[3]))
                .addValue("memo", EcountCsvSupport.nullIfBlank(c[6]))
                .addValue("payload", String.join("\u001F", c))
                .addValue("actor", actor);
    }

    private void updateStatus(String hash, int rowNo, String status, String reason, String targetTransferNo) {
        jdbcTemplate.update("""
                UPDATE staging.ecount_stock_transfer_raw
                   SET transform_status = :status,
                       reject_reason = :reason,
                       target_transfer_no = :targetTransferNo,
                       modified_at = NOW()
                 WHERE source_file_hash = :hash AND source_row_no = :row
                """, new MapSqlParameterSource()
                .addValue("hash", hash)
                .addValue("row", rowNo)
                .addValue("status", status)
                .addValue("reason", reason)
                .addValue("targetTransferNo", targetTransferNo));
    }

    private void acquireImportLock(String sourceFileHash) {
        jdbcTemplate.queryForObject("SELECT pg_advisory_xact_lock(:lockKey)",
                new MapSqlParameterSource("lockKey",
                        EcountCsvSupport.advisoryLockKey(IMPORT_LOCK_NAMESPACE, sourceFileHash)),
                Object.class);
    }

    private static String sampleRawValue(String[] c, BusinessException ex) {
        return switch (ex.getErrorCode()) {
            case MIG5_AMOUNT_INVALID -> ex.getMessage() != null && ex.getMessage().startsWith("금액") ? c[5] : c[4];
            case MIG5_DATE_INVALID -> c[0];
            case MIG5_WAREHOUSE_LOOKUP_MISS -> warehouseSample(c, ex);
            case MIG5_PRODUCT_LOOKUP_MISS -> c[3];
            // MIG5_LOOKUP_MISS는 Expense/Deposit importer와 공유하는 enum이며 본 importer에서는 사용하지 않는다.
            case MIG5_LOOKUP_AMBIGUOUS -> lookupAmbiguousSample(c, ex);
            default -> String.join("\u001F", c);
        };
    }

    private static String warehouseSample(String[] c, BusinessException ex) {
        return ex.getMessage() != null && ex.getMessage().startsWith("입고창고명") ? c[2] : c[1];
    }

    private static String lookupAmbiguousSample(String[] c, BusinessException ex) {
        String message = ex.getMessage();
        if (message != null && message.startsWith("입고창고명")) {
            return c[2];
        }
        if (message != null && message.startsWith("출고창고명")) {
            return c[1];
        }
        return c[3];
    }

    private record ExistingTransfer(UUID id, boolean deleted) {
    }
}
