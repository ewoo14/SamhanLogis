package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.client.ProductAliasClient;
import com.samhanair.logis.accounting.domain.OrderProgressStatus;
import com.samhanair.logis.common.ecount.EcountCsvSupport;
import com.samhanair.logis.common.ecount.EcountMig8TransformResult;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** MIG-8 — 주문서 staging -> Order/OrderLine 도메인 변환. */
@Slf4j
@Service
@RequiredArgsConstructor
public class Mig8OrderTransformService {

    private static final UUID TRANSFORM_LOCK_NAMESPACE =
            UUID.fromString("e0f7d087-2a18-4a2f-9e0f-dc1c6dc59c8d");
    private static final Pattern ORDER_NO = Pattern.compile("^\\d{4}-\\d{2}-\\d{2}-\\d+$");

    private final NamedParameterJdbcTemplate jdbcTemplate;
    private final PartnerLookupClient partnerLookupClient;
    private final ProductAliasClient productAliasClient;
    @Autowired(required = false)
    private MigOpsMetricsRecorder metricsRecorder;

    @Transactional(propagation = Propagation.REQUIRES_NEW, isolation = Isolation.READ_COMMITTED)
    public EcountMig8TransformResult transformFromStaging(int batchSize, String actorUserId) {
        acquireTransformLock();
        List<StagingRow> rows = pendingRows();
        if (rows.isEmpty()) {
            throw new BusinessException(ErrorCode.MIG8_STAGING_ROW_NOT_FOUND,
                    "MIG-8 Order 변환 대상 staging row 가 없습니다.");
        }

        EcountMig8TransformResult.Builder result = EcountMig8TransformResult.builder(rows.size());
        String actor = normalizeActor(actorUserId);
        Map<String, List<ValidatedRow>> groups = validateAndGroup(rows, result);
        try {
            // resolver 응답 이후 sheet sync 가 Product 를 soft-delete할 수 있으므로,
            // line upsert 직전에 같은 alias 집합을 다시 해소한다. ProductAliasClient 는
            // 두 응답 사이의 삭제 경합을 막는 짧은 reservation도 함께 관리한다.
            Map<String, UUID> productAliasCache = resolveProductAliases(groups);
            productAliasCache = resolveProductAliases(groups);

            for (List<ValidatedRow> group : groups.values()) {
                try {
                    transformGroup(group, actor, result, productAliasCache);
                } catch (BusinessException ex) {
                    rejectGroup(group, ex.getErrorCode().name(), ex.getMessage(), result);
                } catch (DuplicateKeyException ex) {
                    DuplicateReject duplicate = duplicateReject(ex);
                    if (duplicate == null) {
                        throw ex;
                    }
                    rejectGroup(group, duplicate.code().name(), duplicate.message(), result);
                }
            }
            EcountMig8TransformResult built = result.build();
            EcountMigMetricsSupport.recordTransformResult(metricsRecorder, "mig-8", built);
            return built;
        } finally {
            productAliasClient.releaseReservations();
        }
    }

    private Map<String, List<ValidatedRow>> validateAndGroup(List<StagingRow> rows,
                                                            EcountMig8TransformResult.Builder result) {
        Map<String, List<ValidatedRow>> groups = new LinkedHashMap<>();
        for (StagingRow row : rows) {
            try {
                ValidatedRow validated = validate(row);
                groups.computeIfAbsent(validated.orderNo(), ignored -> new ArrayList<>()).add(validated);
            } catch (BusinessException ex) {
                updateStatus(row, "REJECTED", ex.getMessage());
                result.reject(row.sourceRowNo(), ex.getErrorCode().name(), ex.getMessage(),
                        row.orderNo(), sampleRawValue(row, ex));
            }
        }
        return groups;
    }

