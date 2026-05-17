package com.samhanair.logis.partnerorder.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.partnerorder.PartnerOrderServiceApplication;
import com.samhanair.logis.partnerorder.audit.repository.PartnerOrderAuditLogRepository;
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

    @BeforeEach
    void setUp() {
        outboxRepository.deleteAll();
        auditLogRepository.deleteAll();
        jdbcTemplate.update("DELETE FROM partner_order_lines");
        orderRepository.deleteAll();
    }

    @Test
    @WithMockUser(roles = {"SALES"})
    void testDeleteSuccess() throws Exception {
        PartnerOrder order = saveOrder("2026/05/17-31", false, false);

        mockMvc.perform(delete("/api/v1/partner-orders/{id}", "2026-05-17-31"))
                .andExpect(status().isNoContent());

        assertThat(orderRepository.findById(order.getId())).isEmpty();
        Integer deletedOrders = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                  FROM partner_orders
                 WHERE id = ?
                   AND is_deleted = TRUE
                   AND deleted_at IS NOT NULL
                   AND deleted_by = 'system-partner-order-delete'
                """, Integer.class, order.getId());
        Integer deletedLines = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                  FROM partner_order_lines
                 WHERE partner_order_id = ?
                   AND is_deleted = TRUE
                   AND deleted_at IS NOT NULL
                   AND deleted_by = 'system-partner-order-delete'
                """, Integer.class, order.getId());

        assertThat(deletedOrders).isEqualTo(1);
        assertThat(deletedLines).isEqualTo(2);
    }

    @Test
    @WithMockUser(roles = {"SALES"})
    void testDeleteSoftDeletedAlreadyReturns404() throws Exception {
        PartnerOrder order = saveOrder("2026/05/17-32", true, false);

        mockMvc.perform(delete("/api/v1/partner-orders/{id}", order.getId()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("PARTNER_ORDER_NOT_FOUND"));
    }

    @Test
    @WithMockUser(roles = {"PARTNER"})
    void testDeletePartnerRoleForbidden() throws Exception {
        PartnerOrder order = saveOrder("2026/05/17-33", false, false);

        mockMvc.perform(delete("/api/v1/partner-orders/{id}", order.getId()))
                .andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(roles = {"SALES"})
    void testDeleteConfirmedOrderReturns422() throws Exception {
        PartnerOrder order = saveOrder("2026/05/17-34", false, true);

        mockMvc.perform(delete("/api/v1/partner-orders/{id}", order.getId()))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("PARTNER_ORDER_DELETE_FORBIDDEN_STATUS"));
    }

    @Test
    @WithMockUser(roles = {"MANAGER"})
    void testDeleteAuditLogRecorded() throws Exception {
        PartnerOrder order = saveOrder("2026/05/17-35", false, false);

        mockMvc.perform(delete("/api/v1/partner-orders/{id}", order.getId())
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Name", "관리자"))
                .andExpect(status().isNoContent());

        assertThat(auditLogRepository.findByEntityIdOrderByRevisionNoDescChangedAtDesc(order.getId()))
                .extracting("fieldName", "newValue")
                .containsExactly(org.assertj.core.api.Assertions.tuple("DELETE", "soft-deleted"));
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
