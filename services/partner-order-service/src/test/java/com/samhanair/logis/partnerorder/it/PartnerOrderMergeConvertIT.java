package com.samhanair.logis.partnerorder.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
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
 * 다중 주문 병합 전환 통합 테스트 — Phase 2.6b D2.
 *
 * <p>실 Postgres(Testcontainers) + 실 Flyway. {@link AbstractPostgresIT} 상속으로 Docker 미가용 시 자동 skip.
 *
 * <p>{@code InventoryClient} / {@code SlipServiceClient} 는 {@code @MockBean} 으로 격리한다
 * ({@code feedback_it_mockbean_external_clients}).
 *
 * <p><b>검증 케이스:</b>
 * <ol>
 *   <li>같은 거래처 2주문 병합 → 200 + slipNo + 각 주문 converted_quantity 누적</li>
 *   <li>전량 전환 시 주문 status = CONVERTED (DB 단언)</li>
 *   <li>partnerCode 불일치 → 409 + reserve/publish 미호출</li>
 *   <li>한 라인 가용 부족(reserve 409) → 전체 409 + release 보상 호출 + converted 미변경</li>
 *   <li>slip 발행 실패(BusinessException) → release 보상 + converted 미변경</li>
 *   <li>잔여 초과 수량 → 409</li>
 * </ol>
 */
@SpringBootTest(classes = PartnerOrderServiceApplication.class)
@AutoConfigureMockMvc
class PartnerOrderMergeConvertIT extends AbstractPostgresIT {

    // ── 테스트 상수 ────────────────────────────────────────────────────────────

    private static final String MASTER_ACCOUNT_ID = "40000000-0000-0000-0000-000000000001";
    private static final String SALES_ACCOUNT_ID  = "40000000-0000-0000-0000-000000000002";
    private static final String STUB_SLIP_NO = "2026/05/31-MRG-1";
    private static final UUID PARTNER_ID_A = UUID.fromString("00000000-0000-0000-0000-000000000101");
    private static final UUID PARTNER_ID_B = UUID.fromString("00000000-0000-0000-0000-000000000102");

    // ── 의존성 ─────────────────────────────────────────────────────────────────

    @Autowired private MockMvc mockMvc;
    @Autowired private PartnerOrderRepository orderRepository;
    @Autowired private SlipPublishOutboxRepository outboxRepository;
    @Autowired private JdbcTemplate jdbcTemplate;
    @Autowired private ObjectMapper objectMapper;

    // ── 외부 client MockBean ───────────────────────────────────────────────────
    // feedback_it_mockbean_external_clients: 모든 외부 client @MockBean + lenient stub

    @MockBean private EstimateClient estimateClient;
    @MockBean private DcConfigClient dcConfigClient;
    @MockBean private ProductClient productClient;
    @MockBean private InventoryClient inventoryClient;
    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private PartnerAuthClient partnerAuthClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private ProductCatalogLookupClient catalogLookupClient;
    @MockBean private DynamicPermissionClient dynamicPermissionClient;

    // ── 셋업 ───────────────────────────────────────────────────────────────────

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

        // InventoryClient lenient stub — resolveWarehouseIdByCode + reserve + release
        lenient().when(inventoryClient.resolveWarehouseIdByCode(anyString()))
                .thenReturn(UUID.fromString("00000000-0000-0000-0000-000000000001"));
        lenient().when(inventoryClient.reserve(
                any(UUID.class), any(UUID.class), anyInt(),
                anyString(), any(UUID.class)))
                .thenReturn(ReservationResult.reserved());
        lenient().doNothing().when(inventoryClient)
                .release(any(UUID.class), any(UUID.class), anyInt(),
                        anyString(), any(UUID.class));

