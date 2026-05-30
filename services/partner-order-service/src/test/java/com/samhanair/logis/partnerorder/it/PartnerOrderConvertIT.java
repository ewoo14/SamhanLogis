package com.samhanair.logis.partnerorder.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.partnerorder.PartnerOrderServiceApplication;
import com.samhanair.logis.partnerorder.client.DcConfigClient;
import com.samhanair.logis.partnerorder.client.EstimateClient;
import com.samhanair.logis.partnerorder.client.InventoryClient;
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
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Phase 2.6a 거래처 주문 부분전환 통합 테스트.
 *
 * <p>실 Postgres(Testcontainers) + 실 Flyway. {@link AbstractPostgresIT} 상속으로 Docker 미가용 시 자동 skip.
 *
 * <p><b>검증 케이스:</b>
 * <ol>
 *   <li>DRAFT 주문 일부전환 → 200, slip 발행 호출, converted_quantity DB 단언, 주문 status DRAFT 유지</li>
 *   <li>전량 전환 → 주문 status=CONVERTED (DB 단언)</li>
 *   <li>잔여 초과 전환 → 409 CONFLICT</li>
 *   <li>slipNo 있는 주문(CONFIRMED) 전환 → 409 CONFLICT (requireConvertible)</li>
 *   <li>권한 CREATE deny → 403 / MASTER bypass → 200</li>
 *   <li>SlipServiceClient 가 받은 payload 에 sourceOrderLineId + 선택 라인만 포함 (captor 단언)</li>
 * </ol>
 *
 * <p><b>외부 client @MockBean 격리</b> ({@code feedback_it_mockbean_external_clients}):
 * HoldStatusFilterIT 와 동일한 목록 전부 @MockBean + lenient stub.
 */
@SpringBootTest(classes = PartnerOrderServiceApplication.class)
@AutoConfigureMockMvc
class PartnerOrderConvertIT extends AbstractPostgresIT {

    // ── 테스트 상수 ─────────────────────────────────────────────────────────────

    private static final String MASTER_ACCOUNT_ID = "40000000-0000-0000-0000-000000000001";
    private static final String SALES_ACCOUNT_ID  = "40000000-0000-0000-0000-000000000002";
    private static final String VIEWER_ACCOUNT_ID = "40000000-0000-0000-0000-000000000003";

    /** 테스트용 stub slipNo. */
    private static final String STUB_SLIP_NO = "2026/05/30-1";

    // ── 의존성 ─────────────────────────────────────────────────────────────────

    @Autowired private MockMvc mockMvc;
    @Autowired private PartnerOrderRepository orderRepository;
    @Autowired private SlipPublishOutboxRepository outboxRepository;
    @Autowired private JdbcTemplate jdbcTemplate;
    @Autowired private ObjectMapper objectMapper;

    // ── 외부 client MockBean ────────────────────────────────────────────────────

    @MockBean private EstimateClient estimateClient;
    @MockBean private DcConfigClient dcConfigClient;
    @MockBean private ProductClient productClient;
    @MockBean private InventoryClient inventoryClient;
    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private PartnerAuthClient partnerAuthClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private ProductCatalogLookupClient catalogLookupClient;
    @MockBean private DynamicPermissionClient dynamicPermissionClient;

    // ── 테스트 셋업 ─────────────────────────────────────────────────────────────

    @BeforeEach
    void setUp() {
        outboxRepository.deleteAll();
        jdbcTemplate.update("DELETE FROM partner_order_lines");
        orderRepository.deleteAll();

        // DynamicPermissionClient 7-action lenient stub (기본=허용)
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.check(
                any(UUID.class), anyString(), any(PermissionAction.class))).thenReturn(true);

        // 외부 client 기본 lenient stub
        lenient().when(dcConfigClient.fetchDcConfig(anyString())).thenReturn(Map.of());
        lenient().when(productClient.lookup(anyList())).thenReturn(List.of());

