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
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** MIG-4 — 이카운트 세금계산서용 출고전표 CSV → TaxInvoice OUTBOUND import. */
@Service
@RequiredArgsConstructor
public class EcountTaxInvoiceImporter {

    private static final UUID IMPORT_LOCK_NAMESPACE =
            UUID.fromString("a40b85a8-9c91-4a20-89f0-09641f8478f1");
    public static final String[] HEADERS = {
            "거래처코드", "종사업장번호", "거래처명", "대표자명", "주소1", "업태", "종목", "Email",
            "공급가액", "부가세", "일자", "품목명[규격]", "수량", "단가", "회계전표일자-No."
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
        Map<String, UUID> invoiceIds = new LinkedHashMap<>();
        Set<String> seenLineKeys = new HashSet<>();

        for (int i = 0; i < parsed.dataRows().size(); i++) {
            int rowNo = i + 1;
            String[] c = EcountCsvSupport.normalizeRow(parsed.dataRows().get(i), HEADERS.length);
            try {
                BigDecimal supply = EcountMig4ImportSupport.parsePositiveAmount(c[8], rowNo);
                BigDecimal vat = EcountMig4ImportSupport.parseAmount(c[9], rowNo);
                LocalDate issueDate = EcountMig4ImportSupport.parseDate(c[10], rowNo);
                BigDecimal quantity = EcountMig4ImportSupport.parsePositiveAmount(c[12], rowNo);
                BigDecimal unitPrice = EcountMig4ImportSupport.parsePositiveAmount(c[13], rowNo);
                String relatedSlipNo = normalizeOptionalSlipNo(c[14], rowNo);
                if (!insertStaging(hash, rowNo, c, supply, vat, issueDate, quantity, unitPrice,
                        relatedSlipNo, actor)) {
                    result.skipped();
                    continue;
                }

                PartnerSummary partner = lookupPartner(c[0], c[2], rowNo);
                String groupKey = partner.partnerCode() + "|" + issueDate;
                String lineKey = groupKey + "|" + EcountCsvSupport.stripCell(c[11]) + "|"
                        + supply + "|" + vat + "|" + EcountCsvSupport.stripCell(c[14]);
                if (!seenLineKeys.add(lineKey)) {
                    throw new BusinessException(ErrorCode.MIG4_TAX_INVOICE_DUPLICATE,
                            "동일 파일 내 세금계산서 라인 중복: sourceRowNo=" + rowNo
                                    + ", partnerCode=" + partner.partnerCode()
                                    + ", issueDate=" + issueDate);
                }
                UUID invoiceId = invoiceIds.computeIfAbsent(groupKey,
                        ignored -> upsertInvoice(hash, rowNo, partner, c, issueDate, actor));
                int lineNo = nextTaxInvoiceLineNo(invoiceId);
                insertLine(invoiceId, lineNo, c[11], quantity, unitPrice, supply, vat,
                        relatedSlipNo, actor);
                addTaxInvoiceTotals(invoiceId, supply, vat, actor);
                updateStatus(hash, rowNo, "IMPORTED", null, "MIG4-" + hash.substring(0, 12));
                result.imported();
            } catch (BusinessException ex) {
                insertRejectedStaging(hash, rowNo, c, actor);
                reject(hash, rowNo, ex.getErrorCode().name(), ex.getMessage());
                result.reject(rowNo, ex.getErrorCode().name(), ex.getMessage(), c[2], sampleRawValue(c, ex));
            }
        }
        EcountMig4ImportResult built = result.build();
        EcountMigMetricsSupport.recordImportResult(metricsRecorder, "mig-4", built);
        return built;
    }

    private PartnerSummary lookupPartner(String partnerCode, String partnerName, int rowNo) {
        Optional<PartnerSummary> byCode = partnerLookupClient.findByPartnerCode(EcountCsvSupport.stripCell(partnerCode));
        Optional<PartnerSummary> partner = byCode.isPresent()
                ? byCode
                : lookupPartnerName(partnerName);
        if (partner.isEmpty() || partner.get().partnerId() == null) {
            throw new BusinessException(ErrorCode.MIG4_LOOKUP_MISS,
                    "거래처 lookup miss: sourceRowNo=" + rowNo + ", partnerCode='"
                            + partnerCode + "', partnerName='" + partnerName + "'");
        }
        return partner.get();
    }

