package com.samhanair.logis.accounting.service;

import com.samhanair.logis.common.ecount.EcountCsvSupport;
import com.samhanair.logis.common.ecount.EcountMig11Result;
import com.samhanair.logis.common.ecount.io.EcountXlsxSupport;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.io.InputStream;
import java.math.BigDecimal;
import java.time.DateTimeException;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** MIG-11 매출장/매입장 XLSX staging importer 공통 구현. */
abstract class AbstractEcountMig11LedgerImporter {

    private static final Pattern TRANSACTION_REF =
            Pattern.compile("^(\\d{4})/(\\d{2})/(\\d{2})\\s*-\\s*(\\d+)$");

    private final NamedParameterJdbcTemplate jdbcTemplate;
    private final String tableName;
    private final String[] headers;
    private final LedgerMapping mapping;
    private final UUID lockNamespace;
    private final String closingKind;
    private final String sourceKind;
    private final boolean totalAmountInFile;
    @Autowired(required = false)
    private MigOpsMetricsRecorder metricsRecorder;

    AbstractEcountMig11LedgerImporter(NamedParameterJdbcTemplate jdbcTemplate,
                                      String tableName,
                                      String[] headers,
                                      LedgerMapping mapping,
                                      UUID lockNamespace,
                                      String closingKind,
                                      String sourceKind,
                                      boolean totalAmountInFile) {
        this.jdbcTemplate = jdbcTemplate;
        this.tableName = tableName;
        this.headers = headers;
        this.mapping = mapping;
        this.lockNamespace = lockNamespace;
        this.closingKind = closingKind;
        this.sourceKind = sourceKind;
        this.totalAmountInFile = totalAmountInFile;
    }

    // MIG-3~10 import/transform 패턴과 동일하게 controller 외부 트랜잭션이 생겨도 import 단위를 격리한다.
    @Transactional(propagation = Propagation.REQUIRES_NEW, isolation = Isolation.READ_COMMITTED)
    public EcountMig11Result importXlsx(InputStream xlsx, String actorUserId) {
        EcountXlsxSupport.ParsedXlsx parsed = EcountXlsxSupport.parse(xlsx, headers);
        acquireImportLock(parsed.sourceFileHash());

        EcountMig11Result.Builder result =
                EcountMig11Result.builder(parsed.dataRowCount(), parsed.sourceFileHash());
        String actor = actor(actorUserId);
        for (EcountXlsxSupport.ParsedRow row : parsed.rows()) {
            try {
                LedgerRow ledgerRow = toLedgerRow(row);
                if (!insertStaging(parsed.sourceFileHash(), row.sourceRowNo(), row.cells(), ledgerRow, actor)) {
                    result.skipped();
                    continue;
                }
                result.imported();
            } catch (BusinessException ex) {
                insertRejectedStaging(parsed.sourceFileHash(), row.sourceRowNo(), row.cells(), actor,
                        ex.getErrorCode().name(), ex.getMessage());
                result.reject(row.sourceRowNo(), ex.getErrorCode().name(), ex.getMessage(),
                        businessKey(row), sampleRawValue(row, ex));
            }
        }
        validateAgainstDailyClosing(parsed.sourceFileHash(), result);
        EcountMig11Result built = result.build();
        EcountMigMetricsSupport.recordImportResult(metricsRecorder, "mig-11", built);
        return built;
    }

    private LedgerRow toLedgerRow(EcountXlsxSupport.ParsedRow row) {
        TransactionKey transactionKey = parseTransactionKey(row.get("월/일"), row.sourceRowNo());
        BigDecimal supply = parseAmount(row.get(mapping.supplyHeader()), row.sourceRowNo(), false);
        BigDecimal vat = parseAmount(row.get(mapping.vatHeader()), row.sourceRowNo(), true);
        BigDecimal total = totalAmountInFile
                ? parseAmount(row.get(mapping.totalHeader()), row.sourceRowNo(), false)
                : supply.add(vat);
        if (totalAmountInFile && supply.add(vat).compareTo(total) != 0) {
            throw new BusinessException(ErrorCode.MIG11_AMOUNT_INVALID,
                    "공급가액+부가세와 합계가 다릅니다: sourceRowNo=" + row.sourceRowNo()
                            + ", transactionRef='" + row.get("월/일") + "'");
        }
        return new LedgerRow(
                transactionKey.date(),
                transactionKey.sequenceNo(),
                transactionKey.canonicalRef(),
                EcountXlsxSupport.nullIfBlank(row.get(mapping.transactionTypeHeader())),
                EcountXlsxSupport.nullIfBlank(row.get(mapping.electronicTypeHeader())),
                EcountXlsxSupport.nullIfBlank(row.get("거래처코드")),
                EcountXlsxSupport.nullIfBlank(row.get("거래처명")),
                EcountXlsxSupport.nullIfBlank(row.get("적요")),
                supply,
                vat,
                total);
    }

