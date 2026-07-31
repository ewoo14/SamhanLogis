package com.samhanair.logis.partnerorder.mig8.service;

import com.samhanair.logis.partnerorder.client.ProductClient;
import com.samhanair.logis.partnerorder.client.ProductSummary;
import com.samhanair.logis.partnerorder.domain.PartnerOrderStatus;
import com.samhanair.logis.partnerorder.domain.SlipPublishStatus;
import com.samhanair.logis.partnerorder.mig8.client.AccountingMig8OrderClient;
import com.samhanair.logis.partnerorder.mig8.client.Mig8OrderExport;
import com.samhanair.logis.partnerorder.mig8.client.Mig8OrderLineExport;
import com.samhanair.logis.partnerorder.mig8.client.Mig8OrderPage;
import com.samhanair.logis.partnerorder.mig8.client.PartnerMig8LookupClient;
import com.samhanair.logis.partnerorder.mig8.client.PartnerMig8Summary;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * accounting MIG-8 주문을 partner_order_db native 주문으로 멱등 이식한다.
 *
 * <p>가짜 거래처/품목 row 를 만들지 않는다. partner/product lookup miss 는 주문 단위 reject 로
 * 카운트하고, native insert 는 deterministic UUID + idempotency_key 로 재실행 안정성을 보장한다.
 */
@Service
@RequiredArgsConstructor
public class Mig8OrderImportService {

    private static final Logger log = LoggerFactory.getLogger(Mig8OrderImportService.class);
    private static final String ACTOR = "system-mig8-import";
    private static final int DEFAULT_BATCH_SIZE = 200;
    private static final int MAX_BATCH_SIZE = 500;
    private static final ThreadLocal<Integer> INVALID_LINE_NO = new ThreadLocal<>();

    private final AccountingMig8OrderClient accountingMig8OrderClient;
    private final PartnerMig8LookupClient partnerMig8LookupClient;
    private final ProductClient productClient;
    private final JdbcTemplate jdbcTemplate;
    private final TransactionTemplate transactionTemplate;

    public Mig8OrderImportResult importMig8Orders(Integer batchSize) {
        int size = normalizeBatchSize(batchSize);
        Mig8OrderImportResult total = Mig8OrderImportResult.empty();
        for (int page = 0; ; page++) {
            Mig8OrderPage orderPage = accountingMig8OrderClient.fetchMig8Orders(page, size);
            List<Mig8OrderExport> orders = orderPage.content();
            for (Mig8OrderExport order : orders) {
                total = total.plus(Mig8OrderImportResult.fetched()).plus(importOneSafely(order));
            }
            if (orderPage.last() || orders.isEmpty()) {
                return total;
            }
        }
    }

    private Mig8OrderImportResult importOneSafely(Mig8OrderExport order) {
        try {
            Mig8OrderImportResult result = transactionTemplate.execute(status -> importOne(order));
            return result == null ? rejected(order, null, "트랜잭션 결과 없음") : result;
        } catch (RuntimeException ex) {
            log.warn("MIG-8 주문 이식 reject — orderNo={} cause={}", order == null ? null : order.orderNo(),
                    ex.getMessage());
            return rejected(order, null, "런타임 예외: " + safeMessage(ex));
        }
    }

