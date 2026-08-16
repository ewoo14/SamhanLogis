package com.samhanair.logis.partnerorder.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.partnerorder.PartnerOrderServiceApplication;
import com.samhanair.logis.partnerorder.client.DcConfigClient;
import com.samhanair.logis.partnerorder.client.InventoryClient;
import com.samhanair.logis.partnerorder.client.PartnerAuthClient;
import com.samhanair.logis.partnerorder.client.ProductClient;
import com.samhanair.logis.partnerorder.client.ProductSummary;
import com.samhanair.logis.partnerorder.client.SlipServiceClient;
import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.domain.PartnerOrderLine;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.repository.SlipPublishOutboxRepository;
import com.samhanair.logis.partnerorder.vendor.client.PartnerLookupClient;
import com.samhanair.logis.partnerorder.vendor.client.ProductCatalogLookupClient;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

/**
 * 주문 상세 endpoint 의 순수 상세 DTO 계약을 검증한다.
 *
 * <p>상세 응답은 사용자 표시용 주문번호와 거래처 코드만 노출하며, 라인 UUID 는 응답하지 않는다.
 */
@SpringBootTest(classes = PartnerOrderServiceApplication.class)
@AutoConfigureMockMvc
class PartnerOrderDetailIT extends AbstractPostgresIT {

    private static final String ACCOUNT_ID = "10000000-0000-0000-0000-000000000301";
    private static final String PARTNER_ACCOUNT_ID = "10000000-0000-0000-0000-000000000302";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private PartnerOrderRepository orderRepository;

    @Autowired
    private SlipPublishOutboxRepository outboxRepository;

