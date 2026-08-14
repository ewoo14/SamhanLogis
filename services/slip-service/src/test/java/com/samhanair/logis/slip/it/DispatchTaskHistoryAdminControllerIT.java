package com.samhanair.logis.slip.it;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.nullValue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.security.permission.PermissionAction;
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
import com.samhanair.logis.slip.domain.dispatch.DispatchTask;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleGroup;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleGroupSlip;
import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleType;
import com.samhanair.logis.slip.domain.dispatch.MatchedDriver;
import com.samhanair.logis.slip.domain.dispatch.MatchedDriverSource;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchTaskRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchVehicleGroupRepository;
import com.samhanair.logis.slip.repository.dispatch.DispatchVehicleGroupSlipRepository;
import com.samhanair.logis.slip.repository.dispatch.MatchedDriverRepository;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * 완료배차 내역 조회 IT — list/detail DTO 조립 + dispatch.board VIEW 권한 실 HTTP 검증.
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "dispatch-user", authorities = {"ROLE_DISPATCH"})
class DispatchTaskHistoryAdminControllerIT extends AbstractPostgresIT {

    private static final String USER_ID = "10000000-0000-0000-0000-000000000462";
    private static final String USER_ROLE = "DISPATCH";
    private static final LocalDate BASE_DATE = LocalDate.of(2099, 6, 11);

    @Autowired private MockMvc mvc;
    @Autowired private DispatchTaskRepository taskRepo;
    @Autowired private DispatchVehicleGroupRepository groupRepo;
    @Autowired private DispatchVehicleGroupSlipRepository groupSlipRepo;
    @Autowired private MatchedDriverRepository driverRepo;
    @Autowired private SlipRepository slipRepo;

    @MockBean private ArologisDispatchClient arologisDispatchClient;
    @MockBean private InventoryClient inventoryClient;
    @MockBean private NotificationClient notificationClient;
    @MockBean private NotificationChatRoomClient notificationChatRoomClient;
    @MockBean private PartnerBlockClient partnerBlockClient;
    @MockBean private PartnerInternalClient partnerInternalClient;
    @MockBean private ProductClient productClient;
    @MockBean private SmsGateway smsGateway;
    @MockBean private UserInternalClient userInternalClient;
    @MockBean private WarehouseInternalClient warehouseInternalClient;

    @BeforeEach
    void setUpExternalClients() {
        Mockito.lenient().when(userInternalClient.resolveFullName(any()))
                .thenReturn(Optional.of("담당자"));
    }

