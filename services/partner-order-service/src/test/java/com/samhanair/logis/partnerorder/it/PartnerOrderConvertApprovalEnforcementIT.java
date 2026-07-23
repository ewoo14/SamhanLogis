package com.samhanair.logis.partnerorder.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.partnerorder.PartnerOrderServiceApplication;
import com.samhanair.logis.partnerorder.client.ApprovalLineAuthorizeResult;
import com.samhanair.logis.partnerorder.client.DcConfigClient;
import com.samhanair.logis.partnerorder.client.EstimateClient;
import com.samhanair.logis.partnerorder.client.InventoryClient;
import com.samhanair.logis.partnerorder.client.InventoryClient.ReservationResult;
import com.samhanair.logis.partnerorder.client.PartnerAuthClient;
import com.samhanair.logis.partnerorder.client.ProductClient;
import com.samhanair.logis.partnerorder.client.SlipServiceClient;
import com.samhanair.logis.partnerorder.client.SlipServiceClient.PublishResult;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.repository.SlipPublishOutboxRepository;
import com.samhanair.logis.partnerorder.vendor.client.PartnerLookupClient;
import com.samhanair.logis.partnerorder.vendor.client.ProductCatalogLookupClient;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

/** A2-4 주문 출고전환 결재자 enforcement 통합 테스트. */
@SpringBootTest(classes = PartnerOrderServiceApplication.class)
@AutoConfigureMockMvc
class PartnerOrderConvertApprovalEnforcementIT extends AbstractPostgresIT {

    private static final String DOC_TYPE = "PARTNER_ORDER";
    private static final String ACTION_KEY = "PARTNER_ORDER_CONVERT";
    private static final String FORBIDDEN_MESSAGE =
            "주문 출고전환 권한이 없습니다 — 승인자 결재자(그룹/개인)만 전환할 수 있습니다";
    private static final UUID DENIED_USER =
            UUID.fromString("50000000-0000-0000-0000-000000000001");
    private static final UUID APPROVER_USER =
            UUID.fromString("50000000-0000-0000-0000-000000000002");
    private static final UUID FIXTURE_PARTNER_ID =
            UUID.fromString("00000000-0000-0000-0000-000000000104");

    @Autowired private MockMvc mockMvc;
    @Autowired private PartnerOrderRepository orderRepository;
    @Autowired private SlipPublishOutboxRepository outboxRepository;
    @Autowired private JdbcTemplate jdbcTemplate;

    @MockBean private EstimateClient estimateClient;
    @MockBean private DcConfigClient dcConfigClient;
    @MockBean private ProductClient productClient;
    @MockBean private InventoryClient inventoryClient;
    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private PartnerAuthClient partnerAuthClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private ProductCatalogLookupClient catalogLookupClient;
    @MockBean private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void setUp() {
        outboxRepository.deleteAll();
        jdbcTemplate.update("DELETE FROM partner_order_lines");
        orderRepository.deleteAll();

        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.check(
                any(UUID.class), anyString(), any(PermissionAction.class))).thenReturn(true);

