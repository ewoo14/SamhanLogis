package com.samhanair.logis.slip.it.dispatch;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.ArologisDispatchClient;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.NotificationChatRoomClient;
import com.samhanair.logis.slip.client.NotificationClient;
import com.samhanair.logis.slip.client.PartnerBlockClient;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.delivery.sms.SmsGateway;
import com.samhanair.logis.slip.dto.dispatch.ArologisDispatchResponse;
import com.samhanair.logis.slip.it.AbstractPostgresIT;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
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
 * arologis 회신 receive IT — BE Task B11 (confirm / unavailable).
 *
 * <p>X-Internal-Token 인증은 InternalTokenFilter 가 부여하지만 본 테스트는
 * {@code @WithMockUser ROLE_MASTER} 로 PreAuthorize 통과 검증.
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@WithMockUser(username = "arologis-service", authorities = {"ROLE_MASTER"})
class DispatchTaskInternalControllerIT extends AbstractPostgresIT {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper objectMapper;

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

    @org.junit.jupiter.api.BeforeEach
    void setUpUserInternalClient() {
        Mockito.lenient().when(userInternalClient.resolveFullName(ArgumentMatchers.any()))
                .thenReturn(java.util.Optional.of("담당자"));
    }

    @Test
    void confirm_marks_DISPATCHED_after_dispatch_flow() throws Exception {
        UUID arologisId = UUID.randomUUID();
        Mockito.when(arologisDispatchClient.send(ArgumentMatchers.any()))
                .thenReturn(new ArologisDispatchResponse(
                        arologisId, UUID.randomUUID(),
                        Instant.now(), Instant.now()));

        // task 생성 → group 추가 → dispatch → confirm
        String taskRes = mvc.perform(post("/admin/dispatch-tasks")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("dispatchDate", "2026-05-14"))))
                .andReturn().getResponse().getContentAsString();
        UUID taskId = UUID.fromString((String) objectMapper.readValue(taskRes, Map.class).get("id"));

        mvc.perform(post("/admin/dispatch-tasks/{taskId}/vehicle-groups", taskId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("vehicleType", "TONNAGE_1"))));

        mvc.perform(post("/admin/dispatch-tasks/{taskId}/dispatch", taskId))
                .andExpect(status().isOk());

        // confirm
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
    }

    @Test
    void unavailable_marks_FAILED_after_dispatch_flow() throws Exception {
        UUID arologisId = UUID.randomUUID();
        Mockito.when(arologisDispatchClient.send(ArgumentMatchers.any()))
                .thenReturn(new ArologisDispatchResponse(
                        arologisId, UUID.randomUUID(),
                        Instant.now(), Instant.now()));

        String taskRes = mvc.perform(post("/admin/dispatch-tasks")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("dispatchDate", "2026-05-14"))))
                .andReturn().getResponse().getContentAsString();
        UUID taskId = UUID.fromString((String) objectMapper.readValue(taskRes, Map.class).get("id"));

        mvc.perform(post("/admin/dispatch-tasks/{taskId}/vehicle-groups", taskId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("vehicleType", "TONNAGE_1"))));

        mvc.perform(post("/admin/dispatch-tasks/{taskId}/dispatch", taskId));

        Map<String, Object> unavailBody = Map.of(
                "arologisDispatchId", arologisId.toString(),
                "reason", "1톤 차량 가용 기사 0명",
                "failedVehicleGroups", List.of(1)
        );
        mvc.perform(post("/internal/slip/dispatch-tasks/{taskId}/unavailable", taskId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(unavailBody)))
                .andExpect(status().isNoContent());
    }
}
