package com.samhanair.logis.slip.publish;

import static org.hamcrest.Matchers.notNullValue;
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
import com.samhanair.logis.slip.domain.SlipLine;
import com.samhanair.logis.slip.it.AbstractPostgresIT;
import com.samhanair.logis.slip.repository.SlipRepository;
import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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
import org.springframework.test.web.servlet.MvcResult;

/**
 * P0-B — {@code POST /internal/slips/from-estimate} X-Internal-Token 게이트 enforcement IT.
 *
 * <p>권한 enforcement 실 HTTP 회귀 의무({@code feedback_enforcement_real_http_test}): MockMvc 가
 * {@code InternalTokenFilter} 를 포함한 실 SecurityFilterChain 을 통과시켜 토큰 게이트 자체를 검증한다.
 *
 * <p>커버리지:
 * <ul>
 *   <li>유효 토큰 → 201 + slipNo</li>
 *   <li>토큰 미제시 → 403 (allow-missing-token=true 표준 → 미인증 → authenticated() 차단)</li>
 *   <li>토큰 불일치 → 401 (filter 즉시 차단)</li>
 *   <li>멱등 재호출(같은 키 + 같은 본문) → 200 replay</li>
 * </ul>
 *
 * <p>외부 client 는 {@code feedback_it_mockbean_external_clients} 에 따라 전부 @MockBean 격리.
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "app.publish.warehouse-code-map.00003=11111111-1111-1111-1111-000000000001",
        "app.publish.warehouse-code-map.2=11111111-1111-1111-1111-000000000002"
})
class InternalSlipPublishControllerIT extends AbstractPostgresIT {

    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    // AbstractPostgresIT 의 @DynamicPropertySource 가 app.security.internal.token 을
    // 고정 주입(TestPropertySource 보다 우선) — 그 값과 일치해야 한다.
    private static final String VALID_TOKEN = "test-internal-token";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private SlipRepository slipRepository;

    @MockBean
    private ProductClient productClient;

    @MockBean
    private InventoryClient inventoryClient;

    @MockBean
    private PartnerInternalClient partnerInternalClient;

    @MockBean
    private UserInternalClient userInternalClient;

    @MockBean
    private WarehouseInternalClient warehouseInternalClient;

    @BeforeEach
    void setupMocks() {
        Mockito.lenient().when(userInternalClient.resolveFullName(ArgumentMatchers.any()))
                .thenReturn(java.util.Optional.of("담당자"));
        Mockito.lenient().when(productClient.lookupByModel(ArgumentMatchers.anyString()))
                .thenAnswer(inv -> new ProductSummary(
                        UUID.randomUUID(), "테스트 제품", inv.getArgument(0, String.class),
                        UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE"));
        Mockito.lenient().when(productClient.lookup(ArgumentMatchers.anyList()))
                .thenReturn(List.of());
        Mockito.lenient().when(partnerInternalClient.verifyPartnerCode(ArgumentMatchers.anyString()))
                .thenReturn(PartnerVerifyResult.found(java.util.Optional.empty()));
    }

    @Test
    void 유효_토큰_201_신규발행() throws Exception {
        mockMvc.perform(post("/internal/slips/from-estimate")
                        .header(INTERNAL_TOKEN_HEADER, VALID_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(estimateBody("WEB-INT-0001"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.slipId").value(notNullValue()))
                .andExpect(jsonPath("$.data.slipNo").value(notNullValue()));
    }

    @Test
    void 내부_견적발행도_견적과_같은_VAT_반올림을_사용한다() throws Exception {
        Map<String, Object> body = estimateBody("WEB-INT-VAT-ROUNDING");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> lines = (List<Map<String, Object>>) body.get("lines");
        lines.get(0).put("qty", "1");
        lines.get(0).put("unitPriceExVat", 100005);
        lines.get(0).put("unitPriceVat", 110005);
        lines.get(0).remove("supplyAmount");
        lines.get(0).remove("vatAmount");

        MvcResult result = mockMvc.perform(post("/internal/slips/from-estimate")
                        .header(INTERNAL_TOKEN_HEADER, VALID_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();
        UUID slipId = UUID.fromString(
                objectMapper.readTree(result.getResponse().getContentAsString())
                        .get("data").get("slipId").asText());
        SlipLine line = slipRepository.findByIdWithLines(slipId).orElseThrow().getLines().get(0);

        org.assertj.core.api.Assertions.assertThat(line.getSupplyAmount()).isEqualByComparingTo("100005");
        org.assertj.core.api.Assertions.assertThat(line.getVatAmount()).isEqualByComparingTo("10000");
    }

    @Test
    void 토큰_미제시_403_차단() throws Exception {
        mockMvc.perform(post("/internal/slips/from-estimate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(estimateBody("WEB-INT-NOAUTH"))))
                .andExpect(status().isForbidden());
    }

    @Test
    void 토큰_미제시_X_User_헤더_위조_403_차단() throws Exception {
        // gateway 신뢰 모델의 X-User-* 헤더를 위조해도 /internal/** 는
        // system-internal principal 강제라 HeaderAuthenticationFilter 인증으로 우회 불가
        mockMvc.perform(post("/internal/slips/from-estimate")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(estimateBody("WEB-INT-FORGED"))))
                .andExpect(status().isForbidden());
    }

    @Test
    void 유효_토큰과_X_User_헤더_동시제시_201_토큰우선() throws Exception {
        mockMvc.perform(post("/internal/slips/from-estimate")
                        .header(INTERNAL_TOKEN_HEADER, VALID_TOKEN)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(estimateBody("WEB-INT-BOTH"))))
                .andExpect(status().isCreated());
    }

    @Test
    void 토큰_불일치_401_즉시차단() throws Exception {
        mockMvc.perform(post("/internal/slips/from-estimate")
                        .header(INTERNAL_TOKEN_HEADER, "wrong-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(estimateBody("WEB-INT-BADTOKEN"))))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void 멱등_재호출_200_replay() throws Exception {
        Map<String, Object> body = estimateBody("WEB-INT-IDEM-001");

        mockMvc.perform(post("/internal/slips/from-estimate")
                        .header(INTERNAL_TOKEN_HEADER, VALID_TOKEN)
                        .header("Idempotency-Key", "idem-int-001")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated());

        mockMvc.perform(post("/internal/slips/from-estimate")
                        .header(INTERNAL_TOKEN_HEADER, VALID_TOKEN)
                        .header("Idempotency-Key", "idem-int-001")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.idempotentReplay").value(true));
    }

    private Map<String, Object> estimateBody(String estimateNumber) {
        Map<String, Object> line = new LinkedHashMap<>();
        line.put("lineNo", 1);
        line.put("productCode", "MOD-220V-4HP");
        line.put("productName", "에어컨");
        line.put("spec", "220V 4HP");
        line.put("qty", "2");
        line.put("unitPriceExVat", 100000);
        line.put("unitPriceVat", 110000);
        line.put("supplyAmount", 200000);
        line.put("vatAmount", 20000);
        line.put("remarks", "라인 메모");

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("estimateNumber", estimateNumber);
        body.put("ioDate", "20260610");
        body.put("partnerCode", "CUST-0001");
        body.put("partnerName", "테스트 거래처");
        body.put("employeeCode", "EMP-0001");
        body.put("warehouseCode", "00003");
        body.put("ioType", "10");
        body.put("shippingAddress", "서울 강남구");
        body.put("receiverPhone", "010-0000-0000");
        body.put("lines", new java.util.ArrayList<>(List.of(line)));
        return body;
    }
}