    private boolean insertStaging(String hash, int rowNo, String[] cells, LedgerRow row, String actor) {
        int rows = jdbcTemplate.update("""
                INSERT INTO %s (
                  source_file_hash, source_row_no, transaction_ref, transaction_date, sequence_no,
                  transaction_type, electronic_type, partner_code, partner_name, description,
                  supply_amount, vat_amount, total_amount, raw_payload,
                  imported_by, created_by, modified_by
                ) VALUES (
                  :hash, :rowNo, :transactionRef, :transactionDate, :sequenceNo,
                  :transactionType, :electronicType, :partnerCode, :partnerName, :description,
                  :supplyAmount, :vatAmount, :totalAmount, :rawPayload,
                  :actor, :actor, :actor
                )
                ON CONFLICT (source_file_hash, source_row_no) DO NOTHING
                """.formatted(tableName), params(hash, rowNo, cells, actor)
                .addValue("transactionRef", row.transactionRef())
                .addValue("transactionDate", row.transactionDate())
                .addValue("sequenceNo", row.sequenceNo())
                .addValue("transactionType", row.transactionType())
                .addValue("electronicType", row.electronicType())
                .addValue("partnerCode", row.partnerCode())
                .addValue("partnerName", row.partnerName())
                .addValue("description", row.description())
                .addValue("supplyAmount", row.supplyAmount())
                .addValue("vatAmount", row.vatAmount())
                .addValue("totalAmount", row.totalAmount()));
        return rows > 0;
    }

    private void insertRejectedStaging(String hash, int rowNo, String[] cells, String actor,
                                       String errorCode, String reason) {
        jdbcTemplate.update("""
                INSERT INTO %s (
                  source_file_hash, source_row_no, transaction_ref, partner_code, partner_name,
                  description, raw_payload, transform_status, reject_reason,
                  imported_by, created_by, modified_by
                ) VALUES (
                  :hash, :rowNo, :transactionRef, :partnerCode, :partnerName,
                  :description, :rawPayload, :errorCode, :reason,
                  :actor, :actor, :actor
                )
                ON CONFLICT (source_file_hash, source_row_no) DO NOTHING
                """.formatted(tableName), params(hash, rowNo, cells, actor)
                .addValue("transactionRef", rejectedTransactionRef(cells, rowNo))
                .addValue("partnerCode", cell(cells, mapping.partnerCodeIndex()))
                .addValue("partnerName", cell(cells, mapping.partnerNameIndex()))
                .addValue("description", cell(cells, mapping.descriptionIndex()))
                .addValue("errorCode", errorCode)
                .addValue("reason", reason));
    }

    private void validateAgainstDailyClosing(String sourceFileHash, EcountMig11Result.Builder result) {
        // 매출장/매입장 = TAX_INVOICE + SALES_SLIP/PURCHASE_SLIP 모두 합산 (closing_kind 만 필터).
        List<DailyClosingMismatch> rows = jdbcTemplate.query("""
                WITH raw_totals AS (
                    SELECT transaction_date, COALESCE(SUM(total_amount), 0) raw_total
                      FROM %s
                     WHERE source_file_hash = :hash
                       AND is_deleted = FALSE
                       AND transform_status = 'PENDING'
                       AND transaction_date IS NOT NULL
                     GROUP BY transaction_date
                ), closing_totals AS (
                    SELECT closing_date, COALESCE(SUM(total_amount), 0) closing_total
                      FROM daily_closings
                     WHERE is_deleted = FALSE
                       AND partner_id IS NULL
                       AND closing_kind = :closingKind
                     GROUP BY closing_date
                )
                SELECT r.transaction_date::text transaction_date,
                       r.raw_total::text raw_value,
                       COALESCE(c.closing_total, 0)::text closing_value,
                       (r.raw_total - COALESCE(c.closing_total, 0))::text diff_value
                 FROM raw_totals r
                  LEFT JOIN closing_totals c ON c.closing_date = r.transaction_date
                 WHERE ABS(r.raw_total - COALESCE(c.closing_total, 0)) > 0.01
                 ORDER BY r.transaction_date
                """.formatted(tableName), new MapSqlParameterSource()
                .addValue("hash", sourceFileHash)
                .addValue("closingKind", closingKind),
                (rs, rowNum) -> new DailyClosingMismatch(
                        rs.getString("transaction_date"),
                        rs.getString("raw_value"),
                        rs.getString("closing_value"),
                        rs.getString("diff_value")));
        for (DailyClosingMismatch row : rows) {
            result.dailyClosingMismatch(row.transactionDate(), row.rawValue(), row.closingValue(), row.diffValue(),
                    ErrorCode.MIG11_DAILY_CLOSING_MISMATCH.name()
                            + ": 매출장/매입장 일별 합계와 DailyClosing total_amount 가 다릅니다");
        }
        if (metricsRecorder != null) {
            metricsRecorder.recordDailyClosingDiff(closingKind, sourceKind, rows.size());
        }
    }

