package com.samhanair.logis.slip.publish;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.PartnerInternalClient.PartnerVerifyResult;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.it.AbstractPostgresIT;
import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * PR-G1 backlog #1 — partner 404 hybrid policy 검증 (strict ON).
 *
 * <p>strict ON 매트릭스 (2 case):
 * <ol>
 *   <li>partner FOUND  → 201 정상 발행</li>
 *   <li>partner NOT_FOUND (404) → 404 + "거래처를 먼저 등록하세요" 안내</li>
 * </ol>
 *
 * <p>strict OFF 매트릭스는 {@link SlipPublishPartnerStrictOffIT} 가 별도 검증 (서로 다른
 * application property 가 필요해 SpringBootTest context 분리).
 *
 * <p>외부 client {@code @MockBean} 격리 ({@code feedback_it_mockbean_external_clients}).
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "app.slip.partner-strict-validation=true",
        "app.publish.warehouse-code-map.00003=11111111-1111-1111-1111-000000000001"
})
class SlipPublishPartnerStrictIT extends AbstractPostgresIT {

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ObjectMapper objectMapper;
    @MockBean
    private ProductClient productClient;
    @MockBean
    private InventoryClient inventoryClient;
    @MockBean
    private PartnerInternalClient partnerInternalClient;
    /** SP-08-FU1 — UserInternalClient @MockBean 격리 (ownerFullName graceful fallback). */
    @MockBean
    private UserInternalClient userInternalClient;
    /** SP-08-FU2 P2-2 — WarehouseInternalClient @MockBean 격리. */
    @MockBean
    private WarehouseInternalClient warehouseInternalClient;

    @BeforeEach
    void setup() {
        Mockito.lenient().when(userInternalClient.resolveFullName(org.mockito.ArgumentMatchers.any()))
                .thenReturn(Optional.of("담당자"));
        Mockito.lenient().when(productClient.lookupByModel(ArgumentMatchers.anyString()))
                .thenAnswer(inv -> new ProductSummary(
                        UUID.randomUUID(), "테스트 제품", inv.getArgument(0, String.class),
                        UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE"));
    }

    @Test
    void case1_strictOn_partnerFound_returns201() throws Exception {
        Mockito.when(partnerInternalClient.verifyPartnerCode("CUST-OK"))
                .thenReturn(PartnerVerifyResult.found(Optional.of(UUID.randomUUID())));

        Map<String, Object> body = PartnerStrictTestSupport.baseEstimateBody("EST-STRICT-OK", "CUST-OK");

        mockMvc.perform(post("/api/v1/slips/from-estimate")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .header("Idempotency-Key", "idem-strict-ok")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.slipNo").exists());
    }

    @Test
    void case2_strictOn_partnerNotFound_returns404_withGuidance() throws Exception {
        Mockito.when(partnerInternalClient.verifyPartnerCode("CUST-MISSING"))
                .thenReturn(PartnerVerifyResult.notFound());

        Map<String, Object> body = PartnerStrictTestSupport.baseEstimateBody(
                "EST-STRICT-MISSING", "CUST-MISSING");

        mockMvc.perform(post("/api/v1/slips/from-estimate")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .header("Idempotency-Key", "idem-strict-missing")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.containsString("거래처")));
    }

    /**
     * 공통 body 헬퍼 — strict ON / strict OFF IT 가 공유.
     */
    static final class PartnerStrictTestSupport {

        private PartnerStrictTestSupport() {
            // utility class
        }

        static Map<String, Object> baseEstimateBody(String estimateNumber, String partnerCode) {
            Map<String, Object> line = new LinkedHashMap<>();
            line.put("lineNo", 1);
            line.put("productCode", "MOD-220V-4HP");
            line.put("productName", "에어컨");
            line.put("spec", "220V 4HP");
            line.put("qty", "1");
            line.put("unitPriceExVat", 100000);
            line.put("unitPriceVat", 110000);
            line.put("supplyAmount", 100000);
            line.put("vatAmount", 10000);
            line.put("remarks", "라인 메모");

            Map<String, Object> body = new LinkedHashMap<>();
            body.put("estimateNumber", estimateNumber);
            body.put("ioDate", "20260504");
            body.put("partnerCode", partnerCode);
            body.put("partnerName", "테스트 거래처");
            body.put("employeeCode", "EMP-0001");
            body.put("warehouseCode", "00003");
            body.put("lines", List.of(line));
            return body;
        }
    }
}