    private Map<String, UUID> resolveProductAliases(Map<String, List<ValidatedRow>> groups) {
        LinkedHashSet<String> itemNames = new LinkedHashSet<>();
        for (List<ValidatedRow> group : groups.values()) {
            for (ValidatedRow row : group) {
                String itemName = EcountCsvSupport.stripCell(row.row().itemName());
                itemNames.addAll(lookupCandidates(itemName));
            }
        }
        if (itemNames.isEmpty()) {
            return Map.of();
        }
        try {
            return productAliasClient.resolveAliases(List.copyOf(itemNames));
        } catch (BusinessException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new BusinessException(ErrorCode.MIG20_REIMPORT_FAILED,
                    "MIG-8 product alias resolver 호출 실패: " + ex.getMessage(), ex);
        }
    }

    private ValidatedRow validate(StagingRow row) {
        String orderNo = EcountCsvSupport.stripCell(row.orderNo());
        if (!ORDER_NO.matcher(orderNo).matches()) {
            throw new BusinessException(ErrorCode.MIG8_DATE_INVALID,
                    "주문번호 일자 포맷 불일치: sourceRowNo=" + row.sourceRowNo()
                            + ", orderNo='" + row.orderNo() + "'");
        }
        try {
            LocalDate.parse(orderNo.substring(0, 10));
        } catch (DateTimeParseException ex) {
            throw new BusinessException(ErrorCode.MIG8_DATE_INVALID,
                    "주문번호 일자 파싱 실패: sourceRowNo=" + row.sourceRowNo()
                            + ", orderNo='" + row.orderNo() + "'", ex);
        }
        OrderProgressStatus status = OrderProgressStatus.fromKorean(row.progressStatus());
        LocalDate validUntil = parseOptionalDate(row.validUntil(), row, "validUntil");
        if (row.quantity() == null || row.quantity().compareTo(BigDecimal.ZERO) <= 0
                || row.unitPrice() == null || row.unitPrice().compareTo(BigDecimal.ZERO) < 0
                || row.supplyAmount() == null || row.supplyAmount().compareTo(BigDecimal.ZERO) < 0
                || row.vatAmount() == null || row.vatAmount().compareTo(BigDecimal.ZERO) < 0) {
            throw new BusinessException(ErrorCode.MIG8_AMOUNT_INVALID,
                    "금액/수량 형식 불일치 또는 음수: sourceRowNo=" + row.sourceRowNo());
        }
        if (EcountCsvSupport.nullIfBlank(row.itemName()) == null) {
            throw new BusinessException(ErrorCode.MIG8_AMOUNT_INVALID,
                    "품목명이 비어 있습니다: sourceRowNo=" + row.sourceRowNo());
        }
        return new ValidatedRow(row, orderNo, status, validUntil);
    }

    private void transformGroup(List<ValidatedRow> group, String actor,
                                EcountMig8TransformResult.Builder result,
                                Map<String, UUID> productAliasCache) {
        ValidatedRow head = group.get(0);
        PartnerSummary partner = lookupPartner(head.row());
        boolean existed = existsAny(head.row().externalRef());
        UUID orderId = upsertOrder(head, partner, actor);
        // 본 슬라이스는 동일 source_file_hash 재실행만 가정 (line_no 안정). partial re-import 시 stale line cleanup 은 MIG-9+ 후속.
        List<String> lookupMissMessages = new ArrayList<>(group.size());
        for (int i = 0; i < group.size(); i++) {
            ValidatedRow row = group.get(i);
            String itemName = EcountCsvSupport.stripCell(row.row().itemName());
            UUID productId = lookupProductId(itemName, productAliasCache);
            if (productId == null) {
                String message = productLookupMissMessage(row, itemName);
                lookupMissMessages.add(message);
                result.reject(row.row().sourceRowNo(), ErrorCode.MIG8_LOOKUP_MISS.name(),
                        message, row.orderNo(), itemName);
            } else {
                lookupMissMessages.add(null);
            }
            upsertLine(orderId, i + 1, row, actor, productId);
        }
        boolean hasLookupMiss = lookupMissMessages.stream().anyMatch(java.util.Objects::nonNull);
        for (int i = 0; i < group.size(); i++) {
            String reason = lookupMissMessages.get(i);
            updateStatus(group.get(i).row(), hasLookupMiss ? "PENDING" : "TRANSFORMED", reason);
        }
        recalcTotals(orderId, actor);

        String linkedSlipNo = null;
        if (head.progressStatus() == OrderProgressStatus.COMPLETED) {
            linkedSlipNo = findSalesSlip(head);
            if (linkedSlipNo == null) {
                result.warning(head.row().sourceRowNo(), ErrorCode.MIG8_SLIP_LINK_MISS.name(),
                        "완료 주문의 SalesAccountingSlip 매칭 실패", head.orderNo(), head.orderNo());
            } else {
                result.linkedSlip();
            }
        }
        linkSalesSlip(orderId, linkedSlipNo, actor);
        if (existed) {
            result.updated();
        } else {
            result.imported();
        }
    }

