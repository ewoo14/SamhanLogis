package com.samhanair.logis.slip.it.dispatch;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
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
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.delivery.sms.SmsGateway;
import com.samhanair.logis.slip.dto.dispatch.ArologisDispatchResponse;
import com.samhanair.logis.slip.it.AbstractPostgresIT;
import java.time.Instant;
import java.util.LinkedHashMap;
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
 * <p>/admin/** 는 {@code @WithMockUser ROLE_MASTER} 로 PreAuthorize 통과 검증.
 * /internal/** 는 P0-B(PR #452)부터 system-internal principal 강제 — 실 운영 호출자
 * (arologis SlipDispatchTaskClient)와 동일하게 X-Internal-Token 헤더로 인증한다.
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@WithMockUser(username = "arologis-service", authorities = {"ROLE_MASTER"})
class DispatchTaskInternalControllerIT extends AbstractPostgresIT {

    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String USER_ROLE_HEADER = "X-User-Role";
    private static final String MASTER_ACCOUNT_ID = "10000000-0000-0000-0000-000000000326";

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
    /** SP-08-FU2 P2-2 — WarehouseInternalClient @MockBean 격리. */
    @MockBean
    private WarehouseInternalClient warehouseInternalClient;

    @org.junit.jupiter.api.BeforeEach
    void setUpUserInternalClient() {
        Mockito.lenient().when(userInternalClient.resolveFullName(ArgumentMatchers.any()))
                .thenReturn(java.util.Optional.of("담당자"));
    }

    /**
     * #725 — arologis 회신 receive endpoint 도 상태전이 위반 시 {@link IllegalStateException} 500
     * 마스킹이 아닌 409 CONFLICT + 한국어 메시지(원어 enum 미노출)로 응답해야 한다.
     *
     * <p>dispatch() 직후 task 는 MODIFICATION_REQUESTED 가 아닌 DISPATCHING 상태다 — 이 상태에서
     * arologis 가 [수정 수락] 회신을 보내면 {@code DispatchTask.markModificationAccepted()} 가드가
     * 걸린다.
     */
    @Test
    void modification_accepted_before_MODIFICATION_REQUESTED_returns_409_with_korean_message() throws Exception {
        UUID arologisId = UUID.randomUUID();
        Mockito.when(arologisDispatchClient.send(ArgumentMatchers.any()))
                .thenReturn(new ArologisDispatchResponse(
                        arologisId, UUID.randomUUID(), Instant.now(), Instant.now()));

        String taskRes = mvc.perform(post("/admin/dispatch-tasks")
                        .header(USER_ID_HEADER, MASTER_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("dispatchDate", "2026-05-27"))))
                .andReturn().getResponse().getContentAsString();
        UUID taskId = UUID.fromString((String) dataMap(taskRes).get("id"));

        mvc.perform(post("/admin/dispatch-tasks/{taskId}/vehicle-groups", taskId)
                        .header(USER_ID_HEADER, MASTER_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "vehicleBodyType", "CARGO",
                                "tonnage", "T_1"))));

        mvc.perform(post("/admin/dispatch-tasks/{taskId}/dispatch", taskId)
                        .header(USER_ID_HEADER, MASTER_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "MASTER"))
                .andExpect(status().isOk());

        Map<String, Object> acceptedBody = Map.of("arologisDispatchId", arologisId.toString());

        mvc.perform(post("/internal/slip/dispatch-tasks/{taskId}/modification-accepted", taskId)
                        .header("X-Internal-Token", "test-internal-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(acceptedBody)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.code").value("CONFLICT"))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("수정 수락")))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("수정 요청 중")))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString("MODIFICATION_REQUESTED"))))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString("DISPATCHING"))));
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
                        .header(USER_ID_HEADER, MASTER_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("dispatchDate", "2026-05-14"))))
                .andReturn().getResponse().getContentAsString();
        UUID taskId = UUID.fromString((String) dataMap(taskRes).get("id"));

        mvc.perform(post("/admin/dispatch-tasks/{taskId}/vehicle-groups", taskId)
                        .header(USER_ID_HEADER, MASTER_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "vehicleBodyType", "CARGO",
                                "tonnage", "T_1"))));

        mvc.perform(post("/admin/dispatch-tasks/{taskId}/dispatch", taskId)
                        .header(USER_ID_HEADER, MASTER_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "MASTER"))
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
                        "source", "AROLOGIS"
                )),
                "confirmedAt", Instant.now().toString()
        );
        mvc.perform(post("/internal/slip/dispatch-tasks/{taskId}/confirm", taskId)
                        .header("X-Internal-Token", "test-internal-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(confirmBody)))
                .andExpect(status().isNoContent());
    }

    @Test
    void confirm_accepts_null_driver_phone_after_dispatch_flow() throws Exception {
        UUID arologisId = UUID.randomUUID();
        Mockito.when(arologisDispatchClient.send(ArgumentMatchers.any()))
                .thenReturn(new ArologisDispatchResponse(
                        arologisId, UUID.randomUUID(),
                        Instant.now(), Instant.now()));

        String taskRes = mvc.perform(post("/admin/dispatch-tasks")
                        .header(USER_ID_HEADER, MASTER_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("dispatchDate", "2026-05-20"))))
                .andReturn().getResponse().getContentAsString();
        UUID taskId = UUID.fromString((String) dataMap(taskRes).get("id"));

        mvc.perform(post("/admin/dispatch-tasks/{taskId}/vehicle-groups", taskId)
                        .header(USER_ID_HEADER, MASTER_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "vehicleBodyType", "CARGO",
                                "tonnage", "T_1"))));

        mvc.perform(post("/admin/dispatch-tasks/{taskId}/dispatch", taskId)
                        .header(USER_ID_HEADER, MASTER_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "MASTER"))
                .andExpect(status().isOk());

        Map<String, Object> matchedDriver = new LinkedHashMap<>();
        matchedDriver.put("vehicleGroupSequence", 1);
        matchedDriver.put("vehicleType", "TONNAGE_1");
        matchedDriver.put("driverCode", "INSUNG-DRV-NO-PHONE");
        matchedDriver.put("driverName", "No Phone Driver");
        matchedDriver.put("driverPhoneNumber", null);
        matchedDriver.put("source", "AROLOGIS");
        Map<String, Object> confirmBody = new LinkedHashMap<>();
        confirmBody.put("arologisDispatchId", arologisId.toString());
        confirmBody.put("matchedDrivers", List.of(matchedDriver));
        confirmBody.put("confirmedAt", Instant.now().toString());

        mvc.perform(post("/internal/slip/dispatch-tasks/{taskId}/confirm", taskId)
                        .header("X-Internal-Token", "test-internal-token")
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
                        .header(USER_ID_HEADER, MASTER_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("dispatchDate", "2026-05-14"))))
                .andReturn().getResponse().getContentAsString();
        UUID taskId = UUID.fromString((String) dataMap(taskRes).get("id"));

        mvc.perform(post("/admin/dispatch-tasks/{taskId}/vehicle-groups", taskId)
                        .header(USER_ID_HEADER, MASTER_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "vehicleBodyType", "CARGO",
                                "tonnage", "T_1"))));

        mvc.perform(post("/admin/dispatch-tasks/{taskId}/dispatch", taskId)
                .header(USER_ID_HEADER, MASTER_ACCOUNT_ID)
                .header(USER_ROLE_HEADER, "MASTER"));

        Map<String, Object> unavailBody = Map.of(
                "arologisDispatchId", arologisId.toString(),
                "reason", "1톤 차량 가용 기사 0명",
                "failedVehicleGroups", List.of(1)
        );
        mvc.perform(post("/internal/slip/dispatch-tasks/{taskId}/unavailable", taskId)
                        .header("X-Internal-Token", "test-internal-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(unavailBody)))
                .andExpect(status().isNoContent());
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> dataMap(String responseBody) throws Exception {
        return (Map<String, Object>) objectMapper.readValue(responseBody, Map.class).get("data");
    }
}
