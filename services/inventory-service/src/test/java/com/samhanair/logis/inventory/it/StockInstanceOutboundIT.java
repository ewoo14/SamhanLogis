package com.samhanair.logis.inventory.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.inventory.InventoryServiceApplication;
import com.samhanair.logis.inventory.client.ProductClient;
import com.samhanair.logis.inventory.client.ProductSummary;
import com.samhanair.logis.inventory.domain.StockInstance;
import com.samhanair.logis.inventory.domain.StockInstanceStatus;
import com.samhanair.logis.inventory.repository.StockInstanceRepository;
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
import org.springframework.test.web.servlet.ResultActions;

/**
 * S3 인스턴스 출고연동 API 통합 테스트.
 *
 * <p>실 Testcontainers Postgres 에 stock_instances 를 저장하고, ProductClient 만 {@code @MockBean}
 * 으로 격리한다. 창고 시드 의존을 피하기 위해 테스트 전용 warehouse UUID 를 직접 사용한다.
 */
@SpringBootTest(classes = InventoryServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class StockInstanceOutboundIT extends AbstractPostgresIT {

    private static final String MASTER_ROLE = "MASTER";
    private static final String SERIAL_CODE = "AC-S3-IT";
    private static final String BATCH_CODE = "PIPE-S3-IT";
    private static final String CLEANUP_USER = "StockInstanceOutboundIT";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

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

    @BeforeEach
    void setUp() {
        cleanup();
        warehouseId = UUID.fromString("00000000-0000-0000-0000-00000000s301".replace("s", "5"));
        serialProductId = UUID.randomUUID();
        batchProductId = UUID.randomUUID();
        Mockito.lenient().when(productClient.requireExistsByCode(SERIAL_CODE)).thenReturn(
                new ProductSummary(serialProductId, "S3 에어컨", "S3-AC", SERIAL_CODE,
                        null, new BigDecimal("500000"), "ACTIVE", true));
        Mockito.lenient().when(productClient.requireExistsByCode(BATCH_CODE)).thenReturn(
                new ProductSummary(batchProductId, "S3 배관", "S3-PIPE", BATCH_CODE,
                        null, new BigDecimal("10000"), "ACTIVE", false));
    }

    @AfterEach
    void tearDown() {
        cleanup();
    }

    @Test
    @DisplayName("reserve-batch: received_at ASC FIFO로 오래된 2개만 RESERVED 처리한다")
    void reserveBatch_reservesOldestAvailableInstances() throws Exception {
        seedAvailable(3);

        postReserve("S3-OUT-001", 2)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()", is(2)))
                .andExpect(jsonPath("$.data[0].status", is("RESERVED")));

        List<StockInstance> all = stockInstanceRepository
                .findByProductCodeAndWarehouseIdAndStatusOrderByReceivedAtAsc(
                        SERIAL_CODE, warehouseId, StockInstanceStatus.RESERVED);
        assertThat(all).hasSize(2);
        assertThat(all).extracting(StockInstance::getInboundSlipNo)
                .containsExactly("S3-IN-1", "S3-IN-2");
        assertThat(all).allSatisfy(i -> assertThat(i.getOutboundSlipNo()).isEqualTo("S3-OUT-001"));
    }

    @Test
    @DisplayName("reserve-batch: 가용 인스턴스 부족이면 409 및 예약 0건")
    void reserveBatch_shortageReturns409WithoutReservation() throws Exception {
        seedAvailable(1);

        postReserve("S3-OUT-002", 2)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message", containsString("재고 부족")));

        assertThat(stockInstanceRepository.countByOutboundSlipNoAndProductCodeAndStatus(
                "S3-OUT-002", SERIAL_CODE, StockInstanceStatus.RESERVED)).isZero();
    }

    @Test
    @DisplayName("reserve-batch: 동일 요청 재호출은 추가 예약 없이 멱등")
    void reserveBatch_sameRequestIsIdempotent() throws Exception {
        seedAvailable(3);

        postReserve("S3-OUT-003", 2).andExpect(status().isOk());
        postReserve("S3-OUT-003", 2).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()", is(2)));

        assertThat(stockInstanceRepository.countByOutboundSlipNoAndProductCodeAndStatus(
                "S3-OUT-003", SERIAL_CODE, StockInstanceStatus.RESERVED)).isEqualTo(2);
    }

    @Test
    @DisplayName("ship-batch: RESERVED → SHIPPED + 출고처/전표/일시 기록")
    void shipBatch_shipsReservedInstances() throws Exception {
        seedAvailable(2);
        postReserve("S3-OUT-004", 2).andExpect(status().isOk());

        mockMvc.perform(post("/inventory/instances/ship-batch")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", MASTER_ROLE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(shipBody("S3-OUT-004", "P-S3-001"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()", is(2)))
                .andExpect(jsonPath("$.data[0].status", is("SHIPPED")));

        List<StockInstance> shipped = stockInstanceRepository
                .findByOutboundSlipNoAndProductCodeAndStatus(
                        "S3-OUT-004", SERIAL_CODE, StockInstanceStatus.SHIPPED);
        assertThat(shipped).hasSize(2);
        assertThat(shipped).allSatisfy(i -> {
            assertThat(i.getOutboundPartnerCode()).isEqualTo("P-S3-001");
            assertThat(i.getOutboundAt()).isEqualTo(LocalDateTime.of(2026, 6, 2, 15, 0));
        });
    }

    @Test
    @DisplayName("release-batch: RESERVED → AVAILABLE + outboundSlipNo null")
    void releaseBatch_releasesReservedInstances() throws Exception {
        seedAvailable(2);
        postReserve("S3-OUT-005", 2).andExpect(status().isOk());

        mockMvc.perform(post("/inventory/instances/release-batch")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", MASTER_ROLE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(releaseBody("S3-OUT-005"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()", is(2)));

        assertThat(stockInstanceRepository.countByOutboundSlipNoAndProductCodeAndStatus(
                "S3-OUT-005", SERIAL_CODE, StockInstanceStatus.RESERVED)).isZero();
        assertThat(stockInstanceRepository.countByProductCodeAndWarehouseIdAndStatus(
                SERIAL_CODE, warehouseId, StockInstanceStatus.AVAILABLE)).isEqualTo(2);
    }

    @Test
    @DisplayName("reserve-batch: batch 품목(serialManaged=false)은 409")
    void reserveBatch_batchProductReturns409() throws Exception {
        mockMvc.perform(post("/inventory/instances/reserve-batch")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", MASTER_ROLE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(reserveBody(BATCH_CODE, "S3-OUT-006", 1))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code", is("CONFLICT")))
                .andExpect(jsonPath("$.message", containsString("batch")));
    }

    private ResultActions postReserve(String outboundSlipNo, int quantity) throws Exception {
        return mockMvc.perform(post("/inventory/instances/reserve-batch")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", MASTER_ROLE)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(reserveBody(SERIAL_CODE, outboundSlipNo, quantity))));
    }

    private Map<String, Object> reserveBody(String productCode, String outboundSlipNo, int quantity) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("productCode", productCode);
        body.put("warehouseId", warehouseId.toString());
        body.put("quantity", quantity);
        body.put("outboundSlipNo", outboundSlipNo);
        return body;
    }

    private Map<String, Object> shipBody(String outboundSlipNo, String partnerCode) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("outboundSlipNo", outboundSlipNo);
        body.put("productCode", SERIAL_CODE);
        body.put("partnerCode", partnerCode);
        body.put("outboundAt", LocalDateTime.of(2026, 6, 2, 15, 0).toString());
        return body;
    }

    private Map<String, Object> releaseBody(String outboundSlipNo) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("outboundSlipNo", outboundSlipNo);
        body.put("productCode", SERIAL_CODE);
        return body;
    }

    private void seedAvailable(int count) {
        for (int i = 1; i <= count; i++) {
            stockInstanceRepository.save(StockInstance.inbound(
                    serialProductId, SERIAL_CODE, warehouseId, "구매",
                    LocalDateTime.of(2026, 6, i, 9, 0),
                    new BigDecimal("500000"), "S3-IN-" + i));
        }
    }

    private void cleanup() {
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        tx.executeWithoutResult(status -> jdbcTemplate.update("""
                UPDATE stock_instances
                   SET is_deleted = true,
                       deleted_at = CURRENT_TIMESTAMP,
                       deleted_by = ?
                 WHERE is_deleted = false
                   AND (product_code IN (?, ?)
                        OR inbound_slip_no LIKE 'S3-IN-%'
                        OR outbound_slip_no LIKE 'S3-OUT-%')
                """, CLEANUP_USER, SERIAL_CODE, BATCH_CODE));
    }
}
