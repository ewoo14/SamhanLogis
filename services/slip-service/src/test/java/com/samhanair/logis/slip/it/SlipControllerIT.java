package com.samhanair.logis.slip.it;

import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.InventoryClient;
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
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * Slip Controller — 권한 매트릭스 + 핵심 라이프사이클 단계별 InventoryClient 호출 검증.
 *
 * <p>BE endpoint (PM 명시, 정확):
 * <ul>
 *   <li>{@code GET    /slips}                    — 인증된 모든 역할 (200)</li>
 *   <li>{@code POST   /slips}                    — SALES/MANAGER/MASTER (201)</li>
 *   <li>{@code POST   /slips/{id}/accept}        — WAREHOUSE/INVENTORY/MANAGER/MASTER (200) → InventoryClient.reserve</li>
 *   <li>{@code POST   /slips/{id}/complete}      — WAREHOUSE/INVENTORY/MANAGER/MASTER (200) → InventoryClient.deduct(fromReservation=true)</li>
 *   <li>{@code POST   /slips/{id}/reject}        — MANAGER/MASTER (200, body { reason }) → ACCEPTED 이후면 InventoryClient.release</li>
 *   <li>{@code POST   /slips/{id}/confirm}       — ACCOUNTANT/MANAGER/MASTER (200)</li>
 * </ul>
 *
 * <p>모든 응답은 ApiResponse 래핑 → jsonPath {@code $.data.*}.
 * 미인증 + 권한 부족 = 403, 잘못된 상태 전이 + 재고 부족 = 409, 미존재 = 404, validation = 400.
 *
 * <p>{@link InventoryClient} 는 inventory-service 호출이라 IT 에서 mock.
 * void 메서드만 {@code doNothing()}, 반환값이 있으면 {@code when().thenReturn()} (PR #16 회고).
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class SlipControllerIT extends AbstractPostgresIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private InventoryClient inventoryClient;

    /**
     * ProductClient 도 @MockBean 으로 격리. SlipService.create 가 라인 productId 검증 시
     * lookup 호출하므로 mock 누락하면 실제 product-service RestClient 호출 → 500.
     * (CI hotfix: PR #17 1차 fail 회고 — IT 가 ProductClient 누락으로 10건 fail)
     */
    @MockBean
    private ProductClient productClient;
    /** SP-08-FU1 — UserInternalClient @MockBean 격리 (ownerFullName graceful fallback). */
    @MockBean
    private UserInternalClient userInternalClient;
    /** SP-08-FU2 P2-2 — WarehouseInternalClient @MockBean 격리. */
    @MockBean
    private WarehouseInternalClient warehouseInternalClient;

    @BeforeEach
    void mockProductClient() {
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
    }

    /** SALES 권한으로 출고전표 1건 생성. 라이프사이클 테스트의 공통 셋업. */
    private String createOutboundSlipAsSales() throws Exception {
        Map<String, Object> body = createOutboundSlipBody();

        MvcResult result = mockMvc.perform(post("/slips")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();

        return objectMapper.readTree(result.getResponse().getContentAsString())
                .get("data").get("id").asText();
    }

    private Map<String, Object> createOutboundSlipBody() {
        Map<String, Object> line = new HashMap<>();
        line.put("productId", UUID.randomUUID().toString());
        line.put("productName", "테스트 제품");
        line.put("modelName", "MOD-001");
        line.put("quantity", 5);
        line.put("unitPrice", 100000);
        line.put("note", "라인 메모");

        Map<String, Object> body = new HashMap<>();
        body.put("slipType", "OUTBOUND");
        body.put("slipDate", "2026-05-04");
        body.put("sourceWarehouseId", UUID.randomUUID().toString());
        body.put("destinationWarehouseId", UUID.randomUUID().toString());
        body.put("partnerId", UUID.randomUUID().toString());
        body.put("partnerName", "테스트 거래처");
        body.put("deliveryTag", "DAY");
        body.put("memo", "테스트");
        body.put("lines", List.of(line));
        return body;
    }

    @Test
    void unauthenticated_get_returns403() throws Exception {
        mockMvc.perform(get("/slips"))
                .andExpect(status().isForbidden());
    }

    @Test
    void salesRole_postSlip_returns201() throws Exception {
        Map<String, Object> body = createOutboundSlipBody();

        mockMvc.perform(post("/slips")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.id").value(notNullValue()));
    }

    @Test
    void warehouseRole_postSlip_returns403() throws Exception {
        // 전표 등록 권한은 SALES/MANAGER/MASTER. WAREHOUSE 는 차단.
        Map<String, Object> body = createOutboundSlipBody();

        mockMvc.perform(post("/slips")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isForbidden());
    }

    @Test
    void salesRole_acceptSlip_returns403() throws Exception {
        // accept 는 WAREHOUSE/INVENTORY/MANAGER/MASTER 만. SALES 차단.
        String slipId = createOutboundSlipAsSales();

        // save → send 까지는 SALES 가능.
        mockMvc.perform(post("/slips/" + slipId + "/save")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "SALES"))
                .andExpect(status().isOk());
        mockMvc.perform(post("/slips/" + slipId + "/send")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "SALES"))
                .andExpect(status().isOk());

        mockMvc.perform(post("/slips/" + slipId + "/accept")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isForbidden());
    }

    @Test
    void warehouseRole_acceptSlip_returns200_andCallsInventoryReserve() throws Exception {
        String slipId = createOutboundSlipAsSales();

        mockMvc.perform(post("/slips/" + slipId + "/save")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "SALES"))
                .andExpect(status().isOk());
        mockMvc.perform(post("/slips/" + slipId + "/send")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "SALES"))
                .andExpect(status().isOk());

        // accept → InventoryClient.reserve 호출.
        mockMvc.perform(post("/slips/" + slipId + "/accept")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk());

        // 결정 사항 Q2-A: accept → reserve.
        // InventoryClient.reserve(productId, warehouseId, quantity, refType, refId) — 5 인자.
        Mockito.verify(inventoryClient, Mockito.atLeastOnce())
                .reserve(ArgumentMatchers.any(UUID.class), ArgumentMatchers.any(UUID.class),
                        ArgumentMatchers.anyInt(), ArgumentMatchers.any(),
                        ArgumentMatchers.any(UUID.class));
    }

    @Test
    void complete_outbound_callsInventoryDeduct_withFromReservationTrue() throws Exception {
        String slipId = createOutboundSlipAsSales();

        mockMvc.perform(post("/slips/" + slipId + "/save")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "SALES"))
                .andExpect(status().isOk());
        mockMvc.perform(post("/slips/" + slipId + "/send")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "SALES"))
                .andExpect(status().isOk());
        mockMvc.perform(post("/slips/" + slipId + "/accept")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk());
        mockMvc.perform(post("/slips/" + slipId + "/process")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk());

        // PR #21 hotfix: complete = PROCESSING→INSPECTING (출고 완료, 재고 deduct).
        // 본 시나리오는 deduct 호출만 검증하므로 inspect (INSPECTING→COMPLETED) 까지 호출 불필요.
        mockMvc.perform(post("/slips/" + slipId + "/complete")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk());

        // InventoryClient.deduct(productId, warehouseId, quantity, fromReservation, refType, refId) — 6 인자.
        Mockito.verify(inventoryClient, Mockito.atLeastOnce())
                .deduct(ArgumentMatchers.any(UUID.class), ArgumentMatchers.any(UUID.class),
                        ArgumentMatchers.anyInt(), ArgumentMatchers.eq(true),
                        ArgumentMatchers.any(), ArgumentMatchers.any(UUID.class));
    }

    @Test
    void reject_afterAccept_callsInventoryRelease() throws Exception {
        String slipId = createOutboundSlipAsSales();

        mockMvc.perform(post("/slips/" + slipId + "/save")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "SALES"))
                .andExpect(status().isOk());
        mockMvc.perform(post("/slips/" + slipId + "/send")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "SALES"))
                .andExpect(status().isOk());
        mockMvc.perform(post("/slips/" + slipId + "/accept")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk());

        // ACCEPTED 이후 reject → InventoryClient.release 호출 (Q2-A 결정).
        Map<String, Object> rejectBody = Map.of("reason", "고객 요청 취소");
        mockMvc.perform(post("/slips/" + slipId + "/reject")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(rejectBody)))
                .andExpect(status().isOk());

        // InventoryClient.release(productId, warehouseId, quantity, refType, refId) — 5 인자.
        Mockito.verify(inventoryClient, Mockito.atLeastOnce())
                .release(ArgumentMatchers.any(UUID.class), ArgumentMatchers.any(UUID.class),
                        ArgumentMatchers.anyInt(), ArgumentMatchers.any(),
                        ArgumentMatchers.any(UUID.class));
    }

    @Test
    void confirm_accountantRole_returns200() throws Exception {
        String slipId = createOutboundSlipAsSales();

        mockMvc.perform(post("/slips/" + slipId + "/save")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "SALES")).andExpect(status().isOk());
        mockMvc.perform(post("/slips/" + slipId + "/send")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "SALES")).andExpect(status().isOk());
        mockMvc.perform(post("/slips/" + slipId + "/accept")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "WAREHOUSE")).andExpect(status().isOk());
        mockMvc.perform(post("/slips/" + slipId + "/process")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "WAREHOUSE")).andExpect(status().isOk());
        // PR #21 hotfix: complete (PROCESSING→INSPECTING) → inspect (INSPECTING→COMPLETED).
        mockMvc.perform(post("/slips/" + slipId + "/complete")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "WAREHOUSE")).andExpect(status().isOk());
        mockMvc.perform(post("/slips/" + slipId + "/inspect")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "WAREHOUSE")).andExpect(status().isOk());
        mockMvc.perform(post("/slips/" + slipId + "/ship")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "WAREHOUSE")).andExpect(status().isOk());
        mockMvc.perform(post("/slips/" + slipId + "/deliver")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "WAREHOUSE")).andExpect(status().isOk());

        // confirm → ACCOUNTANT 권한 (회계 확정).
        mockMvc.perform(post("/slips/" + slipId + "/confirm")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk());
    }

    // -------- Slice A (sales-polish-2) — inspect endpoint --------

    @Test
    void warehouseRole_inspectSlip_returns200_andSetsInspectorUserId() throws Exception {
        // PR #21 hotfix: complete (PROCESSING→INSPECTING) → inspect (INSPECTING→COMPLETED).
        // inspectorUserId/SignedAt 자동 기입은 inspect() 시점.
        String slipId = createOutboundSlipAsSales();
        String inspectorUuid = UUID.randomUUID().toString();

        mockMvc.perform(post("/slips/" + slipId + "/save")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "SALES")).andExpect(status().isOk());
        mockMvc.perform(post("/slips/" + slipId + "/send")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "SALES")).andExpect(status().isOk());
        mockMvc.perform(post("/slips/" + slipId + "/accept")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "WAREHOUSE")).andExpect(status().isOk());
        mockMvc.perform(post("/slips/" + slipId + "/process")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "WAREHOUSE")).andExpect(status().isOk());
        mockMvc.perform(post("/slips/" + slipId + "/complete")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "WAREHOUSE")).andExpect(status().isOk());

        mockMvc.perform(post("/slips/" + slipId + "/inspect")
                        .header("X-User-Id", inspectorUuid)
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("COMPLETED"))
                .andExpect(jsonPath("$.data.inspectorUserId").value(inspectorUuid))
                .andExpect(jsonPath("$.data.inspectorSignedAt").value(notNullValue()));
    }

    @Test
    void salesRole_inspectSlip_returns403() throws Exception {
        // inspect 는 WAREHOUSE/INVENTORY/MANAGER/MASTER. SALES 차단.
        String slipId = createOutboundSlipAsSales();

        mockMvc.perform(post("/slips/" + slipId + "/save")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "SALES")).andExpect(status().isOk());
        mockMvc.perform(post("/slips/" + slipId + "/send")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "SALES")).andExpect(status().isOk());
        mockMvc.perform(post("/slips/" + slipId + "/accept")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "WAREHOUSE")).andExpect(status().isOk());
        mockMvc.perform(post("/slips/" + slipId + "/process")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "WAREHOUSE")).andExpect(status().isOk());

        mockMvc.perform(post("/slips/" + slipId + "/inspect")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isForbidden());
    }

    @Test
    void warehouseRole_acceptSlip_returns200_andSetsDispatcherUserId() throws Exception {
        // ACCEPTED → dispatcherUserId/SignedAt 자동 기입 (사용자 피드백 #9).
        String slipId = createOutboundSlipAsSales();
        String dispatcherUuid = UUID.randomUUID().toString();

        mockMvc.perform(post("/slips/" + slipId + "/save")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "SALES")).andExpect(status().isOk());
        mockMvc.perform(post("/slips/" + slipId + "/send")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "SALES")).andExpect(status().isOk());

        mockMvc.perform(post("/slips/" + slipId + "/accept")
                        .header("X-User-Id", dispatcherUuid)
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("ACCEPTED"))
                .andExpect(jsonPath("$.data.dispatcherUserId").value(dispatcherUuid))
                .andExpect(jsonPath("$.data.dispatcherSignedAt").value(notNullValue()));
    }

    @Test
    void createSlip_withSpecification_returnsSpecificationInResponse() throws Exception {
        // 사용자 피드백 #4 — 라인 specification 필드 round-trip.
        Map<String, Object> line = new HashMap<>();
        line.put("productId", UUID.randomUUID().toString());
        line.put("productName", "에어컨");
        line.put("modelName", "MOD-220V");
        line.put("specification", "220V 4HP");
        line.put("quantity", 2);
        line.put("unitPrice", 100000);

        Map<String, Object> body = new HashMap<>();
        body.put("slipType", "OUTBOUND");
        body.put("slipDate", "2026-05-04");
        body.put("sourceWarehouseId", UUID.randomUUID().toString());
        body.put("destinationWarehouseId", UUID.randomUUID().toString());
        body.put("partnerId", UUID.randomUUID().toString());
        body.put("partnerName", "거래처");
        body.put("deliveryTag", "DAY");
        body.put("memo", "메모");
        body.put("lines", List.of(line));

        mockMvc.perform(post("/slips")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.lines[0].specification").value("220V 4HP"));
    }

    @Test
    void reject_warehouseRole_returns403() throws Exception {
        // reject 는 MANAGER/MASTER 만. WAREHOUSE 차단.
        String slipId = createOutboundSlipAsSales();

        mockMvc.perform(post("/slips/" + slipId + "/save")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "SALES")).andExpect(status().isOk());
        mockMvc.perform(post("/slips/" + slipId + "/send")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "SALES")).andExpect(status().isOk());

        Map<String, Object> rejectBody = Map.of("reason", "WAREHOUSE 가 reject 시도");
        mockMvc.perform(post("/slips/" + slipId + "/reject")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(rejectBody)))
                .andExpect(status().isForbidden());
    }
}
