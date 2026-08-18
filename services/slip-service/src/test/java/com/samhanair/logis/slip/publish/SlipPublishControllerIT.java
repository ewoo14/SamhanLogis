package com.samhanair.logis.slip.publish;

import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
import com.samhanair.logis.slip.domain.UnitPriceDomain;
import com.samhanair.logis.slip.it.AbstractPostgresIT;
import com.samhanair.logis.slip.it.OpaqueUuidTestDecoder;
import com.samhanair.logis.slip.repository.SlipRepository;
import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.ArgumentMatchers;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Phase 6 M5 (slip-service-integration) — 통합 발행 endpoint IT.
 *
 * <p>커버리지:
 * <ul>
 *   <li>happy path — {@code POST /api/v1/slips/from-estimate} 201 + slipNo 응답</li>
 *   <li>happy path — {@code POST /api/v1/slips/from-partner-order} 201</li>
 *   <li>idempotency — 같은 키 + 같은 본문 → 200 + replay flag + 동일 slipNo</li>
 *   <li>idempotency — 같은 키 + 다른 본문 → 409 Conflict</li>
 *   <li>{@code GET /api/v1/slips/by-source} — sourceType + sourceId 조회</li>
 *   <li>warehouseCode 매핑 누락 → 400</li>
 *   <li>인증 누락 → 403</li>
 * </ul>
 *
 * <p>외부 client 격리 ({@code feedback_it_mockbean_external_clients.md}):
 * <ul>
 *   <li>{@link ProductClient} — lookupByModel 가 가짜 ProductSummary 반환</li>
 *   <li>{@link InventoryClient} — 발행만 검증, accept/complete 호출 X 이므로 사용 안 됨 (lenient mock)</li>
 * </ul>
 *
 * <p>{@code @TestPropertySource} 로 warehouse-code-map 주입.
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "app.publish.warehouse-code-map.00003=11111111-1111-1111-1111-000000000001",
        "app.publish.warehouse-code-map.2=11111111-1111-1111-1111-000000000002",
        "app.publish.warehouse-code-map.14=11111111-1111-1111-1111-000000000003",
        "app.publish.warehouse-code-map.1=11111111-1111-1111-1111-000000000004"
})
class SlipPublishControllerIT extends AbstractPostgresIT {

