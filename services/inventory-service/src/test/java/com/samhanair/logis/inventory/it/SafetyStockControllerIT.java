package com.samhanair.logis.inventory.it;

import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.inventory.InventoryServiceApplication;
import com.samhanair.logis.inventory.client.NotificationClient;
import com.samhanair.logis.inventory.client.ProductClient;
import com.samhanair.logis.inventory.client.ProductSummary;
import com.samhanair.logis.inventory.repository.WarehouseRepository;
import com.samhanair.logis.inventory.web.dto.OpaqueUuidSerializer;
import com.samhanair.logis.security.permission.PermissionAction;
import java.math.BigDecimal;
import java.util.HashMap;
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
import org.springframework.transaction.annotation.Transactional;

/**
 * SafetyStockController 통합 테스트 (P1-3).
 *
 * <p>외부 서비스 의존 격리:
 * <ul>
 *   <li>{@link ProductClient} — product-service 호출 mock (lenient stub)</li>
 *   <li>{@link NotificationClient} — notification-service 호출 mock (fire-and-forget)</li>
 * </ul>
 *
 * <p>Docker 미가용 환경에서는 {@link AbstractPostgresIT.DockerAvailableCondition} 에 의해 skip 처리.
 */
@SpringBootTest(classes = InventoryServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class SafetyStockControllerIT extends AbstractPostgresIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private WarehouseRepository warehouseRepository;

    @MockBean
    private ProductClient productClient;

    @MockBean
    private NotificationClient notificationClient;

    private UUID hqWarehouseId;
    private UUID productId;

    @BeforeEach
    void setUp() {
        Mockito.lenient().when(dynamicPermissionClient.canView(Mockito.anyString(), Mockito.anyString()))
                .thenReturn(true);
        Mockito.lenient().when(dynamicPermissionClient.canEdit(Mockito.anyString(), Mockito.anyString()))
                .thenReturn(true);

        productId = UUID.randomUUID();

        hqWarehouseId = warehouseRepository.findByCode("HQ-001")
                .orElseThrow(() -> new IllegalStateException(
                        "HQ-001 시드 누락 — V2__seed_inventory_warehouses.sql 확인"))
                .getId();

        Mockito.lenient().when(productClient.requireExists(Mockito.any()))
                .thenReturn(new ProductSummary(productId, "테스트 제품", "TEST-001",
                        UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE"));

        // Sprint 4 — findAlerts() 의 batch lookup stub. enrich (productCode/productName) 검증용.
        Mockito.lenient().when(productClient.lookupAllowMissing(Mockito.anyList()))
                .thenAnswer(inv -> {
                    java.util.List<UUID> ids = inv.getArgument(0);
                    return ids.stream()
                            .map(id -> new ProductSummary(id, "테스트 제품", "TEST-001",
                                    "TEST-CODE-" + id.toString().substring(0, 4),
                                    UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE"))
                            .toList();
                });

        // NotificationClient fire-and-forget — 반환값 없음, 예외 없음
        Mockito.lenient().doNothing().when(notificationClient)
                .sendSafetyStockAlert(Mockito.anyString(), Mockito.anyString());
    }

    // ------------------------------------------------------------------
    // POST /inventory/products/{productId}/safety-stock
    // ------------------------------------------------------------------

    @Test
    @DisplayName("임계값 설정: MASTER 권한으로 설정 성공 → 201")
    void setSafetyStock_master_returns201() throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("warehouseId", hqWarehouseId.toString());
        body.put("threshold", 50);
        body.put("note", "HQ 안전재고 50개");
        body.put("scopeMode", "SELECTED");

        mockMvc.perform(post("/inventory/products/{productId}/safety-stock", productId)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.productId").value(productId.toString()))
                .andExpect(jsonPath("$.data.warehouseId").value(OpaqueUuidSerializer.encode(hqWarehouseId)))
                .andExpect(jsonPath("$.data.threshold").value(50))
                .andExpect(jsonPath("$.data.note").value("HQ 안전재고 50개"));
    }

    @Test
    @DisplayName("안전재고 — scopeMode 누락은 400으로 차단")
    void setSafetyStock_withoutScopeMode_returns400() throws Exception {
        mockMvc.perform(post("/inventory/products/{productId}/safety-stock", productId)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"warehouseId\":\"" + hqWarehouseId + "\",\"threshold\":50}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("안전재고 — SELECTED 창고 미선택은 400으로 차단")
    void setSafetyStock_selectedWithoutWarehouse_returns400() throws Exception {
        mockMvc.perform(post("/inventory/products/{productId}/safety-stock", productId)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"scopeMode\":\"SELECTED\",\"threshold\":50}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("안전재고 — ALL 창고에 warehouseId를 함께 보내면 400으로 차단")
    void setSafetyStock_allWithWarehouse_returns400() throws Exception {
        mockMvc.perform(post("/inventory/products/{productId}/safety-stock", productId)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"scopeMode\":\"ALL\",\"warehouseId\":\"" + hqWarehouseId + "\",\"threshold\":50}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("임계값 설정: SALES 권한으로 설정 시도 → 403")
    void setSafetyStock_salesRole_returns403() throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("threshold", 50);
        body.put("scopeMode", "ALL");

        Mockito.when(dynamicPermissionClient.check(
                        Mockito.any(UUID.class),
                        Mockito.eq("inventory.safety-stock"),
                        Mockito.eq(PermissionAction.UPDATE)))
                .thenReturn(false);

        mockMvc.perform(post("/inventory/products/{productId}/safety-stock", productId)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("임계값 설정: threshold 음수 입력 → 400")
    void setSafetyStock_negativeThreshold_returns400() throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("threshold", -1);
        body.put("scopeMode", "ALL");

        mockMvc.perform(post("/inventory/products/{productId}/safety-stock", productId)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("임계값 설정: threshold null 입력 → 400")
    void setSafetyStock_nullThreshold_returns400() throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("warehouseId", hqWarehouseId.toString());
        body.put("scopeMode", "SELECTED");
        // threshold 누락

        mockMvc.perform(post("/inventory/products/{productId}/safety-stock", productId)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("임계값 설정: warehouseId null (전체 합산 기준) 허용 → 201")
    void setSafetyStock_nullWarehouseId_returns201() throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("threshold", 200);
        body.put("note", "전체 창고 합산 기준");
        body.put("scopeMode", "ALL");
        // warehouseId 누락 = null

        mockMvc.perform(post("/inventory/products/{productId}/safety-stock", productId)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "INVENTORY")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.warehouseId").doesNotExist())
                .andExpect(jsonPath("$.data.threshold").value(200));
    }

    // ------------------------------------------------------------------
    // GET /inventory/alerts/safety-stock
    // ------------------------------------------------------------------

    @Test
    @DisplayName("알림 목록: 인증 없이 조회 → 403")
    void listAlerts_unauthenticated_returns403() throws Exception {
        mockMvc.perform(get("/inventory/alerts/safety-stock"))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("알림 목록: SALES 권한 조회 → 403")
    void listAlerts_salesRole_returns403() throws Exception {
        Mockito.when(dynamicPermissionClient.check(
                        Mockito.any(UUID.class),
                        Mockito.eq("inventory.safety-stock"),
                        Mockito.eq(PermissionAction.VIEW)))
                .thenReturn(false);

        mockMvc.perform(get("/inventory/alerts/safety-stock")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("알림 목록: 임계값 설정 후 재고 없으면 알림 포함 → 200 + 1건 이상")
    void listAlerts_afterSetWithNoStock_returnsList() throws Exception {
        // 1) 임계값 설정 (재고 없음 → currentQty=0, threshold=50 → 알림 발생)
        Map<String, Object> body = new HashMap<>();
        body.put("warehouseId", hqWarehouseId.toString());
        body.put("threshold", 50);
        body.put("scopeMode", "SELECTED");

        mockMvc.perform(post("/inventory/products/{productId}/safety-stock", productId)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated());

        // 2) 알림 목록 조회 — 재고 0 ≤ threshold 50 이므로 1건 이상 포함
        mockMvc.perform(get("/inventory/alerts/safety-stock")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(greaterThanOrEqualTo(1))))
                // V8 seed (5건) 가 적재된 환경에서 신규 productId 만 필터링 검증.
                // data 정렬 순서 비의존 — JSONPath filter 로 자기 row 만 추출.
                .andExpect(jsonPath("$.data[?(@.productId == '" + productId + "')].threshold").value(50))
                .andExpect(jsonPath("$.data[?(@.productId == '" + productId + "')].shortage",
                        org.hamcrest.Matchers.everyItem(greaterThanOrEqualTo(1))))
                // Sprint 4 — 신규 enrich field jsonPath 검증 (productCode + productName + warehouseName)
                .andExpect(jsonPath("$.data[?(@.productId == '" + productId + "')].productCode",
                        org.hamcrest.Matchers.everyItem(org.hamcrest.Matchers.startsWith("TEST-CODE-"))))
                .andExpect(jsonPath("$.data[?(@.productId == '" + productId + "')].productName")
                        .value(org.hamcrest.Matchers.hasItem("TEST-001")))
                .andExpect(jsonPath("$.data[?(@.productId == '" + productId + "')].warehouseName")
                        .value(org.hamcrest.Matchers.hasItem(org.hamcrest.Matchers.notNullValue())));
    }

    @Test
    @DisplayName("R10 알림 목록: product lookup 전량 미조회여도 알림 자체는 남는다")
    void listAlerts_whenEveryProductLookupMissing_keepsAlertWithNullIdentity() throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("warehouseId", hqWarehouseId.toString());
        body.put("threshold", 50);
        body.put("scopeMode", "SELECTED");

        mockMvc.perform(post("/inventory/products/{productId}/safety-stock", productId)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated());

        Mockito.when(productClient.lookupAllowMissing(Mockito.anyList()))
                .thenReturn(java.util.List.of());

        mockMvc.perform(get("/inventory/alerts/safety-stock")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[?(@.productId == '" + productId + "')]").isNotEmpty())
                .andExpect(jsonPath("$.data[?(@.productId == '" + productId + "')].productCode")
                        .value(org.hamcrest.Matchers.hasItem(org.hamcrest.Matchers.nullValue())))
                .andExpect(jsonPath("$.data[?(@.productId == '" + productId + "')].productName")
                        .value(org.hamcrest.Matchers.hasItem(org.hamcrest.Matchers.nullValue())));

        Mockito.verify(productClient).lookupAllowMissing(Mockito.anyList());
    }

    @Test
    @DisplayName("알림 목록: 재고가 임계값 초과이면 해당 제품 알림 미포함")
    void listAlerts_stockAboveThreshold_notIncluded() throws Exception {
        // 1) 임계값 10 설정
        Map<String, Object> configBody = new HashMap<>();
        configBody.put("warehouseId", hqWarehouseId.toString());
        configBody.put("threshold", 10);
        configBody.put("scopeMode", "SELECTED");

        mockMvc.perform(post("/inventory/products/{productId}/safety-stock", productId)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(configBody)))
                .andExpect(status().isCreated());

        // 2) 100개 입고 (임계 10 초과)
        Map<String, Object> inboundBody = new HashMap<>();
        inboundBody.put("productId", productId.toString());
        inboundBody.put("warehouseId", hqWarehouseId.toString());
        inboundBody.put("quantity", 100);
        inboundBody.put("unitCost", 100000);
        inboundBody.put("lotNo", "SAFETY-INBOUND-001");
        inboundBody.put("sourceContext", Map.of(
                "sourceOperationId", UUID.randomUUID().toString(),
                "slipId", productId.toString(), "slipRevision", 1));

        mockMvc.perform(post("/inventory/lots/inbound")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(inboundBody)))
                .andExpect(status().isCreated());

        // 3) 알림 목록 조회 — 재고 100 > threshold 10 이므로 해당 제품 미포함
        String responseBody = mockMvc.perform(get("/inventory/alerts/safety-stock")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        // 응답 data 배열에 해당 productId 가 없어야 함
        com.fasterxml.jackson.databind.JsonNode root =
                objectMapper.readTree(responseBody).get("data");
        boolean found = false;
        for (com.fasterxml.jackson.databind.JsonNode node : root) {
            if (productId.toString().equals(node.get("productId").asText())) {
                found = true;
                break;
            }
        }
        org.assertj.core.api.Assertions.assertThat(found)
                .as("재고 충분 제품이 알림 목록에 포함되어서는 안 됨").isFalse();
    }
}
