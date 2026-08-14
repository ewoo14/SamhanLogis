package com.samhanair.logis.arologis.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.not;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.arologis.client.AuthPermissionAdminClient;
import com.samhanair.logis.arologis.client.SlipClient;
import com.samhanair.logis.arologis.config.HeaderAuthenticationFilter;
import com.samhanair.logis.arologis.controller.ArologisAccountingController;
import com.samhanair.logis.arologis.controller.ArologisAdminController;
import com.samhanair.logis.arologis.controller.ArologisDriverAppController;
import com.samhanair.logis.arologis.controller.ArologisHrController;
import com.samhanair.logis.arologis.controller.ArologisPermissionAdminController;
import com.samhanair.logis.arologis.controller.DispatchAdminV1Controller;
import com.samhanair.logis.arologis.controller.DispatchReconcileController;
import com.samhanair.logis.arologis.controller.RegionAdminController;
import com.samhanair.logis.arologis.domain.Dispatch;
import com.samhanair.logis.arologis.domain.DispatchType;
import com.samhanair.logis.arologis.domain.Driver;
import com.samhanair.logis.arologis.domain.DriverSource;
import com.samhanair.logis.arologis.domain.RegionDispatchClassification;
import com.samhanair.logis.arologis.domain.VehicleTonnage;
import com.samhanair.logis.arologis.dto.ManualDispatchPreviewResponse;
import com.samhanair.logis.arologis.parser.KakaoDispatchParser;
import com.samhanair.logis.arologis.parser.ParsedDispatch;
import com.samhanair.logis.arologis.realtime.domain.ArologisEditRequest;
import com.samhanair.logis.arologis.realtime.service.ArologisAuditLogRecorder;
import com.samhanair.logis.arologis.realtime.service.ArologisEditRequestService;
import com.samhanair.logis.arologis.repository.DispatchRepository;
import com.samhanair.logis.arologis.repository.DriverLocationRepository;
import com.samhanair.logis.arologis.repository.DriverRepository;
import com.samhanair.logis.arologis.repository.SignatureRepository;
import com.samhanair.logis.arologis.repository.VehicleRepository;
import com.samhanair.logis.arologis.repository.VehicleStopRepository;
import com.samhanair.logis.arologis.service.ArologisAccountingService;
import com.samhanair.logis.arologis.service.ArologisDepartmentService;
import com.samhanair.logis.arologis.service.ArologisEmployeeService;
import com.samhanair.logis.arologis.service.DispatchAdminService;
import com.samhanair.logis.arologis.service.DispatchManualService;
import com.samhanair.logis.arologis.service.DispatchNotificationAssembler;
import com.samhanair.logis.arologis.service.DispatchReconcileService;
import com.samhanair.logis.arologis.service.DispatchSaveHistoryService;
import com.samhanair.logis.arologis.service.DispatchService;
import com.samhanair.logis.arologis.service.DriverService;
import com.samhanair.logis.arologis.service.GpsSourceAssembler;
import com.samhanair.logis.arologis.service.PreClassifyService;
import com.samhanair.logis.arologis.service.RegionImportService;
import com.samhanair.logis.arologis.service.RegionService;
import com.samhanair.logis.arologis.service.RegionalService;
import com.samhanair.logis.arologis.service.SlipResolver;
import com.samhanair.logis.arologis.service.UnassignedService;
import com.samhanair.logis.arologis.service.auth.JwtIssuer;
import com.samhanair.logis.arologis.service.copy.SignAndSendCopyService;
import com.samhanair.logis.arologis.web.DispatchSaveHistoryController;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.PermissionGuardMetrics;
import com.samhanair.logis.security.permission.PermissionSecurityAutoConfiguration;
import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
import com.samhanair.logis.shared.realtime.editrequest.EditRequestType;
import com.samhanair.logis.shared.realtime.editrequest.EditTargetRole;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.data.jpa.mapping.JpaMetamodelMappingContext;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@WebMvcTest(
        controllers = {
                ArologisAdminController.class,
                DispatchAdminV1Controller.class,
                RegionAdminController.class,
                DispatchReconcileController.class,
                DispatchSaveHistoryController.class,
                ArologisDriverAppController.class,
                ArologisHrController.class,
                ArologisAccountingController.class,
                ArologisPermissionAdminController.class
        },
        properties = {
                "spring.application.name=arologis-service",
                "samhan.security.permission.enforcement-mode=role"
        })
