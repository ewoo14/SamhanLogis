package com.samhanair.logis.partnerorder.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
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
import com.samhanair.logis.partnerorder.client.ProductSummary;
import com.samhanair.logis.partnerorder.client.SlipServiceClient;
import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.domain.PartnerOrderLine;
import com.samhanair.logis.partnerorder.repository.PartnerOrderLineRepository;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.repository.SlipPublishOutboxRepository;
import com.samhanair.logis.partnerorder.vendor.client.PartnerLookupClient;
import com.samhanair.logis.partnerorder.vendor.client.ProductCatalogLookupClient;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.List;
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

    private static final String SALES_ACCOUNT_ID = "10000000-0000-0000-0000-000000000311";
    private static final String MASTER_ACCOUNT_ID = "10000000-0000-0000-0000-000000000312";
    private static final String PARTNER_ACCOUNT_ID = "10000000-0000-0000-0000-000000000313";

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
        // Phase 2.4 버전이력 — FK 미강제이므로 orderRepository.deleteAll() 전에 cleanup
        jdbcTemplate.update("DELETE FROM partner_order_revisions");
        jdbcTemplate.update("DELETE FROM partner_order_lines");
        orderRepository.deleteAll();
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.check(any(UUID.class), anyString(), any(PermissionAction.class)))
                .thenReturn(true);
        lenient().when(productClient.lookupByModelCodes(any())).thenReturn(List.of(
                new ProductSummary(UUID.fromString("00000000-0000-0000-0000-000000000909"),
                        "벽걸이 실내기", "AR09B9150HZ", null, new BigDecimal("310000"),
                        "ACTIVE", "AR09B9150HZ", "SINGLE", "singleSets")));
    }

    @Test
    @WithMockUser(username = "sales-user", roles = {"SALES"})
    void update_success_changes_header_and_lines_and_writes_audit_log() throws Exception {
        PartnerOrder order = saveOrder("2026/05/17-1", false);
        String updatedAt = currentModifiedAt(order.getId());

        mockMvc.perform(put("/api/v1/partner-orders/{id}", order.getId())
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "SALES")
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
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "SALES")
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
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "SALES")
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
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateJson(createdAt.toString(), 2)))
                .andExpect(status().isOk());

        PartnerOrder rejected = saveOrder("2026/05/17-10", false);
        clearModifiedAt(rejected.getId());

        mockMvc.perform(put("/api/v1/partner-orders/{id}", rejected.getId())
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "SALES")
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
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateJson(LocalDateTime.now().toString(), 2)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("PARTNER_ORDER_NOT_FOUND"));
    }

    @Test
    @WithMockUser(roles = {"PARTNER"})
    void update_partner_role_is_forbidden() throws Exception {
        PartnerOrder order = saveOrder("2026/05/17-4", false);
        when(dynamicPermissionClient.check(
                        any(UUID.class), eq("sales.partner-order.edit"), eq(PermissionAction.UPDATE)))
                .thenReturn(false);

        mockMvc.perform(put("/api/v1/partner-orders/{id}", order.getId())
                        .header("X-User-Id", PARTNER_ACCOUNT_ID)
                        .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "PARTNER")
                        // Phase C5-4: PARTNER 식별은 X-Is-Partner 헤더 기반
                        .header(HttpHeaderConstants.IS_PARTNER_HEADER, "true")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateJson(currentModifiedAt(order.getId()), 2)))
                .andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(roles = {"SALES"})
    void update_negative_quantity_returns_422() throws Exception {
        PartnerOrder order = saveOrder("2026/05/17-5", false);

        mockMvc.perform(put("/api/v1/partner-orders/{id}", order.getId())
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "SALES")
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
                        .header("X-User-Id", MASTER_ACCOUNT_ID)
                        .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "MASTER")
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
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "SALES")
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

    @Test
    @WithMockUser(roles = {"SALES"})
    void memo_only_update_preserves_existing_product_ids() throws Exception {
        PartnerOrder order = saveOrder("2026/05/17-11", false);
        UUID before = order.getLines().get(0).getProductId();

        mockMvc.perform(put("/api/v1/partner-orders/{id}", order.getId())
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(singleLineUpdateJson(currentModifiedAt(order.getId()),
                                "AJ040RXH4BC1", "실외기", "homemulti", "memo 변경")))
                .andExpect(status().isOk());

        assertThat(lineRepository.findAllByPartnerOrder_Id(order.getId()))
                .singleElement()
                .extracting(PartnerOrderLine::getProductId)
                .isEqualTo(before);
    }

    @Test
    @WithMockUser(roles = {"SALES"})
    void get_put_round_trip_with_legacy_line_total_without_authority_succeeds() throws Exception {
        PartnerOrder order = saveOrder("2026/05/17-15", false);

        mockMvc.perform(put("/api/v1/partner-orders/{id}", order.getId())
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(legacyLineTotalUpdateJson(currentModifiedAt(order.getId()),
                                "120000", null, null, null, "memo 왕복")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.memo").value("memo 왕복"));
    }

    @Test
    @WithMockUser(roles = {"MANAGER"})
    void manager_can_save_get_put_round_trip_with_legacy_line_total() throws Exception {
        PartnerOrder order = saveOrder("2026/05/17-18", false);

        mockMvc.perform(put("/api/v1/partner-orders/{id}", order.getId())
                        .header("X-User-Id", MASTER_ACCOUNT_ID)
                        .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(legacyLineTotalUpdateJson(currentModifiedAt(order.getId()),
                                "240000", null, null, null, "MANAGER memo 왕복")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.memo").value("MANAGER memo 왕복"));
    }

    @Test
    @WithMockUser(roles = {"SALES"})
    void all_three_amounts_without_authority_are_rejected() throws Exception {
        PartnerOrder order = saveOrder("2026/05/17-16", false);

        mockMvc.perform(put("/api/v1/partner-orders/{id}", order.getId())
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(singleLineAmountUpdateJson(currentModifiedAt(order.getId()),
                                "100000", "10000", "110000", null, "잘못된 금액 요청")))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("PARTNER_ORDER_UPDATE_INVALID_LINE"));
    }

    @Test
    @WithMockUser(roles = {"SALES"})
    void stored_supply_vat_round_trip_allows_memo_change_without_authority() throws Exception {
        PartnerOrder order = saveAmountOrder("2026/08/07-1");

        mockMvc.perform(put("/api/v1/partner-orders/{id}", order.getId())
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(storedAmountUpdateJson(currentModifiedAt(order.getId()), "220000", "memo 왕복")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.memo").value("memo 왕복"))
                .andExpect(jsonPath("$.data.lines[0].supplyAmount").value(200000))
                .andExpect(jsonPath("$.data.lines[0].vatAmount").value(20000))
                .andExpect(jsonPath("$.data.lines[0].lineTotal").value(220000))
                .andExpect(jsonPath("$.data.lines[0].authority").value("VAT"));
    }

    @Test
    @WithMockUser(roles = {"SALES"})
    void stored_supply_vat_change_without_authority_is_rejected() throws Exception {
        PartnerOrder order = saveAmountOrder("2026/08/07-2");

        mockMvc.perform(put("/api/v1/partner-orders/{id}", order.getId())
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(storedAmountUpdateJson(currentModifiedAt(order.getId()), "220001", "금액 조작")))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("PARTNER_ORDER_UPDATE_INVALID_LINE"));

        assertThat(lineRepository.findAllByPartnerOrder_Id(order.getId()))
                .singleElement().extracting(PartnerOrderLine::getLineTotal)
                .isEqualTo(new BigDecimal("220000.00"));
    }

    @Test
    @WithMockUser(roles = {"SALES"})
    void existing_line_memo_update_does_not_call_product_service_when_unavailable() throws Exception {
        PartnerOrder order = saveOrder("2026/08/07-3", false);
        when(productClient.lookupByModelCodes(any())).thenThrow(new RuntimeException("product-service unavailable"));

        mockMvc.perform(put("/api/v1/partner-orders/{id}", order.getId())
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(existingLineMemoUpdateJson(currentModifiedAt(order.getId()),
                                order.getLines().get(0), "기존 라인 메모")))
                .andExpect(status().isOk());

    }

    @Test
    @WithMockUser(roles = {"SALES"})
    void new_line_still_fails_explicitly_when_product_service_is_unavailable() throws Exception {
        PartnerOrder order = saveOrder("2026/08/07-4", false);
        when(productClient.lookupByModelCodes(any())).thenThrow(new RuntimeException("product-service unavailable"));

        mockMvc.perform(put("/api/v1/partner-orders/{id}", order.getId())
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(twoLineUpdateJson(currentModifiedAt(order.getId()), "NEW-UNAVAILABLE", "신규 품목", "homemulti")))
                .andExpect(status().is5xxServerError());

        assertThat(lineRepository.findAllByPartnerOrder_Id(order.getId()))
                .singleElement().extracting(PartnerOrderLine::getModelName)
                .isEqualTo("AJ040RXH4BC1");
    }

    @Test
    @WithMockUser(roles = {"SALES"})
    void orphan_existing_line_is_relinked_to_catalog_product_id() throws Exception {
        PartnerOrder order = PartnerOrder.create(
                "P-SP0842", "1010101010", "2026/05/17-17", "IT-SP0842-2026/05/17-17", BigDecimal.ZERO);
        UUID orphanId = UUID.fromString("77fabff4-6917-3846-ad8c-3616eba3a219");
        UUID catalogId = UUID.fromString("80bd3fac-6f65-3c05-8ec5-b1ac8d684b44");
        order.addLine(PartnerOrderLine.create(orphanId, "AR05TXEAAWKNEU-11", "삼성 윈드프리 5평형",
                "homemulti", 1, new BigDecimal("600000"), "orphan"));
        order = orderRepository.saveAndFlush(order);
        when(productClient.lookupByModelCodes(any())).thenReturn(List.of(
                new ProductSummary(catalogId, "삼성 윈드프리 5평형", "AR05TXEAAWKNEU-11", null,
                        new BigDecimal("600000"), "ACTIVE", "AR05TXEAAWKNEU-11", "SINGLE", "homemulti")));

        mockMvc.perform(put("/api/v1/partner-orders/{id}", order.getId())
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(singleLineAmountUpdateJson(currentModifiedAt(order.getId()),
                                null, null, "600000", null, "orphan 복구")))
                .andExpect(status().isOk());

        assertThat(lineRepository.findAllByPartnerOrder_Id(order.getId()))
                .singleElement()
                .extracting(PartnerOrderLine::getProductId)
                .isEqualTo(catalogId);
    }

    @Test
    @WithMockUser(roles = {"SALES"})
    void product_replacement_uses_catalog_product_id() throws Exception {
        PartnerOrder order = saveOrder("2026/05/17-12", false);
        UUID catalogId = UUID.fromString("00000000-0000-0000-0000-000000000912");
        when(productClient.lookupByModelCodes(any())).thenReturn(List.of(
                new ProductSummary(catalogId, "새 품목", "NEW-MODEL", null,
                        new BigDecimal("300000"), "ACTIVE", "NEW-MODEL", "SINGLE", "homemulti")));

        mockMvc.perform(put("/api/v1/partner-orders/{id}", order.getId())
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(singleLineUpdateJson(currentModifiedAt(order.getId()),
                                "NEW-MODEL", "새 품목", "homemulti", "교체")))
                .andExpect(status().isOk());

        assertThat(lineRepository.findAllByPartnerOrder_Id(order.getId()))
                .singleElement()
                .extracting(PartnerOrderLine::getProductId)
                .isEqualTo(catalogId);
    }

    @Test
    @WithMockUser(roles = {"SALES"})
    void added_line_uses_catalog_product_id() throws Exception {
        PartnerOrder order = saveOrder("2026/05/17-13", false);
        UUID catalogId = UUID.fromString("00000000-0000-0000-0000-000000000913");
        when(productClient.lookupByModelCodes(any())).thenReturn(List.of(
                new ProductSummary(catalogId, "추가 품목", "ADDED-MODEL", null,
                        new BigDecimal("300000"), "ACTIVE", "ADDED-MODEL", "SINGLE", "homemulti")));

        mockMvc.perform(put("/api/v1/partner-orders/{id}", order.getId())
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(twoLineUpdateJson(currentModifiedAt(order.getId()),
                                "ADDED-MODEL", "추가 품목", "homemulti")))
                .andExpect(status().isOk());

        assertThat(lineRepository.findAllByPartnerOrder_Id(order.getId()))
                .extracting(PartnerOrderLine::getProductId)
                .contains(catalogId);
    }

    @Test
    @WithMockUser(roles = {"SALES"})
    void unknown_catalog_product_is_reported_without_synthetic_id() throws Exception {
        PartnerOrder order = saveOrder("2026/05/17-14", false);
        when(productClient.lookupByModelCodes(any())).thenReturn(List.of());

        mockMvc.perform(put("/api/v1/partner-orders/{id}", order.getId())
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(singleLineUpdateJson(currentModifiedAt(order.getId()),
                                "UNKNOWN-MODEL", "없는 품목", "homemulti", "실패 원인")))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("PARTNER_ORDER_UPDATE_INVALID_LINE"));
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
                fixtureProductId("AJ040RXH4BC1"),
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

    private PartnerOrder saveAmountOrder(String orderNo) {
        PartnerOrder order = PartnerOrder.create(
                "P-SP0842", "1010101010", orderNo, "IT-SP0842-" + orderNo, BigDecimal.ZERO);
        order.addLine(PartnerOrderLine.createFromAuthoritativeAmounts(
                fixtureProductId("AR-EH05"), "AR-EH05", "금액 품목", "homemulti", 2,
                new BigDecimal("110000.00"), new BigDecimal("200000.00"),
                new BigDecimal("20000.00"), new BigDecimal("220000.00"),
                PartnerOrderLine.AmountAuthority.VAT, "금액 라인"));
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

    private String singleLineUpdateJson(String updatedAt, String modelCode, String productName,
                                         String categoryKey, String memo) {
        return """
                {
                  "updatedAt": "%s",
                  "partnerCode": "P-SP0842",
                  "bizCode": "1010101010",
                  "memo": "%s",
                  "lines": [{
                    "modelCode": "%s", "productName": "%s", "categoryKey": "%s",
                    "quantity": 2, "deliveryPrice": 125000, "remark": "현장 납품"
                  }]
                }
                """.formatted(updatedAt, memo, modelCode, productName, categoryKey);
    }

    private String twoLineUpdateJson(String updatedAt, String addedModelCode, String addedProductName,
                                     String addedCategoryKey) {
        return """
                {
                  "updatedAt": "%s",
                  "partnerCode": "P-SP0842",
                  "bizCode": "1010101010",
                  "memo": "라인 추가",
                  "lines": [
                    {"modelCode":"AJ040RXH4BC1","productName":"실외기","categoryKey":"homemulti","quantity":2,"deliveryPrice":125000,"remark":"현장 납품"},
                    {"modelCode":"%s","productName":"%s","categoryKey":"%s","quantity":1,"deliveryPrice":300000,"remark":"추가"}
                  ]
                }
                """.formatted(updatedAt, addedModelCode, addedProductName, addedCategoryKey);
    }

    private String singleLineAmountUpdateJson(String updatedAt, String supplyAmount, String vatAmount,
                                               String lineTotal, String authority, String memo) {
        String amounts = (supplyAmount == null ? "" : "\n\"supplyAmount\": " + supplyAmount + ",")
                + (vatAmount == null ? "" : "\n\"vatAmount\": " + vatAmount + ",")
                + (lineTotal == null ? "" : "\n\"lineTotal\": " + lineTotal + ",")
                + (authority == null ? "" : "\n\"authority\": \"" + authority + "\",");
        return """
                {
                  "updatedAt": "%s", "partnerCode": "P-SP0842", "bizCode": "1010101010",
                  "memo": "%s", "lines": [{
                    "modelCode": "AR05TXEAAWKNEU-11", "productName": "삼성 윈드프리 5평형",
                    "categoryKey": "homemulti", "quantity": 1, "deliveryPrice": 600000,%s
                    "remark": "orphan"
                  }]
                }
                """.formatted(updatedAt, memo, amounts);
    }

    private String legacyLineTotalUpdateJson(String updatedAt, String lineTotal, String vatAmount,
                                             String unusedSupplyAmount, String unusedAuthority, String memo) {
        return """
                {
                  "updatedAt": "%s", "partnerCode": "P-SP0842", "bizCode": "1010101010",
                  "memo": "%s", "lines": [{
                    "modelCode": "AJ040RXH4BC1", "productName": "실외기",
                    "categoryKey": "homemulti", "quantity": 2, "deliveryPrice": 120000,
                    "lineTotal": %s, "remark": "현장 납품"
                  }]
                }
                """.formatted(updatedAt, memo, lineTotal);
    }

    private String storedAmountUpdateJson(String updatedAt, String lineTotal, String memo) {
        return """
                {
                  "updatedAt": "%s", "partnerCode": "P-SP0842", "bizCode": "1010101010",
                  "memo": "%s", "lines": [{
                    "modelCode": "AR-EH05", "productName": "금액 품목",
                    "categoryKey": "homemulti", "quantity": 2, "deliveryPrice": 110000,
                    "supplyAmount": 200000, "vatAmount": 20000, "lineTotal": %s,
                    "remark": "금액 라인"
                  }]
                }
                """.formatted(updatedAt, memo, lineTotal);
    }

    private String existingLineMemoUpdateJson(String updatedAt, PartnerOrderLine line, String memo) {
        return """
                {
                  "updatedAt": "%s", "partnerCode": "P-SP0842", "bizCode": "1010101010",
                  "memo": "%s", "lines": [{
                    "modelCode": "%s", "productName": "%s",
                    "categoryKey": "%s", "quantity": %d, "deliveryPrice": %s,
                    "remark": "기존 라인 메모"
                  }]
                }
                """.formatted(updatedAt, memo, line.getModelName(), line.getProductName(),
                        line.getCategoryKey(), line.getQuantity(), line.getPriceVat());
    }

    private UUID fixtureProductId(String modelCode) {
        return UUID.nameUUIDFromBytes(("sp-08-4-2:" + modelCode).getBytes(StandardCharsets.UTF_8));
    }
}
