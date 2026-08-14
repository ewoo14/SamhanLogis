package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.web.dto.EcountMig4ImportResult;
import com.samhanair.logis.common.ecount.EcountCsvSupport;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.io.InputStream;
import java.math.BigDecimal;
import java.time.LocalDate;
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

/** MIG-4 — 이카운트 주문서 CSV staging import + 출고전표 연결 검증. */
@Service
@RequiredArgsConstructor
public class EcountOrderImporter {

    private static final UUID IMPORT_LOCK_NAMESPACE =
            UUID.fromString("f33b4bc0-3926-4a4d-87c9-18f43b6cfe3d");
    private static final Set<String> ALLOWED_STATUSES = Set.of("완료", "진행", "취소", "대기");
    public static final String[] HEADERS = {
            "일자-No.", "거래처명", "담당자명", "유효기간", "결제조건", "참조", "진행상태",
            "품목명[규격]", "수량", "단가", "공급가액[외화]", "부가세", "품목별납기일자"
    };

    private final NamedParameterJdbcTemplate jdbcTemplate;
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
                EcountMig4ImportSupport.SlipKey orderKey = EcountMig4ImportSupport.parseSlipKey(c[0], rowNo);
                String status = EcountCsvSupport.stripCell(c[6]);
                if (!ALLOWED_STATUSES.contains(status)) {
                    throw new BusinessException(ErrorCode.MIG4_ORDER_STATUS_INVALID,
                            "주문서 진행상태 unknown: sourceRowNo=" + rowNo + ", sample='" + status + "'");
                }
                BigDecimal quantity = EcountMig4ImportSupport.parsePositiveAmount(c[8], rowNo);
                BigDecimal unitPrice = EcountMig4ImportSupport.parseAmount(c[9], rowNo);
                BigDecimal supply = EcountMig4ImportSupport.parseAmount(c[10], rowNo);
                BigDecimal vat = EcountMig4ImportSupport.parseAmount(c[11], rowNo);
                LocalDate itemDueDate = EcountMig4ImportSupport.parseOptionalDate(c[12], rowNo);
                if (!insertStaging(hash, rowNo, c, orderKey, status, quantity, unitPrice,
                        supply, vat, itemDueDate, actor)) {
                    result.skipped();
                    continue;
                }
                result.imported();
                if ("완료".equals(status)) {
                    if (existsSalesSlip(orderKey)) {
                        result.linkedSlip();
                    } else {
                        result.unlinkedSlip();
                    }
                }
            } catch (BusinessException ex) {
                insertRejectedStaging(hash, rowNo, c, actor);
                reject(hash, rowNo, ex.getErrorCode().name(), ex.getMessage());
                if (ex.getErrorCode() == ErrorCode.MIG4_ORDER_STATUS_INVALID) {
                    result.unknownStatus();
                    continue;
                }
                result.reject(rowNo, ex.getErrorCode().name(), ex.getMessage(), c[0], c[6]);
            }
        }
        EcountMig4ImportResult built = result.build();
        EcountMigMetricsSupport.recordImportResult(metricsRecorder, "mig-4", built);
        return built;
    }

    private boolean existsSalesSlip(EcountMig4ImportSupport.SlipKey key) {
        Integer count = jdbcTemplate.queryForObject("""
                SELECT COUNT(1)
                  FROM sales_accounting_slips
                 WHERE slip_no IN (:canonical, :legacy)
                   AND is_deleted = FALSE
                """, new MapSqlParameterSource()
                .addValue("canonical", key.canonicalSlipNo())
                .addValue("legacy", key.legacySlipNo()), Integer.class);
        return count != null && count > 0;
    }

    private boolean insertStaging(String hash, int rowNo, String[] c, EcountMig4ImportSupport.SlipKey orderKey,
                                  String status, BigDecimal quantity, BigDecimal unitPrice,
                                  BigDecimal supply, BigDecimal vat, LocalDate itemDueDate,
                                  String actor) {
        int rows = jdbcTemplate.update("""
                INSERT INTO staging.ecount_order_raw (
                  source_file_hash, source_row_no, order_no, legacy_order_no, order_date,
                  partner_name, manager_name, valid_until, payment_terms, reference, progress_status,
                  item_name, quantity, unit_price, supply_amount, vat_amount, item_due_date,
                  raw_payload, created_by, modified_by
                ) VALUES (
                  :hash, :row, :orderNo, :legacyOrderNo, :orderDate, :partnerName, :managerName,
                  :validUntil, :paymentTerms, :reference, :status, :itemName, :quantity, :unitPrice,
                  :supply, :vat, :itemDueDate, :payload, :actor, :actor
                )
                ON CONFLICT (source_file_hash, source_row_no) DO NOTHING
                """, params(hash, rowNo, c, actor)
                .addValue("orderNo", orderKey.canonicalSlipNo())
                .addValue("legacyOrderNo", orderKey.legacySlipNo())
                .addValue("orderDate", orderKey.date())
                .addValue("status", status)
                .addValue("quantity", quantity)
                .addValue("unitPrice", unitPrice)
                .addValue("supply", supply)
                .addValue("vat", vat)
                .addValue("itemDueDate", itemDueDate));
        return rows > 0;
    }

    private void insertRejectedStaging(String hash, int rowNo, String[] c, String actor) {
        jdbcTemplate.update("""
                INSERT INTO staging.ecount_order_raw (
                  source_file_hash, source_row_no, partner_name, manager_name, progress_status,
                  item_name, raw_payload, transform_status, created_by, modified_by
                ) VALUES (
                  :hash, :row, :partnerName, :managerName, :status, :itemName, :payload,
                  'REJECTED', :actor, :actor
                )
                ON CONFLICT (source_file_hash, source_row_no) DO NOTHING
                """, params(hash, rowNo, c, actor).addValue("status", EcountCsvSupport.nullIfBlank(c[6])));
    }

    private MapSqlParameterSource params(String hash, int rowNo, String[] c, String actor) {
        return new MapSqlParameterSource()
                .addValue("hash", hash)
                .addValue("row", rowNo)
                .addValue("partnerName", EcountCsvSupport.nullIfBlank(c[1]))
                .addValue("managerName", EcountCsvSupport.nullIfBlank(c[2]))
                .addValue("validUntil", EcountCsvSupport.nullIfBlank(c[3]))
                .addValue("paymentTerms", EcountCsvSupport.nullIfBlank(c[4]))
                .addValue("reference", EcountCsvSupport.nullIfBlank(c[5]))
                .addValue("itemName", EcountCsvSupport.nullIfBlank(c[7]))
                .addValue("payload", String.join("\u001F", c))
                .addValue("actor", actor);
    }

    private void reject(String hash, int rowNo, String code, String reason) {
        jdbcTemplate.update("""
                UPDATE staging.ecount_order_raw
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

    private void acquireImportLock(String sourceFileHash) {
        jdbcTemplate.queryForObject("SELECT pg_advisory_xact_lock(:lockKey)",
                new MapSqlParameterSource("lockKey",
                        EcountCsvSupport.advisoryLockKey(IMPORT_LOCK_NAMESPACE, sourceFileHash)),
                Object.class);
    }
}