    private Optional<PartnerSummary> lookupPartnerName(String partnerName) {
        try {
            return partnerLookupClient.findByPartnerNameStrict(EcountCsvSupport.stripCell(partnerName));
        } catch (BusinessException ex) {
            if (ex.getErrorCode() == ErrorCode.MIG3_LOOKUP_AMBIGUOUS) {
                throw new BusinessException(ErrorCode.MIG4_LOOKUP_AMBIGUOUS,
                        "거래처명 lookup ambiguous: " + partnerName, ex);
            }
            throw ex;
        }
    }

    private UUID upsertInvoice(String hash, int rowNo, PartnerSummary partner, String[] c,
                               LocalDate issueDate, String actor) {
        String migrationKey = "MIG-4:" + hash + ":" + rowNo;
        return jdbcTemplate.queryForObject("""
                WITH restored AS (
                    UPDATE tax_invoices
                       SET partner_id = :partnerId,
                           partner_code = :partnerCode,
                           partner_business_no = :businessNo,
                           partner_name = :partnerName,
                           partner_address = :address,
                           supply_date = :supplyDate,
                           supply_amount = 0,
                           vat_amount = 0,
                           total_amount = 0,
                           is_deleted = FALSE,
                           deleted_at = NULL,
                           deleted_by = NULL,
                           modified_at = NOW(),
                           modified_by = :actor
                     WHERE description = :description AND is_deleted = TRUE
                     RETURNING id
                ), existing AS (
                    SELECT id
                      FROM tax_invoices
                     WHERE description = :description AND is_deleted = FALSE
                     LIMIT 1
                ), inserted AS (
                    INSERT INTO tax_invoices (
                      id, tax_invoice_no, partner_id, partner_code, partner_business_no, partner_name,
                      partner_address, supply_date, supply_amount, vat_amount, total_amount,
                      invoice_type, direction, status, description, created_at, created_by,
                      modified_at, modified_by, is_deleted, version
                    )
                    SELECT gen_random_uuid(), NULL, :partnerId, :partnerCode, :businessNo, :partnerName,
                      :address, :supplyDate, 0, 0, 0, 'SALES', 'OUTBOUND', 'MIGRATED', :description,
                      NOW(), :actor, NOW(), :actor, FALSE, 0
                    WHERE NOT EXISTS (SELECT 1 FROM restored)
                      AND NOT EXISTS (SELECT 1 FROM existing)
                    RETURNING id
                )
                SELECT id FROM restored
                UNION ALL
                SELECT id FROM existing
                UNION ALL
                SELECT id FROM inserted
                LIMIT 1
                """, new MapSqlParameterSource()
                .addValue("partnerId", partner.partnerId())
                .addValue("partnerCode", partner.partnerCode())
                .addValue("businessNo", partner.businessNo())
                .addValue("partnerName", partner.name() == null ? EcountCsvSupport.stripCell(c[2]) : partner.name())
                .addValue("address", partner.address() == null ? EcountCsvSupport.stripCell(c[4]) : partner.address())
                .addValue("supplyDate", issueDate)
                .addValue("description", migrationKey)
                .addValue("actor", actor), UUID.class);
    }

    private int nextTaxInvoiceLineNo(UUID invoiceId) {
        Integer value = jdbcTemplate.queryForObject("""
                SELECT COALESCE(MAX(line_no), 0) + 1
                  FROM tax_invoice_lines
                 WHERE tax_invoice_id = :invoiceId AND is_deleted = FALSE
                """, new MapSqlParameterSource("invoiceId", invoiceId), Integer.class);
        return value == null ? 1 : value;
    }

