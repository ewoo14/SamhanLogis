package com.samhanair.logis.partnerorder.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
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
import com.samhanair.logis.partnerorder.domain.SlipPublishStatus;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.repository.SlipPublishOutboxRepository;
import com.samhanair.logis.partnerorder.vendor.client.PartnerLookupClient;
import com.samhanair.logis.partnerorder.vendor.client.PartnerSummary;
import com.samhanair.logis.partnerorder.vendor.client.ProductCatalogLookupClient;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;
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
 * SP-08-4-3 C1 견적 -> 주문 변환 endpoint 통합 테스트.
 */
@SpringBootTest(classes = PartnerOrderServiceApplication.class)
@AutoConfigureMockMvc
class PartnerOrderFromEstimateIT extends AbstractPostgresIT {

    private static final String SALES_ACCOUNT_ID = "10000000-0000-0000-0000-000000000303";
    private static final String MANAGER_ACCOUNT_ID = "10000000-0000-0000-0000-000000000304";
    private static final String PARTNER_ACCOUNT_ID = "10000000-0000-0000-0000-000000000305";

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
    private EstimateClient estimateClient;
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
        lenient().when(partnerLookupClient.findByPartnerCodeForIdentity(anyString()))
                .thenAnswer(invocation -> {
                    String partnerCode = invocation.getArgument(0);
                    return Optional.of(new PartnerSummary(
                            UUID.nameUUIDFromBytes(partnerCode.getBytes(StandardCharsets.UTF_8)),
                            partnerCode, null, "1010101010"));
                });
    }

    @Test
    @WithMockUser(roles = {"SALES"})
    void testFromEstimateSuccess() throws Exception {
        UUID estimateId = UUID.randomUUID();
        when(estimateClient.findById(estimateId)).thenReturn(Optional.of(snapshot(estimateId)));

        mockMvc.perform(post("/api/v1/partner-orders/from-estimate/{estimateId}", estimateId)
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "SALES")
                        .header("X-User-Name", "영업담당자"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.orderNumber").exists())
                .andExpect(jsonPath("$.data.partnerCode").value("P-EST-001"))
                .andExpect(jsonPath("$.data.bizCode").value("1010101010"))
                .andExpect(jsonPath("$.data.status").value("DRAFT"))
                .andExpect(jsonPath("$.data.memo").value("견적 메모"))
                .andExpect(jsonPath("$.data.deliveryAddress").doesNotExist())
                .andExpect(jsonPath("$.data.lines.length()").value(2))
                .andExpect(jsonPath("$.data.lines[0].modelCode").value("AJ040RXH4BC1"));

        Integer convertedRows = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                  FROM partner_orders
                 WHERE source_estimate_id = ?
                   AND due_date = DATE '2026-05-30'
                   AND slip_publish_status = ?
                   AND is_deleted = FALSE
                """, Integer.class, estimateId, SlipPublishStatus.NOT_REQUIRED.name());
        assertThat(convertedRows).isEqualTo(1);

        UUID savedPartnerId = jdbcTemplate.queryForObject("""
                SELECT partner_id
                  FROM partner_orders
                 WHERE source_estimate_id = ?
                   AND is_deleted = FALSE
                """, UUID.class, estimateId);
        assertThat(savedPartnerId)
                .isEqualTo(UUID.nameUUIDFromBytes("P-EST-001".getBytes(StandardCharsets.UTF_8)));
    }

    @Test
    @WithMockUser(roles = {"SALES"})
    void testFromEstimateNotFoundReturns404() throws Exception {
        UUID estimateId = UUID.randomUUID();
        when(estimateClient.findById(estimateId)).thenReturn(Optional.empty());

        mockMvc.perform(post("/api/v1/partner-orders/from-estimate/{estimateId}", estimateId)
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "SALES"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("PARTNER_ORDER_FROM_ESTIMATE_NOT_FOUND"));
    }

    @Test
    @WithMockUser(roles = {"MANAGER"})
    void testFromEstimateAlreadyConvertedReturns409() throws Exception {
        UUID estimateId = UUID.randomUUID();
        when(estimateClient.findById(estimateId)).thenReturn(Optional.of(snapshot(estimateId)));

        mockMvc.perform(post("/api/v1/partner-orders/from-estimate/{estimateId}", estimateId)
                        .header("X-User-Id", MANAGER_ACCOUNT_ID)
                        .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "MANAGER"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.orderNumber").exists())
                .andExpect(jsonPath("$.data.lines").isArray())
                .andExpect(jsonPath("$.data.lines.length()").value(2))
                .andExpect(jsonPath("$.data.status").value("DRAFT"));

        mockMvc.perform(post("/api/v1/partner-orders/from-estimate/{estimateId}", estimateId)
                        .header("X-User-Id", MANAGER_ACCOUNT_ID)
                        .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "MANAGER"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PARTNER_ORDER_FROM_ESTIMATE_ALREADY_CONVERTED"));
    }

    @Test
    @WithMockUser(roles = {"PARTNER"})
    void testFromEstimatePartnerRoleForbidden() throws Exception {
        UUID estimateId = UUID.randomUUID();
        when(dynamicPermissionClient.check(
                        any(UUID.class), eq("sales.partner-order.edit"), eq(PermissionAction.CREATE)))
                .thenReturn(false);

        mockMvc.perform(post("/api/v1/partner-orders/from-estimate/{estimateId}", estimateId)
                        .header("X-User-Id", PARTNER_ACCOUNT_ID)
                        .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "PARTNER")
                        // Phase C5-4: PARTNER 식별은 X-Is-Partner 헤더 기반
                        .header(HttpHeaderConstants.IS_PARTNER_HEADER, "true"))
                .andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(roles = {"MANAGER"})
    void testFromEstimateSuccessRecordsAuditLog() throws Exception {
        UUID estimateId = UUID.randomUUID();
        when(estimateClient.findById(estimateId)).thenReturn(Optional.of(snapshot(estimateId)));

        mockMvc.perform(post("/api/v1/partner-orders/from-estimate/{estimateId}", estimateId)
                        .header("X-User-Id", MANAGER_ACCOUNT_ID)
                        .header(HttpHeaderConstants.CALLER_ROLE_HEADER, "MANAGER")
                        .header("X-User-Name", "영업담당자"))
                .andExpect(status().isCreated());

        Integer auditRows = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                  FROM partner_order_audit_logs
                 WHERE field_name = 'FROM_ESTIMATE'
                   AND new_value = '견적-2026-0001'
                   AND actor_name = '영업담당자'
                """, Integer.class);
        assertThat(auditRows).isEqualTo(1);
    }

    private EstimateClient.EstimateSnapshot snapshot(UUID estimateId) {
        return new EstimateClient.EstimateSnapshot(
                estimateId,
                "견적-2026-0001",
                "P-EST-001",
                "1010101010",
                "2026-05-30",
                "견적 메모",
                List.of(
                        new EstimateClient.EstimateLineSnapshot(
                                UUID.randomUUID(),
                                "AJ040RXH4BC1",
                                "실외기",
                                "homemulti",
                                2,
                                new BigDecimal("120000"),
                                "현장 납품"),
                        new EstimateClient.EstimateLineSnapshot(
                                UUID.randomUUID(),
                                "AR09B9150HZ",
                                "벽걸이 실내기",
                                "singleSets",
                                1,
                                new BigDecimal("310000"),
                                "추가")));
    }
}
