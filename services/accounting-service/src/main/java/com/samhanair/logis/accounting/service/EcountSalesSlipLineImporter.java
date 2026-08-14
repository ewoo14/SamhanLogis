package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.web.dto.EcountMig4ImportResult;
import com.samhanair.logis.common.ecount.EcountCsvSupport;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.io.InputStream;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
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

/** MIG-4 — 이카운트 출고전표 CSV → SalesAccountingSlipLine 보강 import. */
@Service
@RequiredArgsConstructor
public class EcountSalesSlipLineImporter {

    private static final UUID IMPORT_LOCK_NAMESPACE =
            UUID.fromString("d47122c2-cc2d-42b5-b9b7-1409b6956611");
    public static final String[] HEADERS = {
            "일자-No.", "거래처코드", "거래처명", "품목명[규격]", "수량", "단가",
            "공급가액", "부가세", "합계", "입금예정일"
    };

    private final NamedParameterJdbcTemplate jdbcTemplate;
    private final PartnerLookupClient partnerLookupClient;
    @Autowired(required = false)
    private MigOpsMetricsRecorder metricsRecorder;

    @Transactional(propagation = Propagation.REQUIRES_NEW, isolation = Isolation.READ_COMMITTED)
    public EcountMig4ImportResult importCsv(InputStream csv, String actorUserId) {
        byte[] content = EcountCsvSupport.readRequired(csv);
        String hash = EcountCsvSupport.computeFileHash(content);
        acquireImportLock(hash);
        EcountCsvSupport.ParsedCsv parsed = EcountCsvSupport.parse(content);
        EcountMig4ImportSupport.validateHeader(parsed.header(), HEADERS);

        EcountMig4ImportResult.Builder result =
                EcountMig4ImportResult.builder(parsed.dataRows().size(), hash);
        String actor = EcountMig4ImportSupport.actor(actorUserId);

        for (int i = 0; i < parsed.dataRows().size(); i++) {
            int rowNo = i + 1;
            String[] c = EcountCsvSupport.normalizeRow(parsed.dataRows().get(i), HEADERS.length);
            try {
                EcountMig4ImportSupport.SlipKey slipKey = EcountMig4ImportSupport.parseSlipKey(c[0], rowNo);
                BigDecimal quantity = EcountMig4ImportSupport.parsePositiveAmount(c[4], rowNo);
                BigDecimal unitPrice = EcountMig4ImportSupport.parsePositiveAmount(c[5], rowNo);
                BigDecimal supply = EcountMig4ImportSupport.parsePositiveAmount(c[6], rowNo);
                BigDecimal vat = EcountMig4ImportSupport.parseAmount(c[7], rowNo);
                BigDecimal total = EcountMig4ImportSupport.parsePositiveAmount(c[8], rowNo);
                LocalDate dueDate = EcountMig4ImportSupport.parseDueDate(c[9], slipKey.date(), rowNo);
                if (!insertStaging(hash, rowNo, c, slipKey, quantity, unitPrice, supply, vat,
                        total, dueDate, actor)) {
                    result.skipped();
                    continue;
                }
                PartnerSummary partner = lookupPartner(c[1], c[2], rowNo);
                ExistingSlip existingSlip = findSlip(slipKey);
                UUID slipId = existingSlip == null
                        ? insertSlip(slipKey.canonicalSlipNo(), slipKey.date(), partner, dueDate, actor)
                        : restoreAndUpdateSlip(existingSlip, partner, dueDate, actor, result);
                int lineNo = nextLineNo(slipId);
                insertLine(slipId, lineNo, c[3], quantity, unitPrice, supply, vat, total, actor);
                recalcSlipTotals(slipId, actor);
                updateStatus(hash, rowNo, existingSlip == null ? "IMPORTED" : "UPDATED",
                        null, existingSlip == null ? slipKey.canonicalSlipNo() : existingSlip.slipNo());
                if (existingSlip == null) {
                    result.imported();
                    result.unlinkedSlip();
                } else {
                    result.updated();
                    result.linkedSlip();
                }
            } catch (BusinessException ex) {
                insertRejectedStaging(hash, rowNo, c, actor);
                reject(hash, rowNo, ex.getErrorCode().name(), ex.getMessage());
                result.reject(rowNo, ex.getErrorCode().name(), ex.getMessage(), c[0], sampleRawValue(c, ex));
            } catch (DuplicateKeyException ex) {
                insertRejectedStaging(hash, rowNo, c, actor);
                reject(hash, rowNo, ErrorCode.CONFLICT.name(), ex.getMessage());
                result.reject(rowNo, ErrorCode.CONFLICT.name(),
                        "출고전표 line upsert 충돌: " + ex.getMostSpecificCause().getMessage(), c[0], c[0]);
            }
        }
        EcountMig4ImportResult built = result.build();
        EcountMigMetricsSupport.recordImportResult(metricsRecorder, "mig-4", built);
        return built;
    }

