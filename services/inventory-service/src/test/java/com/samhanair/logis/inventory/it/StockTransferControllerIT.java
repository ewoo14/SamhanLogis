package com.samhanair.logis.inventory.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.inventory.InventoryServiceApplication;
import com.samhanair.logis.inventory.client.ProductClient;
import com.samhanair.logis.inventory.client.ProductSummary;
import com.samhanair.logis.inventory.domain.MovementType;
import com.samhanair.logis.inventory.domain.StockBalance;
import com.samhanair.logis.inventory.domain.StockLot;
import com.samhanair.logis.inventory.domain.StockTransfer;
import com.samhanair.logis.inventory.domain.TransferReason;
import com.samhanair.logis.inventory.repository.StockBalanceRepository;
import com.samhanair.logis.inventory.repository.StockLotRepository;
import com.samhanair.logis.inventory.repository.StockMovementRepository;
import com.samhanair.logis.inventory.repository.StockTransferRepository;
import com.samhanair.logis.inventory.repository.WarehouseRepository;
import com.samhanair.logis.security.permission.PermissionAction;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
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
 * 창고간 이동 (StockTransfer) 라이프사이클 + 가상창고 IN_TRANSIT 스킵 + 권한 매트릭스 검증.
 *
 * <p>BE endpoint (정확, Plan §4):
 * <ul>
 *   <li>{@code POST   /inventory/transfers}                — MASTER/MANAGER/WAREHOUSE/INVENTORY → REQUESTED (201)</li>
 *   <li>{@code POST   /inventory/transfers/{id}/approve}   — MASTER/MANAGER/INVENTORY → APPROVED (200)</li>
 *   <li>{@code POST   /inventory/transfers/{id}/ship}      — MASTER/MANAGER/WAREHOUSE/INVENTORY → SHIPPED (가상이면 즉시 RECEIVED)</li>
 *   <li>{@code POST   /inventory/transfers/{id}/receive}   — 〃 → RECEIVED (200)</li>
 *   <li>{@code POST   /inventory/transfers/{id}/reject}    — MASTER/MANAGER/INVENTORY (200) — REQUESTED/PENDING_APPROVAL 에서만</li>
 * </ul>
 *
 * <p>잘못된 transition 시 BusinessException(CONFLICT) → 409.
 * 가상창고 source/destination 은 차단되지 않고 ship() 시 IN_TRANSIT 단계 스킵 → 즉시 RECEIVED 점프 (Plan §3.1).
 *
 * <p>모든 응답 ApiResponse 래핑 → jsonPath {@code $.data.*}.
 */
