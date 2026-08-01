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

/**
 * D-LOAD-01 — productId 필터 잔량 조회의 LazyInitialization 회귀 가드.
 *
 * <p>기존 {@code GET /inventory/balances} 검증은 {@code @Transactional} 테스트 클래스 안에서
 * 실행되어 테스트 스레드의 영속성 컨텍스트가 controller DTO 매핑을 우연히 살려 두었다. 이 IT 는
 * 의도적으로 {@code @Transactional} 을 붙이지 않아 실제 HTTP 요청처럼 inbound 트랜잭션 종료 후
 * 별도 GET 요청에서 warehouse lazy proxy 를 DTO 로 접근하는 경로를 검증한다.
 */
@SpringBootTest(classes = InventoryServiceApplication.class)
@AutoConfigureMockMvc
class StockBalanceQueryLazyIT extends AbstractPostgresIT {

    private static final String MASTER_ROLE = "MASTER";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private WarehouseRepository warehouseRepository;

    @MockBean
    private ProductClient productClient;

    private UUID hqWarehouseId;

    @BeforeEach
    void setUp() {
        hqWarehouseId = warehouseRepository.findByCode("HQ-001")
                .orElseThrow(() -> new IllegalStateException(
                        "HQ-001 시드 누락 — V2__seed_inventory_warehouses.sql 확인"))
                .getId();

        Mockito.lenient().when(productClient.requireExists(Mockito.any()))
                .thenAnswer(inv -> new ProductSummary(
                        inv.getArgument(0), "부하 실측 제품", "LOAD-TEST-MODEL",
                        UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE"));
        Mockito.lenient().when(productClient.lookup(Mockito.anyList()))
                .thenAnswer(invocation -> ((List<?>) invocation.getArgument(0)).stream()
                        .map(id -> (UUID) id)
                        .map(id -> new ProductSummary(id, "테스트 품목", "MODEL-" + id,
                                UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE"))
                        .toList());
    }

    @Test
    void balances_productIdFilter_returns200WithWarehouseNameOutsideTestTransaction() throws Exception {
        UUID productId = UUID.randomUUID();
        inbound(productId, 7);

        mockMvc.perform(get("/inventory/balances")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", MASTER_ROLE)
                        .param("productId", productId.toString())
                        .param("page", "0")
                        .param("size", "5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].warehouseCode", is("HQ-001")))
                .andExpect(jsonPath("$.data.content[0].warehouseName", notNullValue()))
                .andExpect(jsonPath("$.data.content[0].availableQty", is(7)));
    }

    @Test
    void balances_withoutProductId_returns200ForWholeInventoryPage() throws Exception {
        UUID productId = UUID.randomUUID();
        inbound(productId, 7);

        mockMvc.perform(get("/inventory/balances")
                        .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", MASTER_ROLE)
                        .param("page", "0")
                        .param("size", "5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content").exists())
                .andExpect(jsonPath("$.data.content[0].productCode").value(
                        org.hamcrest.Matchers.startsWith("MODEL-")))
                .andExpect(jsonPath("$.data.content[0].productName").value("테스트 품목"))
                .andExpect(jsonPath("$.data.content[0].warehouseType").exists());
    }

    @Test
    void balances_warehouseFilter_returnsOnlySelectedWarehouse() throws Exception {
        UUID productId = UUID.randomUUID();
        inbound(productId, 7);

        mockMvc.perform(get("/inventory/balances")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", MASTER_ROLE)
                        .param("warehouseId", hqWarehouseId.toString())
                        .param("page", "0")
                        .param("size", "5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].warehouseCode").value("HQ-001"));
    }

    private void inbound(UUID productId, int quantity) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("productId", productId.toString());
        body.put("warehouseId", hqWarehouseId.toString());
        body.put("quantity", quantity);
        body.put("lotNo", "LOAD-LAZY-" + UUID.randomUUID().toString().substring(0, 8));
        body.put("receivedAt", "2026-06-08T00:00:00");
        body.put("unitCost", "1000");
        body.put("note", "D-LOAD-01 LazyInitialization 회귀 테스트");

        mockMvc.perform(post("/inventory/lots/inbound")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", MASTER_ROLE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated());
    }
}
