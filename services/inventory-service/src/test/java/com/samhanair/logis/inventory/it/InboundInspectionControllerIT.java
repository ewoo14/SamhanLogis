package com.samhanair.logis.inventory.it;

import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.inventory.InventoryServiceApplication;
import com.samhanair.logis.inventory.client.ProductClient;
import com.samhanair.logis.inventory.client.SlipClient;
import com.samhanair.logis.inventory.client.SlipDetail;
import com.samhanair.logis.inventory.client.SlipLineDetail;
import com.samhanair.logis.inventory.repository.WarehouseRepository;
import com.samhanair.logis.security.permission.PermissionAction;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
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
 * InboundInspectionController 통합 테스트 — Testcontainers PostgreSQL + MockMvc.
 *
 * <p>외부 RestClient 격리:
 * <ul>
 *   <li>{@link ProductClient} — product-service 호출 @MockBean (lenient stub)</li>
 *   <li>{@link SlipClient} — slip-service 호출 @MockBean (시나리오별 stub)</li>
 * </ul>
 *
 * <p>테스트 커버:
 * <ol>
 *   <li>미인증 요청 → 403</li>
 *   <li>SALES 권한 → 403</li>
 *   <li>WAREHOUSE 권한 — GET 검수 생성 → 200 + 라인 확인</li>
 *   <li>WAREHOUSE 권한 — POST inspect 결과 저장 → 200</li>
 *   <li>WAREHOUSE 권한 — POST complete 재고 반영 → 200 + stockApplied=true</li>
 *   <li>GET list (status=PENDING) → 200 + page</li>
 *   <li>OUTBOUND 슬립 GET → 409</li>
 * </ol>
 */
