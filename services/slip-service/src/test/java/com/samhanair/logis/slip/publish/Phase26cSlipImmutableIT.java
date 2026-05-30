package com.samhanair.logis.slip.publish;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.PartnerInternalClient.PartnerVerifyResult;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.it.AbstractPostgresIT;
import com.samhanair.logis.slip.repository.SlipRepository;
import java.math.BigDecimal;
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
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Phase 2.6c — 주문전환 전표 발행 즉시 불변 IT.
 *
 * <p>PARTNER_ORDER sourceType 전표는 발행 즉시 DRAFT→SAVED→SENT 전이하여
 * EDITABLE_STATUSES 를 벗어난다. 수정/삭제 시도는 409 CONFLICT 를 반환해야 한다.
 *
 * <p>다른 sourceType(ESTIMATE) 전표는 DRAFT 상태 유지 (회귀 방지).
 *
 * <p><b>검증 케이스:</b>
 * <ol>
 *   <li>PARTNER_ORDER 전환 전표 발행 → 상태 SENT 확인</li>
 *   <li>PARTNER_ORDER 전환 전표 수정 시도 → 409 CONFLICT</li>
 *   <li>PARTNER_ORDER 전환 전표 삭제 시도 → 409/4xx</li>
 *   <li>ESTIMATE 경유 전표 발행 → 상태 DRAFT 유지 (회귀)</li>
 * </ol>
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "app.publish.warehouse-code-map.WH-001=11111111-1111-1111-1111-111111111111",
        "app.publish.warehouse-code-map.00003=11111111-1111-1111-1111-111111111111",
        "app.publish.warehouse-code-map.2=22222222-2222-2222-2222-222222222222",
})
class Phase26cSlipImmutableIT extends AbstractPostgresIT {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private SlipRepository slipRepository;

    @MockBean private ProductClient productClient;
    @MockBean private InventoryClient inventoryClient;
    @MockBean private PartnerInternalClient partnerInternalClient;
    @MockBean private UserInternalClient userInternalClient;
    @MockBean private WarehouseInternalClient warehouseInternalClient;

