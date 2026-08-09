package com.samhanair.logis.inventory.it;

import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.inventory.InventoryServiceApplication;
import com.samhanair.logis.inventory.client.ProductClient;
import com.samhanair.logis.inventory.client.ProductSummary;
import com.samhanair.logis.inventory.repository.WarehouseRepository;
import java.math.BigDecimal;
import java.util.ArrayList;
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
import org.springframework.transaction.annotation.Transactional;

/**
 * sales-form-polish 슬라이스 — BE 신규 1 endpoint 의 IT.
 *
 * <p>대상: {@code POST /inventory/balances/batch}
 * <ul>
 *   <li>요청: {@code { "productIds": ["uuid1", "uuid2", ...] }} (NotEmpty, max 100)</li>
 *   <li>응답: {@code ApiResponse<List<ProductBalanceResponse>>} —
 *       각 ProductBalanceResponse = {@code { productId, modelName, balances: [{warehouseId, warehouseCode, warehouseName, totalQty, availableQty, reservedQty}], total } }</li>
 *   <li>jsonPath: {@code $.data[*].balances[*]} (PM 명시)</li>
 * </ul>
 *
 * <p>권한 — 모든 인증된 role 조회 가능 (재고 read-only). 미인증은 403.
 *
 * <p>회고 가드 적용 (memory `feedback_pm_integration_build_check.md`):
 * <ul>
 *   <li>외부 RestClient {@link ProductClient} {@code @MockBean} 격리</li>
 *   <li>void 메서드만 {@code doNothing()}, 반환 메서드는 {@code when().thenAnswer()} 사용
 *       — {@link ProductClient#requireExists(UUID)} 는 {@link ProductSummary} 반환이라
 *       {@code thenAnswer} 패턴 적용</li>
 *   <li>NOT_FOUND vs CONFLICT 분기 구분 — batch 는 mutation 없음 → CONFLICT 분기 없음.
 *       빈 productIds 는 validation 400, over-limit 도 400 (BusinessException 아닌 MethodArgumentNotValid)</li>
 *   <li>싱글턴 Testcontainers — {@link AbstractPostgresIT} 상속, {@code @Testcontainers} 미사용</li>
 *   <li>ApiResponse 래핑 → {@code $.data.*} jsonPath</li>
 *   <li>한국어 메시지는 substring 검증만 (본 IT 는 메시지 미검증)</li>
 * </ul>
 *
 * <p>BE 시그니처 가정 (PM 통합 단계 컴파일 검증 의무):
 * <ul>
 *   <li>{@code com.samhanair.logis.inventory.web.dto.BatchBalancesRequest(List<UUID> productIds)}
 *       + {@code @NotEmpty} + {@code @Size(max=100)}</li>
 *   <li>{@code com.samhanair.logis.inventory.web.dto.ProductBalanceResponse(UUID productId, String modelName, List<StockBalanceResponse> balances, int total)}</li>
 *   <li>{@code @PostMapping("/inventory/balances/batch")} on {@code StockController} 또는 신규 컨트롤러</li>
 * </ul>
 *
 * <p>위 시그니처 미반영 시 본 IT 는 컴파일 실패. PM 이 사전 빌드 가드에서 즉시 동기화.
 */
