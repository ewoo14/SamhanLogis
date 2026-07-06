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
import java.time.LocalDate;
import java.time.LocalDateTime;
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
 * 주문 목록 endpoint 의 legacy GAS 동등 필터를 검증한다.
 *
 * <p>외부 client 는 전부 {@code @MockBean} 으로 격리한다. 본 IT 는 목록 조회 전용이라 외부 호출이
 * 없어도 Eureka 비활성 환경에서 실제 RestClient 로 빠지지 않아야 한다.
 */
@SpringBootTest(classes = PartnerOrderServiceApplication.class)
@AutoConfigureMockMvc
class PartnerOrderListIT extends AbstractPostgresIT {

    private static final String ACCOUNT_ID = "10000000-0000-0000-0000-000000000302";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private PartnerOrderRepository orderRepository;

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
    @MockBean
    private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void setUp() {
        // slip_publish_outbox.partner_order_id_fkey 위반 회피 — outbox 먼저 cleanup
        outboxRepository.deleteAll();
        jdbcTemplate.execute("TRUNCATE TABLE partner_orders RESTART IDENTITY CASCADE");
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.check(any(UUID.class), anyString(), any(PermissionAction.class)))
                .thenReturn(true);
        saveOrder("2026/05/01-1", "P-SP0841-A", "1010101010", "실외기", "AJ040RXH4BC1", "CONFIRMED");
        saveOrder("2026/05/03-1", "P-SP0841-B", "2020202020", "천장형 실내기", "AC060TN4PBH1", "CONFIRMING");
        saveOrder("2026/05/05-1", "P-SP0841-C", "3030303030", "벽걸이 실내기", "AR09B9150HZ", "CANCELED");
    }

    @Test
    @WithMockUser(roles = {"SALES"})
    void list_filters_by_date_range() throws Exception {
        mockMvc.perform(get("/api/v1/partner-orders")
                        .header("X-User-Id", ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .param("dateFrom", "2026-05-02")
                        .param("dateTo", "2026-05-04"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].orderNumber").value("2026/05/03-1"));
    }

    @Test
    @WithMockUser(roles = {"SALES"})
    void list_filters_by_partner_code() throws Exception {
        mockMvc.perform(get("/api/v1/partner-orders")
                        .header("X-User-Id", ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .param("partnerId", "P-SP0841-B"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].partnerCode").value("P-SP0841-B"));
    }

    @Test
    @WithMockUser(roles = {"SALES"})
    void list_filters_by_status() throws Exception {
        mockMvc.perform(get("/api/v1/partner-orders")
                        .header("X-User-Id", ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .param("status", "CONFIRMING"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].status").value("CONFIRMING"));
    }

    @Test
    @WithMockUser(roles = {"SALES"})
    void list_filters_by_search_keyword() throws Exception {
        mockMvc.perform(get("/api/v1/partner-orders")
                        .header("X-User-Id", ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .param("searchKeyword", "천장형"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].orderNumber").value("2026/05/03-1"));
    }

    @Test
    @WithMockUser(roles = {"SALES"})
    void list_swaps_reversed_date_range() throws Exception {
        mockMvc.perform(get("/api/v1/partner-orders")
                        .header("X-User-Id", ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .param("dateFrom", "2026-05-04")
                        .param("dateTo", "2026-05-02"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].orderNumber").value("2026/05/03-1"));
    }

    @Test
    @WithMockUser(roles = {"SALES"})
    void list_returns_empty_page_when_filter_has_no_match() throws Exception {
        mockMvc.perform(get("/api/v1/partner-orders")
                        .header("X-User-Id", ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .param("searchKeyword", "없는품목"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(0))
                .andExpect(jsonPath("$.data.content.length()").value(0));
    }

    @Test
    @WithMockUser(roles = {"SALES"})
    void list_includes_soft_deleted_rows_with_deleted_metadata() throws Exception {
        PartnerOrder deleted = saveOrder(
                "2026/05/07-9",
                "P-SP0841-D",
                "4040404040",
                "삭제 품목",
                "DEL-001",
                "CONFIRMING");
        deleted.markDeletedWithName(ACCOUNT_ID, "삭제담당자", LocalDateTime.parse("2026-05-08T10:15:00"));
        orderRepository.saveAndFlush(deleted);

        mockMvc.perform(get("/api/v1/partner-orders")
                        .header("X-User-Id", ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .param("searchKeyword", "삭제 품목"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].orderNumber").value("2026/05/07-9"))
                .andExpect(jsonPath("$.data.content[0].isDeleted").value(true))
                .andExpect(jsonPath("$.data.content[0].deletedAt").value("2026-05-08T10:15:00"))
                .andExpect(jsonPath("$.data.content[0].deletedByName").value("삭제담당자"));
    }

    private PartnerOrder saveOrder(String orderNo, String partnerCode, String bizCode,
                                   String productName, String modelName, String status) {
        PartnerOrder order = PartnerOrder.create(
                partnerCode,
                bizCode,
                orderNo,
                "IT-SP0841-" + orderNo,
                BigDecimal.ZERO);
        // 도메인 메서드 사용 (reflection 회피). DRAFT 진입 도메인 메서드 부재 →
        // CONFIRMING (create() 직후 상태) 으로 대체. 의미상 "초기 상태" 동등.
        if ("CANCELED".equals(status)) {
            order.cancel();
        } else if ("CONFIRMED".equals(status)) {
            order.markSlipPendingRetry();
        }
        // "CONFIRMING" 또는 "DRAFT" 입력 시 create() 직후 status 그대로 (CONFIRMING)
        order.addLine(PartnerOrderLine.create(
                UUID.randomUUID(),
                modelName,
                productName,
                "homemulti",
                1,
                new BigDecimal("100000"),
                "비고"));
        setConfirmedAt(order, LocalDate.parse(orderNo.substring(0, 10).replace("/", "-")).atTime(10, 0));
        return orderRepository.saveAndFlush(order);
    }

    /**
     * IT fixture 한계 — confirmedAt 은 production 도메인 메서드로 직접 set 할 수 없어 reflection 사용.
     * production code 영향 없음 (test scope only). setStatus reflection 은 도메인 메서드 사용으로 대체.
     */
    private void setConfirmedAt(PartnerOrder order, java.time.LocalDateTime confirmedAt) {
        try {
            java.lang.reflect.Field field = PartnerOrder.class.getDeclaredField("confirmedAt");
            field.setAccessible(true);
            field.set(order, confirmedAt);
        } catch (ReflectiveOperationException ex) {
            throw new IllegalStateException(ex);
        }
    }
}