    private static final String MASTER_ID = "99999999-0000-0000-0000-000000000001";
    private static final String MODEL_CODE = "MODEL-26C-IMMUTABLE";
    private static final UUID PRODUCT_ID = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        Mockito.lenient().when(productClient.lookupByModel(Mockito.anyString()))
                .thenReturn(new ProductSummary(PRODUCT_ID, "테스트 상품", MODEL_CODE,
                        null, BigDecimal.valueOf(10000), "ACTIVE"));
        Mockito.lenient().when(partnerInternalClient.verifyPartnerCode(Mockito.anyString()))
                .thenReturn(PartnerVerifyResult.found(java.util.Optional.empty()));
    }

    // ════════════════════════════════════════════════════
    // S1: PARTNER_ORDER 전환 전표 발행 → status=SENT
    // ════════════════════════════════════════════════════

    @Test
    @DisplayName("S1: PARTNER_ORDER 전환 전표 발행 후 status=SENT (불변 전이)")
    void s1_partnerOrderSlip_publishedAsSent() throws Exception {
        String slipNo = publishPartnerOrderSlip("PO-26C-S1");

        Slip saved = slipRepository.findBySlipNo(slipNo).orElseThrow();
        assertThat(saved.getStatus()).isEqualTo(SlipStatus.SENT);
    }

    // ════════════════════════════════════════════════════
    // S2: PARTNER_ORDER 전환 전표 수정 시도 → 409
    // ════════════════════════════════════════════════════

    @Test
    @DisplayName("S2: PARTNER_ORDER 전환 전표(SENT) 수정 시도 → 409 CONFLICT")
    void s2_partnerOrderSlip_updateBlocked() throws Exception {
        String slipNo = publishPartnerOrderSlip("PO-26C-S2");
        Slip slip = slipRepository.findBySlipNo(slipNo).orElseThrow();
        UUID slipId = slip.getId();

        // 매출 전표 수정 endpoint
        Map<String, Object> updateReq = new LinkedHashMap<>();
        updateReq.put("partnerName", "수정 시도 거래처명");
        updateReq.put("updatedAt", slip.getModifiedAt() != null
                ? slip.getModifiedAt().toString() : java.time.LocalDateTime.now().toString());

        mockMvc.perform(put("/api/v1/slips/sales/{id}", slipId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateReq))
                        .header("X-User-Id", MASTER_ID)
                        .header("X-User-Role", "MASTER"))
                .andExpect(status().isConflict());
    }

    // ════════════════════════════════════════════════════
    // S3: PARTNER_ORDER 전환 전표 삭제 시도 → 409/4xx (SENT 이후 삭제 불가)
    // ════════════════════════════════════════════════════

    @Test
    @DisplayName("S3: PARTNER_ORDER 전환 전표(SENT) 삭제 시도 → 409/4xx")
    void s3_partnerOrderSlip_deleteBlocked() throws Exception {
        String slipNo = publishPartnerOrderSlip("PO-26C-S3");
        Slip slip = slipRepository.findBySlipNo(slipNo).orElseThrow();
        UUID slipId = slip.getId();

        mockMvc.perform(delete("/api/v1/slips/sales/{id}", slipId)
                        .header("X-User-Id", MASTER_ID)
                        .header("X-User-Role", "MASTER"))
                .andExpect(result ->
                        assertThat(result.getResponse().getStatus()).isIn(409, 422, 400));
    }

    // ════════════════════════════════════════════════════
    // S4: ESTIMATE 전표 발행 → status=DRAFT 유지 (회귀)
    // ════════════════════════════════════════════════════

    @Test
    @DisplayName("S4: ESTIMATE 경유 전표 발행 후 status=DRAFT 유지 (회귀 방지)")
    void s4_estimateSlip_remainsDraft() throws Exception {
        String idemKey = "EST-26C-S4-" + UUID.randomUUID();
        Map<String, Object> payload = buildEstimatePayload("EST-NO-26C", idemKey);

        MvcResult result = mockMvc.perform(post("/api/v1/slips/from-estimate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(payload))
                        .header("Idempotency-Key", idemKey)
                        .header("X-User-Id", MASTER_ID)
                        .header("X-User-Role", "MASTER"))
                .andExpect(status().isCreated())
                .andReturn();

        JsonNode root = objectMapper.readTree(result.getResponse().getContentAsString());
        String slipNo = root.path("data").path("slipNo").asText();

        Slip saved = slipRepository.findBySlipNo(slipNo).orElseThrow();
        // ESTIMATE 전표는 DRAFT 상태 유지 (불변 전이 미적용)
        assertThat(saved.getStatus()).isEqualTo(SlipStatus.DRAFT);
    }

    // ════════════════════════════════════════════════════
    // 헬퍼
    // ════════════════════════════════════════════════════

    /**
     * PARTNER_ORDER 전환 전표를 발행하고 slipNo 를 반환한다.
     */
    private String publishPartnerOrderSlip(String partnerOrderId) throws Exception {
        String idemKey = "PO-CONV-" + partnerOrderId + "-" + UUID.randomUUID().toString().substring(0, 8);
        Map<String, Object> payload = buildPartnerOrderPayload(partnerOrderId, idemKey);

        MvcResult result = mockMvc.perform(post("/api/v1/slips/from-partner-order")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(payload))
                        .header("Idempotency-Key", idemKey)
                        .header("X-User-Id", MASTER_ID)
                        .header("X-User-Role", "MASTER"))
                .andExpect(status().isCreated())
                .andReturn();

        JsonNode root = objectMapper.readTree(result.getResponse().getContentAsString());
        return root.path("data").path("slipNo").asText();
    }

    private Map<String, Object> buildPartnerOrderPayload(String partnerOrderId, String idemKey) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("partnerOrderId", partnerOrderId);
        payload.put("partnerCode", "TEST-PARTNER");
        payload.put("bizCode", "9999999999");
        payload.put("orderNo", "2026/05/31-" + partnerOrderId.hashCode());
        payload.put("ioDate", "20260531");
        payload.put("warehouseCode", "WH-001");
        payload.put("partnerName", "테스트 거래처");
        payload.put("lines", List.of(buildLine()));
        return payload;
    }

    private Map<String, Object> buildEstimatePayload(String estimateNo, String idemKey) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("estimateNumber", estimateNo);
        payload.put("partnerCode", "TEST-PARTNER");
        payload.put("bizCode", "9999999999");
        payload.put("ioDate", "20260531");
        payload.put("warehouseCode", "00003");
        payload.put("partnerName", "테스트 거래처");
        payload.put("lines", List.of(buildLine()));
        return payload;
    }

    private Map<String, Object> buildLine() {
        Map<String, Object> line = new LinkedHashMap<>();
        line.put("productCode", MODEL_CODE);
        line.put("qty", "1");
        line.put("unitPriceVat", BigDecimal.valueOf(10000));
        return line;
    }
}