    private PartnerSummary lookupPartner(StagingRow row) {
        try {
            Optional<PartnerSummary> partner =
                    partnerLookupClient.findByPartnerNameStrict(EcountCsvSupport.stripCell(row.partnerName()));
            if (partner.isPresent() && partner.get().partnerId() != null) {
                return partner.get();
            }
        } catch (BusinessException ex) {
            if (ex.getErrorCode() != ErrorCode.MIG3_LOOKUP_AMBIGUOUS) {
                throw ex;
            }
        }
        throw new BusinessException(ErrorCode.MIG8_LOOKUP_MISS,
                "거래처 lookup miss: sourceRowNo=" + row.sourceRowNo()
                        + ", partnerName='" + row.partnerName() + "'");
    }

    private List<StagingRow> pendingRows() {
        return jdbcTemplate.query("""
                SELECT source_file_hash, source_row_no, order_no, legacy_order_no, order_date,
                       partner_name, manager_name, valid_until, payment_terms, reference,
                       progress_status, item_name, quantity, unit_price, supply_amount, vat_amount,
                       item_due_date, source_file_hash || '-' || source_row_no AS external_ref
                  FROM staging.ecount_order_raw
                 WHERE transform_status = 'PENDING'
                   AND is_deleted = FALSE
                 ORDER BY order_no, source_file_hash, source_row_no
                """, new MapSqlParameterSource(), stagingMapper());
    }

    private RowMapper<StagingRow> stagingMapper() {
        return (rs, rowNum) -> new StagingRow(
                rs.getString("source_file_hash"),
                rs.getInt("source_row_no"),
                rs.getString("order_no"),
                rs.getString("legacy_order_no"),
                rs.getObject("order_date", LocalDate.class),
                rs.getString("partner_name"),
                rs.getString("manager_name"),
                rs.getString("valid_until"),
                rs.getString("payment_terms"),
                rs.getString("reference"),
                rs.getString("progress_status"),
                rs.getString("item_name"),
                rs.getBigDecimal("quantity"),
                rs.getBigDecimal("unit_price"),
                rs.getBigDecimal("supply_amount"),
                rs.getBigDecimal("vat_amount"),
                rs.getObject("item_due_date", LocalDate.class),
                rs.getString("external_ref"));
    }

    private UUID upsertOrder(ValidatedRow row, PartnerSummary partner, String actor) {
        return jdbcTemplate.queryForObject("""
                WITH restored AS (
                    UPDATE orders
                       SET order_no = :orderNo,
                           partner_id = :partnerId,
                           partner_name = :partnerName,
                           manager_name = :managerName,
                           valid_until = :validUntil,
                           payment_terms = :paymentTerms,
                           reference = :reference,
                           progress_status = :progressStatus,
                           kind = 'ECOUNT_MIG8',
                           is_deleted = FALSE,
                           deleted_at = NULL,
                           deleted_by = NULL,
                           modified_at = NOW(),
                           modified_by = :actor
                     WHERE external_ref = :externalRef
                       AND is_deleted = TRUE
                     RETURNING id
                ), upserted AS (
                    INSERT INTO orders (
                      id, order_no, partner_id, partner_name, manager_name, valid_until,
                      payment_terms, reference, progress_status, total_supply_amount, total_vat_amount,
                      linked_slip_no, external_ref, kind, created_at, created_by, modified_at, modified_by,
                      is_deleted
                    )
                    SELECT gen_random_uuid(), :orderNo, :partnerId, :partnerName, :managerName, :validUntil,
                           :paymentTerms, :reference, :progressStatus, 0, 0, NULL, :externalRef, 'ECOUNT_MIG8',
                           NOW(), :actor, NOW(), :actor, FALSE
                    WHERE NOT EXISTS (SELECT 1 FROM restored)
                    ON CONFLICT (external_ref) DO UPDATE SET
                      order_no = EXCLUDED.order_no,
                      partner_id = EXCLUDED.partner_id,
                      partner_name = EXCLUDED.partner_name,
                      manager_name = EXCLUDED.manager_name,
                      valid_until = EXCLUDED.valid_until,
                      payment_terms = EXCLUDED.payment_terms,
                      reference = EXCLUDED.reference,
                      progress_status = EXCLUDED.progress_status,
                      kind = EXCLUDED.kind,
                      modified_at = NOW(),
                      modified_by = EXCLUDED.modified_by
                    RETURNING id
                )
                SELECT id FROM restored
                UNION ALL
                SELECT id FROM upserted
                LIMIT 1
                """, orderParams(row, partner, actor), UUID.class);
    }

