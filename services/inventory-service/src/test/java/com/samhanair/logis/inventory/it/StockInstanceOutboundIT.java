package com.samhanair.logis.inventory.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.inventory.InventoryServiceApplication;
import com.samhanair.logis.inventory.client.ProductClient;
import com.samhanair.logis.inventory.client.ProductSummary;
import com.samhanair.logis.inventory.domain.StockInstance;
import com.samhanair.logis.inventory.domain.StockInstanceStatus;
import com.samhanair.logis.inventory.repository.StockInstanceRepository;
import com.samhanair.logis.inventory.service.StockInstanceService;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
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
import org.springframework.transaction.annotation.Propagation;
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
    private static final String LEGACY_SERIAL_CODE = "010001";
    private static final String BATCH_CODE = "PIPE-S3-IT";
    private static final String CLEANUP_USER = "StockInstanceOutboundIT";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private StockInstanceRepository stockInstanceRepository;

    @Autowired
    private StockInstanceService stockInstanceService;

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
        warehouseId = UUID.fromString("00000000-0000-0000-0000-000000005301"); // DB 무관 픽스처 전용 UUID
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

    @Test
    @DisplayName("recall-batch: outbound_at DESC 역-FIFO로 최근 출고 2개만 RECALLED 처리한다")
    void recallBatch_recallsLatestShippedInstances() throws Exception {
        seedShipped(3, "P-S4-IT-001");

        postRecall("P-S4-IT-001", "S4-RETURN-001", 2)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()", is(2)))
                .andExpect(jsonPath("$.data[0].status", is("RECALLED")))
                .andExpect(jsonPath("$.data[0].recallSlipNo", is("S4-RETURN-001")));

        List<StockInstance> recalled = stockInstanceRepository
                .findByRecallSlipNoAndProductCodeAndStatus(
                        "S4-RETURN-001", SERIAL_CODE, StockInstanceStatus.RECALLED);
        assertThat(recalled).hasSize(2);
        assertThat(recalled).extracting(StockInstance::getOutboundSlipNo)
                .containsExactlyInAnyOrder("S4-OUT-3", "S4-OUT-2");
        assertThat(stockInstanceRepository.countByOutboundPartnerCodeAndProductCodeAndStatus(
                "P-S4-IT-001", SERIAL_CODE, StockInstanceStatus.SHIPPED)).isEqualTo(1);
    }

    @Test
    @DisplayName("recall-batch: 회수 대상 부족이면 409 및 회수 0건")
    void recallBatch_shortageReturns409WithoutRecall() throws Exception {
        seedShipped(1, "P-S4-IT-002");

        postRecall("P-S4-IT-002", "S4-RETURN-002", 2)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message", containsString("회수 대상 부족")));

        assertThat(stockInstanceRepository.countByRecallSlipNoAndProductCodeAndStatus(
                "S4-RETURN-002", SERIAL_CODE, StockInstanceStatus.RECALLED)).isZero();
    }

    @Test
    @DisplayName("recall-batch: 동일 회수전표 재호출은 추가 회수 없이 멱등")
    void recallBatch_sameRequestIsIdempotent() throws Exception {
        seedShipped(3, "P-S4-IT-003");

        postRecall("P-S4-IT-003", "S4-RETURN-003", 2).andExpect(status().isOk());
        postRecall("P-S4-IT-003", "S4-RETURN-003", 2).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()", is(2)));

        assertThat(stockInstanceRepository.countByRecallSlipNoAndProductCodeAndStatus(
                "S4-RETURN-003", SERIAL_CODE, StockInstanceStatus.RECALLED)).isEqualTo(2);
        assertThat(stockInstanceRepository.countByOutboundPartnerCodeAndProductCodeAndStatus(
                "P-S4-IT-003", SERIAL_CODE, StockInstanceStatus.SHIPPED)).isEqualTo(1);
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    @DisplayName("reserve-batch: 동시 전표가 같은 후보 1건을 예약해도 row lock으로 중복 선택하지 않는다")
    void reserveBatch_concurrentRequestsDoNotSelectSameCandidate() throws Exception {
        cleanup();
        seedAvailable(1);

        List<Throwable> failures = runConcurrently(
                () -> stockInstanceService.reserveBatch(SERIAL_CODE, warehouseId, 1, "S3-OUT-LCK-1"),
                () -> stockInstanceService.reserveBatch(SERIAL_CODE, warehouseId, 1, "S3-OUT-LCK-2"));

        long conflictCount = failures.stream()
                .filter(BusinessException.class::isInstance)
                .filter(ex -> ex.getMessage().contains("재고 부족"))
                .count();
        assertThat(conflictCount).isEqualTo(1);
        assertThat(stockInstanceRepository.countByProductCodeAndWarehouseIdAndStatus(
                SERIAL_CODE, warehouseId, StockInstanceStatus.RESERVED)).isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject("""
                SELECT COUNT(DISTINCT outbound_slip_no)
                  FROM stock_instances
                 WHERE is_deleted = false
                   AND product_code = ?
                   AND status = 'RESERVED'
                """, Long.class, SERIAL_CODE)).isEqualTo(1L);
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    @DisplayName("recall-batch: 동시 회수 전표가 같은 SHIPPED 후보 1건을 중복 회수하지 않는다")
    void recallBatch_concurrentRequestsDoNotSelectSameCandidate() throws Exception {
        cleanup();
        seedShipped(1, "P-S4-LCK");

        List<Throwable> failures = runConcurrently(
                () -> stockInstanceService.recallBatch("P-S4-LCK", SERIAL_CODE, 1, "S4-RETURN-LCK-1"),
                () -> stockInstanceService.recallBatch("P-S4-LCK", SERIAL_CODE, 1, "S4-RETURN-LCK-2"));

        long conflictCount = failures.stream()
                .filter(BusinessException.class::isInstance)
                .filter(ex -> ex.getMessage().contains("회수 대상 부족"))
                .count();
        assertThat(conflictCount).isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                  FROM stock_instances
                 WHERE is_deleted = false
                   AND product_code = ?
                   AND status = 'RECALLED'
                """, Long.class, SERIAL_CODE)).isEqualTo(1L);
        assertThat(jdbcTemplate.queryForObject("""
                SELECT COUNT(DISTINCT recall_slip_no)
                  FROM stock_instances
                 WHERE is_deleted = false
                   AND product_code = ?
                   AND status = 'RECALLED'
                """, Long.class, SERIAL_CODE)).isEqualTo(1L);
    }

    @Test
    @DisplayName("unrecall-batch: RECALLED → SHIPPED 복원 및 recallSlipNo 제거")
    void unrecallBatch_restoresRecalledInstancesToShipped() throws Exception {
        seedShipped(1, "P-S4-IT-004");
        postRecall("P-S4-IT-004", "S4-RETURN-004", 1).andExpect(status().isOk());

        mockMvc.perform(post("/inventory/instances/unrecall-batch")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", MASTER_ROLE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(unrecallBody("S4-RETURN-004"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()", is(1)))
                .andExpect(jsonPath("$.data[0].status", is("SHIPPED")))
                .andExpect(jsonPath("$.data[0].outboundPartnerCode", is("P-S4-IT-004")))
                .andExpect(jsonPath("$.data[0].outboundSlipNo", is("S4-OUT-1")))
                .andExpect(jsonPath("$.data[0].outboundAt", is("2026-06-01T15:00:00")))
                .andExpect(jsonPath("$.data[0].recallSlipNo").doesNotExist());

        assertThat(stockInstanceRepository.countByRecallSlipNoAndProductCodeAndStatus(
                "S4-RETURN-004", SERIAL_CODE, StockInstanceStatus.RECALLED)).isZero();
        assertThat(stockInstanceRepository.countByOutboundPartnerCodeAndProductCodeAndStatus(
                "P-S4-IT-004", SERIAL_CODE, StockInstanceStatus.SHIPPED)).isEqualTo(1);
    }

    @Test
    @DisplayName("unrecall-batch: 최신 productId로 회수한 legacy product_code 2행도 전부 SHIPPED 복원")
    void unrecallBatch_restoresLegacyProductCodeRowsByProductId() throws Exception {
        seedShipped(2, "P-S4-LEGACY", LEGACY_SERIAL_CODE);
        postRecall("P-S4-LEGACY", "S4-RETURN-LEGACY-UNRECALL", 2)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()", is(2)));

        mockMvc.perform(post("/inventory/instances/unrecall-batch")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", MASTER_ROLE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                unrecallBody("S4-RETURN-LEGACY-UNRECALL"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()", is(2)))
                .andExpect(jsonPath("$.data[0].status", is("SHIPPED")))
                .andExpect(jsonPath("$.data[0].productId", is(serialProductId.toString())));

        assertThat(stockInstanceRepository.findByProductId(serialProductId)).filteredOn(
                instance -> instance.getProductCode().equals(LEGACY_SERIAL_CODE)
                        && instance.getStatus() == StockInstanceStatus.SHIPPED).hasSize(2);
    }

    @Test
    @DisplayName("resell-batch: RECALLED → AVAILABLE 및 회수/출고 마커 제거, received_at 재입고 시점 갱신")
    void resellBatch_restoresRecalledInstancesToAvailable() throws Exception {
        seedShipped(2, "P-S4-IT-005");
        postRecall("P-S4-IT-005", "S4-RETURN-005", 2).andExpect(status().isOk());
        LocalDateTime before = LocalDateTime.now().minusSeconds(1);

        postResell("S4-RETURN-005", 2)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()", is(2)))
                .andExpect(jsonPath("$.data[0].status", is("AVAILABLE")))
                .andExpect(jsonPath("$.data[0].recallSlipNo").doesNotExist())
                .andExpect(jsonPath("$.data[0].outboundPartnerCode").doesNotExist())
                .andExpect(jsonPath("$.data[0].outboundSlipNo").doesNotExist())
                .andExpect(jsonPath("$.data[0].outboundAt").doesNotExist());

        LocalDateTime after = LocalDateTime.now().plusSeconds(1);
        assertThat(stockInstanceRepository.countByRecallSlipNoAndProductCodeAndStatus(
                "S4-RETURN-005", SERIAL_CODE, StockInstanceStatus.RECALLED)).isZero();
        List<StockInstance> available = stockInstanceRepository
                .findByProductCodeAndWarehouseIdAndStatusOrderByReceivedAtAsc(
                        SERIAL_CODE, warehouseId, StockInstanceStatus.AVAILABLE);
        assertThat(available).hasSize(2);
        assertThat(available).allSatisfy(instance -> {
            assertThat(instance.getRecallSlipNo()).isNull();
            assertThat(instance.getOutboundPartnerCode()).isNull();
            assertThat(instance.getOutboundSlipNo()).isNull();
            assertThat(instance.getOutboundAt()).isNull();
            assertThat(instance.getReceivedAt()).isBetween(before, after);
        });

        // QA P1: @Transactional 1차 캐시가 아닌 실 DB flush 값으로 마커 null·received_at 재진입을 직접 검증.
        Integer dbResoldRows = jdbcTemplate.queryForObject("""
                SELECT count(*) FROM stock_instances
                 WHERE product_code = ? AND status = 'AVAILABLE' AND is_deleted = false
                   AND recall_slip_no IS NULL AND outbound_partner_code IS NULL
                   AND outbound_slip_no IS NULL AND outbound_at IS NULL
                   AND received_at BETWEEN ? AND ?
                """, Integer.class, SERIAL_CODE, before, after);
        assertThat(dbResoldRows).isEqualTo(2);
    }

    @Test
    @DisplayName("resell-batch: 최신 productId로 회수한 legacy product_code 2행도 전부 AVAILABLE 복원")
    void resellBatch_restoresLegacyProductCodeRowsByProductId() throws Exception {
        seedShipped(2, "P-S4-LEGACY", LEGACY_SERIAL_CODE);
        postRecall("P-S4-LEGACY", "S4-RETURN-LEGACY-RESELL", 2)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()", is(2)));

        postResell("S4-RETURN-LEGACY-RESELL", 2)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()", is(2)))
                .andExpect(jsonPath("$.data[0].status", is("AVAILABLE")))
                .andExpect(jsonPath("$.data[0].productId", is(serialProductId.toString())));

        assertThat(stockInstanceRepository.findByProductId(serialProductId)).filteredOn(
                instance -> instance.getProductCode().equals(LEGACY_SERIAL_CODE)
                        && instance.getStatus() == StockInstanceStatus.AVAILABLE
                        && instance.getRecallSlipNo() == null).hasSize(2);
    }

    @Test
    @DisplayName("resell-batch: 회수 인스턴스 부족이면 409 및 상태 변경 0건")
    void resellBatch_shortageReturns409WithoutResell() throws Exception {
        seedShipped(1, "P-S4-IT-006");
        postRecall("P-S4-IT-006", "S4-RETURN-006", 1).andExpect(status().isOk());

        postResell("S4-RETURN-006", 2)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message", containsString("재판매 대상 부족")));

        assertThat(stockInstanceRepository.countByRecallSlipNoAndProductCodeAndStatus(
                "S4-RETURN-006", SERIAL_CODE, StockInstanceStatus.RECALLED)).isEqualTo(1);
        assertThat(stockInstanceRepository.countByProductCodeAndWarehouseIdAndStatus(
                SERIAL_CODE, warehouseId, StockInstanceStatus.AVAILABLE)).isZero();
    }

    @Test
    @DisplayName("resell-batch: 동일 요청 재호출은 이미 AVAILABLE 분을 제외해 409로 수렴한다")
    void resellBatch_sameRequestRetryReturns409AfterAlreadyResold() throws Exception {
        seedShipped(1, "P-S4-IT-007");
        postRecall("P-S4-IT-007", "S4-RETURN-007", 1).andExpect(status().isOk());

        postResell("S4-RETURN-007", 1).andExpect(status().isOk());
        postResell("S4-RETURN-007", 1)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message", containsString("재판매 대상 부족")));

        assertThat(stockInstanceRepository.countByProductCodeAndWarehouseIdAndStatus(
                SERIAL_CODE, warehouseId, StockInstanceStatus.AVAILABLE)).isEqualTo(1);
        assertThat(stockInstanceRepository.countByRecallSlipNoAndProductCodeAndStatus(
                "S4-RETURN-007", SERIAL_CODE, StockInstanceStatus.RECALLED)).isZero();
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    @DisplayName("resell-batch: 동시 재판매 요청은 advisory+row lock으로 같은 RECALLED 후보를 중복 전이하지 않는다")
    void resellBatch_concurrentRequestsDoNotResellSameCandidateTwice() throws Exception {
        cleanup();
        seedShipped(1, "P-S4-RES-LCK");
        stockInstanceService.recallBatch("P-S4-RES-LCK", SERIAL_CODE, 1, "S4-RETURN-RES-LCK");

        List<Throwable> failures = runConcurrently(
                () -> stockInstanceService.resellBatch("S4-RETURN-RES-LCK", SERIAL_CODE, 1, "tester-1"),
                () -> stockInstanceService.resellBatch("S4-RETURN-RES-LCK", SERIAL_CODE, 1, "tester-2"));

        long conflictCount = failures.stream()
                .filter(BusinessException.class::isInstance)
                .filter(ex -> ex.getMessage().contains("재판매 대상 부족"))
                .count();
        assertThat(conflictCount).isEqualTo(1);
        assertThat(stockInstanceRepository.countByProductCodeAndWarehouseIdAndStatus(
                SERIAL_CODE, warehouseId, StockInstanceStatus.AVAILABLE)).isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                  FROM stock_instances
                 WHERE is_deleted = false
                   AND product_code = ?
                   AND status = 'RECALLED'
                """, Long.class, SERIAL_CODE)).isZero();
        assertThat(jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                  FROM stock_instances
                 WHERE is_deleted = false
                   AND product_code = ?
                   AND status = 'AVAILABLE'
                   AND recall_slip_no IS NULL
                   AND outbound_partner_code IS NULL
                   AND outbound_slip_no IS NULL
                   AND outbound_at IS NULL
                """, Long.class, SERIAL_CODE)).isEqualTo(1L);
    }

    private ResultActions postReserve(String outboundSlipNo, int quantity) throws Exception {
        return mockMvc.perform(post("/inventory/instances/reserve-batch")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", MASTER_ROLE)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(reserveBody(SERIAL_CODE, outboundSlipNo, quantity))));
    }

    private ResultActions postRecall(String partnerCode, String recallSlipNo, int quantity) throws Exception {
        return mockMvc.perform(post("/inventory/instances/recall-batch")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", MASTER_ROLE)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(recallBody(partnerCode, recallSlipNo, quantity))));
    }

    private ResultActions postResell(String recallSlipNo, int quantity) throws Exception {
        return mockMvc.perform(post("/inventory/instances/resell-batch")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", MASTER_ROLE)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(resellBody(recallSlipNo, quantity))));
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

    private Map<String, Object> recallBody(String partnerCode, String recallSlipNo, int quantity) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("partnerCode", partnerCode);
        body.put("productCode", SERIAL_CODE);
        body.put("quantity", quantity);
        body.put("recallSlipNo", recallSlipNo);
        return body;
    }

    private Map<String, Object> unrecallBody(String recallSlipNo) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("recallSlipNo", recallSlipNo);
        body.put("productCode", SERIAL_CODE);
        return body;
    }

    private Map<String, Object> resellBody(String recallSlipNo, int quantity) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("recallSlipNo", recallSlipNo);
        body.put("productCode", SERIAL_CODE);
        body.put("quantity", quantity);
        return body;
    }

    @SafeVarargs
    private final List<Throwable> runConcurrently(Callable<?>... calls) throws Exception {
        ExecutorService executor = Executors.newFixedThreadPool(calls.length);
        CyclicBarrier barrier = new CyclicBarrier(calls.length);
        try {
            List<Future<Throwable>> futures = java.util.Arrays.stream(calls)
                    .map(call -> executor.submit(() -> {
                        try {
                            barrier.await();
                            call.call();
                            return null;
                        } catch (Throwable ex) {
                            return ex;
                        }
                    }))
                    .toList();
            List<Throwable> failures = new java.util.ArrayList<>();
            for (Future<Throwable> future : futures) {
                Throwable failure = future.get();
                if (failure != null) {
                    failures.add(failure);
                }
            }
            return failures;
        } finally {
            executor.shutdownNow();
        }
    }

    private void seedAvailable(int count) {
        for (int i = 1; i <= count; i++) {
            stockInstanceRepository.save(StockInstance.inbound(
                    serialProductId, SERIAL_CODE, warehouseId, "구매",
                    LocalDateTime.of(2026, 6, i, 9, 0),
                    new BigDecimal("500000"), "S3-IN-" + i));
        }
    }

    private void seedShipped(int count, String partnerCode) {
        seedShipped(count, partnerCode, SERIAL_CODE);
    }

    private void seedShipped(int count, String partnerCode, String storedProductCode) {
        for (int i = 1; i <= count; i++) {
            StockInstance instance = StockInstance.inbound(
                    serialProductId, storedProductCode, warehouseId, "구매",
                    LocalDateTime.of(2026, 6, i, 9, 0),
                    new BigDecimal("500000"), "S4-IN-" + i);
            instance.ship(partnerCode, "S4-OUT-" + i, LocalDateTime.of(2026, 6, i, 15, 0));
            stockInstanceRepository.save(instance);
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
                   AND (product_code IN (?, ?, ?)
                        OR inbound_slip_no LIKE 'S3-IN-%'
                        OR inbound_slip_no LIKE 'S4-IN-%'
                        OR outbound_slip_no LIKE 'S3-OUT-%'
                        OR outbound_slip_no LIKE 'S4-OUT-%'
                        OR recall_slip_no LIKE 'S4-RETURN-%')
                """, CLEANUP_USER, SERIAL_CODE, BATCH_CODE, LEGACY_SERIAL_CODE));
    }
}
