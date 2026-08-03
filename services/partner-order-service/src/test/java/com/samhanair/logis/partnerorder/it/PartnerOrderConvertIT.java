package com.samhanair.logis.partnerorder.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.partnerorder.PartnerOrderServiceApplication;
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
        lenient().when(dcConfigClient.calculatePrices(anyString(), anyList())).thenReturn(Map.of());
        lenient().when(productClient.lookup(anyList())).thenReturn(List.of());

        // InventoryClient stub — Phase 2.6c (reserve 예약 모델)
        // resolveWarehouseIdByCode: 임의 warehouseId 반환 (IT 목적은 convert 흐름 검증)
        lenient().when(inventoryClient.resolveWarehouseIdByCode(anyString()))
                .thenReturn(UUID.fromString("00000000-0000-0000-0000-000000000001"));
        // reserve: 정상 반환 (가용 부족 409 케이스는 별도 IT Phase26cConvertReserveIT 에서)
        lenient().when(inventoryClient.reserve(
                any(UUID.class), any(UUID.class), any(int.class),
                anyString(), any(UUID.class)))
                .thenReturn(ReservationResult.reserved());
        // release: void (보상 트랜잭션용)
        lenient().doNothing().when(inventoryClient).release(
                any(UUID.class), any(UUID.class), any(int.class),
                anyString(), any(UUID.class));

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

    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("주소 보강: 단일 주문 전환 payload에 구조화 배송주소 전달")
    void singleConvert_copiesStructuredDeliveryAddressToSlipPayload() throws Exception {
        UUID orderId = UUID.randomUUID();
        UUID lineId = UUID.randomUUID();
        insertOrderWithLine(orderId, lineId, "P-CONV-ADDRESS", "1111111111",
                "2026/05/30-CONV-ADDRESS", "DRAFT", null, 10,
                BigDecimal.valueOf(50000), "서울시 금천구 전표로 2");

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
                .andExpect(status().isOk());

        ArgumentCaptor<Map<String, Object>> payloadCaptor = ArgumentCaptor.forClass(Map.class);
        verify(slipServiceClient).publishFromPartnerOrder(payloadCaptor.capture(), anyString());
        assertThat(payloadCaptor.getValue().get("deliveryAddress"))
                .isEqualTo("서울시 금천구 전표로 2");
        assertThat(payloadCaptor.getValue().get("bizCode"))
                .isEqualTo("1111111111");
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
                        // Phase C5-4: PARTNER 식별은 X-Is-Partner 헤더 기반
                        .header("X-Is-Partner", "true")
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
                        // Phase C5-4: MASTER bypass 는 X-Is-System-Master=true 헤더 단독 판정
                        .header("X-Is-System-Master", "true")
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

        // 슬라이스 C — payload 에 inventory 해석 warehouseId 포함 (yml 미경유)
        assertThat(capturedPayload.get("warehouseId"))
                .isEqualTo("00000000-0000-0000-0000-000000000001");
        assertThat(capturedPayload.get("warehouseCode")).isEqualTo("WH-001");

        // idempotencyKey 가 PO-CONV- prefix 로 시작
        assertThat(keyCaptor.getValue()).startsWith("PO-CONV-");
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 케이스 7 — 같은 라인 2회 연속 부분전환 → converted_quantity 누적 + idempotencyKey 상이
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * 같은 주문 라인에 대해 2회 연속 부분전환(3 + 4 = 7) — converted_quantity 정확히 누적,
     * 1차와 2차 idempotencyKey 가 다름(convertedBefore 스냅샷이 다르므로 SHA-256 달라짐).
     */
    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("케이스7: 같은 라인 2회 연속 부분전환 → converted_quantity=7 누적, idempotencyKey 상이")
    @SuppressWarnings("unchecked")
    void case7_twoPartialConverts_sameLineAccumulate_differentIdempotencyKeys() throws Exception {
        UUID orderId = UUID.randomUUID();
        UUID lineId = UUID.randomUUID();
        // quantity=10, 1차=3, 2차=4 → 총 converted=7, 잔여=3
        insertOrderWithLine(orderId, lineId, "P-CONV-007", "7777777777",
                "2026/05/30-CONV-7", "DRAFT", null, 10, BigDecimal.valueOf(50000));

        // 1차 전환 (qty=3)
        ArgumentCaptor<Map<String, Object>> payloadCaptor1 = ArgumentCaptor.forClass(Map.class);
        ArgumentCaptor<String> keyCaptor1 = ArgumentCaptor.forClass(String.class);

        String body1 = """
                {
                  "items": [{"orderLineId": "%s", "quantity": 3}],
                  "warehouseCode": "WH-001"
                }
                """.formatted(lineId);

        mockMvc.perform(post("/api/v1/partner-orders/{id}/convert-to-slip", orderId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body1)
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .header("X-User-Name", "영업담당자"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.fullyConverted").value(false));

        verify(slipServiceClient).publishFromPartnerOrder(
                payloadCaptor1.capture(), keyCaptor1.capture());
        String key1 = keyCaptor1.getValue();

        // DB: converted_quantity = 3
        Integer convertedAfter1 = jdbcTemplate.queryForObject(
                "SELECT converted_quantity FROM partner_order_lines WHERE id = ?",
                Integer.class, lineId);
        assertThat(convertedAfter1).isEqualTo(3);

        // 2차 전환 (qty=4) — SlipServiceClient 재설정
        org.mockito.Mockito.reset(slipServiceClient);
        lenient().when(slipServiceClient.publishFromPartnerOrder(any(), anyString()))
                .thenReturn(PublishResult.published("2026/05/30-2"));

        ArgumentCaptor<Map<String, Object>> payloadCaptor2 = ArgumentCaptor.forClass(Map.class);
        ArgumentCaptor<String> keyCaptor2 = ArgumentCaptor.forClass(String.class);

        String body2 = """
                {
                  "items": [{"orderLineId": "%s", "quantity": 4}],
                  "warehouseCode": "WH-001"
                }
                """.formatted(lineId);

        mockMvc.perform(post("/api/v1/partner-orders/{id}/convert-to-slip", orderId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body2)
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .header("X-User-Name", "영업담당자"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.orderStatus").value("DRAFT"))
                .andExpect(jsonPath("$.data.fullyConverted").value(false));

        verify(slipServiceClient).publishFromPartnerOrder(
                payloadCaptor2.capture(), keyCaptor2.capture());
        String key2 = keyCaptor2.getValue();

        // DB: converted_quantity = 7 (3 + 4 누적)
        Integer convertedAfter2 = jdbcTemplate.queryForObject(
                "SELECT converted_quantity FROM partner_order_lines WHERE id = ?",
                Integer.class, lineId);
        assertThat(convertedAfter2).isEqualTo(7);

        // 두 idempotencyKey 는 반드시 달라야 함 (convertedBefore 스냅샷이 다르므로)
        assertThat(key1).isNotEqualTo(key2);
        assertThat(key1).startsWith("PO-CONV-");
        assertThat(key2).startsWith("PO-CONV-");
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 케이스 8 — 전량전환(CONVERTED) 후 추가 전환 → 409
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * 전량 전환으로 status=CONVERTED 된 주문에 추가 전환 시도 → 409 CONFLICT.
     * requireConvertible() 화이트리스트(DRAFT/ON_HOLD 만 허용) 에 의해 차단.
     */
    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("케이스8: 전량전환(CONVERTED) 후 추가 전환 시도 → 409 CONFLICT (requireConvertible 화이트리스트)")
    void case8_convertedOrderAdditionalConvert_returns409() throws Exception {
        UUID orderId = UUID.randomUUID();
        UUID lineId = UUID.randomUUID();
        // converted_quantity = quantity = 5 → status=CONVERTED 상태로 직접 INSERT
        jdbcTemplate.update("""
                INSERT INTO partner_orders
                  (id, partner_code, biz_code, order_no, slip_no, status,
                   slip_publish_status, total_amount, confirmed_at, slip_published_at,
                   due_date, memo, source_estimate_id, revision_count,
                   idempotency_key, lock_version,
                   created_at, created_by, modified_at, modified_by,
                   is_deleted, deleted_at, deleted_by)
                VALUES
                  (?, 'P-CONV-008', '8888888888', '2026/05/30-CONV-8', NULL, 'CONVERTED',
                   'NOT_REQUIRED', 0, NULL, NULL,
                   NULL, NULL, NULL, 0,
                   ?, 0,
                   NOW(), 'test', NOW(), 'test',
                   FALSE, NULL, NULL)
                """, orderId, "idem-conv-2026/05/30-CONV-8");

        jdbcTemplate.update("""
                INSERT INTO partner_order_lines
                  (id, partner_order_id, product_id, model_name, product_name,
                   category_key, quantity, price_vat, subtotal, remark,
                   converted_quantity,
                   created_at, created_by, modified_at, modified_by,
                   is_deleted, deleted_at, deleted_by)
                VALUES
                  (?, ?, ?, 'MODEL-X', '상품X', 'homemulti', 5, 50000, 250000, NULL, 5,
                   NOW(), 'test', NOW(), 'test', FALSE, NULL, NULL)
                """, lineId, orderId, UUID.randomUUID());

        String body = """
                {
                  "items": [{"orderLineId": "%s", "quantity": 1}],
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
    // 케이스 8b — CONVERTED + slipNo=null 비정상 조합 → 상태 가드 409
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * CONVERTED + slipNo=null 이면서 잔여수량이 남아 있는 비정상 DB 조합 전환 시도 → 409 CONFLICT.
     * slipNo 단독 가드에 의존하면 publish 경로로 진입할 수 있으므로 상태 화이트리스트가 먼저 차단해야 한다.
     */
    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("케이스8b: CONVERTED+slipNo=null+잔여수량 있음 전환 시도 → 409 (상태 화이트리스트)")
    void case8b_convertedOrderWithNullSlipNoAndRemainingQuantity_returns409BeforePublish() throws Exception {
        UUID orderId = UUID.randomUUID();
        UUID lineId = UUID.randomUUID();
        // 운영상 없어야 하는 조합이지만, 방어 회귀를 위해 DB 직접 INSERT 로 재현한다.
        jdbcTemplate.update("""
                INSERT INTO partner_orders
                  (id, partner_code, biz_code, order_no, slip_no, status,
                   slip_publish_status, total_amount, confirmed_at, slip_published_at,
                   due_date, memo, source_estimate_id, revision_count,
                   idempotency_key, lock_version,
                   created_at, created_by, modified_at, modified_by,
                   is_deleted, deleted_at, deleted_by)
                VALUES
                  (?, 'P-CONV-008B', '8888888880', '2026/05/30-CONV-8B', NULL, 'CONVERTED',
                   'NOT_REQUIRED', 0, NULL, NULL,
                   NULL, NULL, NULL, 0,
                   ?, 0,
                   NOW(), 'test', NOW(), 'test',
                   FALSE, NULL, NULL)
                """, orderId, "idem-conv-2026/05/30-CONV-8B");

        jdbcTemplate.update("""
                INSERT INTO partner_order_lines
                  (id, partner_order_id, product_id, model_name, product_name,
                   category_key, quantity, price_vat, subtotal, remark,
                   converted_quantity,
                   created_at, created_by, modified_at, modified_by,
                   is_deleted, deleted_at, deleted_by)
                VALUES
                  (?, ?, ?, 'MODEL-X', '상품X', 'homemulti', 5, 50000, 250000, NULL, 0,
                   NOW(), 'test', NOW(), 'test', FALSE, NULL, NULL)
                """, lineId, orderId, UUID.randomUUID());

        String body = """
                {
                  "items": [{"orderLineId": "%s", "quantity": 1}],
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

        verifyNoInteractions(slipServiceClient);
        verifyNoInteractions(inventoryClient);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 케이스 9 — CONFIRMED(slipNo=null, PENDING_RETRY) 주문 전환 → 409 (이중발행 차단)
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * CONFIRMED + slipNo=null + slipPublishStatus=PENDING_RETRY 주문 전환 시도 → 409 CONFLICT.
     * requireConvertible() 화이트리스트(DRAFT/ON_HOLD 만) 에 의해 CONFIRMED 상태 원천 차단.
     * outbox 재발행 대기 중인 주문의 이중발행 위험 방어.
     */
    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("케이스9: CONFIRMED+slipNo=null(PENDING_RETRY) 전환 시도 → 409 (이중발행 차단)")
    void case9_confirmedPendingRetryOrder_returns409() throws Exception {
        UUID orderId = UUID.randomUUID();
        UUID lineId = UUID.randomUUID();
        // CONFIRMED + slipNo=null + PENDING_RETRY — outbox 재발행 대기 상태
        jdbcTemplate.update("""
                INSERT INTO partner_orders
                  (id, partner_code, biz_code, order_no, slip_no, status,
                   slip_publish_status, total_amount, confirmed_at, slip_published_at,
                   due_date, memo, source_estimate_id, revision_count,
                   idempotency_key, lock_version,
                   created_at, created_by, modified_at, modified_by,
                   is_deleted, deleted_at, deleted_by)
                VALUES
                  (?, 'P-CONV-009', '9999999999', '2026/05/30-CONV-9', NULL, 'CONFIRMED',
                   'PENDING_RETRY', 0, NOW(), NULL,
                   NULL, NULL, NULL, 0,
                   ?, 0,
                   NOW(), 'test', NOW(), 'test',
                   FALSE, NULL, NULL)
                """, orderId, "idem-conv-2026/05/30-CONV-9");

        jdbcTemplate.update("""
                INSERT INTO partner_order_lines
                  (id, partner_order_id, product_id, model_name, product_name,
                   category_key, quantity, price_vat, subtotal, remark,
                   converted_quantity,
                   created_at, created_by, modified_at, modified_by,
                   is_deleted, deleted_at, deleted_by)
                VALUES
                  (?, ?, ?, 'MODEL-X', '상품X', 'homemulti', 5, 50000, 250000, NULL, 0,
                   NOW(), 'test', NOW(), 'test', FALSE, NULL, NULL)
                """, lineId, orderId, UUID.randomUUID());

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

        verifyNoInteractions(slipServiceClient, inventoryClient);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 케이스 10 — 부분 라인만 전환 후 주문 status DRAFT 유지 (2라인 중 1라인 전량)
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * 2라인 주문에서 1라인만 전량 전환 → 나머지 라인이 남아 있으므로 주문 status DRAFT 유지.
     * markConvertedIfComplete() 가 모든 활성 라인 완료 시에만 CONVERTED 로 변경함을 검증.
     */
    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("케이스10: 2라인 중 1라인 전량 전환 → 주문 status DRAFT 유지")
    void case10_partialLineFull_statusRemainingDraft() throws Exception {
        UUID orderId = UUID.randomUUID();
        UUID lineId1 = UUID.randomUUID();
        UUID lineId2 = UUID.randomUUID();

        jdbcTemplate.update("""
                INSERT INTO partner_orders
                  (id, partner_code, biz_code, order_no, slip_no, status,
                   slip_publish_status, total_amount, confirmed_at, slip_published_at,
                   due_date, memo, source_estimate_id, revision_count,
                   idempotency_key, lock_version,
                   created_at, created_by, modified_at, modified_by,
                   is_deleted, deleted_at, deleted_by)
                VALUES
                  (?, 'P-CONV-010', '1010101010', '2026/05/30-CONV-10', NULL, 'DRAFT',
                   'NOT_REQUIRED', 100000, NULL, NULL,
                   NULL, NULL, NULL, 0,
                   ?, 0,
                   NOW(), 'test', NOW(), 'test',
                   FALSE, NULL, NULL)
                """, orderId, "idem-conv-2026/05/30-CONV-10");

        jdbcTemplate.update("""
                INSERT INTO partner_order_lines
                  (id, partner_order_id, product_id, model_name, product_name,
                   category_key, quantity, price_vat, subtotal, remark,
                   converted_quantity,
                   created_at, created_by, modified_at, modified_by,
                   is_deleted, deleted_at, deleted_by)
                VALUES
                  (?, ?, ?, 'MODEL-A', '상품A', 'homemulti', 5, 10000, 50000, NULL, 0,
                   NOW(), 'test', NOW(), 'test', FALSE, NULL, NULL),
                  (?, ?, ?, 'MODEL-B', '상품B', 'homemulti', 3, 10000, 30000, NULL, 0,
                   NOW(), 'test', NOW(), 'test', FALSE, NULL, NULL)
                """,
                lineId1, orderId, UUID.randomUUID(),
                lineId2, orderId, UUID.randomUUID());

        // lineId1 만 전량(5) 전환
        String body = """
                {
                  "items": [{"orderLineId": "%s", "quantity": 5}],
                  "warehouseCode": "WH-001"
                }
                """.formatted(lineId1);

        mockMvc.perform(post("/api/v1/partner-orders/{id}/convert-to-slip", orderId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body)
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .header("X-User-Name", "영업담당자"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.orderStatus").value("DRAFT"))
                .andExpect(jsonPath("$.data.fullyConverted").value(false));

        // DB: 주문 status DRAFT 유지
        String dbStatus = jdbcTemplate.queryForObject(
                "SELECT status FROM partner_orders WHERE id = ?", String.class, orderId);
        assertThat(dbStatus).isEqualTo("DRAFT");

        // lineId1 converted_quantity=5, lineId2 converted_quantity=0
        Integer line1Converted = jdbcTemplate.queryForObject(
                "SELECT converted_quantity FROM partner_order_lines WHERE id = ?",
                Integer.class, lineId1);
        assertThat(line1Converted).isEqualTo(5);

        Integer line2Converted = jdbcTemplate.queryForObject(
                "SELECT converted_quantity FROM partner_order_lines WHERE id = ?",
                Integer.class, lineId2);
        assertThat(line2Converted).isEqualTo(0);
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

    private void insertOrderWithLine(UUID orderId, UUID lineId,
                                      String partnerCode, String bizCode,
                                      String orderNo, String status, String slipNo,
                                      int quantity, BigDecimal priceVat,
                                      String deliveryAddress) {
        jdbcTemplate.update("""
                INSERT INTO partner_orders
                  (id, partner_code, biz_code, order_no, slip_no, status,
                   slip_publish_status, total_amount, confirmed_at, slip_published_at,
                   delivery_address, due_date, memo, source_estimate_id, revision_count,
                   idempotency_key, lock_version,
                   created_at, created_by, modified_at, modified_by,
                   is_deleted, deleted_at, deleted_by)
                VALUES
                  (?, ?, ?, ?, ?, ?,
                   'NOT_REQUIRED', 0, NULL, NULL,
                   ?, NULL, NULL, NULL, 0,
                   ?, 0,
                   NOW(), 'test', NOW(), 'test',
                   FALSE, NULL, NULL)
                """,
                orderId, partnerCode, bizCode, orderNo, slipNo, status,
                deliveryAddress, "idem-conv-address-" + orderNo);

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