        // SlipServiceClient 기본 stub — slipNo 반환
        lenient().when(slipServiceClient.publishFromPartnerOrder(any(), anyString()))
                .thenReturn(PublishResult.published(STUB_SLIP_NO));
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 케이스 1 — DRAFT 일부전환 → 200 + converted_quantity DB 단언 + status DRAFT 유지
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * DRAFT 주문(slipNo=null) 의 라인 1개를 일부 수량 전환.
     * → 200 OK, slip 발행 호출, DB converted_quantity 갱신, 주문 status 는 DRAFT 유지.
     */
    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("케이스1: DRAFT 일부전환 → 200 + converted_quantity DB 단언 + status DRAFT 유지")
    void case1_partialConvert_draftOrder_returnsOkAndUpdatesConvertedQuantity() throws Exception {
        UUID orderId = UUID.randomUUID();
        UUID lineId = UUID.randomUUID();
        insertOrderWithLine(orderId, lineId, "P-CONV-001", "1111111111",
                "2026/05/30-CONV-1", "DRAFT", null, 10, BigDecimal.valueOf(50000));

        String body = """
                {
                  "items": [{"orderLineId": "%s", "quantity": 3}],
                  "warehouseCode": "WH-001"
                }
                """.formatted(lineId);

        mockMvc.perform(post("/api/v1/partner-orders/{id}/convert-to-slip", orderId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body)
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .header("X-User-Name", "영업담당자"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.slipNo").value(STUB_SLIP_NO))
                .andExpect(jsonPath("$.data.orderStatus").value("DRAFT"))
                .andExpect(jsonPath("$.data.fullyConverted").value(false));

        // DB 단언 — converted_quantity = 3
        Integer convertedQty = jdbcTemplate.queryForObject(
                "SELECT converted_quantity FROM partner_order_lines WHERE id = ?",
                Integer.class, lineId);
        assertThat(convertedQty).isEqualTo(3);

        // 주문 status 유지 확인
        String dbStatus = jdbcTemplate.queryForObject(
                "SELECT status FROM partner_orders WHERE id = ?", String.class, orderId);
        assertThat(dbStatus).isEqualTo("DRAFT");
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 케이스 2 — 전량 전환 → status=CONVERTED (DB 단언)
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * DRAFT 주문 전량 전환 → 주문 status CONVERTED, DB 단언.
     */
    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("케이스2: 전량 전환 → status=CONVERTED (DB 단언)")
    void case2_fullConvert_draftOrder_statusBecomesConverted() throws Exception {
        UUID orderId = UUID.randomUUID();
        UUID lineId = UUID.randomUUID();
        insertOrderWithLine(orderId, lineId, "P-CONV-002", "2222222222",
                "2026/05/30-CONV-2", "DRAFT", null, 5, BigDecimal.valueOf(30000));

        String body = """
                {
                  "items": [{"orderLineId": "%s", "quantity": 5}],
                  "warehouseCode": "WH-001"
                }
                """.formatted(lineId);

        mockMvc.perform(post("/api/v1/partner-orders/{id}/convert-to-slip", orderId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body)
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .header("X-User-Name", "영업담당자"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.orderStatus").value("CONVERTED"))
                .andExpect(jsonPath("$.data.fullyConverted").value(true));

        // DB 단언
        String dbStatus = jdbcTemplate.queryForObject(
                "SELECT status FROM partner_orders WHERE id = ?", String.class, orderId);
        assertThat(dbStatus).isEqualTo("CONVERTED");
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 케이스 3 — 잔여 초과 전환 → 409
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * 잔여 수량(5) 초과하는 전환 요청(6) → 409 CONFLICT.
     */
    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("케이스3: 잔여 초과 전환 → 409 CONFLICT")
    void case3_overRemaining_returns409() throws Exception {
        UUID orderId = UUID.randomUUID();
        UUID lineId = UUID.randomUUID();
        insertOrderWithLine(orderId, lineId, "P-CONV-003", "3333333333",
                "2026/05/30-CONV-3", "DRAFT", null, 5, BigDecimal.valueOf(20000));

        String body = """
                {
                  "items": [{"orderLineId": "%s", "quantity": 6}],
                  "warehouseCode": "WH-001"
                }
                """.formatted(lineId);

        mockMvc.perform(post("/api/v1/partner-orders/{id}/convert-to-slip", orderId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body)
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .header("X-User-Name", "영업담당자"))
                .andExpect(status().isConflict());
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 케이스 4 — slipNo 있는 주문 전환 → 409 (requireConvertible)
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * slipNo 가 이미 있는 CONFIRMED 주문 전환 시도 → 409 CONFLICT.
     */
    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("케이스4: slipNo 있는 주문 전환 → 409 CONFLICT (requireConvertible)")
    void case4_confirmedOrderWithSlipNo_returns409() throws Exception {
        UUID orderId = UUID.randomUUID();
        UUID lineId = UUID.randomUUID();
        insertOrderWithLine(orderId, lineId, "P-CONV-004", "4444444444",
                "2026/05/30-CONV-4", "CONFIRMED", "2026/01/01-1", 5, BigDecimal.valueOf(10000));

        String body = """
                {
                  "items": [{"orderLineId": "%s", "quantity": 2}],
                  "warehouseCode": "WH-001"
                }
                """.formatted(lineId);

        mockMvc.perform(post("/api/v1/partner-orders/{id}/convert-to-slip", orderId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body)
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .header("X-User-Name", "영업담당자"))
                .andExpect(status().isConflict());
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 케이스 5 — 권한 deny → 403 / MASTER bypass → 200
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * CREATE 권한 deny → 403.
     */
    @Test
    @WithMockUser(roles = {"PARTNER"})
    @DisplayName("케이스5a: 권한 deny(CREATE) → 403 FORBIDDEN")
    void case5a_permissionDeny_returns403() throws Exception {
        when(dynamicPermissionClient.check(
                any(UUID.class),
                eq("sales.partner-order.convert"),
                eq(PermissionAction.CREATE)))
                .thenReturn(false);

        UUID orderId = UUID.randomUUID();
        UUID lineId = UUID.randomUUID();
        insertOrderWithLine(orderId, lineId, "P-CONV-005", "5111111111",
                "2026/05/30-CONV-5", "DRAFT", null, 5, BigDecimal.valueOf(10000));

        String body = """
                {
                  "items": [{"orderLineId": "%s", "quantity": 2}],
                  "warehouseCode": "WH-001"
                }
                """.formatted(lineId);

        mockMvc.perform(post("/api/v1/partner-orders/{id}/convert-to-slip", orderId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body)
                        .header("X-User-Id", VIEWER_ACCOUNT_ID)
                        .header("X-User-Role", "PARTNER")
                        .header("X-User-Name", "거래처"))
                .andExpect(status().isForbidden());
    }

    /**
     * MASTER 역할 → DynamicPermissionClient bypass → 200.
     */
    @Test
    @WithMockUser(roles = {"MASTER"})
    @DisplayName("케이스5b: MASTER 역할 → bypass → 200")
    void case5b_masterRole_bypass_returns200() throws Exception {
        lenient().when(dynamicPermissionClient.check(
                any(UUID.class),
                eq("sales.partner-order.convert"),
                eq(PermissionAction.CREATE)))
                .thenReturn(true);

        UUID orderId = UUID.randomUUID();
        UUID lineId = UUID.randomUUID();
        insertOrderWithLine(orderId, lineId, "P-CONV-006", "6111111111",
                "2026/05/30-CONV-6", "DRAFT", null, 5, BigDecimal.valueOf(10000));

        String body = """
                {
                  "items": [{"orderLineId": "%s", "quantity": 2}],
                  "warehouseCode": "WH-001"
                }
                """.formatted(lineId);

        mockMvc.perform(post("/api/v1/partner-orders/{id}/convert-to-slip", orderId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body)
                        .header("X-User-Id", MASTER_ACCOUNT_ID)
                        .header("X-User-Role", "MASTER")
                        .header("X-User-Name", "관리자"))
                .andExpect(status().isOk());
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 케이스 6 — SlipServiceClient payload: sourceOrderLineId + 선택 라인만 (captor 단언)
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * SlipServiceClient 가 받은 payload 에 sourceOrderLineId + 선택 라인만 포함됨을 captor 로 단언.
     */
    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("케이스6: payload captor — sourceOrderLineId 포함 + 선택 라인만")
    @SuppressWarnings("unchecked")
    void case6_slipPayload_containsSourceOrderLineIdAndSelectedLinesOnly() throws Exception {
        UUID orderId = UUID.randomUUID();
        UUID lineId1 = UUID.randomUUID();
        UUID lineId2 = UUID.randomUUID();

        // 라인 2개 주문 INSERT
        jdbcTemplate.update("""
                INSERT INTO partner_orders
                  (id, partner_code, biz_code, order_no, slip_no, status,
                   slip_publish_status, total_amount, confirmed_at, slip_published_at,
                   due_date, memo, source_estimate_id, revision_count,
                   idempotency_key, lock_version,
                   created_at, created_by, modified_at, modified_by,
                   is_deleted, deleted_at, deleted_by)
                VALUES
                  (?, 'P-CAP-001', '7111111111', '2026/05/30-CONV-CAP', NULL, 'DRAFT',
                   'NOT_REQUIRED', 100000, NULL, NULL,
                   NULL, NULL, NULL, 0,
                   ?, 0,
                   NOW(), 'test', NOW(), 'test',
                   FALSE, NULL, NULL)
                """, orderId, "idem-cap-" + orderId);

        jdbcTemplate.update("""
                INSERT INTO partner_order_lines
                  (id, partner_order_id, product_id, model_name, product_name,
                   category_key, quantity, price_vat, subtotal, remark,
                   converted_quantity,
                   created_at, created_by, modified_at, modified_by,
                   is_deleted, deleted_at, deleted_by)
                VALUES
                  (?, ?, ?, 'MODEL-A', '상품 A', 'homemulti', 10, 10000, 100000, NULL, 0,
                   NOW(), 'test', NOW(), 'test', FALSE, NULL, NULL),
                  (?, ?, ?, 'MODEL-B', '상품 B', 'homemulti', 5, 20000, 100000, NULL, 0,
                   NOW(), 'test', NOW(), 'test', FALSE, NULL, NULL)
                """,
                lineId1, orderId, UUID.randomUUID(),
                lineId2, orderId, UUID.randomUUID());

        // 라인 1개만 선택
        String body = """
                {
                  "items": [{"orderLineId": "%s", "quantity": 3}],
                  "warehouseCode": "WH-001"
                }
                """.formatted(lineId1);

        ArgumentCaptor<Map<String, Object>> payloadCaptor = ArgumentCaptor.forClass(Map.class);
        ArgumentCaptor<String> keyCaptor = ArgumentCaptor.forClass(String.class);

        mockMvc.perform(post("/api/v1/partner-orders/{id}/convert-to-slip", orderId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body)
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .header("X-User-Name", "영업담당자"))
                .andExpect(status().isOk());

        verify(slipServiceClient).publishFromPartnerOrder(
                payloadCaptor.capture(), keyCaptor.capture());

        Map<String, Object> capturedPayload = payloadCaptor.getValue();
        List<Map<String, Object>> capturedLines =
                (List<Map<String, Object>>) capturedPayload.get("lines");

        // 선택 라인 1개만 전달됨
        assertThat(capturedLines).hasSize(1);

        // sourceOrderLineId 포함 단언
        Map<String, Object> capturedLine = capturedLines.get(0);
        assertThat(capturedLine.get("sourceOrderLineId").toString())
                .isEqualTo(lineId1.toString());

        // 수량 단언
        assertThat(capturedLine.get("qty")).isEqualTo("3");

        // idempotencyKey 가 PO-CONV- prefix 로 시작
        assertThat(keyCaptor.getValue()).startsWith("PO-CONV-");
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 헬퍼 메서드
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * 주문 + 라인 1개를 JDBC 직접 INSERT.
     */
    private void insertOrderWithLine(UUID orderId, UUID lineId,
                                      String partnerCode, String bizCode,
                                      String orderNo, String status, String slipNo,
                                      int quantity, BigDecimal priceVat) {
        jdbcTemplate.update("""
                INSERT INTO partner_orders
                  (id, partner_code, biz_code, order_no, slip_no, status,
                   slip_publish_status, total_amount, confirmed_at, slip_published_at,
                   due_date, memo, source_estimate_id, revision_count,
                   idempotency_key, lock_version,
                   created_at, created_by, modified_at, modified_by,
                   is_deleted, deleted_at, deleted_by)
                VALUES
                  (?, ?, ?, ?, ?, ?,
                   'NOT_REQUIRED', 0, NULL, NULL,
                   NULL, NULL, NULL, 0,
                   ?, 0,
                   NOW(), 'test', NOW(), 'test',
                   FALSE, NULL, NULL)
                """,
                orderId, partnerCode, bizCode, orderNo, slipNo, status,
                "idem-conv-" + orderNo);

        jdbcTemplate.update("""
                INSERT INTO partner_order_lines
                  (id, partner_order_id, product_id, model_name, product_name,
                   category_key, quantity, price_vat, subtotal, remark,
                   converted_quantity,
                   created_at, created_by, modified_at, modified_by,
                   is_deleted, deleted_at, deleted_by)
                VALUES
                  (?, ?, ?, 'MODEL-X', '상품X', 'homemulti', ?, ?, ?, NULL, 0,
                   NOW(), 'test', NOW(), 'test', FALSE, NULL, NULL)
                """,
                lineId, orderId, UUID.randomUUID(), quantity, priceVat,
                priceVat.multiply(BigDecimal.valueOf(quantity)));
    }
}
