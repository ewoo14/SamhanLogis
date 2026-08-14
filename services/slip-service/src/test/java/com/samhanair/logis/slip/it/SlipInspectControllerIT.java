package com.samhanair.logis.slip.it;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.web.dto.OpaqueUuidSerializer;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import java.math.BigDecimal;
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
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * Slice A (Sales Polish 2) — INSPECTING 단계 추가 + dispatcher/inspector 자동 기입 +
 * SlipLine.specification VARCHAR(50) 필드 추가의 IT 검증.
 *
 * <p>BE 가정 변경 (Plan §1):
 * <ul>
 *   <li>{@code SlipStatus.INSPECTING} 신규 추가 (PROCESSING → INSPECTING → COMPLETED)</li>
 *   <li>{@code Slip.dispatcherUserId / dispatcherSignedAt / inspectorUserId / inspectorSignedAt} 4 필드</li>
 *   <li>{@code SlipLine.specification} VARCHAR(50) 신규 (선택, null 허용)</li>
 *   <li>{@code POST /slips/{id}/inspect} 신규 endpoint — WAREHOUSE/INVENTORY/MANAGER/MASTER 권한</li>
 *   <li>{@code accept()} 가 {@code dispatcherUserId/SignedAt} 를 X-User-Id 로 자동 기입</li>
 *   <li>{@code inspect()} 가 {@code inspectorUserId/SignedAt} 를 X-User-Id 로 자동 기입</li>
 * </ul>
 *
 * <p>풀 출고 라이프사이클 (10 단계):
 * DRAFT → SAVED → SENT → ACCEPTED → PROCESSING → INSPECTING → COMPLETED →
 * SHIPPING → DELIVERED → CONFIRMED.
 *
 * <p>회고 가드 (memory {@code feedback_pm_integration_build_check.md}):
 * <ul>
 *   <li>외부 RestClient ({@link InventoryClient}, {@link ProductClient}) → {@code @MockBean} 격리</li>
 *   <li>void 메서드만 {@code doNothing()}, 반환 메서드는 {@code thenAnswer()}</li>
 *   <li>잘못된 상태 전이 → CONFLICT (409), 미존재 entity → NOT_FOUND (404), 권한 부족 → FORBIDDEN (403)</li>
 *   <li>싱글턴 Testcontainers ({@link AbstractPostgresIT})</li>
 *   <li>{@code ApiResponse} 래핑 → jsonPath {@code $.data.*}</li>
 * </ul>
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class SlipInspectControllerIT extends AbstractPostgresIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private InventoryClient inventoryClient;

    @MockBean
    private ProductClient productClient;

    /** 외부 client 격리 — SP-08-5-5 신규. user-service ownerFullName lookup 차단. */
    @MockBean
    private UserInternalClient userInternalClient;
    /** SP-08-FU2 P2-2 — WarehouseInternalClient @MockBean 격리. */
    @MockBean
    private WarehouseInternalClient warehouseInternalClient;
    @MockBean
    private PartnerInternalClient partnerInternalClient;

    @BeforeEach
    void mockProductClient() {
        Mockito.lenient().when(partnerInternalClient.resolvePartnerCode(ArgumentMatchers.any()))
                .thenReturn(Optional.of("P-IT-001"));
        Mockito.lenient().when(productClient.lookup(ArgumentMatchers.anyList()))
                .thenAnswer(inv -> {
                    List<UUID> ids = inv.getArgument(0);
                    return ids.stream()
                            .map(id -> new ProductSummary(id, "테스트 제품", "MOD-001",
                                    UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE"))
                            .toList();
                });
        Mockito.lenient().when(productClient.requireExists(ArgumentMatchers.any()))
                .thenAnswer(inv -> new ProductSummary(
                        inv.getArgument(0), "테스트 제품", "MOD-001",
                        UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE"));
    }

    private Map<String, Object> outboundBody() {
        Map<String, Object> line = new HashMap<>();
        line.put("productId", UUID.randomUUID().toString());
        line.put("productName", "테스트 제품");
        line.put("modelName", "AJ040RXH4BC1");
        line.put("specification", "4HP");
        line.put("quantity", 2);
        line.put("unitPrice", 1850000);
        line.put("note", "라인 1");

        Map<String, Object> body = new HashMap<>();
        body.put("slipType", "OUTBOUND");
        body.put("slipDate", "2026-05-04");
        body.put("sourceWarehouseId", UUID.randomUUID().toString());
        body.put("destinationWarehouseId", UUID.randomUUID().toString());
        body.put("partnerId", UUID.randomUUID().toString());
        body.put("partnerName", "(주)윌리-정현수");
        body.put("deliveryTag", "DAY");
        body.put("memo", "Slice A 인스펙트 검증");
        body.put("lines", List.of(line));
        return body;
    }

    /** 헬퍼 — DRAFT → SAVED → SENT 까지 빠르게 진행. */
    private String createAndSendOutbound() throws Exception {
        MvcResult created = mockMvc.perform(post("/slips")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(outboundBody())))
                .andExpect(status().isCreated())
                .andReturn();
        String slipId = objectMapper.readTree(created.getResponse().getContentAsString())
                .get("data").get("id").asText();

        mockMvc.perform(post("/slips/" + slipId + "/save")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "SALES")).andExpect(status().isOk());
        mockMvc.perform(post("/slips/" + slipId + "/send")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "SALES")).andExpect(status().isOk());
        return slipId;
    }

    /**
     * 시나리오 1 — accept 호출 후 BE 응답에 dispatcherUserId == X-User-Id, dispatcherSignedAt != null.
     */
    @Test
    void accept_setsDispatcherUserIdAndSignedAt() throws Exception {
        String slipId = createAndSendOutbound();
        String dispatcherId = UUID.randomUUID().toString();

        mockMvc.perform(post("/slips/" + slipId + "/accept")
                        .header("X-User-Id", dispatcherId)
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("ACCEPTED"))
                .andExpect(jsonPath("$.data.dispatcherUserId").value(
                        OpaqueUuidSerializer.encode(UUID.fromString(dispatcherId))))
                .andExpect(jsonPath("$.data.dispatcherSignedAt").exists());
    }

    /**
     * 시나리오 2 — complete 가 PROCESSING → INSPECTING 으로 전이 (이전 슬라이스 spec 은 COMPLETED).
     * Slice A 신규 단계 추가에 따른 행동 변화 검증.
     */
    @Test
    void complete_transitionsToInspecting() throws Exception {
        String slipId = createAndSendOutbound();
        mockMvc.perform(post("/slips/" + slipId + "/accept")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "WAREHOUSE")).andExpect(status().isOk());
        mockMvc.perform(post("/slips/" + slipId + "/process")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "WAREHOUSE")).andExpect(status().isOk());

        // PROCESSING → complete 호출 → INSPECTING 으로 (Slice A 신규 spec).
        mockMvc.perform(post("/slips/" + slipId + "/complete")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("INSPECTING"));
    }

    /**
     * 시나리오 3 — INSPECTING → COMPLETED 전이 with WAREHOUSE 권한.
     * inspectorUserId/SignedAt 자동 기입 검증.
     */
    @Test
    void inspect_warehouseRole_setsInspectorAndCompletes() throws Exception {
        String slipId = createAndSendOutbound();
        mockMvc.perform(post("/slips/" + slipId + "/accept")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "WAREHOUSE")).andExpect(status().isOk());
        mockMvc.perform(post("/slips/" + slipId + "/process")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "WAREHOUSE")).andExpect(status().isOk());
        mockMvc.perform(post("/slips/" + slipId + "/complete")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "WAREHOUSE")).andExpect(status().isOk());

        String inspectorId = UUID.randomUUID().toString();
        mockMvc.perform(post("/slips/" + slipId + "/inspect")
                        .header("X-User-Id", inspectorId)
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("COMPLETED"))
                .andExpect(jsonPath("$.data.inspectorUserId").value(
                        OpaqueUuidSerializer.encode(UUID.fromString(inspectorId))))
                .andExpect(jsonPath("$.data.inspectorSignedAt").exists());
    }

    /**
     * 시나리오 4 — SALES 권한은 inspect endpoint 접근 불가 (403).
     * 권한 매트릭스: WAREHOUSE/INVENTORY/MANAGER/MASTER 만 허용.
     */
    @Test
    void inspect_salesRole_returns403() throws Exception {
        String slipId = createAndSendOutbound();
        mockMvc.perform(post("/slips/" + slipId + "/accept")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "WAREHOUSE")).andExpect(status().isOk());
        mockMvc.perform(post("/slips/" + slipId + "/process")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "WAREHOUSE")).andExpect(status().isOk());
        mockMvc.perform(post("/slips/" + slipId + "/complete")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "WAREHOUSE")).andExpect(status().isOk());

        // SALES 가 INSPECTING 단계 검수 시도 → 403.
        Mockito.when(dynamicPermissionClient.check(
                        ArgumentMatchers.any(UUID.class),
                        ArgumentMatchers.eq("slip.transfer.process"),
                        ArgumentMatchers.eq(PermissionAction.UPDATE)))
                .thenReturn(false);

        mockMvc.perform(post("/slips/" + slipId + "/inspect")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isForbidden());
    }

    /**
     * R4 RED — SALES/ACCOUNTANT 역할 템플릿 UPDATE가 없어도 검수 결재선 개인이면
     * INSPECTING → COMPLETED 검수 POST를 수행할 수 있어야 한다.
     */
    @Test
    void inspect_approvalLineMember_withoutStaticUpdatePermission_completes() throws Exception {
        String slipId = createAndSendOutbound();
        mockMvc.perform(post("/slips/" + slipId + "/accept")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "WAREHOUSE")).andExpect(status().isOk());
        mockMvc.perform(post("/slips/" + slipId + "/process")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "WAREHOUSE")).andExpect(status().isOk());
        mockMvc.perform(post("/slips/" + slipId + "/complete")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "WAREHOUSE")).andExpect(status().isOk());

        UUID approverId = UUID.randomUUID();
        Mockito.when(dynamicPermissionClient.check(
                        ArgumentMatchers.eq(approverId),
                        ArgumentMatchers.eq("slip.transfer.process"),
                        ArgumentMatchers.eq(PermissionAction.UPDATE)))
                .thenReturn(false);
        Mockito.when(approvalLineAuthorizeClient.authorize(
                        ArgumentMatchers.eq("SLIP_OUTBOUND"),
                        ArgumentMatchers.eq("OUTBOUND_INSPECT"),
                        ArgumentMatchers.eq(approverId)))
                .thenReturn(new com.samhanair.logis.slip.client.ApprovalLineAuthorizeResult(true, true));

        mockMvc.perform(post("/slips/" + slipId + "/inspect")
                        .header("X-User-Id", approverId.toString())
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("COMPLETED"));
    }

    /**
     * 시나리오 5 — DRAFT 상태에서 inspect 호출 시 409 CONFLICT (잘못된 상태 전이).
     * inspect 는 INSPECTING 상태에서만 허용.
     */
    @Test
    void inspect_fromWrongStatus_returns409() throws Exception {
        // 새 전표 → DRAFT 상태 그대로 inspect 시도.
        MvcResult created = mockMvc.perform(post("/slips")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(outboundBody())))
                .andExpect(status().isCreated())
                .andReturn();
        String slipId = objectMapper.readTree(created.getResponse().getContentAsString())
                .get("data").get("id").asText();

        // DRAFT → inspect → 409 (CONFLICT, NOT_FOUND 가 아님 — slip 은 존재함).
        mockMvc.perform(post("/slips/" + slipId + "/inspect")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isConflict());
    }

    /**
     * 시나리오 6 — POST /slips lines[].specification 저장 후 GET 응답에서 동일 값 확인.
     */
    @Test
    void lineSpecification_acceptedAndPersisted() throws Exception {
        Map<String, Object> body = outboundBody();
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> lines = (List<Map<String, Object>>) body.get("lines");
        lines.get(0).put("specification", "220V");

        MvcResult created = mockMvc.perform(post("/slips")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.lines[0].specification").value("220V"))
                .andReturn();

        // GET 으로 다시 조회해서도 specification 보존 검증.
        String slipId = objectMapper.readTree(created.getResponse().getContentAsString())
                .get("data").get("id").asText();
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .get("/slips/" + slipId)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.lines[0].specification").value("220V"));
    }

    /**
     * 시나리오 7 — specification null/미지정 도 허용 (선택 필드).
     */
    @Test
    void lineSpecification_optional_nullAccepted() throws Exception {
        Map<String, Object> body = outboundBody();
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> lines = (List<Map<String, Object>>) body.get("lines");
        lines.get(0).remove("specification");  // 명시적 누락.

        MvcResult created = mockMvc.perform(post("/slips")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();

        // 응답에서 specification 이 null 또는 미존재 — 두 케이스 모두 허용.
        JsonNode line = objectMapper.readTree(created.getResponse().getContentAsString())
                .get("data").get("lines").get(0);
        boolean nullOrMissing = !line.has("specification") || line.get("specification").isNull();
        org.assertj.core.api.Assertions.assertThat(nullOrMissing)
                .as("specification 이 null 또는 미존재여야 한다 — 실제: %s", line.get("specification"))
                .isTrue();
    }

    /**
     * 시나리오 8 — 출고전표 풀 라이프사이클 (10 단계, INSPECTING 포함).
     * DRAFT → SAVED → SENT → ACCEPTED → PROCESSING → INSPECTING → COMPLETED →
     * SHIPPING → DELIVERED → CONFIRMED.
     */
    @Test
    void outbound_fullLifecycle_includingInspecting() throws Exception {
        // 1) DRAFT.
        MvcResult created = mockMvc.perform(post("/slips")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(outboundBody())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.status").value("DRAFT"))
                .andReturn();
        String slipId = objectMapper.readTree(created.getResponse().getContentAsString())
                .get("data").get("id").asText();

        // 2) SAVED.
        mockMvc.perform(post("/slips/" + slipId + "/save")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("SAVED"));

        // 3) SENT.
        mockMvc.perform(post("/slips/" + slipId + "/send")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("SENT"));

        // 4) ACCEPTED + dispatcher 자동 기입.
        String dispatcherId = UUID.randomUUID().toString();
        mockMvc.perform(post("/slips/" + slipId + "/accept")
                        .header("X-User-Id", dispatcherId)
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("ACCEPTED"))
                .andExpect(jsonPath("$.data.dispatcherUserId").value(
                        OpaqueUuidSerializer.encode(UUID.fromString(dispatcherId))));

        // 5) PROCESSING.
        mockMvc.perform(post("/slips/" + slipId + "/process")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("PROCESSING"));

        // 6) INSPECTING (complete 호출 → 신규 단계).
        mockMvc.perform(post("/slips/" + slipId + "/complete")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("INSPECTING"));

        // 7) COMPLETED + inspector 자동 기입 (inspect endpoint).
        String inspectorId = UUID.randomUUID().toString();
        mockMvc.perform(post("/slips/" + slipId + "/inspect")
                        .header("X-User-Id", inspectorId)
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("COMPLETED"))
                .andExpect(jsonPath("$.data.inspectorUserId").value(
                        OpaqueUuidSerializer.encode(UUID.fromString(inspectorId))));

        // 8) SHIPPING.
        mockMvc.perform(post("/slips/" + slipId + "/ship")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("SHIPPING"));

        // 9) DELIVERED.
        mockMvc.perform(post("/slips/" + slipId + "/deliver")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("DELIVERED"));

        // 10) CONFIRMED.
        mockMvc.perform(post("/slips/" + slipId + "/confirm")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("CONFIRMED"));
    }
}
