package com.samhanair.logis.partnerorder.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.common.http.HttpHeaderConstants;
import com.samhanair.logis.partnerorder.PartnerOrderServiceApplication;
import com.samhanair.logis.partnerorder.audit.repository.PartnerOrderAuditLogRepository;
import com.samhanair.logis.partnerorder.client.DcConfigClient;
import com.samhanair.logis.partnerorder.client.EstimateClient;
import com.samhanair.logis.partnerorder.client.InventoryClient;
import com.samhanair.logis.partnerorder.client.PartnerAuthClient;
import com.samhanair.logis.partnerorder.client.ProductClient;
import com.samhanair.logis.partnerorder.client.SlipServiceClient;
import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.domain.PartnerOrderLine;
import com.samhanair.logis.partnerorder.domain.PartnerOrderStatus;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.repository.SlipPublishOutboxRepository;
import com.samhanair.logis.partnerorder.vendor.client.PartnerLookupClient;
import com.samhanair.logis.partnerorder.vendor.client.ProductCatalogLookupClient;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

/**
 * SP-08-4-3 D1 주문 soft delete endpoint 통합 테스트.
 */
@SpringBootTest(classes = PartnerOrderServiceApplication.class)
@AutoConfigureMockMvc
class PartnerOrderDeleteIT extends AbstractPostgresIT {

    private static final String SALES_ACCOUNT_ID = "10000000-0000-0000-0000-000000000501";
    private static final String MANAGER_ACCOUNT_ID = "10000000-0000-0000-0000-000000000502";
    private static final String PARTNER_ACCOUNT_ID = "10000000-0000-0000-0000-000000000503";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private PartnerOrderRepository orderRepository;

    @Autowired
    private PartnerOrderAuditLogRepository auditLogRepository;