    private static final UUID RESOLVED_PARTNER_ID =
            UUID.fromString("aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private SlipRepository slipRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @MockBean
    private ProductClient productClient;

    @MockBean
    private InventoryClient inventoryClient;

    /**
     * PR-G1 backlog #1 — partner strict 검증 client. 기본은 FOUND 반환 (기존 happy-path IT 보존),
     * strict-on-not-found IT 는 별도 {@link SlipPublishPartnerStrictIT} 에서 검증.
     */
    @MockBean
    private PartnerInternalClient partnerInternalClient;
    /** SP-08-FU1 — UserInternalClient @MockBean 격리 (ownerFullName graceful fallback). */
    @MockBean
    private UserInternalClient userInternalClient;
    /** SP-08-FU2 P2-2 — WarehouseInternalClient @MockBean 격리. */
    @MockBean
    private WarehouseInternalClient warehouseInternalClient;

    @BeforeEach
    void setupMocks() {
        Mockito.lenient().when(userInternalClient.resolveFullName(ArgumentMatchers.any()))
                .thenReturn(java.util.Optional.of("담당자"));
        // lookupByModel — 모든 productCode 에 대해 가짜 ProductSummary 반환.
        Mockito.lenient().when(productClient.lookupByModel(ArgumentMatchers.anyString()))
                .thenAnswer(inv -> new ProductSummary(
                        UUID.randomUUID(), "테스트 제품", inv.getArgument(0, String.class),
                        UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE"));
        // 기존 lookup/requireExists 도 IT 실패 방지용 lenient 처리 (publish 경로는 사용 X).
        Mockito.lenient().when(productClient.lookup(ArgumentMatchers.anyList()))
                .thenReturn(List.of());
        // PR-G1 backlog #1 — strict ON 기본값에서도 happy-path 통과하도록 FOUND 반환.
        Mockito.lenient().when(partnerInternalClient.verifyPartnerCode(ArgumentMatchers.anyString()))
                .thenReturn(PartnerVerifyResult.found(java.util.Optional.of(RESOLVED_PARTNER_ID)));
        Mockito.lenient().when(partnerInternalClient.resolveBusinessNumber(ArgumentMatchers.any()))
                .thenReturn(java.util.Optional.of("230-70-10310"));
    }

    // ---------------- happy path: from-estimate ----------------

    @Test
    void publishFromEstimate_returns201_andSlipNo() throws Exception {
        Map<String, Object> body = estimateBody("EST-2026-0001");

        MvcResult result = mockMvc.perform(post("/api/v1/slips/from-estimate")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .header("Idempotency-Key", "idem-est-001")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.slipId").value(notNullValue()))
                .andExpect(jsonPath("$.data.slipNo").value(notNullValue()))
                .andExpect(jsonPath("$.data.sourceType").value("ESTIMATE"))
                .andExpect(jsonPath("$.data.sourceId").value("EST-2026-0001"))
                .andExpect(jsonPath("$.data.idempotencyKey").value("idem-est-001"))
                .andExpect(jsonPath("$.data.idempotentReplay").value(false))
                .andReturn();
        UUID slipId = OpaqueUuidTestDecoder.decode(objectMapper.readTree(result.getResponse().getContentAsString())
                .get("data").get("slipId").asText());
        org.assertj.core.api.Assertions.assertThat(slipRepository.findById(slipId).orElseThrow()
                .getBusinessNumber()).isEqualTo("230-70-10310");
    }

    @Test
    void publishFromPartnerOrder_withoutBizCode_returns400InsteadOfCreatingUnidentifiedSlip() throws Exception {
        Map<String, Object> body = partnerOrderBody("PO-MISSING-BIZ");
        body.remove("bizCode");
        mockMvc.perform(post("/api/v1/slips/from-partner-order")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER")
                        .header("Idempotency-Key", "idem-po-missing-biz")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest());
    }

    // ---------------- happy path: from-partner-order ----------------

    @Test
    void publishFromPartnerOrder_returns201() throws Exception {
        Map<String, Object> body = partnerOrderBody("2026/04/15-1");
        body.put("bizCode", "230-70-10310");

        MvcResult result = mockMvc.perform(post("/api/v1/slips/from-partner-order")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER")
                        .header("Idempotency-Key", "idem-po-001")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.sourceType").value("PARTNER_ORDER"))
                .andExpect(jsonPath("$.data.sourceId").value("2026/04/15-1"))
                .andReturn();

        UUID slipId = OpaqueUuidTestDecoder.decode(
                objectMapper.readTree(result.getResponse().getContentAsString())
                        .get("data").get("slipId").asText());
        org.assertj.core.api.Assertions.assertThat(slipRepository.findById(slipId).orElseThrow().getPartnerId())
                .isEqualTo(RESOLVED_PARTNER_ID);
        org.assertj.core.api.Assertions.assertThat(slipRepository.findById(slipId).orElseThrow().getBusinessNumber())
                .isEqualTo("230-70-10310");
    }

    @Test
    void publishFromPartnerOrder_persistsOrderNoForSourceDisplay() throws Exception {
        UUID partnerOrderId = UUID.randomUUID();
        String orderNo = "2026/08/18-501";
        Map<String, Object> body = partnerOrderBody(partnerOrderId.toString());
        body.put("orderNo", orderNo);
        body.put("bizCode", "230-70-10310");

        MvcResult result = mockMvc.perform(post("/api/v1/slips/from-partner-order")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER")
                        .header("Idempotency-Key", "idem-po-source-order-no")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();

        UUID slipId = OpaqueUuidTestDecoder.decode(
                objectMapper.readTree(result.getResponse().getContentAsString())
                        .get("data").get("slipId").asText());
        org.assertj.core.api.Assertions.assertThat(jdbcTemplate.queryForObject(
                "SELECT order_no FROM slip_source_orders WHERE slip_id = ?",
                String.class, slipId)).isEqualTo(orderNo);
    }

    @Test
    void 배포전_단건멱등키_배송주소없는_재시도는_기존전표를_replay한다() throws Exception {
        String partnerOrderId = "PO-LEGACY-REPLAY-001";
        String idempotencyKey = "idem-legacy-replay-001";
        Map<String, Object> body = partnerOrderBody(partnerOrderId);
        body.put("deliveryAddress", null);

        MvcResult first = mockMvc.perform(post("/api/v1/slips/from-partner-order")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER")
                        .header("Idempotency-Key", idempotencyKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();

        String slipToken = objectMapper.readTree(first.getResponse().getContentAsString())
                .get("data").get("slipId").asText();
        UUID slipId = OpaqueUuidTestDecoder.decode(slipToken);
        jdbcTemplate.update("UPDATE slip_publish_audit SET request_fingerprint = ? WHERE slip_id = ?",
                legacyPartnerOrderFingerprint(body), slipId);

        mockMvc.perform(post("/api/v1/slips/from-partner-order")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER")
                        .header("Idempotency-Key", idempotencyKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.idempotentReplay").value(true))
                .andExpect(jsonPath("$.data.slipId").value(slipToken));
    }

    @Test
    void publishFromPartnerOrder_doesNotAddVatToVatInclusiveUnitPrice() throws Exception {
        Map<String, Object> body = partnerOrderBody("PO-VAT-DOMAIN-RED");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> lines = (List<Map<String, Object>>) body.get("lines");
        lines.get(0).put("qty", "1");
        lines.get(0).put("unitPriceExVat", 881818);
        lines.get(0).put("unitPriceVat", 970000);
        lines.get(0).put("categoryKey", "homemulti");
        // partner-order-service의 실제 발행 payload처럼 감사용 합계는 생략한다.
        lines.get(0).remove("supplyAmount");
        lines.get(0).remove("vatAmount");

        MvcResult result = mockMvc.perform(post("/api/v1/slips/from-partner-order")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER")
                        .header("Idempotency-Key", "idem-vat-domain-red")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();

        UUID slipId = OpaqueUuidTestDecoder.decode(
                objectMapper.readTree(result.getResponse().getContentAsString())
                        .get("data").get("slipId").asText());
        com.samhanair.logis.slip.domain.SlipLine line = slipRepository.findByIdWithLines(slipId).orElseThrow()
                .getLines().get(0);

        // RED: 현재는 970,000원을 공급가로 저장하고 VAT 97,000원을 다시 더한다.
        org.assertj.core.api.Assertions.assertThat(line.getSupplyAmount()).isEqualByComparingTo("881818");
        org.assertj.core.api.Assertions.assertThat(line.getVatAmount()).isEqualByComparingTo("88182");
        org.assertj.core.api.Assertions.assertThat(line.getUnitPriceWithVat()).isEqualByComparingTo("970000");
        org.assertj.core.api.Assertions.assertThat(line.getUnitPriceDomain()).isEqualTo(UnitPriceDomain.VAT_INCLUSIVE);
        org.assertj.core.api.Assertions.assertThat(line.getCategoryKey()).isEqualTo("homemulti");
    }

    @Test
    void publishFromEstimate_usesQuoteRoundingForVatInclusiveAmounts() throws Exception {
        Map<String, Object> body = estimateBody("EST-VAT-ROUNDING");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> lines = (List<Map<String, Object>>) body.get("lines");
        lines.get(0).put("qty", "1");
        lines.get(0).put("unitPriceExVat", 100005);
        lines.get(0).put("unitPriceVat", 110005);
        lines.get(0).remove("supplyAmount");
        lines.get(0).remove("vatAmount");

        MvcResult result = mockMvc.perform(post("/api/v1/slips/from-estimate")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .header("Idempotency-Key", "idem-est-vat-rounding")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();

        UUID slipId = OpaqueUuidTestDecoder.decode(
                objectMapper.readTree(result.getResponse().getContentAsString())
                        .get("data").get("slipId").asText());
        com.samhanair.logis.slip.domain.SlipLine line = slipRepository.findByIdWithLines(slipId)
                .orElseThrow().getLines().get(0);

        org.assertj.core.api.Assertions.assertThat(line.getSupplyAmount()).isEqualByComparingTo("100005");
        org.assertj.core.api.Assertions.assertThat(line.getVatAmount()).isEqualByComparingTo("10000");
    }

    @Test
    void publishFromPartnerOrder_usesQuoteRoundingForVatInclusiveAmounts() throws Exception {
        Map<String, Object> body = partnerOrderBody("PO-VAT-ROUNDING");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> lines = (List<Map<String, Object>>) body.get("lines");
        lines.get(0).put("qty", "1");
        lines.get(0).put("unitPriceExVat", 100005);
        lines.get(0).put("unitPriceVat", 110005);
        lines.get(0).remove("supplyAmount");
        lines.get(0).remove("vatAmount");

        MvcResult result = mockMvc.perform(post("/api/v1/slips/from-partner-order")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER")
                        .header("Idempotency-Key", "idem-po-vat-rounding")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();
        UUID slipId = OpaqueUuidTestDecoder.decode(
                objectMapper.readTree(result.getResponse().getContentAsString())
                        .get("data").get("slipId").asText());
        com.samhanair.logis.slip.domain.SlipLine line = slipRepository.findByIdWithLines(slipId)
                .orElseThrow().getLines().get(0);

        org.assertj.core.api.Assertions.assertThat(line.getSupplyAmount()).isEqualByComparingTo("100005");
        org.assertj.core.api.Assertions.assertThat(line.getVatAmount()).isEqualByComparingTo("10000");
    }

    @Test
    void 배포전_단건멱등키에_새배송주소를_넣은_재시도는_409다() throws Exception {
        String partnerOrderId = "PO-LEGACY-CONFLICT-001";
        String idempotencyKey = "idem-legacy-conflict-001";
        Map<String, Object> legacyBody = partnerOrderBody(partnerOrderId);
        legacyBody.put("deliveryAddress", null);

        MvcResult first = mockMvc.perform(post("/api/v1/slips/from-partner-order")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER")
                        .header("Idempotency-Key", idempotencyKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(legacyBody)))
                .andExpect(status().isCreated())
                .andReturn();
        UUID slipId = OpaqueUuidTestDecoder.decode(objectMapper.readTree(first.getResponse().getContentAsString())
                .get("data").get("slipId").asText());
        jdbcTemplate.update("UPDATE slip_publish_audit SET request_fingerprint = ? WHERE slip_id = ?",
                legacyPartnerOrderFingerprint(legacyBody), slipId);

        legacyBody.put("deliveryAddress", "서울시 강남구 새 배송지 1");
        mockMvc.perform(post("/api/v1/slips/from-partner-order")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER")
                        .header("Idempotency-Key", idempotencyKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(legacyBody)))
                .andExpect(status().isConflict());
    }

    @ParameterizedTest(name = "partner resolution {0} is fail-closed")
    @MethodSource("partnerResolutionFailures")
    void publishFromPartnerOrder_partnerResolutionFailure_doesNotCreateCommittedSlip(
            String resultName, PartnerVerifyResult result, int expectedStatus, String expectedCode) throws Exception {
        String partnerOrderId = "PO-PARTNER-REQUIRED-" + resultName;
        String idempotencyKey = "idem-partner-required-" + resultName;
        Mockito.when(partnerInternalClient.verifyPartnerCode("CUST-0002"))
                .thenReturn(result);
        Map<String, Object> body = partnerOrderBody(partnerOrderId);

        mockMvc.perform(post("/api/v1/slips/from-partner-order")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER")
                        .header("Idempotency-Key", idempotencyKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().is(expectedStatus))
                .andExpect(jsonPath("$.code").value(expectedCode))
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.containsString("커밋 전표를 발행할 수 없습니다")));

        org.assertj.core.api.Assertions.assertThat(
                        slipRepository.findAllBySourceTypeAndSourceIdAndIsDeletedFalse(
                                com.samhanair.logis.slip.domain.SlipSourceType.PARTNER_ORDER,
                                partnerOrderId))
                .isEmpty();
        org.assertj.core.api.Assertions.assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM slips WHERE idempotency_key = ?", Integer.class, idempotencyKey))
                .isZero();
        org.assertj.core.api.Assertions.assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM slip_publish_audit WHERE source_id = ?",
                Integer.class, partnerOrderId))
                .isZero();
    }

    private static java.util.stream.Stream<Arguments> partnerResolutionFailures() {
        return java.util.stream.Stream.of(
                Arguments.of("not-found", PartnerVerifyResult.notFound(), 400, "INVALID_INPUT"),
                Arguments.of("server-error", PartnerVerifyResult.serverError(), 500, "INTERNAL_ERROR"),
                // #854 R5 — SKIPPED(internal token 미설정)는 SERVER_ERROR 와 구분해 MIG12_INTERNAL_AUTH_MISS
                // (503)로 던진다. partner-order-service SlipServiceClient 는 5xx 를 일괄 재시도 대상으로
                // 취급하므로 outbox 재시도/종결 분류에는 영향이 없다(관측 정밀도만 개선).
                Arguments.of("skipped", PartnerVerifyResult.skipped(java.util.Optional.empty()), 503, "MIG12_INTERNAL_AUTH_MISS"),
                Arguments.of("found-empty", PartnerVerifyResult.found(java.util.Optional.empty()), 500, "INTERNAL_ERROR"));
    }

    // ---------------- idempotency: same key + same body → 200 replay ----------------

    @Test
    void sameIdempotencyKey_sameBody_returns200_withReplayFlag_andSameSlipNo() throws Exception {
        Map<String, Object> body = estimateBody("EST-IDEM-001");
        String idemKey = "idem-replay-test";

        // 1차 호출 — 201
        MvcResult first = mockMvc.perform(post("/api/v1/slips/from-estimate")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .header("Idempotency-Key", idemKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();
        String firstSlipNo = readSlipNo(first);

        // 2차 호출 — 같은 키 + 같은 본문 → 200 + 같은 slipNo + replay=true
        MvcResult second = mockMvc.perform(post("/api/v1/slips/from-estimate")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .header("Idempotency-Key", idemKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.idempotentReplay").value(true))
                .andReturn();
        String secondSlipNo = readSlipNo(second);

        org.assertj.core.api.Assertions.assertThat(secondSlipNo).isEqualTo(firstSlipNo);
    }

    // ---------------- idempotency: same key + different body → 409 ----------------

    @Test
    void sameIdempotencyKey_differentBody_returns409() throws Exception {
        Map<String, Object> body1 = estimateBody("EST-DIFF-001");
        String idemKey = "idem-conflict-test";

        mockMvc.perform(post("/api/v1/slips/from-estimate")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .header("Idempotency-Key", idemKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body1)))
                .andExpect(status().isCreated());

        // 같은 키 + 다른 본문 (수량 변경) → 409
        Map<String, Object> body2 = estimateBody("EST-DIFF-001");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> lines = (List<Map<String, Object>>) body2.get("lines");
        lines.get(0).put("qty", "999");

        mockMvc.perform(post("/api/v1/slips/from-estimate")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .header("Idempotency-Key", idemKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body2)))
                .andExpect(status().isConflict());
    }

    // ---------------- by-source 조회 ----------------

    @Test
    void getBySource_returnsAllMatching() throws Exception {
        Map<String, Object> body = estimateBody("EST-LOOKUP-001");

        mockMvc.perform(post("/api/v1/slips/from-estimate")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .header("Idempotency-Key", "idem-lookup-001")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated());

        mockMvc.perform(get("/api/v1/slips/by-source")
                        .param("sourceType", "ESTIMATE")
                        .param("sourceId", "EST-LOOKUP-001")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].sourceId").value("EST-LOOKUP-001"))
                .andExpect(jsonPath("$.data[0].sourceType").value("ESTIMATE"));
    }

    // ---------------- guards ----------------

    @Test
    void publishFromEstimate_unmappedWarehouseCode_returns400() throws Exception {
        Map<String, Object> body = estimateBody("EST-UNMAPPED");
        body.put("warehouseCode", "99999"); // 매핑 누락

        mockMvc.perform(post("/api/v1/slips/from-estimate")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .header("Idempotency-Key", "idem-unmapped")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest());
    }

    // ---------------- PR-G1 V16 — e-Count schema 12 컬럼 직접 저장 회귀 ----------------

    @Test
    void publishFromEstimate_persistsAll12EcountColumnsDirectly_memoNotPrepended() throws Exception {
        Map<String, Object> body = estimateBody("EST-V16-001");
        body.put("ioType", "10");
        body.put("timeDate", "143025");
        body.put("customerTel", "010-1111-2222");
        body.put("customerAddr", "서울 강남구 사업장");
        body.put("customerRep", "홍길동");

        MvcResult result = mockMvc.perform(post("/api/v1/slips/from-estimate")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .header("Idempotency-Key", "idem-v16-001")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();

        UUID slipId = OpaqueUuidTestDecoder.decode(
                objectMapper.readTree(result.getResponse().getContentAsString())
                        .get("data").get("slipId").asText());
        Slip persisted = slipRepository.findById(slipId).orElseThrow();

        // 12 컬럼 직접 저장 검증
        org.assertj.core.api.Assertions.assertThat(persisted.getIoType()).isEqualTo("10");
        org.assertj.core.api.Assertions.assertThat(persisted.getTimeDate()).isEqualTo("143025");
        org.assertj.core.api.Assertions.assertThat(persisted.getCustomerTel()).isEqualTo("010-1111-2222");
        org.assertj.core.api.Assertions.assertThat(persisted.getCustomerAddress()).isEqualTo("서울 강남구 사업장");
        org.assertj.core.api.Assertions.assertThat(persisted.getCustomerRepresentative()).isEqualTo("홍길동");
        org.assertj.core.api.Assertions.assertThat(persisted.getShippingAddress()).isEqualTo("서울 강남구");
        org.assertj.core.api.Assertions.assertThat(persisted.getInspectionAddress()).isEqualTo("서울 강남구 검수");
        org.assertj.core.api.Assertions.assertThat(persisted.getReceiverPhone()).isEqualTo("010-0000-0000");
        org.assertj.core.api.Assertions.assertThat(persisted.getPaymentDueLabel()).isEqualTo("익월말 결제");
        org.assertj.core.api.Assertions.assertThat(persisted.getDiscountInfo()).isEqualTo("5% 할인");

        // memo 1000자 prepend 폐기 — 사용자 자유 입력만 보존
        org.assertj.core.api.Assertions.assertThat(persisted.getMemo()).isEqualTo("급송");
        org.assertj.core.api.Assertions.assertThat(persisted.getMemo()).doesNotContain("배송지:");
        org.assertj.core.api.Assertions.assertThat(persisted.getMemo()).doesNotContain("검수지:");
        org.assertj.core.api.Assertions.assertThat(persisted.getMemo()).doesNotContain("결제:");
        org.assertj.core.api.Assertions.assertThat(persisted.getMemo()).doesNotContain("할인:");

        // V15 partner_code resolve — DTO partnerCode 가 직접 snapshot
        org.assertj.core.api.Assertions.assertThat(persisted.getPartnerCode()).isEqualTo("CUST-0001");
    }

    @Test
    void publishFromEstimate_blankCustomerFields_storedAsNull_noPrepend() throws Exception {
        // legacy 입력이 비어있는 경우 — 12 컬럼은 null/빈문자열, memo 는 자유 입력만
        Map<String, Object> body = estimateBody("EST-V16-002");
        body.put("shippingAddress", "");
        body.put("inspectionAddress", "");
        body.put("receiverPhone", "");
        body.put("paymentDueLabel", "");
        body.put("discountInfo", "");
        body.put("memo", "단순 메모");

        MvcResult result = mockMvc.perform(post("/api/v1/slips/from-estimate")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .header("Idempotency-Key", "idem-v16-002")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();

        UUID slipId = OpaqueUuidTestDecoder.decode(
                objectMapper.readTree(result.getResponse().getContentAsString())
                        .get("data").get("slipId").asText());
        Slip persisted = slipRepository.findById(slipId).orElseThrow();

        org.assertj.core.api.Assertions.assertThat(persisted.getMemo()).isEqualTo("단순 메모");
        // io_type 은 항상 채워짐 (출고 디폴트)
        org.assertj.core.api.Assertions.assertThat(persisted.getIoType()).isEqualTo("10");
        org.assertj.core.api.Assertions.assertThat(persisted.getTimeDate()).isNotBlank();
    }

    @Test
    void publishFromPartnerOrder_persistsEcountColumns_andOrderApprovedAtMergedIntoMemo() throws Exception {
        Map<String, Object> body = partnerOrderBody("PO-V16-001");

        MvcResult result = mockMvc.perform(post("/api/v1/slips/from-partner-order")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER")
                        .header("Idempotency-Key", "idem-v16-po-001")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();

        UUID slipId = OpaqueUuidTestDecoder.decode(
                objectMapper.readTree(result.getResponse().getContentAsString())
                        .get("data").get("slipId").asText());
        Slip persisted = slipRepository.findById(slipId).orElseThrow();

        // partner-order 도 V16 컬럼 직접 저장
        org.assertj.core.api.Assertions.assertThat(persisted.getShippingAddress()).isEqualTo("경기 성남시");
        org.assertj.core.api.Assertions.assertThat(persisted.getDeliveryAddress())
                .isEqualTo("경기 성남구 구조화배송로 7");
        org.assertj.core.api.Assertions.assertThat(persisted.getReceiverPhone()).isEqualTo("010-1111-1111");
        org.assertj.core.api.Assertions.assertThat(persisted.getPaymentDueLabel()).isEqualTo("월말 결제");
        org.assertj.core.api.Assertions.assertThat(persisted.getPartnerCode()).isEqualTo("CUST-0002");
        org.assertj.core.api.Assertions.assertThat(persisted.getIoType()).isEqualTo("10");

        // orderApprovedAt 만 memo prepend 보존 (V16 컬럼 없음)
        org.assertj.core.api.Assertions.assertThat(persisted.getMemo()).contains("주문 승인 시각:");
        org.assertj.core.api.Assertions.assertThat(persisted.getMemo()).contains("PO 메모");
        // 다른 5 필드 prepend 폐기 회귀 가드
        org.assertj.core.api.Assertions.assertThat(persisted.getMemo()).doesNotContain("배송지:");
        org.assertj.core.api.Assertions.assertThat(persisted.getMemo()).doesNotContain("결제:");
    }

    @Test
    void publishFromEstimate_unauthenticated_returns403() throws Exception {
        Map<String, Object> body = estimateBody("EST-NOAUTH");

        mockMvc.perform(post("/api/v1/slips/from-estimate")
                        .header("Idempotency-Key", "idem-noauth")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isForbidden());
    }

    // ---------------- helpers ----------------

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
        body.put("ioDate", "20260504");
        body.put("partnerCode", "CUST-0001");
        body.put("partnerName", "테스트 거래처");
        body.put("employeeCode", "EMP-0001");
        body.put("warehouseCode", "00003");
        body.put("ioType", "10");
        body.put("shippingAddress", "서울 강남구");
        body.put("inspectionAddress", "서울 강남구 검수");
        body.put("receiverPhone", "010-0000-0000");
        body.put("memo", "급송");
        body.put("paymentDueLabel", "익월말 결제");
        body.put("discountInfo", "5% 할인");
        body.put("lines", new java.util.ArrayList<>(List.of(line)));
        return body;
    }

    private Map<String, Object> partnerOrderBody(String partnerOrderId) {
        Map<String, Object> line = new LinkedHashMap<>();
        line.put("lineNo", 1);
        line.put("productCode", "MOD-220V-4HP");
        line.put("productName", "에어컨");
        line.put("spec", "220V 4HP");
        line.put("qty", "3");
        line.put("unitPriceExVat", 100000);
        line.put("unitPriceVat", 110000);
        line.put("supplyAmount", 300000);
        line.put("vatAmount", 30000);
        line.put("remarks", "PO 라인");

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("partnerOrderId", partnerOrderId);
        body.put("ioDate", "20260504");
        body.put("partnerCode", "CUST-0002");
        body.put("bizCode", "123-45-67890");
        body.put("partnerName", "협력사");
        body.put("employeeCode", "EMP-0002");
        body.put("warehouseCode", "00003");
        body.put("shippingAddress", "경기 성남시");
        body.put("deliveryAddress", "경기 성남구 구조화배송로 7");
        body.put("receiverPhone", "010-1111-1111");
        body.put("memo", "PO 메모");
        body.put("paymentDueLabel", "월말 결제");
        body.put("discountInfo", "");
        body.put("orderApprovedAt", "2026-05-04T10:00:00");
        body.put("lines", new java.util.ArrayList<>(List.of(line)));
        return body;
    }

    private String legacyPartnerOrderFingerprint(Map<String, Object> body) throws Exception {
        Map<String, Object> canonical = new LinkedHashMap<>();
        canonical.put("kind", "PARTNER_ORDER");
        canonical.put("partnerOrderId", body.get("partnerOrderId"));
        canonical.put("ioDate", body.get("ioDate"));
        canonical.put("warehouseCode", body.get("warehouseCode"));
        canonical.put("partnerCode", body.get("partnerCode"));
        canonical.put("employeeCode", body.get("employeeCode"));
        canonical.put("paymentDueLabel", body.get("paymentDueLabel"));
        canonical.put("discountInfo", body.get("discountInfo"));
        canonical.put("memo", body.get("memo"));
        List<Map<String, Object>> lines = new java.util.ArrayList<>();
        for (Map<String, Object> line : (List<Map<String, Object>>) body.get("lines")) {
            Map<String, Object> canonicalLine = new LinkedHashMap<>();
            canonicalLine.put("productCode", line.get("productCode"));
            canonicalLine.put("qty", line.get("qty"));
            canonicalLine.put("spec", line.get("spec"));
            canonicalLine.put("unitPriceVat", line.get("unitPriceVat"));
            canonicalLine.put("supplyAmount", line.get("supplyAmount"));
            canonicalLine.put("vatAmount", line.get("vatAmount"));
            canonicalLine.put("remarks", line.get("remarks"));
            lines.add(canonicalLine);
        }
        canonical.put("lines", lines);
        byte[] digest = MessageDigest.getInstance("SHA-256")
                .digest(objectMapper.writeValueAsString(canonical).getBytes(StandardCharsets.UTF_8));
        StringBuilder hex = new StringBuilder();
        for (byte value : digest) {
            hex.append(String.format("%02x", value));
        }
        return hex.toString();
    }

    private String readSlipNo(MvcResult result) throws Exception {
        JsonNode node = objectMapper.readTree(result.getResponse().getContentAsString());
        return node.get("data").get("slipNo").asText();
    }
}
