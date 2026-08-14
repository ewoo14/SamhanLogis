package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.web.dto.EcountVoucherImportResult;
import com.samhanair.logis.common.ecount.EcountCsvSupport;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.io.InputStream;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** MIG-3 매입/출고전표 공통 importer. */
@RequiredArgsConstructor
abstract class AbstractEcountSlipImporter {

    private final NamedParameterJdbcTemplate jdbcTemplate;
    private final PartnerLookupClient partnerLookupClient;
    @Autowired(required = false)
    private MigOpsMetricsRecorder metricsRecorder;

    protected abstract UUID namespace();
    protected abstract String[] headers();
    protected abstract String stagingTable();
    protected abstract String slipTable();
    protected abstract String lineTable();
    protected abstract String lineFkColumn();
    protected abstract String importKind();

    @Transactional(propagation = Propagation.REQUIRES_NEW, isolation = Isolation.READ_COMMITTED)
    public EcountVoucherImportResult importCsv(InputStream csv, String actorUserId) {
        byte[] content = EcountCsvSupport.readRequired(csv);
        String hash = EcountCsvSupport.computeFileHash(content);
        acquireImportLock(hash);
        EcountCsvSupport.ParsedCsv parsed = EcountCsvSupport.parse(content);
        EcountVoucherImportSupport.validateHeader(parsed.header(), headers());

        EcountVoucherImportResult.Builder result =
                EcountVoucherImportResult.builder(parsed.dataRows().size(), hash);
        Set<String> seenSlipNos = new HashSet<>();
        String actor = EcountVoucherImportSupport.actor(actorUserId);

        for (int i = 0; i < parsed.dataRows().size(); i++) {
            int rowNo = i + 1;
            String[] c = EcountCsvSupport.normalizeRow(parsed.dataRows().get(i), headers().length);
            String slipNo = null;
            try {
                slipNo = EcountVoucherImportSupport.normalizeVoucherNo(c[0], rowNo);
                LocalDate slipDate = EcountVoucherImportSupport.parseVoucherDate(c[0], rowNo);
                BigDecimal amount;
                try {
                    amount = EcountVoucherImportSupport.parsePositiveAmount(c[2], rowNo);
                } catch (BusinessException ex) {
                    if (ex.getErrorCode() != ErrorCode.MIG3_SLIP_AMOUNT_INVALID) {
                        throw ex;
                    }
                    insertStaging(hash, rowNo, c, slipNo, slipDate, null, actor);
                    reject(hash, rowNo, "MIG3_SLIP_AMOUNT_INVALID", ex.getMessage(), slipNo);
                    result.reject(rowNo, "MIG3_SLIP_AMOUNT_INVALID", ex.getMessage(), slipNo, c[2]);
                    continue;
                }
                if (!insertStaging(hash, rowNo, c, slipNo, slipDate, amount, actor)) {
                    result.skipped();
                    continue;
                }
                if (!seenSlipNos.add(slipNo)) {
                    reject(hash, rowNo, "MIG3_VOUCHER_NO_DUPLICATE", "동일 파일 내 전표번호 중복", slipNo);
                    result.reject(rowNo, "MIG3_VOUCHER_NO_DUPLICATE", "동일 파일 내 전표번호 중복", slipNo, c[0]);
                    continue;
                }
                Optional<PartnerSummary> partner = partnerLookupClient.findByPartnerNameStrict(c[3]);
                if (partner.isEmpty() || partner.get().partnerId() == null) {
                    String message = "거래처명 lookup miss: " + c[3];
                    reject(hash, rowNo, "MIG3_LOOKUP_MISS", message, slipNo);
                    result.reject(rowNo, "MIG3_LOOKUP_MISS", message, slipNo, c[3]);
                    continue;
                }
                EcountCsvSupport.requireMaxLength(slipNo, 50, "slip_no", rowNo);
                EcountCsvSupport.requireMaxLength(partner.get().partnerCode(), 100, "partner_code", rowNo);
                EcountCsvSupport.requireMaxLength(partner.get().name(), 200, "partner_name", rowNo);

                boolean activeExists = exists("SELECT COUNT(1) FROM " + slipTable()
                                + " WHERE slip_no = :slipNo AND is_deleted = FALSE",
                        new MapSqlParameterSource("slipNo", slipNo));
                boolean deletedExists = exists("SELECT COUNT(1) FROM " + slipTable()
                                + " WHERE slip_no = :slipNo AND is_deleted = TRUE",
                        new MapSqlParameterSource("slipNo", slipNo));
                UUID slipId = upsertSlip(slipNo, slipDate, partner.get(), amount, c[4], actor);
                upsertLine(slipId, amount, c[1], c[4], actor);
                updateStatus(hash, rowNo, activeExists || deletedExists ? "UPDATED" : "IMPORTED", null, slipNo);
                if (activeExists || deletedExists) {
                    result.updated();
                } else {
                    result.imported();
                }
                result.posted();
            } catch (BusinessException ex) {
                if (slipNo != null) {
                    reject(hash, rowNo, ex.getErrorCode().name(), ex.getMessage(), slipNo);
                }
                result.reject(rowNo, ex.getErrorCode().name(), ex.getMessage(), slipNo, sampleRawValue(c, ex));
            }
        }
        EcountVoucherImportResult built = result.build();
        EcountMigMetricsSupport.recordImportResult(metricsRecorder, "mig-3", built);
        return built;
    }

