package com.samhanair.logis.accounting.service;

import com.samhanair.logis.common.ecount.EcountCsvSupport;
import com.samhanair.logis.common.ecount.EcountMig7TransformResult;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** MIG-7 CashDisbursement/CashReceipt staging transform 공통 구현. */
abstract class AbstractMig7CashTransformService {

    private static final Pattern SLIP_NO = Pattern.compile("^\\d{4}-\\d{2}-\\d{2}-\\d+$");

    private final NamedParameterJdbcTemplate jdbcTemplate;
    private final String stagingTable;
    private final String domainTable;
    private final String expectedTransactionType;
    private final String kind;
    private final UUID lockNamespace;

    AbstractMig7CashTransformService(NamedParameterJdbcTemplate jdbcTemplate,
                                     String stagingTable,
                                     String domainTable,
                                     String expectedTransactionType,
                                     String kind,
                                     UUID lockNamespace) {
        this.jdbcTemplate = jdbcTemplate;
        this.stagingTable = stagingTable;
        this.domainTable = domainTable;
        this.expectedTransactionType = expectedTransactionType;
        this.kind = kind;
        this.lockNamespace = lockNamespace;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW, isolation = Isolation.READ_COMMITTED)
    public EcountMig7TransformResult transformFromStaging(int batchSize, String actorUserId) {
        acquireTransformLock();
        List<StagingRow> rows = pendingRows(batchSize);
        if (rows.isEmpty()) {
            throw new BusinessException(ErrorCode.MIG7_STAGING_ROW_NOT_FOUND,
                    expectedTransactionType + " 변환 대상 staging row 가 없습니다.");
        }

        EcountMig7TransformResult.Builder result = EcountMig7TransformResult.builder(rows.size());
        Set<String> seenExternalRefs = new HashSet<>();
        String actor = normalizeActor(actorUserId);
        for (StagingRow row : rows) {
            try {
                validate(row, seenExternalRefs);
                boolean existed = existsAny(row.externalRef());
                upsertDomain(row, actor);
                updateStatus(row, "TRANSFORMED", null);
                if (existed) {
                    result.updated();
                } else {
                    result.imported();
                }
            } catch (BusinessException ex) {
                updateStatus(row, "REJECTED", ex.getMessage());
                result.reject(row.sourceRowNo(), ex.getErrorCode().name(), ex.getMessage(),
                        row.slipNo(), sampleRawValue(row, ex));
            } catch (DuplicateKeyException ex) {
                String message = "MIG-7 domain upsert 충돌: " + ex.getMostSpecificCause().getMessage();
                updateStatus(row, "REJECTED", message);
                result.reject(row.sourceRowNo(), ErrorCode.MIG7_DUPLICATE_EXTERNAL_REF.name(), message,
                        row.slipNo(), row.externalRef());
            }
        }
        return result.build();
    }

    private void validate(StagingRow row, Set<String> seenExternalRefs) {
        if (!seenExternalRefs.add(row.externalRef())) {
            throw new BusinessException(ErrorCode.MIG7_DUPLICATE_EXTERNAL_REF,
                    "동일 batch 내 externalRef 중복: sourceRowNo=" + row.sourceRowNo()
                            + ", externalRef='" + row.externalRef() + "'");
        }
        if (!expectedTransactionType.equals(EcountCsvSupport.stripCell(row.transactionType()))) {
            throw new BusinessException(ErrorCode.MIG7_KIND_INVALID,
                    "거래유형 불일치: sourceRowNo=" + row.sourceRowNo()
                            + ", expected='" + expectedTransactionType + "', actual='" + row.transactionType() + "'");
        }
        if (row.partnerId() == null) {
            throw new BusinessException(ErrorCode.MIG7_LOOKUP_MISS,
                    "거래처 lookup miss: sourceRowNo=" + row.sourceRowNo()
                            + ", partnerName='" + row.partnerName() + "'");
        }
        if (row.amount() == null || row.amount().compareTo(BigDecimal.ZERO) <= 0) {
            throw new BusinessException(ErrorCode.MIG7_AMOUNT_INVALID,
                    "금액 형식 불일치 또는 0 이하: sourceRowNo=" + row.sourceRowNo()
                            + ", amount='" + row.amount() + "'");
        }
        parseTransactionDate(row);
    }

    private LocalDate parseTransactionDate(StagingRow row) {
        String slipNo = EcountCsvSupport.stripCell(row.slipNo());
        if (!SLIP_NO.matcher(slipNo).matches()) {
            throw new BusinessException(ErrorCode.MIG7_DATE_INVALID,
                    "전표번호 일자 포맷 불일치: sourceRowNo=" + row.sourceRowNo()
                            + ", slipNo='" + row.slipNo() + "'");
        }
        try {
            return LocalDate.parse(slipNo.substring(0, 10));
        } catch (DateTimeParseException ex) {
            throw new BusinessException(ErrorCode.MIG7_DATE_INVALID,
                    "전표번호 일자 파싱 실패: sourceRowNo=" + row.sourceRowNo()
                            + ", slipNo='" + row.slipNo() + "'", ex);
        }
    }

