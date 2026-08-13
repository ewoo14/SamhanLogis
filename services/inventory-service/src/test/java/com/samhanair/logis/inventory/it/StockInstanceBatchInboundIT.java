package com.samhanair.logis.inventory.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.is;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.inventory.InventoryServiceApplication;
import com.samhanair.logis.inventory.client.ProductClient;
import com.samhanair.logis.inventory.client.ProductSummary;
import com.samhanair.logis.inventory.domain.StockInstanceStatus;
import com.samhanair.logis.inventory.repository.StockInstanceRepository;
import com.samhanair.logis.inventory.repository.WarehouseRepository;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * S2 인스턴스 배치 입고 API 통합 테스트.
 *
 * <p>ProductClient 는 {@code @MockBean} 으로 격리하고, 권한은 {@link AbstractPostgresIT} 의
 * DynamicPermissionClient lenient stub 으로 통과시킨다.
 */
@SpringBootTest(classes = InventoryServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class StockInstanceBatchInboundIT extends AbstractPostgresIT {

    private static final String MASTER_ROLE = "MASTER";
    private static final String CLEANUP_USER = "StockInstanceBatchInboundIT";
    private static final List<String> TEST_INBOUND_SLIP_NOS = List.of(
            "S2-INB-001",
            "S2-INB-002",
            "S2-INB-DEFICIT",
            "S2-INB-003");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private WarehouseRepository warehouseRepository;

    @Autowired
    private StockInstanceRepository stockInstanceRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @MockBean
    private ProductClient productClient;

    private UUID warehouseId;
    private UUID serialProductId;
    private UUID batchProductId;

    /**
     * 테스트 픽스처 설정 — 실제 창고 시드와 serial/batch product stub 을 구성한다.
     */
    @BeforeEach
    void setUp() {
        cleanupTestStockInstances();
        var warehouses = warehouseRepository.findAllByIsDeletedFalseOrderByDisplayOrderAsc();
        if (!warehouses.isEmpty()) {
            warehouseId = warehouses.get(0).getId();
        }
        serialProductId = UUID.randomUUID();
        batchProductId = UUID.randomUUID();

        ProductSummary serialProduct = new ProductSummary(
                serialProductId, "에어컨 테스트", "AR-S2",
                "AC-S2", null, new BigDecimal("500000"), "ACTIVE", true);
        ProductSummary batchProduct = new ProductSummary(
                batchProductId, "부자재 테스트", "PIPE-S2",
                "PIPE-S2", null, new BigDecimal("10000"), "ACTIVE", false);

        Mockito.lenient().when(productClient.requireExists(serialProductId)).thenReturn(serialProduct);
        Mockito.lenient().when(productClient.requireExists(batchProductId)).thenReturn(batchProduct);
        Mockito.lenient().when(productClient.lookup(Mockito.anyList())).thenReturn(List.of(serialProduct));
    }

    @AfterEach
    void tearDown() {
        cleanupTestStockInstances();
    }

    @Test
    @DisplayName("POST /inventory/instances/batch: serial 품목 qty=3 → 201 + 3행 AVAILABLE")
    void inboundBatch_serialProduct_createsInstances() throws Exception {
        assumeTrue(warehouseId != null, "창고 시드 없음 — 테스트 skip");

        Map<String, Object> body = batchRequest(
                serialProductId, "AC-S2", warehouseId, 3,
                "구매", "S2-INB-001", new BigDecimal("500000"));

        mockMvc.perform(post("/inventory/instances/batch")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", MASTER_ROLE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.length()", is(3)))
                .andExpect(jsonPath("$.data[0].productCode", is("AC-S2")))
                .andExpect(jsonPath("$.data[0].status", is("AVAILABLE")))
                .andExpect(jsonPath("$.data[0].inboundType", is("구매")));

        var rows = stockInstanceRepository.findByInboundSlipAndProduct("S2-INB-001", serialProductId);
        assertThat(rows).hasSize(3);
        assertThat(rows).allSatisfy(row -> {
            assertThat(row.getStatus()).isEqualTo(StockInstanceStatus.AVAILABLE);
            assertThat(row.getInboundType()).isEqualTo("구매");
        });
        assertThat(jdbcTemplate.queryForObject("""
                SELECT count(*)
                  FROM stock_movements
                 WHERE product_id = ?
                   AND movement_type = 'INBOUND'
                """, Long.class, serialProductId)).isEqualTo(3L);
    }

    @Test
    @DisplayName("POST /inventory/instances/batch: 동일 body 재요청 → count 3 유지")
    void inboundBatch_sameBody_isIdempotent() throws Exception {
        assumeTrue(warehouseId != null, "창고 시드 없음 — 테스트 skip");

        Map<String, Object> body = batchRequest(
                serialProductId, "AC-S2", warehouseId, 3,
                "구매", "S2-INB-002", new BigDecimal("500000"));

        postBatch(body);
        postBatch(body);

        assertThat(stockInstanceRepository.countByInboundSlipAndProduct("S2-INB-002", serialProductId))
                .isEqualTo(3);
    }

    @Test
    @DisplayName("POST /inventory/instances/batch: 기존 count=1 에 qty=3 재요청 → 부족분 2개만 추가")
    void inboundBatch_existingOne_addsOnlyDeficit() throws Exception {
        assumeTrue(warehouseId != null, "창고 시드 없음 — 테스트 skip");

        Map<String, Object> first = batchRequest(
                serialProductId, "AC-S2", warehouseId, 1,
                "구매", "S2-INB-DEFICIT", new BigDecimal("500000"));
        Map<String, Object> target = batchRequest(
                serialProductId, "AC-S2", warehouseId, 3,
                "구매", "S2-INB-DEFICIT", new BigDecimal("500000"));

        postBatch(first);
        assertThat(stockInstanceRepository.countByInboundSlipAndProduct("S2-INB-DEFICIT", serialProductId))
                .isEqualTo(1);

        mockMvc.perform(post("/inventory/instances/batch")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", MASTER_ROLE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(target)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.length()", is(3)));

        assertThat(stockInstanceRepository.countByInboundSlipAndProduct("S2-INB-DEFICIT", serialProductId))
                .isEqualTo(3);
        assertThat(stockInstanceRepository.findByInboundSlipAndProduct("S2-INB-DEFICIT", serialProductId))
                .hasSize(3);
    }

    @Test
    @DisplayName("POST /inventory/instances/batch: batch 품목(serialManaged=false) → 409")
    void inboundBatch_batchProduct_returns409() throws Exception {
        assumeTrue(warehouseId != null, "창고 시드 없음 — 테스트 skip");

        Map<String, Object> body = batchRequest(
                batchProductId, "PIPE-S2", warehouseId, 2,
                "구매", "S2-INB-003", new BigDecimal("10000"));

        mockMvc.perform(post("/inventory/instances/batch")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", MASTER_ROLE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code", is("CONFLICT")))
                .andExpect(jsonPath("$.message", containsString("batch")));
    }

    private void postBatch(Map<String, Object> body) throws Exception {
        mockMvc.perform(post("/inventory/instances/batch")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", MASTER_ROLE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated());
    }

    private Map<String, Object> batchRequest(UUID productId, String productCode, UUID warehouseId,
                                             int quantity, String inboundType, String inboundSlipNo,
                                             BigDecimal unitCost) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("productId", productId.toString());
        body.put("productCode", productCode);
        body.put("warehouseId", warehouseId.toString());
        body.put("quantity", quantity);
        body.put("inboundType", inboundType);
        body.put("inboundSlipNo", inboundSlipNo);
        body.put("unitCost", unitCost.toPlainString());
        body.put("receivedAt", LocalDateTime.of(2026, 6, 1, 9, 0).toString());
        body.put("sourceContext", Map.of(
                "sourceOperationId", UUID.randomUUID().toString(),
                "slipId", productId.toString(), "slipRevision", 1));
        return body;
    }

    private void cleanupTestStockInstances() {
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        tx.executeWithoutResult(status -> jdbcTemplate.update("""
                UPDATE stock_instances
                   SET is_deleted = true,
                       deleted_at = CURRENT_TIMESTAMP,
                       deleted_by = ?
                 WHERE is_deleted = false
                   AND inbound_slip_no IN (?, ?, ?, ?)
                """, CLEANUP_USER,
                TEST_INBOUND_SLIP_NOS.get(0),
                TEST_INBOUND_SLIP_NOS.get(1),
                TEST_INBOUND_SLIP_NOS.get(2),
                TEST_INBOUND_SLIP_NOS.get(3)));
    }
}
