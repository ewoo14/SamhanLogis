package com.samhanair.logis.partnerorder.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import com.samhanair.logis.partnerorder.PartnerOrderServiceApplication;
import com.samhanair.logis.partnerorder.client.DcConfigClient;
import com.samhanair.logis.partnerorder.client.InventoryClient;
import com.samhanair.logis.partnerorder.client.PartnerAuthClient;
import com.samhanair.logis.partnerorder.client.ProductClient;
import com.samhanair.logis.partnerorder.client.ProductSummary;
import com.samhanair.logis.partnerorder.client.SlipServiceClient;
import com.samhanair.logis.partnerorder.mig8.client.AccountingMig8OrderClient;
import com.samhanair.logis.partnerorder.mig8.client.Mig8OrderExport;
import com.samhanair.logis.partnerorder.mig8.client.Mig8OrderLineExport;
import com.samhanair.logis.partnerorder.mig8.client.Mig8OrderPage;
import com.samhanair.logis.partnerorder.mig8.client.PartnerMig8LookupClient;
import com.samhanair.logis.partnerorder.mig8.client.PartnerMig8Summary;
import com.samhanair.logis.partnerorder.mig8.service.Mig8OrderImportResult;
import com.samhanair.logis.partnerorder.mig8.service.Mig8OrderImportService;
import com.samhanair.logis.partnerorder.vendor.client.PartnerLookupClient;
import com.samhanair.logis.partnerorder.vendor.client.ProductCatalogLookupClient;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * MIG-8 accounting.orders → partner_orders native 이식 IT.
 *
 * <p>실 Postgres(Flyway schema) 에 native INSERT 결과를 적재해 상태/금액/멱등/룩업 miss 거부를
 * 검증한다. accounting/partner/product 외부 의존은 전부 {@code @MockBean} 으로 격리한다.
 */
@SpringBootTest(classes = PartnerOrderServiceApplication.class)
class Mig8OrderImportServiceIT extends AbstractPostgresIT {

