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
import org.springframework.test.util.ReflectionTestUtils;

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
    void list_merge_candidate_exact_partner_code_excludes_prefix_match() throws Exception {
        saveOrder("2026/05/11-1", "P-1", "1111111111", "정확 거래처", "EXACT-001", "CONFIRMING");
        saveOrder("2026/05/12-1", "P-10", "1010101010", "접두사 거래처", "PREFIX-001", "CONFIRMING");

        mockMvc.perform(get("/api/v1/partner-orders")
                        .header("X-User-Id", ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .param("partnerCode", "P-1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].partnerCode").value("P-1"));
    }

    @Test
    @WithMockUser(roles = {"SALES"})
    void list_merge_candidate_exact_partner_code_treats_wildcards_as_literal() throws Exception {
        saveOrder("2026/05/13-1", "P-%_", "1313131313", "와일드카드 거래처", "WILDCARD-001", "CONFIRMING");
        saveOrder("2026/05/14-1", "P-%_other", "1414141414", "와일드카드 접두사", "WILDCARD-002", "CONFIRMING");

        mockMvc.perform(get("/api/v1/partner-orders")
                        .header("X-User-Id", ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .param("partnerCode", "P-%_"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].partnerCode").value("P-%_"));
    }

    @Test
    @WithMockUser(roles = {"SALES"})
    void list_merge_candidate_exact_partner_id_excludes_same_code_different_identity() throws Exception {
        UUID selectedPartnerId = UUID.fromString("10000000-0000-0000-0000-000000000911");
        UUID otherPartnerId = UUID.fromString("10000000-0000-0000-0000-000000000912");
        PartnerOrder selected = saveOrder("2026/05/15-1", "P-SAME-UUID", "1515151515",
                "선택 거래처 주문", "IDENTITY-SELECTED", "CONFIRMING");
        PartnerOrder other = saveOrder("2026/05/16-1", "P-SAME-UUID", "1616161616",
                "상이 거래처 주문", "IDENTITY-OTHER", "CONFIRMING");
        ReflectionTestUtils.setField(selected, "partnerId", selectedPartnerId);
        ReflectionTestUtils.setField(other, "partnerId", otherPartnerId);
        orderRepository.saveAllAndFlush(java.util.List.of(selected, other));

        mockMvc.perform(get("/api/v1/partner-orders")
                        .header("X-User-Id", ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .param("partnerCode", "P-SAME-UUID")
                        .param("partnerIdExact", selectedPartnerId.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].orderNumber").value("2026/05/15-1"));
    }

    @Test
    @WithMockUser(roles = {"SALES"})
    void list_merge_candidate_exact_partner_id_keeps_legacy_rows_for_ineligibility_notice() throws Exception {
        UUID selectedPartnerId = UUID.fromString("10000000-0000-0000-0000-000000000913");
        PartnerOrder selected = saveOrder("2026/05/17-1", "P-LEGACY-MIX", "1717171717",
                "선택 거래처 주문", "IDENTITY-SELECTED-LEGACY-MIX", "CONFIRMING");
        PartnerOrder legacy = saveOrder("2026/05/18-1", "P-LEGACY-MIX", "1818181818",
                "기존 거래처 주문", "IDENTITY-LEGACY-MIX", "CONFIRMING");
        ReflectionTestUtils.setField(selected, "partnerId", selectedPartnerId);
        ReflectionTestUtils.setField(legacy, "partnerId", null);
        orderRepository.saveAllAndFlush(java.util.List.of(selected, legacy));

        mockMvc.perform(get("/api/v1/partner-orders")
                        .header("X-User-Id", ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .param("partnerCode", "P-LEGACY-MIX")
                        .param("partnerIdExact", selectedPartnerId.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(2))
                .andExpect(jsonPath("$.data.content[?(@.orderNumber == '2026/05/18-1')].mergeEligible").value(false))
                .andExpect(jsonPath("$.data.content[?(@.orderNumber == '2026/05/18-1')].mergeIneligibilityReason").value(
                        "기존 주문은 거래처 정체성을 확인할 수 없어 병합할 수 없습니다. 단건 전표 발행은 계속할 수 있습니다."));

        // includeDeleted=true는 native query 경로이므로 JPA 경로와 같은 legacy 고지 계약을 확인한다.
        mockMvc.perform(get("/api/v1/partner-orders")
                        .header("X-User-Id", ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .param("partnerCode", "P-LEGACY-MIX")
                        .param("partnerIdExact", selectedPartnerId.toString())
                        .param("includeDeleted", "true"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(2))
                .andExpect(jsonPath("$.data.content[?(@.orderNumber == '2026/05/18-1')].mergeEligible").value(false));
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
        saveDeletedOrder();

        // #757 R2 HIGH fix 이후 삭제행 포함은 내부 호출의 includeDeleted=true opt-in 전용.
        mockMvc.perform(get("/api/v1/partner-orders")
                        .header("X-User-Id", ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .param("includeDeleted", "true")
                        .param("searchKeyword", "삭제 품목"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].orderNumber").value("2026/05/07-9"))
                .andExpect(jsonPath("$.data.content[0].isDeleted").value(true))
                .andExpect(jsonPath("$.data.content[0].deletedAt").value("2026-05-08T10:15:00"))
                .andExpect(jsonPath("$.data.content[0].deletedByName").value("삭제담당자"));
    }

    @Test
    @WithMockUser(roles = {"SALES"})
    void list_excludes_soft_deleted_rows_without_include_deleted_param() throws Exception {
        saveDeletedOrder();

        // 기본값(includeDeleted 미지정) = 활성 행만 — 자동완성/타 소비처 삭제행 누출 방지.
        mockMvc.perform(get("/api/v1/partner-orders")
                        .header("X-User-Id", ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .param("searchKeyword", "삭제 품목"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(0));

        // 전체 조회에서도 삭제행 비포함(활성 3건만).
        mockMvc.perform(get("/api/v1/partner-orders")
                        .header("X-User-Id", ACCOUNT_ID)
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(3))
                .andExpect(jsonPath("$.data.content[?(@.isDeleted == true)]").isEmpty());
    }

    /**
     * #757 R2 HIGH — 파트너({@code X-Is-Partner}) 셀프서비스 호출은 {@code includeDeleted=true}
     * 를 실어 보내도 삭제행·내부 실명(deletedByName)이 절대 노출되지 않아야 한다(fail-closed).
     */
    @Test
    @WithMockUser(roles = {"PARTNER"})
    void partner_scope_excludes_soft_deleted_rows_even_when_include_deleted_requested() throws Exception {
        // 같은 거래처(P-SP0841-D)의 활성 1건 + 삭제 1건 시드.
        saveOrder("2026/05/09-1", "P-SP0841-D", "4040404040", "활성 품목", "ACT-001", "CONFIRMING");
        saveDeletedOrder();

        mockMvc.perform(get("/api/v1/partner-orders")
                        .header("X-User-Id", ACCOUNT_ID)
                        .header("X-User-Role", "PARTNER")
                        .header("X-Is-Partner", "true")
                        .header("X-Partner-Code", "P-SP0841-D")
                        .param("includeDeleted", "true"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].orderNumber").value("2026/05/09-1"))
                .andExpect(jsonPath("$.data.content[0].isDeleted").value(false))
                // Summary DTO 는 NON_NULL 미적용 — null 로 직렬화되므로 nullValue 매처로 단언.
                .andExpect(jsonPath("$.data.content[0].deletedByName").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.data.content[?(@.isDeleted == true)]").isEmpty());
    }

    private PartnerOrder saveDeletedOrder() {
        PartnerOrder deleted = saveOrder(
                "2026/05/07-9",
                "P-SP0841-D",
                "4040404040",
                "삭제 품목",
                "DEL-001",
                "CONFIRMING");
        deleted.markDeletedWithName(ACCOUNT_ID, "삭제담당자", LocalDateTime.parse("2026-05-08T10:15:00"));
        return orderRepository.saveAndFlush(deleted);
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
