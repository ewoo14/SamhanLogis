package com.samhanair.logis.slip.delivery.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.delivery.domain.DeliveryBatch;
import com.samhanair.logis.slip.delivery.repository.DeliveryBatchRepository;
import com.samhanair.logis.slip.delivery.sms.SmsGateway;
import com.samhanair.logis.slip.delivery.sms.SmsResult;
import com.samhanair.logis.slip.it.AbstractPostgresIT;
import com.samhanair.logis.slip.it.OpaqueUuidTestDecoder;
import com.samhanair.logis.slip.repository.SlipRepository;
import java.math.BigDecimal;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.HashMap;
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
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * 공개 모바일 서명 endpoint IT — Slice C (signature-slice-C Plan §2 + design mobile-spec.md §2).
 *
 * <p>검증 시나리오 (Plan + 회고 가드):
 * <ul>
 *   <li>서명 저장 happy path — 200 + shareToken 발급</li>
 *   <li>잘못된 hash → 400 INVALID_INPUT</li>
 *   <li>PNG &gt; 50KB → 400 INVALID_INPUT</li>
 *   <li>만료 batch token 으로 서명 시도 → 410 GONE</li>
 *   <li>미서명 슬립 share token 접근 → 404</li>
 *   <li>INSPECTING 미만 (PROCESSING) 단계 서명 시도 → 409 CONFLICT</li>
 *   <li>인수자 view 정상 — UUID 미노출</li>
 *   <li>인수자 view 만료 토큰 → 410 GONE</li>
 * </ul>
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class PublicSignatureControllerIT extends AbstractPostgresIT {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private DeliveryBatchRepository batchRepository;
    @Autowired private SlipRepository slipRepository;

    // 회고 feedback_it_mockbean_external_clients.md — 모든 외부 client @MockBean
    @MockBean private InventoryClient inventoryClient;
    @MockBean private ProductClient productClient;
    @MockBean private SmsGateway smsGateway;
    /** SP-08-FU1 — UserInternalClient @MockBean 격리 (ownerFullName graceful fallback). */
    @MockBean private UserInternalClient userInternalClient;
    /** SP-08-FU2 P2-2 — WarehouseInternalClient @MockBean 격리. */
    @MockBean
    private WarehouseInternalClient warehouseInternalClient;

    @BeforeEach
    void mockClients() {
        Mockito.lenient().when(userInternalClient.resolveFullName(ArgumentMatchers.any()))
                .thenReturn(Optional.of("담당자"));
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
    }

    @Test
    void recordSignature_happyPath_returns200_withShareToken_andHidesUuids() throws Exception {
        Context ctx = setupBatchAndSlipReadyForSign();

        byte[] png = pngBytes(64);
        String hash = sha256Hex(png);
        ObjectNode body = objectMapper.createObjectNode();
        body.put("signerName", "김인수");
        body.put("signaturePngBase64", Base64.getEncoder().encodeToString(png));
        body.put("clientHash", hash);

        mockMvc.perform(post("/public/batches/" + ctx.batchToken
                                + "/slips/" + encodeSlipNo(ctx.slipNo) + "/signature")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.shareToken").exists())
                .andExpect(jsonPath("$.data.signedAt").exists())
                .andExpect(jsonPath("$.data.shareTokenExpiresAt").exists())
                .andExpect(jsonPath("$.data.signatureHash").value(hash))
                // UUID 비공개 가드
                .andExpect(jsonPath("$.data.id").doesNotExist())
                .andExpect(jsonPath("$.data.slipId").doesNotExist());
    }

    @Test
    void recordDriverSignature_hyphenSlug_returns200_andStoresDriverSignature() throws Exception {
        Context ctx = setupBatchAndSlipReadyForSign();

        byte[] png = pngBytes(64);
        String hash = sha256Hex(png);
        ObjectNode body = objectMapper.createObjectNode();
        body.put("signaturePngBase64", Base64.getEncoder().encodeToString(png));
        body.put("clientHash", hash);

        mockMvc.perform(post("/public/batches/" + ctx.batchToken
                                + "/slips/" + encodeSlipNo(ctx.slipNo) + "/driver-signature")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.driverSignedAt").exists())
                .andExpect(jsonPath("$.data.driverSignatureHash").value(hash))
                // UUID 비공개 가드
                .andExpect(jsonPath("$.data.id").doesNotExist())
                .andExpect(jsonPath("$.data.slipId").doesNotExist());

        var stored = slipRepository.findById(OpaqueUuidTestDecoder.decode(ctx.slipId)).orElseThrow();
        assertThat(stored.getSlipNo()).contains("/");
        assertThat(stored.getDriverSignedAt()).isNotNull();
        assertThat(stored.getDriverSignatureHash()).isEqualTo(hash);
    }

    @Test
    void recordSignature_hashMismatch_returns400() throws Exception {
        Context ctx = setupBatchAndSlipReadyForSign();
        byte[] png = pngBytes(64);
        ObjectNode body = objectMapper.createObjectNode();
        body.put("signerName", "김");
        body.put("signaturePngBase64", Base64.getEncoder().encodeToString(png));
        body.put("clientHash", "0".repeat(64));

        mockMvc.perform(post("/public/batches/" + ctx.batchToken
                                + "/slips/" + encodeSlipNo(ctx.slipNo) + "/signature")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void recordSignature_pngOver50KB_returns400() throws Exception {
        Context ctx = setupBatchAndSlipReadyForSign();
        byte[] huge = pngBytes(60 * 1024);   // 60KB > 50KB
        String hash = sha256Hex(huge);
        ObjectNode body = objectMapper.createObjectNode();
        body.put("signerName", "김");
        body.put("signaturePngBase64", Base64.getEncoder().encodeToString(huge));
        body.put("clientHash", hash);

        mockMvc.perform(post("/public/batches/" + ctx.batchToken
                                + "/slips/" + encodeSlipNo(ctx.slipNo) + "/signature")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void recordSignature_expiredBatchToken_returns410Gone() throws Exception {
        Context ctx = setupBatchAndSlipReadyForSign();
        // batch token expiresAt 강제 과거
        DeliveryBatch batch = batchRepository.findByBatchToken(ctx.batchToken).orElseThrow();
        ReflectionTestUtils.setField(batch, "tokenExpiresAt", LocalDateTime.now().minusHours(1));
        batchRepository.save(batch);

        byte[] png = pngBytes(64);
        String hash = sha256Hex(png);
        ObjectNode body = objectMapper.createObjectNode();
        body.put("signerName", "김");
        body.put("signaturePngBase64", Base64.getEncoder().encodeToString(png));
        body.put("clientHash", hash);

        mockMvc.perform(post("/public/batches/" + ctx.batchToken
                                + "/slips/" + encodeSlipNo(ctx.slipNo) + "/signature")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isGone());
    }

    @Test
    void recordSignature_processingStageSlip_returns409() throws Exception {
        // 슬립을 PROCESSING 단계까지만 진행
        Context ctx = setupBatchAndSlipUpToProcessing();

        byte[] png = pngBytes(64);
        String hash = sha256Hex(png);
        ObjectNode body = objectMapper.createObjectNode();
        body.put("signerName", "김");
        body.put("signaturePngBase64", Base64.getEncoder().encodeToString(png));
        body.put("clientHash", hash);

        mockMvc.perform(post("/public/batches/" + ctx.batchToken
                                + "/slips/" + encodeSlipNo(ctx.slipNo) + "/signature")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isConflict());
    }

    @Test
    void getSignatureView_validShareToken_returns200_withoutUuids() throws Exception {
        Context ctx = setupBatchAndSlipReadyForSign();
        String shareToken = signSlipAndGetShareToken(ctx);

        mockMvc.perform(get("/public/signatures/" + shareToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.slip.slipNo").value(ctx.slipNo))
                .andExpect(jsonPath("$.data.signature.signerName").value("김인수"))
                .andExpect(jsonPath("$.data.signature.signaturePngBase64")
                        .value(org.hamcrest.Matchers.startsWith("data:image/png;base64,")))
                .andExpect(jsonPath("$.data.signature.signatureHashShort").exists())
                .andExpect(jsonPath("$.data.shareTokenExpiresAt").exists())
                // UUID 비공개 가드
                .andExpect(jsonPath("$.data.slip.id").doesNotExist())
                .andExpect(jsonPath("$.data.signature.id").doesNotExist());
    }

    @Test
    void getSignatureView_unknownToken_returns404() throws Exception {
        mockMvc.perform(get("/public/signatures/non-existent-share-token"))
                .andExpect(status().isNotFound());
    }

    @Test
    void getSignatureView_expiredShareToken_returns410Gone() throws Exception {
        Context ctx = setupBatchAndSlipReadyForSign();
        String shareToken = signSlipAndGetShareToken(ctx);

        // 슬립의 share expiresAt 강제 과거
        var slip = slipRepository.findBySignatureShareTokenAndIsDeletedFalse(shareToken).orElseThrow();
        ReflectionTestUtils.setField(slip, "signatureShareExpiresAt",
                LocalDateTime.now().minusHours(1));
        slipRepository.save(slip);

        mockMvc.perform(get("/public/signatures/" + shareToken))
                .andExpect(status().isGone());
    }

    // ---------- helpers ----------

    /** 배치 + 슬립 1건을 INSPECTING 까지 진행시킴. */
    private Context setupBatchAndSlipReadyForSign() throws Exception {
        Context ctx = createBatchedSlip();
        // SAVED → SENT → ACCEPTED → PROCESSING → COMPLETED(=INSPECTING)
        adminPost("/slips/" + ctx.slipId + "/save", "SALES");
        adminPost("/slips/" + ctx.slipId + "/send", "SALES");
        adminPost("/slips/" + ctx.slipId + "/accept", "WAREHOUSE");
        adminPost("/slips/" + ctx.slipId + "/process", "WAREHOUSE");
        adminPost("/slips/" + ctx.slipId + "/complete", "WAREHOUSE");  // → INSPECTING
        return ctx;
    }

    /** 배치 + 슬립 1건을 PROCESSING 단계에서 멈춤. */
    private Context setupBatchAndSlipUpToProcessing() throws Exception {
        Context ctx = createBatchedSlip();
        adminPost("/slips/" + ctx.slipId + "/save", "SALES");
        adminPost("/slips/" + ctx.slipId + "/send", "SALES");
        adminPost("/slips/" + ctx.slipId + "/accept", "WAREHOUSE");
        adminPost("/slips/" + ctx.slipId + "/process", "WAREHOUSE");
        return ctx;
    }

    /** 슬립 + 배치 자동 그룹화 — 토큰 + slipNo + slipId 묶음 반환. */
    private Context createBatchedSlip() throws Exception {
        // 시간 의존 회귀 회피 — 항상 오늘 날짜 사용 (PR #94 fix, 2026-05-05 하드코딩 → batch token 만료)
        String today = LocalDate.now().toString();
        Map<String, Object> line = new HashMap<>();
        line.put("productId", UUID.randomUUID().toString());
        line.put("productName", "테스트");
        line.put("modelName", "MOD-001");
        line.put("quantity", 1);
        line.put("unitPrice", 100000);

        Map<String, Object> body = new HashMap<>();
        body.put("slipType", "OUTBOUND");
        body.put("slipDate", today);
        body.put("sourceWarehouseId", UUID.randomUUID().toString());
        body.put("destinationWarehouseId", UUID.randomUUID().toString());
        body.put("partnerId", UUID.randomUUID().toString());
        body.put("partnerName", "거래처");
        body.put("deliveryTag", "DAY");
        body.put("driverName", "김기사");
        body.put("driverPhone", "010-1111-2222");
        body.put("lines", List.of(line));

        MvcResult res = mockMvc.perform(post("/slips")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();
        var json = objectMapper.readTree(res.getResponse().getContentAsString()).get("data");
        String slipId = json.get("id").asText();
        String slipNo = json.get("slipNo").asText();

        // 자동 그룹화
        MvcResult grouped = mockMvc.perform(post("/delivery-batches/auto-group")
                        .param("date", today)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER"))
                .andExpect(status().isOk())
                .andReturn();
        String batchToken = objectMapper.readTree(grouped.getResponse().getContentAsString())
                .get("data").get(0).get("batchToken").asText();

        return new Context(slipId, slipNo, batchToken);
    }

    /** 사전에 INSPECTING 까지 진행된 슬립 1건을 서명하고 share token 반환. */
    private String signSlipAndGetShareToken(Context ctx) throws Exception {
        byte[] png = pngBytes(64);
        String hash = sha256Hex(png);
        ObjectNode body = objectMapper.createObjectNode();
        body.put("signerName", "김인수");
        body.put("signaturePngBase64", Base64.getEncoder().encodeToString(png));
        body.put("clientHash", hash);

        MvcResult res = mockMvc.perform(post("/public/batches/" + ctx.batchToken
                                + "/slips/" + encodeSlipNo(ctx.slipNo) + "/signature")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andReturn();
        String token = objectMapper.readTree(res.getResponse().getContentAsString())
                .get("data").get("shareToken").asText();
        assertThat(token).isNotBlank();
        return token;
    }

    private void adminPost(String path, String role) throws Exception {
        mockMvc.perform(post(path)
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", role));
    }

    /** {@code 2026/05/05-1} → {@code 2026-05-05-1} (URL path 안전 슬러그). */
    private static String encodeSlipNo(String slipNo) {
        return slipNo.replace("/", "-");
    }

    private static byte[] pngBytes(int len) {
        byte[] arr = new byte[len];
        // PNG 매직 + 더미 fill — sha256 계산 가능하면 충분
        arr[0] = (byte) 0x89;
        arr[1] = 0x50;
        arr[2] = 0x4E;
        arr[3] = 0x47;
        for (int i = 4; i < len; i++) {
            arr[i] = (byte) (i % 256);
        }
        return arr;
    }

    private static String sha256Hex(byte[] data) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(data);
            StringBuilder sb = new StringBuilder(64);
            for (byte b : digest) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    /** slipId / slipNo / batchToken 묶음. */
    private record Context(String slipId, String slipNo, String batchToken) {}
}
