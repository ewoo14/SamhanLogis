package com.samhanair.logis.inventory.it;

import static org.assertj.core.api.Assertions.assertThat;
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
 * StockInstance 도메인/API 통합 테스트 — Phase INV-S S1.
 *
 * <p>ProductClient 는 {@code @MockBean} 격리 ({@code feedback_it_mockbean_external_clients}).
 *
 * <p>검증 케이스:
 * <ol>
 *   <li>serial-managed 품목 인스턴스 생성 → AVAILABLE + DB row 확인</li>
 *   <li>batch 품목(serialManaged=false) 생성 시도 → 409 CONFLICT</li>
 *   <li>FIFO 조회 — received_at ASC 순서 단언</li>
 *   <li>역-FIFO 조회 — SHIPPED 인스턴스 outbound_at DESC 순서(ship() 후)</li>
 *   <li>상태전이 가드 — AVAILABLE 아닌 상태에서 reserve → 409 (도메인 단위)</li>
 *   <li>soft-delete @SQLRestriction 필터 — markDeleted 후 조회 제외 확인</li>
 * </ol>
 */
@SpringBootTest(classes = InventoryServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class StockInstanceIT extends AbstractPostgresIT {

    private static final String MASTER_ROLE = "MASTER";
    private static final String INTERNAL_TOKEN = "test-internal-token";

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
        // 첫 번째 활성 창고 사용
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
        if (warehouseId == null) return;

        Map<String, Object> req = buildCreateRequest(
                serialProductId, serialProductCode, warehouseId,
                "구매", LocalDateTime.of(2026, 1, 1, 9, 0, 0),
                new BigDecimal("500000"), "INB-001");

        MvcResult result = mockMvc.perform(post("/inventory/instances")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", MASTER_ROLE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.productCode", is(serialProductCode)))
                .andExpect(jsonPath("$.data.status", is("AVAILABLE")))
                .andExpect(jsonPath("$.data.id", notNullValue()))
                .andReturn();

        // DB row 확인 — soft-delete 필터 통과, AVAILABLE 상태
        List<StockInstance> rows = stockInstanceRepository
                .findByProductCodeAndStatusOrderByReceivedAtAsc(
                        serialProductCode, StockInstanceStatus.AVAILABLE);
        assertThat(rows).hasSizeGreaterThanOrEqualTo(1);
        assertThat(rows.get(0).getStatus()).isEqualTo(StockInstanceStatus.AVAILABLE);
        assertThat(rows.get(0).getProductCode()).isEqualTo(serialProductCode);
    }

    // ─────────────────────────────────────────────────
    // TC-2: batch 품목(serialManaged=false) 생성 시도 → 409
    // ─────────────────────────────────────────────────

    @Test
    @DisplayName("TC-2: batch 품목(serialManaged=false) 인스턴스 생성 시도 → 409 CONFLICT")
    void createInstance_batchProduct_409() throws Exception {
        if (warehouseId == null) return;

        Map<String, Object> req = buildCreateRequest(
                batchProductId, batchProductCode, warehouseId,
                "구매", LocalDateTime.of(2026, 1, 1, 9, 0, 0),
                new BigDecimal("10000"), null);

        mockMvc.perform(post("/inventory/instances")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", MASTER_ROLE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isConflict());
    }

    // ─────────────────────────────────────────────────
    // TC-3: FIFO 조회 — received_at ASC 순서 단언
    // ─────────────────────────────────────────────────

    @Test
    @DisplayName("TC-3: FIFO 조회 — received_at ASC 순서 단언 (먼저 입고된 것이 먼저)")
    void fifo_receivedAtAsc_order() throws Exception {
        if (warehouseId == null) return;

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

        assertThat(fifo).hasSizeGreaterThanOrEqualTo(3);
        // 가장 이른 received_at 이 먼저 나와야 함
        assertThat(fifo.get(0).getReceivedAt())
                .isBeforeOrEqualTo(fifo.get(1).getReceivedAt());
        assertThat(fifo.get(1).getReceivedAt())
                .isBeforeOrEqualTo(fifo.get(2).getReceivedAt());
    }

    // ─────────────────────────────────────────────────
    // TC-4: 역-FIFO 조회 — outbound_at DESC 순서
    // ─────────────────────────────────────────────────

    @Test
    @DisplayName("TC-4: 역-FIFO 조회 — SHIPPED 인스턴스 outbound_at DESC 순서")
    void recallCandidates_outboundAtDesc_order() throws Exception {
        if (warehouseId == null) return;

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
                .findByOutboundPartnerCodeAndProductCodeAndStatusOrderByOutboundAtDesc(
                        partnerCode, serialProductCode, StockInstanceStatus.SHIPPED);

        assertThat(recall).hasSizeGreaterThanOrEqualTo(3);
        // 가장 최근 출고가 먼저 나와야 함
        assertThat(recall.get(0).getOutboundAt())
                .isAfterOrEqualTo(recall.get(1).getOutboundAt());
        assertThat(recall.get(1).getOutboundAt())
                .isAfterOrEqualTo(recall.get(2).getOutboundAt());
    }

    // ─────────────────────────────────────────────────
    // TC-5: 상태전이 가드 — AVAILABLE 아닌 상태에서 ship/reserve → 409
    // ─────────────────────────────────────────────────

    @Test
    @DisplayName("TC-5: 상태전이 가드 — RESERVED 상태에서 ship() 호출 → 409 (도메인 단위)")
    void stateGuard_ship_fromReserved_throws409() {
        StockInstance instance = StockInstance.inbound(
                serialProductId, serialProductCode, warehouseId,
                "구매", LocalDateTime.now(), BigDecimal.valueOf(500000), null);
        instance.reserve();  // AVAILABLE → RESERVED

        // RESERVED 상태에서 ship() 시도 → ResponseStatusException 409
        org.junit.jupiter.api.Assertions.assertThrows(
                org.springframework.web.server.ResponseStatusException.class,
                () -> instance.ship("PARTNER-001", "OUT-001", LocalDateTime.now()));
    }

    @Test
    @DisplayName("TC-5b: 상태전이 가드 — SHIPPED 상태에서 reserve() 호출 → 409 (도메인 단위)")
    void stateGuard_reserve_fromShipped_throws409() {
        StockInstance instance = StockInstance.inbound(
                serialProductId, serialProductCode, warehouseId,
                "구매", LocalDateTime.now(), BigDecimal.valueOf(500000), null);
        instance.ship("PARTNER-001", "OUT-001", LocalDateTime.now());  // AVAILABLE → SHIPPED

        // SHIPPED 상태에서 reserve() 시도 → ResponseStatusException 409
        org.junit.jupiter.api.Assertions.assertThrows(
                org.springframework.web.server.ResponseStatusException.class,
                () -> instance.reserve());
    }

    // ─────────────────────────────────────────────────
    // TC-6: soft-delete @SQLRestriction 필터
    // ─────────────────────────────────────────────────

    @Test
    @DisplayName("TC-6: soft-delete 필터 — markDeleted() 후 FIFO 조회에서 제외")
    void softDelete_filteredByRestriction() throws Exception {
        if (warehouseId == null) return;

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