    private void insertLine(UUID invoiceId, int lineNo, String itemName, BigDecimal quantity,
                            BigDecimal unitPrice, BigDecimal supply, BigDecimal vat,
                            String relatedSlipNo, String actor) {
        jdbcTemplate.queryForObject("""
                WITH restored AS (
                    UPDATE tax_invoice_lines
                       SET item_name = :itemName,
                           quantity = :quantity,
                           unit_price = :unitPrice,
                           supply_amount = :supply,
                           vat_amount = :vat,
                           memo = :memo,
                           is_deleted = FALSE,
                           deleted_at = NULL,
                           deleted_by = NULL,
                           modified_at = NOW(),
                           modified_by = :actor
                     WHERE tax_invoice_id = :invoiceId AND line_no = :lineNo AND is_deleted = TRUE
                     RETURNING id
                ), upserted AS (
                    INSERT INTO tax_invoice_lines (
                      id, tax_invoice_id, line_no, item_name, spec, unit, quantity, unit_price,
                      supply_amount, vat_amount, memo, created_at, created_by, modified_at, modified_by,
                      is_deleted
                    )
                    SELECT gen_random_uuid(), :invoiceId, :lineNo, :itemName, NULL, NULL, :quantity, :unitPrice,
                      :supply, :vat, :memo, NOW(), :actor, NOW(), :actor, FALSE
                    WHERE NOT EXISTS (SELECT 1 FROM restored)
                    ON CONFLICT (tax_invoice_id, line_no) DO UPDATE SET
                      item_name = EXCLUDED.item_name,
                      quantity = EXCLUDED.quantity,
                      unit_price = EXCLUDED.unit_price,
                      supply_amount = EXCLUDED.supply_amount,
                      vat_amount = EXCLUDED.vat_amount,
                      memo = EXCLUDED.memo,
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
                .addValue("invoiceId", invoiceId)
                .addValue("lineNo", lineNo)
                .addValue("itemName", EcountCsvSupport.stripCell(itemName))
                .addValue("quantity", quantity)
                .addValue("unitPrice", unitPrice)
                .addValue("supply", supply)
                .addValue("vat", vat)
                .addValue("memo", relatedSlipNo == null ? null : "회계전표:" + relatedSlipNo)
                .addValue("actor", actor), UUID.class);
    }

    private void addTaxInvoiceTotals(UUID invoiceId, BigDecimal supply, BigDecimal vat, String actor) {
        jdbcTemplate.update("""
                UPDATE tax_invoices
                   SET supply_amount = supply_amount + :supply,
                       vat_amount = vat_amount + :vat,
                       total_amount = total_amount + :supply + :vat,
                       modified_at = NOW(),
                       modified_by = :actor
                 WHERE id = :invoiceId
                """, new MapSqlParameterSource()
                .addValue("invoiceId", invoiceId)
                .addValue("supply", supply)
                .addValue("vat", vat)
                .addValue("actor", actor));
    }

    private boolean insertStaging(String hash, int rowNo, String[] c, BigDecimal supply, BigDecimal vat,
                                  LocalDate issueDate, BigDecimal quantity, BigDecimal unitPrice,
                                  String relatedSlipNo, String actor) {
        int rows = jdbcTemplate.update("""
                INSERT INTO staging.ecount_tax_invoice_raw (
                  source_file_hash, source_row_no, partner_code, biz_subno, partner_name,
                  representative, address, biz_type, biz_item, email, supply_amount, vat_amount,
                  issue_date, item_name, quantity, unit_price, related_slip_no, raw_payload,
                  created_by, modified_by
                ) VALUES (
                  :hash, :row, :partnerCode, :bizSubno, :partnerName, :representative, :address,
                  :bizType, :bizItem, :email, :supply, :vat, :issueDate, :itemName, :quantity,
                  :unitPrice, :relatedSlipNo, :payload, :actor, :actor
                )
                ON CONFLICT (source_file_hash, source_row_no) DO NOTHING
                """, stagingParams(hash, rowNo, c, actor)
                .addValue("supply", supply)
                .addValue("vat", vat)
                .addValue("issueDate", issueDate)
                .addValue("quantity", quantity)
                .addValue("unitPrice", unitPrice)
                .addValue("relatedSlipNo", relatedSlipNo));
        return rows > 0;
    }

    private void insertRejectedStaging(String hash, int rowNo, String[] c, String actor) {
        jdbcTemplate.update("""
                INSERT INTO staging.ecount_tax_invoice_raw (
                  source_file_hash, source_row_no, partner_code, biz_subno, partner_name,
                  representative, address, biz_type, biz_item, email, item_name, raw_payload,
                  transform_status, created_by, modified_by
                ) VALUES (
                  :hash, :row, :partnerCode, :bizSubno, :partnerName, :representative, :address,
                  :bizType, :bizItem, :email, :itemName, :payload, 'REJECTED', :actor, :actor
                )
                ON CONFLICT (source_file_hash, source_row_no) DO NOTHING
                """, stagingParams(hash, rowNo, c, actor));
    }

    private MapSqlParameterSource stagingParams(String hash, int rowNo, String[] c, String actor) {
        return new MapSqlParameterSource()
                .addValue("hash", hash)
                .addValue("row", rowNo)
                .addValue("partnerCode", EcountCsvSupport.nullIfBlank(c[0]))
                .addValue("bizSubno", EcountCsvSupport.nullIfBlank(c[1]))
                .addValue("partnerName", EcountCsvSupport.nullIfBlank(c[2]))
                .addValue("representative", EcountCsvSupport.nullIfBlank(c[3]))
                .addValue("address", EcountCsvSupport.nullIfBlank(c[4]))
                .addValue("bizType", EcountCsvSupport.nullIfBlank(c[5]))
                .addValue("bizItem", EcountCsvSupport.nullIfBlank(c[6]))
                .addValue("email", EcountCsvSupport.nullIfBlank(c[7]))
                .addValue("itemName", EcountCsvSupport.nullIfBlank(c[11]))
                .addValue("payload", String.join("\u001F", c))
                .addValue("actor", actor);
    }

    private void reject(String hash, int rowNo, String code, String reason) {
        jdbcTemplate.update("""
                UPDATE staging.ecount_tax_invoice_raw
                   SET transform_status = :code,
                       reject_reason = :reason,
                       modified_at = NOW()
                 WHERE source_file_hash = :hash AND source_row_no = :row
                """, new MapSqlParameterSource()
                .addValue("hash", hash)
                .addValue("row", rowNo)
                .addValue("code", code)
                .addValue("reason", reason));
    }

    private void updateStatus(String hash, int rowNo, String status, String reason, String target) {
        jdbcTemplate.update("""
                UPDATE staging.ecount_tax_invoice_raw
                   SET transform_status = :status,
                       reject_reason = :reason,
                       target_tax_invoice_no = :target,
                       modified_at = NOW()
                 WHERE source_file_hash = :hash AND source_row_no = :row
                """, new MapSqlParameterSource()
                .addValue("hash", hash)
                .addValue("row", rowNo)
                .addValue("status", status)
                .addValue("reason", reason)
                .addValue("target", target));
    }

    private void acquireImportLock(String sourceFileHash) {
        jdbcTemplate.queryForObject("SELECT pg_advisory_xact_lock(:lockKey)",
                new MapSqlParameterSource("lockKey",
                        EcountCsvSupport.advisoryLockKey(IMPORT_LOCK_NAMESPACE, sourceFileHash)),
                Object.class);
    }

    private String normalizeOptionalSlipNo(String raw, int rowNo) {
        if (EcountCsvSupport.stripCell(raw).isBlank()) {
            return null;
        }
        return EcountMig4ImportSupport.parseSlipKey(raw, rowNo).canonicalSlipNo();
    }

    private static String sampleRawValue(String[] c, BusinessException ex) {
        return switch (ex.getErrorCode()) {
            case MIG4_AMOUNT_INVALID -> c[8];
            case MIG4_DATE_INVALID -> c[10];
            case MIG4_SLIP_NO_INVALID -> c[14];
            case MIG4_LOOKUP_MISS, MIG4_LOOKUP_AMBIGUOUS -> c[2];
            default -> String.join("\u001F", c);
        };
    }
}