@Import({
        PermissionSecurityAutoConfiguration.class,
        GatewayAttestationMockMvcConfig.class,
        ArologisPermissionControllerIT.TestSecurityConfig.class,
        ArologisPermissionControllerIT.TestMeterConfig.class
})
class ArologisPermissionControllerIT {

    private static final String SERVICE_NAME = "arologis-service";
    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String ROLE_HEADER = "X-User-Role";
    private static final UUID ID = UUID.fromString("00000000-0000-0000-0000-000000000501");

    @Autowired private MockMvc mockMvc;
    @Autowired private MeterRegistry meterRegistry;

    @MockBean private DynamicPermissionClient dynamicPermissionClient;
    @MockBean private KakaoDispatchParser parser;
    @MockBean private DispatchService dispatchService;
    @MockBean private DispatchManualService manualService;
    @MockBean private DriverService driverService;
    @MockBean private GpsSourceAssembler gpsSourceAssembler;
    @MockBean private DispatchNotificationAssembler dispatchNotificationAssembler;
    @MockBean private DriverRepository driverRepository;
    @MockBean private PreClassifyService preClassifyService;
    @MockBean private UnassignedService unassignedService;
    @MockBean private RegionalService regionalService;
    @MockBean private ArologisAuditLogRecorder auditLogRecorder;
    @MockBean private ArologisEditRequestService editRequestService;
    @MockBean private RealtimeBroker realtimeBroker;
    @MockBean private DispatchAdminService dispatchAdminService;
    @MockBean private RegionService regionService;
    @MockBean private RegionImportService regionImportService;
    @MockBean private DispatchReconcileService dispatchReconcileService;
    @MockBean private DispatchSaveHistoryService dispatchSaveHistoryService;
    @MockBean private DispatchRepository dispatchRepository;
    @MockBean private VehicleRepository vehicleRepository;
    @MockBean private VehicleStopRepository stopRepository;
    @MockBean private SignatureRepository signatureRepository;
    @MockBean private DriverLocationRepository locationRepository;
    @MockBean private SlipClient slipClient;
    @MockBean private SlipResolver slipResolver;
    @MockBean private SignAndSendCopyService signAndSendCopyService;
    @MockBean private ArologisEmployeeService arologisEmployeeService;
    @MockBean private ArologisDepartmentService arologisDepartmentService;
    @MockBean private ArologisAccountingService arologisAccountingService;
    @MockBean private AuthPermissionAdminClient authPermissionAdminClient;
    @MockBean private JwtIssuer jwtIssuer;
    @MockBean private JpaMetamodelMappingContext jpaMetamodelMappingContext;

    @BeforeEach
    void setUp() throws Exception {
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);

        Driver driver = Driver.of("DRV-001", "010-0000-0000", "1톤", DriverSource.INTERNAL, false, ID);
        ParsedDispatch parsed = new ParsedDispatch(
                java.time.LocalDate.of(2026, 5, 26),
                DispatchType.DAY,
                List.of(new ParsedDispatch.ParsedVehicle(1, VehicleTonnage.TONNAGE_1, "label", List.of())),
                1,
                1);
        ManualDispatchPreviewResponse preview = new ManualDispatchPreviewResponse(
                java.time.LocalDate.of(2026, 5, 26),
                DispatchType.DAY,
                List.of(),
                1,
                1,
                null);
        RegionDispatchClassification region = RegionDispatchClassification.of("서울", "서울", 1);
        ArologisEditRequest editRequest = ArologisEditRequest.create(
                ID,
                ID,
                "tester",
                EditRequestType.EDIT,
                "reason",
                EditTargetRole.MANAGER,
                java.time.LocalDateTime.of(2026, 5, 27, 9, 0));

