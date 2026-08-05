package com.samhanair.logis.slip.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.ApprovalLineAuthorizeResult;
import com.samhanair.logis.slip.client.InventoryClient;
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
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/** A2-2/A2-3 출고·입고전표 accept/inspect 결재자 enforcement 실HTTP 회귀 테스트. */
@SpringBootTest(classes = {
        SlipServiceApplication.class,
        SlipOutboundApprovalEnforcementIT.ExternalClientTestConfig.class
})
@AutoConfigureMockMvc
@Transactional
class SlipOutboundApprovalEnforcementIT extends AbstractPostgresIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private ProductClient productClient;

    @Autowired
    private InventoryClient inventoryClient;

    @Autowired
    private UserInternalClient userInternalClient;

    @Autowired
    private WarehouseInternalClient warehouseInternalClient;

    @BeforeEach
    void setUpExternalClients() {
        reset(productClient, inventoryClient, userInternalClient, warehouseInternalClient, approvalLineAuthorizeClient);
        lenient().when(userInternalClient.resolveFullName(any())).thenReturn(Optional.of("담당자"));
        lenient().when(warehouseInternalClient.findWarehouseName(any())).thenReturn(Optional.of("테스트 창고"));
        lenient().when(productClient.lookup(anyList()))
                .thenAnswer(inv -> {
                    List<UUID> ids = inv.getArgument(0);
                    return ids.stream()
                            .map(this::productSummary)
                            .toList();
                });
        lenient().when(productClient.requireExists(any(UUID.class)))
                .thenAnswer(inv -> productSummary(inv.getArgument(0)));
        lenient().when(approvalLineAuthorizeClient.authorize(any(), any(), any()))
                .thenReturn(new ApprovalLineAuthorizeResult(false, false));
    }

    @Test
    void outboundAccept_nonApprover403_approver200_andDispatcherAutofill() throws Exception {
        String deniedSlipId = createSentSlip("OUTBOUND");
        when(approvalLineAuthorizeClient.authorize("SLIP_OUTBOUND", "OUTBOUND_DISPATCH", user("0001")))
                .thenReturn(new ApprovalLineAuthorizeResult(true, false));

        mockMvc.perform(post("/slips/{id}/accept", deniedSlipId)
                        .header("X-User-Id", user("0001").toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isForbidden());

        String allowedSlipId = createSentSlip("OUTBOUND");
        UUID dispatcherId = user("0002");
        when(approvalLineAuthorizeClient.authorize("SLIP_OUTBOUND", "OUTBOUND_DISPATCH", dispatcherId))
                .thenReturn(new ApprovalLineAuthorizeResult(true, true));

        mockMvc.perform(post("/slips/{id}/accept", allowedSlipId)
                        .header("X-User-Id", dispatcherId.toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("ACCEPTED"))
                .andExpect(jsonPath("$.data.dispatcherUserId").value(dispatcherId.toString()));
    }

    @Test
    void outboundInspect_nonApprover403_approver200() throws Exception {
        String deniedSlipId = createInspectingSlip("OUTBOUND");
        when(approvalLineAuthorizeClient.authorize("SLIP_OUTBOUND", "OUTBOUND_INSPECT", user("0003")))
                .thenReturn(new ApprovalLineAuthorizeResult(true, false));

        mockMvc.perform(post("/slips/{id}/inspect", deniedSlipId)
                        .header("X-User-Id", user("0003").toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isForbidden());

        String allowedSlipId = createInspectingSlip("OUTBOUND");
        UUID inspectorId = user("0004");
        when(approvalLineAuthorizeClient.authorize("SLIP_OUTBOUND", "OUTBOUND_INSPECT", inspectorId))
                .thenReturn(new ApprovalLineAuthorizeResult(true, true));

        mockMvc.perform(post("/slips/{id}/inspect", allowedSlipId)
                        .header("X-User-Id", inspectorId.toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("COMPLETED"))
                .andExpect(jsonPath("$.data.inspectorUserId").value(inspectorId.toString()));
    }

    @Test
    void redA_outboundInspectApprovalMember_canReadAssignedSlip() throws Exception {
        UUID approverId = user("0011");
        String assignedSlipId = createInspectingSlip("OUTBOUND");
        when(approvalLineAuthorizeClient.authorize("SLIP_OUTBOUND", "OUTBOUND_INSPECT", approverId))
                .thenReturn(new ApprovalLineAuthorizeResult(true, true));

        // RED-A: 결재선에 든 ACCOUNTANT가 해당 전표 상세를 조회한다.
        mockMvc.perform(get("/slips/{id}", assignedSlipId)
                        .header("X-User-Id", approverId.toString())
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.canInspect").value(true));
    }

    @Test
    void redB_outboundInspectApprovalMember_cannotReadNonInspectingSlip() throws Exception {
        UUID approverId = user("0011");
        String nonInspectingSlipId = createSentSlip("OUTBOUND");
        when(approvalLineAuthorizeClient.authorize("SLIP_OUTBOUND", "OUTBOUND_INSPECT", approverId))
                .thenReturn(new ApprovalLineAuthorizeResult(true, true));

        // RED-B: 전역 검수 결재선 계정이어도 INSPECTING 아닌 OUTBOUND는 상태 경계 밖이므로 403이어야 한다.
        mockMvc.perform(get("/slips/{id}", nonInspectingSlipId)
                        .header("X-User-Id", approverId.toString())
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isForbidden());
    }

    @Test
    void redC_existingSalesRole_canReadOutboundSlip() throws Exception {
        String assignedSlipId = createInspectingSlip("OUTBOUND");

        // RED-C: 기존 SALES role 경로는 결재선 추가와 무관하게 계속 통과한다.
        mockMvc.perform(get("/slips/{id}", assignedSlipId)
                        .header("X-User-Id", user("0012").toString())
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk());
    }

    @Test
    void inboundAcceptAndInspect_invokesInboundApprovalGate() throws Exception {
        String slipId = createSentSlip("INBOUND");
        UUID userId = user("0005");
        when(approvalLineAuthorizeClient.authorize("SLIP_INBOUND", "INBOUND_RECEIVE", userId))
                .thenReturn(new ApprovalLineAuthorizeResult(false, false));
        when(approvalLineAuthorizeClient.authorize("SLIP_INBOUND", "INBOUND_INSPECT", userId))
                .thenReturn(new ApprovalLineAuthorizeResult(false, false));

        mockMvc.perform(post("/slips/{id}/accept", slipId)
                        .header("X-User-Id", userId.toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("ACCEPTED"));

        mockMvc.perform(post("/slips/{id}/process", slipId)
                        .header("X-User-Id", userId.toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk());
        mockMvc.perform(post("/slips/{id}/complete", slipId)
                        .header("X-User-Id", userId.toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk());
        mockMvc.perform(post("/slips/{id}/inspect", slipId)
                        .header("X-User-Id", userId.toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("COMPLETED"));

        verify(approvalLineAuthorizeClient).authorize("SLIP_INBOUND", "INBOUND_RECEIVE", userId);
        verify(approvalLineAuthorizeClient).authorize("SLIP_INBOUND", "INBOUND_INSPECT", userId);
    }

    @Test
    void outboundAccept_optInNoApprovers_returns200() throws Exception {
        String slipId = createSentSlip("OUTBOUND");
        UUID dispatcherId = user("0006");
        when(approvalLineAuthorizeClient.authorize("SLIP_OUTBOUND", "OUTBOUND_DISPATCH", dispatcherId))
                .thenReturn(new ApprovalLineAuthorizeResult(false, false));

        mockMvc.perform(post("/slips/{id}/accept", slipId)
                        .header("X-User-Id", dispatcherId.toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.dispatcherUserId").value(dispatcherId.toString()));
    }

    @Test
    void inboundAccept_nonApprover403_approver200_andReceiverAutofill() throws Exception {
        String deniedSlipId = createSentSlip("INBOUND");
        when(approvalLineAuthorizeClient.authorize("SLIP_INBOUND", "INBOUND_RECEIVE", user("0007")))
                .thenReturn(new ApprovalLineAuthorizeResult(true, false));

        mockMvc.perform(post("/slips/{id}/accept", deniedSlipId)
                        .header("X-User-Id", user("0007").toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isForbidden());

        String allowedSlipId = createSentSlip("INBOUND");
        UUID receiverId = user("0008");
        when(approvalLineAuthorizeClient.authorize("SLIP_INBOUND", "INBOUND_RECEIVE", receiverId))
                .thenReturn(new ApprovalLineAuthorizeResult(true, true));

        mockMvc.perform(post("/slips/{id}/accept", allowedSlipId)
                        .header("X-User-Id", receiverId.toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("ACCEPTED"))
                .andExpect(jsonPath("$.data.dispatcherUserId").value(receiverId.toString()));
    }

    @Test
    void inboundInspect_nonApprover403_approver200() throws Exception {
        String deniedSlipId = createInspectingSlip("INBOUND");
        when(approvalLineAuthorizeClient.authorize("SLIP_INBOUND", "INBOUND_INSPECT", user("0009")))
                .thenReturn(new ApprovalLineAuthorizeResult(true, false));

        mockMvc.perform(post("/slips/{id}/inspect", deniedSlipId)
                        .header("X-User-Id", user("0009").toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isForbidden());

        String allowedSlipId = createInspectingSlip("INBOUND");
        UUID inspectorId = user("0010");
        when(approvalLineAuthorizeClient.authorize("SLIP_INBOUND", "INBOUND_INSPECT", inspectorId))
                .thenReturn(new ApprovalLineAuthorizeResult(true, true));

        mockMvc.perform(post("/slips/{id}/inspect", allowedSlipId)
                        .header("X-User-Id", inspectorId.toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("COMPLETED"))
                .andExpect(jsonPath("$.data.inspectorUserId").value(inspectorId.toString()));
    }

    private String createInspectingSlip(String slipType) throws Exception {
        String slipId = createSentSlip(slipType);
        mockMvc.perform(post("/slips/{id}/accept", slipId)
                        .header("X-User-Id", user("1001").toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk());
        mockMvc.perform(post("/slips/{id}/process", slipId)
                        .header("X-User-Id", user("1001").toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk());
        mockMvc.perform(post("/slips/{id}/complete", slipId)
                        .header("X-User-Id", user("1001").toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk());
        return slipId;
    }

    private String createSentSlip(String slipType) throws Exception {
        MvcResult created = mockMvc.perform(post("/slips")
                        .header("X-User-Id", user("9999").toString())
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(slipBody(slipType))))
                .andExpect(status().isCreated())
                .andReturn();
        String slipId = objectMapper.readTree(created.getResponse().getContentAsString())
                .get("data").get("id").asText();
        mockMvc.perform(post("/slips/{id}/save", slipId)
                        .header("X-User-Id", user("9999").toString())
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk());
        mockMvc.perform(post("/slips/{id}/send", slipId)
                        .header("X-User-Id", user("9999").toString())
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk());
        return slipId;
    }

    private Map<String, Object> slipBody(String slipType) {
        UUID productId = UUID.randomUUID();
        Map<String, Object> line = new HashMap<>();
        line.put("productId", productId.toString());
        line.put("productName", "테스트 제품");
        line.put("modelName", "MOD-001");
        line.put("quantity", 2);
        line.put("unitPrice", 100000);

        Map<String, Object> body = new HashMap<>();
        body.put("slipType", slipType);
        body.put("slipDate", "2026-06-21");
        body.put("destinationWarehouseId", UUID.randomUUID().toString());
        if ("OUTBOUND".equals(slipType)) {
            body.put("sourceWarehouseId", UUID.randomUUID().toString());
            body.put("deliveryTag", "DAY");
        } else {
            body.put("deliveryTag", "RETURN_TRIP");
        }
        body.put("partnerId", UUID.randomUUID().toString());
        body.put("partnerName", "테스트 거래처");
        body.put("lines", List.of(line));
        return body;
    }

    private ProductSummary productSummary(UUID id) {
        return new ProductSummary(id, "테스트 제품", "MOD-001",
                UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE");
    }

    private static UUID user(String suffix) {
        return UUID.fromString("aaaaaaaa-0000-0000-0000-00000000" + suffix);
    }

    @TestConfiguration
    static class ExternalClientTestConfig {

        @Bean
        @Primary
        ProductClient productClient() {
            return Mockito.mock(ProductClient.class);
        }

        @Bean
        @Primary
        InventoryClient inventoryClient() {
            return Mockito.mock(InventoryClient.class);
        }

        @Bean
        @Primary
        UserInternalClient userInternalClient() {
            return Mockito.mock(UserInternalClient.class);
        }

        @Bean
        @Primary
        WarehouseInternalClient warehouseInternalClient() {
            return Mockito.mock(WarehouseInternalClient.class);
        }
    }
}
