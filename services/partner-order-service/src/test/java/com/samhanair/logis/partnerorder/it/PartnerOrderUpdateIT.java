package com.samhanair.logis.partnerorder.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.common.http.HttpHeaderConstants;
import com.samhanair.logis.partnerorder.PartnerOrderServiceApplication;
import com.samhanair.logis.partnerorder.audit.repository.PartnerOrderAuditLogRepository;
import com.samhanair.logis.partnerorder.client.DcConfigClient;
import com.samhanair.logis.partnerorder.client.InventoryClient;
import com.samhanair.logis.partnerorder.client.PartnerAuthClient;
import com.samhanair.logis.partnerorder.client.ProductClient;
import com.samhanair.logis.partnerorder.client.SlipServiceClient;
import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.domain.PartnerOrderLine;
import com.samhanair.logis.partnerorder.repository.PartnerOrderLineRepository;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.repository.SlipPublishOutboxRepository;
import com.samhanair.logis.partnerorder.vendor.client.PartnerLookupClient;
import com.samhanair.logis.partnerorder.vendor.client.ProductCatalogLookupClient;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

/**
 * SP-08-4-2 거래처 주문 direct PUT endpoint 통합 테스트.
 *
 * <p>SP-08-4-1 회고 반영: outbox 먼저 cleanup, 외부 client 전부 {@code @MockBean}, fixture 는
 * 도메인 메서드 중심으로 구성한다.
 */
