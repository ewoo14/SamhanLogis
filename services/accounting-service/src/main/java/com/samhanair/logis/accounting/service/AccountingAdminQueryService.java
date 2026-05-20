package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.domain.CashDisbursement;
import com.samhanair.logis.accounting.domain.CashKind;
import com.samhanair.logis.accounting.domain.CashReceipt;
import com.samhanair.logis.accounting.domain.CashReceiptKind;
import com.samhanair.logis.accounting.domain.Journal;
import com.samhanair.logis.accounting.domain.Order;
import com.samhanair.logis.accounting.domain.OrderLine;
import com.samhanair.logis.accounting.domain.OrderProgressStatus;
import com.samhanair.logis.accounting.repository.CashDisbursementRepository;
import com.samhanair.logis.accounting.repository.CashReceiptRepository;
import com.samhanair.logis.accounting.repository.JournalRepository;
import com.samhanair.logis.accounting.repository.OrderRepository;
import com.samhanair.logis.accounting.web.dto.CashDisbursementResponse;
import com.samhanair.logis.accounting.web.dto.CashReceiptResponse;
import com.samhanair.logis.accounting.web.dto.LedgerStagingResponse;
import com.samhanair.logis.accounting.web.dto.OrderDetailResponse;
import com.samhanair.logis.accounting.web.dto.OrderSummaryResponse;
import com.samhanair.logis.accounting.web.dto.PartnerAgingSnapshotResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import jakarta.persistence.criteria.Predicate;
import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** MIG-14 admin 4 화면 전용 읽기 service. */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AccountingAdminQueryService {

    private static final int AGING_LIMIT = 500;

    private final CashDisbursementRepository cashDisbursementRepository;
    private final CashReceiptRepository cashReceiptRepository;
    private final OrderRepository orderRepository;
    private final JournalRepository journalRepository;
    private final PartnerLookupClient partnerLookupClient;
    private final NamedParameterJdbcTemplate jdbcTemplate;

    public Page<CashDisbursementResponse> listCashDisbursements(
            String slipNo, CashKind kind, LocalDate from, LocalDate to, Pageable pageable) {
        Page<CashDisbursement> page = cashDisbursementRepository.findAll(
                cashDisbursementSpec(slipNo, kind, from, to), pageable);
        Map<UUID, String> partnerNames = partnerNames(page.getContent().stream()
                .map(CashDisbursement::getPartnerId)
                .collect(Collectors.toSet()));
        Map<UUID, String> journalNos = journalNos(page.getContent().stream()
                .map(CashDisbursement::getJournalId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet()));
        List<CashDisbursementResponse> rows = page.getContent().stream()
                .map(row -> new CashDisbursementResponse(
                        row.getSlipNo(),
                        partnerNames.get(row.getPartnerId()),
                        row.getAmount(),
                        row.getTransactionDate(),
                        row.getKind().name(),
                        row.getMemo(),
                        journalNo(journalNos, row.getJournalId())))
                .toList();
        return new PageImpl<>(rows, pageable, page.getTotalElements());
    }

    public Page<CashReceiptResponse> listCashReceipts(
            String slipNo, CashReceiptKind kind, LocalDate from, LocalDate to, Pageable pageable) {
        Page<CashReceipt> page = cashReceiptRepository.findAll(
                cashReceiptSpec(slipNo, kind, from, to), pageable);
        Map<UUID, String> partnerNames = partnerNames(page.getContent().stream()
                .map(CashReceipt::getPartnerId)
                .collect(Collectors.toSet()));
        Map<UUID, String> journalNos = journalNos(page.getContent().stream()
                .map(CashReceipt::getJournalId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet()));
        List<CashReceiptResponse> rows = page.getContent().stream()
                .map(row -> new CashReceiptResponse(
                        row.getSlipNo(),
                        partnerNames.get(row.getPartnerId()),
                        row.getAmount(),
                        row.getTransactionDate(),
                        row.getKind().name(),
                        row.getMemo(),
                        journalNo(journalNos, row.getJournalId())))
                .toList();
        return new PageImpl<>(rows, pageable, page.getTotalElements());
    }

    public Page<OrderSummaryResponse> listOrders(
            OrderProgressStatus progressStatus, String managerName, String partnerName, Pageable pageable) {
        return orderRepository.findAll(orderSpec(progressStatus, managerName, partnerName), pageable)
                .map(this::toOrderSummary);
    }

    public OrderDetailResponse getOrderDetail(String orderNo) {
        Order order = orderRepository.findByOrderNo(orderNo)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "주문서를 찾을 수 없습니다: " + orderNo));
        return toOrderDetail(order);
    }

    public List<PartnerAgingSnapshotResponse> listAgingSnapshot(String partnerName, String sort) {
        String orderBy = switch (sort == null ? "" : sort) {
            case "net_payable_desc" -> "net_payable DESC, partner_name ASC NULLS LAST";
            case "net_cash_desc" -> "net_cash DESC, partner_name ASC NULLS LAST";
            case "partner_name_asc" -> "partner_name ASC NULLS LAST";
            default -> "net_receivable DESC, partner_name ASC NULLS LAST";
        };
        MapSqlParameterSource params = new MapSqlParameterSource()
                .addValue("partnerName", like(partnerName))
                .addValue("limit", AGING_LIMIT);
        return jdbcTemplate.query("""
                SELECT partner_name, total_receivable, total_payable, total_receipt,
                       total_disbursement, net_receivable, net_payable, net_cash,
                       last_refreshed_at
                  FROM partner_aging_snapshot
                 WHERE (:partnerName IS NULL OR LOWER(COALESCE(partner_name, '')) LIKE :partnerName)
                 ORDER BY %s
                 LIMIT :limit
                """.formatted(orderBy), params, this::mapAging);
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
                    SELECT *,
                           COALESCE(SUM(total_amount) OVER (PARTITION BY transaction_date), 0) AS raw_daily_total
                      FROM %s
                     %s
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
                       f.raw_daily_total,
                       COALESCE(c.closing_daily_total, 0) AS closing_daily_total,
                       f.raw_daily_total - COALESCE(c.closing_daily_total, 0) AS daily_diff
                  FROM filtered f
                  LEFT JOIN closing_totals c ON c.closing_date = f.transaction_date
                 ORDER BY f.transaction_date DESC NULLS LAST, f.sequence_no DESC NULLS LAST,
                          f.source_row_no DESC
                 LIMIT :limit OFFSET :offset
                """.formatted(tableName, where), params, this::mapLedger);
        return new PageImpl<>(rows, pageable, total);
    }

    private static String ledgerWhereClause() {
        return """
                WHERE is_deleted = FALSE
                  AND (:from IS NULL OR transaction_date >= :from)
                  AND (:to IS NULL OR transaction_date <= :to)
                  AND (:partnerName IS NULL OR LOWER(COALESCE(partner_name, '')) LIKE :partnerName)
                  AND (:transformStatus IS NULL OR transform_status = :transformStatus)
                """;
    }

    private static Specification<CashDisbursement> cashDisbursementSpec(
            String slipNo, CashKind kind, LocalDate from, LocalDate to) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new java.util.ArrayList<>();
            if (notBlank(slipNo)) {
                predicates.add(cb.like(cb.lower(root.get("slipNo")), likeLiteral(slipNo)));
            }
            if (kind != null) {
                predicates.add(cb.equal(root.get("kind"), kind));
            }
            if (from != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("transactionDate"), from));
            }
            if (to != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("transactionDate"), to));
            }
            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }

    private static Specification<CashReceipt> cashReceiptSpec(
            String slipNo, CashReceiptKind kind, LocalDate from, LocalDate to) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new java.util.ArrayList<>();
            if (notBlank(slipNo)) {
                predicates.add(cb.like(cb.lower(root.get("slipNo")), likeLiteral(slipNo)));
            }
            if (kind != null) {
                predicates.add(cb.equal(root.get("kind"), kind));
            }
            if (from != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("transactionDate"), from));
            }
            if (to != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("transactionDate"), to));
            }
            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }

    private static Specification<Order> orderSpec(
            OrderProgressStatus progressStatus, String managerName, String partnerName) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new java.util.ArrayList<>();
            if (progressStatus != null) {
                predicates.add(cb.equal(root.get("progressStatus"), progressStatus));
            }
            if (notBlank(managerName)) {
                predicates.add(cb.like(cb.lower(root.get("managerName")), likeLiteral(managerName)));
            }
            if (notBlank(partnerName)) {
                predicates.add(cb.like(cb.lower(root.get("partnerName")), likeLiteral(partnerName)));
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
                order.getTotalSupplyAmount().add(order.getTotalVatAmount()));
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
                        line.getItemDueDate()))
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

    private Map<UUID, String> partnerNames(Set<UUID> partnerIds) {
        Map<UUID, String> result = new LinkedHashMap<>();
        for (UUID partnerId : partnerIds) {
            result.put(partnerId, partnerLookupClient.findByPartnerId(partnerId)
                    .map(AccountingAdminQueryService::partnerDisplayName)
                    .orElse(null));
        }
        return result;
    }

    private Map<UUID, String> journalNos(Set<UUID> journalIds) {
        if (journalIds.isEmpty()) {
            return Map.of();
        }
        Map<UUID, String> result = new HashMap<>();
        for (Journal journal : journalRepository.findAllById(journalIds)) {
            result.put(journal.getId(), journal.getJournalNo());
        }
        return result;
    }

    private static String journalNo(Map<UUID, String> journalNos, UUID journalId) {
        return journalId == null ? null : journalNos.get(journalId);
    }

    private static String partnerDisplayName(PartnerSummary summary) {
        return notBlank(summary.name()) ? summary.name() : summary.partnerCode();
    }

    private PartnerAgingSnapshotResponse mapAging(ResultSet rs, int rowNum) throws SQLException {
        return new PartnerAgingSnapshotResponse(
                rs.getString("partner_name"),
                rs.getBigDecimal("total_receivable"),
                rs.getBigDecimal("total_payable"),
                rs.getBigDecimal("total_receipt"),
                rs.getBigDecimal("total_disbursement"),
                rs.getBigDecimal("net_receivable"),
                rs.getBigDecimal("net_payable"),
                rs.getBigDecimal("net_cash"),
                rs.getTimestamp("last_refreshed_at").toLocalDateTime());
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
        return "%" + value.trim().toLowerCase() + "%";
    }

    private static String blankToNull(String value) {
        return notBlank(value) ? value.trim() : null;
    }

    private static boolean notBlank(String value) {
        return value != null && !value.isBlank();
    }
}
