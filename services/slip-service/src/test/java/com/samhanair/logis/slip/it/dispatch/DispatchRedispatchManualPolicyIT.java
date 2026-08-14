package com.samhanair.logis.slip.it.dispatch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.nullValue;
import static org.mockito.ArgumentMatchers.anyString;
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
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.dispatch.DispatchTaskStatus;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleGroupDispatchStatus;
import com.samhanair.logis.slip.domain.dispatch.SlipDispatchStatus;
import com.samhanair.logis.slip.dto.dispatch.ArologisDispatchResponse;
import com.samhanair.logis.slip.it.AbstractPostgresIT;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchTaskRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchVehicleGroupRepository;
import java.time.Instant;
import java.time.LocalDate;
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
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;

/**
 * 배차 #3 — 재배차 루프와 수동기입 정책 HTTP 계약 검증.
 *
 * <p>외부 client 는 모두 {@code @MockBean} 으로 격리한다. 실제 Postgres + Flyway 스키마에서
 * driver_source CHECK 와 상태 전이 가드를 함께 검증한다.
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@WithMockUser(username = "ewoo", authorities = {"ROLE_MASTER"})
class DispatchRedispatchManualPolicyIT extends AbstractPostgresIT {

    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String USER_ROLE_HEADER = "X-User-Role";
    private static final String MASTER_ACCOUNT_ID = "10000000-0000-0000-0000-000000000467";

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper objectMapper;
    @Autowired DispatchTaskRepository taskRepo;
    @Autowired DispatchVehicleGroupRepository groupRepo;
    @Autowired SlipRepository slipRepo;

    @MockBean ArologisDispatchClient arologisDispatchClient;
    @MockBean NotificationClient notificationClient;
    @MockBean NotificationChatRoomClient notificationChatRoomClient;
    @MockBean InventoryClient inventoryClient;
    @MockBean ProductClient productClient;
    @MockBean PartnerBlockClient partnerBlockClient;
    @MockBean PartnerInternalClient partnerInternalClient;
    @MockBean SmsGateway smsGateway;
    @MockBean UserInternalClient userInternalClient;
    @MockBean WarehouseInternalClient warehouseInternalClient;

    @BeforeEach
    void setupExternalStubs() {
        Mockito.lenient().when(userInternalClient.resolveFullName(ArgumentMatchers.any()))
                .thenReturn(java.util.Optional.of("담당자"));
        Mockito.lenient()
                .when(dynamicPermissionClient.canView(anyString(), anyString()))
                .thenReturn(true);
        Mockito.lenient()
                .when(dynamicPermissionClient.canEdit(anyString(), anyString()))
                .thenReturn(true);
        Mockito.lenient().doNothing()
                .when(arologisDispatchClient).cancelDispatch(ArgumentMatchers.any());
    }

    @Test
    void start_redispatch_from_MODIFICATION_ACCEPTED_resets_group_and_slip_for_editing() throws Exception {
        SeededDispatch seeded = dispatchedTaskWithSlip(1);
        UUID secondArologisId = UUID.randomUUID();
        Mockito.when(arologisDispatchClient.send(ArgumentMatchers.any()))
                .thenReturn(new ArologisDispatchResponse(
                        secondArologisId, seeded.taskId(), Instant.now(), Instant.now()));

        mvc.perform(post("/admin/dispatch-tasks/{taskId}/modification-request", seeded.taskId())
                        .header(USER_ID_HEADER, MASTER_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("reason", "정차 수정"))))
                .andExpect(status().isOk());
        mvc.perform(post("/internal/slip/dispatch-tasks/{taskId}/modification-accepted", seeded.taskId())
                        .header("X-Internal-Token", "test-internal-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "arologisDispatchId", seeded.arologisDispatchId().toString(),
                                "decidedAt", Instant.now().toString()))))
                .andExpect(status().isNoContent());

        mvc.perform(post("/admin/dispatch-tasks/{taskId}/start-redispatch", seeded.taskId())
                        .header(USER_ID_HEADER, MASTER_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "MASTER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("DRAFT"))
                .andExpect(jsonPath("$.data.arologisDispatchId").value(nullValue()));

        assertThat(taskRepo.findById(seeded.taskId()).orElseThrow().getStatus())
                .isEqualTo(DispatchTaskStatus.DRAFT);
        assertThat(groupRepo.findById(seeded.groupId()).orElseThrow().getDispatchStatus())
                .isEqualTo(DispatchVehicleGroupDispatchStatus.PENDING);
        assertThat(slipRepo.findById(seeded.slipId()).orElseThrow().getDispatchStatus())
                .isEqualTo(SlipDispatchStatus.UNDISPATCHED);
        Mockito.verify(arologisDispatchClient).cancelDispatch(seeded.arologisDispatchId());

        mvc.perform(post("/admin/dispatch-tasks/{taskId}/dispatch", seeded.taskId())
                        .header(USER_ID_HEADER, MASTER_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "MASTER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("DISPATCHING"));
        assertThat(taskRepo.findById(seeded.taskId()).orElseThrow().getArologisDispatchId())
                .isEqualTo(secondArologisId);
    }

    @Test
    void start_redispatch_rejects_non_accepted_task_with_409() throws Exception {
        // 2099-08 사용 — DispatchTaskRepositoryIT 의 2099-06-13~15 조회창 오염 방지
        // (본 IT 는 MockMvc 커밋형이라 rollback 되지 않는다 — Round C 수정).
        UUID taskId = createTask("2099-08-13");

        mvc.perform(post("/admin/dispatch-tasks/{taskId}/start-redispatch", taskId)
                        .header(USER_ID_HEADER, MASTER_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "MASTER"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CONFLICT"));
    }

    @Test
    void manual_matched_driver_accepts_enum_vendor_and_manual_complete_marks_group_dispatched() throws Exception {
        UUID taskId = createTask("2099-08-14");
        UUID groupId = addGroup(taskId);
        Slip slip = slipRepo.saveAndFlush(newSlip(4));
        mvc.perform(post("/admin/dispatch-tasks/{taskId}/vehicle-groups/{groupId}/slips", taskId, groupId)
                        .header(USER_ID_HEADER, MASTER_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("slipId", slip.getId().toString()))))
                .andExpect(status().isCreated());

        mvc.perform(put("/admin/dispatch-tasks/{taskId}/vehicle-groups/{groupId}/matched-driver", taskId, groupId)
                        .header(USER_ID_HEADER, MASTER_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "driverName", "경기기사",
                                "driverPhoneNumber", "010-1111-2222",
                                "vehiclePlateNumber", "12가3456",
                                "driverSource", "GYEONGGI_QUICK"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.matchedDrivers[0].driverSource").value("GYEONGGI_QUICK"));

        mvc.perform(post("/admin/dispatch-tasks/{taskId}/vehicle-groups/{groupId}/manual-dispatch-complete",
                        taskId, groupId)
                        .header(USER_ID_HEADER, MASTER_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "MASTER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("DISPATCHED"))
                .andExpect(jsonPath("$.data.vehicleGroups[0].dispatchStatus").value("DISPATCHED"));

        assertThat(taskRepo.findById(taskId).orElseThrow().getStatus())
                .isEqualTo(DispatchTaskStatus.DISPATCHED);
    }

    @Test
    void manual_matched_driver_rejects_free_text_vendor_and_allows_dispatched_history_update() throws Exception {
        SeededDispatch seeded = dispatchedTaskWithSlip(2);

        mvc.perform(put("/admin/dispatch-tasks/{taskId}/vehicle-groups/{groupId}/matched-driver",
                        seeded.taskId(), seeded.groupId())
                        .header(USER_ID_HEADER, MASTER_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "driverName", "자유값",
                                "driverPhoneNumber", "010-1111-2222",
                                "vehiclePlateNumber", "12가3456",
                                "driverSource", "Manual Source"))))
                .andExpect(status().isBadRequest());

        mvc.perform(put("/admin/dispatch-tasks/{taskId}/vehicle-groups/{groupId}/matched-driver",
                        seeded.taskId(), seeded.groupId())
                        .header(USER_ID_HEADER, MASTER_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "driverName", "경기기사",
                                "driverPhoneNumber", "010-1111-2222",
                                "vehiclePlateNumber", "12가3456",
                                "driverSource", "GYEONGGI_QUICK"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("DISPATCHED"))
                .andExpect(jsonPath("$.data.vehicleGroups[0].dispatchStatus").value("DISPATCHED"))
                .andExpect(jsonPath("$.data.matchedDrivers[0].driverCode").value("MANUAL"))
                .andExpect(jsonPath("$.data.matchedDrivers[0].driverName").value("경기기사"))
                .andExpect(jsonPath("$.data.matchedDrivers[0].driverPhoneNumber").value("010-1111-2222"))
                .andExpect(jsonPath("$.data.matchedDrivers[0].vehiclePlateNumber").value("12가3456"))
                .andExpect(jsonPath("$.data.matchedDrivers[0].driverSource").value("GYEONGGI_QUICK"));
    }

    @Test
    void start_redispatch_denies_sales_without_edit_permission() throws Exception {
        SeededDispatch seeded = dispatchedTaskWithSlip(5);
        Mockito.when(dynamicPermissionClient.canView("SALES", "dispatch.board")).thenReturn(true);
        Mockito.when(dynamicPermissionClient.canEdit("SALES", "dispatch.board")).thenReturn(false);
        Mockito.when(dynamicPermissionClient.check(
                        UUID.fromString(MASTER_ACCOUNT_ID),
                        "dispatch.board",
                        com.samhanair.logis.security.permission.PermissionAction.UPDATE))
                .thenReturn(false);

        mvc.perform(post("/admin/dispatch-tasks/{taskId}/start-redispatch", seeded.taskId())
                        .header(USER_ID_HEADER, MASTER_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "SALES"))
                .andExpect(status().isForbidden());
    }

    @Test
    void manual_dispatch_complete_denies_sales_without_edit_permission() throws Exception {
        UUID taskId = createTask("2099-08-15");
        UUID groupId = addGroup(taskId);
        Mockito.when(dynamicPermissionClient.canView("SALES", "dispatch.board")).thenReturn(true);
        Mockito.when(dynamicPermissionClient.canEdit("SALES", "dispatch.board")).thenReturn(false);
        Mockito.when(dynamicPermissionClient.check(
                        UUID.fromString(MASTER_ACCOUNT_ID),
                        "dispatch.board",
                        com.samhanair.logis.security.permission.PermissionAction.UPDATE))
                .thenReturn(false);

        mvc.perform(post("/admin/dispatch-tasks/{taskId}/vehicle-groups/{groupId}/manual-dispatch-complete",
                        taskId, groupId)
                        .header(USER_ID_HEADER, MASTER_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "SALES"))
                .andExpect(status().isForbidden());
    }

    private SeededDispatch dispatchedTaskWithSlip(int seq) throws Exception {
        UUID arologisId = UUID.randomUUID();
        Mockito.when(arologisDispatchClient.send(ArgumentMatchers.any()))
                .thenReturn(new ArologisDispatchResponse(
                        arologisId, UUID.randomUUID(), Instant.now(), Instant.now()));

        UUID taskId = createTask("2099-08-12");
        UUID groupId = addGroup(taskId);
        Slip slip = slipRepo.saveAndFlush(newSlip(seq));

        mvc.perform(post("/admin/dispatch-tasks/{taskId}/vehicle-groups/{groupId}/slips", taskId, groupId)
                        .header(USER_ID_HEADER, MASTER_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("slipId", slip.getId().toString()))))
                .andExpect(status().isCreated());
        mvc.perform(post("/admin/dispatch-tasks/{taskId}/dispatch", taskId)
                        .header(USER_ID_HEADER, MASTER_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "MASTER"))
                .andExpect(status().isOk());
        mvc.perform(post("/internal/slip/dispatch-tasks/{taskId}/confirm", taskId)
                        .header("X-Internal-Token", "test-internal-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "arologisDispatchId", arologisId.toString(),
                                "matchedDrivers", List.of(Map.of(
                                        "vehicleGroupSequence", 1,
                                        "vehicleType", "TONNAGE_1",
                                        "driverCode", "D-%03d".formatted(seq),
                                        "driverName", "확정기사%d".formatted(seq),
                                        "driverPhoneNumber", "010-2222-%04d".formatted(seq),
                                        "source", "AROLOGIS")),
                                "confirmedAt", Instant.now().toString()))))
                .andExpect(status().isNoContent());

        return new SeededDispatch(taskId, groupId, slip.getId(), arologisId);
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

    private UUID addGroup(UUID taskId) throws Exception {
        String groupRes = mvc.perform(post("/admin/dispatch-tasks/{taskId}/vehicle-groups", taskId)
                        .header(USER_ID_HEADER, MASTER_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "vehicleBodyType", "CARGO",
                                "tonnage", "T_1"))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return UUID.fromString((String) dataMap(groupRes).get("id"));
    }

    private Slip newSlip(int seq) {
        Slip slip = Slip.createOutbound(
                "2099/08/12-DMR-%03d".formatted(seq),
                LocalDate.of(2099, 8, 12),
                seq,
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                "재배차 IT 거래처 %d".formatted(seq),
                DeliveryTag.SALE,
                "재배차 IT",
                MASTER_ACCOUNT_ID);
        ReflectionTestUtils.setField(slip, "partnerCode", "P-DMR-%03d".formatted(seq));
        slip.withProjectInfo(null, "서울시 강남구 재배차로 %d".formatted(seq), null, null,
                "010-0000-%04d".formatted(seq), null);
        return slip;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> dataMap(String responseBody) throws Exception {
        return (Map<String, Object>) objectMapper.readValue(responseBody, Map.class).get("data");
    }

    private record SeededDispatch(UUID taskId, UUID groupId, UUID slipId, UUID arologisDispatchId) {}
}
