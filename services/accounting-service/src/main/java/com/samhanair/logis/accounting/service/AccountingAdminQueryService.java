package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.domain.Order;
import com.samhanair.logis.accounting.domain.OrderLine;
import com.samhanair.logis.accounting.domain.OrderProgressStatus;
import com.samhanair.logis.accounting.repository.OrderRepository;
import com.samhanair.logis.accounting.util.DocumentNumberPathResolver;
import com.samhanair.logis.accounting.web.dto.LedgerStagingResponse;
import com.samhanair.logis.accounting.web.dto.OrderDetailResponse;
import com.samhanair.logis.accounting.web.dto.OrderSummaryResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import jakarta.persistence.criteria.Predicate;
import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** MIG-14 admin 주문/원장 전용 읽기 service. */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AccountingAdminQueryService {

    private final OrderRepository orderRepository;
    private final NamedParameterJdbcTemplate jdbcTemplate;

    public Page<OrderSummaryResponse> listOrders(
            OrderProgressStatus progressStatus, String managerName, String partnerName, Pageable pageable) {
        return orderRepository.findAll(orderSpec(progressStatus, managerName, partnerName), pageable)
                .map(this::toOrderSummary);
    }

    public OrderDetailResponse getOrderDetail(String orderNo) {
        Order order = orderRepository.findByOrderNo(orderNo)
                .or(() -> orderRepository.findByOrderNo(DocumentNumberPathResolver.toSlashDocumentNo(orderNo)))
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "주문서를 찾을 수 없습니다: " + orderNo));
        return toOrderDetail(order);
    }

    public Page<LedgerStagingResponse> listSalesLedger(
            LocalDate from, LocalDate to, String partnerName, String transformStatus, Pageable pageable) {
        return listLedger("staging.ecount_sales_ledger_raw", "SALES", from, to,
                partnerName, transformStatus, pageable);
    }

    public Page<LedgerStagingResponse> listPurchaseLedger(
            LocalDate from, LocalDate to, String partnerName, String transformStatus, Pageable pageable) {
        return listLedger("staging.ecount_purchase_ledger_raw", "PURCHASE", from, to,
                partnerName, transformStatus, pageable);
    }

    private Page<LedgerStagingResponse> listLedger(String tableName, String closingKind,
                                                   LocalDate from, LocalDate to,
                                                   String partnerName, String transformStatus,
                                                   Pageable pageable) {
        MapSqlParameterSource params = new MapSqlParameterSource()
                .addValue("from", from)
                .addValue("to", to)
                .addValue("partnerName", like(partnerName))
                .addValue("transformStatus", blankToNull(transformStatus))
                .addValue("closingKind", closingKind)
                .addValue("limit", pageable.getPageSize())
                .addValue("offset", pageable.getOffset());
        String where = ledgerWhereClause();
        long total = jdbcTemplate.queryForObject("""
                SELECT COUNT(1)
                  FROM %s
                 %s
                """.formatted(tableName, where), params, Long.class);
        List<LedgerStagingResponse> rows = jdbcTemplate.query("""
                WITH filtered AS (
                    SELECT *
                      FROM %s
                     %s
                ), raw_totals AS (
                    SELECT transaction_date, COALESCE(SUM(total_amount), 0) AS raw_daily_total
                      FROM %s
                     WHERE is_deleted = FALSE
                     GROUP BY transaction_date
                ), closing_totals AS (
                    SELECT closing_date, COALESCE(SUM(total_amount), 0) AS closing_daily_total
                      FROM daily_closings
                     WHERE is_deleted = FALSE
                       AND closing_kind = :closingKind
                     GROUP BY closing_date
                )
                SELECT f.transaction_ref, f.transaction_date, f.sequence_no,
                       f.transaction_type, f.electronic_type, f.partner_code, f.partner_name,
                       f.description, f.supply_amount, f.vat_amount, f.total_amount,
                       f.transform_status, f.reject_reason, f.imported_at,
                       COALESCE(r.raw_daily_total, 0) AS raw_daily_total,
                       COALESCE(c.closing_daily_total, 0) AS closing_daily_total,
                       COALESCE(r.raw_daily_total, 0) - COALESCE(c.closing_daily_total, 0) AS daily_diff
                  FROM filtered f
                  LEFT JOIN raw_totals r ON r.transaction_date = f.transaction_date
                  LEFT JOIN closing_totals c ON c.closing_date = f.transaction_date
                 ORDER BY f.transaction_date DESC NULLS LAST, f.sequence_no DESC NULLS LAST,
                          f.source_row_no DESC
                 LIMIT :limit OFFSET :offset
                """.formatted(tableName, where, tableName), params, this::mapLedger);
        return new PageImpl<>(rows, pageable, total);
    }

    private static String ledgerWhereClause() {
        return """
                WHERE is_deleted = FALSE
                  AND (CAST(:from AS date) IS NULL OR transaction_date >= CAST(:from AS date))
                  AND (CAST(:to AS date) IS NULL OR transaction_date <= CAST(:to AS date))
                  AND (CAST(:partnerName AS text) IS NULL OR LOWER(COALESCE(partner_name, '')) LIKE CAST(:partnerName AS text) ESCAPE '\\')
                  AND (CAST(:transformStatus AS text) IS NULL OR transform_status = CAST(:transformStatus AS text))
                """;
    }

    private static Specification<Order> orderSpec(
            OrderProgressStatus progressStatus, String managerName, String partnerName) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new java.util.ArrayList<>();
            if (progressStatus != null) {
                predicates.add(cb.equal(root.get("progressStatus"), progressStatus));
            }
            if (notBlank(managerName)) {
                predicates.add(cb.like(cb.lower(root.get("managerName")), likeLiteral(managerName), '\\'));
            }
            if (notBlank(partnerName)) {
                predicates.add(cb.like(cb.lower(root.get("partnerName")), likeLiteral(partnerName), '\\'));
            }
            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }

    private OrderSummaryResponse toOrderSummary(Order order) {
        return new OrderSummaryResponse(
                order.getOrderNo(),
                order.getPartnerName(),
                order.getManagerName(),
                order.getProgressStatus().name(),
                order.getLinkedSlipNo(),
                order.getValidUntil(),
                order.getTotalSupplyAmount(),
                order.getTotalVatAmount(),
                order.getTotalSupplyAmount().add(order.getTotalVatAmount()),
                (int) order.getLines().stream().filter(line -> line.getProductId() == null).count());
    }

    private OrderDetailResponse toOrderDetail(Order order) {
        List<OrderDetailResponse.LineResponse> lines = order.getLines().stream()
                .sorted(java.util.Comparator.comparingInt(OrderLine::getLineNo))
                .map(line -> new OrderDetailResponse.LineResponse(
                        line.getLineNo(),
                        line.getItemName(),
                        line.getQuantity(),
                        line.getUnitPrice(),
                        line.getSupplyAmount(),
                        line.getVatAmount(),
                        line.getSupplyAmount().add(line.getVatAmount()),
                        line.getItemDueDate(),
                        line.getProductId() == null))
                .toList();
        return new OrderDetailResponse(
                order.getOrderNo(),
                order.getPartnerName(),
                order.getManagerName(),
                order.getProgressStatus().name(),
                order.getLinkedSlipNo(),
                order.getValidUntil(),
                order.getPaymentTerms(),
                order.getReference(),
                order.getTotalSupplyAmount(),
                order.getTotalVatAmount(),
                order.getTotalSupplyAmount().add(order.getTotalVatAmount()),
                lines);
    }

    private LedgerStagingResponse mapLedger(ResultSet rs, int rowNum) throws SQLException {
        return new LedgerStagingResponse(
                rs.getString("transaction_ref"),
                getLocalDate(rs, "transaction_date"),
                (Integer) rs.getObject("sequence_no"),
                rs.getString("transaction_type"),
                rs.getString("electronic_type"),
                rs.getString("partner_code"),
                rs.getString("partner_name"),
                rs.getString("description"),
                rs.getBigDecimal("supply_amount"),
                rs.getBigDecimal("vat_amount"),
                rs.getBigDecimal("total_amount"),
                rs.getString("transform_status"),
                rs.getString("reject_reason"),
                rs.getTimestamp("imported_at").toLocalDateTime(),
                nullToZero(rs.getBigDecimal("raw_daily_total")),
                nullToZero(rs.getBigDecimal("closing_daily_total")),
                nullToZero(rs.getBigDecimal("daily_diff")));
    }

    private static LocalDate getLocalDate(ResultSet rs, String column) throws SQLException {
        java.sql.Date date = rs.getDate(column);
        return date == null ? null : date.toLocalDate();
    }

    private static BigDecimal nullToZero(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }

    private static String like(String value) {
        return notBlank(value) ? likeLiteral(value) : null;
    }

    private static String likeLiteral(String value) {
        return "%" + value.trim().toLowerCase(java.util.Locale.ROOT)
                .replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
    }

    private static String blankToNull(String value) {
        return notBlank(value) ? value.trim() : null;
    }

    private static boolean notBlank(String value) {
        return value != null && !value.isBlank();
    }
}
