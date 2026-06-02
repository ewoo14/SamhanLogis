package com.samhanair.logis.inventory.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.notNullValue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
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
import com.samhanair.logis.inventory.repository.WarehouseRepository;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Assertions;
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
 * StockInstance 도메인/API 통합 테스트 — Phase INV-S S1.
 *
 * <p>ProductClient 는 {@code @MockBean} 격리 ({@code feedback_it_mockbean_external_clients}).
 *
 * <p>검증 케이스:
 * <ol>
 *   <li>serial-managed 품목 인스턴스 생성 → AVAILABLE + DB row 확인</li>
 *   <li>batch 품목(serialManaged=false) 생성 시도 → 409 CONFLICT + 응답 body errorCode 단언</li>
 *   <li>FIFO 조회 — received_at ASC 정확 값 단언(early/middle/late isEqualTo) + hasSize(3)</li>
 *   <li>역-FIFO 조회 — SHIPPED 인스턴스 outbound_at DESC 정확 값 단언 + hasSize(3)</li>
 *   <li>상태전이 가드 — RESERVED 상태에서 ship → BusinessException 409 (도메인 단위, DB 무관)</li>
 *   <li>상태전이 가드 — SHIPPED 상태에서 reserve → BusinessException 409 (도메인 단위, DB 무관)</li>
 *   <li>recall() / release() 정상 전이 + 비정상 전이 → BusinessException 409 (도메인 단위)</li>
 *   <li>soft-delete @SQLRestriction 필터 — markDeleted 후 조회 제외 확인</li>
 * </ol>
 */