@SpringBootTest(classes = InventoryServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class StockTransferControllerIT extends AbstractPostgresIT {

    private static final DateTimeFormatter PUBLIC_NO_DATE = DateTimeFormatter.ofPattern("yyyy/MM/dd");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private WarehouseRepository warehouseRepository;

    @Autowired
    private StockTransferRepository stockTransferRepository;

    @Autowired
    private StockLotRepository stockLotRepository;

    @Autowired
    private StockBalanceRepository stockBalanceRepository;

    @Autowired
    private StockMovementRepository stockMovementRepository;

    @MockBean
    private ProductClient productClient;

    private UUID hqId;        // HQ-001 본사창고 (HEADQUARTERS)
    private UUID vehicleId;   // VH-001 차량재고 (VEHICLE)
    private UUID virtualId;   // VR-001 가상창고 (VIRTUAL)

    @BeforeEach
    void setUp() {
        Mockito.lenient().when(dynamicPermissionClient.canView(Mockito.anyString(), Mockito.anyString()))
                .thenReturn(true);
        Mockito.lenient().when(dynamicPermissionClient.canEdit(Mockito.anyString(), Mockito.anyString()))
                .thenReturn(true);

        hqId = lookupSeed("HQ-001");
        vehicleId = lookupSeed("VH-001");
        virtualId = lookupSeed("VR-001");

        // ProductClient.lookup 은 productId 검증만 — 빈 응답이어도 통과 (수량 < 요청만 NOT_FOUND).
        // IT 의 lines 는 1건이라 응답 항목 1건 이상이면 OK. 임의 ProductSummary list 반환.
        Mockito.when(productClient.lookup(Mockito.anyList()))
                .thenAnswer(invocation -> {
                    List<UUID> ids = invocation.getArgument(0);
                    return ids.stream()
                            .map(id -> new ProductSummary(id, "테스트 제품", "TEST-001",
                                    UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE"))
                            .toList();
                });
    }

    private UUID lookupSeed(String code) {
        return warehouseRepository.findByCode(code)
                .orElseThrow(() -> new IllegalStateException(
                        code + " 시드 누락 — V2__seed_inventory_warehouses.sql 확인"))
                .getId();
    }

    @Test
    void transferLifecycle_requestedToReceived_succeeds() throws Exception {
        UUID productId = UUID.randomUUID();

        // 1) REQUESTED 생성 — WAREHOUSE 권한.
        Map<String, Object> createBody = createTransferBody(hqId, vehicleId, productId, 10, "차량 출고용");

        MvcResult created = mockMvc.perform(post("/inventory/transfers")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createBody)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.id").value(notNullValue()))
                .andExpect(jsonPath("$.data.status").value("REQUESTED"))
                .andReturn();

        String transferId = objectMapper.readTree(created.getResponse().getContentAsString())
                .get("data").get("id").asText();

        // 2) APPROVED — MANAGER 권한 (WAREHOUSE 는 approve 불가, MANAGER/MASTER/INVENTORY 만).
        mockMvc.perform(post("/inventory/transfers/" + transferId + "/approve")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("APPROVED"));

        // 3) SHIPPED — WAREHOUSE 권한.
        mockMvc.perform(post("/inventory/transfers/" + transferId + "/ship")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("SHIPPED"));

        // 4) RECEIVED — WAREHOUSE 권한 (도착 창고에서 수령 확정).
        mockMvc.perform(post("/inventory/transfers/" + transferId + "/receive")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("RECEIVED"));
    }

    @Test
    void confirm_createsOutboundAndInboundInventoryTogether_andKeepsTotalQuantity() throws Exception {
        UUID productId = UUID.randomUUID();
        var sourceWarehouse = warehouseRepository.getReferenceById(hqId);
        var destinationWarehouse = warehouseRepository.getReferenceById(vehicleId);
        StockLot sourceLot = stockLotRepository.saveAndFlush(StockLot.create(
                productId, sourceWarehouse, "TRANSFER-SOURCE-LOT", 10, null, null));
        StockBalance sourceBalance = StockBalance.create(productId, sourceWarehouse);
        sourceBalance.addInbound(10);
        stockBalanceRepository.saveAndFlush(sourceBalance);
        stockMovementRepository.saveAndFlush(com.samhanair.logis.inventory.domain.StockMovement.of(
                sourceLot.getId(), productId, hqId, MovementType.INBOUND, 10,
                "INBOUND", null, "RED fixture", "test"));

        Map<String, Object> body = createTransferBody(hqId, vehicleId, productId, 4,
                "확정 시 양방향 수불 RED");
        MvcResult created = mockMvc.perform(post("/inventory/transfers")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();
        String transferId = objectMapper.readTree(created.getResponse().getContentAsString())
                .get("data").get("id").asText();

        mockMvc.perform(post("/inventory/transfers/" + transferId + "/approve")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER"))
                .andExpect(status().isOk());
        mockMvc.perform(post("/inventory/transfers/" + transferId + "/ship")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk());
        mockMvc.perform(post("/inventory/transfers/" + transferId + "/receive")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isOk());

        mockMvc.perform(post("/inventory/transfers/" + transferId + "/confirm")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("CONFIRMED"));

        StockBalance persistedSource = stockBalanceRepository
                .findByProductIdAndWarehouse_IdAndIsDeletedFalse(productId, hqId).orElseThrow();
        StockBalance persistedDestination = stockBalanceRepository
                .findByProductIdAndWarehouse_IdAndIsDeletedFalse(productId, vehicleId).orElseThrow();
        assertThat(persistedSource.getTotalQty() + persistedDestination.getTotalQty()).isEqualTo(10);
        assertThat(persistedSource.getAvailableQty()).isEqualTo(6);
        assertThat(persistedDestination.getAvailableQty()).isEqualTo(4);

        var transfer = stockTransferRepository.findById(UUID.fromString(transferId)).orElseThrow();
        assertThat(transfer.getLines()).singleElement().satisfies(line -> {
            assertThat(line.getShippedQuantity()).isEqualTo(4);
            assertThat(line.getReceivedQuantity()).isEqualTo(4);
            assertThat(line.getSourceLotId()).isNotNull();
            assertThat(line.getDestinationLotId()).isNotNull();
        });
        var movementTypes = stockMovementRepository.findAllByProductIdOrderByOccurredAtAsc(productId)
                .stream().map(movement -> movement.getMovementType()).collect(Collectors.toList());
        assertThat(movementTypes).contains(MovementType.TRANSFER_OUT, MovementType.TRANSFER_IN);
    }

    @Test
    void createTransfer_usesLastSequenceAndPublicFormat() throws Exception {
        UUID productId = UUID.randomUUID();
        String todayPrefix = LocalDate.now().format(PUBLIC_NO_DATE) + "-";
        StockTransfer existing = StockTransfer.create(todayPrefix + "7",
                warehouseRepository.getReferenceById(hqId),
                warehouseRepository.getReferenceById(vehicleId),
                TransferReason.REBALANCE,
                "기존 마지막 순번",
                "seed-user");
        stockTransferRepository.saveAndFlush(existing);

        Map<String, Object> body = createTransferBody(hqId, vehicleId, productId, 3, "마지막 순번 이후 채번");

        mockMvc.perform(post("/inventory/transfers")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.transferNo").value(todayPrefix + "8"));
    }

    @Test
    void virtualWarehouse_asSource_shipJumpsToReceived() throws Exception {
        // VIRTUAL 창고 (VR-001) 를 source 로 한 transfer — 차단되지 않고
        // ship() 시 IN_TRANSIT 스킵 → 즉시 RECEIVED 로 점프 (Plan §3.1 의 가상창고 정의).
        UUID productId = UUID.randomUUID();
        Map<String, Object> body = createTransferBody(virtualId, hqId, productId, 5, "가상창고 출하 — 즉시 RECEIVED");

        MvcResult created = mockMvc.perform(post("/inventory/transfers")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();
        String transferId = objectMapper.readTree(created.getResponse().getContentAsString())
                .get("data").get("id").asText();

        mockMvc.perform(post("/inventory/transfers/" + transferId + "/approve")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER"))
                .andExpect(status().isOk());

        // ship() 호출 시 가상창고 가드로 status 가 RECEIVED 로 점프.
        mockMvc.perform(post("/inventory/transfers/" + transferId + "/ship")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("RECEIVED"));
    }

    @Test
    void transferReject_fromShipped_returns409() throws Exception {
        // REQUESTED → APPROVED → SHIPPED 후 reject → 409 (REQUESTED/PENDING_APPROVAL 에서만 가능).
        UUID productId = UUID.randomUUID();
        Map<String, Object> createBody = createTransferBody(hqId, vehicleId, productId, 5, "reject 후 확인");

        MvcResult created = mockMvc.perform(post("/inventory/transfers")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createBody)))
                .andExpect(status().isCreated())
                .andReturn();
        String transferId = objectMapper.readTree(created.getResponse().getContentAsString())
                .get("data").get("id").asText();

        mockMvc.perform(post("/inventory/transfers/" + transferId + "/approve")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER"))
                .andExpect(status().isOk());
        mockMvc.perform(post("/inventory/transfers/" + transferId + "/ship")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk());

        // SHIPPED 상태에서 reject 시도 → 409.
        Map<String, Object> rejectBody = Map.of("reason", "이미 출하됐는데 거부 시도");
        mockMvc.perform(post("/inventory/transfers/" + transferId + "/reject")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(rejectBody)))
                .andExpect(status().isConflict());
    }

    @Test
    void transferApprove_warehouseRole_returns403() throws Exception {
        UUID productId = UUID.randomUUID();
        Map<String, Object> createBody = createTransferBody(hqId, vehicleId, productId, 1, "approve 권한 검증");

        MvcResult created = mockMvc.perform(post("/inventory/transfers")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createBody)))
                .andExpect(status().isCreated())
                .andReturn();
        String transferId = objectMapper.readTree(created.getResponse().getContentAsString())
                .get("data").get("id").asText();

        // WAREHOUSE 가 approve → 403 (MASTER/MANAGER/INVENTORY 만 허용).
        Mockito.when(dynamicPermissionClient.check(
                        Mockito.any(UUID.class), Mockito.eq("inventory.adjust"), Mockito.eq(PermissionAction.UPDATE)))
                .thenReturn(false);

        mockMvc.perform(post("/inventory/transfers/" + transferId + "/approve")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isForbidden());
    }

    private Map<String, Object> createTransferBody(UUID source, UUID dest, UUID productId,
                                                   int qty, String reasonDetail) {
        Map<String, Object> line = new HashMap<>();
        line.put("productId", productId.toString());
        line.put("requestedQuantity", qty);

        Map<String, Object> body = new HashMap<>();
        body.put("sourceWarehouseId", source.toString());
        body.put("destinationWarehouseId", dest.toString());
        body.put("reason", "REBALANCE");
        body.put("reasonDetail", reasonDetail);
        body.put("lines", List.of(line));
        return body;
    }
}