@SpringBootTest(classes = InventoryServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class InboundInspectionControllerIT extends AbstractPostgresIT {

    private static final String PUBLIC_PATH = "/api/v1/inventory/inbound-inspections";
    private static final String STRIPPED_PATH = "/inventory/inbound-inspections";
    private static final String STANDARD_SLIP_NO = "2026/05/11-1";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private WarehouseRepository warehouseRepository;

    @MockBean private ProductClient productClient;
    @MockBean private SlipClient slipClient;

    private UUID hqWarehouseId;
    private final UUID slipId = UUID.randomUUID();
    private final UUID productId = UUID.randomUUID();
    private final UUID slipLineId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        hqWarehouseId = warehouseRepository.findByCode("HQ-001")
                .orElseThrow(() -> new IllegalStateException(
                        "HQ-001 시드 누락 — V2__seed_inventory_warehouses.sql 확인"))
                .getId();

        // ProductClient lenient stub
        Mockito.lenient().when(productClient.requireExists(Mockito.any()))
                .thenAnswer(inv -> new com.samhanair.logis.inventory.client.ProductSummary(
                        inv.getArgument(0), "테스트 제품", "MODEL-IT-001",
                        UUID.randomUUID(), new BigDecimal("50000"), "ACTIVE"));

        // SlipClient — INBOUND SAVED 슬립 기본 stub
        SlipLineDetail slipLine = new SlipLineDetail(
                slipLineId, productId, "테스트 제품", "MODEL-IT-001",
                5, new BigDecimal("50000"));
        SlipDetail slipDetail = new SlipDetail(
                slipId, STANDARD_SLIP_NO, "INBOUND", "SAVED",
                hqWarehouseId, "테스트 거래처", "본사창고", "2026-05-11",
                List.of(slipLine));
        Mockito.lenient().when(slipClient.getSlip(slipId)).thenReturn(slipDetail);
    }

    @Test
    @DisplayName("미인증 요청 → 403")
    void unauthenticated_returns403() throws Exception {
        mockMvc.perform(get(PUBLIC_PATH + "/{slipId}", slipId))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("SALES 권한 → 403")
    void salesRole_returns403() throws Exception {
        // @PreAuthorize 제거 후 @RequirePermission(inventory.stock-balance, VIEW) 단독 가드.
        // AbstractPostgresIT 기본 stub(check → true) 을 override — V35 seed: SALES 에 stock-balance 없음.
        Mockito.when(dynamicPermissionClient.check(
                        Mockito.any(UUID.class),
                        Mockito.eq("inventory.stock-balance"),
                        Mockito.any(PermissionAction.class)))
                .thenReturn(false);

        mockMvc.perform(get(PUBLIC_PATH + "/{slipId}", slipId)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("INVENTORY 계정 + 권한 미부여 → 403 (동적 권한 부재 시 차단)")
    void inventoryAccountWithoutGrant_returns403() throws Exception {
        // @RequirePermission(inventory.stock-balance, VIEW) 단일 가드.
        // 기본 stub(check → true)을 override 하여 권한 미부여 상황을 모사한다.
        // Option A로 INVENTORY의 stock-balance 접근은 정식 수용되나(V35 seed grant 존재),
        // 권한이 실제 부여되지 않은 계정은 차단됨을 검증한다.
        Mockito.when(dynamicPermissionClient.check(
                        Mockito.any(UUID.class),
                        Mockito.eq("inventory.stock-balance"),
                        Mockito.any(PermissionAction.class)))
                .thenReturn(false);

        mockMvc.perform(get(PUBLIC_PATH + "/{slipId}", slipId)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "INVENTORY"))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("WAREHOUSE — GET 검수 생성 → 200 + slipNo + lines")
    void warehouseRole_getInspection_creates_returns200() throws Exception {
        mockMvc.perform(get(PUBLIC_PATH + "/{slipId}", slipId)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.slipNo").value(STANDARD_SLIP_NO))
                .andExpect(jsonPath("$.data.status").value("PENDING"))
                .andExpect(jsonPath("$.data.lines").isArray())
                .andExpect(jsonPath("$.data.lines[0].expectedQty").value(5))
                .andExpect(jsonPath("$.data.lines[0].modelCode").value("MODEL-IT-001"));
    }

    @Test
    @DisplayName("Gateway StripPrefix=2 도착 경로 — /inventory/inbound-inspections GET 200")
    void gatewayStrippedPath_getInspection_returns200() throws Exception {
        mockMvc.perform(get(STRIPPED_PATH + "/{slipId}", slipId)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.slipNo").value(STANDARD_SLIP_NO));
    }

    @Test
    @DisplayName("WAREHOUSE — POST inspect 결과 저장 → 200 + inspectedQty 반영")
    void warehouseRole_saveResult_returns200() throws Exception {
        // 1) 먼저 GET 으로 검수 생성
        MvcResult getResult = mockMvc.perform(
                        get(PUBLIC_PATH + "/{slipId}", slipId)
                                .header("X-User-Id", UUID.randomUUID().toString())
                                .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk())
                .andReturn();

        String lineId = objectMapper.readTree(getResult.getResponse().getContentAsString())
                .get("data").get("lines").get(0).get("lineId").asText();

        // 2) 검수 결과 저장
        Map<String, Object> lineResult = new HashMap<>();
        lineResult.put("lineId", lineId);
        lineResult.put("inspectedQty", 4);
        lineResult.put("defectQty", 1);
        lineResult.put("defectReason", "외관 찍힘");

        Map<String, Object> body = new HashMap<>();
        body.put("lines", List.of(lineResult));

        mockMvc.perform(post(PUBLIC_PATH + "/{slipId}/inspect", slipId)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.lines[0].inspectedQty").value(4))
                .andExpect(jsonPath("$.data.lines[0].defectQty").value(1))
                .andExpect(jsonPath("$.data.lines[0].normalQty").value(3));
    }

    @Test
    @DisplayName("WAREHOUSE — POST complete 재고 반영 → 200 + stockApplied=true")
    void warehouseRole_complete_returns200_stockApplied() throws Exception {
        // 1) 검수 생성
        MvcResult getResult = mockMvc.perform(
                        get(PUBLIC_PATH + "/{slipId}", slipId)
                                .header("X-User-Id", UUID.randomUUID().toString())
                                .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk())
                .andReturn();

        String lineId = objectMapper.readTree(getResult.getResponse().getContentAsString())
                .get("data").get("lines").get(0).get("lineId").asText();

        // 2) 검수 결과 저장 (모든 라인 입력 필수)
        Map<String, Object> lineResult = new HashMap<>();
        lineResult.put("lineId", lineId);
        lineResult.put("inspectedQty", 5);
        lineResult.put("defectQty", 0);
        lineResult.put("defectReason", null);

        Map<String, Object> inspectBody = new HashMap<>();
        inspectBody.put("lines", List.of(lineResult));

        mockMvc.perform(post(PUBLIC_PATH + "/{slipId}/inspect", slipId)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(inspectBody)))
                .andExpect(status().isOk());

        // 3) 완료 → 재고 반영
        mockMvc.perform(post(PUBLIC_PATH + "/{slipId}/complete", slipId)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("COMPLETED"))
                .andExpect(jsonPath("$.data.stockApplied").value(true))
                .andExpect(jsonPath("$.data.completedAt").value(notNullValue()));
    }

    @Test
    @DisplayName("GET list status=PENDING → 200 + page 구조")
    void listInspections_pending_returns200() throws Exception {
        // 검수 1건 생성 후 list 조회
        mockMvc.perform(get(PUBLIC_PATH + "/{slipId}", slipId)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk());

        mockMvc.perform(get(PUBLIC_PATH)
                        .param("status", "PENDING")
                        .param("page", "0")
                        .param("size", "10")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content").isArray())
                .andExpect(jsonPath("$.data.totalElements").value(notNullValue()));
    }

    @Test
    @DisplayName("OUTBOUND 슬립 GET → 409 CONFLICT")
    void outboundSlip_returns409() throws Exception {
        UUID outboundSlipId = UUID.randomUUID();
        SlipDetail outbound = new SlipDetail(
                outboundSlipId, "2026/05/11-1", "OUTBOUND", "SAVED",
                hqWarehouseId, "테스트 거래처", "본사창고", "2026-05-11",
                List.of());
        Mockito.when(slipClient.getSlip(outboundSlipId)).thenReturn(outbound);

        mockMvc.perform(get(PUBLIC_PATH + "/{slipId}", outboundSlipId)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isConflict());
    }

    @Test
    @DisplayName("잘못된 status 파라미터 → 400")
    void invalidStatus_returns400() throws Exception {
        mockMvc.perform(get(PUBLIC_PATH)
                        .param("status", "INVALID_STATUS")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER"))
                .andExpect(status().isBadRequest());
    }
}