    private void acquireImportLock(String sourceFileHash) {
        jdbcTemplate.queryForObject("SELECT pg_advisory_xact_lock(:lockKey)",
                new MapSqlParameterSource("lockKey",
                        EcountCsvSupport.advisoryLockKey(namespace(), sourceFileHash)),
                Object.class);
    }

    private boolean insertStaging(String hash, int rowNo, String[] c, String slipNo,
                                  LocalDate slipDate, BigDecimal amount, String actor) {
        int rows = jdbcTemplate.update("""
                INSERT INTO %s (
                  source_file_hash, source_row_no, slip_no, transaction_date, transaction_type,
                  amount, partner_name, description, raw_payload, transform_status, imported_by
                ) VALUES (
                  :hash, :row, :slipNo, :date, :type, :amount, :partnerName, :description,
                  :payload, 'PENDING', :actor
                )
                ON CONFLICT (source_file_hash, source_row_no) DO NOTHING
                """.formatted(stagingTable()),
                new MapSqlParameterSource()
                        .addValue("hash", hash)
                        .addValue("row", rowNo)
                        .addValue("slipNo", slipNo)
                        .addValue("date", slipDate)
                        .addValue("type", EcountCsvSupport.nullIfBlank(c[1]))
                        .addValue("amount", amount)
                        .addValue("partnerName", EcountCsvSupport.nullIfBlank(c[3]))
                        .addValue("description", EcountCsvSupport.nullIfBlank(c[4]))
                        .addValue("payload", String.join("\u001F", c))
                        .addValue("actor", actor));
        return rows > 0;
    }