    private static final UUID PARTNER_ID = UUID.fromString("11111111-1111-1111-1111-111111111111");
    private static final UUID MISSING_PARTNER_ID = UUID.fromString("22222222-2222-2222-2222-222222222222");
    private static final UUID PRODUCT_A = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static final UUID PRODUCT_B = UUID.fromString("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    private static final UUID PRODUCT_MISSING = UUID.fromString("cccccccc-cccc-cccc-cccc-cccccccccccc");

    @Autowired private Mig8OrderImportService importService;
    @Autowired private JdbcTemplate jdbcTemplate;

    @MockBean private AccountingMig8OrderClient accountingMig8OrderClient;
    @MockBean private PartnerMig8LookupClient partnerMig8LookupClient;
    @MockBean private ProductClient productClient;
    @MockBean private DcConfigClient dcConfigClient;
    @MockBean private InventoryClient inventoryClient;
    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private PartnerAuthClient partnerAuthClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private ProductCatalogLookupClient catalogLookupClient;

    @BeforeEach
    void clean() {
        jdbcTemplate.execute("TRUNCATE TABLE partner_order_lines, partner_orders CASCADE");
        lenient().when(partnerMig8LookupClient.findByPartnerId(PARTNER_ID))
                .thenReturn(Optional.of(new PartnerMig8Summary(PARTNER_ID, "P-MIG8", "1234567890", "삼한테스트")));
        lenient().when(partnerMig8LookupClient.findByPartnerId(MISSING_PARTNER_ID))
                .thenReturn(Optional.empty());
        lenient().when(productClient.lookup(anyList())).thenAnswer(invocation -> {
            @SuppressWarnings("unchecked")
            List<UUID> ids = invocation.getArgument(0);
            return ids.stream()
                    .filter(id -> !PRODUCT_MISSING.equals(id))
                    .map(this::productSummary)
                    .toList();
        });
    }

    @Test
    void importMig8Orders_inserts_orders_and_lines_idempotently() {
        when(accountingMig8OrderClient.fetchMig8Orders(eq(0), eq(100)))
                .thenReturn(new Mig8OrderPage(successOrders(), false));
        when(accountingMig8OrderClient.fetchMig8Orders(eq(1), eq(100)))
                .thenReturn(new Mig8OrderPage(List.of(), true));

        Mig8OrderImportResult first = importService.importMig8Orders(100);

        assertThat(first.createdCount()).isEqualTo(3);
        assertThat(first.skippedCount()).isZero();
        assertThat(first.rejectedCount()).isZero();
        assertThat(count("partner_orders")).isEqualTo(3);
        assertThat(count("partner_order_lines")).isEqualTo(4);

        assertOrder("2026/06/20-1", "CONFIRMED", "PUBLISHED", "110000", "2026-07-20", "ref-complete");
        assertOrder("2026/06/20-2", "DRAFT", "NOT_REQUIRED", "330000", "2026-07-21", "ref-progress");
        assertOrder("2026/06/20-3", "CANCELED", "NOT_REQUIRED", "110000", "2026-07-22", "ref-canceled");
        assertLine("2026/06/20-1", PRODUCT_A, "MODEL-A", "제품 A", "homemulti", 2, "55000", "110000", 0);

        Mig8OrderImportResult second = importService.importMig8Orders(100);

        assertThat(second.createdCount()).isZero();
        assertThat(second.skippedCount()).isEqualTo(3);
        assertThat(second.rejectedCount()).isZero();
        assertThat(count("partner_orders")).isEqualTo(3);
        assertThat(count("partner_order_lines")).isEqualTo(4);
    }

    @Test
    void importMig8Orders_rejects_partner_or_product_lookup_miss_without_fake_rows() {
        when(accountingMig8OrderClient.fetchMig8Orders(eq(0), eq(50)))
                .thenReturn(new Mig8OrderPage(List.of(
                        order("2026/06/20-4", MISSING_PARTNER_ID, "COMPLETED", null, PRODUCT_A),
                        order("2026/06/20-5", PARTNER_ID, "COMPLETED", null, PRODUCT_MISSING)), true));

        Mig8OrderImportResult result = importService.importMig8Orders(50);

        assertThat(result.createdCount()).isZero();
        assertThat(result.skippedCount()).isZero();
        assertThat(result.rejectedCount()).isEqualTo(2);
        assertThat(result.rejectionDetails()).hasSize(2);
        assertThat(result.rejectionDetails()).extracting("orderNo")
                .containsExactlyInAnyOrder("2026/06/20-4", "2026/06/20-5");
        assertThat(result.rejectionDetails()).extracting("reason")
                .containsExactlyInAnyOrder("거래처 미해소", "구조 오류");
        assertThat(count("partner_orders")).isZero();
        assertThat(count("partner_order_lines")).isZero();
    }

    @Test
    void importMig8Orders_preserves_order_with_unresolved_line_without_making_it_convertible() {
        Mig8OrderLineExport resolved = line(1, PRODUCT_A);
        Mig8OrderLineExport unresolved = new Mig8OrderLineExport(
                2, null, "이카운트 미등록 품목", BigDecimal.ONE,
                BigDecimal.valueOf(20000), BigDecimal.valueOf(20000), BigDecimal.ZERO,
                LocalDate.of(2026, 7, 31));
        when(accountingMig8OrderClient.fetchMig8Orders(eq(0), eq(50)))
                .thenReturn(new Mig8OrderPage(List.of(orderWithLines(
                        "2026/06/20-unresolved", List.of(resolved, unresolved))), true));

        Mig8OrderImportResult result = importService.importMig8Orders(50);

        assertThat(result.createdCount()).isEqualTo(1);
        assertThat(result.rejectedCount()).isZero();
        assertThat(count("partner_orders")).isEqualTo(1);
        assertThat(count("partner_order_lines")).isEqualTo(2);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM partner_order_lines WHERE product_id IS NULL", Long.class))
                .isEqualTo(1);
    }

    @Test
    void importMig8Orders_reexecution_resolves_previous_unresolved_line_and_restores_convertibility() {
        Mig8OrderLineExport unresolved = line(1, PRODUCT_MISSING);
        Mig8OrderLineExport unresolvedAtFirstImport = new Mig8OrderLineExport(
                unresolved.lineNo(), null, unresolved.itemName(), unresolved.quantity(),
                unresolved.unitPrice(), unresolved.supplyAmount(), unresolved.vatAmount(),
                unresolved.itemDueDate());
        when(accountingMig8OrderClient.fetchMig8Orders(eq(0), eq(50)))
                .thenReturn(new Mig8OrderPage(List.of(orderWithLines(
                        "2026/06/20-recover", List.of(unresolvedAtFirstImport))), true))
                .thenReturn(new Mig8OrderPage(List.of(orderWithLines(
                        "2026/06/20-recover", List.of(unresolved))), true));
        when(productClient.lookup(anyList()))
                .thenReturn(List.of(productSummary(PRODUCT_MISSING)));

        Mig8OrderImportResult first = importService.importMig8Orders(50);

        assertThat(first.createdCount()).withFailMessage("첫 번째 실행 결과=%s", first).isEqualTo(1);

        Mig8OrderImportResult second = importService.importMig8Orders(50);

        assertThat(second.createdCount()).isZero();
        assertThat(second.skippedCount()).withFailMessage("두 번째 실행 결과=%s", second).isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT product_id FROM partner_order_lines l "
                        + "JOIN partner_orders o ON o.id = l.partner_order_id "
                        + "WHERE o.order_no = ?", UUID.class, "2026/06/20-recover"))
                .isEqualTo(PRODUCT_MISSING);
    }

    @Test
    void importMig8Orders_reexecution_keeps_order_blocked_when_another_line_is_still_unresolved() {
        Mig8OrderLineExport unresolvedFirst = new Mig8OrderLineExport(
                1, null, "해소 대기 A", BigDecimal.ONE, BigDecimal.valueOf(10000),
                BigDecimal.valueOf(10000), BigDecimal.ZERO, LocalDate.of(2026, 7, 31));
        Mig8OrderLineExport unresolvedSecond = new Mig8OrderLineExport(
                2, null, "해소 대기 B", BigDecimal.ONE, BigDecimal.valueOf(20000),
                BigDecimal.valueOf(20000), BigDecimal.ZERO, LocalDate.of(2026, 7, 31));
        Mig8OrderLineExport resolvedFirst = line(1, PRODUCT_A);
        when(accountingMig8OrderClient.fetchMig8Orders(eq(0), eq(50)))
                .thenReturn(new Mig8OrderPage(List.of(orderWithLines(
                        "2026/06/20-partial-recover", List.of(unresolvedFirst, unresolvedSecond))), true))
                .thenReturn(new Mig8OrderPage(List.of(orderWithLines(
                        "2026/06/20-partial-recover", List.of(resolvedFirst, unresolvedSecond))), true));
        when(productClient.lookup(anyList())).thenReturn(List.of(productSummary(PRODUCT_A)));

        assertThat(importService.importMig8Orders(50).createdCount()).isEqualTo(1);
        Mig8OrderImportResult second = importService.importMig8Orders(50);

        assertThat(second.skippedCount()).isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM partner_order_lines WHERE product_id IS NULL", Integer.class))
                .isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM partner_order_lines WHERE product_id IS NOT NULL", Integer.class))
                .isEqualTo(1);
    }

    private List<Mig8OrderExport> successOrders() {
        return List.of(
                order("2026/06/20-1", PARTNER_ID, "COMPLETED", "SLIP-1", PRODUCT_A),
                order("2026/06/20-2", PARTNER_ID, "IN_PROGRESS", null, PRODUCT_A, PRODUCT_B),
                order("2026/06/20-3", PARTNER_ID, "CANCELED", null, PRODUCT_B));
    }

    private Mig8OrderExport order(String orderNo, UUID partnerId, String status, String linkedSlipNo,
                                  UUID... productIds) {
        List<Mig8OrderLineExport> lines = java.util.stream.IntStream.range(0, productIds.length)
                .mapToObj(i -> line(i + 1, productIds[i]))
                .toList();
        BigDecimal supply = lines.stream()
                .map(Mig8OrderLineExport::supplyAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal vat = lines.stream()
                .map(Mig8OrderLineExport::vatAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        int seq = Integer.parseInt(orderNo.substring(orderNo.lastIndexOf('-') + 1));
        return new Mig8OrderExport(
                orderNo,
                partnerId,
                "삼한테스트",
                "담당자",
                status,
                LocalDate.of(2026, 7, 19 + seq),
                "월말",
                "ref-" + switch (status) {
                    case "COMPLETED" -> "complete";
                    case "IN_PROGRESS" -> "progress";
                    case "CANCELED" -> "canceled";
                    default -> status.toLowerCase();
                },
                supply,
                vat,
                linkedSlipNo,
                "EXT-" + orderNo,
                lines);
    }

    private Mig8OrderExport orderWithLines(String orderNo, List<Mig8OrderLineExport> lines) {
        BigDecimal supply = lines.stream()
                .map(Mig8OrderLineExport::supplyAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal vat = lines.stream()
                .map(Mig8OrderLineExport::vatAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        return new Mig8OrderExport(
                orderNo, PARTNER_ID, "삼한 테스트", "담당자", "IN_PROGRESS",
                LocalDate.of(2026, 7, 31), "월말", "미해소 회귀", supply, vat,
                null, "EXT-" + orderNo, lines);
    }

    private Mig8OrderLineExport line(int lineNo, UUID productId) {
        BigDecimal supply = BigDecimal.valueOf(100000L * lineNo);
        BigDecimal vat = BigDecimal.valueOf(10000L * lineNo);
        return new Mig8OrderLineExport(
                lineNo,
                productId,
                "item-" + lineNo,
                BigDecimal.valueOf(lineNo + 1L),
                supply,
                supply,
                vat,
                LocalDate.of(2026, 7, 31));
    }

    private ProductSummary productSummary(UUID productId) {
        if (PRODUCT_B.equals(productId)) {
            return new ProductSummary(productId, "제품 B", "MODEL-B", null,
                    BigDecimal.valueOf(55000), "ACTIVE", null, "SINGLE", "commercialMulti");
        }
        return new ProductSummary(productId, "제품 A", "MODEL-A", null,
                BigDecimal.valueOf(55000), "ACTIVE", null, "SINGLE", "homemulti");
    }

    private long count(String table) {
        Long value = jdbcTemplate.queryForObject("SELECT count(*) FROM " + table, Long.class);
        return value == null ? 0 : value;
    }

    private void assertOrder(String orderNo, String status, String slipPublishStatus,
                             String totalAmount, String dueDate, String memo) {
        var row = jdbcTemplate.queryForMap(
                "SELECT status, slip_publish_status, total_amount, due_date, memo, idempotency_key "
                        + "FROM partner_orders WHERE order_no = ?",
                orderNo);
        assertThat(row.get("status")).isEqualTo(status);
        assertThat(row.get("slip_publish_status")).isEqualTo(slipPublishStatus);
        assertThat((BigDecimal) row.get("total_amount")).isEqualByComparingTo(totalAmount);
        assertThat(row.get("due_date").toString()).isEqualTo(dueDate);
        assertThat(row.get("memo")).isEqualTo(memo);
        assertThat(row.get("idempotency_key")).isEqualTo("ecount-mig8:" + orderNo);
    }

    private void assertLine(String orderNo, UUID productId, String modelName, String productName,
                            String categoryKey, int quantity, String priceVat, String subtotal,
                            int convertedQuantity) {
        var row = jdbcTemplate.queryForMap(
                "SELECT l.model_name, l.product_name, l.category_key, l.quantity, l.price_vat, "
                        + "l.subtotal, l.converted_quantity "
                        + "FROM partner_order_lines l "
                        + "JOIN partner_orders o ON o.id = l.partner_order_id "
                        + "WHERE o.order_no = ? AND l.product_id = ?",
                orderNo, productId);
        assertThat(row.get("model_name")).isEqualTo(modelName);
        assertThat(row.get("product_name")).isEqualTo(productName);
        assertThat(row.get("category_key")).isEqualTo(categoryKey);
        assertThat(row.get("quantity")).isEqualTo(quantity);
        assertThat((BigDecimal) row.get("price_vat")).isEqualByComparingTo(priceVat);
        assertThat((BigDecimal) row.get("subtotal")).isEqualByComparingTo(subtotal);
        assertThat(row.get("converted_quantity")).isEqualTo(convertedQuantity);
    }
}
