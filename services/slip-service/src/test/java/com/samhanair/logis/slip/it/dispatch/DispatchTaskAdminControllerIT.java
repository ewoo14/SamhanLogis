package com.samhanair.logis.slip.it.dispatch;

import static org.hamcrest.Matchers.notNullValue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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

    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String USER_ROLE_HEADER = "X-User-Role";
    private static final String MASTER_ACCOUNT_ID = "10000000-0000-0000-0000-000000000324";

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
        Mockito.lenient()
                .when(dynamicPermissionClient.check(
                        org.mockito.ArgumentMatchers.any(UUID.class),
                        org.mockito.ArgumentMatchers.anyString(),
                        org.mockito.ArgumentMatchers.any(com.samhanair.logis.security.permission.PermissionAction.class)))
                .thenReturn(true);
    }

    @Test
    void POST_creates_DRAFT_task_with_daily_counter_code() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of("dispatchDate", "2026-05-14"));
        mvc.perform(post("/admin/dispatch-tasks")
                        .header(USER_ID_HEADER, MASTER_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.taskCode").value(notNullValue()))
                .andExpect(jsonPath("$.data.status").value("DRAFT"));
    }

    @Test
    void POST_add_vehicle_group_and_assign_slip_end_to_end() throws Exception {
        // 1) DispatchTask 생성
        String taskBody = objectMapper.writeValueAsString(Map.of("dispatchDate", "2026-05-14"));
        String taskRes = mvc.perform(post("/admin/dispatch-tasks")
                        .header(USER_ID_HEADER, MASTER_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(taskBody))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        Map<?, ?> taskJson = dataMap(taskRes);
        UUID taskId = UUID.fromString((String) taskJson.get("id"));

        // 2) 차량 그룹 추가
        String groupBody = objectMapper.writeValueAsString(Map.of(
                "vehicleBodyType", "CARGO",
                "tonnage", "T_1"));
        String groupRes = mvc.perform(post("/admin/dispatch-tasks/{taskId}/vehicle-groups", taskId)
                        .header(USER_ID_HEADER, MASTER_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(groupBody))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.sequence").value(1))
                .andExpect(jsonPath("$.data.vehicleType").value("TONNAGE_1"))
                .andExpect(jsonPath("$.data.vehicleBodyType").value("CARGO"))
                .andExpect(jsonPath("$.data.vehicleBodyTypeDisplay").value("카고"))
                .andExpect(jsonPath("$.data.tonnage").value("T_1"))
                .andExpect(jsonPath("$.data.tonnageDisplay").value("1톤"))
                .andReturn().getResponse().getContentAsString();
        Map<?, ?> groupJson = dataMap(groupRes);
        UUID groupId = UUID.fromString((String) groupJson.get("id"));

        // 3) 차량 그룹 삭제
        mvc.perform(delete("/admin/dispatch-tasks/{taskId}/vehicle-groups/{groupId}", taskId, groupId)
                        .header(USER_ID_HEADER, MASTER_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "MASTER"))
                .andExpect(status().isNoContent());
    }

    @Test
    void POST_add_vehicle_group_rejects_cargo_without_tonnage_as_400() throws Exception {
        UUID taskId = createTask("2026-05-22");

        mvc.perform(post("/admin/dispatch-tasks/{taskId}/vehicle-groups", taskId)
                        .header(USER_ID_HEADER, MASTER_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "vehicleBodyType", "CARGO"))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"));
    }

    @Test
    void POST_add_vehicle_group_rejects_motorcycle_with_tonnage_as_400() throws Exception {
        UUID taskId = createTask("2026-05-23");

        mvc.perform(post("/admin/dispatch-tasks/{taskId}/vehicle-groups", taskId)
                        .header(USER_ID_HEADER, MASTER_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "vehicleBodyType", "MOTORCYCLE",
                                "tonnage", "T_1"))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"));
    }

    @Test
    void POST_dispatch_with_no_groups_returns_400() throws Exception {
        String taskBody = objectMapper.writeValueAsString(Map.of("dispatchDate", "2026-05-14"));
        String taskRes = mvc.perform(post("/admin/dispatch-tasks")
                        .header(USER_ID_HEADER, MASTER_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(taskBody))
                .andReturn().getResponse().getContentAsString();
        Map<?, ?> taskJson = dataMap(taskRes);
        UUID taskId = UUID.fromString((String) taskJson.get("id"));

        // 차량 그룹 없이 dispatch
        mvc.perform(post("/admin/dispatch-tasks/{taskId}/dispatch", taskId)
                        .header(USER_ID_HEADER, MASTER_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "MASTER"))
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

        // 2) dispatch
        mvc.perform(post("/admin/dispatch-tasks/{taskId}/dispatch", taskId)
                        .header(USER_ID_HEADER, MASTER_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "MASTER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.status").value("DISPATCHING"));

        Mockito.verify(arologisDispatchClient).send(ArgumentMatchers.any());
    }

    @Test
    void PUT_matched_driver_upserts_manual_driver_and_detail_reflects_it() throws Exception {
        UUID taskId = createTask("2026-05-15");
        UUID groupId = addGroup(taskId, "TONNAGE_1");

        mvc.perform(put("/admin/dispatch-tasks/{taskId}/vehicle-groups/{groupId}/matched-driver", taskId, groupId)
                        .header(USER_ID_HEADER, MASTER_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "driverName", "이경기",
                                "driverPhoneNumber", "010-1111-2222",
                                "vehiclePlateNumber", "12가3456",
                                "driverSource", "GYEONGGI_QUICK"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.matchedDrivers[0].driverCode").value("MANUAL"))
                .andExpect(jsonPath("$.data.matchedDrivers[0].driverName").value("이경기"))
                .andExpect(jsonPath("$.data.matchedDrivers[0].driverPhoneNumber").value("010-1111-2222"))
                .andExpect(jsonPath("$.data.matchedDrivers[0].vehiclePlateNumber").value("12가3456"))
                .andExpect(jsonPath("$.data.matchedDrivers[0].driverSource").value("GYEONGGI_QUICK"));

        mvc.perform(put("/admin/dispatch-tasks/{taskId}/vehicle-groups/{groupId}/matched-driver", taskId, groupId)
                        .header(USER_ID_HEADER, MASTER_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "driverName", "전국기사",
                                "driverPhoneNumber", "010-3333-4444",
                                "vehiclePlateNumber", "98바7654",
                                "driverSource", "JEONGUK_HWAMUL"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.matchedDrivers.length()").value(1))
                .andExpect(jsonPath("$.data.matchedDrivers[0].driverCode").value("MANUAL"))
                .andExpect(jsonPath("$.data.matchedDrivers[0].driverName").value("전국기사"))
                .andExpect(jsonPath("$.data.matchedDrivers[0].driverSource").value("JEONGUK_HWAMUL"));

        mvc.perform(get("/admin/dispatch-tasks/{taskId}", taskId)
                        .header(USER_ID_HEADER, MASTER_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "MASTER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.matchedDrivers.length()").value(1))
                .andExpect(jsonPath("$.data.matchedDrivers[0].driverName").value("전국기사"))
                .andExpect(jsonPath("$.data.matchedDrivers[0].vehiclePlateNumber").value("98바7654"));
    }

    @Test
    void PUT_matched_driver_accepts_blank_phone_and_persists_manual_driver() throws Exception {
        UUID taskId = createTask("2026-05-21");
        UUID groupId = addGroup(taskId, "TONNAGE_1");

        mvc.perform(put("/admin/dispatch-tasks/{taskId}/vehicle-groups/{groupId}/matched-driver", taskId, groupId)
                        .header(USER_ID_HEADER, MASTER_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "driverName", "Manual Driver",
                                "driverPhoneNumber", "",
                                "vehiclePlateNumber", "12A3456",
                                "driverSource", "OTHER"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.matchedDrivers[0].driverCode").value("MANUAL"))
                .andExpect(jsonPath("$.data.matchedDrivers[0].driverName").value("Manual Driver"))
                .andExpect(jsonPath("$.data.matchedDrivers[0].driverSource").value("OTHER"));
    }

    @Test
    void PUT_matched_driver_requires_dispatch_board_update_permission() throws Exception {
        UUID taskId = createTask("2026-05-16");
        UUID groupId = addGroup(taskId, "TONNAGE_1");
        Mockito.when(dynamicPermissionClient.canEdit("SALES", "dispatch.board")).thenReturn(false);
        Mockito.when(dynamicPermissionClient.canView("SALES", "dispatch.board")).thenReturn(true);

        mvc.perform(put("/admin/dispatch-tasks/{taskId}/vehicle-groups/{groupId}/matched-driver", taskId, groupId)
                        .header(USER_ID_HEADER, MASTER_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "driverName", "조회전용",
                                "driverPhoneNumber", "010-1111-2222",
                                "vehiclePlateNumber", "12가3456",
                                "driverSource", "GYEONGGI_QUICK"))))
                .andExpect(status().isForbidden());
    }

    @Test
    void PUT_matched_driver_returns_404_when_group_does_not_belong_to_task() throws Exception {
        UUID taskId = createTask("2026-05-17");
        UUID otherTaskId = createTask("2026-05-18");
        UUID otherGroupId = addGroup(otherTaskId, "TONNAGE_1");

        mvc.perform(put("/admin/dispatch-tasks/{taskId}/vehicle-groups/{groupId}/matched-driver", taskId, otherGroupId)
                        .header(USER_ID_HEADER, MASTER_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "driverName", "소속오류",
                                "driverPhoneNumber", "010-1111-2222",
                                "vehiclePlateNumber", "12가3456",
                                "driverSource", "GYEONGGI_QUICK"))))
                .andExpect(status().isNotFound());
    }

    private UUID createTask(String dispatchDate) throws Exception {
        String taskRes = mvc.perform(post("/admin/dispatch-tasks")
                        .header(USER_ID_HEADER, MASTER_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("dispatchDate", dispatchDate))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return UUID.fromString((String) dataMap(taskRes).get("id"));
    }

    private UUID addGroup(UUID taskId, String vehicleType) throws Exception {
        String groupRes = mvc.perform(post("/admin/dispatch-tasks/{taskId}/vehicle-groups", taskId)
                        .header(USER_ID_HEADER, MASTER_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "vehicleBodyType", "CARGO",
                                "tonnage", vehicleTypeToTonnage(vehicleType)))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return UUID.fromString((String) dataMap(groupRes).get("id"));
    }

    private String vehicleTypeToTonnage(String vehicleType) {
        return switch (vehicleType) {
            case "TONNAGE_1" -> "T_1";
            case "TONNAGE_1_5" -> "T_1_4";
            case "TONNAGE_2_5" -> "T_2_5";
            case "TONNAGE_3" -> "T_3_5";
            case "TONNAGE_5" -> "T_5";
            case "TONNAGE_10" -> "T_11";
            case "TONNAGE_20" -> "T_25";
            default -> "T_1";
        };
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> dataMap(String responseBody) throws Exception {
        return (Map<String, Object>) objectMapper.readValue(responseBody, Map.class).get("data");
    }
}
