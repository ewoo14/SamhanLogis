package com.samhanair.logis.slip.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.delivery.sms.SmsGateway;
import com.samhanair.logis.slip.delivery.sms.SmsResult;
import com.samhanair.logis.slip.domain.SignatureAuditAction;
import com.samhanair.logis.slip.domain.SignatureSource;
import com.samhanair.logis.slip.repository.SlipSignatureAuditRepository;
import com.samhanair.logis.slip.repository.SlipRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashMap;
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
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Internal 전자서명 endpoint IT — Phase 10 W10-4 (PR #99) 신규.
 *
 * <p>검증 시나리오:
 * <ul>
 *   <li>X-Internal-Token 인증 — 정상 200 + ApiResponse wrapper schema (W10-3 F-3 채택 의무)</li>
 *   <li>X-Internal-Token 누락 → 403 (인증 필요, ROLE_MASTER 권한 미보유)</li>
 *   <li>X-Internal-Token 불일치 → 401 (filter 즉시 차단)</li>
 *   <li>signatureSource = LINK 요청 → 400 INVALID_INPUT (APP only 가드)</li>
 *   <li>슬립 미발견 → 404</li>
 *   <li>인수자 서명 등록 → audit log RECORD + source=APP 보존</li>
 *   <li>기사 서명 등록 (driverCode 명시) → audit log RECORD_DRIVER + source=APP 보존</li>
 *   <li>SIGNABLE_STATUSES 미충족 (DRAFT 슬립) → 409 CONFLICT</li>
 *   <li>GET /by-partner/{partnerId}/recent — 활성 슬립 lookup 200 + slipNo schema</li>
 *   <li>GET /by-partner/{partnerId}/recent — 매칭 슬립 없음 → 404</li>
 * </ul>
 *
 * <p>**ApiResponse wrapper schema 의무 (W10-3 F-3 채택)** — 모든 200 OK 응답에 ok=true / data.* 검증.
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class SlipInternalControllerIT extends AbstractPostgresIT {

    private static final String INTERNAL_TOKEN = "test-internal-token";
    private static final String UUID_PATTERN =
            "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private SlipSignatureAuditRepository auditRepository;
    @Autowired private SlipRepository slipRepository;

    @MockBean private InventoryClient inventoryClient;
    @MockBean private ProductClient productClient;
    @MockBean private SmsGateway smsGateway;
    @MockBean private PartnerInternalClient partnerInternalClient;
    /** SP-08-FU1 — UserInternalClient @MockBean 격리 (ownerFullName graceful fallback). */
    @MockBean private UserInternalClient userInternalClient;
    /** SP-08-FU2 P2-2 — WarehouseInternalClient @MockBean 격리. */
    @MockBean
    private WarehouseInternalClient warehouseInternalClient;

    @BeforeEach
    void mockClients() {
        Mockito.lenient().when(userInternalClient.resolveFullName(ArgumentMatchers.any()))
                .thenReturn(java.util.Optional.of("담당자"));
        Mockito.lenient().when(productClient.lookup(ArgumentMatchers.anyList()))
                .thenAnswer(inv -> {
                    List<UUID> ids = inv.getArgument(0);
                    return ids.stream()
                            .map(id -> new ProductSummary(id, "테스트", "MOD-001",
                                    UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE"))
                            .toList();
                });
        Mockito.lenient().when(productClient.requireExists(ArgumentMatchers.any()))
                .thenAnswer(inv -> new ProductSummary(
                        inv.getArgument(0), "테스트", "MOD-001",
                        UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE"));
        Mockito.lenient().when(smsGateway.sendSms(ArgumentMatchers.anyString(),
                        ArgumentMatchers.anyString()))
                .thenReturn(SmsResult.success("mock-id"));
        // PartnerInternalClient 기본 mock — empty (개별 case 가 override)
        Mockito.lenient().when(partnerInternalClient.resolvePartnerId(ArgumentMatchers.anyString()))
                .thenReturn(java.util.Optional.empty());
        Mockito.lenient().when(partnerInternalClient.resolvePartnerCode(ArgumentMatchers.any()))
                .thenReturn(java.util.Optional.of("P-TEST-SNAPSHOT"));
    }

    // ---------- POST /internal/slips/{slipId}/signatures ----------

    /**
     * F-3 의무 검증 — ApiResponse wrapper schema (success/data/code/message) 모두 검증.
     */
    @Test
    void registerSignature_validRequest_returnsApiResponseWrapper() throws Exception {
        String slipId = createInspectingSlip();
        ObjectNode body = appBody("APP", null);

        MvcResult result = mockMvc.perform(post("/internal/slips/" + slipId + "/signatures")
                        .header("X-Internal-Token", INTERNAL_TOKEN)
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                // F-3 의무: ApiResponse wrapper schema
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data").exists())
                .andExpect(jsonPath("$.data.slipId").value(slipId))
                .andExpect(jsonPath("$.data.slipNo").exists())
                .andExpect(jsonPath("$.data.signatureSource").value("APP"))
                .andExpect(jsonPath("$.data.signed").value(true))
                .andExpect(jsonPath("$.data.driverSigned").value(false))
                .andReturn();

        // raw body 도 wrapper 보장 검증 (PR #92 회고 — schema mismatch fail-fast)
        String raw = result.getResponse().getContentAsString();
        assertThat(raw).contains("\"success\":true");
        assertThat(raw).contains("\"data\":");

        // audit log RECORD + source=APP 보존 검증
        var audits = auditRepository.findAllBySlipIdOrderByCreatedAtDesc(UUID.fromString(slipId));
        assertThat(audits).isNotEmpty();
        assertThat(audits.get(0).getAction()).isEqualTo(SignatureAuditAction.RECORD);
        assertThat(audits.get(0).getSignatureSource()).isEqualTo(SignatureSource.APP);
    }

    @Test
    void registerSignature_driverCodePresent_recordsDriverAudit() throws Exception {
        String slipId = createInspectingSlip();
        ObjectNode body = appBody("APP", "INSUNG-001");

        mockMvc.perform(post("/internal/slips/" + slipId + "/signatures")
                        .header("X-Internal-Token", INTERNAL_TOKEN)
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.driverSigned").value(true))
                .andExpect(jsonPath("$.data.signed").value(false))
                .andExpect(jsonPath("$.data.signatureSource").value("APP"));

        var audits = auditRepository.findAllBySlipIdOrderByCreatedAtDesc(UUID.fromString(slipId));
        assertThat(audits).isNotEmpty();
        assertThat(audits.get(0).getAction()).isEqualTo(SignatureAuditAction.RECORD_DRIVER);
        assertThat(audits.get(0).getSignerName()).isEqualTo("INSUNG-001");
        assertThat(audits.get(0).getSignatureSource()).isEqualTo(SignatureSource.APP);
    }

    @Test
    void registerSignature_missingInternalToken_returns403() throws Exception {
        String slipId = createInspectingSlip();
        ObjectNode body = appBody("APP", null);

        mockMvc.perform(post("/internal/slips/" + slipId + "/signatures")
                        // X-Internal-Token 누락
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isForbidden());
    }

    @Test
    void registerSignature_invalidInternalToken_returns401() throws Exception {
        String slipId = createInspectingSlip();
        ObjectNode body = appBody("APP", null);

        mockMvc.perform(post("/internal/slips/" + slipId + "/signatures")
                        .header("X-Internal-Token", "wrong-token")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void registerSignature_linkSource_returns400() throws Exception {
        String slipId = createInspectingSlip();
        ObjectNode body = appBody("LINK", null);   // LINK source — 400 가드

        mockMvc.perform(post("/internal/slips/" + slipId + "/signatures")
                        .header("X-Internal-Token", INTERNAL_TOKEN)
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void registerSignature_slipNotFound_returns404() throws Exception {
        UUID randomSlipId = UUID.randomUUID();
        ObjectNode body = appBody("APP", null);

        mockMvc.perform(post("/internal/slips/" + randomSlipId + "/signatures")
                        .header("X-Internal-Token", INTERNAL_TOKEN)
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isNotFound());
    }

    @Test
    void registerSignature_draftSlip_returns409() throws Exception {
        String slipId = createDraftSlip();   // SIGNABLE_STATUSES 미충족
        ObjectNode body = appBody("APP", null);

        mockMvc.perform(post("/internal/slips/" + slipId + "/signatures")
                        .header("X-Internal-Token", INTERNAL_TOKEN)
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isConflict());
    }

    // ---------- GET /internal/slips/by-partner/{partnerId}/recent ----------

    @Test
    void findRecentByPartner_existingPartner_returnsApiResponseWrapper() throws Exception {
        UUID partnerId = UUID.randomUUID();
        String slipId = createInspectingSlipForPartner(partnerId);

        MvcResult result = mockMvc.perform(get("/internal/slips/by-partner/" + partnerId + "/recent")
                        .header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(status().isOk())
                // F-3 의무: ApiResponse wrapper schema
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.slipId").value(slipId))
                .andExpect(jsonPath("$.data.slipNo").exists())
                .andExpect(jsonPath("$.data.status").value("INSPECTING"))
                .andReturn();
        String raw = result.getResponse().getContentAsString();
        assertThat(raw).contains("\"success\":true");
    }

    @Test
    void findRecentByPartner_unknownPartner_returns404() throws Exception {
        UUID unknownPartnerId = UUID.randomUUID();

        mockMvc.perform(get("/internal/slips/by-partner/" + unknownPartnerId + "/recent")
                        .header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(status().isNotFound());
    }

    @Test
    void getSlipLineSnapshots_exposes_partnerId_for_single_and_list_shapes() throws Exception {
        UUID partnerId = UUID.randomUUID();
        String slipId = createInspectingSlipForPartner(partnerId);
        UUID lineId = slipRepository.findById(UUID.fromString(slipId))
                .orElseThrow()
                .getLines()
                .get(0)
                .getId();

        mockMvc.perform(get("/internal/slips/" + slipId + "/lines")
                        .header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").doesNotExist())
                .andExpect(jsonPath("$[0].slipId").value(slipId))
                .andExpect(jsonPath("$[0].lineId").value(lineId.toString()))
                .andExpect(jsonPath("$[0].partnerId").value(partnerId.toString()))
                .andExpect(jsonPath("$[0].partnerCode").value("P-TEST-SNAPSHOT"))
                .andExpect(jsonPath("$[0].partnerName").value("거래처"))
                .andExpect(jsonPath("$[0].slipNo").exists());

        mockMvc.perform(get("/internal/slips/lines/" + lineId)
                        .header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").doesNotExist())
                .andExpect(jsonPath("$.slipId").value(slipId))
                .andExpect(jsonPath("$.lineId").value(lineId.toString()))
                .andExpect(jsonPath("$.partnerId").value(partnerId.toString()))
                .andExpect(jsonPath("$.partnerCode").value("P-TEST-SNAPSHOT"))
                .andExpect(jsonPath("$.partnerName").value("거래처"))
                .andExpect(jsonPath("$.slipNo").exists());
    }

    /**
     * OSIV=false 실운영 경계를 재현한다 — 클래스 {@code @Transactional} 이 시작하는 세션 밖에서도
     * 두 accounting 내부 조회가 lazy 연관관계 초기화 없이 정상 응답해야 한다.
     */
    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void getSlipLineSnapshots_withoutOuterTransaction_returnsPartnerIdForBothShapes() throws Exception {
        UUID partnerId = UUID.randomUUID();
        String slipId = createInspectingSlipForPartner(partnerId);

        MvcResult listResult = mockMvc.perform(get("/internal/slips/" + slipId + "/lines")
                        .header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].partnerId").value(partnerId.toString()))
                .andExpect(jsonPath("$[0].partnerCode").value("P-TEST-SNAPSHOT"))
                .andExpect(jsonPath("$[0].partnerName").value("거래처"))
                .andExpect(jsonPath("$[0].slipId").value(slipId))
                .andExpect(jsonPath("$[0].lineId").exists())
                .andReturn();

        String lineId = objectMapper.readTree(listResult.getResponse().getContentAsString())
                .get(0).get("lineId").asText();

        mockMvc.perform(get("/internal/slips/lines/" + lineId)
                        .header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.partnerId").value(partnerId.toString()))
                .andExpect(jsonPath("$.partnerCode").value("P-TEST-SNAPSHOT"))
                .andExpect(jsonPath("$.partnerName").value("거래처"))
                .andExpect(jsonPath("$.slipId").value(slipId))
                .andExpect(jsonPath("$.lineId").value(lineId));
    }

    // ---------- GET /internal/slips/by-partner-code/{code}/recent (W10-4 종합 TM BE-1 채택) ----------

    @Test
    void findRecentByPartnerCode_partnerMappedAndSlipExists_returnsApiResponseWrapper() throws Exception {
        UUID partnerId = UUID.randomUUID();
        String slipId = createInspectingSlipForPartner(partnerId);
        // partner-service mock: partnerCode "214" → partnerId UUID
        Mockito.when(partnerInternalClient.resolvePartnerId("214"))
                .thenReturn(java.util.Optional.of(partnerId));

        MvcResult result = mockMvc.perform(get("/internal/slips/by-partner-code/214/recent")
                        .header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.slipId").value(slipId))
                .andExpect(jsonPath("$.data.slipNo").exists())
                .andExpect(jsonPath("$.data.status").value("INSPECTING"))
                .andReturn();
        String raw = result.getResponse().getContentAsString();
        assertThat(raw).contains("\"success\":true");
    }

    @Test
    void findRecentByPartnerCode_partnerNotMapped_returnsApiResponse200WithNullData() throws Exception {
        // partner-service mock 기본 empty — graceful 200 + data=null (404 아님)
        mockMvc.perform(get("/internal/slips/by-partner-code/UNKNOWN/recent")
                        .header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data").doesNotExist());
    }

    @Test
    void findRecentByPartnerCode_missingInternalToken_returns403() throws Exception {
        mockMvc.perform(get("/internal/slips/by-partner-code/214/recent"))
                .andExpect(status().isForbidden());
    }

    @Test
    void findByPeriod_missingInternalToken_returns403() throws Exception {
        mockMvc.perform(get("/internal/slips/by-period")
                        .param("type", "OUTBOUND")
                        .param("from", "2026-08-03")
                        .param("to", "2026-08-03"))
                .andExpect(status().isForbidden());
    }

    @Test
    void findFullDetail_doesNotExposeWarehouseUuidAsSourceWarehouseName() throws Exception {
        String slipId = createInspectingSlip();

        MvcResult result = mockMvc.perform(get("/internal/slips/" + slipId + "/full")
                        .header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.slipNo").exists())
                .andReturn();

        String raw = result.getResponse().getContentAsString();
        assertThat(raw)
                .doesNotContainPattern(UUID_PATTERN)
                .doesNotContainPattern("\"sourceWarehouseName\":\"" + UUID_PATTERN + "\"");
    }

    @Test
    void findOutboundForDispatch_includesSourceWarehouseName() throws Exception {
        String slipId = createInspectingSlip();
        UUID sourceWarehouseId = slipRepository.findById(UUID.fromString(slipId)).orElseThrow()
                .getSourceWarehouseId();
        Mockito.when(warehouseInternalClient.findWarehouseName(sourceWarehouseId))
                .thenReturn(java.util.Optional.of("상일창고"));

        mockMvc.perform(get("/internal/slips/outbound")
                        .param("from", LocalDate.now().toString())
                        .param("to", LocalDate.now().toString())
                        .header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data[0].sourceWarehouseName").value("상일창고"));
    }

    // ---------- helpers ----------

    private ObjectNode appBody(String source, String driverCode) {
        ObjectNode body = objectMapper.createObjectNode();
        body.put("signatureSource", source);
        body.put("imageRef", "s3://samhan-prod/signatures/" + UUID.randomUUID() + ".png");
        body.put("signatureHash", "abc123");   // 선택 — service 가 보강
        if (driverCode != null) {
            body.put("driverCode", driverCode);
        } else {
            body.put("signerName", "어플서명-인수자");
        }
        body.put("capturedAt", LocalDateTime.now().toString());
        body.put("capturedLatitude", "37.4979");
        body.put("capturedLongitude", "127.0276");
        return body;
    }

    private String createDraftSlip() throws Exception {
        Map<String, Object> line = newLine();
        Map<String, Object> body = baseSlipBody(line, UUID.randomUUID());
        return postSlipReturnId(body);
    }

    private String createInspectingSlip() throws Exception {
        return createInspectingSlipForPartner(UUID.randomUUID());
    }

    private String createInspectingSlipForPartner(UUID partnerId) throws Exception {
        Map<String, Object> line = newLine();
        Map<String, Object> body = baseSlipBody(line, partnerId);
        String slipId = postSlipReturnId(body);
        adminPost("/slips/" + slipId + "/save", "SALES");
        adminPost("/slips/" + slipId + "/send", "SALES");
        adminPost("/slips/" + slipId + "/accept", "WAREHOUSE");
        adminPost("/slips/" + slipId + "/process", "WAREHOUSE");
        adminPost("/slips/" + slipId + "/complete", "WAREHOUSE");   // → INSPECTING (SIGNABLE)
        return slipId;
    }

    private Map<String, Object> newLine() {
        Map<String, Object> line = new HashMap<>();
        line.put("productId", UUID.randomUUID().toString());
        line.put("productName", "테스트");
        line.put("modelName", "MOD-001");
        line.put("quantity", 1);
        line.put("unitPrice", 100000);
        return line;
    }

    private Map<String, Object> baseSlipBody(Map<String, Object> line, UUID partnerId) {
        Map<String, Object> body = new HashMap<>();
        body.put("slipType", "OUTBOUND");
        body.put("slipDate", LocalDate.now().toString());
        body.put("sourceWarehouseId", UUID.randomUUID().toString());
        body.put("destinationWarehouseId", UUID.randomUUID().toString());
        body.put("partnerId", partnerId.toString());
        body.put("partnerCode", "P-TEST-SNAPSHOT");
        body.put("partnerName", "거래처");
        body.put("deliveryTag", "DAY");
        body.put("driverName", "기사");
        body.put("driverPhone", "010-1111-2222");
        body.put("lines", List.of(line));
        return body;
    }

    private String postSlipReturnId(Map<String, Object> body) throws Exception {
        MvcResult res = mockMvc.perform(post("/slips")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(res.getResponse().getContentAsString())
                .get("data").get("id").asText();
    }

    private void adminPost(String path, String role) throws Exception {
        mockMvc.perform(post(path)
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", role));
    }
}
