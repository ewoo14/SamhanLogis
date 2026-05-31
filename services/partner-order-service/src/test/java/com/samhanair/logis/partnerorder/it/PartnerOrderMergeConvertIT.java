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

        insertOrderWithLine(orderAId, lineAId, "MRG-P001", "1111111111",
                "2026/05/31-MRG-4", "DRAFT", 5, BigDecimal.valueOf(10000));
        insertOrderWithLine(orderBId, lineBId, "MRG-P999", "9999999999",  // 다른 거래처
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
                  (id, partner_code, biz_code, order_no, slip_no, status,
                   slip_publish_status, total_amount, confirmed_at, slip_published_at,
                   due_date, memo, source_estimate_id, revision_count,
                   idempotency_key, lock_version,
                   created_at, created_by, modified_at, modified_by,
                   is_deleted, deleted_at, deleted_by)
                VALUES
                  (?, 'MRG-P003', '3333333333', '2026/05/31-MRG-6', NULL, 'DRAFT',
                   'NOT_REQUIRED', 100000, NULL, NULL,
                   NULL, NULL, NULL, 0, ?, 0,
                   NOW(), 'test', NOW(), 'test', FALSE, NULL, NULL)
                """, orderId, "idem-merge-6");
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
     */
    private void insertOrderWithLine(UUID orderId, UUID lineId,
                                      String partnerCode, String bizCode,
                                      String orderNo, String status,
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
                  (?, ?, ?, ?, NULL, ?,
                   'NOT_REQUIRED', 0, NULL, NULL,
                   NULL, NULL, NULL, 0,
                   ?, 0,
                   NOW(), 'test', NOW(), 'test',
                   FALSE, NULL, NULL)
                """,
                orderId, partnerCode, bizCode, orderNo, status,
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
                lineId, orderId, UUID.randomUUID(), quantity, priceVat,
                priceVat.multiply(BigDecimal.valueOf(quantity)));
    }
}