        lenient().when(parser.parse(anyString(), any())).thenReturn(parsed);
        lenient().when(manualService.manualCreate(any())).thenReturn(ID);
        lenient().when(manualService.manualPreview(any())).thenReturn(preview);
        lenient().when(dispatchService.findByDateAndType(any(), any())).thenReturn(List.of());
        lenient().when(dispatchService.findById(any()))
                .thenReturn(new DispatchService.DispatchAggregate(
                        Dispatch.of(java.time.LocalDate.of(2026, 5, 26), DispatchType.DAY, "raw"),
                        List.of(),
                        List.of()));
        lenient().when(dispatchService.autoMatch(any())).thenReturn(new DispatchService.AutoMatchResult(0, 0));
        lenient().when(driverService.findDrivers(any(), any(), any())).thenReturn(List.of());
        lenient().when(auditLogRecorder.listByEntity(any())).thenReturn(List.of());
        lenient().when(editRequestService.request(any(), any(), any(), any(), anyString())).thenReturn(editRequest);
        lenient().when(editRequestService.approve(any(), any(), anyString(), any())).thenReturn(editRequest);
        lenient().when(editRequestService.reject(any(), any(), anyString(), any())).thenReturn(editRequest);
        lenient().when(editRequestService.listPendingForRole(any())).thenReturn(List.of());
        lenient().when(realtimeBroker.subscribe(any())).thenReturn(new SseEmitter(100L));
        lenient().when(regionService.findAll()).thenReturn(List.of());
        lenient().when(regionService.create(anyString(), any(), any())).thenReturn(region);
        lenient().when(regionService.update(any(), any(), any())).thenReturn(region);
        lenient().when(regionImportService.importCsv(any()))
                .thenReturn(new RegionImportService.ImportResult(0, 0, List.of()));
        lenient().when(driverRepository.findByAppUserId(any())).thenReturn(Optional.of(driver));
        lenient().when(vehicleRepository.findAllAssignedToDriverOnDate(any(), any())).thenReturn(List.of());
        lenient().when(vehicleRepository.findAllAssignedToDriverOnDateAndTypeAndSequence(any(), any(), any(), any()))
                .thenReturn(List.of());
        lenient().when(vehicleRepository.findFirstByDispatchIdAndSequence(any(), any())).thenReturn(Optional.empty());
        lenient().when(signAndSendCopyService.execute(any(), anyInt(), anyInt(), any(), any()))
                .thenThrow(new IllegalArgumentException("test"));
        lenient().when(arologisEmployeeService.list(null)).thenReturn(List.of());
        lenient().when(arologisEmployeeService.roleHistories("hr-kim")).thenReturn(List.of());
        lenient().when(arologisDepartmentService.list()).thenReturn(List.of());

        ArologisAccountingService.CashTxnView cashTxn = new ArologisAccountingService.CashTxnView(
                ID,
                java.time.LocalDate.of(2026, 6, 8),
                com.samhanair.logis.arologis.domain.CashTxnType.INCOME,
                "거래처",
                new java.math.BigDecimal("1000.00"),
                "4010",
                "운송수입",
                "메모");
        ArologisAccountingService.CashSummaryView summary = new ArologisAccountingService.CashSummaryView(
                java.time.LocalDate.of(2026, 6, 1),
                java.time.LocalDate.of(2026, 6, 30),
                java.math.BigDecimal.ZERO,
                java.math.BigDecimal.ZERO,
                java.math.BigDecimal.ZERO,
                0);
        lenient().when(arologisAccountingService.listAccounts()).thenReturn(List.of());
        lenient().when(arologisAccountingService.list(any(), any(), any())).thenReturn(List.of());
        lenient().when(arologisAccountingService.get(any())).thenReturn(cashTxn);
        lenient().when(arologisAccountingService.create(any(), any())).thenReturn(cashTxn);
        lenient().when(arologisAccountingService.update(any(), any(), any())).thenReturn(cashTxn);
        lenient().when(arologisAccountingService.summary(any(), any())).thenReturn(summary);
        lenient().when(arologisAccountingService.monthlySummary(anyInt(), anyInt())).thenReturn(summary);