    private Mig8OrderImportResult importOne(Mig8OrderExport order) {
        INVALID_LINE_NO.remove();
        if (order == null || isBlank(order.orderNo()) || order.partnerId() == null) {
            return rejected(order, null, "필수 주문 정보 누락");
        }
        String idempotencyKey = idempotencyKey(order.orderNo());
        if (alreadyImported(idempotencyKey)) {
            return Mig8OrderImportResult.skipped();
        }

        PartnerMig8Summary partner = partnerMig8LookupClient.findByPartnerId(order.partnerId())
                .filter(this::validPartner)
                .orElse(null);
        if (partner == null) {
            log.warn("MIG-8 주문 이식 reject — partner lookup miss orderNo={} partnerId={}",
                    order.orderNo(), order.partnerId());
            return rejected(order, null, "거래처 미해소");
        }

        List<Mig8OrderLineExport> lines = order.lines() == null ? List.of() : order.lines();
        Map<UUID, ProductSummary> products = lookupProducts(lines);
        if (lines.isEmpty() || hasInvalidLine(lines, products)) {
            log.warn("MIG-8 주문 이식 reject — product/line invalid orderNo={}", order.orderNo());
            return rejected(order, null, lines.isEmpty() ? "주문 라인 없음" : "구조 오류");
        }

        UUID orderId = deterministicId("samhan-mig8:partner-order:" + order.orderNo());
        PartnerOrderStatus status = mapStatus(order.progressStatus());
        SlipPublishStatus slipPublishStatus = hasText(order.linkedSlipNo())
                ? SlipPublishStatus.PUBLISHED
                : SlipPublishStatus.NOT_REQUIRED;
        LocalDateTime now = LocalDateTime.now();
        BigDecimal totalAmount = zero(order.totalSupplyAmount()).add(zero(order.totalVatAmount()));

        int inserted = jdbcTemplate.update("""
                INSERT INTO partner_orders (
                    id, partner_code, biz_code, order_no, slip_no, status, slip_publish_status,
                    total_amount, confirmed_at, slip_published_at, idempotency_key,
                    due_date, memo, source_estimate_id, revision_count, lock_version,
                    created_at, created_by, modified_at, modified_by, deleted_at, deleted_by, is_deleted
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, 0, ?, ?, NULL, NULL, NULL, NULL, FALSE)
                ON CONFLICT (idempotency_key) WHERE is_deleted = FALSE DO NOTHING
                """,
                orderId,
                partner.partnerCode(),
                partner.bizCode(),
                order.orderNo(),
                blankToNull(order.linkedSlipNo()),
                status.name(),
                slipPublishStatus.name(),
                totalAmount,
                status == PartnerOrderStatus.CONFIRMED ? now : null,
                slipPublishStatus == SlipPublishStatus.PUBLISHED ? now : null,
                idempotencyKey,
                order.validUntil(),
                blankToNull(order.reference()),
                now,
                ACTOR);
        if (inserted == 0) {
            return Mig8OrderImportResult.skipped();
        }

        for (Mig8OrderLineExport line : lines) {
            insertLine(orderId, order.orderNo(), line, products.get(line.productId()), now);
        }
        return Mig8OrderImportResult.created();
    }

    private void insertLine(UUID orderId, String orderNo, Mig8OrderLineExport line,
                            ProductSummary product, LocalDateTime now) {
        int quantity = quantity(line.quantity());
        BigDecimal subtotal = zero(line.supplyAmount()).add(zero(line.vatAmount()));
        BigDecimal priceVat = subtotal.divide(BigDecimal.valueOf(quantity), 2, RoundingMode.HALF_UP);
        jdbcTemplate.update("""
                INSERT INTO partner_order_lines (
                    id, partner_order_id, product_id, model_name, product_name, category_key,
                    quantity, price_vat, subtotal, supply_amount, vat_amount, remark, converted_quantity,
                    created_at, created_by, modified_at, modified_by, deleted_at, deleted_by, is_deleted
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL, NULL, NULL, NULL, FALSE)
                """,
                deterministicId("samhan-mig8:partner-order-line:" + orderNo + ":" + line.lineNo()),
                orderId,
                product == null ? null : line.productId(),
                product == null ? unresolvedModelName(line.itemName()) : product.modelName(),
                product == null ? unresolvedItemName(line.itemName()) : product.name(),
                product == null ? "UNRESOLVED" : product.categoryKey(),
                quantity,
                priceVat,
                subtotal,
                zero(line.supplyAmount()),
                zero(line.vatAmount()),
                0,
                now,
                ACTOR);
    }