    private void upsertLine(UUID orderId, int lineNo, ValidatedRow row, String actor, UUID productId) {
        jdbcTemplate.queryForObject("""
                WITH restored AS (
                    UPDATE order_lines
                       SET product_id = :productId,
                           item_name = :itemName,
                           quantity = :quantity,
                           unit_price = :unitPrice,
                           supply_amount = :supplyAmount,
                           vat_amount = :vatAmount,
                           item_due_date = :itemDueDate,
                           is_deleted = FALSE,
                           deleted_at = NULL,
                           deleted_by = NULL,
                           modified_at = NOW(),
                           modified_by = :actor
                     WHERE order_id = :orderId
                       AND line_no = :lineNo
                       AND is_deleted = TRUE
                     RETURNING id
                ), upserted AS (
                    INSERT INTO order_lines (
                      id, order_id, line_no, product_id, item_name, quantity, unit_price,
                      supply_amount, vat_amount, item_due_date, created_at, created_by,
                      modified_at, modified_by, is_deleted
                    )
                    SELECT gen_random_uuid(), :orderId, :lineNo, :productId, :itemName, :quantity, :unitPrice,
                           :supplyAmount, :vatAmount, :itemDueDate, NOW(), :actor, NOW(), :actor, FALSE
                    WHERE NOT EXISTS (SELECT 1 FROM restored)
                    ON CONFLICT (order_id, line_no) DO UPDATE SET
                      product_id = EXCLUDED.product_id,
                      item_name = EXCLUDED.item_name,
                      quantity = EXCLUDED.quantity,
                      unit_price = EXCLUDED.unit_price,
                      supply_amount = EXCLUDED.supply_amount,
                      vat_amount = EXCLUDED.vat_amount,
                      item_due_date = EXCLUDED.item_due_date,
                      modified_at = NOW(),
                      modified_by = EXCLUDED.modified_by
                    RETURNING id
                )
                SELECT id FROM restored
                UNION ALL
                SELECT id FROM upserted
                LIMIT 1
                """, lineParams(orderId, lineNo, row, actor, productId), UUID.class);
    }

    private void recalcTotals(UUID orderId, String actor) {
        jdbcTemplate.update("""
                UPDATE orders o
                   SET total_supply_amount = x.supply,
                       total_vat_amount = x.vat,
                       modified_at = NOW(),
                       modified_by = :actor
                  FROM (
                      SELECT order_id, COALESCE(SUM(supply_amount), 0) supply, COALESCE(SUM(vat_amount), 0) vat
                        FROM order_lines
                       WHERE order_id = :orderId AND is_deleted = FALSE
                       GROUP BY order_id
                  ) x
                 WHERE o.id = x.order_id
                """, new MapSqlParameterSource("orderId", orderId).addValue("actor", actor));
    }