    private PartnerSummary lookupPartner(String partnerCode, String partnerName, int rowNo) {
        Optional<PartnerSummary> partner = partnerLookupClient.findByPartnerCode(EcountCsvSupport.stripCell(partnerCode));
        if (partner.isEmpty()) {
            try {
                partner = partnerLookupClient.findByPartnerNameStrict(EcountCsvSupport.stripCell(partnerName));
            } catch (BusinessException ex) {
                if (ex.getErrorCode() == ErrorCode.MIG3_LOOKUP_AMBIGUOUS) {
                    throw new BusinessException(ErrorCode.MIG4_LOOKUP_AMBIGUOUS,
                            "거래처명 lookup ambiguous: " + partnerName, ex);
                }
                throw ex;
            }
        }
        if (partner.isEmpty() || partner.get().partnerId() == null) {
            throw new BusinessException(ErrorCode.MIG4_LOOKUP_MISS,
                    "거래처 lookup miss: sourceRowNo=" + rowNo + ", partnerCode='"
                            + partnerCode + "', partnerName='" + partnerName + "'");
        }
        return partner.get();
    }

    private ExistingSlip findSlip(EcountMig4ImportSupport.SlipKey slipKey) {
        List<ExistingSlip> rows = jdbcTemplate.query("""
                SELECT id, slip_no, is_deleted, partner_code, partner_name
                  FROM sales_accounting_slips
                 WHERE slip_no IN (:canonical, :legacy)
                 ORDER BY CASE WHEN is_deleted = FALSE THEN 0 ELSE 1 END
                 LIMIT 1
                """, new MapSqlParameterSource()
                .addValue("canonical", slipKey.canonicalSlipNo())
                .addValue("legacy", slipKey.legacySlipNo()),
                (rs, rowNum) -> new ExistingSlip(
                        (UUID) rs.getObject("id"), rs.getString("slip_no"), rs.getBoolean("is_deleted"),
                        rs.getString("partner_code"), rs.getString("partner_name")));
        return rows.isEmpty() ? null : rows.get(0);
    }

