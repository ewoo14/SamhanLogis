package com.samhanair.logis.slip.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.ArologisDispatchClient;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import com.samhanair.logis.slip.repository.SlipRepository;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * DPS 입고비교용 internal 출고전표 라인 조회 IT.
 *
 * <p>inventory-service {@code SlipServiceClient.getOutboundSlips} 의 실제 호출 대상인
 * {@code GET /internal/slips/outbound-lines} 계약을 검증한다.
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class SlipOutboundInternalControllerIT extends AbstractPostgresIT {

    private static final String INTERNAL_TOKEN = "test-internal-token";
    private static final String URL = "/internal/slips/outbound-lines";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private SlipRepository slipRepository;

    @MockBean private InventoryClient inventoryClient;
    @MockBean private ProductClient productClient;
    @MockBean private UserInternalClient userInternalClient;
    @MockBean private WarehouseInternalClient warehouseInternalClient;
    @MockBean private PartnerInternalClient partnerInternalClient;
    @MockBean private ArologisDispatchClient arologisDispatchClient;

    @Test
    void findOutboundSlips_returnsFlattenedLines_andExcludesOutsidePeriod() throws Exception {
        String inProductCode = "DPS-MODEL-" + System.nanoTime();
        String outsideProductCode = "DPS-OUTSIDE-" + System.nanoTime();
        Slip inPeriod = persistOutbound(uniqueSlipNo("2026/06/10"), LocalDate.of(2026, 6, 10),
                "P-DPS", "DPS 거래처", inProductCode, "DPS 품목", 7);
        persistOutbound(uniqueSlipNo("2026/06/12"), LocalDate.of(2026, 6, 12),
                "P-OUT", "범위밖 거래처", outsideProductCode, "범위밖 품목", 3);

        MvcResult result = mockMvc.perform(get(URL)
                        .header("X-Internal-Token", INTERNAL_TOKEN)
                        .param("from", "2026-06-10")
                        .param("to", "2026-06-10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data").isArray())
                .andReturn();

        String raw = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode rows = objectMapper.readTree(raw).get("data");
        JsonNode row = findByProductCode(rows, inProductCode);
        assertThat(row).isNotNull();
        assertThat(row.get("slipNo").asText()).isEqualTo(inPeriod.getSlipNo());
        assertThat(row.get("slipDate").asText()).isEqualTo("2026-06-10");
        assertThat(row.get("partnerCode").asText()).isEqualTo("P-DPS");
        assertThat(row.get("partnerName").asText()).isEqualTo("DPS 거래처");
        assertThat(row.get("productCode").asText()).isEqualTo(inProductCode);
        assertThat(row.get("productName").asText()).isEqualTo("DPS 품목");
        assertThat(row.get("quantity").asInt()).isEqualTo(7);
        assertThat(raw).doesNotContain(outsideProductCode);
    }

    @Test
    void findOutboundSlips_emptyResult_returnsEmptyList() throws Exception {
        mockMvc.perform(get(URL)
                        .header("X-Internal-Token", INTERNAL_TOKEN)
                        .param("from", "2099-07-01")
                        .param("to", "2099-07-02"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data").isArray())
                .andExpect(jsonPath("$.data").isEmpty());
    }

    @Test
    void findOutboundSlips_fromAfterTo_returns400() throws Exception {
        mockMvc.perform(get(URL)
                        .header("X-Internal-Token", INTERNAL_TOKEN)
                        .param("from", "2026-06-11")
                        .param("to", "2026-06-10"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void findOutboundSlips_missingInternalToken_returns403() throws Exception {
        mockMvc.perform(get(URL)
                        .param("from", "2026-06-10")
                        .param("to", "2026-06-10"))
                .andExpect(status().isForbidden());
    }

    @Test
    void findOutboundSlips_invalidInternalToken_returns401() throws Exception {
        mockMvc.perform(get(URL)
                        .header("X-Internal-Token", "wrong-token")
                        .param("from", "2026-06-10")
                        .param("to", "2026-06-10"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void findOutboundSlipSummaries_returnsDtoContract_withoutUuid() throws Exception {
        String productCode = "D-1013-" + System.nanoTime();
        Slip slip = persistOutbound(uniqueSlipNo("2026/06/08"), LocalDate.of(2026, 6, 8),
                "P-1013", "D-1013 거래처", productCode, "D-1013 품목", 4);

        MvcResult result = mockMvc.perform(get("/internal/slips/outbound")
                        .header("X-Internal-Token", INTERNAL_TOKEN)
                        .param("from", "2026-06-08")
                        .param("to", "2026-06-08"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data[0].slipNo").value(slip.getSlipNo()))
                .andExpect(jsonPath("$.data[0].partnerCode").value("P-1013"))
                .andExpect(jsonPath("$.data[0].partnerName").value("D-1013 거래처"))
                .andExpect(jsonPath("$.data[0].slipDate").value("2026-06-08"))
                .andExpect(jsonPath("$.data[0].lines[0].productName").value("D-1013 품목"))
                .andExpect(jsonPath("$.data[0].lines[0].quantity").value(4))
                .andReturn();

        String raw = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(raw).doesNotContain("\"id\"")
                .doesNotContain("\"slipId\"")
                .doesNotContain("\"partnerId\"");
    }

    private Slip persistOutbound(String slipNo, LocalDate slipDate, String partnerCode,
                                 String partnerName, String modelName, String productName,
                                 int quantity) {
        Slip slip = Slip.createOutbound(
                slipNo,
                slipDate,
                (int) (System.nanoTime() % 100000) + 1,
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                partnerName,
                null,
                "DPS IT",
                "tester");
        slip.setPartnerCode(partnerCode);
        slip.addLine(SlipLine.create(
                slip,
                UUID.randomUUID(),
                productName,
                modelName,
                "SPEC",
                quantity,
                new BigDecimal("1000.00"),
                null));
        return slipRepository.saveAndFlush(slip);
    }

    private JsonNode findByProductCode(JsonNode rows, String productCode) {
        for (JsonNode row : rows) {
            JsonNode productCodeNode = row.get("productCode");
            if (productCodeNode != null && productCode.equals(productCodeNode.asText())) {
                return row;
            }
        }
        return null;
    }

    private String uniqueSlipNo(String datePrefix) {
        return datePrefix + "-DPS-" + (System.nanoTime() % 100000);
    }
}
