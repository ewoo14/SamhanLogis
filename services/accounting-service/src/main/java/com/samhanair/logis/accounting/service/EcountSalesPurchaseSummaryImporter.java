package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.web.dto.EcountMig4ImportResult;
import com.samhanair.logis.common.ecount.EcountCsvSupport;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.io.InputStream;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** MIG-4 — 이카운트 매출매입내역 CSV staging import + 도메인 합계 검증. */
@Service
@RequiredArgsConstructor
public class EcountSalesPurchaseSummaryImporter {

    private static final UUID IMPORT_LOCK_NAMESPACE =
            UUID.fromString("b4d2d3df-7ae6-44ed-a1f3-5d9d0eac908f");
    public static final String[] HEADERS = {
            "월/일", "유형명", "전자구분", "거래처명", "세부내역", "매입공급가액",
            "매입부가세", "매출공급가액", "매출부가세", "매출합계"
    };
    private static final String FOOTER_DIGIT = "[\\d０-９]";
    private static final String FOOTER_SPACE = "[\\s\\u00A0]";
    private static final Pattern MONTH_TOTAL_FOOTER = Pattern.compile(
            FOOTER_DIGIT + "{4}/" + FOOTER_DIGIT + "{2}" + FOOTER_SPACE + "*계"
                    + FOOTER_SPACE + "*\\(.*건.*");
    private static final Pattern CUMULATIVE_TOTAL_FOOTER = Pattern.compile(
            "누계" + FOOTER_SPACE + "*\\(.*건.*");
    private static final Pattern TIMESTAMP_FOOTER = Pattern.compile(
            FOOTER_DIGIT + "{4}/" + FOOTER_DIGIT + "{2}/" + FOOTER_DIGIT + "{2}"
                    + FOOTER_SPACE + "*(오전|오후).*");

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
            String[] raw = parsed.dataRows().get(i);
            String[] c = EcountCsvSupport.normalizeRow(raw, HEADERS.length);
            try {
                if (isFooterRow(raw)) {
                    result.skipped();
                    continue;
                }
                if (EcountCsvSupport.stripCell(c[0]).isBlank()) {
                    throw new BusinessException(ErrorCode.MIG4_DATE_INVALID,
                            "매출매입내역 일자가 비어 있습니다: sourceRowNo=" + rowNo);
                }
                LocalDate summaryDate = EcountMig4ImportSupport.parseSlipKey(c[0], rowNo).date();
                BigDecimal purchaseSupply = EcountMig4ImportSupport.parseAmount(c[5], rowNo);
                BigDecimal purchaseVat = EcountMig4ImportSupport.parseAmount(c[6], rowNo);
                BigDecimal salesSupply = EcountMig4ImportSupport.parseAmount(c[7], rowNo);
                BigDecimal salesVat = EcountMig4ImportSupport.parseAmount(c[8], rowNo);
                BigDecimal salesTotal = EcountMig4ImportSupport.parseAmount(c[9], rowNo);
                if (!insertStaging(hash, rowNo, c, summaryDate, purchaseSupply, purchaseVat,
                        salesSupply, salesVat, salesTotal, actor)) {
                    result.skipped();
                    continue;
                }
                result.imported();
            } catch (BusinessException ex) {
                insertRejectedStaging(hash, rowNo, c, actor);
                reject(hash, rowNo, ex.getErrorCode().name(), ex.getMessage());
                result.reject(rowNo, ex.getErrorCode().name(), ex.getMessage(), c[0], c[9]);
            }
        }
        validateAgainstDomain(hash, result);
        EcountMig4ImportResult built = result.build();
        EcountMigMetricsSupport.recordImportResult(metricsRecorder, "mig-4", built);
        return built;
    }

    public void validateAgainstDomain(String sourceFileHash, EcountMig4ImportResult.Builder result) {
        List<SummaryMismatch> rows = jdbcTemplate.query("""
                WITH raw_sales AS (
                    SELECT summary_date, COALESCE(SUM(sales_total), 0) raw_total
                      FROM staging.ecount_sales_purchase_summary_raw
                     WHERE source_file_hash = :hash
                       AND is_deleted = FALSE
                       AND transform_status = 'PENDING'
                     GROUP BY summary_date
                ), domain_sales AS (
                    SELECT slip_date, COALESCE(SUM(total_amount), 0) domain_total
                      FROM sales_accounting_slips
                     WHERE is_deleted = FALSE
                     GROUP BY slip_date
                )
                SELECT r.summary_date::text business_key, r.raw_total::text raw_value,
                       COALESCE(d.domain_total, 0)::text domain_value
                  FROM raw_sales r
                  LEFT JOIN domain_sales d ON d.slip_date = r.summary_date
                 WHERE r.raw_total <> COALESCE(d.domain_total, 0)
                 ORDER BY r.summary_date
                 LIMIT 5
                """, new MapSqlParameterSource("hash", sourceFileHash),
                (rs, rowNum) -> new SummaryMismatch(
                        rs.getString("business_key"),
                        rs.getString("raw_value"),
                        rs.getString("domain_value")));
        for (SummaryMismatch row : rows) {
            result.mismatch(row.businessKey(), row.rawValue(), row.domainValue(),
                    ErrorCode.MIG4_SUMMARY_BALANCE_MISMATCH.name()
                            + ": 매출매입내역 일별 매출 합계와 출고전표 합계가 다릅니다");
        }
    }

    private static boolean isFooterRow(String[] row) {
        if (row.length < 1) {
            return false;
        }
        return Arrays.stream(row)
                .allMatch(c -> c == null || EcountCsvSupport.stripCell(c).trim().isEmpty())
                || Arrays.stream(row).anyMatch(EcountSalesPurchaseSummaryImporter::isFooterCell);
    }

    private static boolean isFooterCell(String cell) {
        String value = cell == null ? "" : EcountCsvSupport.stripCell(cell).trim();
        if (value.isEmpty()) {
            return false;
        }
        return MONTH_TOTAL_FOOTER.matcher(value).matches()
                || CUMULATIVE_TOTAL_FOOTER.matcher(value).matches()
                || TIMESTAMP_FOOTER.matcher(value).matches();
    }

    private boolean insertStaging(String hash, int rowNo, String[] c, LocalDate summaryDate,
                                  BigDecimal purchaseSupply, BigDecimal purchaseVat,
                                  BigDecimal salesSupply, BigDecimal salesVat,
                                  BigDecimal salesTotal, String actor) {
        int rows = jdbcTemplate.update("""
                INSERT INTO staging.ecount_sales_purchase_summary_raw (
                  source_file_hash, source_row_no, month_day, summary_date, type_name,
                  electronic_type, partner_name, detail, purchase_supply, purchase_vat,
                  sales_supply, sales_vat, sales_total, raw_payload, created_by, modified_by
                ) VALUES (
                  :hash, :row, :monthDay, :summaryDate, :typeName, :electronicType,
                  :partnerName, :detail, :purchaseSupply, :purchaseVat, :salesSupply,
                  :salesVat, :salesTotal, :payload, :actor, :actor
                )
                ON CONFLICT (source_file_hash, source_row_no) DO NOTHING
                """, params(hash, rowNo, c, actor)
                .addValue("summaryDate", summaryDate)
                .addValue("purchaseSupply", purchaseSupply)
                .addValue("purchaseVat", purchaseVat)
                .addValue("salesSupply", salesSupply)
                .addValue("salesVat", salesVat)
                .addValue("salesTotal", salesTotal));
        return rows > 0;
    }

    private void insertRejectedStaging(String hash, int rowNo, String[] c, String actor) {
        jdbcTemplate.update("""
                INSERT INTO staging.ecount_sales_purchase_summary_raw (
                  source_file_hash, source_row_no, month_day, type_name, partner_name, detail,
                  raw_payload, transform_status, created_by, modified_by
                ) VALUES (
                  :hash, :row, :monthDay, :typeName, :partnerName, :detail, :payload,
                  'REJECTED', :actor, :actor
                )
                ON CONFLICT (source_file_hash, source_row_no) DO NOTHING
                """, params(hash, rowNo, c, actor));
    }

    private MapSqlParameterSource params(String hash, int rowNo, String[] c, String actor) {
        return new MapSqlParameterSource()
                .addValue("hash", hash)
                .addValue("row", rowNo)
                .addValue("monthDay", EcountCsvSupport.nullIfBlank(c[0]))
                .addValue("typeName", EcountCsvSupport.nullIfBlank(c[1]))
                .addValue("electronicType", EcountCsvSupport.nullIfBlank(c[2]))
                .addValue("partnerName", EcountCsvSupport.nullIfBlank(c[3]))
                .addValue("detail", EcountCsvSupport.nullIfBlank(c[4]))
                .addValue("payload", String.join("\u001F", c))
                .addValue("actor", actor);
    }

    private void reject(String hash, int rowNo, String code, String reason) {
        jdbcTemplate.update("""
                UPDATE staging.ecount_sales_purchase_summary_raw
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

    private record SummaryMismatch(String businessKey, String rawValue, String domainValue) {
    }
}
