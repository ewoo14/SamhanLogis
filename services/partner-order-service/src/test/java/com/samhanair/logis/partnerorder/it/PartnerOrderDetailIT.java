package com.samhanair.logis.partnerorder.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.partnerorder.PartnerOrderServiceApplication;
import com.samhanair.logis.partnerorder.client.DcConfigClient;
import com.samhanair.logis.partnerorder.client.InventoryClient;
import com.samhanair.logis.partnerorder.client.PartnerAuthClient;
import com.samhanair.logis.partnerorder.client.ProductClient;
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
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
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