    private Map<UUID, ProductSummary> lookupProducts(List<Mig8OrderLineExport> lines) {
        List<UUID> productIds = lines.stream()
                .map(Mig8OrderLineExport::productId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        if (productIds.isEmpty()) {
            return Map.of();
        }
        try {
            return productClient.lookup(productIds).stream()
                    .collect(Collectors.toMap(ProductSummary::id, p -> p, (a, b) -> a, HashMap::new));
        } catch (RuntimeException ex) {
            log.warn("MIG-8 product lookup 실패 — reject 처리 msg={}", ex.getMessage());
            return Map.of();
        }
    }

    private boolean hasInvalidLine(List<Mig8OrderLineExport> lines, Map<UUID, ProductSummary> products) {
        for (Mig8OrderLineExport line : lines) {
            if (line == null || line.lineNo() <= 0) {
                if (line != null) INVALID_LINE_NO.set(line.lineNo());
                return true;
            }
            ProductSummary product = products.get(line.productId());
            if (line.productId() != null && (product == null || isBlank(product.modelName()) || isBlank(product.name())
                    || isBlank(product.categoryKey()))) {
                INVALID_LINE_NO.set(line.lineNo());
                return true;
            }
            try {
                quantity(line.quantity());
            } catch (RuntimeException ex) {
                INVALID_LINE_NO.set(line.lineNo());
                return true;
            }
        }
        return false;
    }

    private boolean alreadyImported(String idempotencyKey) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM partner_orders WHERE idempotency_key = ? AND is_deleted = FALSE",
                Integer.class,
                idempotencyKey);
        return count != null && count > 0;
    }

    private PartnerOrderStatus mapStatus(String progressStatus) {
        return switch (progressStatus == null ? "" : progressStatus.trim()) {
            case "COMPLETED" -> PartnerOrderStatus.CONFIRMED;
            case "IN_PROGRESS", "PENDING" -> PartnerOrderStatus.DRAFT;
            case "CANCELED" -> PartnerOrderStatus.CANCELED;
            default -> throw new IllegalArgumentException("MIG-8 progressStatus 미지원: " + progressStatus);
        };
    }

    private int quantity(BigDecimal quantity) {
        if (quantity == null) {
            throw new IllegalArgumentException("quantity 필수");
        }
        int value = quantity.intValueExact();
        if (value <= 0) {
            throw new IllegalArgumentException("quantity 는 1 이상");
        }
        return value;
    }

    private boolean validPartner(PartnerMig8Summary partner) {
        return partner != null && hasText(partner.partnerCode()) && hasText(partner.bizCode());
    }

    private int normalizeBatchSize(Integer batchSize) {
        if (batchSize == null || batchSize <= 0) {
            return DEFAULT_BATCH_SIZE;
        }
        return Math.min(batchSize, MAX_BATCH_SIZE);
    }

    private static UUID deterministicId(String key) {
        return UUID.nameUUIDFromBytes(key.getBytes(StandardCharsets.UTF_8));
    }

    private static String idempotencyKey(String orderNo) {
        return "ecount-mig8:" + orderNo;
    }

    private static BigDecimal zero(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private static String blankToNull(String value) {
        return isBlank(value) ? null : value.trim();
    }

    private static Mig8OrderImportResult rejected(Mig8OrderExport order, Integer lineNo, String reason) {
        Integer resolvedLineNo = lineNo == null ? INVALID_LINE_NO.get() : lineNo;
        return Mig8OrderImportResult.rejected(order == null ? null : order.orderNo(), resolvedLineNo, reason);
    }

    private static String safeMessage(RuntimeException ex) {
        return ex.getMessage() == null || ex.getMessage().isBlank()
                ? ex.getClass().getSimpleName() : ex.getMessage();
    }

    private static String unresolvedModelName(String itemName) {
        return hasText(itemName) ? "미해소: " + itemName : "미해소 품목";
    }

    private static String unresolvedItemName(String itemName) {
        return hasText(itemName) ? itemName : "미해소 품목";
    }
}