    private UUID insertSlip(String slipNo, LocalDate slipDate, PartnerSummary partner,
                            LocalDate dueDate, String actor) {
        return jdbcTemplate.queryForObject("""
                WITH restored AS (
                    UPDATE sales_accounting_slips
                       SET slip_date = :slipDate,
                           partner_id = :partnerId,
                           partner_code = :partnerCode,
                           partner_name = :partnerName,
                           due_date = :dueDate,
                           is_deleted = FALSE,
                           deleted_at = NULL,
                           deleted_by = NULL,
                           modified_at = NOW(),
                           modified_by = :actor
                     WHERE slip_no = :slipNo AND is_deleted = TRUE
                     RETURNING id
                ), upserted AS (
                    INSERT INTO sales_accounting_slips (
                      id, slip_no, slip_date, partner_id, partner_code, partner_name, tax_type, status,
                      total_supply_amount, total_vat_amount, total_amount, posted_at, posted_by,
                      due_date, memo, created_at, created_by, modified_at, modified_by, is_deleted, version
                    )
                    SELECT gen_random_uuid(), :slipNo, :slipDate, :partnerId, :partnerCode, :partnerName,
                      'TAXABLE', 'POSTED', 0, 0, 0, NOW(), :actor, :dueDate, 'MIG-4 신규',
                      NOW(), :actor, NOW(), :actor, FALSE, 0
                    WHERE NOT EXISTS (SELECT 1 FROM restored)
                    ON CONFLICT (slip_no) DO UPDATE SET
                      due_date = COALESCE(EXCLUDED.due_date, sales_accounting_slips.due_date),
                      is_deleted = FALSE,
                      deleted_at = NULL,
                      deleted_by = NULL,
                      modified_at = NOW(),
                      modified_by = EXCLUDED.created_by
                    RETURNING id
                )
                SELECT id FROM restored
                UNION ALL
                SELECT id FROM upserted
                LIMIT 1
                """, slipParams(slipNo, slipDate, partner, dueDate, actor), UUID.class);
    }

    private UUID restoreAndUpdateSlip(ExistingSlip slip, PartnerSummary partner,
                                      LocalDate dueDate, String actor, EcountMig4ImportResult.Builder result) {
        if (slip.deleted()) {
            jdbcTemplate.update("""
                    UPDATE sales_accounting_slips
                       SET partner_id = :partnerId,
                           partner_code = :partnerCode,
                           partner_name = :partnerName,
                           due_date = COALESCE(:dueDate, due_date),
                           is_deleted = FALSE,
                           deleted_at = NULL,
                           deleted_by = NULL,
                           modified_at = NOW(),
                           modified_by = :actor
                     WHERE id = :id
                    """, new MapSqlParameterSource()
                    .addValue("id", slip.id())
                    .addValue("partnerId", partner.partnerId())
                    .addValue("partnerCode", partner.partnerCode())
                    .addValue("partnerName", partner.name())
                    .addValue("dueDate", dueDate)
                    .addValue("actor", actor));
        } else {
            jdbcTemplate.update("""
                    UPDATE sales_accounting_slips
                       SET due_date = COALESCE(:dueDate, due_date),
                           modified_at = NOW(),
                           modified_by = :actor
                     WHERE id = :id
                    """, new MapSqlParameterSource()
                    .addValue("id", slip.id())
                    .addValue("dueDate", dueDate)
                    .addValue("actor", actor));
            if (partnerMismatch(slip, partner)) {
                result.mismatch(slip.slipNo(), partner.partnerCode(), slip.partnerCode(),
                        "기존 active 출고전표 거래처 정보는 덮어쓰지 않습니다");
            }
        }
        return slip.id();
    }

    private MapSqlParameterSource slipParams(String slipNo, LocalDate slipDate, PartnerSummary partner,
                                             LocalDate dueDate, String actor) {
        return new MapSqlParameterSource()
                .addValue("slipNo", slipNo)
                .addValue("slipDate", slipDate)
                .addValue("partnerId", partner.partnerId())
                .addValue("partnerCode", partner.partnerCode())
                .addValue("partnerName", partner.name())
                .addValue("dueDate", dueDate)
                .addValue("actor", actor);
    }

    private int nextLineNo(UUID slipId) {
        Integer value = jdbcTemplate.queryForObject("""
                SELECT COALESCE(MAX(line_no), 0) + 1
                  FROM sales_accounting_slip_lines
                 WHERE slip_id = :slipId AND is_deleted = FALSE
                """, new MapSqlParameterSource("slipId", slipId), Integer.class);
        return value == null ? 1 : value;
    }

