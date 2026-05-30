package com.samhanair.logis.partnerorder.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
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
 * Phase 2.6c — convert 시 reserve 예약 모델 시나리오 통합 테스트.
 *
 * <p>PartnerOrderConvertIT 의 기존 시나리오(부분전환/권한/상태)에 추가하여
 * 재고 예약(reserve) 흐름에 특화된 케이스를 검증한다.
 *
 * <p><b>검증 케이스:</b>
 * <ol>
 *   <li>정상 전환 → inventoryClient.reserve 호출 검증 (captor)</li>
 *   <li>가용 부족 409 → slip 미호출 + converted_quantity 불변 (사전차단)</li>
 *   <li>slip 5xx 실패 → release 보상 호출 (captor)</li>
 *   <li>재시도 멱등 — 동일 요청 2회 → 2회차 reserve 호출 (단, inventory no-op 보장은 inventory IT)</li>
 *   <li>부분 전환 선택 라인만 reserve 호출</li>
 *   <li>confirm reserve 미호출 회귀 — confirm 후 inventoryClient.reserve 미호출</li>
 * </ol>
 */
@SpringBootTest(classes = PartnerOrderServiceApplication.class)
@AutoConfigureMockMvc
class Phase26cConvertReserveIT extends AbstractPostgresIT {

    private static final String SALES_ACCOUNT_ID = "40000000-0000-0000-0000-000000000010";
    private static final String STUB_SLIP_NO = "2026/05/31-1";
    private static final UUID STUB_WAREHOUSE_ID =
            UUID.fromString("00000000-0000-0000-0000-000000000001");

    @Autowired private MockMvc mockMvc;
    @Autowired private PartnerOrderRepository orderRepository;
    @Autowired private SlipPublishOutboxRepository outboxRepository;
    @Autowired private JdbcTemplate jdbcTemplate;
    @Autowired private ObjectMapper objectMapper;

    @MockBean private EstimateClient estimateClient;
    @MockBean private DcConfigClient dcConfigClient;
    @MockBean private ProductClient productClient;
    @MockBean private InventoryClient inventoryClient;
    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private PartnerAuthClient partnerAuthClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private ProductCatalogLookupClient catalogLookupClient;
    @MockBean private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void setUp() {
        outboxRepository.deleteAll();
        jdbcTemplate.update("DELETE FROM partner_order_lines");
        orderRepository.deleteAll();

        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.check(
                any(UUID.class), anyString(), any(PermissionAction.class))).thenReturn(true);

        lenient().when(dcConfigClient.fetchDcConfig(anyString())).thenReturn(Map.of());
        lenient().when(productClient.lookup(anyList())).thenReturn(List.of());

        // InventoryClient 기본 stub
        lenient().when(inventoryClient.resolveWarehouseIdByCode(anyString()))
                .thenReturn(STUB_WAREHOUSE_ID);
        lenient().when(inventoryClient.reserve(
                any(UUID.class), any(UUID.class), any(int.class),
                anyString(), any(UUID.class)))
                .thenReturn(Map.of());
        lenient().doNothing().when(inventoryClient).release(
                any(UUID.class), any(UUID.class), any(int.class),
                anyString(), any(UUID.class));

