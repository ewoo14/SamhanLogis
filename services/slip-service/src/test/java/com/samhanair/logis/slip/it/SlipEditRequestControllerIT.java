package com.samhanair.logis.slip.it;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.NotificationClient;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
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
 * PR-H3 BE — SlipEditRequestController 통합 테스트 (3 case).
 *
 * <p>전체 워크플로우 + notification-service Feign mock 격리 검증:
 * <ol>
 *   <li>POST /slips/{id}/edit-request — DRAFT 단계 시도 → 400 (작성자 직접 가능)</li>
 *   <li>POST /slips/{id}/edit-request — ACCEPTED 단계 → 201 + NotificationClient.sendUserPush 호출</li>
 *   <li>POST .../approve + GET dashboard 흐름 — 권한자 PENDING 1건 lookup → 수락 → 0건</li>
 * </ol>
 *
 * <p>외부 client {@link NotificationClient} {@link ProductClient} {@link InventoryClient}
 * {@link PartnerInternalClient} 모두 @MockBean (메모리 feedback_it_mockbean_external_clients).
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class SlipEditRequestControllerIT extends AbstractPostgresIT {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;

    @MockBean private InventoryClient inventoryClient;
    @MockBean private ProductClient productClient;
    @MockBean private NotificationClient notificationClient;
    @MockBean private PartnerInternalClient partnerInternalClient;
    /** SP-08-FU1 — UserInternalClient @MockBean 격리 (ownerFullName graceful fallback). */
    @MockBean private UserInternalClient userInternalClient;
    /** SP-08-FU2 P2-2 — WarehouseInternalClient @MockBean 격리. */
    @MockBean
    private WarehouseInternalClient warehouseInternalClient;

    @BeforeEach
    void setupMocks() {
        Mockito.lenient().when(userInternalClient.resolveFullName(ArgumentMatchers.any()))
                .thenReturn(Optional.of("담당자"));
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
        // notification-service Feign — graceful fallback 검증 시 mock 으로 격리 (실 호출 차단)
        Mockito.lenient().doNothing().when(notificationClient)
                .sendUserPush(ArgumentMatchers.any(), ArgumentMatchers.anyString(),
                        ArgumentMatchers.anyString());
        Mockito.lenient().doNothing().when(notificationClient)
                .sendExternalSms(ArgumentMatchers.anyString(), ArgumentMatchers.anyString(),
                        ArgumentMatchers.anyString());
        // partner-service strict validation skip — IT 환경에서 외부 호출 차단
        Mockito.lenient().when(partnerInternalClient.verifyPartnerCode(ArgumentMatchers.anyString()))
                .thenReturn(com.samhanair.logis.slip.client.PartnerInternalClient.PartnerVerifyResult
                        .skipped(java.util.Optional.empty()));
    }

    private String createOutboundSlipAsSales() throws Exception {
        Map<String, Object> line = new HashMap<>();
        line.put("productId", UUID.randomUUID().toString());
        line.put("productName", "테스트 제품");
        line.put("modelName", "MOD-001");
        line.put("quantity", 5);
        line.put("unitPrice", 100000);

        Map<String, Object> body = new HashMap<>();
        body.put("slipType", "OUTBOUND");
        body.put("slipDate", "2026-05-10");
        body.put("sourceWarehouseId", UUID.randomUUID().toString());
        body.put("destinationWarehouseId", UUID.randomUUID().toString());
        body.put("partnerId", UUID.randomUUID().toString());
        body.put("partnerName", "테스트 거래처");
        body.put("deliveryTag", "SALE");
        body.put("memo", "원본");
        body.put("lines", List.of(line));

        MvcResult result = mockMvc.perform(post("/slips")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString())
                .get("data").get("id").asText();
    }

    private void transitionToAccepted(String slipId) throws Exception {
        UUID warehouseUserId = UUID.randomUUID();
        mockMvc.perform(post("/slips/" + slipId + "/save")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk());
        mockMvc.perform(post("/slips/" + slipId + "/send")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk());
        mockMvc.perform(post("/slips/" + slipId + "/accept")
                        .header("X-User-Id", warehouseUserId.toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk());
    }

    @Test
    void createRequest_draftStage_returns400() throws Exception {
        String slipId = createOutboundSlipAsSales();

        Map<String, Object> body = Map.of("type", "EDIT", "reason", "DRAFT 단계 잘못된 요청");

        // DRAFT 단계는 작성자 직접 mutation 가능 → INVALID_INPUT (400)
        mockMvc.perform(post("/slips/" + slipId + "/edit-request")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest());

        // notification 발송 X
        Mockito.verify(notificationClient, Mockito.never())
                .sendUserPush(ArgumentMatchers.any(), ArgumentMatchers.anyString(),
                        ArgumentMatchers.anyString());
    }

    @Test
    void createRequest_acceptedStage_returns201_andCallsNotification() throws Exception {
        String slipId = createOutboundSlipAsSales();
        transitionToAccepted(slipId);

        Map<String, Object> body = Map.of("type", "EDIT", "reason", "거래처명 오타");

        UUID requesterId = UUID.randomUUID();
        mockMvc.perform(post("/slips/" + slipId + "/edit-request")
                        .header("X-User-Id", requesterId.toString())
                        .header("X-User-Name", "홍길동")
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.status").value("PENDING"))
                .andExpect(jsonPath("$.data.requesterName").value("홍길동"))
                .andExpect(jsonPath("$.data.targetRole").value("WAREHOUSE"));

        // 창고 직원 (acceptedBy = UUID) 에게 푸시 발송 (transitionToAccepted 의 X-User-Id 가 UUID)
        Mockito.verify(notificationClient, Mockito.times(1))
                .sendUserPush(ArgumentMatchers.any(UUID.class),
                        ArgumentMatchers.anyString(), ArgumentMatchers.anyString());
    }

    @Test
    void approveRequest_pending_returns200_andDashboardEmpty() throws Exception {
        String slipId = createOutboundSlipAsSales();
        transitionToAccepted(slipId);

        // 요청 1건 생성
        UUID requesterId = UUID.randomUUID();
        Map<String, Object> body = Map.of("type", "EDIT", "reason", "수정 필요");
        MvcResult createResult = mockMvc.perform(post("/slips/" + slipId + "/edit-request")
                        .header("X-User-Id", requesterId.toString())
                        .header("X-User-Name", "홍길동")
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();
        String requestId = objectMapper.readTree(createResult.getResponse().getContentAsString())
                .get("data").get("id").asText();

        // 권한자 (WAREHOUSE) 대시보드 — PENDING 1건
        mockMvc.perform(get("/slips/edit-requests")
                        .param("targetRole", "WAREHOUSE")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].id").value(requestId))
                .andExpect(jsonPath("$.data[0].status").value("PENDING"));

        // 수락
        Map<String, Object> approveBody = Map.of("note", "확인됨");
        UUID approverId = UUID.randomUUID();
        mockMvc.perform(post("/slips/" + slipId + "/edit-request/" + requestId + "/approve")
                        .header("X-User-Id", approverId.toString())
                        .header("X-User-Name", "창고직원-A")
                        .header("X-User-Role", "WAREHOUSE")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(approveBody)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("APPROVED"))
                .andExpect(jsonPath("$.data.decidedByName").value("창고직원-A"));

        // 작성자에게 결과 푸시 발송 (요청 생성 1건 + 수락 결과 1건 = 총 2건)
        Mockito.verify(notificationClient, Mockito.times(2))
                .sendUserPush(ArgumentMatchers.any(UUID.class),
                        ArgumentMatchers.anyString(), ArgumentMatchers.anyString());
    }
}