    private void acquireImportLock(String sourceFileHash) {
        jdbcTemplate.queryForObject("SELECT pg_advisory_xact_lock(:lockKey)",
                new MapSqlParameterSource("lockKey",
                        EcountCsvSupport.advisoryLockKey(lockNamespace, sourceFileHash)),
                Object.class);
    }

    private MapSqlParameterSource params(String hash, int rowNo, String[] cells, String actor) {
        return new MapSqlParameterSource()
                .addValue("hash", hash)
                .addValue("rowNo", rowNo)
                .addValue("rawPayload", String.join("\u001F", cells))
                .addValue("actor", actor);
    }

    private static TransactionKey parseTransactionKey(String raw, int rowNo) {
        String value = EcountXlsxSupport.stripCell(raw);
        Matcher matcher = TRANSACTION_REF.matcher(value);
        if (!matcher.matches()) {
            throw new BusinessException(ErrorCode.MIG11_DATE_INVALID,
                    "월/일 형식 불일치: sourceRowNo=" + rowNo + ", sample='" + value + "'");
        }
        try {
            LocalDate date = LocalDate.of(Integer.parseInt(matcher.group(1)),
                    Integer.parseInt(matcher.group(2)),
                    Integer.parseInt(matcher.group(3)));
            int sequence = Integer.parseInt(matcher.group(4));
            return new TransactionKey(date, sequence, "%04d-%02d-%02d-%03d".formatted(
                    date.getYear(), date.getMonthValue(), date.getDayOfMonth(), sequence));
        } catch (DateTimeException | NumberFormatException ex) {
            throw new BusinessException(ErrorCode.MIG11_DATE_INVALID,
                    "월/일 형식 불일치: sourceRowNo=" + rowNo + ", sample='" + value + "'", ex);
        }
    }

    private static BigDecimal parseAmount(String raw, int rowNo, boolean blankAllowed) {
        String value = EcountXlsxSupport.stripCell(raw).replace(",", "");
        if (value.isBlank()) {
            return blankAllowed ? BigDecimal.ZERO : invalidAmount(raw, rowNo, null);
        }
        try {
            BigDecimal amount = new BigDecimal(value);
            if (amount.signum() < 0) {
                throw new NumberFormatException("negative");
            }
            return amount;
        } catch (NumberFormatException ex) {
            return invalidAmount(raw, rowNo, ex);
        }
    }

    private static BigDecimal invalidAmount(String raw, int rowNo, Exception cause) {
        throw new BusinessException(ErrorCode.MIG11_AMOUNT_INVALID,
                "금액 형식 불일치: sourceRowNo=" + rowNo + ", sample='" + raw + "'", cause);
    }

    private static String actor(String actorUserId) {
        return actorUserId == null || actorUserId.isBlank() ? "system" : actorUserId;
    }

    private String businessKey(EcountXlsxSupport.ParsedRow row) {
        return row.get("월/일") + " / " + row.get("거래처명");
    }

    private String sampleRawValue(EcountXlsxSupport.ParsedRow row, BusinessException ex) {
        return switch (ex.getErrorCode()) {
            case MIG11_DATE_INVALID -> row.get("월/일");
            case MIG11_AMOUNT_INVALID -> String.join("/", row.get(mapping.supplyHeader()),
                    row.get(mapping.vatHeader()), totalAmountInFile ? row.get(mapping.totalHeader()) : "");
            default -> String.join("\u001F", row.cells());
        };
    }

    private static String cell(String[] cells, int index) {
        return index >= 0 && index < cells.length ? EcountXlsxSupport.nullIfBlank(cells[index]) : null;
    }

    private static String rejectedTransactionRef(String[] cells, int rowNo) {
        String raw = cell(cells, 0);
        if (raw == null) {
            return "[INVALID]";
        }
        try {
            return parseTransactionKey(raw, rowNo).canonicalRef();
        } catch (BusinessException ex) {
            // Reject row 에는 원천 추적성이 더 중요하다. 정규화 실패 시 raw 월/일 값을 보존한다.
            return raw;
        }
    }

    record LedgerMapping(
            String transactionTypeHeader,
            String electronicTypeHeader,
            String supplyHeader,
            String vatHeader,
            String totalHeader,
            int transactionRefIndex,
            int partnerCodeIndex,
            int partnerNameIndex,
            int descriptionIndex) {
    }

    private record TransactionKey(LocalDate date, int sequenceNo, String canonicalRef) {
    }

    private record LedgerRow(LocalDate transactionDate, int sequenceNo, String transactionRef,
                             String transactionType, String electronicType, String partnerCode,
                             String partnerName, String description, BigDecimal supplyAmount,
                             BigDecimal vatAmount, BigDecimal totalAmount) {
    }

    private record DailyClosingMismatch(String transactionDate, String rawValue,
                                        String closingValue, String diffValue) {
    }
}
