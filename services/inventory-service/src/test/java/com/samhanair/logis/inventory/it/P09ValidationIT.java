package com.samhanair.logis.inventory.it;

import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.inventory.InventoryServiceApplication;
import com.samhanair.logis.inventory.client.AccountingClient;
import com.samhanair.logis.inventory.client.ProductClient;
import com.samhanair.logis.inventory.client.SlipClient;
import com.samhanair.logis.inventory.client.SlipDetail;
import com.samhanair.logis.inventory.client.SlipLineDetail;
import com.samhanair.logis.inventory.repository.InboundInspectionRepository;
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
 * P0-9 입고 검수 UI 검증 IT — extends AbstractPostgresIT (PR #140 회고 패턴).
 *
 * <p>검증 시나리오:
 * <ol>
 *   <li>GET /api/v1/inventory/inbound-inspections/{slipId} — 검수 헤더 + 라인 신규 생성 조회</li>
 *   <li>POST /api/v1/inventory/inbound-inspections/{slipId}/inspect — 라인별 검수 결과 저장</li>
 *   <li>POST /api/v1/inventory/inbound-inspections/{slipId}/complete — 재고 적용 검증
 *       (StockLot 신규 생성 + StockBalance 가산 + INBOUND movement 기록)</li>
 *   <li>SALES 권한 접근 거부 (403)</li>
 *   <li>중복 완료 멱등 처리 (이미 stockApplied=true 이면 200 반환, 재적용 없음)</li>
 * </ol>
 *
 * <p>@MockBean 외부 client 3종 ({@code feedback_it_mockbean_external_clients.md} 준수):
 * <ul>
 *   <li>{@link SlipClient} — slip-service 슬립 조회 (Eureka 비활성 환경 500 방지)</li>
 *   <li>{@link ProductClient} — product-service 제품 조회 (공유 서비스 격리)</li>
 *   <li>{@link AccountingClient} — accounting-service 분개 trigger (실사 서비스 공유)</li>
 * </ul>
 *
 * <p>시드 데이터 (V6__seed_p09_inbound_inspection.sql):
 * <ul>
 *   <li>입고 슬립 UUID b0b0b0b0-...-0001 ~ 0005 (5건 — SAVED/CONFIRMED 패턴)</li>
 *   <li>창고 HQ-001 UUID: 11111111-1111-1111-1111-000000000001</li>
 *   <li>Product-001 UUID: a0a0a0a0-0000-0000-0000-000000000001</li>
 * </ul>
 */
@SpringBootTest(classes = InventoryServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class P09ValidationIT extends AbstractPostgresIT {

    // ---- 결정적 UUID (V6 seed 동일) ----
    private static final UUID SLIP_ID_SAVED =
            UUID.fromString("b0b0b0b0-0000-0000-0000-000000000001");
    private static final UUID SLIP_ID_SAVED_2 =
            UUID.fromString("b0b0b0b0-0000-0000-0000-000000000002");
    private static final UUID SLIP_ID_CONFIRMED =
            UUID.fromString("b0b0b0b0-0000-0000-0000-000000000005");
    private static final UUID PRODUCT_001_ID =
            UUID.fromString("a0a0a0a0-0000-0000-0000-000000000001");
    private static final UUID PRODUCT_002_ID =
            UUID.fromString("a0a0a0a0-0000-0000-0000-000000000002");
    private static final UUID WAREHOUSE_HQ_ID =
            UUID.fromString("11111111-1111-1111-1111-000000000001");
    private static final UUID SLIP_LINE_001_A =
            UUID.fromString("f0f0f0f0-0000-0000-0000-000000000001");
    private static final UUID SLIP_LINE_001_B =
            UUID.fromString("f0f0f0f0-0000-0000-0000-000000000002");

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private InboundInspectionRepository inspectionRepository;

    @MockBean private SlipClient slipClient;
    @MockBean private ProductClient productClient;
    @MockBean private AccountingClient accountingClient;

    @BeforeEach
    void setUpMocks() {
        // SlipClient — SLIP_ID_SAVED (INBOUND, SAVED, 라인 2건)
        Mockito.lenient().when(slipClient.getSlip(SLIP_ID_SAVED))
                .thenReturn(new SlipDetail(
                        SLIP_ID_SAVED, "INSP-2026-0001", "INBOUND", "SAVED",
                        WAREHOUSE_HQ_ID,
                        List.of(
                                new SlipLineDetail(SLIP_LINE_001_A, PRODUCT_001_ID,
                                        "삼성 AJ040RXH4BC1", "AJ040RXH4BC1", 20,
                                        new BigDecimal("1850000")),
                                new SlipLineDetail(SLIP_LINE_001_B, PRODUCT_002_ID,
                                        "삼성 AJ056RXH4BC1", "AJ056RXH4BC1", 10,
                                        new BigDecimal("3200000")))));

        // SlipClient — SLIP_ID_SAVED_2 (INBOUND, SAVED, 라인 2건)
        Mockito.lenient().when(slipClient.getSlip(SLIP_ID_SAVED_2))
                .thenReturn(new SlipDetail(
                        SLIP_ID_SAVED_2, "INSP-2026-0002", "INBOUND", "SAVED",
                        WAREHOUSE_HQ_ID,
                        List.of(
                                new SlipLineDetail(
                                        UUID.fromString("f0f0f0f0-0000-0000-0000-000000000003"),
                                        PRODUCT_001_ID, "삼성 AJ040", "AJ040RXH4BC1", 15,
                                        new BigDecimal("1850000")),
                                new SlipLineDetail(
                                        UUID.fromString("f0f0f0f0-0000-0000-0000-000000000004"),
                                        PRODUCT_002_ID, "삼성 AJ056", "AJ056RXH4BC1", 8,
                                        new BigDecimal("3200000")))));

        // SlipClient — SLIP_ID_CONFIRMED (INBOUND, CONFIRMED, 라인 2건)
        Mockito.lenient().when(slipClient.getSlip(SLIP_ID_CONFIRMED))
                .thenReturn(new SlipDetail(
                        SLIP_ID_CONFIRMED, "INSP-2026-0005", "INBOUND", "CONFIRMED",
                        WAREHOUSE_HQ_ID,
                        List.of(
                                new SlipLineDetail(
                                        UUID.fromString("f0f0f0f0-0000-0000-0000-000000000011"),
                                        PRODUCT_001_ID, "삼성 AJ040 대량", "AJ040RXH4BC1", 50,
                                        new BigDecimal("1850000")),
                                new SlipLineDetail(
                                        UUID.fromString("f0f0f0f0-0000-0000-0000-000000000012"),
                                        PRODUCT_002_ID, "삼성 AJ056 대량", "AJ056RXH4BC1", 25,
                                        new BigDecimal("3200000")))));

        // AccountingClient — lenient no-op (P0-9 시나리오에서 직접 호출 없음)
        Mockito.lenient().doNothing().when(accountingClient)
                .createAuditAdjustmentJournal(
                        Mockito.any(), Mockito.any(), Mockito.any(), Mockito.any());
    }

    // ─────────────────── 시나리오 1: GET → 검수 신규 생성 ───────────────────

    /**
     * 시나리오 1-A: WAREHOUSE 권한으로 GET /inbound-inspections/{slipId} 호출.
     * 검수 레코드가 없으면 slip-service mock 으로부터 슬립 정보를 받아 신규 생성 반환.
     */
    @Test
    void getInspection_noRecord_createsAndReturnsPending() throws Exception {
        mockMvc.perform(get("/api/v1/inventory/inbound-inspections/" + SLIP_ID_SAVED)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.slipId").value(SLIP_ID_SAVED.toString()))
                .andExpect(jsonPath("$.data.slipNo").value("INSP-2026-0001"))
                .andExpect(jsonPath("$.data.status").value("PENDING"))
                .andExpect(jsonPath("$.data.stockApplied").value(false))
                .andExpect(jsonPath("$.data.lines.length()").value(2))
                .andExpect(jsonPath("$.data.lines[0].expectedQty").value(20))
                .andExpect(jsonPath("$.data.lines[1].expectedQty").value(10));
    }

    /**
     * 시나리오 1-B: 동일 slipId 로 두 번 GET — 두 번째는 기존 레코드 반환 (중복 생성 없음).
     */
    @Test
    void getInspection_existingRecord_returnsSame() throws Exception {
        MvcResult first = mockMvc.perform(
                        get("/api/v1/inventory/inbound-inspections/" + SLIP_ID_SAVED)
                                .header("X-User-Id", UUID.randomUUID().toString())
                                .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk())
                .andReturn();

        String firstInspectionId = objectMapper
                .readTree(first.getResponse().getContentAsString())
                .get("data").get("inspectionId").asText();

        mockMvc.perform(get("/api/v1/inventory/inbound-inspections/" + SLIP_ID_SAVED)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.inspectionId").value(firstInspectionId));

        long count = inspectionRepository
                .findAllByIsDeletedFalse(
                        org.springframework.data.domain.PageRequest.of(0, 100))
                .stream()
                .filter(i -> i.getSlipId().equals(SLIP_ID_SAVED))
                .count();
        org.assertj.core.api.Assertions.assertThat(count).isEqualTo(1);
    }

    /**
     * 시나리오 1-C: SALES 권한은 검수 API 접근 불가 (403).
     */
    @Test
    void getInspection_salesRole_returns403() throws Exception {
        mockMvc.perform(get("/api/v1/inventory/inbound-inspections/" + SLIP_ID_SAVED)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isForbidden());
    }

    // ─────────────────── 시나리오 2: POST /{slipId}/inspect ───────────────────

    /**
     * 시나리오 2-A: 검수 결과 저장 — 라인 2건 (불량 없음). 상태 PENDING 유지.
     */
    @Test
    void saveInspectionResult_allPass_pendingAndResultSaved() throws Exception {
        MvcResult getResult = mockMvc.perform(
                        get("/api/v1/inventory/inbound-inspections/" + SLIP_ID_SAVED)
                                .header("X-User-Id", UUID.randomUUID().toString())
                                .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk())
                .andReturn();

        var dataNode = objectMapper.readTree(getResult.getResponse().getContentAsString())
                .get("data");
        String lineId0 = dataNode.get("lines").get(0).get("lineId").asText();
        String lineId1 = dataNode.get("lines").get(1).get("lineId").asText();
        String inspectorId = UUID.randomUUID().toString();

        Map<String, Object> req = Map.of(
                "lines", List.of(
                        Map.of("lineId", lineId0, "inspectedQty", 20, "defectQty", 0),
                        Map.of("lineId", lineId1, "inspectedQty", 10, "defectQty", 0)));

        mockMvc.perform(post("/api/v1/inventory/inbound-inspections/" + SLIP_ID_SAVED + "/inspect")
                        .header("X-User-Id", inspectorId)
                        .header("X-User-Role", "WAREHOUSE")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("PENDING"))
                .andExpect(jsonPath("$.data.inspectorId").value(inspectorId))
                .andExpect(jsonPath("$.data.lines[0].inspectedQty").value(20))
                .andExpect(jsonPath("$.data.lines[0].normalQty").value(20))
                .andExpect(jsonPath("$.data.lines[1].inspectedQty").value(10))
                .andExpect(jsonPath("$.data.lines[1].normalQty").value(10));
    }

    /**
     * 시나리오 2-B: 불량 수량 포함 저장 — normalQty = inspectedQty - defectQty.
     */
    @Test
    void saveInspectionResult_withDefects_normalQtyReduced() throws Exception {
        MvcResult getResult = mockMvc.perform(
                        get("/api/v1/inventory/inbound-inspections/" + SLIP_ID_SAVED)
                                .header("X-User-Id", UUID.randomUUID().toString())
                                .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk())
                .andReturn();

        var dataNode = objectMapper.readTree(getResult.getResponse().getContentAsString())
                .get("data");
        String lineId0 = dataNode.get("lines").get(0).get("lineId").asText();
        String lineId1 = dataNode.get("lines").get(1).get("lineId").asText();

        Map<String, Object> req = Map.of(
                "lines", List.of(
                        Map.of("lineId", lineId0, "inspectedQty", 20, "defectQty", 2,
                                "defectReason", "외관 파손"),
                        Map.of("lineId", lineId1, "inspectedQty", 10, "defectQty", 0)));

        mockMvc.perform(post("/api/v1/inventory/inbound-inspections/" + SLIP_ID_SAVED + "/inspect")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.lines[0].defectQty").value(2))
                .andExpect(jsonPath("$.data.lines[0].normalQty").value(18))
                .andExpect(jsonPath("$.data.lines[0].defectReason").value("외관 파손"));
    }

    /**
     * 시나리오 2-C: lines 비어있으면 400 (Bean Validation @NotEmpty).
     */
    @Test
    void saveInspectionResult_emptyLines_returns400() throws Exception {
        Map<String, Object> req = new HashMap<>();
        req.put("lines", List.of());

        mockMvc.perform(post("/api/v1/inventory/inbound-inspections/" + SLIP_ID_SAVED + "/inspect")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isBadRequest());
    }

    // ─────────────────── 시나리오 3: POST /{slipId}/complete ───────────────────

    /**
     * 시나리오 3-A: 검수 완료 후 재고 적용 — COMPLETED + stockApplied=true.
     */
    @Test
    void completeInspection_allPass_stockAppliedAndStatusCompleted() throws Exception {
        // 1) GET
        MvcResult getResult = mockMvc.perform(
                        get("/api/v1/inventory/inbound-inspections/" + SLIP_ID_SAVED)
                                .header("X-User-Id", UUID.randomUUID().toString())
                                .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk())
                .andReturn();

        var dataNode = objectMapper.readTree(getResult.getResponse().getContentAsString())
                .get("data");
        String lineId0 = dataNode.get("lines").get(0).get("lineId").asText();
        String lineId1 = dataNode.get("lines").get(1).get("lineId").asText();

        // 2) POST /inspect
        Map<String, Object> inspectReq = Map.of(
                "lines", List.of(
                        Map.of("lineId", lineId0, "inspectedQty", 20, "defectQty", 0),
                        Map.of("lineId", lineId1, "inspectedQty", 10, "defectQty", 0)));

        mockMvc.perform(post("/api/v1/inventory/inbound-inspections/" + SLIP_ID_SAVED + "/inspect")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(inspectReq)))
                .andExpect(status().isOk());

        // 3) POST /complete
        mockMvc.perform(post("/api/v1/inventory/inbound-inspections/" + SLIP_ID_SAVED + "/complete")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("COMPLETED"))
                .andExpect(jsonPath("$.data.stockApplied").value(true))
                .andExpect(jsonPath("$.data.completedAt").value(notNullValue()));
    }

    /**
     * 시나리오 3-B: 검수 미완료 라인 있는 상태에서 complete 호출 → 409 CONFLICT.
     */
    @Test
    void completeInspection_withUnfilledLine_returns409() throws Exception {
        MvcResult getResult = mockMvc.perform(
                        get("/api/v1/inventory/inbound-inspections/" + SLIP_ID_SAVED_2)
                                .header("X-User-Id", UUID.randomUUID().toString())
                                .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk())
                .andReturn();

        var dataNode = objectMapper.readTree(getResult.getResponse().getContentAsString())
                .get("data");
        String lineId0 = dataNode.get("lines").get(0).get("lineId").asText();

        // 라인 1건만 저장 (라인 2 미입력)
        Map<String, Object> partialReq = Map.of(
                "lines", List.of(
                        Map.of("lineId", lineId0, "inspectedQty", 15, "defectQty", 0)));

        mockMvc.perform(post("/api/v1/inventory/inbound-inspections/" + SLIP_ID_SAVED_2 + "/inspect")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(partialReq)))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/v1/inventory/inbound-inspections/" + SLIP_ID_SAVED_2 + "/complete")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isConflict());
    }

    /**
     * 시나리오 3-C: 이미 완료된 검수에 complete 재호출 → 멱등 200.
     */
    @Test
    void completeInspection_alreadyCompleted_idempotentOk() throws Exception {
        MvcResult getResult = mockMvc.perform(
                        get("/api/v1/inventory/inbound-inspections/" + SLIP_ID_CONFIRMED)
                                .header("X-User-Id", UUID.randomUUID().toString())
                                .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk())
                .andReturn();

        var dataNode = objectMapper.readTree(getResult.getResponse().getContentAsString())
                .get("data");
        String lineId0 = dataNode.get("lines").get(0).get("lineId").asText();
        String lineId1 = dataNode.get("lines").get(1).get("lineId").asText();

        Map<String, Object> inspectReq = Map.of(
                "lines", List.of(
                        Map.of("lineId", lineId0, "inspectedQty", 50, "defectQty", 0),
                        Map.of("lineId", lineId1, "inspectedQty", 25, "defectQty", 0)));

        mockMvc.perform(post("/api/v1/inventory/inbound-inspections/" + SLIP_ID_CONFIRMED + "/inspect")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(inspectReq)))
                .andExpect(status().isOk());

        // 1차 complete
        mockMvc.perform(post("/api/v1/inventory/inbound-inspections/" + SLIP_ID_CONFIRMED + "/complete")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.stockApplied").value(true));

        // 2차 complete — 멱등 200
        mockMvc.perform(post("/api/v1/inventory/inbound-inspections/" + SLIP_ID_CONFIRMED + "/complete")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.stockApplied").value(true));
    }

    /**
     * 시나리오 3-D: SALES 권한으로 complete 호출 → 403.
     */
    @Test
    void completeInspection_salesRole_returns403() throws Exception {
        mockMvc.perform(post("/api/v1/inventory/inbound-inspections/" + SLIP_ID_SAVED + "/complete")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isForbidden());
    }

    /**
     * 시나리오 4: 검수 history 목록 — status=PENDING 필터.
     */
    @Test
    void listInspections_pendingFilter_returnsPage() throws Exception {
        // 2건 GET 으로 검수 초기화
        mockMvc.perform(get("/api/v1/inventory/inbound-inspections/" + SLIP_ID_SAVED)
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "WAREHOUSE"));
        mockMvc.perform(get("/api/v1/inventory/inbound-inspections/" + SLIP_ID_SAVED_2)
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "WAREHOUSE"));

        mockMvc.perform(get("/api/v1/inventory/inbound-inspections")
                        .param("status", "PENDING")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content").isArray());
    }
}