    @Autowired
    private SlipPublishOutboxRepository outboxRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @MockBean
    private DcConfigClient dcConfigClient;
    @MockBean
    private EstimateClient estimateClient;
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
        outboxRepository.deleteAll();
        auditLogRepository.deleteAll();
        jdbcTemplate.update("DELETE FROM partner_order_lines");
        orderRepository.deleteAll();
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.check(
                        org.mockito.ArgumentMatchers.any(UUID.class), org.mockito.ArgumentMatchers.anyString(),
                        org.mockito.ArgumentMatchers.any(PermissionAction.class)))
                .thenReturn(true);
    }

    @Test
    @WithMockUser(roles = {"SALES"})
    void testDeleteSuccess() throws Exception {
        PartnerOrder order = saveOrder("2026/05/17-31", false, false);

        mockMvc.perform(delete("/api/v1/partner-orders/{id}", "2026-05-17-31")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .header("X-User-Name", "영업담당자"))
                .andExpect(status().isNoContent());

        // @SQLRestriction 이 active 조회에서 soft-deleted row 를 제외한다. 실제 삭제 여부는 raw SQL 로 검증한다.
        Integer deletedOrders = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                  FROM partner_orders
                 WHERE id = ?
                   AND is_deleted = TRUE
                   AND deleted_at IS NOT NULL
                   AND deleted_by = ?
                   AND deleted_by_name = '영업담당자'
                """, Integer.class, order.getId(), SALES_ACCOUNT_ID);
        Integer deletedLines = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                  FROM partner_order_lines
                 WHERE partner_order_id = ?
                   AND is_deleted = TRUE
                   AND deleted_at IS NOT NULL
                   AND deleted_by = ?
                """, Integer.class, order.getId(), SALES_ACCOUNT_ID);

        assertThat(deletedOrders).isEqualTo(1);
        assertThat(deletedLines).isEqualTo(2);
    }

    @Test
    @WithMockUser(roles = {"SALES"})
    void testDeleteSoftDeletedAlreadyReturns404() throws Exception {
        PartnerOrder order = saveOrder("2026/05/17-32", true, false);

        mockMvc.perform(delete("/api/v1/partner-orders/{id}", order.getId())
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("PARTNER_ORDER_NOT_FOUND"));
    }

    @Test
    @WithMockUser(roles = {"PARTNER"})
    void testDeletePartnerRoleForbidden() throws Exception {
        PartnerOrder order = saveOrder("2026/05/17-33", false, false);
        when(dynamicPermissionClient.check(
                        org.mockito.ArgumentMatchers.any(UUID.class),
                        org.mockito.ArgumentMatchers.eq("sales.partner-order.edit"),
                        org.mockito.ArgumentMatchers.eq(PermissionAction.DELETE)))
                .thenReturn(false);

        mockMvc.perform(delete("/api/v1/partner-orders/{id}", order.getId())
                        .header("X-User-Id", PARTNER_ACCOUNT_ID)
                        .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "PARTNER")
                        // Phase C5-4: PARTNER 식별은 X-Is-Partner 헤더 기반
                        .header(HttpHeaderConstants.IS_PARTNER_HEADER, "true"))
                .andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(roles = {"SALES"})
    void testDeleteConfirmedOrderReturns422() throws Exception {
        PartnerOrder order = saveOrder("2026/05/17-34", false, true);

        mockMvc.perform(delete("/api/v1/partner-orders/{id}", order.getId())
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("PARTNER_ORDER_DELETE_FORBIDDEN_STATUS"));
    }

    @Test
    @WithMockUser(roles = {"SALES"})
    void testDeleteCanceledOrderReturns422() throws Exception {
        PartnerOrder order = saveOrder("2026/05/17-36", false, false);
        order.cancel();
        orderRepository.saveAndFlush(order);

        mockMvc.perform(delete("/api/v1/partner-orders/{id}", order.getId())
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("PARTNER_ORDER_DELETE_FORBIDDEN_STATUS"));

        Integer activeOrders = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                  FROM partner_orders
                 WHERE id = ?
                   AND status = ?
                   AND is_deleted = FALSE
                """, Integer.class, order.getId(), PartnerOrderStatus.CANCELED.name());
        assertThat(activeOrders).isEqualTo(1);
    }

    @Test
    @WithMockUser(roles = {"MANAGER"})
    void testDeleteAuditLogRecorded() throws Exception {
        PartnerOrder order = saveOrder("2026/05/17-35", false, false);

        mockMvc.perform(delete("/api/v1/partner-orders/{id}", order.getId())
                        .header("X-User-Id", MANAGER_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER")
                        .header("X-User-Name", "관리자"))
                .andExpect(status().isNoContent());

        assertThat(auditLogRepository.findByEntityIdOrderByRevisionNoDescChangedAtDesc(order.getId()))
                .extracting("fieldName", "newValue")
                .containsExactly(org.assertj.core.api.Assertions.tuple("DELETE", "soft-deleted"));
    }

    /**
     * #757 R2 MED — 인라인 복원(POST /{id}/restore)이 같은 삭제 작업으로 cascade soft-delete 된
     * 라인을 재활성화하고 totalAmount 를 보존하는지 HTTP 왕복으로 고정한다(기존 IT 는 revision
     * restore 경로만 커버 — 인라인 경로 회귀 시 "빈 껍데기 주문" 복원).
     */
    @Test
    @WithMockUser(roles = {"SALES"})
    void testInlineRestoreReactivatesCascadeDeletedLinesAndPreservesTotalAmount() throws Exception {
        // 라인 2건(2×120,000 + 1×120,000) → addLine 누적 totalAmount = 360,000.
        PartnerOrder order = saveDraftOrder("2026/05/17-41");

        mockMvc.perform(delete("/api/v1/partner-orders/{id}", order.getId())
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .header("X-User-Name", "영업담당자"))
                .andExpect(status().isNoContent());

        mockMvc.perform(post("/api/v1/partner-orders/{id}/restore", order.getId())
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .header("X-User-Name", "영업담당자"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.isDeleted").value(false))
                .andExpect(jsonPath("$.data.totalAmount").value(360000))
                .andExpect(jsonPath("$.data.lines.length()").value(2));

        Integer activeLines = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                  FROM partner_order_lines
                 WHERE partner_order_id = ?
                   AND is_deleted = FALSE
                """, Integer.class, order.getId());
        java.math.BigDecimal totalAmount = jdbcTemplate.queryForObject("""
                SELECT total_amount
                  FROM partner_orders
                 WHERE id = ?
                   AND is_deleted = FALSE
                """, java.math.BigDecimal.class, order.getId());

        assertThat(activeLines).isEqualTo(2);
        assertThat(totalAmount).isEqualByComparingTo("360000");
    }

    /**
     * #757 R2 LOW disposition 고정 — 주문 라인은 수정 플로우에서도 개별 soft-delete 되므로
     * 인라인 복원은 <b>헤더 deletedAt 동일 시각의 cascade 라인만</b> 되살려야 한다.
     * 수정으로 제거된(다른 시각) 라인이 오복원되면 출고전표(D)식 전량복원 회귀다.
     */
    @Test
    @WithMockUser(roles = {"SALES"})
    void testInlineRestoreDoesNotResurrectLinesRemovedByEditFlow() throws Exception {
        PartnerOrder order = saveDraftOrder("2026/05/17-42");
        // 수정 플로우의 라인 제거를 모사 — 헤더 삭제와 다른 시각으로 개별 soft-delete.
        order.getLines().stream()
                .filter(l -> "AJ040RXH4BC1".equals(l.getModelName()))
                .findFirst()
                .orElseThrow()
                .markDeleted("system-partner-order-update");
        orderRepository.saveAndFlush(order);

        mockMvc.perform(delete("/api/v1/partner-orders/{id}", order.getId())
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .header("X-User-Name", "영업담당자"))
                .andExpect(status().isNoContent());

        mockMvc.perform(post("/api/v1/partner-orders/{id}/restore", order.getId())
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .header("X-User-Name", "영업담당자"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.isDeleted").value(false))
                .andExpect(jsonPath("$.data.lines.length()").value(1))
                .andExpect(jsonPath("$.data.lines[0].modelCode").value("AR09B9150HZ"));

        Boolean editRemovedStillDeleted = jdbcTemplate.queryForObject("""
                SELECT is_deleted
                  FROM partner_order_lines
                 WHERE partner_order_id = ?
                   AND model_name = 'AJ040RXH4BC1'
                """, Boolean.class, order.getId());
        Boolean cascadeLineActive = jdbcTemplate.queryForObject("""
                SELECT is_deleted
                  FROM partner_order_lines
                 WHERE partner_order_id = ?
                   AND model_name = 'AR09B9150HZ'
                """, Boolean.class, order.getId());

        assertThat(editRemovedStillDeleted).isTrue();
        assertThat(cascadeLineActive).isFalse();
    }

    private PartnerOrder saveDraftOrder(String orderNo) {
        // createFromConfirm = DRAFT 진입 팩토리 — create()의 CONFIRMING 은 requireRestorable()
        // 가드(전환-중 좀비 방지 409)에 걸려 인라인 복원 시나리오를 검증할 수 없다.
        // totalAmount 는 addLine() 이 라인 subtotal 을 누적하므로 ZERO 로 시작한다.
        PartnerOrder order = PartnerOrder.createFromConfirm(
                "P-SP0843",
                "1010101010",
                orderNo,
                "IT-SP0843-DEL-" + orderNo,
                BigDecimal.ZERO);
        order.addLine(line("AJ040RXH4BC1", 2));
        order.addLine(line("AR09B9150HZ", 1));
        return orderRepository.saveAndFlush(order);
    }

    private PartnerOrder saveOrder(String orderNo, boolean deleted, boolean confirmed) {
        PartnerOrder order = PartnerOrder.create(
                "P-SP0843",
                "1010101010",
                orderNo,
                "IT-SP0843-DEL-" + orderNo,
                BigDecimal.ZERO);
        order.addLine(line("AJ040RXH4BC1", 2));
        order.addLine(line("AR09B9150HZ", 1));
        if (confirmed) {
            order.markSlipPublished("S-" + orderNo.replace("/", "").replace("-", ""));
        }
        if (deleted) {
            order.markDeleted("it");
        }
        return orderRepository.saveAndFlush(order);
    }

    private PartnerOrderLine line(String modelCode, int quantity) {
        return PartnerOrderLine.create(
                UUID.nameUUIDFromBytes(("sp-08-4-3-delete:" + modelCode).getBytes(StandardCharsets.UTF_8)),
                modelCode,
                "품목-" + modelCode,
                "homemulti",
                quantity,
                new BigDecimal("120000"),
                "현장 납품");
    }
}
