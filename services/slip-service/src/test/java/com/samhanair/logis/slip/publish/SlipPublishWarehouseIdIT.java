package com.samhanair.logis.slip.publish;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
import com.samhanair.logis.slip.it.AbstractPostgresIT;
import com.samhanair.logis.slip.repository.SlipRepository;
import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
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
 * 슬라이스 C — from-partner-order 발행의 창고 식별자 해석 IT.
 *
 * <ul>
 *   <li>warehouseId(UUID) 가 payload 에 있으면 yml 미경유로 그대로 sourceWarehouseId 저장.</li>
 *   <li>warehouseId 가 없으면 WarehouseCodeMapper(yml) 폴백으로 warehouseCode 해석(회귀).</li>
 * </ul>
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "app.publish.warehouse-code-map.WH-001=11111111-1111-1111-1111-000000000001",
})
class SlipPublishWarehouseIdIT extends AbstractPostgresIT {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private SlipRepository slipRepository;

    @MockBean private ProductClient productClient;
    @MockBean private InventoryClient inventoryClient;
    @MockBean private PartnerInternalClient partnerInternalClient;
    @MockBean private UserInternalClient userInternalClient;
    @MockBean private WarehouseInternalClient warehouseInternalClient;

    private static final String MASTER_ID = "99999999-0000-0000-0000-000000000001";
    private static final String MODEL_CODE = "MODEL-SLICE-C";
    private static final UUID PRODUCT_ID = UUID.randomUUID();
    private static final UUID PARTNER_ID =
            UUID.fromString("dddddddd-1111-4111-8111-dddddddddddd");
    /** convert 경로가 전달하는 inventory 해석 UUID — yml 값(…1111) 과 다름. */
    private static final String INVENTORY_WAREHOUSE_ID = "11111111-1111-1111-1111-000000000001";

    @BeforeEach
    void setUp() {
        Mockito.lenient().when(productClient.lookupByModel(Mockito.anyString()))
                .thenReturn(new ProductSummary(PRODUCT_ID, "테스트 상품", MODEL_CODE,
                        null, BigDecimal.valueOf(10000), "ACTIVE"));
        Mockito.lenient().when(partnerInternalClient.verifyPartnerCode(Mockito.anyString()))
                .thenReturn(PartnerVerifyResult.found(Optional.of(PARTNER_ID)));
    }

    @Test
    @DisplayName("warehouseId payload 존재 → yml 미경유, sourceWarehouseId = 전달 UUID")
    void warehouseId_present_usedDirectly() throws Exception {
        String slipNo = publish("PO-SLICE-C-1", INVENTORY_WAREHOUSE_ID);

        Slip saved = slipRepository.findBySlipNo(slipNo).orElseThrow();
        assertThat(saved.getSourceWarehouseId())
                .isEqualTo(UUID.fromString(INVENTORY_WAREHOUSE_ID));
    }

    @Test
    @DisplayName("warehouseId 없음 → yml 폴백으로 warehouseCode 해석 (회귀)")
    void warehouseId_absent_fallsBackToYml() throws Exception {
        String slipNo = publish("PO-SLICE-C-2", null);

        Slip saved = slipRepository.findBySlipNo(slipNo).orElseThrow();
        assertThat(saved.getSourceWarehouseId())
                .isEqualTo(UUID.fromString(INVENTORY_WAREHOUSE_ID));
    }

    private String publish(String partnerOrderId, String warehouseId) throws Exception {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("partnerOrderId", partnerOrderId);
        payload.put("partnerCode", "TEST-PARTNER");
        payload.put("bizCode", "123-45-67890");
        payload.put("ioDate", "20260531");
        payload.put("warehouseCode", "WH-001");
        if (warehouseId != null) {
            payload.put("warehouseId", warehouseId);
        }
        payload.put("partnerName", "테스트 거래처");
        Map<String, Object> line = new LinkedHashMap<>();
        line.put("productCode", MODEL_CODE);
        line.put("qty", "1");
        line.put("unitPriceVat", BigDecimal.valueOf(10000));
        payload.put("lines", List.of(line));

        MvcResult result = mockMvc.perform(
                        post("/api/v1/slips/from-partner-order")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(objectMapper.writeValueAsString(payload))
                                .header("Idempotency-Key", "IDEM-" + partnerOrderId)
                                .header("X-User-Id", MASTER_ID)
                                .header("X-User-Role", "MASTER"))
                .andExpect(status().isCreated())
                .andReturn();

        JsonNode root = objectMapper.readTree(result.getResponse().getContentAsString());
        return root.path("data").path("slipNo").asText();
    }
}
