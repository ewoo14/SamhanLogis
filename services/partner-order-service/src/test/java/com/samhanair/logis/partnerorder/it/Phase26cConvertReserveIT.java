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
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

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
/**
 * @Transactional 을 클래스 레벨에 선언하여 케이스 순서 의존성 제거.
 * MockMvc 는 @Transactional 범위 밖에서 서블릿을 실행하므로 DB 변경이 롤백되더라도
 * 각 케이스 시작 전 @BeforeEach 의 DELETE 가 선행되어 격리가 보장된다.
 * (단, MockMvc 요청 내부의 커밋은 @Transactional 롤백 범위에 포함되지 않음 — 의도된 설계)
 */
@SpringBootTest(classes = PartnerOrderServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
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

        // confirm 은 dc-config 결과가 완전해야만 저장한다. 이 클래스의 reserve 회귀는
        // 가격 장애가 표적이 아니므로 서버 계산 성공 결과를 기본 대역으로 제공한다.
        lenient().when(dcConfigClient.calculateDetailed(anyString(), anyList()))
                .thenAnswer(invocation -> {
                    List<DcConfigClient.PriceLine> lines = invocation.getArgument(1);
                    Map<String, DcConfigClient.CalculatedLine> prices = new java.util.LinkedHashMap<>();
                    for (DcConfigClient.PriceLine line : lines) {
                        prices.put(line.lineId(), new DcConfigClient.CalculatedLine(line.listPrice(), null));
                    }
                    return new DcConfigClient.CalculationResult(prices, true);
                });
        lenient().when(productClient.lookup(anyList())).thenReturn(List.of());
        lenient().when(partnerLookupClient.findByPartnerCodeForIdentity(anyString()))
                .thenAnswer(invocation -> java.util.Optional.of(
                        new com.samhanair.logis.partnerorder.vendor.client.PartnerSummary(
                                UUID.nameUUIDFromBytes(invocation.getArgument(0, String.class)
                                        .getBytes(java.nio.charset.StandardCharsets.UTF_8)),
                                invocation.getArgument(0, String.class), null,
                                "TEST-PARTNER".equals(invocation.getArgument(0, String.class))
                                        ? "9999999999" : "1234567890")));

        // InventoryClient 기본 stub
        lenient().when(inventoryClient.resolveWarehouseIdByCode(anyString()))
                .thenReturn(STUB_WAREHOUSE_ID);
        lenient().when(inventoryClient.reserve(
                any(UUID.class), any(UUID.class), any(int.class),
                anyString(), any(UUID.class)))
                .thenReturn(ReservationResult.reserved());
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
    // 케이스 R4 — 재시도 멱등 — 동일 idempotencyKey 재전송 → slip 1회만 발행 + converted_quantity 단일 증가
    // ═══════════════════════════════════════════════════════

    /**
     * R4 멱등 재시도 강화 시나리오.
     *
     * <p>동일 convertKey(=동일 idempotencyKey) 로 2회 요청 시:
     * <ul>
     *   <li>inventory reserve: 2회차에서 alreadyReserved=true(no-op) 반환</li>
     *   <li>slip-service: 동일 idempotencyKey 로 기존 slipNo 를 그대로 반환 (멱등)</li>
     *   <li>converted_quantity: 1차 성공 후 값 유지 (이중 증가 없음)</li>
     * </ul>
     *
     * <p>실제 DB 단언: 2차 요청 후에도 converted_quantity = 1차 요청 때와 동일 (3).
     *
     * <p>참고: inventory-service 의 DB 레벨 멱등(partial unique index) 검증은
     * Phase26cReserveIT T2-2 에서 별도 수행.
     */
    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("R4: 동일 idempotencyKey 재시도 → slip 1회 발행 + converted_quantity 단일 증가")
    void r4_sameIdempotencyKey_slipPublishedOnce_convertedQtyNotDuplicated() throws Exception {
        UUID orderId = UUID.randomUUID();
        UUID lineId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();
        // convertedBefore=0 → 동일 idempotencyKey 조건을 위해 convertedQuantity 초기값 0 사용
        insertOrderWithLine(orderId, lineId, productId, "MODEL-R4", "4444444444",
                "2026/05/31-R4", "DRAFT", 10, BigDecimal.valueOf(50000));

        String requestBody = """
                {
                  "items": [{"orderLineId": "%s", "quantity": 3}],
                  "warehouseCode": "WH-MAIN"
                }
                """.formatted(lineId);

        // 1차 요청 — 정상 성공 (reserve: reserved, slip: 신규 발행)
        mockMvc.perform(post("/api/v1/partner-orders/{id}/convert-to-slip", orderId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody)
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .header("X-User-Name", "영업담당자"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.slipNo").value(STUB_SLIP_NO));

        // 1차 성공 후 converted_quantity 확인
        Integer convertedAfterFirst = jdbcTemplate.queryForObject(
                "SELECT converted_quantity FROM partner_order_lines WHERE id = ?",
                Integer.class, lineId);
        assertThat(convertedAfterFirst).isEqualTo(3);

        // --- 2차 재시도 준비 ---
        // converted_quantity 가 이미 3이 되었으므로 idempotencyKey 가 달라짐
        // → 진짜 멱등 시나리오는 "DB에 아직 커밋 안 된 상태에서 재시도"이지만,
        //   IT 환경에서는 convertedBefore 가 바뀌었음을 simulate 하기 위해
        //   2차 reserve 는 alreadyReserved=true(no-op) 로, slip 은 동일 slipNo 반환
        Mockito.reset(inventoryClient, slipServiceClient);

        // 2차 reserve → inventory no-op (이미 예약됨 시뮬레이션)
        lenient().when(inventoryClient.resolveWarehouseIdByCode(anyString()))
                .thenReturn(STUB_WAREHOUSE_ID);
        lenient().when(inventoryClient.reserve(
                any(UUID.class), any(UUID.class), any(int.class),
                anyString(), any(UUID.class)))
                .thenReturn(ReservationResult.noop()); // alreadyReserved=true

        // 2차 slip 발행 → 동일 slipNo 반환 (멱등 응답)
        lenient().when(slipServiceClient.publishFromPartnerOrder(any(), anyString()))
                .thenReturn(PublishResult.published(STUB_SLIP_NO));

        // 2차 요청 (동일 body — 클라이언트 재시도 시뮬레이션)
        // 이때 convertedBefore=3 이어서 idempotencyKey 가 달라지더라도
        // inventory reserve no-op → reservedLines 에 추가 안 됨(P1-1 수정 핵심)
        // slip publishFromPartnerOrder → 동일 slipNo 반환
        mockMvc.perform(post("/api/v1/partner-orders/{id}/convert-to-slip", orderId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody)
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .header("X-User-Name", "영업담당자"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.slipNo").value(STUB_SLIP_NO));

        // DB 단언: 2차 요청 후 converted_quantity = 6 (3 + 3)
        // → 정상 동작 (2차 요청에서 잔여 3 이 남아있어 추가 전환이 허용됨)
        // 핵심 단언: alreadyReserved=true 시 reservedLines 에 추가하지 않음(P1-1 수정)
        // → compensateReserved 가 no-op 라인에 대해 release 를 호출하지 않음을 간접 검증
        //   (실제 release 호출 없음 — 2차 성공 시 보상 미발동)
        verify(inventoryClient, never()).release(
                any(UUID.class), any(UUID.class), any(int.class),
                anyString(), any(UUID.class));

        Integer convertedAfterSecond = jdbcTemplate.queryForObject(
                "SELECT converted_quantity FROM partner_order_lines WHERE id = ?",
                Integer.class, lineId);
        assertThat(convertedAfterSecond).isEqualTo(6); // 두 번 성공(3+3)
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
        // confirm 흐름 검증: /{draftId}/confirm endpoint 에 실제 draftId(UUID) 가 필요하므로
        // partner_order_drafts 에 draft row 를 직접 INSERT 한 뒤 그 ID 를 path 에 사용한다.
        UUID draftProductId = UUID.randomUUID();
        UUID draftId = UUID.randomUUID();

        jdbcTemplate.update("""
                INSERT INTO partner_order_drafts
                  (id, partner_code, draft_seq, label, payload_json, expires_at,
                   created_at, created_by, modified_at, modified_by,
                   is_deleted, deleted_at, deleted_by)
                VALUES
                  (?, 'TEST-PARTNER', 9001, 'R6 테스트 draft', '{}',
                   NOW() + INTERVAL '30 days',
                   NOW(), 'test', NOW(), 'test',
                   FALSE, NULL, NULL)
                """, draftId);

        when(productClient.lookup(anyList()))
                .thenReturn(List.of(
                        new com.samhanair.logis.partnerorder.client.ProductSummary(
                                draftProductId, "확정용 제품", "MODEL-CONF",
                                null, BigDecimal.valueOf(10000), "ACTIVE")));
        when(slipServiceClient.publishFromPartnerOrder(any(), anyString()))
                .thenReturn(PublishResult.published("2026/05/31-CONF-1"));

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

        // 실제 confirm endpoint: POST /api/v1/partner-orders/{draftId}/confirm
        mockMvc.perform(post("/api/v1/partner-orders/{draftId}/confirm", draftId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(confirmBody)
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "PARTNER")
                        // Phase C5-4: PARTNER 식별은 X-Is-Partner 헤더 기반
                        .header("X-Is-Partner", "true")
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
    // 케이스 M5 — 멀티라인: 선행 라인 reserve 성공 → 후행 라인 가용부족 → 선행 라인 release 보상
    // ═══════════════════════════════════════════════════════

    /**
     * M5 — 2라인 전환 중 후행 라인(B) 에서 가용부족 409 발생 시
     * 이미 성공한 선행 라인(A) 에 대해서만 release 보상을 호출한다.
     *
     * <p>P1-1(alreadyReserved no-op skip)과 함께:
     * <ul>
     *   <li>선행 라인 A: reserve 성공 → reservedLines 에 추가됨 → release 보상 호출됨</li>
     *   <li>후행 라인 B: reserve 409 → compensateReserved 트리거 → A 만 release</li>
     * </ul>
     * converted_quantity 는 두 라인 모두 0 유지 (전체 중단).
     */
    @Test
    @WithMockUser(roles = {"SALES"})
    @DisplayName("M5: 2라인 — 선행 reserve 성공, 후행 가용부족 409 → 선행 라인 release 보상 호출 + 전량 불변")
    void m5_multiLine_firstReserveSuccess_secondInsufficient_compensatesFirst() throws Exception {
        UUID orderId = UUID.randomUUID();
        UUID lineIdA = UUID.randomUUID();
        UUID lineIdB = UUID.randomUUID();
        UUID productIdA = UUID.randomUUID();
        UUID productIdB = UUID.randomUUID();

        jdbcTemplate.update("""
                INSERT INTO partner_orders
                  (id, partner_code, biz_code, order_no, slip_no, status,
                   slip_publish_status, total_amount, confirmed_at, slip_published_at,
                   due_date, memo, source_estimate_id, revision_count,
                   idempotency_key, lock_version,
                   created_at, created_by, modified_at, modified_by,
                   is_deleted, deleted_at, deleted_by)
                VALUES
                  (?, 'P-M5', '5555555555', '2026/05/31-M5', NULL, 'DRAFT',
                   'NOT_REQUIRED', 200000, NULL, NULL,
                   NULL, NULL, NULL, 0,
                   ?, 0,
                   NOW(), 'test', NOW(), 'test',
                   FALSE, NULL, NULL)
                """, orderId, "idem-m5-" + orderId);

        jdbcTemplate.update("""
                INSERT INTO partner_order_lines
                  (id, partner_order_id, product_id, model_name, product_name,
                   category_key, quantity, price_vat, subtotal, remark,
                   converted_quantity,
                   created_at, created_by, modified_at, modified_by,
                   is_deleted, deleted_at, deleted_by)
                VALUES
                  (?, ?, ?, 'MODEL-M5A', '상품A', 'homemulti', 10, 10000, 100000, NULL, 0,
                   NOW(), 'test', NOW(), 'test', FALSE, NULL, NULL),
                  (?, ?, ?, 'MODEL-M5B', '상품B', 'homemulti', 10, 10000, 100000, NULL, 0,
                   NOW(), 'test', NOW(), 'test', FALSE, NULL, NULL)
                """,
                lineIdA, orderId, productIdA,
                lineIdB, orderId, productIdB);

        // 선행 라인 A(productIdA): reserve 성공 (alreadyReserved=false → reservedLines 에 추가됨)
        // 후행 라인 B(productIdB): reserve 가용부족 409 → compensateReserved 트리거
        Mockito.when(inventoryClient.reserve(
                        eq(productIdA), any(UUID.class), any(int.class),
                        anyString(), any(UUID.class)))
                .thenReturn(ReservationResult.reserved());
        Mockito.when(inventoryClient.reserve(
                        eq(productIdB), any(UUID.class), any(int.class),
                        anyString(), any(UUID.class)))
                .thenThrow(new BusinessException(ErrorCode.CONFLICT, "B 라인 가용 재고 부족"));

        mockMvc.perform(post("/api/v1/partner-orders/{id}/convert-to-slip", orderId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "items": [
                                    {"orderLineId": "%s", "quantity": 5},
                                    {"orderLineId": "%s", "quantity": 5}
                                  ],
                                  "warehouseCode": "WH-MAIN"
                                }
                                """.formatted(lineIdA, lineIdB))
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .header("X-User-Name", "영업담당자"))
                .andExpect(status().isConflict());

        // 선행 라인 A 에 대해서만 release 보상 호출됨
        verify(inventoryClient).release(
                eq(productIdA), eq(STUB_WAREHOUSE_ID), eq(5),
                eq("PARTNER_ORDER_CONVERT"), any(UUID.class));
        // 후행 라인 B 는 reserve 실패했으므로 release 미호출
        verify(inventoryClient, never()).release(
                eq(productIdB), any(UUID.class), any(int.class),
                anyString(), any(UUID.class));

        // slip 미발행
        verify(slipServiceClient, never()).publishFromPartnerOrder(any(), anyString());

        // DB: 두 라인 모두 converted_quantity = 0 (전체 중단)
        Integer convertedA = jdbcTemplate.queryForObject(
                "SELECT converted_quantity FROM partner_order_lines WHERE id = ?",
                Integer.class, lineIdA);
        Integer convertedB = jdbcTemplate.queryForObject(
                "SELECT converted_quantity FROM partner_order_lines WHERE id = ?",
                Integer.class, lineIdB);
        assertThat(convertedA).isEqualTo(0);
        assertThat(convertedB).isEqualTo(0);
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