    private List<StagingRow> pendingRows(int batchSize) {
        return jdbcTemplate.query("""
                SELECT source_file_hash, source_row_no, slip_no, transaction_type,
                       amount, partner_name, partner_id, description,
                       source_file_hash || '-' || source_row_no AS external_ref
                  FROM %s
                 WHERE transform_status = 'PENDING'
                   AND is_deleted = FALSE
                 ORDER BY source_file_hash, source_row_no
                 LIMIT :limit
                """.formatted(stagingTable),
                new MapSqlParameterSource("limit", batchSize),
                (rs, rowNum) -> new StagingRow(
                        rs.getString("source_file_hash"),
                        rs.getInt("source_row_no"),
                        rs.getString("slip_no"),
                        rs.getString("transaction_type"),
                        rs.getBigDecimal("amount"),
                        rs.getString("partner_name"),
                        rs.getObject("partner_id", UUID.class),
                        rs.getString("description"),
                        rs.getString("external_ref")));
    }

    private UUID upsertDomain(StagingRow row, String actor) {
        LocalDate transactionDate = parseTransactionDate(row);
        return jdbcTemplate.queryForObject("""
                WITH restored AS (
                    UPDATE %s
                       SET slip_no = :slipNo,
                           partner_id = :partnerId,
                           amount = :amount,
                           transaction_date = :transactionDate,
                           kind = :kind,
                           memo = :memo,
                           is_deleted = FALSE,
                           deleted_at = NULL,
                           deleted_by = NULL,
                           modified_at = NOW(),
                           modified_by = :actor
                     WHERE external_ref = :externalRef
                       AND is_deleted = TRUE
                     RETURNING id
                ), upserted AS (
                    INSERT INTO %s (
                      id, slip_no, partner_id, amount, transaction_date, kind, memo, external_ref,
                      created_at, created_by, modified_at, modified_by, is_deleted
                    )
                    SELECT gen_random_uuid(), :slipNo, :partnerId, :amount, :transactionDate, :kind, :memo, :externalRef,
                           NOW(), :actor, NOW(), :actor, FALSE
                    WHERE NOT EXISTS (SELECT 1 FROM restored)
                    ON CONFLICT (external_ref) DO UPDATE SET
                      slip_no = EXCLUDED.slip_no,
                      partner_id = EXCLUDED.partner_id,
                      amount = EXCLUDED.amount,
                      transaction_date = EXCLUDED.transaction_date,
                      kind = EXCLUDED.kind,
                      memo = EXCLUDED.memo,
                      modified_at = NOW(),
                      modified_by = EXCLUDED.modified_by
                    RETURNING id
                )
                SELECT id FROM restored
                UNION ALL
                SELECT id FROM upserted
                LIMIT 1
                """.formatted(domainTable, domainTable), params(row, actor, transactionDate), UUID.class);
    }

    private void updateStatus(StagingRow row, String status, String reason) {
        jdbcTemplate.update("""
                UPDATE %s
                   SET transform_status = :status,
                       reject_reason = :reason,
                       modified_at = NOW()
                 WHERE source_file_hash = :hash
                   AND source_row_no = :row
                """.formatted(stagingTable), new MapSqlParameterSource()
                .addValue("status", status)
                .addValue("reason", reason)
                .addValue("hash", row.sourceFileHash())
                .addValue("row", row.sourceRowNo()));
    }

    private boolean existsAny(String externalRef) {
        Integer count = jdbcTemplate.queryForObject("""
                SELECT COUNT(1)
                  FROM %s
                 WHERE external_ref = :externalRef
                """.formatted(domainTable),
                new MapSqlParameterSource("externalRef", externalRef), Integer.class);
        return count != null && count > 0;
    }

    private MapSqlParameterSource params(StagingRow row, String actor, LocalDate transactionDate) {
        return new MapSqlParameterSource()
                .addValue("slipNo", row.slipNo())
                .addValue("partnerId", row.partnerId())
                .addValue("amount", row.amount())
                .addValue("transactionDate", transactionDate)
                .addValue("kind", kind)
                .addValue("memo", EcountCsvSupport.nullIfBlank(row.description()))
                .addValue("externalRef", row.externalRef())
                .addValue("actor", actor);
    }

    private void acquireTransformLock() {
        jdbcTemplate.queryForObject("SELECT pg_advisory_xact_lock(:lockKey)",
                new MapSqlParameterSource("lockKey",
                        EcountCsvSupport.advisoryLockKey(lockNamespace, "MIG7_TRANSFORM")),
                Object.class);
    }

    private static String sampleRawValue(StagingRow row, BusinessException ex) {
        return switch (ex.getErrorCode()) {
            case MIG7_AMOUNT_INVALID -> row.amount() == null ? null : row.amount().toPlainString();
            case MIG7_DATE_INVALID -> row.slipNo();
            case MIG7_LOOKUP_MISS -> row.partnerName();
            case MIG7_KIND_INVALID -> row.transactionType();
            case MIG7_DUPLICATE_EXTERNAL_REF -> row.externalRef();
            default -> row.externalRef();
        };
    }

    private static String normalizeActor(String actorUserId) {
        return actorUserId == null || actorUserId.isBlank() ? "system" : actorUserId;
    }

    record StagingRow(String sourceFileHash, int sourceRowNo, String slipNo, String transactionType,
                      BigDecimal amount, String partnerName, UUID partnerId, String description,
                      String externalRef) {
    }
}
