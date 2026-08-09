package com.samhanair.logis.inventory.it;

import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.inventory.InventoryServiceApplication;
import com.samhanair.logis.inventory.client.ProductClient;
import com.samhanair.logis.inventory.client.ProductSummary;
import com.samhanair.logis.inventory.repository.WarehouseRepository;
import java.math.BigDecimal;
import java.util.LinkedHashMap;
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
 * Phase 2.6c — reserve 멱등 가드 + 가용/실/예약 재고 조회 + warehouseCode 역조회 IT.
 *
 * <p>시나리오:
 * <ol>
 *   <li>warehouseCode 역조회 (by-code) — 성공 및 NOT_FOUND</li>
 *   <li>reserve 정상 — availableQty 감소, reservedQty 증가</li>
 *   <li>reserve 멱등 — 동일 (referenceType, referenceId, productId) 2회 호출 → 1회 효과</li>
 *   <li>가용 부족 409 — availableQty < 요청 수량</li>
 *   <li>release 후 가용 복원 — reservedQty 감소, availableQty 복원</li>
 *   <li>재고 조회 (balances) — availableQty / reservedQty / totalQty 구분 노출</li>
 * </ol>
 */
@SpringBootTest(classes = InventoryServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class Phase26cReserveIT extends AbstractPostgresIT {

    private static final String INTERNAL_TOKEN = "test-internal-token";
    private static final String MASTER_ROLE = "MASTER";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private WarehouseRepository warehouseRepository;

    @MockBean
    private ProductClient productClient;

    private UUID warehouseId;
    private String warehouseCode;
    private UUID productId;

    @BeforeEach
    void setUp() {
        // 첫 번째 활성 창고를 테스트 창고로 사용
        var warehouses = warehouseRepository.findAllByIsDeletedFalseOrderByDisplayOrderAsc();
        if (warehouses.isEmpty()) {
            return;
        }
        var warehouse = warehouses.get(0);
        warehouseId = warehouse.getId();
        warehouseCode = warehouse.getCode();
        productId = UUID.randomUUID();

        // ProductClient mock — requireExists 는 ProductSummary 반환 메서드(void 아님).
        // doNothing() 대신 thenReturn 으로 stub 해야 MockitoException 방지.
        ProductSummary stubProduct = new ProductSummary(
                productId, "테스트 제품", "TEST-MODEL",
                null, BigDecimal.valueOf(10000), "ACTIVE"); // 6-arg 호환 생성자 사용
        Mockito.lenient().when(productClient.requireExists(Mockito.any()))
                .thenReturn(stubProduct);
        Mockito.lenient().when(productClient.lookup(Mockito.anyList()))
                .thenReturn(java.util.List.of(stubProduct));
    }

    // ─────────────────────────────────────────────────
    // T1: warehouseCode 역조회 internal endpoint
    // ─────────────────────────────────────────────────

    @Test
    @DisplayName("T1-1: warehouseCode 역조회 — 성공 (200)")
    void byCode_success() throws Exception {
        var warehouses = warehouseRepository.findAllByIsDeletedFalseOrderByDisplayOrderAsc();
        if (warehouses.isEmpty()) return;

        mockMvc.perform(get("/internal/inventory/warehouses/by-code")
                        .param("code", warehouseCode)
                        .header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.code", is(warehouseCode)))
                .andExpect(jsonPath("$.data.warehouseId", notNullValue()));
    }

    @Test
    @DisplayName("T1-2: warehouseCode 역조회 — 없는 코드 404")
    void byCode_notFound() throws Exception {
        mockMvc.perform(get("/internal/inventory/warehouses/by-code")
                        .param("code", "NON_EXISTENT_CODE_XYZ")
                        .header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("T1-3: warehouseCode internal endpoint는 X-User-* 위조만으로 접근 불가")
    void byCode_rejectsForgedUserHeadersWithoutInternalToken() throws Exception {
        mockMvc.perform(get("/internal/inventory/warehouses/by-code")
                        .param("code", "NON_EXISTENT_CODE_XYZ")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", MASTER_ROLE))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("T1-4: warehouseCode internal endpoint는 X-Internal-Token 누락 시 접근 불가")
    void byCode_rejectsMissingInternalToken() throws Exception {
        mockMvc.perform(get("/internal/inventory/warehouses/by-code")
                        .param("code", "NON_EXISTENT_CODE_XYZ"))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("T1-5: warehouseId 내부 조회 — 성공 (200)")
    void byId_success() throws Exception {
        if (warehouseId == null) return;

        mockMvc.perform(get("/internal/inventory/warehouses/{id}", warehouseId)
                        .header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.warehouseId", is(warehouseId.toString())))
                .andExpect(jsonPath("$.data.code", is(warehouseCode)))
                .andExpect(jsonPath("$.data.name", notNullValue()));
    }

    @Test
    @DisplayName("T1-6: warehouseId 내부 조회 — 없는 UUID 404")
    void byId_notFound() throws Exception {
        mockMvc.perform(get("/internal/inventory/warehouses/{id}", UUID.randomUUID())
                        .header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("T1-7: warehouseId internal endpoint는 X-Internal-Token 누락 시 접근 불가")
    void byId_rejectsMissingInternalToken() throws Exception {
        mockMvc.perform(get("/internal/inventory/warehouses/{id}", UUID.randomUUID()))
                .andExpect(status().isForbidden());
    }

    // ─────────────────────────────────────────────────
    // T2: reserve 정상 + 멱등 + 가용부족 409 + release
    // ─────────────────────────────────────────────────

    @Test
    @DisplayName("T2-1: reserve 정상 — availableQty 감소, reservedQty 증가")
    void reserve_normal() throws Exception {
        if (warehouseId == null) return;

        // 입고 먼저
        inbound(productId, warehouseId, 10);

        UUID refId = UUID.randomUUID();
        Map<String, Object> req = reserveBody(productId, warehouseId, 3,
                "PARTNER_ORDER_CONVERT", refId);

        mockMvc.perform(post("/inventory/reserve")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", MASTER_ROLE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.availableQty", is(7)))
                .andExpect(jsonPath("$.data.reservedQty", is(3)));
    }

    @Test
    @DisplayName("T2-2: reserve 멱등 — 동일 (referenceType, referenceId, productId) 2회 → 1회 효과")
    void reserve_idempotent() throws Exception {
        if (warehouseId == null) return;

        inbound(productId, warehouseId, 10);

        UUID refId = UUID.randomUUID();
        Map<String, Object> req = reserveBody(productId, warehouseId, 4,
                "PARTNER_ORDER_CONVERT", refId);

        // 1회
        mockMvc.perform(post("/inventory/reserve")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", MASTER_ROLE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.reservedQty", is(4)));

        // 2회 — no-op (reservedQty 여전히 4)
        mockMvc.perform(post("/inventory/reserve")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", MASTER_ROLE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.reservedQty", is(4)));

        // 잔량 조회로도 확인
        mockMvc.perform(get("/inventory/balances")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", MASTER_ROLE)
                        .param("productId", productId.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].reservedQty", is(4)))
                .andExpect(jsonPath("$.data.content[0].availableQty", is(6)));
    }

    @Test
    @DisplayName("T2-3: 가용 부족 409 사전차단")
    void reserve_insufficientAvailable_409() throws Exception {
        if (warehouseId == null) return;

        inbound(productId, warehouseId, 5);

        Map<String, Object> req = reserveBody(productId, warehouseId, 10,
                "PARTNER_ORDER_CONVERT", UUID.randomUUID());

        mockMvc.perform(post("/inventory/reserve")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", MASTER_ROLE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isConflict());
    }

    @Test
    @DisplayName("T2-4: release 후 가용 복원")
    void release_restoresAvailable() throws Exception {
        if (warehouseId == null) return;

        inbound(productId, warehouseId, 10);

        UUID refId = UUID.randomUUID();
        // reserve 5
        mockMvc.perform(post("/inventory/reserve")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", MASTER_ROLE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                reserveBody(productId, warehouseId, 5,
                                        "PARTNER_ORDER_CONVERT", refId))))
                .andExpect(status().isOk());

        // release 5
        Map<String, Object> releaseReq = new LinkedHashMap<>();
        releaseReq.put("productId", productId.toString());
        releaseReq.put("warehouseId", warehouseId.toString());
        releaseReq.put("quantity", 5);
        releaseReq.put("referenceType", "PARTNER_ORDER_CONVERT");
        releaseReq.put("referenceId", refId.toString());

        mockMvc.perform(post("/inventory/release")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", MASTER_ROLE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(releaseReq)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.availableQty", is(10)))
                .andExpect(jsonPath("$.data.reservedQty", is(0)));
    }

    @Test
    @DisplayName("T2-5: 재고 조회 — availableQty/reservedQty/totalQty 구분 노출")
    void balance_exposesAllThreeFields() throws Exception {
        if (warehouseId == null) return;

        inbound(productId, warehouseId, 20);

        // reserve 7
        mockMvc.perform(post("/inventory/reserve")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", MASTER_ROLE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                reserveBody(productId, warehouseId, 7,
                                        "PARTNER_ORDER_CONVERT", UUID.randomUUID()))))
                .andExpect(status().isOk());

        mockMvc.perform(get("/inventory/balances")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", MASTER_ROLE)
                        .param("productId", productId.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].availableQty", is(13)))
                .andExpect(jsonPath("$.data.content[0].reservedQty", is(7)))
                .andExpect(jsonPath("$.data.content[0].totalQty", is(20)));
    }

    // ─────────────────────────────────────────────────
    // 헬퍼
    // ─────────────────────────────────────────────────

    private void inbound(UUID productId, UUID warehouseId, int qty) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("productId", productId.toString());
        body.put("warehouseId", warehouseId.toString());
        body.put("quantity", qty);
        body.put("lotNo", "LOT-" + UUID.randomUUID().toString().substring(0, 8));
        body.put("receivedAt", "2026-01-01T00:00:00");
        body.put("sourceContext", sourceContext(productId));
        body.put("unitCost", "1000");
        body.put("note", "IT 테스트 입고");

        MvcResult result = mockMvc.perform(post("/inventory/lots/inbound")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", MASTER_ROLE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();
    }

    private Map<String, Object> reserveBody(UUID productId, UUID warehouseId, int qty,
                                             String refType, UUID refId) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("productId", productId.toString());
        m.put("warehouseId", warehouseId.toString());
        m.put("quantity", qty);
        m.put("referenceType", refType);
        m.put("referenceId", refId.toString());
        m.put("sourceContext", sourceContext(productId));
        return m;
    }

    private Map<String, Object> sourceContext(UUID productId) {
        return Map.of("sourceOperationId", UUID.randomUUID().toString(),
                "slipId", productId.toString(), "slipRevision", 1);
    }
}