    private void insertLine(UUID slipId, int lineNo, String itemName, BigDecimal quantity,
                            BigDecimal unitPrice, BigDecimal supply, BigDecimal vat,
                            BigDecimal total, String actor) {
        jdbcTemplate.queryForObject("""
                WITH restored AS (
                    UPDATE sales_accounting_slip_lines
                       SET product_code = 'MIG4',
                           product_name = :itemName,
                           qty = :quantity,
                           unit_price = :unitPrice,
                           supply_amount = :supply,
                           vat_amount = :vat,
                           line_total = :total,
                           is_deleted = FALSE,
                           deleted_at = NULL,
                           deleted_by = NULL,
                           modified_at = NOW(),
                           modified_by = :actor
                     WHERE slip_id = :slipId AND line_no = :lineNo AND is_deleted = TRUE
                     RETURNING id
                ), upserted AS (
                    INSERT INTO sales_accounting_slip_lines (
                      id, slip_id, line_no, product_code, product_name, qty, unit_price,
                      supply_amount, vat_amount, line_total, created_at, created_by,
                      modified_at, modified_by, is_deleted, version
                    )
                    SELECT gen_random_uuid(), :slipId, :lineNo, 'MIG4', :itemName, :quantity, :unitPrice,
                      :supply, :vat, :total, NOW(), :actor, NOW(), :actor, FALSE, 0
                    WHERE NOT EXISTS (SELECT 1 FROM restored)
                    ON CONFLICT (slip_id, line_no) DO UPDATE SET
                      product_code = EXCLUDED.product_code,
                      product_name = EXCLUDED.product_name,
                      qty = EXCLUDED.qty,
                      unit_price = EXCLUDED.unit_price,
                      supply_amount = EXCLUDED.supply_amount,
                      vat_amount = EXCLUDED.vat_amount,
                      line_total = EXCLUDED.line_total,
                      is_deleted = FALSE,
                      deleted_at = NULL,
                      deleted_by = NULL,
                      modified_at = NOW(),
                      modified_by = EXCLUDED.modified_by
                    RETURNING id
                )
                SELECT id FROM restored
                UNION ALL
                SELECT id FROM upserted
                LIMIT 1
                """, new MapSqlParameterSource()
                .addValue("slipId", slipId)
                .addValue("lineNo", lineNo)
                .addValue("itemName", EcountCsvSupport.stripCell(itemName))
                .addValue("quantity", quantity)
                .addValue("unitPrice", unitPrice)
                .addValue("supply", supply)
                .addValue("vat", vat)
                .addValue("total", total)
                .addValue("actor", actor), UUID.class);
    }

    private void recalcSlipTotals(UUID slipId, String actor) {
        jdbcTemplate.update("""
                UPDATE sales_accounting_slips s
                   SET total_supply_amount = x.supply,
                       total_vat_amount = x.vat,
                       total_amount = x.total,
                       modified_at = NOW(),
                       modified_by = :actor
                  FROM (
                      SELECT slip_id, SUM(supply_amount) supply, SUM(vat_amount) vat, SUM(line_total) total
                        FROM sales_accounting_slip_lines
                       WHERE slip_id = :slipId AND is_deleted = FALSE
                       GROUP BY slip_id
                  ) x
                 WHERE s.id = x.slip_id
                """, new MapSqlParameterSource("slipId", slipId).addValue("actor", actor));
    }