    private String findSalesSlip(ValidatedRow row) {
        List<String> rows = jdbcTemplate.query("""
                SELECT slip_no
                  FROM sales_accounting_slips
                 WHERE slip_no IN (:canonical, :legacy)
                   AND is_deleted = FALSE
                 ORDER BY CASE WHEN slip_no = :canonical THEN 0 ELSE 1 END
                 LIMIT 1
                """, new MapSqlParameterSource()
                .addValue("canonical", row.orderNo())
                .addValue("legacy", row.row().legacyOrderNo()),
                (rs, rowNum) -> rs.getString("slip_no"));
        return rows.isEmpty() ? null : rows.get(0);
    }

    private void linkSalesSlip(UUID orderId, String linkedSlipNo, String actor) {
        jdbcTemplate.update("""
                UPDATE orders
                   SET linked_slip_no = :linkedSlipNo,
                       modified_at = NOW(),
                       modified_by = :actor
                 WHERE id = :orderId
                """, new MapSqlParameterSource()
                .addValue("orderId", orderId)
                .addValue("linkedSlipNo", linkedSlipNo)
                .addValue("actor", actor));
    }

    private void updateStatus(StagingRow row, String status, String reason) {
        jdbcTemplate.update("""
                UPDATE staging.ecount_order_raw
                   SET transform_status = :status,
                       reject_reason = :reason,
                       modified_at = NOW()
                 WHERE source_file_hash = :hash
                   AND source_row_no = :row
                """, new MapSqlParameterSource()
                .addValue("status", status)
                .addValue("reason", reason)
                .addValue("hash", row.sourceFileHash())
                .addValue("row", row.sourceRowNo()));
    }

    private boolean existsAny(String externalRef) {
        Integer count = jdbcTemplate.queryForObject("""
                SELECT COUNT(1)
                  FROM orders
                 WHERE external_ref = :externalRef
                """, new MapSqlParameterSource("externalRef", externalRef), Integer.class);
        return count != null && count > 0;
    }

    private void rejectGroup(List<ValidatedRow> group, String code, String message,
                             EcountMig8TransformResult.Builder result) {
        for (ValidatedRow row : group) {
            updateStatus(row.row(), "REJECTED", message);
            result.reject(row.row().sourceRowNo(), code, message, row.orderNo(), row.row().externalRef());
        }
    }

    private static DuplicateReject duplicateReject(DuplicateKeyException ex) {
        String message = mostSpecificMessage(ex);
        if (message.contains("orders_external_ref_uk")) {
            return new DuplicateReject(ErrorCode.MIG8_DUPLICATE_EXTERNAL_REF,
                    "MIG-8 external_ref 중복 constraint=orders_external_ref_uk: " + message);
        }
        if (message.contains("orders_order_no_uk")) {
            return new DuplicateReject(ErrorCode.CONFLICT,
                    "MIG-8 order_no 중복 constraint=orders_order_no_uk: " + message);
        }
        return null;
    }

    private static String mostSpecificMessage(DuplicateKeyException ex) {
        Throwable cause = ex.getMostSpecificCause();
        String message = cause == null ? ex.getMessage() : cause.getMessage();
        return message == null ? ex.toString() : message;
    }

    private MapSqlParameterSource orderParams(ValidatedRow row, PartnerSummary partner, String actor) {
        StagingRow raw = row.row();
        return new MapSqlParameterSource()
                .addValue("orderNo", row.orderNo())
                .addValue("partnerId", partner.partnerId())
                .addValue("partnerName", partner.name() == null ? raw.partnerName() : partner.name())
                .addValue("managerName", EcountCsvSupport.nullIfBlank(raw.managerName()))
                .addValue("validUntil", row.validUntil())
                .addValue("paymentTerms", EcountCsvSupport.nullIfBlank(raw.paymentTerms()))
                .addValue("reference", EcountCsvSupport.nullIfBlank(raw.reference()))
                .addValue("progressStatus", row.progressStatus().name())
                .addValue("externalRef", raw.externalRef())
                .addValue("actor", actor);
    }

