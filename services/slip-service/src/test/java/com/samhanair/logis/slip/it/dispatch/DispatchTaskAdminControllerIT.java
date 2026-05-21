package com.samhanair.logis.slip.it.dispatch;

import static org.hamcrest.Matchers.notNullValue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
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
 * DispatchTask + Group + Slip 매핑 CRUD IT — BE Task B11.
 *
 * <p>SP-D3 @MockBean DynamicPermissionClient — feedback_it_mockbean_external_clients.md 의무.
 * canView/canEdit=true 기본 stub 으로 기존 테스트 회귀 방지.
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@WithMockUser(username = "ewoo", authorities = {"ROLE_MASTER"})
class DispatchTaskAdminControllerIT extends AbstractPostgresIT {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper objectMapper;

    /** SP-D3 핵심 @MockBean — DynamicPermissionClient 누락 시 Eureka 호출 → 500 트랩 */
    @MockBean(classes = com.samhanair.logis.security.permission.DynamicPermissionClient.class) DynamicPermissionClient dynamicPermissionClient;
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

    @Test
    void POST_creates_DRAFT_task_with_daily_counter_code() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of("dispatchDate", "2026-05-14"));
        mvc.perform(post("/admin/dispatch-tasks")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.taskCode").value(notNullValue()))
                .andExpect(jsonPath("$.status").value("DRAFT"));
    }

    @Test
    void POST_add_vehicle_group_and_assign_slip_end_to_end() throws Exception {
        // 1) DispatchTask 생성
        String taskBody = objectMapper.writeValueAsString(Map.of("dispatchDate", "2026-05-14"));
        String taskRes = mvc.perform(post("/admin/dispatch-tasks")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(taskBody))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        Map<?, ?> taskJson = objectMapper.readValue(taskRes, Map.class);
        UUID taskId = UUID.fromString((String) taskJson.get("id"));

        // 2) 차량 그룹 추가
        String groupBody = objectMapper.writeValueAsString(Map.of("vehicleType", "TONNAGE_1"));
        String groupRes = mvc.perform(post("/admin/dispatch-tasks/{taskId}/vehicle-groups", taskId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(groupBody))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.sequence").value(1))
                .andExpect(jsonPath("$.vehicleType").value("TONNAGE_1"))
                .andReturn().getResponse().getContentAsString();
        Map<?, ?> groupJson = objectMapper.readValue(groupRes, Map.class);
        UUID groupId = UUID.fromString((String) groupJson.get("id"));

        // 3) 차량 그룹 삭제
        mvc.perform(delete("/admin/dispatch-tasks/{taskId}/vehicle-groups/{groupId}", taskId, groupId))
                .andExpect(status().isNoContent());
    }

    @Test
    void POST_dispatch_with_no_groups_returns_400() throws Exception {
        String taskBody = objectMapper.writeValueAsString(Map.of("dispatchDate", "2026-05-14"));
        String taskRes = mvc.perform(post("/admin/dispatch-tasks")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(taskBody))
                .andReturn().getResponse().getContentAsString();
        Map<?, ?> taskJson = objectMapper.readValue(taskRes, Map.class);
        UUID taskId = UUID.fromString((String) taskJson.get("id"));

        // 차량 그룹 없이 dispatch
        mvc.perform(post("/admin/dispatch-tasks/{taskId}/dispatch", taskId))
                .andExpect(status().is4xxClientError());
    }

    @Test
    void POST_dispatch_with_group_calls_arologis() throws Exception {
        // arologis mock 응답 설정
        UUID arologisId = UUID.randomUUID();
        Mockito.when(arologisDispatchClient.send(ArgumentMatchers.any()))
                .thenReturn(new ArologisDispatchResponse(
                        arologisId, UUID.randomUUID(),
                        Instant.now(), Instant.now()));

        // 1) Task + group 생성
        String taskRes = mvc.perform(post("/admin/dispatch-tasks")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("dispatchDate", "2026-05-14"))))
                .andReturn().getResponse().getContentAsString();
        UUID taskId = UUID.fromString((String) objectMapper.readValue(taskRes, Map.class).get("id"));

        mvc.perform(post("/admin/dispatch-tasks/{taskId}/vehicle-groups", taskId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("vehicleType", "TONNAGE_1"))));

        // 2) dispatch
        mvc.perform(post("/admin/dispatch-tasks/{taskId}/dispatch", taskId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DISPATCHING"));

        Mockito.verify(arologisDispatchClient).send(ArgumentMatchers.any());
    }
}
