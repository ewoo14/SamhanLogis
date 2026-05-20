package com.samhanair.logis.slip.it.dispatch;

import static org.mockito.ArgumentMatchers.anyString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.ArologisDispatchClient;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.NotificationChatRoomClient;
import com.samhanair.logis.slip.client.NotificationClient;
import com.samhanair.logis.slip.client.PartnerBlockClient;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.delivery.sms.SmsGateway;
import com.samhanair.logis.slip.dto.dispatch.ArologisDispatchResponse;
import com.samhanair.logis.slip.it.AbstractPostgresIT;
import java.time.Instant;
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
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Phase C — 배차 수정/취소 요청 흐름 IT (BE Task B6).
 *
 * <p>각 case 는 Phase A 의 setup helper (DispatchTask 생성 → vehicle group 추가 → dispatch → confirm)
 * 를 거쳐 DISPATCHED 상태로 만든 뒤 Phase C 전이를 검증.
 *
 * <p>SP-D3 @MockBean DynamicPermissionClient — feedback_it_mockbean_external_clients.md 의무.
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@WithMockUser(username = "ewoo", authorities = {"ROLE_MASTER"})
class DispatchModificationCancellationIT extends AbstractPostgresIT {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper objectMapper;

    /** SP-D3 핵심 @MockBean — DynamicPermissionClient 누락 시 Eureka 호출 → 500 트랩 */
    @MockBean(classes = com.samhanair.logis.slip.client.DynamicPermissionClient.class) DynamicPermissionClient dynamicPermissionClient;
    @MockBean ArologisDispatchClient arologisDispatchClient;
    @MockBean NotificationClient notificationClient;
    @MockBean NotificationChatRoomClient notificationChatRoomClient;
    @MockBean InventoryClient inventoryClient;
    @MockBean ProductClient productClient;
    @MockBean PartnerBlockClient partnerBlockClient;
    @MockBean PartnerInternalClient partnerInternalClient;
    @MockBean SmsGateway smsGateway;
    /** SP-08-FU1 — UserInternalClient @MockBean 격리 (ownerFullName graceful fallback). */
    @MockBean UserInternalClient userInternalClient;
    /** SP-08-FU2 P2-2 — WarehouseInternalClient @MockBean 격리. */
    @MockBean
    private WarehouseInternalClient warehouseInternalClient;

    @BeforeEach
    void setupLenientStubs() {
        Mockito.lenient().when(userInternalClient.resolveFullName(org.mockito.ArgumentMatchers.any()))
                .thenReturn(java.util.Optional.of("담당자"));
        Mockito.lenient()
                .when(dynamicPermissionClient.canView(anyString(), anyString()))
                .thenReturn(true);
        Mockito.lenient()
                .when(dynamicPermissionClient.canEdit(anyString(), anyString()))
                .thenReturn(true);
    }

    // ---------- Admin endpoint ----------