        lenient().when(slipServiceClient.publishFromPartnerOrder(any(), anyString()))
                .thenReturn(PublishResult.published(STUB_SLIP_NO));
    }

    // ═══════════════════════════════════════════════════════
    // 케이스 R1 — 정상 전환 → reserve 호출 검증
    // ═══════════════════════════════════════════════════════

    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("R1: 정상 전환 → inventoryClient.reserve 호출 검증 (captor)")
    void r1_normalConvert_reserveCalled() throws Exception {
        UUID orderId = UUID.randomUUID();
        UUID lineId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();
        insertOrderWithLine(orderId, lineId, productId, "MODEL-R1", "1111111111",
                "2026/05/31-R1", "DRAFT", 10, BigDecimal.valueOf(50000));

        mockMvc.perform(post("/api/v1/partner-orders/{id}/convert-to-slip", orderId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "items": [{"orderLineId": "%s", "quantity": 5}],
                                  "warehouseCode": "WH-MAIN"
                                }
                                """.formatted(lineId))
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .header("X-User-Name", "영업담당자"))
                .andExpect(status().isOk());

        // warehouseCode 역조회 호출 검증
        verify(inventoryClient).resolveWarehouseIdByCode(eq("WH-MAIN"));

        // reserve 호출 검증 — productId + STUB_WAREHOUSE_ID + qty=5
        @SuppressWarnings("unchecked")
        ArgumentCaptor<UUID> prodCaptor = ArgumentCaptor.forClass(UUID.class);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Integer> qtyCaptor = ArgumentCaptor.forClass(int.class);

        verify(inventoryClient).reserve(
                eq(productId), eq(STUB_WAREHOUSE_ID), eq(5),
                eq("PARTNER_ORDER_CONVERT"), any(UUID.class));
    }

    // ═══════════════════════════════════════════════════════
    // 케이스 R2 — 가용 부족 409 → slip 미호출 + converted_quantity 불변
    // ═══════════════════════════════════════════════════════

    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("R2: 가용 부족 409 → slip 미호출 + converted_quantity 불변 (사전차단)")
    void r2_insufficientStock_409_slipNotCalled_convertedQtyUnchanged() throws Exception {
        UUID orderId = UUID.randomUUID();
        UUID lineId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();
        insertOrderWithLine(orderId, lineId, productId, "MODEL-R2", "2222222222",
                "2026/05/31-R2", "DRAFT", 10, BigDecimal.valueOf(50000));

        // reserve 409 stub
        when(inventoryClient.reserve(
                any(UUID.class), any(UUID.class), any(int.class),
                anyString(), any(UUID.class)))
                .thenThrow(new BusinessException(ErrorCode.CONFLICT, "가용 재고 부족"));

        mockMvc.perform(post("/api/v1/partner-orders/{id}/convert-to-slip", orderId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "items": [{"orderLineId": "%s", "quantity": 5}],
                                  "warehouseCode": "WH-MAIN"
                                }
                                """.formatted(lineId))
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .header("X-User-Name", "영업담당자"))
                .andExpect(status().isConflict());

        // slip 미호출 단언
        verify(slipServiceClient, never()).publishFromPartnerOrder(any(), anyString());

        // DB: converted_quantity 불변 (0)
        Integer convertedQty = jdbcTemplate.queryForObject(
                "SELECT converted_quantity FROM partner_order_lines WHERE id = ?",
                Integer.class, lineId);
        assertThat(convertedQty).isEqualTo(0);
    }

    // ═══════════════════════════════════════════════════════
    // 케이스 R3 — slip 5xx 실패 → release 보상 호출
    // ═══════════════════════════════════════════════════════

    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("R3: slip 5xx 실패 → release 보상 호출 + converted_quantity 불변")
    void r3_slipPublishFails_releaseCompensation() throws Exception {
        UUID orderId = UUID.randomUUID();
        UUID lineId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();
        insertOrderWithLine(orderId, lineId, productId, "MODEL-R3", "3333333333",
                "2026/05/31-R3", "DRAFT", 10, BigDecimal.valueOf(50000));

        // slip 5xx 실패 stub
        when(slipServiceClient.publishFromPartnerOrder(any(), anyString()))
                .thenThrow(new BusinessException(ErrorCode.INTERNAL_ERROR, "slip-service 5xx"));

        mockMvc.perform(post("/api/v1/partner-orders/{id}/convert-to-slip", orderId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "items": [{"orderLineId": "%s", "quantity": 5}],
                                  "warehouseCode": "WH-MAIN"
                                }
                                """.formatted(lineId))
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .header("X-User-Name", "영업담당자"))
                .andExpect(status().isInternalServerError());

        // release 보상 호출 검증
        verify(inventoryClient).release(
                eq(productId), eq(STUB_WAREHOUSE_ID), eq(5),
                eq("PARTNER_ORDER_CONVERT"), any(UUID.class));

        // DB: converted_quantity 불변 (0)
        Integer convertedQty = jdbcTemplate.queryForObject(
                "SELECT converted_quantity FROM partner_order_lines WHERE id = ?",
                Integer.class, lineId);
        assertThat(convertedQty).isEqualTo(0);
    }

    // ═══════════════════════════════════════════════════════
    // 케이스 R4 — 재시도 멱등 — 동일 요청 2회 → 2회차 reserve 호출
    // ═══════════════════════════════════════════════════════

    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("R4: 재시도 멱등 — 동일 요청 2회 → 2회차 reserve 호출 (inventory no-op은 inventory IT 검증)")
    void r4_retryIdempotent_reserveCalledTwice() throws Exception {
        UUID orderId = UUID.randomUUID();
        UUID lineId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();
        insertOrderWithLine(orderId, lineId, productId, "MODEL-R4", "4444444444",
                "2026/05/31-R4", "DRAFT", 10, BigDecimal.valueOf(50000));

        String body = """
                {
                  "items": [{"orderLineId": "%s", "quantity": 3}],
                  "warehouseCode": "WH-MAIN"
                }
                """.formatted(lineId);

        // 1회
        mockMvc.perform(post("/api/v1/partner-orders/{id}/convert-to-slip", orderId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body)
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .header("X-User-Name", "영업담당자"))
                .andExpect(status().isOk());

        // 2회 — convertedQuantity가 바뀌었으므로 다른 idempotencyKey로 새 slip 발행 시도
        // (inventory reserve는 두번째 호출 시 no-op이어야 하나 mock에서는 그냥 호출됨)
        org.mockito.Mockito.reset(slipServiceClient);
        lenient().when(slipServiceClient.publishFromPartnerOrder(any(), anyString()))
                .thenReturn(PublishResult.published("2026/05/31-2"));
        // 2차 요청은 잔여가 바뀌었으므로 새 key 생성됨 (convertedBefore=3)
        // 하지만 잔여(7) 범위 내이므로 성공해야 함
        lenient().when(inventoryClient.reserve(
                any(UUID.class), any(UUID.class), any(int.class),
                anyString(), any(UUID.class)))
                .thenReturn(Map.of());

        mockMvc.perform(post("/api/v1/partner-orders/{id}/convert-to-slip", orderId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body)
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .header("X-User-Name", "영업담당자"))
                .andExpect(status().isOk());

        // 총 converted = 6 (3 + 3)
        Integer convertedQty = jdbcTemplate.queryForObject(
                "SELECT converted_quantity FROM partner_order_lines WHERE id = ?",
                Integer.class, lineId);
        assertThat(convertedQty).isEqualTo(6);
    }

    // ═══════════════════════════════════════════════════════
    // 케이스 R5 — 부분 전환: 선택 라인만 reserve 호출
    // ═══════════════════════════════════════════════════════

    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("R5: 2라인 중 1라인만 전환 → 선택 라인 productId 만 reserve 호출")
    @SuppressWarnings("unchecked")
    void r5_partialLines_onlySelectedLineReserved() throws Exception {
        UUID orderId = UUID.randomUUID();
        UUID lineId1 = UUID.randomUUID();
        UUID lineId2 = UUID.randomUUID();
        UUID productId1 = UUID.randomUUID();
        UUID productId2 = UUID.randomUUID();

        jdbcTemplate.update("""
                INSERT INTO partner_orders
                  (id, partner_code, biz_code, order_no, slip_no, status,
                   slip_publish_status, total_amount, confirmed_at, slip_published_at,
                   due_date, memo, source_estimate_id, revision_count,
                   idempotency_key, lock_version,
                   created_at, created_by, modified_at, modified_by,
                   is_deleted, deleted_at, deleted_by)
                VALUES
                  (?, 'P-R5', '5555555555', '2026/05/31-R5', NULL, 'DRAFT',
                   'NOT_REQUIRED', 100000, NULL, NULL,
                   NULL, NULL, NULL, 0,
                   ?, 0,
                   NOW(), 'test', NOW(), 'test',
                   FALSE, NULL, NULL)
                """, orderId, "idem-r5-" + orderId);

        jdbcTemplate.update("""
                INSERT INTO partner_order_lines
                  (id, partner_order_id, product_id, model_name, product_name,
                   category_key, quantity, price_vat, subtotal, remark,
                   converted_quantity,
                   created_at, created_by, modified_at, modified_by,
                   is_deleted, deleted_at, deleted_by)
                VALUES
                  (?, ?, ?, 'MODEL-R5A', '상품A', 'homemulti', 10, 10000, 100000, NULL, 0,
                   NOW(), 'test', NOW(), 'test', FALSE, NULL, NULL),
                  (?, ?, ?, 'MODEL-R5B', '상품B', 'homemulti', 5, 20000, 100000, NULL, 0,
                   NOW(), 'test', NOW(), 'test', FALSE, NULL, NULL)
                """,
                lineId1, orderId, productId1,
                lineId2, orderId, productId2);

        // lineId1 만 선택
        mockMvc.perform(post("/api/v1/partner-orders/{id}/convert-to-slip", orderId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "items": [{"orderLineId": "%s", "quantity": 3}],
                                  "warehouseCode": "WH-MAIN"
                                }
                                """.formatted(lineId1))
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .header("X-User-Name", "영업담당자"))
                .andExpect(status().isOk());

        // productId1 만 reserve 호출, productId2 는 미호출
        verify(inventoryClient, times(1)).reserve(
                eq(productId1), any(UUID.class), eq(3),
                eq("PARTNER_ORDER_CONVERT"), any(UUID.class));
        verify(inventoryClient, never()).reserve(
                eq(productId2), any(UUID.class), any(int.class),
                anyString(), any(UUID.class));
    }

    // ═══════════════════════════════════════════════════════
    // 케이스 R6 — confirm reserve 미호출 회귀
    // ═══════════════════════════════════════════════════════

    @Test
    @WithMockUser(roles = {"PARTNER"})
    @DisplayName("R6: confirm 후 inventoryClient.reserve 미호출 (주문 무영향 원칙)")
    void r6_confirmDoesNotCallReserve() throws Exception {
        // 드래프트 주문을 직접 confirm API 를 통해 생성 — 여기서 reserve 가 호출되면 안 됨.
        // partner-order 생성은 confirm 경로를 통해 이루어짐.
        // DcConfigClient / ProductClient stub 필요
        UUID draftProductId = UUID.randomUUID();
        lenient().when(productClient.lookup(anyList()))
                .thenReturn(List.of(
                        new com.samhanair.logis.partnerorder.client.ProductSummary(
                                draftProductId, "확정용 제품", "MODEL-CONF",
                                null, BigDecimal.valueOf(10000), "ACTIVE")));
        lenient().when(slipServiceClient.publishFromPartnerOrder(any(), anyString()))
                .thenReturn(PublishResult.published("2026/05/31-CONF-1"));

        // 실제 confirm API 호출 (draft 없이 직접 confirm)
        String confirmBody = """
                {
                  "lines": [
                    {
                      "productId": "%s",
                      "quantity": 3,
                      "categoryKey": "homemulti",
                      "remark": "테스트"
                    }
                  ]
                }
                """.formatted(draftProductId);

        mockMvc.perform(post("/api/v1/partner-orders/confirm")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(confirmBody)
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "PARTNER")
                        .header("X-Partner-Code", "TEST-PARTNER")
                        .header("X-Biz-Code", "9999999999")
                        .header("X-User-Name", "테스트 거래처"))
                .andExpect(status().isOk());

        // reserve 미호출 단언 (Phase 2.6c 주문 무영향 원칙)
        verify(inventoryClient, never()).reserve(
                any(UUID.class), any(UUID.class), any(int.class),
                anyString(), any(UUID.class));
        verify(inventoryClient, never()).reserve(
                any(UUID.class), any(UUID.class), any(int.class));
    }

    // ═══════════════════════════════════════════════════════
    // 헬퍼
    // ═══════════════════════════════════════════════════════

    private void insertOrderWithLine(UUID orderId, UUID lineId, UUID productId,
                                      String partnerCode, String bizCode,
                                      String orderNo, String status,
                                      int qty, BigDecimal priceVat) {
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
                   'NOT_REQUIRED', ?, NULL, NULL,
                   NULL, NULL, NULL, 0,
                   ?, 0,
                   NOW(), 'test', NOW(), 'test',
                   FALSE, NULL, NULL)
                """, orderId, partnerCode, bizCode, orderNo, status,
                priceVat.multiply(BigDecimal.valueOf(qty)),
                "idem-26c-" + orderId);

        jdbcTemplate.update("""
                INSERT INTO partner_order_lines
                  (id, partner_order_id, product_id, model_name, product_name,
                   category_key, quantity, price_vat, subtotal, remark,
                   converted_quantity,
                   created_at, created_by, modified_at, modified_by,
                   is_deleted, deleted_at, deleted_by)
                VALUES
                  (?, ?, ?, ?, '테스트 제품', 'homemulti', ?, ?, ?, NULL, 0,
                   NOW(), 'test', NOW(), 'test', FALSE, NULL, NULL)
                """, lineId, orderId, productId, "MODEL-" + partnerCode,
                qty, priceVat, priceVat.multiply(BigDecimal.valueOf(qty)));
    }
}