@SpringBootTest(classes = PartnerOrderServiceApplication.class)
@AutoConfigureMockMvc
class PartnerOrderUpdateIT extends AbstractPostgresIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private PartnerOrderRepository orderRepository;

    @Autowired
    private PartnerOrderLineRepository lineRepository;

    @Autowired
    private PartnerOrderAuditLogRepository auditLogRepository;

    @Autowired
    private SlipPublishOutboxRepository outboxRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @PersistenceContext
    private EntityManager entityManager;

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
        auditLogRepository.deleteAll();
        jdbcTemplate.update("DELETE FROM partner_order_lines");
        orderRepository.deleteAll();
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
    }

    @Test
    @WithMockUser(username = "sales-user", roles = {"SALES"})
    void update_success_changes_header_and_lines_and_writes_audit_log() throws Exception {
        PartnerOrder order = saveOrder("2026/05/17-1", false);
        String updatedAt = currentModifiedAt(order.getId());

        mockMvc.perform(put("/api/v1/partner-orders/{id}", order.getId())
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Name", "영업담당자")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateJson(updatedAt, 3)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.orderNumber").value("2026/05/17-1"))
                .andExpect(jsonPath("$.data.partnerCode").value("P-SP0842-EDITED"))
                .andExpect(jsonPath("$.data.partnerName").doesNotExist())
                .andExpect(jsonPath("$.data.dueDate").value("2026-05-30"))
                .andExpect(jsonPath("$.data.memo").value("오전 납품 요청"))
                .andExpect(jsonPath("$.data.updatedAt").exists())
                .andExpect(jsonPath("$.data.lines.length()").value(2))
                .andExpect(jsonPath("$.data.lines[0].quantity").value(3))
                .andExpect(jsonPath("$.data.lines[0].categoryKey").value("homemulti"))
                .andExpect(jsonPath("$.data.lines[1].categoryKey").value("singleSets"))
                .andExpect(jsonPath("$.data.lines[1].productName").value("벽걸이 실내기"));

        org.assertj.core.api.Assertions.assertThat(auditLogRepository.findByEntityIdOrderByRevisionNoDescChangedAtDesc(order.getId()))
                .extracting("fieldName")
                .contains("납기", "요청사항", "주문 라인");
        org.assertj.core.api.Assertions.assertThat(auditLogRepository.findByEntityIdOrderByRevisionNoDescChangedAtDesc(order.getId()))
                .filteredOn(log -> "요청사항".equals(log.getFieldName()))
                .extracting("oldValue", "newValue")
                .containsExactly(org.assertj.core.api.Assertions.tuple(null, "오전 납품 요청"));
        org.assertj.core.api.Assertions.assertThat(auditLogRepository.findByEntityIdOrderByRevisionNoDescChangedAtDesc(order.getId()))
                .filteredOn(log -> "납기".equals(log.getFieldName()))
                .extracting("oldValue", "newValue")
                .containsExactly(org.assertj.core.api.Assertions.tuple(null, "2026-05-30"));
        org.assertj.core.api.Assertions.assertThat(auditLogRepository.findByEntityIdOrderByRevisionNoDescChangedAtDesc(order.getId()))
                .filteredOn(log -> "주문 라인".equals(log.getFieldName()))
                .extracting(log -> log.getNewValue())
                .allMatch(value -> value.toString().contains("AR09B9150HZ/벽걸이 실내기/1/310000"));

        mockMvc.perform(put("/api/v1/partner-orders/{id}", order.getId())
                        .header("X-User-Name", "영업담당자")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateJson(currentModifiedAt(order.getId()), 3)))
                .andExpect(status().isOk());

        org.assertj.core.api.Assertions.assertThat(auditLogRepository.findByEntityIdOrderByRevisionNoDescChangedAtDesc(order.getId()))
                .extracting("fieldName")
                .contains("납기", "요청사항", "주문 라인");
    }

    @Test
    @WithMockUser(roles = {"SALES"})
    void update_optimistic_lock_conflict_returns_409() throws Exception {
        PartnerOrder order = saveOrder("2026/05/17-2", false);

        mockMvc.perform(put("/api/v1/partner-orders/{id}", order.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateJson(LocalDateTime.parse("2020-01-01T00:00:00").toString(), 2)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PARTNER_ORDER_OPTIMISTIC_LOCK_CONFLICT"));
    }

    @Test
    @WithMockUser(roles = {"SALES"})
    void testVerifyVersionAllowsFirstUpdateWhenModifiedAtIsNull() throws Exception {
        PartnerOrder allowed = saveOrder("2026/05/17-9", false);
        LocalDateTime createdAt = currentCreatedAt(allowed.getId());
        clearModifiedAt(allowed.getId());

        assertThat(orderRepository.findById(allowed.getId()).orElseThrow().getModifiedAt()).isNull();

        mockMvc.perform(put("/api/v1/partner-orders/{id}", allowed.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateJson(createdAt.toString(), 2)))
                .andExpect(status().isOk());

        PartnerOrder rejected = saveOrder("2026/05/17-10", false);
        clearModifiedAt(rejected.getId());

        mockMvc.perform(put("/api/v1/partner-orders/{id}", rejected.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateJson(LocalDateTime.parse("2020-01-01T00:00:00").toString(), 2)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PARTNER_ORDER_OPTIMISTIC_LOCK_CONFLICT"));
    }

    @Test
    @WithMockUser(roles = {"SALES"})
    void update_soft_deleted_order_returns_404() throws Exception {
        PartnerOrder order = saveOrder("2026/05/17-3", true);

        mockMvc.perform(put("/api/v1/partner-orders/{id}", order.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateJson(LocalDateTime.now().toString(), 2)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("PARTNER_ORDER_NOT_FOUND"));
    }

    @Test
    @WithMockUser(roles = {"PARTNER"})
    void update_partner_role_is_forbidden() throws Exception {
        PartnerOrder order = saveOrder("2026/05/17-4", false);
        when(dynamicPermissionClient.canEdit("PARTNER", "sales.partner-order.edit")).thenReturn(false);

        mockMvc.perform(put("/api/v1/partner-orders/{id}", order.getId())
                        .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "PARTNER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateJson(currentModifiedAt(order.getId()), 2)))
                .andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(roles = {"SALES"})
    void update_negative_quantity_returns_422() throws Exception {
        PartnerOrder order = saveOrder("2026/05/17-5", false);

        mockMvc.perform(put("/api/v1/partner-orders/{id}", order.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateJson(currentModifiedAt(order.getId()), -1)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("PARTNER_ORDER_UPDATE_INVALID_LINE"));
    }

    @Test
    @WithMockUser(roles = {"MASTER"})
    void update_master_role_can_use_order_number_path() throws Exception {
        PartnerOrder order = saveOrder("2026/05/17-6", false);

        mockMvc.perform(put("/api/v1/partner-orders/{id}", "2026-05-17-6")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateJson(currentModifiedAt(order.getId()), 1)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.lines.length()", greaterThanOrEqualTo(1)));
    }

    @Test
    void testConcurrentUpdateRejectsStaleVersion() {
        PartnerOrder order = saveOrder("2026/05/17-7", false);
        UUID orderId = order.getId();
        entityManager.clear();

        PartnerOrder copyA = orderRepository.findById(orderId).orElseThrow();
        entityManager.detach(copyA);
        PartnerOrder copyB = orderRepository.findById(orderId).orElseThrow();
        entityManager.detach(copyB);

        copyA.updateHeader("P-SP0842-A", "1010101010", null, "first");
        orderRepository.saveAndFlush(copyA);
        entityManager.clear();

        copyB.updateHeader("P-SP0842-B", "1010101010", null, "second");

        assertThatThrownBy(() -> orderRepository.saveAndFlush(copyB))
                .isInstanceOfAny(
                        ObjectOptimisticLockingFailureException.class,
                        org.hibernate.StaleObjectStateException.class);
    }

    @Test
    @WithMockUser(roles = {"SALES"})
    void testReplaceLinesSoftDeletesOldLines() throws Exception {
        PartnerOrder order = saveOrder("2026/05/17-8", false);
        UUID orderId = order.getId();

        mockMvc.perform(put("/api/v1/partner-orders/{id}", orderId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateJson(currentModifiedAt(orderId), 2)))
                .andExpect(status().isOk());

        Integer deletedCount = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                  FROM partner_order_lines
                 WHERE partner_order_id = ?
                   AND is_deleted = TRUE
                   AND deleted_at IS NOT NULL
                """, Integer.class, orderId);
        Integer activeCount = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                  FROM partner_order_lines
                 WHERE partner_order_id = ?
                   AND is_deleted = FALSE
                """, Integer.class, orderId);

        assertThat(deletedCount).isEqualTo(1);
        assertThat(activeCount).isEqualTo(2);
        assertThat(lineRepository.findAllByPartnerOrder_Id(orderId)).hasSize(2);
    }

    private PartnerOrder saveOrder(String orderNo, boolean deleted) {
        PartnerOrder order = PartnerOrder.create(
                "P-SP0842",
                "1010101010",
                orderNo,
                "IT-SP0842-" + orderNo,
                BigDecimal.ZERO);
        order.markSlipPublished("S-" + orderNo.replace("/", "").replace("-", ""));
        order.addLine(PartnerOrderLine.create(
                stableProductId("AJ040RXH4BC1"),
                "AJ040RXH4BC1",
                "실외기",
                "homemulti",
                2,
                new BigDecimal("120000"),
                "현장 납품"));
        if (deleted) {
            order.markDeleted("it");
        }
        return orderRepository.saveAndFlush(order);
    }

    private String currentModifiedAt(UUID orderId) {
        return orderRepository.findById(orderId)
                .map(order -> order.getModifiedAt() != null
                        ? order.getModifiedAt().toString()
                        : order.getCreatedAt().toString())
                .orElseThrow();
    }

    private LocalDateTime currentCreatedAt(UUID orderId) {
        return orderRepository.findById(orderId)
                .map(PartnerOrder::getCreatedAt)
                .orElseThrow();
    }

    private void clearModifiedAt(UUID orderId) {
        jdbcTemplate.update("UPDATE partner_orders SET modified_at = NULL WHERE id = ?", orderId);
        entityManager.clear();
    }

    private String updateJson(String updatedAt, int quantity) {
        return """
                {
                  "updatedAt": "%s",
                  "partnerCode": "P-SP0842-EDITED",
                  "bizCode": "1010101010",
                  "dueDate": "2026-05-30",
                  "memo": "오전 납품 요청",
                  "lines": [
                    {
                      "modelCode": "AJ040RXH4BC1",
                      "productName": "실외기",
                      "categoryKey": "homemulti",
                      "quantity": %d,
                      "deliveryPrice": 125000,
                      "remark": "현장 납품"
                    },
                    {
                      "modelCode": "AR09B9150HZ",
                      "productName": "벽걸이 실내기",
                      "categoryKey": "singleSets",
                      "quantity": 1,
                      "deliveryPrice": 310000,
                      "remark": "추가"
                    }
                  ]
                }
                """.formatted(updatedAt, quantity);
    }

    private UUID stableProductId(String modelCode) {
        return UUID.nameUUIDFromBytes(("sp-08-4-2:" + modelCode).getBytes(StandardCharsets.UTF_8));
    }
}