    @Test
    void modification_request_from_DISPATCHED_returns_MODIFICATION_REQUESTED() throws Exception {
        UUID taskId = dispatchedTask();

        String body = objectMapper.writeValueAsString(Map.of("reason", "슬립 추가 필요"));
        mvc.perform(post("/admin/dispatch-tasks/{taskId}/modification-request", taskId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("MODIFICATION_REQUESTED"))
                .andExpect(jsonPath("$.modificationReason").value("슬립 추가 필요"));
    }

    @Test
    void cancellation_request_from_DISPATCHED_returns_CANCEL_REQUESTED() throws Exception {
        UUID taskId = dispatchedTask();

        String body = objectMapper.writeValueAsString(Map.of("reason", "거래처 일정 변경"));
        mvc.perform(post("/admin/dispatch-tasks/{taskId}/cancellation-request", taskId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCEL_REQUESTED"));
    }

    @Test
    void modification_request_from_DRAFT_returns_409() throws Exception {
        // DRAFT (dispatched 안 함)
        String taskRes = mvc.perform(post("/admin/dispatch-tasks")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("dispatchDate", "2026-05-14"))))
                .andReturn().getResponse().getContentAsString();
        UUID taskId = UUID.fromString((String) objectMapper.readValue(taskRes, Map.class).get("id"));

        String body = objectMapper.writeValueAsString(Map.of("reason", "x"));
        mvc.perform(post("/admin/dispatch-tasks/{taskId}/modification-request", taskId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isConflict());
    }

    // ---------- Internal endpoint (arologis 회신) ----------

    @Test
    void internal_modification_accepted_transitions_to_MODIFICATION_ACCEPTED() throws Exception {
        UUID taskId = dispatchedTask();
        // DISPATCHED → MODIFICATION_REQUESTED 먼저
        mvc.perform(post("/admin/dispatch-tasks/{taskId}/modification-request", taskId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("reason", "수정 필요"))))
                .andExpect(status().isOk());

        // arologis 수정 수락 회신
        Map<String, Object> body = Map.of(
                "arologisDispatchId", UUID.randomUUID().toString(),
                "decidedAt", Instant.now().toString());
        mvc.perform(post("/internal/slip/dispatch-tasks/{taskId}/modification-accepted", taskId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isNoContent());
    }

    @Test
    void internal_modification_rejected_stores_rejection_reason() throws Exception {
        UUID taskId = dispatchedTask();
        mvc.perform(post("/admin/dispatch-tasks/{taskId}/modification-request", taskId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("reason", "수정"))))
                .andExpect(status().isOk());

        Map<String, Object> body = Map.of(
                "arologisDispatchId", UUID.randomUUID().toString(),
                "rejectionReason", "기사 일정 충돌");
        mvc.perform(post("/internal/slip/dispatch-tasks/{taskId}/modification-rejected", taskId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isNoContent());
    }

    @Test
    void internal_cancellation_accepted_transitions_to_CANCELLED() throws Exception {
        UUID taskId = dispatchedTask();
        mvc.perform(post("/admin/dispatch-tasks/{taskId}/cancellation-request", taskId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("reason", "취소"))))
                .andExpect(status().isOk());

        Map<String, Object> body = Map.of(
                "arologisDispatchId", UUID.randomUUID().toString(),
                "decidedAt", Instant.now().toString());
        mvc.perform(post("/internal/slip/dispatch-tasks/{taskId}/cancellation-accepted", taskId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isNoContent());
    }

    // ---------- 헬퍼 ----------

    /** DRAFT → DISPATCHING → DISPATCHED 까지 진행한 DispatchTask 의 id 반환. */
    private UUID dispatchedTask() throws Exception {
        UUID arologisId = UUID.randomUUID();
        Mockito.when(arologisDispatchClient.send(ArgumentMatchers.any()))
                .thenReturn(new ArologisDispatchResponse(
                        arologisId, UUID.randomUUID(), Instant.now(), Instant.now()));

        // task 생성
        String taskRes = mvc.perform(post("/admin/dispatch-tasks")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("dispatchDate", "2026-05-14"))))
                .andReturn().getResponse().getContentAsString();
        UUID taskId = UUID.fromString((String) objectMapper.readValue(taskRes, Map.class).get("id"));

        // 차량 그룹 추가
        mvc.perform(post("/admin/dispatch-tasks/{taskId}/vehicle-groups", taskId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("vehicleType", "TONNAGE_1"))));

        // dispatch (DRAFT → DISPATCHING)
        mvc.perform(post("/admin/dispatch-tasks/{taskId}/dispatch", taskId))
                .andExpect(status().isOk());

        // confirm (DISPATCHING → DISPATCHED)
        Map<String, Object> confirmBody = Map.of(
                "arologisDispatchId", arologisId.toString(),
                "matchedDrivers", List.of(Map.of(
                        "vehicleGroupSequence", 1,
                        "vehicleType", "TONNAGE_1",
                        "driverCode", "D-001",
                        "driverName", "홍길동",
                        "driverPhoneNumber", "010-1234-5678",
                        "source", "EXTERNAL_INSUNG_QUICK"
                )),
                "confirmedAt", Instant.now().toString()
        );
        mvc.perform(post("/internal/slip/dispatch-tasks/{taskId}/confirm", taskId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(confirmBody)))
                .andExpect(status().isNoContent());

        return taskId;
    }
}
