package com.samhanair.logis.slip.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
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
import com.samhanair.logis.slip.delivery.sms.SmsGateway;
import com.samhanair.logis.slip.delivery.sms.SmsResult;
import com.samhanair.logis.slip.domain.SignatureAuditAction;
import com.samhanair.logis.slip.repository.SlipSignatureAuditRepository;
import com.samhanair.logis.security.permission.PermissionAction;
import java.math.BigDecimal;
import java.security.MessageDigest;
import java.time.LocalDate;
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
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * 관리자 서명 endpoint IT — Slice C (signature-slice-C Plan §2 권한 매트릭스).
 *
 * <p>검증 시나리오:
 * <ul>
 *   <li>MANAGER 조회 OK</li>
 *   <li>MASTER 조회 OK</li>
 *   <li>SALES 조회 → 403 FORBIDDEN</li>
 *   <li>MASTER 무효화 OK + audit log INSERT 검증</li>
 *   <li>MANAGER 무효화 → 403 FORBIDDEN</li>
 *   <li>미서명 슬립 무효화 → 409 CONFLICT</li>
 *   <li>reason 누락 무효화 → 400</li>
 * </ul>
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class SlipSignatureAdminIT extends AbstractPostgresIT {

    private static final String MANAGER_ACCOUNT_ID = "10000000-0000-0000-0000-000000000327";
    private static final String MASTER_ACCOUNT_ID = "10000000-0000-0000-0000-000000000328";
    private static final String SALES_ACCOUNT_ID = "10000000-0000-0000-0000-000000000329";
    private static final String WAREHOUSE_ACCOUNT_ID = "10000000-0000-0000-0000-000000000330";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private SlipSignatureAuditRepository auditRepository;

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

    // ---------- GET ----------

    @Test
    void getSignature_managerRole_returns200_withSignedTrue() throws Exception {
        Context ctx = createSignedSlip();

        mockMvc.perform(get("/slips/" + ctx.slipId + "/signature")
                        .header("X-User-Id", MANAGER_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.signed").value(true))
                .andExpect(jsonPath("$.data.signerName").value("김인수"))
                .andExpect(jsonPath("$.data.signaturePngBase64")
                        .value(org.hamcrest.Matchers.startsWith("data:image/png;base64,")))
                .andExpect(jsonPath("$.data.signatureHash").exists())
                .andExpect(jsonPath("$.data.shareToken").exists())
                .andExpect(jsonPath("$.data.shareExpired").value(false));
    }

    @Test
    void getSignature_masterRole_returns200() throws Exception {
        Context ctx = createSignedSlip();

        mockMvc.perform(get("/slips/" + ctx.slipId + "/signature")
                        .header("X-User-Id", MASTER_ACCOUNT_ID)
                        .header("X-User-Role", "MASTER"))
                .andExpect(status().isOk());
    }

    @Test
    void getSignature_salesRole_returns403() throws Exception {
        Context ctx = createSignedSlip();
        Mockito.when(dynamicPermissionClient.check(
                        any(UUID.class), eq("slip.signature"), eq(PermissionAction.VIEW)))
                .thenReturn(false);

        mockMvc.perform(get("/slips/" + ctx.slipId + "/signature")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isForbidden());
    }

    @Test
    void getSignature_warehouseRole_returns403() throws Exception {
        Context ctx = createSignedSlip();
        Mockito.when(dynamicPermissionClient.check(
                        any(UUID.class), eq("slip.signature"), eq(PermissionAction.VIEW)))
                .thenReturn(false);

        mockMvc.perform(get("/slips/" + ctx.slipId + "/signature")
                        .header("X-User-Id", WAREHOUSE_ACCOUNT_ID)
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isForbidden());
    }

    @Test
    void getSignature_unsignedSlip_returnsSignedFalse() throws Exception {
        Context ctx = createInspectingSlip();   // 서명 없음

        mockMvc.perform(get("/slips/" + ctx.slipId + "/signature")
                        .header("X-User-Id", MANAGER_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.signed").value(false))
                .andExpect(jsonPath("$.data.signerName").doesNotExist());
    }

    // ---------- DELETE (invalidate) ----------

    @Test
    void invalidate_masterRole_succeeds_andInsertsAuditLog() throws Exception {
        Context ctx = createSignedSlip();
        long auditCountBefore = auditRepository.count();

        ObjectNode body = objectMapper.createObjectNode();
        body.put("reason", "관리자 무효화 테스트");

        mockMvc.perform(delete("/slips/" + ctx.slipId + "/signature")
                        .header("X-User-Id", MASTER_ACCOUNT_ID)
                        .header("X-User-Role", "MASTER")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.signed").value(false));

        // audit log RECORD 1건 + INVALIDATE 1건 적재 검증
        long auditCountAfter = auditRepository.count();
        assertThat(auditCountAfter - auditCountBefore).isGreaterThanOrEqualTo(1L);
        var audits = auditRepository.findAllBySlipIdOrderByCreatedAtDesc(OpaqueUuidTestDecoder.decode(ctx.slipId));
        assertThat(audits).isNotEmpty();
        assertThat(audits.get(0).getAction()).isEqualTo(SignatureAuditAction.INVALIDATE);
        assertThat(audits.get(0).getReason()).isEqualTo("관리자 무효화 테스트");
        assertThat(audits.get(0).getActorUserId()).isEqualTo(MASTER_ACCOUNT_ID);
    }

    @Test
    void invalidate_managerRole_returns403() throws Exception {
        Context ctx = createSignedSlip();
        ObjectNode body = objectMapper.createObjectNode();
        body.put("reason", "사유");
        Mockito.when(dynamicPermissionClient.check(
                        any(UUID.class), eq("slip.signature"), eq(PermissionAction.DELETE)))
                .thenReturn(false);

        mockMvc.perform(delete("/slips/" + ctx.slipId + "/signature")
                        .header("X-User-Id", MANAGER_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isForbidden());
    }

    @Test
    void invalidate_salesRole_returns403() throws Exception {
        Context ctx = createSignedSlip();
        ObjectNode body = objectMapper.createObjectNode();
        body.put("reason", "사유");
        Mockito.when(dynamicPermissionClient.check(
                        any(UUID.class), eq("slip.signature"), eq(PermissionAction.DELETE)))
                .thenReturn(false);

        mockMvc.perform(delete("/slips/" + ctx.slipId + "/signature")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isForbidden());
    }

    @Test
    void invalidate_unsignedSlip_returns409() throws Exception {
        Context ctx = createInspectingSlip();   // 미서명
        ObjectNode body = objectMapper.createObjectNode();
        body.put("reason", "사유");

        mockMvc.perform(delete("/slips/" + ctx.slipId + "/signature")
                        .header("X-User-Id", MASTER_ACCOUNT_ID)
                        .header("X-User-Role", "MASTER")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isConflict());
    }

    @Test
    void invalidate_blankReason_returns400() throws Exception {
        Context ctx = createSignedSlip();
        ObjectNode body = objectMapper.createObjectNode();
        body.put("reason", "");

        mockMvc.perform(delete("/slips/" + ctx.slipId + "/signature")
                        .header("X-User-Id", MASTER_ACCOUNT_ID)
                        .header("X-User-Role", "MASTER")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest());
    }

    // ---------- helpers ----------

    private Context createInspectingSlip() throws Exception {
        Map<String, Object> line = new HashMap<>();
        line.put("productId", UUID.randomUUID().toString());
        line.put("productName", "테스트");
        line.put("modelName", "MOD-001");
        line.put("quantity", 1);
        line.put("unitPrice", 100000);

        Map<String, Object> body = new HashMap<>();
        body.put("slipType", "OUTBOUND");
        // 시간 의존 회귀 회피 — 오늘 날짜 사용 (PR #94 fix, 2026-05-05 하드코딩 → batch token 만료)
        body.put("slipDate", LocalDate.now().toString());
        body.put("sourceWarehouseId", UUID.randomUUID().toString());
        body.put("destinationWarehouseId", UUID.randomUUID().toString());
        body.put("partnerId", UUID.randomUUID().toString());
        body.put("partnerName", "거래처");
        body.put("deliveryTag", "SALE");
        body.put("driverName", "기사");
        body.put("driverPhone", "010-1111-2222");
        body.put("lines", List.of(line));

        MvcResult res = mockMvc.perform(post("/slips")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();
        String slipId = objectMapper.readTree(res.getResponse().getContentAsString())
                .get("data").get("id").asText();

        adminPost("/slips/" + slipId + "/save", "SALES");
        adminPost("/slips/" + slipId + "/send", "SALES");
        adminPost("/slips/" + slipId + "/accept", "WAREHOUSE");
        adminPost("/slips/" + slipId + "/process", "WAREHOUSE");
        adminPost("/slips/" + slipId + "/complete", "WAREHOUSE");   // → INSPECTING
        return new Context(slipId);
    }

    /** INSPECTING 단계 슬립 + 자동 그룹화 + 서명까지 진행. */
    private Context createSignedSlip() throws Exception {
        Context ctx = createInspectingSlip();
        // 자동 그룹화 → batch token 획득
        MvcResult grouped = mockMvc.perform(post("/delivery-batches/auto-group")
                        .param("date", LocalDate.now().toString())
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER"))
                .andExpect(status().isOk())
                .andReturn();
        String batchToken = objectMapper.readTree(grouped.getResponse().getContentAsString())
                .get("data").get(0).get("batchToken").asText();

        // slipNo 조회
        MvcResult slipRes = mockMvc.perform(get("/slips/" + ctx.slipId)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER"))
                .andExpect(status().isOk())
                .andReturn();
        String slipNo = objectMapper.readTree(slipRes.getResponse().getContentAsString())
                .get("data").get("slipNo").asText();

        // 공개 서명 endpoint 호출
        byte[] png = pngBytes(64);
        String hash = sha256Hex(png);
        ObjectNode body = objectMapper.createObjectNode();
        body.put("signerName", "김인수");
        body.put("signaturePngBase64", Base64.getEncoder().encodeToString(png));
        body.put("clientHash", hash);

        mockMvc.perform(post("/public/batches/" + batchToken
                                + "/slips/" + slipNo.replace("/", "-") + "/signature")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk());

        return ctx;
    }

    private void adminPost(String path, String role) throws Exception {
        mockMvc.perform(post(path)
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", role));
    }

    private static byte[] pngBytes(int len) {
        byte[] arr = new byte[len];
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

    private record Context(String slipId) {}
}