    private boolean insertStaging(String hash, int rowNo, String[] c, EcountMig4ImportSupport.SlipKey slipKey,
                                  BigDecimal quantity, BigDecimal unitPrice, BigDecimal supply,
                                  BigDecimal vat, BigDecimal total, LocalDate dueDate, String actor) {
        int rows = jdbcTemplate.update("""
                INSERT INTO staging.ecount_sales_slip_line_raw (
                  source_file_hash, source_row_no, slip_no, legacy_slip_no, slip_date,
                  partner_code, partner_name, item_name, quantity, unit_price, supply_amount,
                  vat_amount, total_amount, due_date, raw_payload, created_by, modified_by
                ) VALUES (
                  :hash, :row, :slipNo, :legacySlipNo, :slipDate, :partnerCode, :partnerName,
                  :itemName, :quantity, :unitPrice, :supply, :vat, :total, :dueDate, :payload,
                  :actor, :actor
                )
                ON CONFLICT (source_file_hash, source_row_no) DO NOTHING
                """, stagingParams(hash, rowNo, c, actor)
                .addValue("slipNo", slipKey.canonicalSlipNo())
                .addValue("legacySlipNo", slipKey.legacySlipNo())
                .addValue("slipDate", slipKey.date())
                .addValue("quantity", quantity)
                .addValue("unitPrice", unitPrice)
                .addValue("supply", supply)
                .addValue("vat", vat)
                .addValue("total", total)
                .addValue("dueDate", dueDate));
        return rows > 0;
    }

    private void insertRejectedStaging(String hash, int rowNo, String[] c, String actor) {
        jdbcTemplate.update("""
                INSERT INTO staging.ecount_sales_slip_line_raw (
                  source_file_hash, source_row_no, partner_code, partner_name, item_name,
                  raw_payload, transform_status, created_by, modified_by
                ) VALUES (
                  :hash, :row, :partnerCode, :partnerName, :itemName, :payload,
                  'REJECTED', :actor, :actor
                )
                ON CONFLICT (source_file_hash, source_row_no) DO NOTHING
                """, stagingParams(hash, rowNo, c, actor));
    }

    private MapSqlParameterSource stagingParams(String hash, int rowNo, String[] c, String actor) {
        return new MapSqlParameterSource()
                .addValue("hash", hash)
                .addValue("row", rowNo)
                .addValue("partnerCode", EcountCsvSupport.nullIfBlank(c[1]))
                .addValue("partnerName", EcountCsvSupport.nullIfBlank(c[2]))
                .addValue("itemName", EcountCsvSupport.nullIfBlank(c[3]))
                .addValue("payload", String.join("\u001F", c))
                .addValue("actor", actor);
    }

    private void reject(String hash, int rowNo, String code, String reason) {
        updateStatus(hash, rowNo, code, reason, null);
    }

    private void updateStatus(String hash, int rowNo, String status, String reason, String targetSlipNo) {
        jdbcTemplate.update("""
                UPDATE staging.ecount_sales_slip_line_raw
                   SET transform_status = :status,
                       reject_reason = :reason,
                       target_slip_no = :targetSlipNo,
                       modified_at = NOW()
                 WHERE source_file_hash = :hash AND source_row_no = :row
                """, new MapSqlParameterSource()
                .addValue("hash", hash)
                .addValue("row", rowNo)
                .addValue("status", status)
                .addValue("reason", reason)
                .addValue("targetSlipNo", targetSlipNo));
    }

    private void acquireImportLock(String sourceFileHash) {
        jdbcTemplate.queryForObject("SELECT pg_advisory_xact_lock(:lockKey)",
                new MapSqlParameterSource("lockKey",
                        EcountCsvSupport.advisoryLockKey(IMPORT_LOCK_NAMESPACE, sourceFileHash)),
                Object.class);
    }

    private static String sampleRawValue(String[] c, BusinessException ex) {
        return switch (ex.getErrorCode()) {
            case MIG4_AMOUNT_INVALID -> c[6];
            case MIG4_DATE_INVALID -> c[9];
            case MIG4_SLIP_NO_INVALID -> c[0];
            case MIG4_LOOKUP_MISS, MIG4_LOOKUP_AMBIGUOUS -> c[2];
            default -> String.join("\u001F", c);
        };
    }

    private static boolean partnerMismatch(ExistingSlip slip, PartnerSummary partner) {
        return !java.util.Objects.equals(slip.partnerCode(), partner.partnerCode())
                || !java.util.Objects.equals(slip.partnerName(), partner.name());
    }

    private record ExistingSlip(UUID id, String slipNo, boolean deleted, String partnerCode, String partnerName) {
    }
}