    private MapSqlParameterSource lineParams(UUID orderId, int lineNo, ValidatedRow row, String actor,
                                             UUID productId) {
        StagingRow raw = row.row();
        String itemName = EcountCsvSupport.stripCell(raw.itemName());
        return new MapSqlParameterSource()
                .addValue("orderId", orderId)
                .addValue("lineNo", lineNo)
                .addValue("productId", productId)
                .addValue("itemName", itemName)
                .addValue("quantity", raw.quantity())
                .addValue("unitPrice", raw.unitPrice())
                .addValue("supplyAmount", raw.supplyAmount())
                .addValue("vatAmount", raw.vatAmount())
                .addValue("itemDueDate", raw.itemDueDate())
                .addValue("actor", actor);
    }

    private UUID lookupProductId(String itemName, Map<String, UUID> productAliasCache) {
        if (itemName == null || itemName.isBlank()) {
            return null;
        }
        if (productAliasCache == null) {
            return null;
        }
        UUID exact = productAliasCache.get(itemName);
        return exact != null ? exact : productAliasCache.get(aliasToken(itemName));
    }

    private static List<String> lookupCandidates(String itemName) {
        if (itemName == null || itemName.isBlank()) {
            return List.of();
        }
        String token = aliasToken(itemName);
        return token.equals(itemName) ? List.of(itemName) : List.of(itemName, token);
    }

    private static String aliasToken(String itemName) {
        String normalized = EcountCsvSupport.stripCell(itemName);
        if (normalized.isEmpty()) {
            return normalized;
        }
        int end = normalized.length();
        for (int i = 0; i < normalized.length(); i++) {
            char c = normalized.charAt(i);
            if (Character.isWhitespace(c) || c == '[' || c == '(') {
                end = i;
                break;
            }
        }
        return normalized.substring(0, end);
    }

    private static String productLookupMissMessage(ValidatedRow row, String itemName) {
        return "품목 alias lookup miss: sourceRowNo=" + row.row().sourceRowNo()
                + ", itemName='" + itemName + "', aliasToken='" + aliasToken(itemName) + "'";
    }

    private void acquireTransformLock() {
        jdbcTemplate.queryForObject("SELECT pg_advisory_xact_lock(:lockKey)",
                new MapSqlParameterSource("lockKey",
                        EcountCsvSupport.advisoryLockKey(TRANSFORM_LOCK_NAMESPACE, "MIG8_ORDER_TRANSFORM")),
                Object.class);
    }

    private static LocalDate parseOptionalDate(String raw, StagingRow row, String field) {
        String value = EcountCsvSupport.stripCell(raw);
        if (value.isEmpty()) {
            return null;
        }
        try {
            return LocalDate.parse(value.replace('.', '-').replace('/', '-'));
        } catch (DateTimeParseException ex) {
            throw new BusinessException(ErrorCode.MIG8_DATE_INVALID,
                    field + " 일자 파싱 실패: sourceRowNo=" + row.sourceRowNo()
                            + ", value='" + raw + "'", ex);
        }
    }

    private static String sampleRawValue(StagingRow row, BusinessException ex) {
        return switch (ex.getErrorCode()) {
            case MIG8_AMOUNT_INVALID -> row.quantity() == null ? null : row.quantity().toPlainString();
            case MIG8_DATE_INVALID -> row.orderNo();
            case MIG8_LOOKUP_MISS -> row.partnerName();
            case MIG8_PROGRESS_STATUS_INVALID -> row.progressStatus();
            case MIG8_DUPLICATE_EXTERNAL_REF -> row.externalRef();
            default -> row.externalRef();
        };
    }

    private static String normalizeActor(String actorUserId) {
        return actorUserId == null || actorUserId.isBlank() ? "system" : actorUserId;
    }

    record StagingRow(String sourceFileHash, int sourceRowNo, String orderNo, String legacyOrderNo,
                      LocalDate orderDate, String partnerName, String managerName, String validUntil,
                      String paymentTerms, String reference, String progressStatus, String itemName,
                      BigDecimal quantity, BigDecimal unitPrice, BigDecimal supplyAmount,
                      BigDecimal vatAmount, LocalDate itemDueDate, String externalRef) {
    }

    record ValidatedRow(StagingRow row, String orderNo, OrderProgressStatus progressStatus,
                        LocalDate validUntil) {
    }

    private record DuplicateReject(ErrorCode code, String message) {
    }
}