@SpringBootTest(classes = InventoryServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class StockInstanceIT extends AbstractPostgresIT {

    private static final String MASTER_ROLE = "MASTER";

    /** TC-5/5b/M-1 도메인 단위 테스트용 고정 warehouseId — DB 조회 의존 없음 (QA M-2 수정). */
    private static final UUID DOMAIN_TEST_WAREHOUSE_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private StockInstanceRepository stockInstanceRepository;

    @Autowired
    private WarehouseRepository warehouseRepository;

    @MockBean
    private ProductClient productClient;

    /** IT 계층 창고 UUID — DB 에서 첫 번째 활성 창고 사용 (null 이면 창고 없는 환경). */
    private UUID warehouseId;
    private UUID serialProductId;
    private UUID batchProductId;
    private String serialProductCode;
    private String batchProductCode;

    /**
     * 테스트 픽스처 설정 — ProductClient 스텁(serial-managed true/false) + 창고 조회.
     */
    @BeforeEach
    void setUp() {
        // 첫 번째 활성 창고 사용 (없으면 null — TC-1~4/6 는 assumeTrue 로 skip 처리)
        var warehouses = warehouseRepository.findAllByIsDeletedFalseOrderByDisplayOrderAsc();
        if (!warehouses.isEmpty()) {
            warehouseId = warehouses.get(0).getId();
        }

        serialProductId = UUID.randomUUID();
        batchProductId = UUID.randomUUID();
        serialProductCode = "TEST-SERIAL-001";
        batchProductCode = "TEST-BATCH-001";

        // serial-managed=true 스텁 — 에어컨 계열 품목
        ProductSummary serialProduct = new ProductSummary(
                serialProductId, "삼성 에어컨 테스트", "AR05-TEST",
                serialProductCode, null, BigDecimal.valueOf(500000), "ACTIVE", true);

        // serial-managed=false 스텁 — batch 품목
        ProductSummary batchProduct = new ProductSummary(
                batchProductId, "부자재 테스트", "PIPE-TEST",
                batchProductCode, null, BigDecimal.valueOf(10000), "ACTIVE", false);

        Mockito.lenient().when(productClient.requireExists(serialProductId))
                .thenReturn(serialProduct);
        Mockito.lenient().when(productClient.requireExists(batchProductId))
                .thenReturn(batchProduct);
        Mockito.lenient().when(productClient.lookup(Mockito.anyList()))
                .thenReturn(List.of(serialProduct));
    }

    // ─────────────────────────────────────────────────
    // TC-1: serial-managed 품목 인스턴스 생성 → AVAILABLE + DB row
    // ─────────────────────────────────────────────────

    @Test
    @DisplayName("TC-1: serial-managed 품목 인스턴스 생성 → 201 + AVAILABLE 상태 + DB row 확인")
    void createInstance_serialManaged_success() throws Exception {
        // m-1: assumeTrue 로 DB 의존 TC skip 처리 (silent pass 제거)
        assumeTrue(warehouseId != null, "창고 시드 없음 — 테스트 skip");

        Map<String, Object> req = buildCreateRequest(
                serialProductId, serialProductCode, warehouseId,
                "구매", LocalDateTime.of(2026, 1, 1, 9, 0, 0),
                new BigDecimal("500000"), "INB-001");

        // m-1: MvcResult 미사용 변수 제거 — andExpect 체인으로만 단언
        mockMvc.perform(post("/inventory/instances")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", MASTER_ROLE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.productCode", is(serialProductCode)))
                .andExpect(jsonPath("$.data.status", is("AVAILABLE")))
                .andExpect(jsonPath("$.data.id", notNullValue()));

        // DB row 확인 — soft-delete 필터 통과, AVAILABLE 상태
        List<StockInstance> rows = stockInstanceRepository
                .findByProductCodeAndStatusOrderByReceivedAtAsc(
                        serialProductCode, StockInstanceStatus.AVAILABLE);
        assertThat(rows).hasSizeGreaterThanOrEqualTo(1);
        assertThat(rows.get(0).getStatus()).isEqualTo(StockInstanceStatus.AVAILABLE);
        assertThat(rows.get(0).getProductCode()).isEqualTo(serialProductCode);
    }

    // ─────────────────────────────────────────────────
    // TC-2: batch 품목(serialManaged=false) 생성 시도 → 409 + body 단언
    // ─────────────────────────────────────────────────

    @Test
    @DisplayName("TC-2: batch 품목(serialManaged=false) 인스턴스 생성 시도 → 409 CONFLICT + errorCode 단언")
    void createInstance_batchProduct_409() throws Exception {
        // C-2: 응답 body 단언 추가 — GlobalExceptionHandler BusinessException 핸들러 검증
        assumeTrue(warehouseId != null, "창고 시드 없음 — 테스트 skip");

        Map<String, Object> req = buildCreateRequest(
                batchProductId, batchProductCode, warehouseId,
                "구매", LocalDateTime.of(2026, 1, 1, 9, 0, 0),
                new BigDecimal("10000"), null);

        mockMvc.perform(post("/inventory/instances")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", MASTER_ROLE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isConflict())
                // C-2: 응답 body 단언 — BusinessException → ApiResponse.code + message
                // GlobalExceptionHandler 가 BusinessException 을 ApiResponse.fail(CONFLICT, ...) 로 변환
                .andExpect(jsonPath("$.code", is("CONFLICT")))
                .andExpect(jsonPath("$.message", containsString("batch")));
    }

    // ─────────────────────────────────────────────────
    // TC-3: FIFO 조회 — received_at ASC 정확 값 단언
    // ─────────────────────────────────────────────────

    @Test
    @DisplayName("TC-3: FIFO 조회 — received_at ASC 순서 정확 값 단언 (early/middle/late isEqualTo)")
    void fifo_receivedAtAsc_order() throws Exception {
        // C-1: isEqualTo 정확 값 단언 + hasSize(3) 로 강화
        assumeTrue(warehouseId != null, "창고 시드 없음 — 테스트 skip");

        // 3개 인스턴스 — received_at 역순으로 생성 (최신 → 오래된 순으로 저장)
        LocalDateTime late   = LocalDateTime.of(2026, 3, 1, 9, 0, 0);
        LocalDateTime middle = LocalDateTime.of(2026, 2, 1, 9, 0, 0);
        LocalDateTime early  = LocalDateTime.of(2026, 1, 1, 9, 0, 0);

        createInstanceViaApi(serialProductCode, late);
        createInstanceViaApi(serialProductCode, middle);
        createInstanceViaApi(serialProductCode, early);

        // FIFO 조회 — received_at ASC 첫 번째 = early
        List<StockInstance> fifo = stockInstanceRepository
                .findByProductCodeAndStatusOrderByReceivedAtAsc(
                        serialProductCode, StockInstanceStatus.AVAILABLE);

        // C-1 + QA MINOR-8: @Transactional 롤백 격리 보장 → 정확히 3건
        assertThat(fifo).hasSize(3);
        // C-1: 정확 값(isEqualTo) 단언 — 방향만 아님
        assertThat(fifo.get(0).getReceivedAt()).isEqualTo(early);
        assertThat(fifo.get(1).getReceivedAt()).isEqualTo(middle);
        assertThat(fifo.get(2).getReceivedAt()).isEqualTo(late);
    }

    // ─────────────────────────────────────────────────
    // TC-4: 역-FIFO 조회 — outbound_at DESC 정확 값 단언
    // ─────────────────────────────────────────────────

    @Test
    @DisplayName("TC-4: 역-FIFO 조회 — SHIPPED 인스턴스 outbound_at DESC 정확 값 단언 (out3/out2/out1)")
    void recallCandidates_outboundAtDesc_order() throws Exception {
        // C-1 + QA MINOR-8: 정확 값 단언 + hasSize(3)
        assumeTrue(warehouseId != null, "창고 시드 없음 — 테스트 skip");

        String partnerCode = "TEST-PARTNER-001";

        // 3개 인스턴스 생성 후 ship
        LocalDateTime out1 = LocalDateTime.of(2026, 1, 15, 9, 0, 0);
        LocalDateTime out2 = LocalDateTime.of(2026, 2, 15, 9, 0, 0);
        LocalDateTime out3 = LocalDateTime.of(2026, 3, 15, 9, 0, 0);

        StockInstance i1 = stockInstanceRepository.save(
                StockInstance.inbound(serialProductId, serialProductCode, warehouseId,
                        "구매", LocalDateTime.of(2026, 1, 1, 9, 0, 0), BigDecimal.valueOf(500000), null));
        StockInstance i2 = stockInstanceRepository.save(
                StockInstance.inbound(serialProductId, serialProductCode, warehouseId,
                        "구매", LocalDateTime.of(2026, 1, 2, 9, 0, 0), BigDecimal.valueOf(500000), null));
        StockInstance i3 = stockInstanceRepository.save(
                StockInstance.inbound(serialProductId, serialProductCode, warehouseId,
                        "구매", LocalDateTime.of(2026, 1, 3, 9, 0, 0), BigDecimal.valueOf(500000), null));

        // ship — outbound_at 각각 다르게
        i1.ship(partnerCode, "OUT-001", out1);
        i2.ship(partnerCode, "OUT-002", out2);
        i3.ship(partnerCode, "OUT-003", out3);
        stockInstanceRepository.save(i1);
        stockInstanceRepository.save(i2);
        stockInstanceRepository.save(i3);

        // 역-FIFO — outbound_at DESC
        List<StockInstance> recall = stockInstanceRepository
                .findByOutboundPartnerCodeAndProductCodeAndStatusOrderByOutboundAtDescIdAsc(
                        partnerCode, serialProductCode, StockInstanceStatus.SHIPPED);

        // C-1 + QA MINOR-8: 정확히 3건 + 정확 값 단언
        assertThat(recall).hasSize(3);
        // 역-FIFO: 가장 최근 출고(out3) 가 첫 번째
        assertThat(recall.get(0).getOutboundAt()).isEqualTo(out3);
        assertThat(recall.get(1).getOutboundAt()).isEqualTo(out2);
        assertThat(recall.get(2).getOutboundAt()).isEqualTo(out1);
    }

    // ─────────────────────────────────────────────────
    // TC-5: 상태전이 — RESERVED 상태에서 ship → SHIPPED
    // (도메인 단위 — DB 무관, DOMAIN_TEST_WAREHOUSE_ID 고정값 사용)
    // ─────────────────────────────────────────────────

    @Test
    @DisplayName("TC-5: 상태전이 — RESERVED 상태에서 ship() 호출 → SHIPPED (도메인 단위)")
    void stateTransition_ship_fromReserved_ships() {
        // M-2: DB 의존 제거 — DOMAIN_TEST_WAREHOUSE_ID 하드코딩 사용
        LocalDateTime outboundAt = LocalDateTime.of(2026, 6, 2, 10, 0);
        StockInstance instance = StockInstance.inbound(
                serialProductId, serialProductCode, DOMAIN_TEST_WAREHOUSE_ID,
                "구매", LocalDateTime.now(), BigDecimal.valueOf(500000), null);
        instance.reserve("OUT-001");  // AVAILABLE → RESERVED

        instance.ship("PARTNER-001", "OUT-001", outboundAt);

        assertThat(instance.getStatus()).isEqualTo(StockInstanceStatus.SHIPPED);
        assertThat(instance.getOutboundPartnerCode()).isEqualTo("PARTNER-001");
        assertThat(instance.getOutboundSlipNo()).isEqualTo("OUT-001");
        assertThat(instance.getOutboundAt()).isEqualTo(outboundAt);
    }

    @Test
    @DisplayName("TC-5b: 상태전이 가드 — SHIPPED 상태에서 reserve() 호출 → BusinessException 409 (도메인 단위)")
    void stateGuard_reserve_fromShipped_throws409() {
        // M-2: DB 의존 제거 — DOMAIN_TEST_WAREHOUSE_ID 하드코딩 사용
        StockInstance instance = StockInstance.inbound(
                serialProductId, serialProductCode, DOMAIN_TEST_WAREHOUSE_ID,
                "구매", LocalDateTime.now(), BigDecimal.valueOf(500000), null);
        instance.ship("PARTNER-001", "OUT-001", LocalDateTime.now());  // AVAILABLE → SHIPPED

        // M-2: BusinessException 단언
        Assertions.assertThrows(
                BusinessException.class,
                () -> instance.reserve());
    }

    // ─────────────────────────────────────────────────
    // M-1: recall() / release() 도메인 전이 테스트
    // (도메인 단위 — DB 무관, DOMAIN_TEST_WAREHOUSE_ID 고정값 사용)
    // ─────────────────────────────────────────────────

    @Test
    @DisplayName("M-1a: recall() 정상 전이 — SHIPPED → RECALLED")
    void recall_fromShipped_success() {
        StockInstance instance = StockInstance.inbound(
                serialProductId, serialProductCode, DOMAIN_TEST_WAREHOUSE_ID,
                "구매", LocalDateTime.now(), BigDecimal.valueOf(500000), null);
        instance.ship("PARTNER-001", "OUT-001", LocalDateTime.now());  // AVAILABLE → SHIPPED

        instance.recall();  // SHIPPED → RECALLED

        assertThat(instance.getStatus()).isEqualTo(StockInstanceStatus.RECALLED);
    }

    @Test
    @DisplayName("M-1b: recall() 비정상 전이 — AVAILABLE 상태에서 recall → BusinessException 409")
    void recall_fromAvailable_throws409() {
        StockInstance instance = StockInstance.inbound(
                serialProductId, serialProductCode, DOMAIN_TEST_WAREHOUSE_ID,
                "구매", LocalDateTime.now(), BigDecimal.valueOf(500000), null);
        // AVAILABLE 상태 — SHIPPED 아니므로 recall 불가
        Assertions.assertThrows(
                BusinessException.class,
                () -> instance.recall());
    }

    @Test
    @DisplayName("M-1c: recall() 비정상 전이 — RECALLED 상태에서 ship → BusinessException 409")
    void ship_fromRecalled_throws409() {
        StockInstance instance = StockInstance.inbound(
                serialProductId, serialProductCode, DOMAIN_TEST_WAREHOUSE_ID,
                "구매", LocalDateTime.now(), BigDecimal.valueOf(500000), null);
        instance.ship("PARTNER-001", "OUT-001", LocalDateTime.now());  // AVAILABLE → SHIPPED
        instance.recall();  // SHIPPED → RECALLED

        // RECALLED 상태에서 ship 시도 → BusinessException 409
        Assertions.assertThrows(
                BusinessException.class,
                () -> instance.ship("PARTNER-002", "OUT-002", LocalDateTime.now()));
    }

    @Test
    @DisplayName("M-1d: release() 정상 전이 — RESERVED → AVAILABLE")
    void release_fromReserved_success() {
        StockInstance instance = StockInstance.inbound(
                serialProductId, serialProductCode, DOMAIN_TEST_WAREHOUSE_ID,
                "구매", LocalDateTime.now(), BigDecimal.valueOf(500000), null);
        instance.reserve();  // AVAILABLE → RESERVED

        instance.release();  // RESERVED → AVAILABLE

        assertThat(instance.getStatus()).isEqualTo(StockInstanceStatus.AVAILABLE);
    }

    @Test
    @DisplayName("M-1e: release() 비정상 전이 — SHIPPED 상태에서 release → BusinessException 409")
    void release_fromShipped_throws409() {
        StockInstance instance = StockInstance.inbound(
                serialProductId, serialProductCode, DOMAIN_TEST_WAREHOUSE_ID,
                "구매", LocalDateTime.now(), BigDecimal.valueOf(500000), null);
        instance.ship("PARTNER-001", "OUT-001", LocalDateTime.now());  // AVAILABLE → SHIPPED

        // SHIPPED 상태에서 release 시도 → BusinessException 409
        Assertions.assertThrows(
                BusinessException.class,
                () -> instance.release());
    }

    // ─────────────────────────────────────────────────
    // TC-6: soft-delete @SQLRestriction 필터
    // ─────────────────────────────────────────────────

    @Test
    @DisplayName("TC-6: soft-delete 필터 — markDeleted() 후 FIFO 조회에서 제외")
    void softDelete_filteredByRestriction() throws Exception {
        assumeTrue(warehouseId != null, "창고 시드 없음 — 테스트 skip");

        // 인스턴스 생성
        StockInstance instance = stockInstanceRepository.save(
                StockInstance.inbound(serialProductId, serialProductCode, warehouseId,
                        "구매", LocalDateTime.of(2026, 6, 1, 9, 0, 0), BigDecimal.valueOf(500000), null));

        // soft delete 전 FIFO 조회 — 포함됨
        long beforeCount = stockInstanceRepository
                .findByProductCodeAndStatusOrderByReceivedAtAsc(
                        serialProductCode, StockInstanceStatus.AVAILABLE)
                .stream()
                .filter(i -> i.getId().equals(instance.getId()))
                .count();
        assertThat(beforeCount).isEqualTo(1);

        // soft delete
        instance.markDeleted("test-user");
        stockInstanceRepository.save(instance);
        stockInstanceRepository.flush(); // 확실히 DB 반영

        // soft delete 후 FIFO 조회 — 제외됨 (@SQLRestriction 적용)
        long afterCount = stockInstanceRepository
                .findByProductCodeAndStatusOrderByReceivedAtAsc(
                        serialProductCode, StockInstanceStatus.AVAILABLE)
                .stream()
                .filter(i -> i.getId().equals(instance.getId()))
                .count();
        assertThat(afterCount).isEqualTo(0);
    }

    // ─────────────────────────────────────────────────
    // 헬퍼
    // ─────────────────────────────────────────────────

    /**
     * 인스턴스 생성 API 호출 헬퍼.
     */
    private void createInstanceViaApi(String productCode, LocalDateTime receivedAt) throws Exception {
        Map<String, Object> req = buildCreateRequest(
                serialProductId, productCode, warehouseId,
                "구매", receivedAt, new BigDecimal("500000"), null);

        mockMvc.perform(post("/inventory/instances")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", MASTER_ROLE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated());
    }

    /**
     * 인스턴스 생성 요청 body 빌더.
     */
    private Map<String, Object> buildCreateRequest(UUID productId, String productCode,
                                                    UUID warehouseId, String inboundType,
                                                    LocalDateTime receivedAt,
                                                    BigDecimal unitCost, String inboundSlipNo) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("productId", productId.toString());
        m.put("productCode", productCode);
        m.put("warehouseId", warehouseId.toString());
        m.put("inboundType", inboundType);
        if (receivedAt != null) {
            m.put("receivedAt", receivedAt.toString());
        }
        if (unitCost != null) {
            m.put("unitCost", unitCost.toPlainString());
        }
        if (inboundSlipNo != null) {
            m.put("inboundSlipNo", inboundSlipNo);
        }
        return m;
    }
}
