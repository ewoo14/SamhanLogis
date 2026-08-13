package com.samhanair.logis.inventory.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.inventory.InventoryServiceApplication;
import com.samhanair.logis.inventory.client.AccountingClient;
import com.samhanair.logis.inventory.client.NotificationClient;
import com.samhanair.logis.inventory.client.ProductClient;
import com.samhanair.logis.inventory.client.ProductSummary;
import com.samhanair.logis.inventory.client.SlipClient;
import com.samhanair.logis.inventory.web.dto.OpaqueUuidSerializer;
import com.samhanair.logis.security.permission.PermissionAction;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
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
 * P1-3 안전재고 알림 검증 IT — extends AbstractPostgresIT (PR #134~#142 회고 패턴).
 *
 * <p>검증 시나리오:
 * <ol>
 *   <li>GET /inventory/alerts/safety-stock — 임계 미만 3건 반환</li>
 *   <li>POST /inventory/products/{productId}/safety-stock — 임계값 신규 설정 (201)</li>
 *   <li>POST 동일 (productId, warehouseId) 재요청 → upsert (갱신, 201)</li>
 *   <li>SALES 권한 알림 조회 → 403</li>
 *   <li>SALES 권한 임계값 설정 → 403</li>
 *   <li>threshold 음수 → 400</li>
 *   <li>신규 설정 후 알림 목록에 반영 확인</li>
 * </ol>
 *
 * <p>@MockBean 외부 client 4종 ({@code feedback_it_mockbean_external_clients.md} 준수):
 * <ul>
 *   <li>{@link ProductClient} — setSafetyStock 내 productId 검증 격리</li>
 *   <li>{@link AccountingClient} — InventoryAuditService 공유 빈 격리</li>
 *   <li>{@link SlipClient} — InboundInspectionService 공유 빈 격리</li>
 *   <li>{@link NotificationClient} — SafetyStockService.fireAlert fire-and-forget 격리</li>
 * </ul>
 *
 * <p>시드 데이터 (V8__seed_p13_safety_stock.sql):
 * <ul>
 *   <li>P13-CFG-001 HQ-001+PROD-001: availableQty=115, threshold=100 → 정상</li>
 *   <li>P13-CFG-002 HQ-001+PROD-002: availableQty=43,  threshold=50  → BELOW</li>
 *   <li>P13-CFG-003 HQ-001+PROD-003: availableQty=27,  threshold=30  → BELOW</li>
 *   <li>P13-CFG-004 VH-001+PROD-001: availableQty=6,   threshold=10  → BELOW</li>
 *   <li>P13-CFG-005 VH-001+PROD-002: availableQty=4,   threshold=3   → 정상</li>
 * </ul>
 */
@SpringBootTest(classes = InventoryServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class P13ValidationIT extends AbstractPostgresIT {

    // ---- 결정적 UUID (V6/V8 seed 동일) ----
    private static final UUID PROD_001 =
            UUID.fromString("a0a0a0a0-0000-0000-0000-000000000001");
    private static final UUID PROD_002 =
            UUID.fromString("a0a0a0a0-0000-0000-0000-000000000002");
    private static final UUID PROD_003 =
            UUID.fromString("a0a0a0a0-0000-0000-0000-000000000003");
    private static final UUID WH_HQ_001 =
            UUID.fromString("11111111-1111-1111-1111-000000000001");
    private static final UUID WH_VH_001 =
            UUID.fromString("11111111-1111-1111-1111-000000000002");

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;

    @MockBean private ProductClient productClient;
    @MockBean private AccountingClient accountingClient;
    @MockBean private SlipClient slipClient;
    @MockBean private NotificationClient notificationClient;

    @BeforeEach
    void setUpMocks() {
        Mockito.lenient().when(dynamicPermissionClient.canView(Mockito.anyString(), Mockito.anyString()))
                .thenReturn(true);
        Mockito.lenient().when(dynamicPermissionClient.canEdit(Mockito.anyString(), Mockito.anyString()))
                .thenReturn(true);

        // ProductClient — requireExists 는 ProductSummary 반환 (void 아님)
        Mockito.lenient().when(productClient.requireExists(Mockito.any()))
                .thenAnswer(inv -> new ProductSummary(
                        inv.getArgument(0), "테스트 제품", "TEST-001",
                        UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE"));
        Mockito.lenient().when(productClient.lookup(Mockito.anyList()))
                .thenAnswer(inv -> {
                    List<UUID> ids = inv.getArgument(0);
                    return ids.stream()
                            .map(id -> new ProductSummary(id, "테스트 제품", "TEST-001",
                                    UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE"))
                            .toList();
                });

        // AccountingClient — lenient no-op (본 슬라이스에서 직접 호출 없음)
        Mockito.lenient().doNothing().when(accountingClient)
                .createAuditAdjustmentJournal(
                        Mockito.any(), Mockito.any(), Mockito.any(), Mockito.any());

        // NotificationClient — fire-and-forget lenient no-op
        Mockito.lenient().doNothing().when(notificationClient)
                .sendSafetyStockAlert(Mockito.any(), Mockito.any());
    }

    // ─────────── 시나리오 1: GET /alerts/safety-stock 부족 목록 조회 ───────────

    /**
     * 시나리오 1-A: INVENTORY 권한으로 알림 목록 조회 — 부족 3건 반환.
     *
     * <p>V8 seed 기준: BELOW 상태는 CFG-002/003/004 3건.
     * 정상 상태 CFG-001/005 는 응답에 포함되지 않아야 한다.
     */
    @Test
    void listAlerts_inventoryRole_returnsBelowItems() throws Exception {
        mockMvc.perform(get("/inventory/alerts/safety-stock")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "INVENTORY"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").isArray())
                .andExpect(jsonPath("$.data.length()").value(3));
    }

    /**
     * 시나리오 1-B: MANAGER 권한도 알림 목록 조회 가능 (200).
     */
    @Test
    void listAlerts_managerRole_returns200() throws Exception {
        mockMvc.perform(get("/inventory/alerts/safety-stock")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER"))
                .andExpect(status().isOk());
    }

    /**
     * 시나리오 1-C: MASTER 권한도 알림 목록 조회 가능 (200).
     */
    @Test
    void listAlerts_masterRole_returns200() throws Exception {
        mockMvc.perform(get("/inventory/alerts/safety-stock")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER"))
                .andExpect(status().isOk());
    }

    /**
     * 시나리오 1-D: 알림 응답 필드 검증 — productId / warehouseId / threshold / currentQty / shortage 존재.
     */
    @Test
    void listAlerts_responseFields_containsExpectedKeys() throws Exception {
        MvcResult result = mockMvc.perform(get("/inventory/alerts/safety-stock")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "INVENTORY"))
                .andExpect(status().isOk())
                .andReturn();

        var dataNode = objectMapper.readTree(result.getResponse().getContentAsString())
                .get("data");

        assertThat(dataNode.isArray()).isTrue();
        assertThat(dataNode.size()).isGreaterThan(0);

        var first = dataNode.get(0);
        assertThat(first.has("productId")).isTrue();
        assertThat(first.has("warehouseId")).isTrue();
        assertThat(first.has("threshold")).isTrue();
        assertThat(first.has("currentQty")).isTrue();
        assertThat(first.has("shortage")).isTrue();
    }

    /**
     * 시나리오 1-E: shortage = threshold - currentQty 양수 검증.
     */
    @Test
    void listAlerts_shortage_isPositiveForBelowItems() throws Exception {
        MvcResult result = mockMvc.perform(get("/inventory/alerts/safety-stock")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "INVENTORY"))
                .andExpect(status().isOk())
                .andReturn();

        var dataNode = objectMapper.readTree(result.getResponse().getContentAsString())
                .get("data");

        for (int i = 0; i < dataNode.size(); i++) {
            int shortage = dataNode.get(i).get("shortage").asInt();
            assertThat(shortage).isPositive();
        }
    }

    // ─────────── 시나리오 2: SALES 권한 → 403 ───────────

    /**
     * 시나리오 2-A: SALES 권한은 알림 목록 조회 불가 (403).
     */
    @Test
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

    /**
     * 시나리오 2-B: SALES 권한은 임계값 설정 불가 (403).
     */
    @Test
    void setSafetyStock_salesRole_returns403() throws Exception {
        Map<String, Object> req = Map.of("warehouseId", WH_HQ_001.toString(),
                "threshold", 50, "scopeMode", "SELECTED");

        Mockito.when(dynamicPermissionClient.check(
                        Mockito.any(UUID.class),
                        Mockito.eq("inventory.safety-stock"),
                        Mockito.eq(PermissionAction.UPDATE)))
                .thenReturn(false);

        mockMvc.perform(post("/inventory/products/" + PROD_001 + "/safety-stock")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isForbidden());
    }

    // ─────────── 시나리오 3: 임계값 설정 (POST) ───────────

    /**
     * 시나리오 3-A: INVENTORY 권한으로 신규 제품 임계값 설정 — 201 + id/productId/threshold 반환.
     */
    @Test
    void setSafetyStock_newProduct_returns201() throws Exception {
        UUID newProductId = UUID.randomUUID();
        Map<String, Object> req = new HashMap<>();
        req.put("warehouseId", WH_HQ_001.toString());
        req.put("threshold", 20);
        req.put("note", "P13 IT 신규 설정 검증");
        req.put("scopeMode", "SELECTED");

        mockMvc.perform(post("/inventory/products/" + newProductId + "/safety-stock")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "INVENTORY")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.id").exists())
                .andExpect(jsonPath("$.data.productId").value(newProductId.toString()))
                .andExpect(jsonPath("$.data.warehouseId").value(OpaqueUuidSerializer.encode(WH_HQ_001)))
                .andExpect(jsonPath("$.data.threshold").value(20))
                .andExpect(jsonPath("$.data.note").value("P13 IT 신규 설정 검증"));
    }

    /**
     * 시나리오 3-B: 동일 (productId, warehouseId) 재요청 → upsert 갱신, 201 + threshold 변경 반영.
     */
    @Test
    void setSafetyStock_existingConfig_upsertUpdatesThreshold() throws Exception {
        // PROD_002 + HQ-001 은 V8 seed (threshold=50) 에 존재 → 30 으로 갱신
        Map<String, Object> req = Map.of(
                "warehouseId", WH_HQ_001.toString(),
                "threshold", 30,
                "note", "갱신 검증",
                "scopeMode", "SELECTED");

        mockMvc.perform(post("/inventory/products/" + PROD_002 + "/safety-stock")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "INVENTORY")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.threshold").value(30))
                .andExpect(jsonPath("$.data.productId").value(PROD_002.toString()));
    }

    /**
     * 시나리오 3-C: threshold 음수 → 400 (Bean Validation @Min(0)).
     */
    @Test
    void setSafetyStock_negativeThreshold_returns400() throws Exception {
        Map<String, Object> req = Map.of(
                "warehouseId", WH_HQ_001.toString(),
                "threshold", -1,
                "scopeMode", "SELECTED");

        mockMvc.perform(post("/inventory/products/" + PROD_001 + "/safety-stock")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "INVENTORY")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isBadRequest());
    }

    /**
     * 시나리오 3-D: threshold = 0 설정 → 201 (알림 비활성화 허용).
     */
    @Test
    void setSafetyStock_zeroThreshold_returns201() throws Exception {
        UUID newProductId = UUID.randomUUID();
        Map<String, Object> req = Map.of(
                "warehouseId", WH_VH_001.toString(),
                "threshold", 0,
                "scopeMode", "SELECTED");

        mockMvc.perform(post("/inventory/products/" + newProductId + "/safety-stock")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "INVENTORY")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.threshold").value(0));
    }

    // ─────────── 시나리오 4: 설정 후 알림 목록 반영 확인 ───────────

    /**
     * 시나리오 4-A: 신규 제품 임계값 설정 후 — threshold &gt; currentQty(=0, balance 없음) 이면
     * 알림 목록 건수 증가. currentQty=0, threshold=5 → BELOW 조건 충족.
     */
    @Test
    void setSafetyStock_thenListAlerts_newAlertAppearsForNewProduct() throws Exception {
        // 1) 기준 알림 건수 (seed 기준 3건)
        MvcResult before = mockMvc.perform(get("/inventory/alerts/safety-stock")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "INVENTORY"))
                .andExpect(status().isOk())
                .andReturn();
        int beforeCount = objectMapper.readTree(before.getResponse().getContentAsString())
                .get("data").size();

        // 2) 신규 제품(balance 없음 → currentQty=0) threshold=5 설정 → 즉시 BELOW
        UUID newProductId = UUID.randomUUID();
        Map<String, Object> req = Map.of(
                "warehouseId", WH_HQ_001.toString(),
                "threshold", 5,
                "note", "P13 알림 반영 검증",
                "scopeMode", "SELECTED");

        mockMvc.perform(post("/inventory/products/" + newProductId + "/safety-stock")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "INVENTORY")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated());

        // 3) 알림 건수 1 증가 확인
        MvcResult after = mockMvc.perform(get("/inventory/alerts/safety-stock")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "INVENTORY"))
                .andExpect(status().isOk())
                .andReturn();
        int afterCount = objectMapper.readTree(after.getResponse().getContentAsString())
                .get("data").size();

        assertThat(afterCount).isEqualTo(beforeCount + 1);
    }

    /**
     * 시나리오 4-B: 기존 BELOW 항목 threshold 를 현재 재고 이하로 낮추면 알림에서 제외.
     *
     * <p>CFG-003: HQ-001+PROD-003 availableQty=27, threshold=30 → BELOW.
     * threshold 를 27 이하로 갱신하면 알림에서 제외되어 전체 건수 감소.
     */
    @Test
    void setSafetyStock_lowerThreshold_reducesAlertCount() throws Exception {
        // 1) 기준 알림 건수
        MvcResult before = mockMvc.perform(get("/inventory/alerts/safety-stock")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "INVENTORY"))
                .andExpect(status().isOk())
                .andReturn();
        int beforeCount = objectMapper.readTree(before.getResponse().getContentAsString())
                .get("data").size();

        // 2) CFG-003 (HQ-001+PROD-003, availableQty=27) threshold → 20 (정상으로 전환)
        Map<String, Object> req = Map.of(
                "warehouseId", WH_HQ_001.toString(),
                "threshold", 20,
                "scopeMode", "SELECTED");

        mockMvc.perform(post("/inventory/products/" + PROD_003 + "/safety-stock")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "INVENTORY")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated());

        // 3) 알림 건수 1 감소
        MvcResult after = mockMvc.perform(get("/inventory/alerts/safety-stock")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "INVENTORY"))
                .andExpect(status().isOk())
                .andReturn();
        int afterCount = objectMapper.readTree(after.getResponse().getContentAsString())
                .get("data").size();

        assertThat(afterCount).isEqualTo(beforeCount - 1);
    }

    // ─────────── 시나리오 5: 인증 없음 ───────────

    /**
     * 시나리오 5: 헤더 미설정 → 403.
     */
    @Test
    void listAlerts_unauthenticated_returns403() throws Exception {
        mockMvc.perform(get("/inventory/alerts/safety-stock"))
                .andExpect(status().isForbidden());
    }

    // ─────────── 시나리오 6: WAREHOUSE 권한 + count 엔드포인트 (TM PR #143 추가) ───────────

    /**
     * 시나리오 6-A: WAREHOUSE 권한도 알림 목록 조회 가능 (200) — FE
     * `safetyStockApi.SAFETY_STOCK_ROLES` 정합.
     */
    @Test
    void listAlerts_warehouseRole_returns200() throws Exception {
        mockMvc.perform(get("/inventory/alerts/safety-stock")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk());
    }

    /**
     * 시나리오 6-B: count 엔드포인트가 BELOW 건수 3 을 반환한다 (V8 seed 기준).
     */
    @Test
    void alertCount_inventoryRole_returnsBelowCount() throws Exception {
        mockMvc.perform(get("/inventory/alerts/safety-stock/count")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "INVENTORY"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.count").value(3));
    }

    /**
     * 시나리오 6-C: count 엔드포인트도 SALES → 403.
     */
    @Test
    void alertCount_salesRole_returns403() throws Exception {
        Mockito.when(dynamicPermissionClient.check(
                        Mockito.any(UUID.class),
                        Mockito.eq("inventory.safety-stock"),
                        Mockito.eq(PermissionAction.VIEW)))
                .thenReturn(false);

        mockMvc.perform(get("/inventory/alerts/safety-stock/count")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isForbidden());
    }
}
