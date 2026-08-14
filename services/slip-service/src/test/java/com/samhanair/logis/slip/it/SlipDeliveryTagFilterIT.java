package com.samhanair.logis.slip.it;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.NotificationChatRoomClient;
import com.samhanair.logis.slip.client.PartnerBlockClient;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * SlipController.list() — DeliveryTag 필터 + slipType 정합성 검증 IT.
 *
 * <p>시나리오 세트:
 * <ul>
 *   <li>OUT 슬립 5건: SALE 2건 + RENTAL 2건 + BORROW_RETURN 1건</li>
 *   <li>IN  슬립 3건: RETURN_TRIP 1건 + RETURN 1건 + BORROW 1건</li>
 * </ul>
 *
 * <p>TC-1: GET /slips?slipType=OUTBOUND&deliveryTag=RENTAL → 2건
 * <p>TC-2: GET /slips?slipType=INBOUND&deliveryTag=RETURN_TRIP → 1건
 * <p>TC-3: GET /slips?slipType=OUTBOUND&deliveryTag=RETURN_TRIP → 400 (정합 위반: RETURN_TRIP 은 INBOUND 전용)
 * <p>TC-4: GET /slips?slipType=INBOUND&deliveryTag=SALE → 400 (정합 위반: SALE 는 OUTBOUND 전용)
 * <p>TC-5: GET /slips?slipType=OUTBOUND&deliveryTag=RENTAL&deliveryTag=BORROW_RETURN → 3건
 *
 * <p>외부 RestClient (@MockBean 4종) — PR #134~#152 회고 ({@code feedback_it_mockbean_external_clients}):
 * {@link ProductClient}, {@link InventoryClient}, {@link NotificationChatRoomClient},
 * {@link PartnerBlockClient}, {@link PartnerInternalClient} 모두 lenient stub.
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class SlipDeliveryTagFilterIT extends AbstractPostgresIT {

    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String USER_ROLE_HEADER = "X-User-Role";
    private static final String MASTER_ROLE = "MASTER";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    /** 외부 client 격리 — inventory-service 실제 호출 차단 */
    @MockBean
    private InventoryClient inventoryClient;

    /** 외부 client 격리 — product-service 실제 호출 차단 */
    @MockBean
    private ProductClient productClient;

    /** 외부 client 격리 — notification-service chat-room lookup 차단 */
    @MockBean
    private NotificationChatRoomClient notificationChatRoomClient;

    /** 외부 client 격리 — partner-service block lookup 차단 */
    @MockBean
    private PartnerBlockClient partnerBlockClient;

    /** 외부 client 격리 — partner-service internal resolve 차단 */
    @MockBean
    private PartnerInternalClient partnerInternalClient;

    /** SP-08-FU1 — UserInternalClient @MockBean 격리 (ownerFullName graceful fallback). */
    @MockBean
    private UserInternalClient userInternalClient;
    /** SP-08-FU2 P2-2 — WarehouseInternalClient @MockBean 격리. */
    @MockBean
    private WarehouseInternalClient warehouseInternalClient;

    /**
     * ProductClient lenient stub — SlipService.create 가 라인 productId 검증 시
     * 실제 호출 → 500 방지 (PR #17 1차 fail 회고).
     */
    @BeforeEach
    void setupMocks() {
        Mockito.lenient().when(userInternalClient.resolveFullName(ArgumentMatchers.any()))
                .thenReturn(Optional.of("담당자"));
        Mockito.lenient().when(productClient.lookup(ArgumentMatchers.anyList()))
                .thenAnswer(inv -> {
                    List<UUID> ids = inv.getArgument(0);
                    return ids.stream()
                            .map(id -> new ProductSummary(id, "테스트 제품", "MOD-001",
                                    UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE"))
                            .toList();
                });
        Mockito.lenient().when(productClient.requireExists(ArgumentMatchers.any()))
                .thenAnswer(inv -> new ProductSummary(
                        inv.getArgument(0), "테스트 제품", "MOD-001",
                        UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE"));
        // SP-D3 lenient stub — canView=true, canEdit=true 기본값 (기존 IT 회귀 0건 보장)
        Mockito.lenient()
                .when(dynamicPermissionClient.canView(ArgumentMatchers.anyString(), ArgumentMatchers.anyString()))
                .thenReturn(true);
        Mockito.lenient()
                .when(dynamicPermissionClient.canEdit(ArgumentMatchers.anyString(), ArgumentMatchers.anyString()))
                .thenReturn(true);
        Mockito.lenient()
                .when(dynamicPermissionClient.check(
                        ArgumentMatchers.any(java.util.UUID.class),
                        ArgumentMatchers.anyString(),
                        ArgumentMatchers.any(com.samhanair.logis.security.permission.PermissionAction.class)))
                .thenReturn(true);
    }

    // -----------------------------------------------------------------------
    // 헬퍼 — 슬립 생성
    // -----------------------------------------------------------------------

    /**
     * OUTBOUND 슬립 생성 헬퍼.
     *
     * @param deliveryTag 배송 태그 문자열 (예: "SALE", "RENTAL")
     * @param repeat 생성할 건수
     */
    private void createOutbound(String deliveryTag, int repeat) throws Exception {
        for (int i = 0; i < repeat; i++) {
            Map<String, Object> body = outboundBody(deliveryTag);
            mockMvc.perform(post("/slips")
                            .header(USER_ID_HEADER, UUID.randomUUID().toString())
                            .header(USER_ROLE_HEADER, "SALES")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(body)))
                    .andExpect(status().isCreated());
        }
    }

    /**
     * INBOUND 슬립 생성 헬퍼.
     *
     * @param deliveryTag 배송 태그 문자열 (예: "RETURN_TRIP", "RETURN")
     * @param repeat 생성할 건수
     */
    private void createInbound(String deliveryTag, int repeat) throws Exception {
        for (int i = 0; i < repeat; i++) {
            Map<String, Object> body = inboundBody(deliveryTag);
            mockMvc.perform(post("/slips")
                            .header(USER_ID_HEADER, UUID.randomUUID().toString())
                            .header(USER_ROLE_HEADER, "SALES")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(body)))
                    .andExpect(status().isCreated());
        }
    }

    private Map<String, Object> outboundBody(String deliveryTag) {
        Map<String, Object> line = new HashMap<>();
        line.put("productId", UUID.randomUUID().toString());
        line.put("productName", "테스트 제품");
        line.put("modelName", "MOD-001");
        line.put("quantity", 1);
        line.put("unitPrice", 100000);

        Map<String, Object> body = new HashMap<>();
        body.put("slipType", "OUTBOUND");
        body.put("slipDate", "2026-05-11");
        body.put("sourceWarehouseId", UUID.randomUUID().toString());
        body.put("destinationWarehouseId", UUID.randomUUID().toString());
        body.put("partnerId", UUID.randomUUID().toString());
        body.put("partnerName", "테스트 거래처");
        body.put("deliveryTag", deliveryTag);
        body.put("memo", "필터 IT 테스트");
        body.put("lines", List.of(line));
        return body;
    }

    private Map<String, Object> inboundBody(String deliveryTag) {
        Map<String, Object> line = new HashMap<>();
        line.put("productId", UUID.randomUUID().toString());
        line.put("productName", "테스트 제품");
        line.put("modelName", "MOD-001");
        line.put("quantity", 1);
        line.put("unitPrice", 100000);

        Map<String, Object> body = new HashMap<>();
        body.put("slipType", "INBOUND");
        body.put("slipDate", "2026-05-11");
        body.put("destinationWarehouseId", UUID.randomUUID().toString());
        body.put("partnerId", UUID.randomUUID().toString());
        body.put("partnerName", "테스트 거래처");
        body.put("deliveryTag", deliveryTag);
        body.put("memo", "필터 IT 테스트");
        body.put("lines", List.of(line));
        return body;
    }

    /**
     * 8건 시나리오 데이터 사전 생성 — OUT 5건(SALE×2 + RENTAL×2 + BORROW_RETURN×1) + IN 3건(RETURN_TRIP×1 + RETURN×1 + BORROW×1).
     */
    private void seedSlips() throws Exception {
        createOutbound("SALE", 2);
        createOutbound("RENTAL", 2);
        createOutbound("BORROW_RETURN", 1);
        createInbound("RETURN_TRIP", 1);
        createInbound("RETURN", 1);
        createInbound("BORROW", 1);
    }

    // -----------------------------------------------------------------------
    // TC-1: OUTBOUND + RENTAL → 2건
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("TC-1: OUTBOUND + RENTAL 단일 태그 필터 → 정확히 2건 반환")
    void tc1_outbound_rental_returns2() throws Exception {
        seedSlips();

        mockMvc.perform(get("/slips")
                        .param("slipType", "OUTBOUND")
                        .param("deliveryTag", "RENTAL")
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_ROLE_HEADER, MASTER_ROLE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(2));
    }

    // -----------------------------------------------------------------------
    // TC-2: INBOUND + RETURN_TRIP → 1건
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("TC-2: INBOUND + RETURN_TRIP 단일 태그 필터 → 정확히 1건 반환")
    void tc2_inbound_returnTrip_returns1() throws Exception {
        seedSlips();

        mockMvc.perform(get("/slips")
                        .param("slipType", "INBOUND")
                        .param("deliveryTag", "RETURN_TRIP")
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_ROLE_HEADER, MASTER_ROLE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(1));
    }

    // -----------------------------------------------------------------------
    // TC-3: OUTBOUND + RETURN_TRIP → 400 (정합 위반)
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("TC-3: OUTBOUND + RETURN_TRIP 조합 → 400 BAD_REQUEST (RETURN_TRIP 은 INBOUND 전용)")
    void tc3_outbound_returnTrip_returns400() throws Exception {
        // 데이터 생성 없이도 정합 가드가 먼저 발동해야 함
        mockMvc.perform(get("/slips")
                        .param("slipType", "OUTBOUND")
                        .param("deliveryTag", "RETURN_TRIP")
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_ROLE_HEADER, MASTER_ROLE))
                .andExpect(status().isBadRequest());
    }

    // -----------------------------------------------------------------------
    // TC-4: INBOUND + SALE → 400 (정합 위반)
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("TC-4: INBOUND + SALE 조합 → 400 BAD_REQUEST (SALE 는 OUTBOUND 전용)")
    void tc4_inbound_day_returns400() throws Exception {
        mockMvc.perform(get("/slips")
                        .param("slipType", "INBOUND")
                        .param("deliveryTag", "SALE")
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_ROLE_HEADER, MASTER_ROLE))
                .andExpect(status().isBadRequest());
    }

    // -----------------------------------------------------------------------
    // TC-5: OUTBOUND + RENTAL,BORROW_RETURN 멀티셀렉 → 3건
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("TC-5: OUTBOUND + RENTAL,BORROW_RETURN 멀티셀렉 필터 → 정확히 3건 반환")
    void tc5_outbound_rental_returnRental_multiSelect_returns3() throws Exception {
        seedSlips();

        // deliveryTag 파라미터 반복 전달 (comma-separated 대신 반복 param 방식)
        mockMvc.perform(get("/slips")
                        .param("slipType", "OUTBOUND")
                        .param("deliveryTag", "RENTAL")
                        .param("deliveryTag", "BORROW_RETURN")
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_ROLE_HEADER, MASTER_ROLE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(3));
    }
}