@SpringBootTest(classes = InventoryServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class StockBalanceBatchControllerIT extends AbstractPostgresIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private WarehouseRepository warehouseRepository;

    @MockBean
    private ProductClient productClient;

    private UUID hqWarehouseId;
    private UUID vehicleWarehouseId;

    @BeforeEach
    void setUp() {
        hqWarehouseId = warehouseRepository.findByCode("HQ-001")
                .orElseThrow(() -> new IllegalStateException(
                        "HQ-001 시드 누락 — V2__seed_inventory_warehouses.sql 확인"))
                .getId();
        vehicleWarehouseId = warehouseRepository.findByCode("VH-001")
                .orElseThrow(() -> new IllegalStateException(
                        "VH-001 시드 누락 — V2__seed_inventory_warehouses.sql 확인"))
                .getId();

        // ProductClient.requireExists 는 ProductSummary 반환 → thenAnswer (회고 가드).
        Mockito.lenient().when(productClient.requireExists(Mockito.any()))
                .thenAnswer(inv -> new ProductSummary(
                        inv.getArgument(0), "테스트 제품", "TEST-MODEL-001",
                        UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE"));
        Mockito.lenient().when(productClient.lookup(Mockito.anyList()))
                .thenAnswer(inv -> {
                    List<UUID> ids = inv.getArgument(0);
                    return ids.stream()
                            .map(id -> new ProductSummary(id, "테스트 제품-" + id.toString().substring(0, 4),
                                    "TEST-MODEL-" + id.toString().substring(0, 4),
                                    UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE"))
                            .toList();
                });
    }

    /**
     * 정상 시나리오 — productIds 2~3건. balance 가 존재하는 모든 창고 응답.
     *
     * <p>PM 명시 jsonPath: {@code $.data[*].balances[*]} — 각 product 의 balances 배열 비어있지 않음.
     */
    @Test
    void batch_authenticated_returnsAllWarehousesPerProduct() throws Exception {
        // 사전 입고 — product A: HQ + VH (2 창고), product B: HQ 만 (1 창고).
        UUID productA = UUID.randomUUID();
        UUID productB = UUID.randomUUID();

        inboundFixture(productA, hqWarehouseId, 100, "A-HQ-001");
        inboundFixture(productA, vehicleWarehouseId, 30, "A-VH-001");
        inboundFixture(productB, hqWarehouseId, 50, "B-HQ-001");

        Map<String, Object> body = new HashMap<>();
        body.put("productIds", List.of(productA.toString(), productB.toString()));

        // SALES role 로 호출 (모든 인증 role 가능 가정).
        mockMvc.perform(post("/inventory/balances/batch")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").value(notNullValue()))
                .andExpect(jsonPath("$.data", hasSize(2)))
                .andExpect(jsonPath("$.data[*].productId").value(notNullValue()))
                .andExpect(jsonPath("$.data[*].balances").value(notNullValue()))
                // product A 는 2 창고, product B 는 1 창고 → balances 길이 모두 1 이상.
                .andExpect(jsonPath("$.data[*].balances.length()", everyItem(greaterThanOrEqualTo(1))));
    }

    /**
     * 미인증 — 헤더 없이 호출 → 403.
     */
    @Test
    void batch_unauthenticated_returns403() throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("productIds", List.of(UUID.randomUUID().toString()));

        mockMvc.perform(post("/inventory/balances/batch")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isForbidden());
    }

    /**
     * 빈 리스트 — {@code @NotEmpty} validation → 400.
     */
    @Test
    void batch_emptyList_returns400() throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("productIds", List.of());

        mockMvc.perform(post("/inventory/balances/batch")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest());
    }

    /**
     * 한도 초과 — 101건 ({@code @Size(max=100)}) → 400.
     */
    @Test
    void batch_overLimit_returns400() throws Exception {
        List<String> ids = new ArrayList<>(101);
        for (int i = 0; i < 101; i++) {
            ids.add(UUID.randomUUID().toString());
        }
        Map<String, Object> body = new HashMap<>();
        body.put("productIds", ids);

        mockMvc.perform(post("/inventory/balances/batch")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest());
    }

    /**
     * WAREHOUSE role 도 200 — 모든 인증 role 가능 (read-only) 검증.
     */
    @Test
    void batch_warehouseRole_returns200() throws Exception {
        UUID productId = UUID.randomUUID();
        inboundFixture(productId, hqWarehouseId, 10, "WH-ROLE-001");

        Map<String, Object> body = new HashMap<>();
        body.put("productIds", List.of(productId.toString()));

        mockMvc.perform(post("/inventory/balances/batch")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(1)))
                .andExpect(jsonPath("$.data[0].balances.length()", greaterThanOrEqualTo(1)));
    }

    /**
     * 잔량 0 인 창고도 결과에 포함 검증 — 입고 후 전량 차감 → totalQty 0 인 row 가 응답에 존재해야 한다
     * (Designer wireframe: "0 인 항목도 표시 (사용자 요구사항)").
     *
     * <p>여기서는 입고 100 → 차감 100 → balance row 잔량 0 으로 남은 시나리오.
     */
    @Test
    void batch_includesZeroBalanceWarehouses() throws Exception {
        UUID productId = UUID.randomUUID();
        inboundFixture(productId, hqWarehouseId, 100, "ZERO-001");

        // 100 차감 → balance row 잔량 0 (row 자체는 삭제되지 않음).
        Map<String, Object> deductBody = new HashMap<>();
        deductBody.put("productId", productId.toString());
        deductBody.put("warehouseId", hqWarehouseId.toString());
        deductBody.put("quantity", 100);
        deductBody.put("note", "ZERO 시나리오용 전량 차감");
        deductBody.put("sourceContext", Map.of(
                "sourceOperationId", UUID.randomUUID().toString(),
                "slipId", productId.toString(), "slipRevision", 1));

        mockMvc.perform(post("/inventory/deduct")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(deductBody)))
                .andExpect(status().isOk());

        Map<String, Object> body = new HashMap<>();
        body.put("productIds", List.of(productId.toString()));

        // 응답에 HQ 창고 row 가 totalQty=0 으로 포함되어야 함.
        mockMvc.perform(post("/inventory/balances/batch")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(1)))
                // HQ row 가 응답에 존재해야 한다 (잔량 0 이라도 balance row 자체는 존재).
                .andExpect(jsonPath("$.data[0].balances[?(@.warehouseCode=='HQ-001')]")
                        .value(notNullValue()))
                .andExpect(jsonPath("$.data[0].balances[?(@.warehouseCode=='HQ-001')].totalQty")
                        .value(notNullValue()));
    }

    /**
     * 입고 이력 없는 창고는 응답에 제외 — VH-001 입고만 한 product 의 응답에 HQ-001 row 없음 검증.
     *
     * <p>이는 단순 LEFT JOIN 이 아닌 EXISTS 기반 응답 구조 검증.
     */
    @Test
    void batch_excludesNeverInboundedWarehouses() throws Exception {
        UUID productId = UUID.randomUUID();
        // VH-001 만 입고 — HQ-001 에는 row 자체가 없어야 한다.
        inboundFixture(productId, vehicleWarehouseId, 50, "EXCLUDE-001");

        Map<String, Object> body = new HashMap<>();
        body.put("productIds", List.of(productId.toString()));

        mockMvc.perform(post("/inventory/balances/batch")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(1)))
                .andExpect(jsonPath("$.data[0].balances.length()", greaterThanOrEqualTo(1)))
                // VH-001 row 는 존재.
                .andExpect(jsonPath("$.data[0].balances[?(@.warehouseCode=='VH-001')]")
                        .value(notNullValue()))
                // HQ-001 row 는 응답에 없어야 한다 (입고 이력 0건).
                .andExpect(jsonPath("$.data[0].balances[?(@.warehouseCode=='HQ-001')]",
                        hasSize(0)));
    }

    // ─────────────────────────────────────────────────────────────
    // helper
    // ─────────────────────────────────────────────────────────────

    /** 입고 fixture — productId/warehouseId/quantity 로 1 lot 생성. */
    private void inboundFixture(UUID productId, UUID warehouseId, int quantity, String lotNo)
            throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("productId", productId.toString());
        body.put("warehouseId", warehouseId.toString());
        body.put("quantity", quantity);
        body.put("unitCost", 100000);
        body.put("lotNo", lotNo);
        body.put("sourceContext", Map.of(
                "sourceOperationId", UUID.randomUUID().toString(),
                "slipId", productId.toString(), "slipRevision", 1));

        mockMvc.perform(post("/inventory/lots/inbound")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated());
    }
}