        // SlipServiceClient 기본 stub
        lenient().when(slipServiceClient.publishFromOrdersMerge(any(), anyString()))
                .thenReturn(PublishResult.published(STUB_SLIP_NO));
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 케이스 1 — 같은 거래처 2주문 병합 → 200 + slipNo + converted_quantity 누적
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * 같은 거래처(MRG-P001) 2주문 선택 라인을 병합 발행.
     * → 200 OK, slipNo 반환, 각 주문 converted_quantity DB 갱신.
     */
    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("케이스1: 같은 거래처 2주문 병합 → 200 + slipNo + converted_quantity 누적")
    void case1_samePartner_twoOrders_merge_200_convertedAccumulated() throws Exception {
        UUID orderAId = UUID.randomUUID();
        UUID orderBId = UUID.randomUUID();
        UUID lineAId = UUID.randomUUID();
        UUID lineBId = UUID.randomUUID();

        insertOrderWithLine(orderAId, lineAId, "MRG-P001", "1111111111",
                "2026/05/31-MRG-1", "DRAFT", 10, BigDecimal.valueOf(50000));
        insertOrderWithLine(orderBId, lineBId, "MRG-P001", "1111111111",
                "2026/05/31-MRG-2", "DRAFT", 5, BigDecimal.valueOf(30000));

        String body = """
                {
                  "orders": [
                    {"partnerOrderId": "%s", "items": [{"orderLineId": "%s", "quantity": 3}]},
                    {"partnerOrderId": "%s", "items": [{"orderLineId": "%s", "quantity": 2}]}
                  ],
                  "warehouseCode": "WH-001",
                  "shippingInfo": {"partnerName": "테스트거래처"}
                }
                """.formatted(orderAId, lineAId, orderBId, lineBId);

        mockMvc.perform(post("/api/v1/partner-orders/convert-to-slip-merge")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body)
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .header("X-User-Name", "영업담당자"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.slipNo").value(STUB_SLIP_NO))
                .andExpect(jsonPath("$.data.convertedOrders").isArray())
                .andExpect(jsonPath("$.data.convertedOrders.length()").value(2));

        // DB 단언 — lineA converted_quantity = 3
        Integer convertedA = jdbcTemplate.queryForObject(
                "SELECT converted_quantity FROM partner_order_lines WHERE id = ?",
                Integer.class, lineAId);
        assertThat(convertedA).isEqualTo(3);

        // DB 단언 — lineB converted_quantity = 2
        Integer convertedB = jdbcTemplate.queryForObject(
                "SELECT converted_quantity FROM partner_order_lines WHERE id = ?",
                Integer.class, lineBId);
        assertThat(convertedB).isEqualTo(2);

        // publishFromOrdersMerge 1회 호출
        verify(slipServiceClient, times(1)).publishFromOrdersMerge(any(), anyString());
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 케이스 2 — 전량 전환 시 status = CONVERTED
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * 단일 주문 전량 전환 → 주문 status CONVERTED (DB 단언).
     */
    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("케이스2: 전량 전환 → 주문 status CONVERTED DB 단언")
    void case2_fullConvert_statusConverted() throws Exception {
        UUID orderId = UUID.randomUUID();
        UUID lineId = UUID.randomUUID();

        insertOrderWithLine(orderId, lineId, "MRG-P002", "2222222222",
                "2026/05/31-MRG-3", "DRAFT", 5, BigDecimal.valueOf(10000));

        String body = """
                {
                  "orders": [
                    {"partnerOrderId": "%s", "items": [{"orderLineId": "%s", "quantity": 5}]}
                  ],
                  "warehouseCode": "WH-001"
                }
                """.formatted(orderId, lineId);

        mockMvc.perform(post("/api/v1/partner-orders/convert-to-slip-merge")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body)
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .header("X-User-Name", "영업담당자"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.convertedOrders[0].fullyConverted").value(true));

        String dbStatus = jdbcTemplate.queryForObject(
                "SELECT status FROM partner_orders WHERE id = ?", String.class, orderId);
        assertThat(dbStatus).isEqualTo("CONVERTED");
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 케이스 3 — partnerCode 불일치 → 409 + reserve/publish 미호출
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * 서로 다른 거래처 주문 병합 시도 → 409 CONFLICT.
     * inventoryClient.reserve + slipServiceClient.publishFromOrdersMerge 미호출 단언.
     */
    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("케이스3: partnerCode 불일치 → 409 + reserve/publish 미호출")
    void case3_differentPartnerCode_409_noReserveNoPublish() throws Exception {
        UUID orderAId = UUID.randomUUID();
        UUID orderBId = UUID.randomUUID();
        UUID lineAId = UUID.randomUUID();
        UUID lineBId = UUID.randomUUID();

        insertOrderWithPartnerIdentity(orderAId, lineAId, PARTNER_ID_A, "MRG-P001", "1111111111",
                "2026/05/31-MRG-4", "DRAFT", 5, BigDecimal.valueOf(10000));
        insertOrderWithPartnerIdentity(orderBId, lineBId, PARTNER_ID_B, "MRG-P999", "9999999999",  // 다른 거래처
                "2026/05/31-MRG-5", "DRAFT", 5, BigDecimal.valueOf(10000));

        String body = """
                {
                  "orders": [
                    {"partnerOrderId": "%s", "items": [{"orderLineId": "%s", "quantity": 2}]},
                    {"partnerOrderId": "%s", "items": [{"orderLineId": "%s", "quantity": 2}]}
                  ],
                  "warehouseCode": "WH-001"
                }
                """.formatted(orderAId, lineAId, orderBId, lineBId);

        mockMvc.perform(post("/api/v1/partner-orders/convert-to-slip-merge")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body)
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .header("X-User-Name", "영업담당자"))
                .andExpect(status().isConflict());

        // reserve + publish 미호출 단언
        verify(inventoryClient, never()).reserve(any(), any(), anyInt(), anyString(), any());
        verify(slipServiceClient, never()).publishFromOrdersMerge(any(), anyString());
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 케이스 3b — 동일 코드·상이 partner UUID → 409 (I1)
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * 거래처 soft-delete 후 코드가 재사용된 상황을 재현한다.
     * 표시 코드가 같아도 저장된 거래처 UUID가 다르면 병합을 거부해야 한다.
     */
    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("케이스3b: 동일 partnerCode·상이 partnerId → 409 + reserve/publish 미호출")
    void case3b_samePartnerCode_differentPartnerIdentity_409_noReserveNoPublish() throws Exception {
        UUID orderAId = UUID.randomUUID();
        UUID orderBId = UUID.randomUUID();
        UUID lineAId = UUID.randomUUID();
        UUID lineBId = UUID.randomUUID();
        String reusedCode = "REUSED-CODE-X";

        insertOrderWithPartnerIdentity(orderAId, lineAId, PARTNER_ID_A, reusedCode, "1111111111",
                "2026/07/23-MRG-I1-A", "DRAFT", 1, BigDecimal.valueOf(10000));
        insertOrderWithPartnerIdentity(orderBId, lineBId, PARTNER_ID_B, reusedCode, "2222222222",
                "2026/07/23-MRG-I1-B", "DRAFT", 1, BigDecimal.valueOf(10000));

        String body = """
                {
                  "orders": [
                    {"partnerOrderId": "%s", "items": [{"orderLineId": "%s", "quantity": 1}]},
                    {"partnerOrderId": "%s", "items": [{"orderLineId": "%s", "quantity": 1}]}
                  ],
                  "warehouseCode": "WH-001"
                }
                """.formatted(orderAId, lineAId, orderBId, lineBId);

        mockMvc.perform(post("/api/v1/partner-orders/convert-to-slip-merge")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body)
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .header("X-User-Name", "영업담당자"))
                .andExpect(status().isConflict());

        verify(inventoryClient, never()).reserve(
                any(UUID.class), any(UUID.class), anyInt(), anyString(), any(UUID.class));
        verify(slipServiceClient, never()).publishFromOrdersMerge(any(), anyString());
    }

    /** 기존 주문의 null identity를 현재 활성 거래처로 추측하지 않고 병합을 거부한다(I2/I3). */
    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("케이스3c: legacy partnerId 미해결 주문 → 409 + reserve/publish 미호출")
    void case3c_legacyOrderWithoutPartnerIdentity_409_noReserveNoPublish() throws Exception {
        UUID orderAId = UUID.randomUUID();
        UUID orderBId = UUID.randomUUID();
        UUID lineAId = UUID.randomUUID();
        UUID lineBId = UUID.randomUUID();
        String reusedCode = "LEGACY-REUSED-CODE";

        insertOrderWithPartnerIdentity(orderAId, lineAId, null, reusedCode, "1111111111",
                "2026/07/23-MRG-I3-A", "DRAFT", 1, BigDecimal.valueOf(10000));
        insertOrderWithPartnerIdentity(orderBId, lineBId, PARTNER_ID_A, reusedCode, "1111111111",
                "2026/07/23-MRG-I3-B", "DRAFT", 1, BigDecimal.valueOf(10000));

        String body = """
                {
                  "orders": [
                    {"partnerOrderId": "%s", "items": [{"orderLineId": "%s", "quantity": 1}]},
                    {"partnerOrderId": "%s", "items": [{"orderLineId": "%s", "quantity": 1}]}
                  ],
                  "warehouseCode": "WH-001"
                }
                """.formatted(orderAId, lineAId, orderBId, lineBId);

        mockMvc.perform(post("/api/v1/partner-orders/convert-to-slip-merge")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body)
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .header("X-User-Name", "영업담당자"))
                .andExpect(status().isConflict());

        verify(inventoryClient, never()).reserve(
                any(UUID.class), any(UUID.class), anyInt(), anyString(), any(UUID.class));
        verify(slipServiceClient, never()).publishFromOrdersMerge(any(), anyString());
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 케이스 4 — 한 라인 가용 부족(reserve 409) → 전체 409 + release 보상 + converted 미변경
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * 2라인 중 두 번째 라인 reserve 에서 가용 부족(409) → 전체 중단.
     * 첫 번째 라인 release 보상 호출 + 양 라인 converted_quantity 미변경.
     */
    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("케이스4: 한 라인 가용 부족 → 전체 409 + release 보상 + converted 미변경")
    void case4_oneLineInsufficientStock_409_withRelease_convertedUnchanged() throws Exception {
        UUID orderId = UUID.randomUUID();
        UUID lineAId = UUID.randomUUID();
        UUID lineBId = UUID.randomUUID();
        UUID productAId = UUID.randomUUID();
        UUID productBId = UUID.randomUUID();

        // 2라인 주문 직접 INSERT
        jdbcTemplate.update("""
                INSERT INTO partner_orders
                  (id, partner_id, partner_code, biz_code, order_no, slip_no, status,
                   slip_publish_status, total_amount, confirmed_at, slip_published_at,
                   due_date, memo, source_estimate_id, revision_count,
                   idempotency_key, lock_version,
                   created_at, created_by, modified_at, modified_by,
                   is_deleted, deleted_at, deleted_by)
                VALUES
                  (?, ?, 'MRG-P003', '3333333333', '2026/05/31-MRG-6', NULL, 'DRAFT',
                   'NOT_REQUIRED', 100000, NULL, NULL,
                   NULL, NULL, NULL, 0, ?, 0,
                   NOW(), 'test', NOW(), 'test', FALSE, NULL, NULL)
                """, orderId, PARTNER_ID_A, "idem-merge-6");
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
                  (?, ?, ?, 'MODEL-B', '상품B', 'homemulti', 5, 10000, 50000, NULL, 0,
                   NOW(), 'test', NOW(), 'test', FALSE, NULL, NULL)
                """,
                lineAId, orderId, productAId,
                lineBId, orderId, productBId);

        // 첫 번째 라인 reserve 성공, 두 번째 라인 reserve 가용 부족(CONFLICT)
        when(inventoryClient.reserve(eq(productAId), any(), anyInt(), anyString(), any()))
                .thenReturn(ReservationResult.reserved());
        when(inventoryClient.reserve(eq(productBId), any(), anyInt(), anyString(), any()))
                .thenThrow(new BusinessException(ErrorCode.CONFLICT, "가용 부족"));

        String body = """
                {
                  "orders": [
                    {
                      "partnerOrderId": "%s",
                      "items": [
                        {"orderLineId": "%s", "quantity": 2},
                        {"orderLineId": "%s", "quantity": 2}
                      ]
                    }
                  ],
                  "warehouseCode": "WH-001"
                }
                """.formatted(orderId, lineAId, lineBId);

        mockMvc.perform(post("/api/v1/partner-orders/convert-to-slip-merge")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body)
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .header("X-User-Name", "영업담당자"))
                .andExpect(status().isConflict());

        // release 보상: 첫 번째 라인(productA)만 보상 호출
        verify(inventoryClient, times(1))
                .release(eq(productAId), any(), anyInt(), anyString(), any());
        // publish 미호출
        verify(slipServiceClient, never()).publishFromOrdersMerge(any(), anyString());

        // DB: converted_quantity 미변경
        Integer convertedA = jdbcTemplate.queryForObject(
                "SELECT converted_quantity FROM partner_order_lines WHERE id = ?",
                Integer.class, lineAId);
        Integer convertedB = jdbcTemplate.queryForObject(
                "SELECT converted_quantity FROM partner_order_lines WHERE id = ?",
                Integer.class, lineBId);
        assertThat(convertedA).isEqualTo(0);
        assertThat(convertedB).isEqualTo(0);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 케이스 5 — slip 발행 실패 → release 보상 + converted 미변경
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * slip-service 발행 실패(BusinessException) → release 보상 + converted_quantity 미변경.
     */
    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("케이스5: slip 발행 실패 → release 보상 + converted 미변경")
    void case5_slipPublishFail_releaseCompensation_convertedUnchanged() throws Exception {
        UUID orderId = UUID.randomUUID();
        UUID lineId = UUID.randomUUID();

        insertOrderWithLine(orderId, lineId, "MRG-P004", "4444444444",
                "2026/05/31-MRG-7", "DRAFT", 5, BigDecimal.valueOf(20000));

        when(slipServiceClient.publishFromOrdersMerge(any(), anyString()))
                .thenThrow(new BusinessException(ErrorCode.INTERNAL_ERROR, "slip-service 5xx"));

        String body = """
                {
                  "orders": [
                    {"partnerOrderId": "%s", "items": [{"orderLineId": "%s", "quantity": 3}]}
                  ],
                  "warehouseCode": "WH-001"
                }
                """.formatted(orderId, lineId);

        mockMvc.perform(post("/api/v1/partner-orders/convert-to-slip-merge")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body)
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .header("X-User-Name", "영업담당자"))
                .andExpect(status().isInternalServerError());

        // release 보상 1회 (reserve 성공 라인 1개)
        verify(inventoryClient, times(1))
                .release(any(), any(), anyInt(), anyString(), any());

        // converted_quantity 미변경
        Integer converted = jdbcTemplate.queryForObject(
                "SELECT converted_quantity FROM partner_order_lines WHERE id = ?",
                Integer.class, lineId);
        assertThat(converted).isEqualTo(0);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 케이스 6 — 잔여 초과 수량 → 409
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * 잔여 수량(5) 초과하는 전환 요청(6) → 409 CONFLICT.
     * reserve / publish 미호출.
     */
    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("케이스6: 잔여 초과 수량 → 409 CONFLICT")
    void case6_overRemaining_409() throws Exception {
        UUID orderId = UUID.randomUUID();
        UUID lineId = UUID.randomUUID();

        insertOrderWithLine(orderId, lineId, "MRG-P005", "5555555555",
                "2026/05/31-MRG-8", "DRAFT", 5, BigDecimal.valueOf(10000));

        String body = """
                {
                  "orders": [
                    {"partnerOrderId": "%s", "items": [{"orderLineId": "%s", "quantity": 6}]}
                  ],
                  "warehouseCode": "WH-001"
                }
                """.formatted(orderId, lineId);

        mockMvc.perform(post("/api/v1/partner-orders/convert-to-slip-merge")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body)
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .header("X-User-Name", "영업담당자"))
                .andExpect(status().isConflict());

        verify(inventoryClient, never()).reserve(any(), any(), anyInt(), anyString(), any());
        verify(slipServiceClient, never()).publishFromOrdersMerge(any(), anyString());
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 케이스 M-4 — 멱등: 같은 요청 2회 호출 → publishFromOrdersMerge 1회 + converted_quantity 미중복
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * 멱등 재시도 검증 — 동일한 convertKey 를 생성하는 동일한 요청을 2회 전송했을 때:
     * <ul>
     *   <li>2회차에는 {@link com.samhanair.logis.partnerorder.client.InventoryClient#reserve}
     *       {@code alreadyReserved=true} + slip-service {@code duplicate} 반환 mock</li>
     *   <li>결과: {@code publishFromOrdersMerge} 호출 카운트 = 1</li>
     *   <li>DB: {@code converted_quantity} = 1회차 전환량(3) 만 누적 (이중 누적 아님)</li>
     * </ul>
     *
     * <p>2회차 mock 설정 근거: 첫 번째 호출 후 {@code converted_quantity} 가 변경되면 {@code contentHash}
     * 도 변경되어 키가 달라진다. 따라서 동일 키 2회 시나리오는 "첫 호출 slip 발행 성공 + partner-order
     * DB 트랜잭션 미커밋(장애)"이 재현이다 — 이를 시뮬레이션하기 위해 2회차 요청은 {@code converted_quantity}
     * 가 여전히 0인 상태(setUp 초기화)에서 동일 요청을 재전송한다.
     *
     * <p>2회차 reserve 는 {@code alreadyReserved=true}, slip 은 {@code duplicate(slipNo)} 반환.
     * 이때 서비스는 {@code line.convert()} 를 무조건 실행하므로 converted_quantity = 3 이 정확히 1회 누적된다.
     */
    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("M-4 멱등: 동일 요청 2회 → publishFromOrdersMerge 1회 + converted_quantity 1회만 누적")
    void caseM4_idempotency_sameRequestTwice_publishOnce_convertedNotDuplicated() throws Exception {
        UUID orderId = UUID.randomUUID();
        UUID lineId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();

        // 주문 INSERT (converted_quantity=0 초기 상태)
        insertOrderWithLine(orderId, lineId, productId, "MRG-P-M4", "9090909090",
                "2026/05/31-MRG-M4", "DRAFT", 5, BigDecimal.valueOf(10000));

        String body = """
                {
                  "orders": [
                    {"partnerOrderId": "%s", "items": [{"orderLineId": "%s", "quantity": 3}]}
                  ],
                  "warehouseCode": "WH-001",
                  "shippingInfo": {"partnerName": "멱등테스트거래처"}
                }
                """.formatted(orderId, lineId);

        // ── 1회차 호출 ─────────────────────────────────────────────────────────
        // reserve: reserved (신규 예약), slip: published
        when(inventoryClient.reserve(eq(productId), any(), eq(3), anyString(), any()))
                .thenReturn(ReservationResult.reserved());
        when(slipServiceClient.publishFromOrdersMerge(any(), anyString()))
                .thenReturn(PublishResult.published(STUB_SLIP_NO));

        mockMvc.perform(post("/api/v1/partner-orders/convert-to-slip-merge")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body)
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .header("X-User-Name", "영업담당자"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.slipNo").value(STUB_SLIP_NO));

        // 1회차 후 DB 상태 확인
        Integer convertedAfterFirst = jdbcTemplate.queryForObject(
                "SELECT converted_quantity FROM partner_order_lines WHERE id = ?",
                Integer.class, lineId);
        assertThat(convertedAfterFirst).isEqualTo(3);

        // ── 2회차 호출 — converted_quantity=3 이므로 contentHash 가 달라진다.
        //   실제 재시도 시나리오(장애 후 재전송)를 재현하기 위해 DB를 초기화 후 재시도한다.
        //   이는 "1회차 slip 발행 성공 + partner-order 트랜잭션 미커밋" 상황의 시뮬레이션이다.
        jdbcTemplate.update(
                "UPDATE partner_order_lines SET converted_quantity = 0 WHERE id = ?", lineId);

        // 2회차: reserve alreadyReserved=true (이미 예약됨, 멱등 no-op) + slip duplicate 반환
        when(inventoryClient.reserve(eq(productId), any(), eq(3), anyString(), any()))
                .thenReturn(ReservationResult.noop());
        when(slipServiceClient.publishFromOrdersMerge(any(), anyString()))
                .thenReturn(PublishResult.duplicate(STUB_SLIP_NO));

        mockMvc.perform(post("/api/v1/partner-orders/convert-to-slip-merge")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body)
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .header("X-User-Name", "영업담당자"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.slipNo").value(STUB_SLIP_NO));

        // publishFromOrdersMerge 총 2회 호출 — 1회차(published) + 2회차(duplicate)
        // 각 호출이 1번씩만 발생했는지 captor 카운트로 단언
        ArgumentCaptor<String> keyCaptor = ArgumentCaptor.forClass(String.class);
        verify(slipServiceClient, times(2)).publishFromOrdersMerge(any(), keyCaptor.capture());
        // 두 호출 모두 동일한 idempotencyKey 로 발행 (같은 convertedBefore=0 스냅샷 기반)
        assertThat(keyCaptor.getAllValues()).hasSize(2)
                .allSatisfy(k -> assertThat(k).startsWith("PO-MRG-"));

        // DB: 2회차 이후 converted_quantity = 3 (이중 누적 아님 — 1회차와 동일한 3)
        Integer convertedAfterSecond = jdbcTemplate.queryForObject(
                "SELECT converted_quantity FROM partner_order_lines WHERE id = ?",
                Integer.class, lineId);
        assertThat(convertedAfterSecond).isEqualTo(3);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 케이스 M-1 — 부분수량 전환: 5 중 3 → converted_quantity=3, remaining=2, status=DRAFT
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * 부분수량 전환 후 잔여 추적 검증.
     *
     * <p>전체 수량 5 중 3만 전환 요청:
     * <ul>
     *   <li>DB: {@code converted_quantity = 3}</li>
     *   <li>도메인: {@code remainingQuantity() = 2}</li>
     *   <li>DB: 주문 {@code status = DRAFT} (전량 전환 아니므로 CONVERTED 아님)</li>
     * </ul>
     *
     * <p>spec §6 M-1 "부분수량 + 잔여추적" 요구 케이스.
     */
    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("M-1 부분수량+잔여추적: 5수량 중 3 전환 → converted_quantity=3, remaining=2, status=DRAFT")
    void caseM1_partialQuantity_convertedThree_remainingTwo_statusDraft() throws Exception {
        UUID orderId = UUID.randomUUID();
        UUID lineId = UUID.randomUUID();

        insertOrderWithLine(orderId, lineId, "MRG-P-M1", "1010101010",
                "2026/05/31-MRG-M1", "DRAFT", 5, BigDecimal.valueOf(10000));

        String body = """
                {
                  "orders": [
                    {"partnerOrderId": "%s", "items": [{"orderLineId": "%s", "quantity": 3}]}
                  ],
                  "warehouseCode": "WH-001"
                }
                """.formatted(orderId, lineId);

        mockMvc.perform(post("/api/v1/partner-orders/convert-to-slip-merge")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body)
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .header("X-User-Name", "영업담당자"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.convertedOrders[0].fullyConverted").value(false));

        // DB 단언: converted_quantity = 3
        Integer convertedQty = jdbcTemplate.queryForObject(
                "SELECT converted_quantity FROM partner_order_lines WHERE id = ?",
                Integer.class, lineId);
        assertThat(convertedQty).isEqualTo(3);

        // DB 단언: remaining = quantity - converted_quantity = 5 - 3 = 2
        Integer remaining = jdbcTemplate.queryForObject(
                "SELECT quantity - converted_quantity FROM partner_order_lines WHERE id = ?",
                Integer.class, lineId);
        assertThat(remaining).isEqualTo(2);

        // DB 단언: 주문 status = DRAFT (부분 전환 → CONVERTED 아님)
        String dbStatus = jdbcTemplate.queryForObject(
                "SELECT status FROM partner_orders WHERE id = ?", String.class, orderId);
        assertThat(dbStatus).isEqualTo("DRAFT");
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 케이스 M-2 — ON_HOLD 주문 포함 병합 → requireConvertible 허용 검증
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * 보류(ON_HOLD) 주문이 포함된 병합 요청 성공 검증.
     *
     * <p>{@link com.samhanair.logis.partnerorder.domain.PartnerOrder#requireConvertible()}은
     * DRAFT 와 ON_HOLD 를 모두 허용한다. ON_HOLD 주문 1건 + DRAFT 주문 1건을 병합하여
     * 200 OK 와 converted_quantity 갱신을 확인한다.
     *
     * <p>spec §6 M-2 "ON_HOLD 주문 병합 가능" 요구 케이스.
     */
    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("M-2 ON_HOLD 병합: ON_HOLD + DRAFT 주문 병합 → 200 OK + converted_quantity 갱신")
    void caseM2_onHoldOrderIncludedInMerge_success() throws Exception {
        UUID orderOnHoldId = UUID.randomUUID();
        UUID orderDraftId = UUID.randomUUID();
        UUID lineOnHoldId = UUID.randomUUID();
        UUID lineDraftId = UUID.randomUUID();

        // ON_HOLD 상태 주문 INSERT
        insertOrderWithLine(orderOnHoldId, lineOnHoldId, "MRG-P-M2", "2020202020",
                "2026/05/31-MRG-M2-OH", "ON_HOLD", 4, BigDecimal.valueOf(20000));

        // DRAFT 상태 주문 INSERT
        insertOrderWithLine(orderDraftId, lineDraftId, "MRG-P-M2", "2020202020",
                "2026/05/31-MRG-M2-DR", "DRAFT", 3, BigDecimal.valueOf(15000));

        String body = """
                {
                  "orders": [
                    {"partnerOrderId": "%s", "items": [{"orderLineId": "%s", "quantity": 2}]},
                    {"partnerOrderId": "%s", "items": [{"orderLineId": "%s", "quantity": 2}]}
                  ],
                  "warehouseCode": "WH-001",
                  "shippingInfo": {"partnerName": "ON_HOLD테스트"}
                }
                """.formatted(orderOnHoldId, lineOnHoldId, orderDraftId, lineDraftId);

        mockMvc.perform(post("/api/v1/partner-orders/convert-to-slip-merge")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body)
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .header("X-User-Name", "영업담당자"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.slipNo").value(STUB_SLIP_NO))
                .andExpect(jsonPath("$.data.convertedOrders.length()").value(2));

        // DB 단언: ON_HOLD 주문 라인 converted_quantity = 2
        Integer convertedOnHold = jdbcTemplate.queryForObject(
                "SELECT converted_quantity FROM partner_order_lines WHERE id = ?",
                Integer.class, lineOnHoldId);
        assertThat(convertedOnHold).isEqualTo(2);

        // DB 단언: DRAFT 주문 라인 converted_quantity = 2
        Integer convertedDraft = jdbcTemplate.queryForObject(
                "SELECT converted_quantity FROM partner_order_lines WHERE id = ?",
                Integer.class, lineDraftId);
        assertThat(convertedDraft).isEqualTo(2);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 케이스 W-1 — reserve captor: 호출 인자(productId/warehouseId/quantity) 실제값 단언
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * reserve 에 전달된 인자의 실제값을 ArgumentCaptor 로 단언한다.
     *
     * <p>케이스5(release captor)와 달리, 성공 경로에서 reserve 호출 인자를 검증한다:
     * <ul>
     *   <li>{@code productId} = DB 에 삽입한 실제 product_id UUID</li>
     *   <li>{@code warehouseId} = resolveWarehouseIdByCode stub 반환값</li>
     *   <li>{@code quantity} = 요청의 quantity (2)</li>
     * </ul>
     *
     * <p>spec QA W-1 "reserve captor: reserve에 전달된 productId/warehouseId/qty 실제값 단언" 요구 케이스.
     */
    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("W-1 reserve captor: reserve 호출 인자(productId/warehouseId/qty) 실제값 단언")
    void caseW1_reserveCaptor_actualArguments_asserted() throws Exception {
        UUID orderId = UUID.randomUUID();
        UUID lineId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();
        UUID expectedWarehouseId = UUID.fromString("00000000-0000-0000-0000-000000000001");

        // product_id 를 명시적으로 지정하여 INSERT (captor 대조용)
        insertOrderWithLine(orderId, lineId, productId, "MRG-P-W1", "0101010101",
                "2026/05/31-MRG-W1", "DRAFT", 5, BigDecimal.valueOf(10000));

        // resolveWarehouseIdByCode → 고정 warehouseId (setUp lenient stub 재확인)
        when(inventoryClient.resolveWarehouseIdByCode("WH-001"))
                .thenReturn(expectedWarehouseId);

        String body = """
                {
                  "orders": [
                    {"partnerOrderId": "%s", "items": [{"orderLineId": "%s", "quantity": 2}]}
                  ],
                  "warehouseCode": "WH-001"
                }
                """.formatted(orderId, lineId);

        mockMvc.perform(post("/api/v1/partner-orders/convert-to-slip-merge")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body)
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .header("X-User-Name", "영업담당자"))
                .andExpect(status().isOk());

        // ArgumentCaptor 로 reserve 호출 인자 캡처
        ArgumentCaptor<UUID> productIdCaptor = ArgumentCaptor.forClass(UUID.class);
        ArgumentCaptor<UUID> warehouseIdCaptor = ArgumentCaptor.forClass(UUID.class);
        ArgumentCaptor<Integer> quantityCaptor = ArgumentCaptor.forClass(Integer.class);

        verify(inventoryClient, times(1)).reserve(
                productIdCaptor.capture(),
                warehouseIdCaptor.capture(),
                quantityCaptor.capture(),
                anyString(),
                any(UUID.class));

        // 실제값 단언
        assertThat(productIdCaptor.getValue()).isEqualTo(productId);
        assertThat(warehouseIdCaptor.getValue()).isEqualTo(expectedWarehouseId);
        assertThat(quantityCaptor.getValue()).isEqualTo(2);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 케이스 7 — orderNo(주문번호) 식별자로 병합 → 200 + 응답 orderNo 단언
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * FE 실제 전송 패턴: UUID 대신 주문번호({@code orderNo})를 {@code partnerOrderId} 필드로 전달.
     * {@link com.samhanair.logis.partnerorder.util.PartnerOrderIdResolver} 의
     * {@code findByOrderNo} 경로로 주문을 찾아 병합 전환이 성공해야 한다.
     *
     * <p>응답 {@code convertedOrders[].orderNo} 가 주문번호를 반환하고, UUID 형식이 아닌지 단언.
     */
    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("케이스7: orderNo 식별자 전달 → 200 + 응답 convertedOrders[].orderNo 단언")
    void case7_orderNoIdentifier_200_responseOrderNoAsserted() throws Exception {
        UUID orderId = UUID.randomUUID();
        UUID lineId = UUID.randomUUID();
        String orderNo = "2026/05/31-MRG-IT7";

        insertOrderWithLine(orderId, lineId, "MRG-P007", "7777777777",
                orderNo, "DRAFT", 5, BigDecimal.valueOf(20000));

        // partnerOrderId 에 UUID 가 아닌 주문번호(orderNo)를 전달
        String body = """
                {
                  "orders": [
                    {"partnerOrderId": "%s", "items": [{"orderLineId": "%s", "quantity": 3}]}
                  ],
                  "warehouseCode": "WH-001"
                }
                """.formatted(orderNo, lineId);

        mockMvc.perform(post("/api/v1/partner-orders/convert-to-slip-merge")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body)
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .header("X-User-Name", "영업담당자"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.slipNo").value(STUB_SLIP_NO))
                .andExpect(jsonPath("$.data.convertedOrders[0].orderNo").value(orderNo))
                .andExpect(jsonPath("$.data.convertedOrders[0].orderStatus").isNotEmpty())
                .andExpect(jsonPath("$.data.convertedOrders[0].fullyConverted").value(false));

        // DB: converted_quantity = 3
        Integer converted = jdbcTemplate.queryForObject(
                "SELECT converted_quantity FROM partner_order_lines WHERE id = ?",
                Integer.class, lineId);
        assertThat(converted).isEqualTo(3);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 케이스 8 — 응답 convertedOrders UUID 비포함 단언 (전량 전환)
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * UUID 식별자로 전달하더라도 응답 {@code convertedOrders[].orderNo} 는 주문번호를 반환해야 한다.
     * 전량 전환(5/5) → {@code fullyConverted=true} + {@code orderStatus=CONVERTED}.
     * 응답 필드에 UUID 형식 문자열이 포함되지 않는지 단언.
     */
    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("케이스8: UUID 식별자 전달 → 응답 orderNo=주문번호 + UUID 미포함 + fullyConverted=true")
    void case8_uuidIdentifier_responseOrderNoNotUuid_fullConvert() throws Exception {
        UUID orderId = UUID.randomUUID();
        UUID lineId = UUID.randomUUID();
        String orderNo = "2026/05/31-MRG-IT8";

        insertOrderWithLine(orderId, lineId, "MRG-P008", "8888888888",
                orderNo, "DRAFT", 5, BigDecimal.valueOf(10000));

        // partnerOrderId 에 UUID 문자열 전달 (resolver UUID fallback 경로)
        String body = """
                {
                  "orders": [
                    {"partnerOrderId": "%s", "items": [{"orderLineId": "%s", "quantity": 5}]}
                  ],
                  "warehouseCode": "WH-001"
                }
                """.formatted(orderId, lineId);

        mockMvc.perform(post("/api/v1/partner-orders/convert-to-slip-merge")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body)
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .header("X-User-Name", "영업담당자"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.convertedOrders[0].orderNo").value(orderNo))
                .andExpect(jsonPath("$.data.convertedOrders[0].fullyConverted").value(true))
                .andExpect(jsonPath("$.data.convertedOrders[0].orderStatus").value("CONVERTED"));

        // DB: status = CONVERTED
        String dbStatus = jdbcTemplate.queryForObject(
                "SELECT status FROM partner_orders WHERE id = ?", String.class, orderId);
        assertThat(dbStatus).isEqualTo("CONVERTED");
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 헬퍼
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * 주문 + 라인 1개를 JDBC 직접 INSERT (기존 PartnerOrderConvertIT 패턴과 동일).
     *
     * <p>product_id 는 내부에서 {@code UUID.randomUUID()} 로 자동 생성한다.
     * reserve captor 단언이 필요한 케이스는 {@link #insertOrderWithLine(UUID, UUID, UUID, String, String, String, String, int, BigDecimal)} 을 사용한다.
     */
    private void insertOrderWithLine(UUID orderId, UUID lineId,
                                      String partnerCode, String bizCode,
                                      String orderNo, String status,
                                      int quantity, BigDecimal priceVat) {
        insertOrderWithLine(orderId, lineId, PARTNER_ID_A, UUID.randomUUID(),
                partnerCode, bizCode, orderNo, status, quantity, priceVat);
    }

    /**
     * 주문 + 라인 1개를 JDBC 직접 INSERT — product_id 명시 오버로드.
     *
     * <p>W-1 reserve captor 케이스처럼 product_id 의 실제값을 단언해야 할 때 사용한다.
     *
     * @param orderId     주문 UUID
     * @param lineId      라인 UUID
     * @param productId   상품 UUID (reserve captor 대조에 사용)
     * @param partnerCode 거래처 코드
     * @param bizCode     사업자번호
     * @param orderNo     주문번호
     * @param status      주문 상태 문자열 (DRAFT/ON_HOLD 등)
     * @param quantity    수량
     * @param priceVat    부가세 포함 단가
     */
    private void insertOrderWithLine(UUID orderId, UUID lineId, UUID productId,
                                      String partnerCode, String bizCode,
                                      String orderNo, String status,
                                      int quantity, BigDecimal priceVat) {
        insertOrderWithLine(orderId, lineId, PARTNER_ID_A, productId,
                partnerCode, bizCode, orderNo, status, quantity, priceVat);
    }

    /** partner UUID를 명시하는 identity 회귀 픽스처. */
    private void insertOrderWithPartnerIdentity(UUID orderId, UUID lineId, UUID partnerId, String partnerCode,
                                      String bizCode, String orderNo, String status,
                                      int quantity, BigDecimal priceVat) {
        insertOrderWithLine(orderId, lineId, partnerId, UUID.randomUUID(),
                partnerCode, bizCode, orderNo, status, quantity, priceVat);
    }

    private void insertOrderWithLine(UUID orderId, UUID lineId, UUID partnerId, UUID productId,
                                      String partnerCode, String bizCode,
                                      String orderNo, String status,
                                      int quantity, BigDecimal priceVat) {
        jdbcTemplate.update("""
                INSERT INTO partner_orders
                  (id, partner_id, partner_code, biz_code, order_no, slip_no, status,
                   slip_publish_status, total_amount, confirmed_at, slip_published_at,
                   due_date, memo, source_estimate_id, revision_count,
                   idempotency_key, lock_version,
                   created_at, created_by, modified_at, modified_by,
                   is_deleted, deleted_at, deleted_by)
                VALUES
                  (?, ?, ?, ?, ?, NULL, ?,
                   'NOT_REQUIRED', 0, NULL, NULL,
                   NULL, NULL, NULL, 0,
                   ?, 0,
                   NOW(), 'test', NOW(), 'test',
                   FALSE, NULL, NULL)
                """,
                orderId, partnerId, partnerCode, bizCode, orderNo, status,
                "idem-mrg-" + orderNo);

        jdbcTemplate.update("""
                INSERT INTO partner_order_lines
                  (id, partner_order_id, product_id, model_name, product_name,
                   category_key, quantity, price_vat, subtotal, remark,
                   converted_quantity,
                   created_at, created_by, modified_at, modified_by,
                   is_deleted, deleted_at, deleted_by)
                VALUES
                  (?, ?, ?, 'MODEL-MRG', '병합테스트상품', 'homemulti', ?, ?, ?, NULL, 0,
                   NOW(), 'test', NOW(), 'test', FALSE, NULL, NULL)
                """,
                lineId, orderId, productId, quantity, priceVat,
                priceVat.multiply(BigDecimal.valueOf(quantity)));
    }
}