        AuthPermissionAdminClient.RolePagePermissionView permView =
                new AuthPermissionAdminClient.RolePagePermissionView(
                        "MASTER", "arologis.admin.permissions", "아로로지스 권한 관리", true, true);
        lenient().when(authPermissionAdminClient.getRoleMatrix(anyString()))
                .thenReturn(java.util.Map.of("MASTER",
                        java.util.Map.of("arologis.admin.permissions", permView)));
        lenient().when(authPermissionAdminClient.updateRoleGrant(
                        anyString(), anyString(), anyBoolean(), anyBoolean(), anyString()))
                .thenReturn(permView);
    }

    @ParameterizedTest(name = "{0} grant")
    @MethodSource("endpoints")
    void migratedEndpoint_withGrant_isNotForbidden(EndpointCase endpoint) throws Exception {
        mockMvc.perform(withActor(endpoint.request().get(), endpoint.role()))
                .andExpect(status().is(not(403)));
    }

    @ParameterizedTest(name = "{0} deny")
    @MethodSource("endpoints")
    void migratedEndpoint_withoutGrant_returns403AndIncrementsCounter(EndpointCase endpoint) throws Exception {
        if (endpoint.action() == PermissionAction.VIEW) {
            when(dynamicPermissionClient.canView(eq(endpoint.role()), eq(endpoint.page()))).thenReturn(false);
        } else {
            when(dynamicPermissionClient.canEdit(eq(endpoint.role()), eq(endpoint.page()))).thenReturn(false);
        }
        double before = deniedCount(endpoint.page(), endpoint.role(), endpoint.action());

        mockMvc.perform(withActor(endpoint.request().get(), endpoint.role()))
                .andExpect(status().isForbidden());

        assertThat(deniedCount(endpoint.page(), endpoint.role(), endpoint.action())).isEqualTo(before + 1.0);
    }

    @Test
    void reconcileMissingMultipartFile_returns400WithoutRawPartName() throws Exception {
        var result = mockMvc.perform(withActor(
                        multipart("/admin/arologis/dispatch/reconcile")
                                .param("from", "2026-05-26")
                                .param("to", "2026-05-27"),
                        "AROLOGIS_MANAGER"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"))
                .andExpect(jsonPath("$.message").value("필수 업로드 파일이 누락되었습니다."))
                .andReturn();

        assertThat(result.getResponse().getContentAsString())
                .doesNotContain("files")
                .doesNotContain("requestPartName");
    }

    static Stream<EndpointCase> endpoints() {
        return Stream.of(
                endpoint("parse kakao", "arologis.dispatch.admin", PermissionAction.CREATE, "AROLOGIS_MANAGER",
                        () -> post("/admin/arologis/dispatches/parse-kakao")
                                .contentType(MediaType.APPLICATION_JSON).content("{\"kakaoText\":\"text\"}")),
                endpoint("dispatch create", "arologis.dispatch.admin", PermissionAction.CREATE, "AROLOGIS_MANAGER",
                        () -> post("/admin/arologis/dispatches")
                                .contentType(MediaType.APPLICATION_JSON).content("{\"kakaoText\":\"text\"}")),
                endpoint("manual create", "arologis.dispatch.admin", PermissionAction.CREATE, "AROLOGIS_MANAGER",
                        () -> post("/admin/arologis/dispatches/manual")
                                .contentType(MediaType.APPLICATION_JSON).content(manualBody())),
                endpoint("manual preview", "arologis.dispatch.admin", PermissionAction.CREATE, "AROLOGIS_MANAGER",
                        () -> post("/admin/arologis/dispatches/manual/preview")
                                .contentType(MediaType.APPLICATION_JSON).content(manualBody())),
                endpoint("dispatch list", "arologis.dispatch.admin", PermissionAction.VIEW, "AROLOGIS_MANAGER",
                        () -> get("/admin/arologis/dispatches")),
                endpoint("dispatch detail", "arologis.dispatch.admin", PermissionAction.VIEW, "AROLOGIS_MANAGER",
                        () -> get("/admin/arologis/dispatches/{id}", ID)),
                endpoint("dispatch auto match", "arologis.dispatch.admin", PermissionAction.UPDATE, "AROLOGIS_MANAGER",
                        () -> post("/admin/arologis/dispatches/{id}/auto-match", ID)),
                endpoint("vehicle match external", "arologis.dispatch.admin", PermissionAction.UPDATE, "AROLOGIS_MANAGER",
                        () -> post("/admin/arologis/dispatches/{id}/vehicles/1/match-external", ID)),
                endpoint("assign driver", "arologis.dispatch.admin", PermissionAction.UPDATE, "AROLOGIS_MANAGER",
                        () -> post("/admin/arologis/dispatches/{id}/vehicles/1/assign-driver", ID)
                                .contentType(MediaType.APPLICATION_JSON).content("{\"driverCode\":\"DRV-001\"}")),
                endpoint("manual location", "arologis.dispatch.admin", PermissionAction.UPDATE, "AROLOGIS_MANAGER",
                        () -> post("/admin/arologis/dispatches/{id}/vehicles/1/manual-location", ID)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"latitude\":37.1234567,\"longitude\":127.1234567}")),
                endpoint("update stop status", "arologis.dispatch.admin", PermissionAction.UPDATE, "AROLOGIS_MANAGER",
                        () -> put("/admin/arologis/dispatches/{id}/vehicles/1/stops/1/status", ID)
                                .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"ARRIVED\"}")),
                endpoint("driver list", "arologis.dispatch.admin", PermissionAction.VIEW, "AROLOGIS_MANAGER",
                        () -> get("/admin/arologis/drivers")),
                endpoint("soft delete", "arologis.dispatch.admin", PermissionAction.DELETE, "AROLOGIS_MANAGER",
                        () -> put("/admin/arologis/dispatches/{id}/delete", ID)),
                endpoint("pre classify", "arologis.dispatch.ops", PermissionAction.VIEW, "AROLOGIS_MANAGER",
                        () -> get("/admin/arologis/dispatches/pre-classify")
                                .param("from", "2026-05-26").param("to", "2026-05-27")),
                endpoint("unassigned", "arologis.dispatch.ops", PermissionAction.VIEW, "AROLOGIS_MANAGER",
                        () -> get("/admin/arologis/dispatches/unassigned").param("date", "2026-05-26")),
                endpoint("regional", "arologis.dispatch.ops", PermissionAction.VIEW, "AROLOGIS_MANAGER",
                        () -> get("/admin/arologis/dispatches/regional").param("date", "2026-05-26")),
                endpoint("audit logs", "arologis.dispatch.ops", PermissionAction.VIEW, "AROLOGIS_MANAGER",
                        () -> get("/admin/arologis/dispatches/{id}/audit-logs", ID)),
                endpoint("dispatch realtime", "arologis.dispatch.ops", PermissionAction.VIEW, "AROLOGIS_MANAGER",
                        () -> get("/admin/arologis/dispatches/{id}/realtime", ID)),
                endpoint("edit request create", "arologis.edit-requests", PermissionAction.CREATE, "AROLOGIS_MANAGER",
                        () -> post("/admin/arologis/dispatches/{id}/edit-requests", ID)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"requestType\":\"EDIT\",\"reason\":\"reason\"}")),
                endpoint("edit pending", "arologis.edit-requests.decide", PermissionAction.VIEW, "AROLOGIS_MANAGER",
                        () -> get("/admin/arologis/edit-requests/pending")),
                endpoint("edit approve", "arologis.edit-requests.decide", PermissionAction.UPDATE, "AROLOGIS_MANAGER",
                        () -> post("/admin/arologis/edit-requests/{requestId}/approve", ID)
                                .contentType(MediaType.APPLICATION_JSON).content("{\"note\":\"ok\"}")),
                endpoint("edit reject", "arologis.edit-requests.decide", PermissionAction.UPDATE, "AROLOGIS_MANAGER",
                        () -> post("/admin/arologis/edit-requests/{requestId}/reject", ID)
                                .contentType(MediaType.APPLICATION_JSON).content("{\"decisionReason\":\"no\"}")),
                endpoint("admin v1 list", "arologis.dispatch.admin", PermissionAction.VIEW, "AROLOGIS_MANAGER",
                        () -> get("/api/v1/arologis/admin/dispatches")),
                endpoint("admin v1 auto match", "arologis.dispatch.admin", PermissionAction.UPDATE, "AROLOGIS_MANAGER",
                        () -> post("/api/v1/arologis/admin/dispatches/auto-match")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"dispatchId\":\"" + ID + "\"}")),
                endpoint("admin v1 manual assign", "arologis.dispatch.admin", PermissionAction.UPDATE, "AROLOGIS_MANAGER",
                        () -> post("/api/v1/arologis/admin/dispatches/{id}/manual-assign", ID)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"vehicleSeq\":1,\"driverCode\":\"DRV-001\"}")),
                endpoint("admin v1 change driver", "arologis.dispatch.admin", PermissionAction.UPDATE, "AROLOGIS_MANAGER",
                        () -> patch("/api/v1/arologis/admin/dispatches/{id}/driver", ID)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"vehicleSeq\":1,\"newDriverCode\":\"DRV-002\"}")),
                endpoint("admin v1 available drivers", "arologis.dispatch.admin", PermissionAction.VIEW, "AROLOGIS_MANAGER",
                        () -> get("/api/v1/arologis/admin/drivers/available")),
                endpoint("region list", "arologis.region", PermissionAction.VIEW, "AROLOGIS_MANAGER",
                        () -> get("/admin/arologis/regions")),
                endpoint("region create", "arologis.region.manage", PermissionAction.CREATE, "AROLOGIS_MANAGER",
                        () -> post("/admin/arologis/regions")
                                .contentType(MediaType.APPLICATION_JSON).content(regionBody())),
                endpoint("region import", "arologis.region.manage", PermissionAction.CREATE, "AROLOGIS_MANAGER",
                        () -> multipart("/admin/arologis/regions/import").file(csv("file"))),
                endpoint("region update", "arologis.region.manage", PermissionAction.UPDATE, "AROLOGIS_MANAGER",
                        () -> put("/admin/arologis/regions/{id}", ID)
                                .contentType(MediaType.APPLICATION_JSON).content(regionBody())),
                endpoint("region delete", "arologis.region.manage", PermissionAction.DELETE, "AROLOGIS_MANAGER",
                        () -> delete("/admin/arologis/regions/{id}", ID)),
                endpoint("reconcile", "arologis.dispatch.ops", PermissionAction.CREATE, "AROLOGIS_MANAGER",
                        () -> multipart("/admin/arologis/dispatch/reconcile")
                                .file(csv("files"))
                                .param("from", "2026-05-26")
                                .param("to", "2026-05-27")),
                endpoint("history save", "arologis.dispatch.ops", PermissionAction.CREATE, "AROLOGIS_MANAGER",
                        () -> post("/admin/arologis/dispatches/history")
                                .contentType(MediaType.APPLICATION_JSON).content(historyBody())),
                endpoint("history list", "arologis.dispatch.ops", PermissionAction.VIEW, "AROLOGIS_MANAGER",
                        () -> get("/admin/arologis/dispatches/history")),
                endpoint("history detail", "arologis.dispatch.ops", PermissionAction.VIEW, "AROLOGIS_MANAGER",
                        () -> get("/admin/arologis/dispatches/history/{id}", ID)),
                endpoint("history latest", "arologis.dispatch.ops", PermissionAction.VIEW, "AROLOGIS_MANAGER",
                        () -> get("/admin/arologis/dispatches/history/latest").param("programType", "PRE_CLASSIFY")),
                endpoint("driver today", "arologis.driver", PermissionAction.VIEW, "AROLOGIS_DRIVER",
                        () -> get("/driver-app/arologis/dispatches/today")),
                endpoint("driver location", "arologis.driver", PermissionAction.CREATE, "AROLOGIS_DRIVER",
                        () -> post("/driver-app/arologis/locations")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"latitude\":\"37.1\",\"longitude\":\"127.1\"}")),
                endpoint("driver sign", "arologis.driver", PermissionAction.CREATE, "AROLOGIS_DRIVER",
                        () -> post("/driver-app/arologis/dispatches/{id}/vehicles/1/stops/1/sign", ID)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"imageRef\":\"s3://x\",\"driverCode\":\"DRV-001\"}")),
                endpoint("driver sign copy today", "arologis.driver", PermissionAction.CREATE, "AROLOGIS_DRIVER",
                        () -> post("/driver-app/arologis/dispatches/today/DAY/vehicles/1/stops/1/sign-and-send-copy")
                                .contentType(MediaType.APPLICATION_JSON).content(signBody())),
                endpoint("driver photo today", "arologis.driver", PermissionAction.CREATE, "AROLOGIS_DRIVER",
                        () -> multipart("/driver-app/arologis/dispatches/today/DAY/vehicles/1/stops/1/photos/DELIVERY")
                                .file(image("file"))),
                endpoint("driver slip detail", "arologis.driver", PermissionAction.VIEW, "AROLOGIS_DRIVER",
                        () -> get("/driver-app/arologis/dispatches/today/DAY/vehicles/1/stops/1/slip-detail")),
                endpoint("driver legacy sign copy", "arologis.driver", PermissionAction.CREATE, "AROLOGIS_DRIVER",
                        () -> post("/driver-app/arologis/dispatches/{id}/vehicles/1/stops/1/sign-and-send-copy", ID)
                                .contentType(MediaType.APPLICATION_JSON).content(signBody())),
                endpoint("hr employee list", "arologis.hr.employees", PermissionAction.VIEW, "AROLOGIS_MANAGER",
                        () -> get("/admin/arologis/hr/employees")),
                endpoint("hr employee create", "arologis.hr.employees", PermissionAction.CREATE, "AROLOGIS_MANAGER",
                        () -> post("/admin/arologis/hr/employees")
                                .contentType(MediaType.APPLICATION_JSON).content(employeeBody())),
                endpoint("hr employee update", "arologis.hr.employees", PermissionAction.UPDATE, "AROLOGIS_MANAGER",
                        () -> put("/admin/arologis/hr/employees/hr-kim")
                                .contentType(MediaType.APPLICATION_JSON).content(employeeUpdateBody())),
                endpoint("hr employee role", "arologis.hr.employees", PermissionAction.UPDATE, "AROLOGIS_MANAGER",
                        () -> put("/admin/arologis/hr/employees/hr-kim/role")
                                .contentType(MediaType.APPLICATION_JSON).content(roleBody())),
                endpoint("hr employee terminate", "arologis.hr.employees", PermissionAction.DELETE, "AROLOGIS_MANAGER",
                        () -> put("/admin/arologis/hr/employees/hr-kim/terminate")
                                .contentType(MediaType.APPLICATION_JSON).content("{\"terminationDate\":\"2026-06-30\"}")),
                endpoint("hr role histories", "arologis.hr.employees", PermissionAction.VIEW, "AROLOGIS_MANAGER",
                        () -> get("/admin/arologis/hr/employees/hr-kim/role-histories")),
                endpoint("hr department list", "arologis.hr.departments", PermissionAction.VIEW, "AROLOGIS_MANAGER",
                        () -> get("/admin/arologis/hr/departments")),
                endpoint("hr department create", "arologis.hr.departments", PermissionAction.CREATE, "AROLOGIS_MANAGER",
                        () -> post("/admin/arologis/hr/departments")
                                .contentType(MediaType.APPLICATION_JSON).content(departmentBody())),
                endpoint("hr department update", "arologis.hr.departments", PermissionAction.UPDATE, "AROLOGIS_MANAGER",
                        () -> put("/admin/arologis/hr/departments/ADMIN")
                                .contentType(MediaType.APPLICATION_JSON).content(departmentUpdateBody())),
                endpoint("hr department delete", "arologis.hr.departments", PermissionAction.DELETE, "AROLOGIS_MANAGER",
                        () -> put("/admin/arologis/hr/departments/ADMIN/delete")),
                endpoint("accounting account list", "arologis.accounting.cashbook", PermissionAction.VIEW,
                        "AROLOGIS_MANAGER", () -> get("/admin/arologis/accounting/accounts")),
                endpoint("accounting txn list", "arologis.accounting.cashbook", PermissionAction.VIEW,
                        "AROLOGIS_MANAGER", () -> get("/admin/arologis/accounting/cash-txns")
                                .param("from", "2026-06-01").param("to", "2026-06-30")),
                endpoint("accounting txn detail", "arologis.accounting.cashbook", PermissionAction.VIEW,
                        "AROLOGIS_MANAGER", () -> get("/admin/arologis/accounting/cash-txns/{id}", ID)),
                endpoint("accounting txn create", "arologis.accounting.cashbook", PermissionAction.CREATE,
                        "AROLOGIS_MANAGER", () -> post("/admin/arologis/accounting/cash-txns")
                                .contentType(MediaType.APPLICATION_JSON).content(cashTxnBody())),
                endpoint("accounting txn update", "arologis.accounting.cashbook", PermissionAction.UPDATE,
                        "AROLOGIS_MANAGER", () -> put("/admin/arologis/accounting/cash-txns/{id}", ID)
                                .contentType(MediaType.APPLICATION_JSON).content(cashTxnBody())),
                endpoint("accounting txn delete", "arologis.accounting.cashbook", PermissionAction.DELETE,
                        "AROLOGIS_MANAGER", () -> delete("/admin/arologis/accounting/cash-txns/{id}", ID)),
                endpoint("accounting summary", "arologis.accounting.summary", PermissionAction.VIEW,
                        "AROLOGIS_MANAGER", () -> get("/admin/arologis/accounting/summary")
                                .param("year", "2026").param("month", "6")),
                // 계정과목 관리(활성상태) = cashbook 과 분리된 page-code. 매니저는 거래 입력(cashbook)은
                // 되지만 계정 마스터 관리(accounts)는 격리됨 — page-code 오타 시 우회 회귀를 HTTP 레벨로 적발.
                endpoint("accounting account list all", "arologis.accounting.accounts", PermissionAction.VIEW,
                        "AROLOGIS_MANAGER", () -> get("/admin/arologis/accounting/accounts/all")),
                endpoint("accounting account set active", "arologis.accounting.accounts", PermissionAction.UPDATE,
                        "AROLOGIS_MANAGER", () -> put("/admin/arologis/accounting/accounts/1030/active")
                                .contentType(MediaType.APPLICATION_JSON).content("{\"active\":false}"))
        );
    }

    private static EndpointCase endpoint(
            String name, String page, PermissionAction action, String role,
            Supplier<MockHttpServletRequestBuilder> request) {
        return new EndpointCase(name, page, action, role, request);
    }

    private static String manualBody() {
        return """
                {"dispatchDate":"2026-05-26","dispatchType":"DAY","vehicles":[{"sequence":1,"tonnage":"TONNAGE_1","stops":[{"sequence":1,"address":"서울"}]}]}
                """;
    }

    private static String regionBody() {
        return "{\"groupName\":\"서울\",\"keywords\":\"서울\",\"sortOrder\":1}";
    }

    private static String historyBody() {
        return """
                {"programType":"PRE_CLASSIFY","saveMode":"MANUAL_NAMED","topic":"test","requestParams":{},"responsePayload":{}}
                """;
    }

    private static String signBody() {
        return """
                {"driverSignatureBase64":"driver","recipientSignatureBase64":"recipient","capturedAt":"2026-05-26T09:00:00"}
                """;
    }

    private static String employeeBody() {
        return """
                {"loginId":"hr-kim","fullName":"김인사","position":"대리","departmentCode":"ADMIN","hireDate":"2026-06-08","email":"hr-kim@example.com","phone":"010-1111-2222","role":"AROLOGIS_MANAGER"}
                """;
    }

    private static String employeeUpdateBody() {
        return """
                {"fullName":"김인사","position":"과장","departmentCode":"ADMIN","email":"hr-kim@example.com","phone":"010-1111-2222"}
                """;
    }

    private static String roleBody() {
        return "{\"role\":\"AROLOGIS_MASTER\",\"reason\":\"승급\"}";
    }

    private static String departmentBody() {
        return "{\"code\":\"ADMIN\",\"name\":\"행정\",\"displayOrder\":10}";
    }

    private static String departmentUpdateBody() {
        return "{\"name\":\"행정팀\",\"displayOrder\":11}";
    }

    private static String cashTxnBody() {
        return """
                {"txnDate":"2026-06-08","type":"INCOME","partnerName":"한진택배","amount":150000.00,"accountCode":"4010","description":"운송료"}
                """;
    }

    private static MockMultipartFile csv(String name) {
        return new MockMultipartFile(name, "sample.csv", "text/csv", "x".getBytes());
    }

    private static MockMultipartFile image(String name) {
        return new MockMultipartFile(name, "photo.png", "image/png", "x".getBytes());
    }

    private static MockHttpServletRequestBuilder withActor(MockHttpServletRequestBuilder request, String role) {
        return request
                .header(USER_ID_HEADER, ID.toString())
                .header(ROLE_HEADER, role);
    }

    private double deniedCount(String page, String role, PermissionAction action) {
        return meterRegistry.counter(
                PermissionGuardMetrics.COUNTER_NAME,
                "service", SERVICE_NAME,
                "page", page,
                "role", role,
                "action", action.name()
        ).count();
    }

    record EndpointCase(
            String name,
            String page,
            PermissionAction action,
            String role,
            Supplier<MockHttpServletRequestBuilder> request) {

        @Override
        public String toString() {
            return name;
        }
    }

    @TestConfiguration
    @EnableMethodSecurity
    static class TestSecurityConfig {

        @Bean
        SecurityFilterChain testSecurityFilterChain(HttpSecurity http) throws Exception {
            http
                    .csrf(AbstractHttpConfigurer::disable)
                    .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                    .authorizeHttpRequests(auth -> auth.anyRequest().authenticated())
                    .addFilterBefore(new HeaderAuthenticationFilter(GatewayAttestationMockMvcConfig.ATTESTATION),
                            UsernamePasswordAuthenticationFilter.class);
            return http.build();
        }
    }

    @TestConfiguration
    static class TestMeterConfig {

        @Bean
        MeterRegistry meterRegistry() {
            return new SimpleMeterRegistry();
        }
    }
}