        lenient().when(dcConfigClient.calculatePrices(anyString(), anyList())).thenReturn(Map.of());
        lenient().when(productClient.lookup(anyList())).thenReturn(List.of());
        lenient().when(partnerLookupClient.findByPartnerCodeForIdentity("A2-4-PARTNER"))
                .thenReturn(Optional.of(new com.samhanair.logis.partnerorder.vendor.client.PartnerSummary(
                        UUID.fromString("00000000-0000-0000-0000-000000000101"),
                        "A2-4-PARTNER", null, "1234567890")));
        lenient().when(inventoryClient.resolveWarehouseIdByCode(anyString()))
                .thenReturn(UUID.fromString("00000000-0000-0000-0000-000000000001"));
        lenient().when(inventoryClient.reserve(
                any(UUID.class), any(UUID.class), any(int.class), anyString(), any(UUID.class)))
                .thenReturn(ReservationResult.reserved());
        lenient().doNothing().when(inventoryClient).release(
                any(UUID.class), any(UUID.class), any(int.class), anyString(), any(UUID.class));
        lenient().when(slipServiceClient.publishFromPartnerOrder(any(), anyString()))
                .thenReturn(PublishResult.published("2026/06/22-A2-4"));
        lenient().when(slipServiceClient.publishFromOrdersMerge(any(), anyString()))
                .thenReturn(PublishResult.published("2026/06/22-A2-4-MRG"));
    }

    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("개별 전환: configured=true 비결재자는 403 + 전환 로직 미진입")
    void convert_nonApprover_returns403_beforeConvertLogic() throws Exception {
        UUID orderId = UUID.randomUUID();
        UUID lineId = UUID.randomUUID();
        insertOrderWithLine(orderId, lineId, "A2-4-PO-1", 5);
        when(approvalLineAuthorizeClient.authorize(DOC_TYPE, ACTION_KEY, DENIED_USER))
                .thenReturn(new ApprovalLineAuthorizeResult(true, false));

        mockMvc.perform(post("/api/v1/partner-orders/{id}/convert-to-slip", orderId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(convertBody(lineId, 2))
                        .header("X-User-Id", DENIED_USER.toString())
                        .header("X-User-Role", "SALES")
                        .header("X-User-Name", "비결재자"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"))
                .andExpect(jsonPath("$.message").value(FORBIDDEN_MESSAGE));

        verify(inventoryClient, never()).resolveWarehouseIdByCode(anyString());
        verify(slipServiceClient, never()).publishFromPartnerOrder(any(), anyString());
    }

    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("개별 전환: configured=true 결재자는 200")
    void convert_approver_returns200() throws Exception {
        UUID orderId = UUID.randomUUID();
        UUID lineId = UUID.randomUUID();
        insertOrderWithLine(orderId, lineId, "A2-4-PO-2", 5);
        when(approvalLineAuthorizeClient.authorize(DOC_TYPE, ACTION_KEY, APPROVER_USER))
                .thenReturn(new ApprovalLineAuthorizeResult(true, true));

        mockMvc.perform(post("/api/v1/partner-orders/{id}/convert-to-slip", orderId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(convertBody(lineId, 2))
                        .header("X-User-Id", APPROVER_USER.toString())
                        .header("X-User-Role", "SALES")
                        .header("X-User-Name", "승인자"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.slipNo").value("2026/06/22-A2-4"));

        Integer convertedQty = jdbcTemplate.queryForObject(
                "SELECT converted_quantity FROM partner_order_lines WHERE id = ?",
                Integer.class, lineId);
        assertThat(convertedQty).isEqualTo(2);
    }

    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("개별 전환: configured=false opt-in 미설정은 기존 권한으로 200")
    void convert_notConfigured_returns200() throws Exception {
        UUID orderId = UUID.randomUUID();
        UUID lineId = UUID.randomUUID();
        insertOrderWithLine(orderId, lineId, "A2-4-PO-3", 5);
        when(approvalLineAuthorizeClient.authorize(DOC_TYPE, ACTION_KEY, DENIED_USER))
                .thenReturn(new ApprovalLineAuthorizeResult(false, false));

        mockMvc.perform(post("/api/v1/partner-orders/{id}/convert-to-slip", orderId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(convertBody(lineId, 2))
                        .header("X-User-Id", DENIED_USER.toString())
                        .header("X-User-Role", "SALES")
                        .header("X-User-Name", "기존권한자"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.slipNo").value("2026/06/22-A2-4"));
    }

    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("병합 전환: 같은 PARTNER_ORDER_CONVERT 게이트로 비결재자 403, 결재자 200")
    void mergeConvert_enforcesSameApprovalGate() throws Exception {
        UUID deniedOrderId = UUID.randomUUID();
        UUID deniedLineId = UUID.randomUUID();
        insertOrderWithLine(deniedOrderId, deniedLineId, "A2-4-MRG-1", 5);
        when(approvalLineAuthorizeClient.authorize(DOC_TYPE, ACTION_KEY, DENIED_USER))
                .thenReturn(new ApprovalLineAuthorizeResult(true, false));

        mockMvc.perform(post("/api/v1/partner-orders/convert-to-slip-merge")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mergeBody(deniedOrderId, deniedLineId, 2))
                        .header("X-User-Id", DENIED_USER.toString())
                        .header("X-User-Role", "SALES")
                        .header("X-User-Name", "비결재자"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"))
                .andExpect(jsonPath("$.message").value(FORBIDDEN_MESSAGE));

        verify(slipServiceClient, never()).publishFromOrdersMerge(any(), anyString());

        UUID allowedOrderId = UUID.randomUUID();
        UUID allowedLineId = UUID.randomUUID();
        insertOrderWithLine(allowedOrderId, allowedLineId, "A2-4-MRG-2", 5);
        when(approvalLineAuthorizeClient.authorize(DOC_TYPE, ACTION_KEY, APPROVER_USER))
                .thenReturn(new ApprovalLineAuthorizeResult(true, true));

        mockMvc.perform(post("/api/v1/partner-orders/convert-to-slip-merge")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mergeBody(allowedOrderId, allowedLineId, 2))
                        .header("X-User-Id", APPROVER_USER.toString())
                        .header("X-User-Role", "SALES")
                        .header("X-User-Name", "승인자"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.slipNo").value("2026/06/22-A2-4-MRG"));
    }

    private String convertBody(UUID lineId, int quantity) {
        return """
                {
                  "items": [{"orderLineId": "%s", "quantity": %d}],
                  "warehouseCode": "WH-001"
                }
                """.formatted(lineId, quantity);
    }

    private String mergeBody(UUID orderId, UUID lineId, int quantity) {
        return """
                {
                  "orders": [
                    {"partnerOrderId": "%s", "items": [{"orderLineId": "%s", "quantity": %d}]}
                  ],
                  "warehouseCode": "WH-001"
                }
                """.formatted(orderId, lineId, quantity);
    }

    private void insertOrderWithLine(UUID orderId, UUID lineId, String orderNo, int quantity) {
        jdbcTemplate.update("""
                INSERT INTO partner_orders
                  (id, partner_id, partner_code, biz_code, order_no, slip_no, status,
                   slip_publish_status, total_amount, confirmed_at, slip_published_at,
                   due_date, memo, source_estimate_id, revision_count,
                   idempotency_key, lock_version,
                   created_at, created_by, modified_at, modified_by,
                   is_deleted, deleted_at, deleted_by)
                VALUES
                  (?, ?, 'A2-4-PARTNER', '1234567890', ?, NULL, 'DRAFT',
                   'NOT_REQUIRED', 0, NULL, NULL,
                   NULL, NULL, NULL, 0,
                   ?, 0,
                   NOW(), 'test', NOW(), 'test',
                   FALSE, NULL, NULL)
                """, orderId, FIXTURE_PARTNER_ID, orderNo, "idem-" + orderNo);

        jdbcTemplate.update("""
                INSERT INTO partner_order_lines
                  (id, partner_order_id, product_id, model_name, product_name,
                   category_key, quantity, price_vat, subtotal, remark,
                   converted_quantity,
                   created_at, created_by, modified_at, modified_by,
                   is_deleted, deleted_at, deleted_by)
                VALUES
                  (?, ?, ?, 'MODEL-A2-4', 'A2-4상품', 'homemulti', ?, ?, ?, NULL, 0,
                   NOW(), 'test', NOW(), 'test', FALSE, NULL, NULL)
                """,
                lineId, orderId, UUID.randomUUID(), quantity, BigDecimal.valueOf(10000),
                BigDecimal.valueOf(10000L * quantity));
    }
}
