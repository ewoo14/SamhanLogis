package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.common.ecount.EcountCsvSupport;
import com.samhanair.logis.common.ecount.EcountMig5ImportResult;
import com.samhanair.logis.common.ecount.EcountMig5ImportSupport;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.io.InputStream;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** MIG-5 지출결의서/입금보고서 staging importer 공통 구현. */
abstract class AbstractEcountMig5CashImporter {

    public static final String[] HEADERS = {
            "전표번호", "거래유형", "금액", "거래처명", "적요명"
    };

    private final NamedParameterJdbcTemplate jdbcTemplate;
    private final PartnerLookupClient partnerLookupClient;
    private final String tableName;
    private final String expectedTransactionType;
    private final UUID lockNamespace;
    private final String agingAccountCode;
    private final boolean receivable;

    AbstractEcountMig5CashImporter(NamedParameterJdbcTemplate jdbcTemplate,
                                   PartnerLookupClient partnerLookupClient,
                                   String tableName,
                                   String expectedTransactionType,
                                   UUID lockNamespace,
                                   String agingAccountCode,
                                   boolean receivable) {
        this.jdbcTemplate = jdbcTemplate;
        this.partnerLookupClient = partnerLookupClient;
        this.tableName = tableName;
        this.expectedTransactionType = expectedTransactionType;
        this.lockNamespace = lockNamespace;
        this.agingAccountCode = agingAccountCode;
        this.receivable = receivable;
    }

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
                EcountMig5ImportSupport.SlipKey slipKey = EcountMig5ImportSupport.parseSlipKey(c[0], rowNo);
                validateTransactionType(c[1], rowNo);
                BigDecimal amount = EcountMig5ImportSupport.parseAmount(c[2], rowNo, false);
                PartnerSummary partner = lookupPartner(c[3], rowNo);
                if (!insertStaging(hash, rowNo, c, slipKey, amount, partner, actor)) {
                    result.skipped();
                    continue;
                }
                result.imported();
            } catch (BusinessException ex) {
                insertRejectedStaging(hash, rowNo, c, actor);
                reject(hash, rowNo, ex.getErrorCode().name(), ex.getMessage());
                result.reject(rowNo, ex.getErrorCode().name(), ex.getMessage(), c[0], sampleRawValue(c, ex));
            } catch (DuplicateKeyException ex) {
                insertRejectedStaging(hash, rowNo, c, actor);
                reject(hash, rowNo, ErrorCode.CONFLICT.name(), ex.getMessage());
                result.reject(rowNo, ErrorCode.CONFLICT.name(),
                        expectedTransactionType + " staging upsert 충돌: "
                                + ex.getMostSpecificCause().getMessage(), c[0], c[0]);
            }
        }
        validateAgainstAging(hash, result);
        return result.build();
    }

    public void validateAgainstAging(String sourceFileHash, EcountMig5ImportResult.Builder result) {
        String balanceExpression = receivable
                ? "COALESCE(SUM(jl.debit_amount - jl.credit_amount), 0)"
                : "COALESCE(SUM(jl.credit_amount - jl.debit_amount), 0)";
        List<AgingMismatch> rows = jdbcTemplate.query("""
                WITH raw_totals AS (
                    SELECT partner_id, partner_name, COALESCE(SUM(amount), 0) raw_total
                      FROM %s
                     WHERE source_file_hash = :hash
                       AND is_deleted = FALSE
                       AND transform_status = 'PENDING'
                       AND partner_id IS NOT NULL
                     GROUP BY partner_id, partner_name
                ), aging AS (
                    SELECT jl.partner_id, %s aging_total
                      FROM journal_lines jl
                      JOIN journals j ON j.id = jl.journal_id
                     WHERE jl.account_code = :accountCode
                       AND jl.is_deleted = FALSE
                       AND j.is_deleted = FALSE
                       AND j.status = 'POSTED'
                     GROUP BY jl.partner_id
                )
                SELECT r.partner_name, r.raw_total::text raw_value,
                       COALESCE(a.aging_total, 0)::text aging_value
                  FROM raw_totals r
                  LEFT JOIN aging a ON a.partner_id = r.partner_id
                 WHERE r.raw_total <> COALESCE(a.aging_total, 0)
                 ORDER BY r.partner_name
                 LIMIT 5
                """.formatted(tableName, balanceExpression),
                new MapSqlParameterSource("hash", sourceFileHash)
                        .addValue("accountCode", agingAccountCode),
                (rs, rowNum) -> new AgingMismatch(
                        rs.getString("partner_name"),
                        rs.getString("raw_value"),
                        rs.getString("aging_value")));
        for (AgingMismatch row : rows) {
            result.agingMismatch(row.partnerName(), row.rawValue(), row.agingValue(),
                    ErrorCode.MIG5_AGING_BALANCE_MISMATCH.name()
                            + ": " + expectedTransactionType + " 거래처별 누계와 Partner aging 잔액이 다릅니다");
        }
    }

    private void validateTransactionType(String raw, int rowNo) {
        String value = EcountCsvSupport.stripCell(raw);
        if (!expectedTransactionType.equals(value)) {
            throw new BusinessException(ErrorCode.MIG5_TRANSACTION_TYPE_INVALID,
                    "거래유형 불일치: sourceRowNo=" + rowNo
                            + ", expected='" + expectedTransactionType + "', actual='" + value + "'");
        }
    }

    private PartnerSummary lookupPartner(String partnerName, int rowNo) {
        try {
            Optional<PartnerSummary> partner =
                    partnerLookupClient.findByPartnerNameStrict(EcountCsvSupport.stripCell(partnerName));
            if (partner.isEmpty() || partner.get().partnerId() == null) {
                throw new BusinessException(ErrorCode.MIG5_LOOKUP_MISS,
                        "거래처 lookup miss: sourceRowNo=" + rowNo + ", partnerName='" + partnerName + "'");
            }
            return partner.get();
        } catch (BusinessException ex) {
            if (ex.getErrorCode() == ErrorCode.MIG3_LOOKUP_AMBIGUOUS) {
                throw new BusinessException(ErrorCode.MIG5_LOOKUP_AMBIGUOUS,
                        "거래처명 lookup ambiguous: " + partnerName, ex);
            }
            throw ex;
        }
    }

    private boolean insertStaging(String hash, int rowNo, String[] c,
                                  EcountMig5ImportSupport.SlipKey slipKey, BigDecimal amount,
                                  PartnerSummary partner, String actor) {
        int rows = jdbcTemplate.update("""
                INSERT INTO %s (
                  source_file_hash, source_row_no, slip_no, slip_date, transaction_type,
                  amount, partner_name, partner_id, partner_code, description, raw_payload,
                  created_by, modified_by
                ) VALUES (
                  :hash, :row, :slipNo, :slipDate, :transactionType,
                  :amount, :partnerName, :partnerId, :partnerCode, :description, :payload,
                  :actor, :actor
                )
                ON CONFLICT (source_file_hash, source_row_no) DO NOTHING
                """.formatted(tableName), params(hash, rowNo, c, actor)
                .addValue("slipNo", slipKey.canonicalNo())
                .addValue("slipDate", slipKey.date())
                .addValue("amount", amount)
                .addValue("partnerId", partner.partnerId())
                .addValue("partnerCode", partner.partnerCode()));
        return rows > 0;
    }

    private void insertRejectedStaging(String hash, int rowNo, String[] c, String actor) {
        jdbcTemplate.update("""
                INSERT INTO %s (
                  source_file_hash, source_row_no, slip_no, transaction_type,
                  partner_name, description, raw_payload, transform_status,
                  created_by, modified_by
                ) VALUES (
                  :hash, :row, :rawSlipNo, :transactionType,
                  :partnerName, :description, :payload, 'REJECTED',
                  :actor, :actor
                )
                ON CONFLICT (source_file_hash, source_row_no) DO NOTHING
                """.formatted(tableName), params(hash, rowNo, c, actor));
    }

    private MapSqlParameterSource params(String hash, int rowNo, String[] c, String actor) {
        return new MapSqlParameterSource()
                .addValue("hash", hash)
                .addValue("row", rowNo)
                .addValue("rawSlipNo", EcountCsvSupport.nullIfBlank(c[0]))
                .addValue("transactionType", EcountCsvSupport.nullIfBlank(c[1]))
                .addValue("partnerName", EcountCsvSupport.nullIfBlank(c[3]))
                .addValue("description", EcountCsvSupport.nullIfBlank(c[4]))
                .addValue("payload", String.join("\u001F", c))
                .addValue("actor", actor);
    }

    private void reject(String hash, int rowNo, String code, String reason) {
        jdbcTemplate.update("""
                UPDATE %s
                   SET transform_status = :code,
                       reject_reason = :reason,
                       modified_at = NOW()
                 WHERE source_file_hash = :hash AND source_row_no = :row
                """.formatted(tableName), new MapSqlParameterSource()
                .addValue("hash", hash)
                .addValue("row", rowNo)
                .addValue("code", code)
                .addValue("reason", reason));
    }

    private void acquireImportLock(String sourceFileHash) {
        jdbcTemplate.queryForObject("SELECT pg_advisory_xact_lock(:lockKey)",
                new MapSqlParameterSource("lockKey",
                        EcountCsvSupport.advisoryLockKey(lockNamespace, sourceFileHash)),
                Object.class);
    }

    private static String sampleRawValue(String[] c, BusinessException ex) {
        return switch (ex.getErrorCode()) {
            case MIG5_AMOUNT_INVALID -> c[2];
            case MIG5_DATE_INVALID -> c[0];
            case MIG5_TRANSACTION_TYPE_INVALID -> c[1];
            case MIG5_LOOKUP_MISS, MIG5_LOOKUP_AMBIGUOUS -> c[3];
            default -> String.join("\u001F", c);
        };
    }

    private record AgingMismatch(String partnerName, String rawValue, String agingValue) {
    }
}