    private UUID upsertSlip(String slipNo, LocalDate slipDate, PartnerSummary partner,
                            BigDecimal amount, String memo, String actor) {
        return jdbcTemplate.queryForObject("""
                WITH restored AS (
                    UPDATE %s
                       SET slip_date = :slipDate,
                           partner_id = :partnerId,
                           partner_code = :partnerCode,
                           partner_name = :partnerName,
                           tax_type = 'TAXABLE',
                           status = 'POSTED',
                           total_supply_amount = :amount,
                           total_vat_amount = 0,
                           total_amount = :amount,
                           posted_at = NOW(),
                           posted_by = :actor,
                           memo = :memo,
                           is_deleted = FALSE,
                           deleted_at = NULL,
                           deleted_by = NULL,
                           modified_at = NOW(),
                           modified_by = :actor
                     WHERE slip_no = :slipNo AND is_deleted = TRUE
                     RETURNING id
                ), upserted AS (
                    INSERT INTO %s (
                      id, slip_no, slip_date, partner_id, partner_code, partner_name,
                      tax_type, status, total_supply_amount, total_vat_amount, total_amount,
                      posted_at, posted_by, memo, created_at, created_by, modified_at, modified_by,
                      is_deleted, version
                    )
                    SELECT gen_random_uuid(), :slipNo, :slipDate, :partnerId, :partnerCode, :partnerName,
                      'TAXABLE', 'POSTED', :amount, 0, :amount,
                      NOW(), :actor, :memo, NOW(), :actor, NOW(), :actor, FALSE, 0
                    WHERE NOT EXISTS (SELECT 1 FROM restored)
                    ON CONFLICT (slip_no) DO UPDATE SET
                      slip_date = EXCLUDED.slip_date,
                      partner_id = EXCLUDED.partner_id,
                      partner_code = EXCLUDED.partner_code,
                      partner_name = EXCLUDED.partner_name,
                      tax_type = EXCLUDED.tax_type,
                      status = EXCLUDED.status,
                      total_supply_amount = EXCLUDED.total_supply_amount,
                      total_vat_amount = EXCLUDED.total_vat_amount,
                      total_amount = EXCLUDED.total_amount,
                      posted_at = EXCLUDED.posted_at,
                      posted_by = EXCLUDED.posted_by,
                      memo = EXCLUDED.memo,
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
                """.formatted(slipTable(), slipTable()),
                new MapSqlParameterSource()
                        .addValue("slipNo", slipNo)
                        .addValue("slipDate", slipDate)
                        .addValue("partnerId", partner.partnerId())
                        .addValue("partnerCode", partner.partnerCode())
                        .addValue("partnerName", partner.name())
                        .addValue("amount", amount)
                        .addValue("memo", EcountCsvSupport.nullIfBlank(memo))
                        .addValue("actor", actor),
                UUID.class);
    }

    private void upsertLine(UUID slipId, BigDecimal amount, String transactionType, String description, String actor) {
        jdbcTemplate.update("""
                INSERT INTO %s (
                  id, %s, line_no, product_code, product_name, qty, unit_price,
                  supply_amount, vat_amount, line_total, created_at, created_by,
                  modified_at, modified_by, is_deleted, version
                ) VALUES (
                  gen_random_uuid(), :slipId, 1, 'MIGRATION', :productName, 1, :amount,
                  :amount, 0, :amount, NOW(), :actor, NOW(), :actor, FALSE, 0
                )
                ON CONFLICT (%s, line_no) DO UPDATE SET
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
                  modified_by = EXCLUDED.created_by
                """.formatted(lineTable(), lineFkColumn(), lineFkColumn()),
                new MapSqlParameterSource()
                        .addValue("slipId", slipId)
                        .addValue("productName", importKind() + " " + (EcountCsvSupport.nullIfBlank(description) == null
                                ? EcountCsvSupport.stripCell(transactionType)
                                : EcountCsvSupport.stripCell(description)))
                        .addValue("amount", amount)
                        .addValue("actor", actor));
    }

    private void updateStatus(String hash, int rowNo, String status, String reason, String targetSlipNo) {
        jdbcTemplate.update("""
                UPDATE %s
                   SET transform_status = :status,
                       reject_reason = :reason,
                       target_slip_no = :targetSlipNo
                 WHERE source_file_hash = :hash AND source_row_no = :row
                """.formatted(stagingTable()),
                new MapSqlParameterSource()
                        .addValue("status", status)
                        .addValue("reason", reason)
                        .addValue("targetSlipNo", targetSlipNo)
                        .addValue("hash", hash)
                        .addValue("row", rowNo));
    }

    private void reject(String hash, int rowNo, String code, String reason, String targetSlipNo) {
        updateStatus(hash, rowNo, code, reason, targetSlipNo);
    }

    private boolean exists(String sql, MapSqlParameterSource p) {
        Integer count = jdbcTemplate.queryForObject(sql, p, Integer.class);
        return count != null && count > 0;
    }

    private static String sampleRawValue(String[] c, BusinessException ex) {
        ErrorCode code = ex.getErrorCode();
        if (code == ErrorCode.MIG3_VOUCHER_NO_INVALID) {
            return c[0];
        }
        if (code == ErrorCode.MIG3_SLIP_AMOUNT_INVALID) {
            return c[2];
        }
        if (code == ErrorCode.MIG3_LOOKUP_MISS || code == ErrorCode.MIG3_LOOKUP_AMBIGUOUS) {
            return c[3];
        }
        return String.join("\u001F", c);
    }
}