    @MockBean
    private DcConfigClient dcConfigClient;
    @MockBean
    private ProductClient productClient;
    @MockBean
    private InventoryClient inventoryClient;
    @MockBean
    private SlipServiceClient slipServiceClient;
    @MockBean
    private PartnerAuthClient partnerAuthClient;
    @MockBean
    private PartnerLookupClient partnerLookupClient;
    @MockBean
    private ProductCatalogLookupClient catalogLookupClient;
    @MockBean
    private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void setUp() {
        // slip_publish_outbox.partner_order_id_fkey 위반 회피 — outbox 먼저 cleanup
        outboxRepository.deleteAll();
        orderRepository.deleteAll();
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.check(any(UUID.class), anyString(), any(PermissionAction.class)))
                .thenReturn(true);
    }

    @Test
    @WithMockUser(username = "owner", roles = {"SALES"})
    void detail_by_order_number_returns_header_and_lines() throws Exception {
        saveOrder("2026/05/07-1", "P-DETAIL-A", "1010101010", false);

        mockMvc.perform(get("/api/v1/partner-orders/{id}", "2026-05-07-1")
                        .header("X-User-Id", ACCOUNT_ID)
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.orderNumber").value("2026/05/07-1"))
                .andExpect(jsonPath("$.data.partnerCode").value("P-DETAIL-A"))
                .andExpect(jsonPath("$.data.partnerName").doesNotExist())
                .andExpect(jsonPath("$.data.lines.length()").value(1))
                .andExpect(jsonPath("$.data.lines[0].productName").value("실외기"))
                .andExpect(jsonPath("$.data.lines[0].id").doesNotExist())
                .andExpect(jsonPath("$.data.lines[0].productId").exists());
    }

    /**
     * Round C #23(세트 재고 가드): 주문 상세 라인 응답에 productType 이 product-service 조회로
     * enrich 되어 BUNDLE 라인은 {@code productType="BUNDLE"} 로 전사되는지 검증한다.
     * FE 재고조회 모달(2.6d)이 이 값으로 세트 라인을 재고조회 대상에서 제외한다.
     */
    @Test
    @WithMockUser(username = "owner", roles = {"SALES"})
    void detail_line_productType_is_enriched_from_product_service() throws Exception {
        UUID syntheticLineProductId = UUID.fromString("b0b0b0b0-0000-0000-0000-000000000123");
        UUID catalogBundleProductId = UUID.fromString("b0b0b0b0-0000-0000-0000-000000000023");
        saveOrderWithProduct("2026/05/07-23", "P-DETAIL-BUNDLE", "2323232323",
                syntheticLineProductId, "SET-HM2WAY", "홈멀티 2way 세트");
        // product-service 조회가 modelCode 기준 BUNDLE 을 반환하도록 stub (productType="BUNDLE").
        when(productClient.lookupByModelCodes(argThat(modelCodes ->
                modelCodes != null && modelCodes.equals(List.of("SET-HM2WAY"))))).thenReturn(List.of(
                new ProductSummary(catalogBundleProductId, "홈멀티 2way 세트", "SET-HM2WAY",
                        null, new BigDecimal("2500000"), "ACTIVE", "SET-HM2WAY", "BUNDLE")));

        mockMvc.perform(get("/api/v1/partner-orders/{id}", "2026-05-07-23")
                        .header("X-User-Id", ACCOUNT_ID)
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.lines.length()").value(1))
                .andExpect(jsonPath("$.data.lines[0].modelCode").value("SET-HM2WAY"))
                .andExpect(jsonPath("$.data.lines[0].productType").value("BUNDLE"));

        verify(productClient).lookupByModelCodes(argThat(modelCodes ->
                modelCodes != null && modelCodes.equals(List.of("SET-HM2WAY"))));
    }

    /**
     * Round C #23 fail-soft: product-service 조회가 실패해도(예: 회로 차단) 상세 조회는 정상
     * 반환되며 라인 productType 은 응답에서 제외된다(@JsonInclude NON_NULL). 조회 가용성 우선.
     */
    @Test
    @WithMockUser(username = "owner", roles = {"SALES"})
    void detail_productType_absent_when_product_lookup_fails() throws Exception {
        UUID productId = UUID.fromString("b0b0b0b0-0000-0000-0000-000000000024");
        saveOrderWithProduct("2026/05/07-24", "P-DETAIL-FAILSOFT", "2424242424",
                productId, "AJ040RXH4BC1", "실외기");
        when(productClient.lookupByModelCodes(argThat(modelCodes ->
                modelCodes != null && modelCodes.equals(List.of("AJ040RXH4BC1")))))
                .thenThrow(new RuntimeException("product-service 호출 실패(테스트)"));

        mockMvc.perform(get("/api/v1/partner-orders/{id}", "2026-05-07-24")
                        .header("X-User-Id", ACCOUNT_ID)
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.lines.length()").value(1))
                .andExpect(jsonPath("$.data.lines[0].productName").value("실외기"))
                .andExpect(jsonPath("$.data.lines[0].productType").doesNotExist());
    }

    @Test
    @WithMockUser(roles = {"SALES"})
    void detail_not_found_returns_404_catalog_code() throws Exception {
        mockMvc.perform(get("/api/v1/partner-orders/{id}", "2026-05-07-404")
                        .header("X-User-Id", ACCOUNT_ID)
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("PARTNER_ORDER_NOT_FOUND"));
    }

    @Test
    @WithMockUser(roles = {"SALES"})
    void detail_soft_deleted_order_is_excluded() throws Exception {
        saveOrder("2026/05/07-2", "P-DETAIL-B", "2020202020", true);

        mockMvc.perform(get("/api/v1/partner-orders/{id}", "2026-05-07-2")
                        .header("X-User-Id", ACCOUNT_ID)
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("PARTNER_ORDER_NOT_FOUND"));
    }

    @Test
    @WithMockUser(username = "other-user", roles = {"SALES"})
    void detail_sales_role_can_read_other_user_order_for_internal_operations() throws Exception {
        saveOrder("2026/05/07-3", "P-DETAIL-C", "3030303030", false);

        mockMvc.perform(get("/api/v1/partner-orders/{id}", "2026-05-07-3")
                        .header("X-User-Id", ACCOUNT_ID)
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.orderNumber").value("2026/05/07-3"));
    }

    @Test
    @WithMockUser(username = "partner-owner", roles = {"PARTNER"})
    void detail_partner_role_can_read_own_order_only() throws Exception {
        saveOrder("2026/05/07-4", "P-DETAIL-OWN", "4040404040", false);
        saveOrder("2026/05/07-5", "P-DETAIL-OTHER", "5050505050", false);

        mockMvc.perform(get("/api/v1/partner-orders/{id}", "2026-05-07-4")
                        .header("X-User-Id", PARTNER_ACCOUNT_ID)
                        .header("X-User-Role", "PARTNER")
                        // Phase C5-4: PARTNER 식별은 X-Is-Partner 헤더 기반
                        .header("X-Is-Partner", "true")
                        .header("X-Partner-Code", "P-DETAIL-OWN"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.orderNumber").value("2026/05/07-4"));

        mockMvc.perform(get("/api/v1/partner-orders/{id}", "2026-05-07-5")
                        .header("X-User-Id", PARTNER_ACCOUNT_ID)
                        .header("X-User-Role", "PARTNER")
                        // Phase C5-4: PARTNER 식별은 X-Is-Partner 헤더 기반
                        .header("X-Is-Partner", "true")
                        .header("X-Partner-Code", "P-DETAIL-OWN"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    }

    @Test
    @WithMockUser(username = "partner-owner", roles = {"PARTNER"})
    void list_partner_role_is_scoped_to_own_partner() throws Exception {
        saveOrder("2026/05/07-6", "P-LIST-OWN", "6060606060", false);
        saveOrder("2026/05/07-7", "P-LIST-OTHER", "7070707070", false);

        mockMvc.perform(get("/api/v1/partner-orders")
                        .header("X-User-Id", PARTNER_ACCOUNT_ID)
                        .header("X-User-Role", "PARTNER")
                        // Phase C5-4: PARTNER 식별은 X-Is-Partner 헤더 기반
                        .header("X-Is-Partner", "true")
                        .header("X-Partner-Code", "P-LIST-OWN"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].orderNumber").value("2026/05/07-6"));

        mockMvc.perform(get("/api/v1/partner-orders")
                        .param("partnerId", "P-LIST-OTHER")
                        .header("X-User-Id", PARTNER_ACCOUNT_ID)
                        .header("X-User-Role", "PARTNER")
                        // Phase C5-4: PARTNER 식별은 X-Is-Partner 헤더 기반
                        .header("X-Is-Partner", "true")
                        .header("X-Partner-Code", "P-LIST-OWN"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    }

    @Test
    @WithMockUser(username = "partner-owner", roles = {"PARTNER"})
    void history_partner_role_is_scoped_to_own_partner() throws Exception {
        saveOrder("2026/05/07-8", "P-HISTORY-OWN", "8080808080", false);
        saveOrder("2026/05/07-9", "P-HISTORY-OTHER", "9090909090", false);

        mockMvc.perform(get("/api/v1/partner-orders/history")
                        .param("bizCode", "8080808080")
                        .param("from", "2026-01-01T00:00:00")
                        .param("to", "2027-01-01T00:00:00")
                        .header("X-User-Id", PARTNER_ACCOUNT_ID)
                        .header("X-User-Role", "PARTNER")
                        // Phase C5-4: PARTNER 식별은 X-Is-Partner 헤더 기반
                        .header("X-Is-Partner", "true")
                        .header("X-Partner-Code", "P-HISTORY-OWN"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].orderNo").value("2026/05/07-8"));

        mockMvc.perform(get("/api/v1/partner-orders/history")
                        .param("bizCode", "9090909090")
                        .param("from", "2026-01-01T00:00:00")
                        .param("to", "2027-01-01T00:00:00")
                        .header("X-User-Id", PARTNER_ACCOUNT_ID)
                        .header("X-User-Role", "PARTNER")
                        // Phase C5-4: PARTNER 식별은 X-Is-Partner 헤더 기반
                        .header("X-Is-Partner", "true")
                        .header("X-Partner-Code", "P-HISTORY-OWN"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    }

    @Test
    @WithMockUser(username = "partner-owner", roles = {"PARTNER"})
    void history_matches_hyphenated_biz_no_and_legacy_partner_code_without_leaking_other_partner()
            throws Exception {
        saveOrder("2026/05/07-10", "P-2026-0001", "211-87-12345", true);
        saveOrder("2026/05/07-11", "P-2026-0002", "222-88-12345", false);

        mockMvc.perform(get("/api/v1/partner-orders/history")
                        .param("bizCode", "2118712345")
                        .param("from", "2026-01-01T00:00:00")
                        .param("to", "2027-01-01T00:00:00")
                        .header("X-User-Id", PARTNER_ACCOUNT_ID)
                        .header("X-User-Role", "PARTNER")
                        .header("X-Is-Partner", "true")
                        .header("X-Partner-Code", "2118712345"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()" ).value(1))
                .andExpect(jsonPath("$.data.content[0].isDeleted").value(true));

        mockMvc.perform(get("/api/v1/partner-orders/history")
                        .param("bizCode", "2228812345")
                        .param("from", "2026-01-01T00:00:00")
                        .param("to", "2027-01-01T00:00:00")
                        .header("X-User-Id", PARTNER_ACCOUNT_ID)
                        .header("X-User-Role", "PARTNER")
                        .header("X-Is-Partner", "true")
                        .header("X-Partner-Code", "2118712345"))
                .andExpect(status().isForbidden());
    }

    @ParameterizedTest(name = "{0}: expected HTTP {1}")
    @CsvSource({
            "PARTNER 자기 번호 숫자, PARTNER, 2118712345, 2118712345, true, 200",
            "PARTNER 자기 번호 하이픈, PARTNER, 211-87-12345, 2118712345, true, 200",
            "PARTNER 다른 번호, PARTNER, 2228812345, 2118712345, true, 403",
            "PARTNER 앞자리 0, PARTNER, 02118712345, 2118712345, true, 403",
            "PARTNER 유사 번호, PARTNER, 2118712346, 2118712345, true, 403",
            "직원 VIEW + partner code, SALES, 2118712345, 2118712345, false, 200",
            "직원 VIEW + 위조 partner 헤더, SALES, 2118712345, 2118712345, true, 200",
            "직원 VIEW 없음, SALES, 2118712345, 2118712345, true, 403"
    })
    @WithMockUser(roles = {"SALES"})
    void history_http_wiring_regression_matrix(String name, String role, String requestedBizCode,
                                                String partnerCode, boolean isPartner,
                                                int expectedStatus) throws Exception {
        saveOrder("2026/05/07-matrix", "2118712345", "211-87-12345", true);
        when(dynamicPermissionClient.check(any(UUID.class), anyString(), any(PermissionAction.class)))
                .thenReturn(!"직원 VIEW 없음".equals(name));

        mockMvc.perform(get("/api/v1/partner-orders/history")
                        .param("bizCode", requestedBizCode)
                        .param("from", "2026-01-01T00:00:00")
                        .param("to", "2027-01-01T00:00:00")
                        .header("X-User-Id", "PARTNER".equals(role) ? PARTNER_ACCOUNT_ID : ACCOUNT_ID)
                        .header("X-User-Role", role)
                        .header("X-Is-Partner", String.valueOf(isPartner))
                        .header("X-Partner-Code", partnerCode))
                .andExpect(status().is(expectedStatus));
    }

    /**
     * 고정 productId/modelName 라인 1건의 주문을 저장한다 (productType enrich 검증용 —
     * productClient.lookup stub 의 ProductSummary.id 와 매칭하기 위해 결정적 productId 사용).
     */
    private void saveOrderWithProduct(String orderNo, String partnerCode, String bizCode,
                                      UUID productId, String modelName, String productName) {
        PartnerOrder order = PartnerOrder.create(
                partnerCode, bizCode, orderNo,
                "IT-SP0841-DETAIL-" + orderNo, BigDecimal.ZERO);
        order.markSlipPublished("S-" + orderNo.replace("/", "").replace("-", ""));
        order.addLine(PartnerOrderLine.create(
                productId, modelName, productName, "homemulti",
                1, new BigDecimal("120000"), "현장 납품"));
        orderRepository.saveAndFlush(order);
    }

    private void saveOrder(String orderNo, String partnerCode, String bizCode, boolean deleted) {
        PartnerOrder order = PartnerOrder.create(
                partnerCode,
                bizCode,
                orderNo,
                "IT-SP0841-DETAIL-" + orderNo,
                BigDecimal.ZERO);
        order.markSlipPublished("S-" + orderNo.replace("/", "").replace("-", ""));
        order.addLine(PartnerOrderLine.create(
                UUID.randomUUID(),
                "AJ040RXH4BC1",
                "실외기",
                "homemulti",
                2,
                new BigDecimal("120000"),
                "현장 납품"));
        if (deleted) {
            order.markDeleted("it");
        }
        orderRepository.saveAndFlush(order);
    }
}