    @Test
    void list_filters_status_date_and_paginates_summary() throws Exception {
        SeededDispatch first = seedDispatched("2099/06/11-HIST-1", BASE_DATE, "거래처A", 1);
        seedDispatched("2099/06/11-HIST-2", BASE_DATE, "거래처B", 2);
        seedDraft("2099/06/11-HIST-DRAFT", BASE_DATE);
        seedDispatched("2099/06/20-HIST-OUT", BASE_DATE.plusDays(9), "범위외", 3);

        mvc.perform(get("/admin/dispatch-tasks")
                        .param("from", BASE_DATE.toString())
                        .param("to", BASE_DATE.toString())
                        .param("status", "DISPATCHED")
                        .param("page", "0")
                        .param("size", "1")
                        .header("X-User-Id", USER_ID)
                        .header("X-User-Role", USER_ROLE)
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.totalElements").value(2))
                .andExpect(jsonPath("$.data.content[0].taskCode").value(first.task().getTaskCode()))
                .andExpect(jsonPath("$.data.content[0].status").value("DISPATCHED"))
                .andExpect(jsonPath("$.data.content[0].vehicleGroupCount").value(1))
                .andExpect(jsonPath("$.data.content[0].slipCount").value(1))
                .andExpect(jsonPath("$.data.content[0].partnerNames").value("거래처A"))
                .andExpect(jsonPath("$.data.content[0].driverCount").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(first.task().getId().toString()));
    }

    @Test
    void detail_populates_vehicle_groups_slips_and_matched_drivers() throws Exception {
        SeededDispatch seeded = seedDispatched("2099/06/11-HIST-DETAIL", BASE_DATE, "상세거래처", 4);

        mvc.perform(get("/admin/dispatch-tasks/{taskId}", seeded.task().getId())
                        .header("X-User-Id", USER_ID)
                        .header("X-User-Role", USER_ROLE)
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.id").value(seeded.task().getId().toString()))
                .andExpect(jsonPath("$.data.taskCode").value(seeded.task().getTaskCode()))
                .andExpect(jsonPath("$.data.dispatchDate").value(BASE_DATE.toString()))
                .andExpect(jsonPath("$.data.status").value("DISPATCHED"))
                .andExpect(jsonPath("$.data.arologisDispatchId").value(seeded.task().getArologisDispatchId().toString()))
                .andExpect(jsonPath("$.data.vehicleGroups[0].id").value(seeded.group().getId().toString()))
                .andExpect(jsonPath("$.data.vehicleGroups[0].vehicleType").value("TONNAGE_1"))
                .andExpect(jsonPath("$.data.vehicleGroups[0].sequence").value(1))
                .andExpect(jsonPath("$.data.vehicleGroups[0].slips[0].id").value(seeded.mapping().getId().toString()))
                .andExpect(jsonPath("$.data.vehicleGroups[0].slips[0].slipId").value(seeded.slip().getId().toString()))
                .andExpect(jsonPath("$.data.vehicleGroups[0].slips[0].sequence").value(1))
                .andExpect(jsonPath("$.data.vehicleGroups[0].slips[0].slip.slipNo").value(seeded.slip().getSlipNo()))
                .andExpect(jsonPath("$.data.vehicleGroups[0].slips[0].slip.partnerCode").value("P-HIST-004"))
                .andExpect(jsonPath("$.data.vehicleGroups[0].slips[0].slip.partnerName").value("상세거래처"))
                .andExpect(jsonPath("$.data.vehicleGroups[0].slips[0].slip.deliveryAddress").value("서울시 강남구 4"))
                .andExpect(jsonPath("$.data.vehicleGroups[0].slips[0].slip.recipientPhone").value("010-0000-0004"))
                .andExpect(jsonPath("$.data.vehicleGroups[0].slips[0].slip.dispatchStatus").value("DISPATCHED"))
                .andExpect(jsonPath("$.data.matchedDrivers[0].vehicleGroupSequence").value(1))
                .andExpect(jsonPath("$.data.matchedDrivers[0].driverCode").value("DRV-004"))
                .andExpect(jsonPath("$.data.matchedDrivers[0].driverName").value("기사4"))
                .andExpect(jsonPath("$.data.matchedDrivers[0].driverPhoneNumber").value("010-9999-0004"))
                .andExpect(jsonPath("$.data.matchedDrivers[0].driverSource").value("AROLOGIS"))
                .andExpect(jsonPath("$.data.matchedDrivers[0].vehiclePlateNumber").value("12가0004"));
    }

    @Test
    void list_and_detail_include_manual_only_dispatched_task_without_arologis_dispatch_id() throws Exception {
        SeededDispatch manualOnly = seedManualOnlyDispatched(
                "2099/06/11-HIST-MANUAL", BASE_DATE, "수동완료거래처", 5);

        mvc.perform(get("/admin/dispatch-tasks")
                        .param("from", BASE_DATE.toString())
                        .param("to", BASE_DATE.toString())
                        .param("status", "DISPATCHED")
                        .param("page", "0")
                        .param("size", "20")
                        .header("X-User-Id", USER_ID)
                        .header("X-User-Role", USER_ROLE)
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[?(@.taskCode=='%s')].id",
                        manualOnly.task().getTaskCode()).value(contains(manualOnly.task().getId().toString())))
                .andExpect(jsonPath("$.data.content[?(@.taskCode=='%s')].arologisDispatchId",
                        manualOnly.task().getTaskCode()).value(contains(nullValue())));

        mvc.perform(get("/admin/dispatch-tasks/{taskId}", manualOnly.task().getId())
                        .header("X-User-Id", USER_ID)
                        .header("X-User-Role", USER_ROLE)
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(manualOnly.task().getId().toString()))
                .andExpect(jsonPath("$.data.taskCode").value(manualOnly.task().getTaskCode()))
                .andExpect(jsonPath("$.data.arologisDispatchId").value((Object) null))
                .andExpect(jsonPath("$.data.vehicleGroups[0].slips[0].slip.partnerName")
                        .value("수동완료거래처"))
                .andExpect(jsonPath("$.data.matchedDrivers[0].driverSource").value("GYEONGGI_QUICK"));
    }

    @Test
    void list_requires_dispatch_board_view_permission() throws Exception {
        when(dynamicPermissionClient.check(any(UUID.class), eq("dispatch.board"), eq(PermissionAction.VIEW)))
                .thenReturn(false);
        when(dynamicPermissionClient.canView(anyString(), eq("dispatch.board"))).thenReturn(false);

        mvc.perform(get("/admin/dispatch-tasks")
                        .param("from", BASE_DATE.toString())
                        .param("to", BASE_DATE.toString())
                        .header("X-User-Id", USER_ID)
                        .header("X-User-Role", USER_ROLE))
                .andExpect(status().isForbidden());
    }

    private SeededDispatch seedDispatched(String taskCode, LocalDate dispatchDate, String partnerName, int seq) {
        DispatchTask task = DispatchTask.create(taskCode, dispatchDate);
        task.markDispatching();
        task.markDispatched(UUID.nameUUIDFromBytes(("arologis-" + taskCode).getBytes()));
        task = taskRepo.save(task);

        DispatchVehicleGroup group = DispatchVehicleGroup.create(task.getId(), 1, DispatchVehicleType.TONNAGE_1);
        group.markDispatched();
        group = groupRepo.save(group);
        Slip slip = slipRepo.save(newSlip(dispatchDate, partnerName, seq));
        slip.markDispatchPending();
        slip.markDispatchConfirmed();
        DispatchVehicleGroupSlip mapping = groupSlipRepo.save(
                DispatchVehicleGroupSlip.create(group.getId(), slip.getId(), 1));
        driverRepo.save(MatchedDriver.create(
                group.getId(),
                "DRV-%03d".formatted(seq),
                "기사%d".formatted(seq),
                "010-9999-%04d".formatted(seq),
                MatchedDriverSource.AROLOGIS,
                "12가%04d".formatted(seq)));
        return new SeededDispatch(task, group, mapping, slip);
    }

    private SeededDispatch seedManualOnlyDispatched(
            String taskCode,
            LocalDate dispatchDate,
            String partnerName,
            int seq
    ) {
        DispatchTask task = DispatchTask.create(taskCode, dispatchDate);
        task.markDispatching();
        task.markDispatched(null);
        task = taskRepo.save(task);

        DispatchVehicleGroup group = DispatchVehicleGroup.create(task.getId(), 1, DispatchVehicleType.TONNAGE_1);
        group.markDispatched();
        group = groupRepo.save(group);
        Slip slip = slipRepo.save(newSlip(dispatchDate, partnerName, seq));
        slip.markDispatchPending();
        slip.markDispatchConfirmed();
        DispatchVehicleGroupSlip mapping = groupSlipRepo.save(
                DispatchVehicleGroupSlip.create(group.getId(), slip.getId(), 1));
        driverRepo.save(MatchedDriver.create(
                group.getId(),
                "MANUAL",
                "수동기사%d".formatted(seq),
                "010-8888-%04d".formatted(seq),
                MatchedDriverSource.GYEONGGI_QUICK,
                "98허%04d".formatted(seq)));
        return new SeededDispatch(task, group, mapping, slip);
    }

    private void seedDraft(String taskCode, LocalDate dispatchDate) {
        taskRepo.save(DispatchTask.create(taskCode, dispatchDate));
    }

    private Slip newSlip(LocalDate slipDate, String partnerName, int seq) {
        Slip slip = Slip.createOutbound(
                "2099/06/11-S%03d".formatted(seq),
                slipDate,
                seq,
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                partnerName,
                DeliveryTag.SALE,
                "완료배차 내역 IT",
                USER_ID);
        ReflectionTestUtils.setField(slip, "partnerCode", "P-HIST-%03d".formatted(seq));
        slip.withProjectInfo(null, "서울시 강남구 %d".formatted(seq), null, null,
                "010-0000-%04d".formatted(seq), null);
        return slip;
    }

    private record SeededDispatch(
            DispatchTask task,
            DispatchVehicleGroup group,
            DispatchVehicleGroupSlip mapping,
            Slip slip
    ) {}
}
