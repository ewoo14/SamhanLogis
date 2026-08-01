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
 * PR-G1 backlog #1 — partner 404 hybrid policy 검증 (strict OFF).
 *
 * <p>strict OFF 매트릭스 (2 case):
 * <ol>
 *   <li>partner FOUND  → 201 (lookup skip, raw 저장) + verify 호출 0회</li>
 *   <li>partner NOT_FOUND → 201 (lookup skip, raw 저장) + verify 호출 0회</li>
 * </ol>
 *
 * <p>strict ON 매트릭스는 {@link SlipPublishPartnerStrictIT} 가 별도 검증.
 *
 * <p>외부 client {@code @MockBean} 격리 ({@code feedback_it_mockbean_external_clients}).
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "app.slip.partner-strict-validation=false",
        "app.publish.warehouse-code-map.00003=11111111-1111-1111-1111-000000000001"
})
class SlipPublishPartnerStrictOffIT extends AbstractPostgresIT {

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
                .thenReturn(java.util.Optional.of("담당자"));
        Mockito.lenient().when(productClient.lookupByModel(ArgumentMatchers.anyString()))
                .thenAnswer(inv -> new ProductSummary(
                        UUID.randomUUID(), "테스트 제품", inv.getArgument(0, String.class),
                        UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE"));
    }

    @Test
    void case3_strictOff_partnerFound_returns201_lookupSkipped() throws Exception {
        // strict OFF → verifyPartnerCode 호출 안 됨. 스텁이 호출되어도 OK (lenient).
        Mockito.lenient().when(partnerInternalClient.verifyPartnerCode(ArgumentMatchers.anyString()))
                .thenReturn(PartnerVerifyResult.found(Optional.of(UUID.randomUUID())));

        Map<String, Object> body = SlipPublishPartnerStrictIT.PartnerStrictTestSupport
                .baseEstimateBody("EST-NOSTRICT-OK", "CUST-EXIST");

        mockMvc.perform(post("/api/v1/slips/from-estimate")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .header("Idempotency-Key", "idem-nostrict-ok")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.slipNo").exists());

        // lookup 자체 skip — verifyPartnerCode 호출 0회 회귀 가드
        Mockito.verify(partnerInternalClient, Mockito.never())
                .verifyPartnerCode(ArgumentMatchers.anyString());
    }

    @Test
    void case4_strictOff_partnerNotFound_returns201_rawStored() throws Exception {
        Mockito.lenient().when(partnerInternalClient.verifyPartnerCode(ArgumentMatchers.anyString()))
                .thenReturn(PartnerVerifyResult.notFound());

        Map<String, Object> body = SlipPublishPartnerStrictIT.PartnerStrictTestSupport
                .baseEstimateBody("EST-NOSTRICT-MISSING", "CUST-NOT-IN-DB");

        mockMvc.perform(post("/api/v1/slips/from-estimate")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .header("Idempotency-Key", "idem-nostrict-missing")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.slipNo").exists());

        Mockito.verify(partnerInternalClient, Mockito.never())
                .verifyPartnerCode(ArgumentMatchers.anyString());
    }
}
