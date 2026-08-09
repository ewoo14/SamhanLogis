package com.samhanair.logis.inventory.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.not;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.inventory.attachment.domain.InspectionAttachment;
import com.samhanair.logis.common.ecount.EcountMig5ImportResult;
import com.samhanair.logis.inventory.attachment.service.InspectionAttachmentService;
import com.samhanair.logis.inventory.attachment.web.InspectionAttachmentController;
import com.samhanair.logis.inventory.domain.AuditStatus;
import com.samhanair.logis.inventory.domain.DpsProgramType;
import com.samhanair.logis.inventory.domain.DpsSaveMode;
import com.samhanair.logis.inventory.domain.StockInstance;
import com.samhanair.logis.inventory.domain.TransferReason;
import com.samhanair.logis.inventory.domain.TransferStatus;
import com.samhanair.logis.inventory.domain.WarehouseType;
import com.samhanair.logis.inventory.realtime.domain.InventoryEditRequest;
import com.samhanair.logis.inventory.realtime.service.InventoryAuditLogRecorder;
import com.samhanair.logis.inventory.realtime.service.InventoryEditRequestService;
import com.samhanair.logis.inventory.repository.StockBalanceRepository;
import com.samhanair.logis.inventory.repository.StockLotRepository;
import com.samhanair.logis.inventory.repository.StockMovementRepository;
import com.samhanair.logis.inventory.service.DpsByProductService;
import com.samhanair.logis.inventory.service.DpsCompareService;
import com.samhanair.logis.inventory.service.DpsSaveHistoryService;
import com.samhanair.logis.inventory.service.EcountStockTransferImporter;
import com.samhanair.logis.inventory.service.EcountWarehouseImporter;
import com.samhanair.logis.inventory.service.InboundInspectionService;
import com.samhanair.logis.inventory.service.InventoryAuditService;
import com.samhanair.logis.inventory.service.SafetyStockService;
import com.samhanair.logis.inventory.service.StockExcelExportService;
import com.samhanair.logis.inventory.service.StockInstanceService;
import com.samhanair.logis.inventory.service.StockService;
import com.samhanair.logis.inventory.service.StockTransferService;
import com.samhanair.logis.inventory.service.WarehouseService;
import com.samhanair.logis.inventory.web.DpsCompareController;
import com.samhanair.logis.inventory.web.DpsSaveHistoryController;
import com.samhanair.logis.inventory.web.EcountStockTransferImportController;
import com.samhanair.logis.inventory.web.EcountWarehouseImportController;
import com.samhanair.logis.inventory.web.InboundInspectionController;
import com.samhanair.logis.inventory.web.InventoryAuditController;
import com.samhanair.logis.inventory.web.InventoryPermissionGuard;
import com.samhanair.logis.inventory.web.SafetyStockController;
import com.samhanair.logis.inventory.web.StockController;
import com.samhanair.logis.inventory.web.StockInstanceController;
import com.samhanair.logis.inventory.web.StockTransferController;
import com.samhanair.logis.inventory.web.WarehouseController;
import com.samhanair.logis.inventory.web.dto.AdminWarehouseListResponse;
import com.samhanair.logis.inventory.web.dto.AuditDetailResponse;
import com.samhanair.logis.inventory.web.dto.AuditResponse;
import com.samhanair.logis.inventory.web.dto.DeductionResponse;
import com.samhanair.logis.inventory.web.dto.DpsByProductResponse;
import com.samhanair.logis.inventory.web.dto.DpsCompareResponse;
import com.samhanair.logis.inventory.web.dto.DpsSaveHistoryDetailResponse;
import com.samhanair.logis.inventory.web.dto.DpsSaveHistorySaveResponse;
import com.samhanair.logis.inventory.web.dto.EcountWarehouseImportResult;
import com.samhanair.logis.inventory.web.dto.ReservationResponse;
import com.samhanair.logis.inventory.web.dto.SafetyStockConfigResponse;
import com.samhanair.logis.inventory.web.dto.TransferDetailResponse;
import com.samhanair.logis.inventory.web.dto.TransferResponse;
import com.samhanair.logis.inventory.web.dto.WarehouseResponse;
import com.samhanair.logis.security.HrAuthorizationHelper;
import com.samhanair.logis.security.InternalSecurityAutoConfiguration;
import com.samhanair.logis.security.department.Department;
import com.samhanair.logis.security.department.RequireDepartment;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.PermissionGuardMetrics;
import com.samhanair.logis.security.permission.PermissionSecurityAutoConfiguration;
import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
import com.samhanair.logis.shared.realtime.editrequest.EditRequestType;
import com.samhanair.logis.shared.realtime.editrequest.EditTargetRole;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.lang.reflect.Method;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
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
import org.springframework.data.domain.PageImpl;
import org.springframework.data.jpa.mapping.JpaMetamodelMappingContext;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/** SP-D6-5 inventory-service @RequirePermission slice 테스트. */
@WebMvcTest(
        controllers = {
                StockController.class,
                StockTransferController.class,
                WarehouseController.class,
                DpsCompareController.class,
                DpsSaveHistoryController.class,
                InboundInspectionController.class,
                InventoryAuditController.class,
                SafetyStockController.class,
                StockInstanceController.class,
                InspectionAttachmentController.class,
                EcountWarehouseImportController.class,
                EcountStockTransferImportController.class
        },
        properties = {
                "spring.application.name=inventory-service",
                "samhan.security.department.enabled=true"
        })
@Import({
        PermissionSecurityAutoConfiguration.class,
        InternalSecurityAutoConfiguration.class,
        InventoryPermissionControllerIT.TestSecurityConfig.class,
        InventoryPermissionControllerIT.TestMeterConfig.class
})
class InventoryPermissionControllerIT {

    private static final String SERVICE_NAME = "inventory-service";
    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String USER_NAME_HEADER = "X-User-Name";
    // (사이클1 BE Nit-2) C5 이후 HeaderAuthenticationFilter 가 X-User-Role 을 무시하므로
    // 본 헤더는 인가에 무영향 — 테스트 케이스 라벨/거부 메트릭 role 태그 식별 용도로만 전송한다.
    private static final String ROLE_HEADER = "X-User-Role";
    private static final String DEPARTMENT_HEADER = "X-User-Department";
    private static final UUID ID = UUID.fromString("00000000-0000-0000-0000-000000000601");
    private static final UUID OTHER_ID = UUID.fromString("00000000-0000-0000-0000-000000000602");

    @Autowired private MockMvc mockMvc;
    @Autowired private MeterRegistry meterRegistry;
    @Autowired private ObjectMapper objectMapper;

    @MockBean private DynamicPermissionClient dynamicPermissionClient;
    @MockBean private StockService stockService;
    @MockBean private StockBalanceRepository stockBalanceRepository;
    @MockBean private StockLotRepository stockLotRepository;
    @MockBean private StockMovementRepository stockMovementRepository;
    @MockBean private StockExcelExportService stockExcelExportService;
    @MockBean private StockTransferService transferService;
    @MockBean private StockInstanceService stockInstanceService;
    @MockBean private WarehouseService warehouseService;
    @MockBean private RealtimeBroker realtimeBroker;
    @MockBean private InventoryPermissionGuard inventoryPermissionGuard;
    @MockBean private DpsCompareService dpsCompareService;
    @MockBean private DpsByProductService dpsByProductService;
    @MockBean private DpsSaveHistoryService dpsSaveHistoryService;
    @MockBean private InboundInspectionService inspectionService;
    @MockBean private InventoryAuditService auditService;
    @MockBean private InventoryAuditLogRecorder auditLogRecorder;
    @MockBean private InventoryEditRequestService editRequestService;
    @MockBean private SafetyStockService safetyStockService;
    @MockBean private InspectionAttachmentService attachmentService;
    @MockBean private EcountWarehouseImporter ecountWarehouseImporter;
    @MockBean private EcountStockTransferImporter ecountStockTransferImporter;
    @MockBean private JpaMetamodelMappingContext jpaMetamodelMappingContext;

    @BeforeEach
    void setUp() throws Exception {
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.check(any(UUID.class), anyString(), any(PermissionAction.class)))
                .thenReturn(true);

        lenient().when(stockBalanceRepository.findAllByProductIdAndIsDeletedFalse(any(), any()))
                .thenReturn(new PageImpl<>(List.of()));
        lenient().when(stockLotRepository.findAll(any(org.springframework.data.domain.Pageable.class)))
                .thenReturn(new PageImpl<>(List.of()));
        lenient().when(stockMovementRepository.findAll(any(org.springframework.data.domain.Pageable.class)))
                .thenReturn(new PageImpl<>(List.of()));
        lenient().when(stockService.findBalancesByProductIds(any())).thenReturn(List.of());
        lenient().when(stockService.findBalancePage(any(), any(), any()))
                .thenReturn(new PageImpl<>(List.of()));
        lenient().when(stockService.inbound(any(), anyString())).thenReturn(stockLot());
        lenient().when(stockService.reserve(any(), anyString())).thenReturn(reservation());
        lenient().when(stockService.release(any(), anyString())).thenReturn(reservation());
        lenient().when(stockService.deduct(any(), anyString())).thenReturn(deduction());
        lenient().when(stockService.adjust(any(), anyString())).thenReturn(deduction());
        lenient().when(stockExcelExportService.export(any())).thenReturn("xlsx".getBytes());

        lenient().when(transferService.list(any(), any())).thenReturn(new PageImpl<>(List.of(transferRow())));
        lenient().when(transferService.getOne(any())).thenReturn(transferDetail());
        lenient().when(transferService.create(any(), anyString())).thenReturn(transferDetail());
        lenient().when(transferService.approve(any(), anyString())).thenReturn(transferDetail());
        lenient().when(transferService.reject(any(), anyString(), anyString())).thenReturn(transferDetail());
        lenient().when(transferService.ship(any())).thenReturn(transferDetail());
        lenient().when(transferService.receive(any())).thenReturn(transferDetail());
        lenient().when(transferService.confirm(any(), anyString())).thenReturn(transferDetail());
        lenient().when(transferService.cancel(any(), anyString())).thenReturn(transferDetail());
        lenient().when(stockInstanceService.resellBatch(anyString(), anyString(), anyInt(), anyString()))
                .thenReturn(List.of(stockInstance()));

        lenient().when(warehouseService.listAll()).thenReturn(List.of(warehouse()));
        lenient().when(warehouseService.searchAdmin(any(), any())).thenReturn(new AdminWarehouseListResponse(List.of(), 0, 0, 20));
        lenient().when(warehouseService.getOne(any())).thenReturn(warehouse());
        lenient().when(warehouseService.create(any())).thenReturn(warehouse());
        lenient().when(warehouseService.update(any(), any(), any())).thenReturn(warehouse());
        lenient().when(warehouseService.revertToRevision(any(), any(Integer.class), any())).thenReturn(warehouse());
        lenient().when(warehouseService.listDeleted()).thenReturn(List.of());
        lenient().when(warehouseService.restore(any(), any())).thenReturn(warehouse());
        lenient().when(warehouseService.listAuditLogs(any())).thenReturn(List.of());

        lenient().when(dpsCompareService.compare(any(), any(), any(), any()))
                .thenReturn(new DpsCompareResponse(LocalDate.now(), LocalDate.now(), "SLIP", 0, 0, 0, 0, List.of()));
        lenient().when(dpsCompareService.generateTemplate()).thenReturn("xlsx".getBytes());
        lenient().when(dpsByProductService.analyze(any(), any(), any()))
                .thenReturn(DpsByProductResponse.of(List.of()));
        lenient().when(dpsSaveHistoryService.save(any(), anyString()))
                .thenReturn(new DpsSaveHistorySaveResponse(ID, LocalDateTime.of(2026, 5, 26, 9, 0)));
        lenient().when(dpsSaveHistoryService.list(any(), any(), any(), any(), anyString(), any()))
                .thenReturn(new PageImpl<>(List.of()));
        lenient().when(dpsSaveHistoryService.findDetail(any(), anyString())).thenReturn(historyDetail());
        lenient().when(dpsSaveHistoryService.findLatestAutoLatest(any(), anyString())).thenReturn(historyDetail());

        lenient().when(inspectionService.getOrCreateInspection(any())).thenReturn(null);
        lenient().when(inspectionService.saveInspectionResult(any(), any(), anyString())).thenReturn(null);
        lenient().when(inspectionService.listInspections(any(), any())).thenReturn(new PageImpl<>(List.of()));
        lenient().when(inspectionService.completeInspection(any(), anyString())).thenReturn(null);
        InspectionAttachment attachment = InspectionAttachment.register(
                ID, "2026/05/27-001", "photo.png", 1L, "image/png",
                "inspection/photo.png", null, null, null, "tester", "memo");
        attachment.refreshStorageUrl("https://example.invalid/inspection/photo.png");
        lenient().when(attachmentService.upload(any(), any(), any(), any(), any(), anyString(), any()))
                .thenReturn(attachment);
        lenient().when(attachmentService.listBySlipId(any())).thenReturn(List.of(attachment));
        lenient().when(attachmentService.download(any()))
                .thenReturn(new InspectionAttachmentService.DownloadView(
                        attachment, "https://example.invalid/inspection/fresh.png"));

        lenient().when(auditService.list(any(), any(), any(), any())).thenReturn(new PageImpl<>(List.of(auditRow())));
        lenient().when(auditService.getOne(any())).thenReturn(auditDetail());
        lenient().when(auditService.create(any(), anyString())).thenReturn(auditDetail());
        lenient().when(auditService.start(any())).thenReturn(auditDetail());
        lenient().when(auditService.recordLine(any(), any())).thenReturn(auditDetail());
        lenient().when(auditService.updateLine(any(), any(), any())).thenReturn(auditDetail());
        lenient().when(auditService.complete(any(), anyString())).thenReturn(auditDetail());
        lenient().when(auditService.cancel(any())).thenReturn(auditDetail());
        lenient().when(auditLogRecorder.listByEntity(any())).thenReturn(List.of());
        InventoryEditRequest editRequest = InventoryEditRequest.create(
                ID, ID, "tester", EditRequestType.EDIT, "reason",
                EditTargetRole.MANAGER, LocalDateTime.of(2026, 5, 27, 9, 0));
        lenient().when(editRequestService.request(any(), any(), any(), any(), anyString())).thenReturn(editRequest);
        lenient().when(editRequestService.approve(any(), any(), anyString(), any())).thenReturn(editRequest);
        lenient().when(editRequestService.reject(any(), any(), anyString(), any())).thenReturn(editRequest);
        lenient().when(editRequestService.listPendingForRole(any())).thenReturn(List.of(editRequest));

        lenient().when(realtimeBroker.subscribe(any())).thenReturn(new SseEmitter(100L));
        lenient().when(safetyStockService.findAlerts()).thenReturn(List.of());
        lenient().when(safetyStockService.setSafetyStock(any(), any()))
                .thenReturn(new SafetyStockConfigResponse(ID, ID, null, 10, "note"));
        lenient().when(ecountWarehouseImporter.importCsv(any(), anyString()))
                .thenReturn(new EcountWarehouseImportResult(1, 1, 0, 0, 0, "HASH", List.of()));
        lenient().when(ecountStockTransferImporter.importCsv(any(), anyString()))
                .thenReturn(new EcountMig5ImportResult(1, 1, 0, 0, 0, 0, 0, false,
                        "HASH", List.of(), List.of()));
    }

    @ParameterizedTest(name = "{0} grant")
    @MethodSource("endpoints")
    void migratedEndpoint_withGrant_isNotForbidden(EndpointCase endpoint) throws Exception {
        mockMvc.perform(withActor(endpoint.request().get(), endpoint.role()))
                .andExpect(status().is(not(403)));
    }

    @ParameterizedTest(name = "{0} inventory grant")
    @MethodSource("inventoryGrantEndpoints")
    void migratedEndpoint_inventoryRoleWithGrant_isAllowed(EndpointCase endpoint) throws Exception {
        when(dynamicPermissionClient.check(eq(ID), eq(endpoint.page()), eq(endpoint.action()))).thenReturn(true);

        mockMvc.perform(withActor(endpoint.request().get(), endpoint.role()))
                .andExpect(status().is(endpoint.expectedStatus()));

        verify(dynamicPermissionClient).check(eq(ID), eq(endpoint.page()), eq(endpoint.action()));
    }

    @ParameterizedTest(name = "{0} deny")
    @MethodSource("endpoints")
    void migratedEndpoint_withoutGrant_returns403AndIncrementsCounter(EndpointCase endpoint) throws Exception {
        when(dynamicPermissionClient.check(eq(ID), eq(endpoint.page()), eq(endpoint.action()))).thenReturn(false);
        double before = deniedCount(endpoint.page(), endpoint.role(), endpoint.action());

        mockMvc.perform(withActor(endpoint.request().get(), endpoint.role()))
                .andExpect(status().isForbidden());

        assertThat(deniedCount(endpoint.page(), endpoint.role(), endpoint.action())).isEqualTo(before + 1.0);
    }

    @ParameterizedTest(name = "{0} executive office + grant")
    @MethodSource("warehouseDepartmentEndpoints")
    void warehouseEndpoint_executiveOfficeWithGrant_isNotForbidden(EndpointCase endpoint) throws Exception {
        mockMvc.perform(withActor(endpoint.request().get(), endpoint.role(), HrAuthorizationHelper.EXECUTIVE_OFFICE_NAME))
                .andExpect(status().is(not(403)));
    }

    @ParameterizedTest(name = "{0} non-executive + grant")
    @MethodSource("warehouseDepartmentEndpoints")
    void warehouseEndpoint_nonExecutiveOfficeWithGrant_returns403BeforePermission(EndpointCase endpoint)
            throws Exception {
        when(dynamicPermissionClient.check(eq(ID), eq(endpoint.page()), eq(endpoint.action()))).thenReturn(true);
        double permissionBefore = deniedCount(endpoint.page(), endpoint.role(), endpoint.action());
        double departmentBefore = departmentDeniedCount(endpoint.role());

        mockMvc.perform(withActor(endpoint.request().get(), endpoint.role(), "물류팀"))
                .andExpect(status().isForbidden());

        assertThat(deniedCount(endpoint.page(), endpoint.role(), endpoint.action())).isEqualTo(permissionBefore);
        assertThat(departmentDeniedCount(endpoint.role())).isEqualTo(departmentBefore + 1.0);
        verify(dynamicPermissionClient, never()).check(eq(ID), eq(endpoint.page()), eq(endpoint.action()));
    }

    @ParameterizedTest(name = "{0} executive office + no grant")
    @MethodSource("warehouseDepartmentEndpoints")
    void warehouseEndpoint_executiveOfficeWithoutGrant_returns403(EndpointCase endpoint) throws Exception {
        when(dynamicPermissionClient.check(eq(ID), eq(endpoint.page()), eq(endpoint.action()))).thenReturn(false);
        double before = deniedCount(endpoint.page(), endpoint.role(), endpoint.action());

        mockMvc.perform(withActor(endpoint.request().get(), endpoint.role(), HrAuthorizationHelper.EXECUTIVE_OFFICE_NAME))
                .andExpect(status().isForbidden());

        assertThat(deniedCount(endpoint.page(), endpoint.role(), endpoint.action())).isEqualTo(before + 1.0);
    }

    @Test
    void warehouseDepartmentEndpointsUseRequireDepartmentAndNoPreAuthorize() throws Exception {
        assertDepartmentGate("create", com.samhanair.logis.inventory.web.dto.CreateWarehouseRequest.class, String.class);
        assertDepartmentGate(
                "update",
                UUID.class,
                com.samhanair.logis.inventory.web.dto.UpdateWarehouseRequest.class,
                String.class,
                String.class);
        assertDepartmentGate("revertAudit", UUID.class, int.class, String.class, String.class);
        assertDepartmentGate("delete", UUID.class, String.class, String.class);
        assertDepartmentGate("listDeleted");
        assertDepartmentGate("restore", UUID.class, String.class, String.class);
    }

    /**
     * C5 후속 검증:
     * InspectionAttachmentController.delete 는 @RequirePermission(DELETE) 단일 가드로 판정한다.
     * WAREHOUSE 라도 그룹 권한이 있으면 role authority 없이 삭제를 통과해야 한다.
     */
    @Test
    void attachmentDelete_warehouseWithDeletePermission_passesRequirePermissionOnly() throws Exception {
        // WAREHOUSE 에게 inventory.stock-balance DELETE 동적 권한 부여
        when(dynamicPermissionClient.check(eq(ID), eq("inventory.stock-balance"), eq(PermissionAction.DELETE)))
                .thenReturn(true);

        mockMvc.perform(delete("/inventory/inspections/{id}/attachments/{attachmentId}", ID, OTHER_ID)
                        .header(USER_ID_HEADER, ID.toString())
                        .header(ROLE_HEADER, "WAREHOUSE"))
                .andExpect(status().isOk());

        verify(dynamicPermissionClient).check(ID, "inventory.stock-balance", PermissionAction.DELETE);
        verify(attachmentService).delete(OTHER_ID, ID.toString());
    }

    static Stream<EndpointCase> endpoints() {
        return Stream.of(
                endpoint("stock balances", "inventory.stock-balance", PermissionAction.VIEW, "WAREHOUSE",
                        () -> get("/inventory/balances").param("productId", ID.toString())),
                endpoint("stock batch balances", "inventory.list", PermissionAction.VIEW, "SALES",
                        () -> post("/inventory/balances/batch").contentType(MediaType.APPLICATION_JSON)
                                .content("{\"productIds\":[\"" + ID + "\"]}")),
                endpoint("stock inbound", "inventory.stock-balance", PermissionAction.CREATE, "WAREHOUSE",
                        () -> post("/inventory/lots/inbound").contentType(MediaType.APPLICATION_JSON).content(inboundBody())),
                endpoint("stock reserve", "inventory.list", PermissionAction.UPDATE, "SALES",
                        () -> post("/inventory/reserve").contentType(MediaType.APPLICATION_JSON).content(quantityBody())),
                endpoint("stock adjust", "inventory.adjust", PermissionAction.UPDATE, "INVENTORY",
                        () -> post("/inventory/adjust").contentType(MediaType.APPLICATION_JSON).content(adjustBody())),
                endpoint("stock export", "inventory.stock-balance", PermissionAction.DOWNLOAD, "WAREHOUSE",
                        () -> get("/inventory/stocks/export.xlsx")),
                endpoint("transfer list", "inventory.transfer", PermissionAction.VIEW, "ACCOUNTANT",
                        () -> get("/inventory/transfers")),
                endpoint("transfer create", "inventory.transfer", PermissionAction.CREATE, "WAREHOUSE",
                        () -> post("/inventory/transfers").contentType(MediaType.APPLICATION_JSON).content(transferBody())),
                endpoint("transfer approve", "inventory.adjust", PermissionAction.UPDATE, "INVENTORY",
                        () -> post("/inventory/transfers/{id}/approve", ID)),
                endpoint("transfer ship", "inventory.transfer", PermissionAction.UPDATE, "WAREHOUSE",
                        () -> post("/inventory/transfers/{id}/ship", ID)),
                endpoint("warehouse list", "inventory.warehouse", PermissionAction.VIEW, "WAREHOUSE",
                        () -> get("/inventory/warehouses")),
                endpoint("warehouse create", "inventory.warehouse.admin", PermissionAction.CREATE, "MANAGER",
                        () -> post("/inventory/warehouses").contentType(MediaType.APPLICATION_JSON).content(warehouseBody())),
                endpoint("warehouse update", "inventory.warehouse.admin", PermissionAction.DELETE, "MANAGER",
                        () -> patch("/inventory/warehouses/{id}", ID)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(warehouseBody())),
                endpoint("warehouse delete", "inventory.warehouse.admin", PermissionAction.UPDATE, "MANAGER",
                        () -> delete("/inventory/warehouses/{id}", ID)),
                endpoint("warehouse deleted", "inventory.warehouse.admin", PermissionAction.VIEW, "MANAGER",
                        () -> get("/inventory/warehouses/deleted")),
                endpoint("warehouse restore", "inventory.warehouse.admin", PermissionAction.RESTORE, "MANAGER",
                        () -> post("/inventory/warehouses/{id}/restore", ID)),
                endpoint("warehouse revert audit", "inventory.warehouse.admin", PermissionAction.RESTORE, "MANAGER",
                        () -> post("/inventory/warehouses/{id}/audit/revert/{revisionNo}", ID, 1)),
                endpoint("dps compare", "inventory.dps", PermissionAction.VIEW, "WAREHOUSE",
                        () -> multipart("/warehouse/audit/dps-compare").file(csv("file"))
                                .param("from", "2026-05-26").param("to", "2026-05-27")),
                endpoint("dps template download", "inventory.dps", PermissionAction.DOWNLOAD, "WAREHOUSE",
                        () -> get("/warehouse/audit/dps-compare/template")),
                endpoint("dps history save", "inventory.dps", PermissionAction.CREATE, "WAREHOUSE",
                        () -> post("/warehouse/audit/dps-history").contentType(MediaType.APPLICATION_JSON).content(historyBody())),
                endpoint("dps history list", "inventory.dps", PermissionAction.VIEW, "WAREHOUSE",
                        () -> get("/warehouse/audit/dps-history")),
                endpoint("dps history detail", "inventory.dps", PermissionAction.VIEW, "WAREHOUSE",
                        () -> get("/warehouse/audit/dps-history/{id}", ID)),
                endpoint("dps history latest", "inventory.dps", PermissionAction.VIEW, "WAREHOUSE",
                        () -> get("/warehouse/audit/dps-history/latest").param("programType", "DPS_COMPARE")),
                endpoint("dps by product", "inventory.dps", PermissionAction.VIEW, "WAREHOUSE",
                        () -> get("/warehouse/audit/dps-compare/by-product")
                                .param("fromDate", "2026-05-01").param("toDate", "2026-05-31")),
                endpoint("inbound inspection list", "inventory.stock-balance", PermissionAction.VIEW, "WAREHOUSE",
                        () -> get("/inventory/inbound-inspections")),
                endpoint("inbound inspection save result", "inventory.stock-balance", PermissionAction.UPDATE, "WAREHOUSE",
                        () -> post("/inventory/inbound-inspections/{id}/inspect", ID)
                                .contentType(MediaType.APPLICATION_JSON).content(inspectBody())),
                endpoint("inbound inspection get", "inventory.stock-balance", PermissionAction.VIEW, "WAREHOUSE",
                        () -> get("/inventory/inbound-inspections/{id}", ID)),
                endpoint("inbound inspection complete", "inventory.stock-balance", PermissionAction.UPDATE, "WAREHOUSE",
                        () -> post("/inventory/inbound-inspections/{id}/complete", ID)),
                endpoint("attachment upload", "inventory.stock-balance", PermissionAction.CREATE, "WAREHOUSE",
                        () -> multipart("/inventory/inspections/{id}/attachments", ID).file(image("file"))),
                endpoint("attachment list", "inventory.stock-balance.view", PermissionAction.VIEW, "STAFF",
                        () -> get("/inventory/inspections/{id}/attachments", ID)),
                endpoint("attachment detail", "inventory.stock-balance.view", PermissionAction.VIEW, "STAFF",
                        () -> get("/inventory/inspections/{id}/attachments/{attachmentId}", ID, OTHER_ID)),
                endpoint("attachment delete", "inventory.stock-balance", PermissionAction.DELETE, "MANAGER",
                        () -> delete("/inventory/inspections/{id}/attachments/{attachmentId}", ID, OTHER_ID)),
                endpoint("audit list", "inventory.detail", PermissionAction.VIEW, "ACCOUNTANT",
                        () -> get("/inventory/audits")),
                endpoint("audit create", "inventory.adjust", PermissionAction.CREATE, "INVENTORY",
                        () -> post("/inventory/audits").contentType(MediaType.APPLICATION_JSON).content(auditBody())),
                endpoint("audit line", "inventory.stock-balance", PermissionAction.CREATE, "WAREHOUSE",
                        () -> post("/inventory/audits/{id}/lines", ID).contentType(MediaType.APPLICATION_JSON).content(auditLineBody())),
                endpoint("audit edit request create", "inventory.edit-requests", PermissionAction.CREATE, "ACCOUNTANT",
                        () -> post("/inventory/audits/{id}/edit-requests", ID)
                                .contentType(MediaType.APPLICATION_JSON).content("{\"requestType\":\"EDIT\",\"reason\":\"reason\"}")),
                endpoint("audit edit request pending", "inventory.edit-requests.decide", PermissionAction.VIEW, "ACCOUNTANT",
                        () -> get("/inventory/audits/edit-requests/pending")),
                endpoint("audit edit request approve", "inventory.edit-requests.decide", PermissionAction.UPDATE, "MANAGER",
                        () -> post("/inventory/audits/edit-requests/{requestId}/approve", ID)
                                .contentType(MediaType.APPLICATION_JSON).content("{\"note\":\"ok\"}")),
                endpoint("safety alerts", "inventory.safety-stock", PermissionAction.VIEW, "WAREHOUSE",
                        () -> get("/inventory/alerts/safety-stock")),
                endpoint("safety set", "inventory.safety-stock", PermissionAction.UPDATE, "WAREHOUSE",
                        () -> post("/inventory/products/{id}/safety-stock", ID)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"threshold\":10,\"note\":\"note\",\"scopeMode\":\"ALL\"}")),
                endpoint("stock instance resell", "inventory.stock-balance", PermissionAction.UPDATE, "WAREHOUSE",
                        () -> post("/inventory/instances/resell-batch").contentType(MediaType.APPLICATION_JSON)
                                .content(resellBody())),
                endpoint("ecount warehouse import", "ecount.import.inventory", PermissionAction.CREATE, "MANAGER",
                        () -> multipart("/admin/warehouses/imports/ecount").file(csv("file"))),
                endpoint("ecount transfer import", "ecount.import.inventory", PermissionAction.CREATE, "MANAGER",
                        () -> multipart("/admin/inventory/stock-transfers/imports/ecount").file(csv("file")))
        );
    }

    static Stream<EndpointCase> inventoryGrantEndpoints() {
        return Stream.of(
                endpoint("dps history save", "inventory.dps", PermissionAction.CREATE, "INVENTORY",
                        () -> post("/warehouse/audit/dps-history").contentType(MediaType.APPLICATION_JSON).content(historyBody())),
                endpoint("dps history list", "inventory.dps", PermissionAction.VIEW, "INVENTORY",
                        () -> get("/warehouse/audit/dps-history")),
                endpoint("dps history detail", "inventory.dps", PermissionAction.VIEW, "INVENTORY",
                        () -> get("/warehouse/audit/dps-history/{id}", ID)),
                endpoint("dps history latest", "inventory.dps", PermissionAction.VIEW, "INVENTORY",
                        () -> get("/warehouse/audit/dps-history/latest").param("programType", "DPS_COMPARE")),
                endpoint("dps template download", "inventory.dps", PermissionAction.DOWNLOAD, "INVENTORY",
                        () -> get("/warehouse/audit/dps-compare/template")),
                endpoint("dps by product", "inventory.dps", PermissionAction.VIEW, "INVENTORY",
                        () -> get("/warehouse/audit/dps-compare/by-product")
                                .param("fromDate", "2026-05-01").param("toDate", "2026-05-31")),
                endpoint("inbound inspection get", "inventory.stock-balance", PermissionAction.VIEW, "INVENTORY",
                        () -> get("/inventory/inbound-inspections/{id}", ID)),
                endpoint("inbound inspection save result", "inventory.stock-balance", PermissionAction.UPDATE, "INVENTORY",
                        () -> post("/inventory/inbound-inspections/{id}/inspect", ID)
                                .contentType(MediaType.APPLICATION_JSON).content(inspectBody())),
                endpoint("inbound inspection list", "inventory.stock-balance", PermissionAction.VIEW, "INVENTORY",
                        () -> get("/inventory/inbound-inspections")),
                endpoint("inbound inspection complete", "inventory.stock-balance", PermissionAction.UPDATE, "INVENTORY",
                        () -> post("/inventory/inbound-inspections/{id}/complete", ID)),
                endpoint("attachment upload", "inventory.stock-balance", PermissionAction.CREATE, "INVENTORY",
                        () -> multipart("/inventory/inspections/{id}/attachments", ID).file(image("file")),
                        HttpStatus.CREATED.value())
        );
    }

    static Stream<EndpointCase> warehouseDepartmentEndpoints() {
        return endpoints().filter(endpoint ->
                "warehouse create".equals(endpoint.name())
                        || "warehouse update".equals(endpoint.name())
                        || "warehouse delete".equals(endpoint.name())
                        || "warehouse deleted".equals(endpoint.name())
                        || "warehouse restore".equals(endpoint.name())
                        || "warehouse revert audit".equals(endpoint.name()));
    }

    private static EndpointCase endpoint(
            String name, String page, PermissionAction action, String role,
            Supplier<MockHttpServletRequestBuilder> request) {
        return endpoint(name, page, action, role, request, HttpStatus.OK.value());
    }

    private static EndpointCase endpoint(
            String name, String page, PermissionAction action, String role,
            Supplier<MockHttpServletRequestBuilder> request, int expectedStatus) {
        return new EndpointCase(name, page, action, role, request, expectedStatus);
    }

    private static String inboundBody() {
        return "{\"productId\":\"" + ID + "\",\"warehouseId\":\"" + OTHER_ID
                + "\",\"quantity\":1,\"unitCost\":1000,\"sourceContext\":{\"sourceOperationId\":\""
                + ID + "\",\"slipId\":\"" + OTHER_ID + "\",\"slipRevision\":1}}";
    }

    private static String quantityBody() {
        return "{\"productId\":\"" + ID + "\",\"warehouseId\":\"" + OTHER_ID
                + "\",\"quantity\":1,\"sourceContext\":{\"sourceOperationId\":\""
                + ID + "\",\"slipId\":\"" + OTHER_ID + "\",\"slipRevision\":1}}";
    }

    private static String adjustBody() {
        return "{\"productId\":\"" + ID + "\",\"warehouseId\":\"" + OTHER_ID
                + "\",\"quantityDelta\":1,\"reason\":\"실사 조정\"}";
    }

    private static String transferBody() {
        return "{\"sourceWarehouseId\":\"" + ID + "\",\"destinationWarehouseId\":\"" + OTHER_ID
                + "\",\"reason\":\"REBALANCE\",\"lines\":[{\"productId\":\"" + ID + "\",\"requestedQuantity\":1}]}";
    }

    private static String warehouseBody() {
        return "{\"code\":\"WH-001\",\"name\":\"테스트창고\",\"type\":\"VEHICLE\",\"displayOrder\":1}";
    }

    private static String auditBody() {
        return "{\"warehouseId\":\"" + ID + "\",\"auditDate\":\"2026-05-26\"}";
    }

    private static String auditLineBody() {
        return "{\"productId\":\"" + ID + "\",\"actualQty\":1,\"scanned\":false}";
    }

    private static String historyBody() {
        return "{\"programType\":\"DPS_COMPARE\",\"saveMode\":\"MANUAL_NAMED\",\"topic\":\"저장\",\"requestParams\":{},\"responsePayload\":{}}";
    }

    private static String resellBody() {
        return "{\"recallSlipNo\":\"S4-RETURN-PERM\",\"productCode\":\"AC-PERM\",\"quantity\":1}";
    }

    private static String inspectBody() {
        return "{\"lines\":[{\"lineId\":\"" + ID + "\",\"inspectedQty\":1,\"defectQty\":0}]}";
    }

    private static MockMultipartFile csv(String name) {
        return new MockMultipartFile(name, "sample.csv", "text/csv", "x".getBytes());
    }

    private static MockMultipartFile image(String name) {
        return new MockMultipartFile(name, "photo.png", "image/png", "x".getBytes());
    }

    private static MockHttpServletRequestBuilder withActor(MockHttpServletRequestBuilder request, String role) {
        return withActor(request, role, HrAuthorizationHelper.EXECUTIVE_OFFICE_NAME);
    }

    private static MockHttpServletRequestBuilder withActor(
            MockHttpServletRequestBuilder request,
            String role,
            String department) {
        return request
                .header(USER_ID_HEADER, ID.toString())
                .header(USER_NAME_HEADER, "테스터")
                .header(ROLE_HEADER, role)
                .header(DEPARTMENT_HEADER, department);
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

    private double departmentDeniedCount(String role) {
        return meterRegistry.counter(
                PermissionGuardMetrics.COUNTER_NAME,
                "service", SERVICE_NAME,
                "page", "department",
                "role", role,
                "action", Department.EXECUTIVE_OFFICE.name()
        ).count();
    }

    private void assertDepartmentGate(String name, Class<?>... parameterTypes) throws Exception {
        Method method = WarehouseController.class.getMethod(name, parameterTypes);
        RequireDepartment requireDepartment = method.getAnnotation(RequireDepartment.class);
        assertThat(requireDepartment).isNotNull();
        assertThat(requireDepartment.value()).isEqualTo(Department.EXECUTIVE_OFFICE);
        assertThat(method.getAnnotation(PreAuthorize.class)).isNull();
    }

    private TransferResponse transferRow() {
        return new TransferResponse(ID, "TR-001", ID, "WH-A", OTHER_ID, "WH-B",
                TransferReason.REBALANCE, TransferStatus.REQUESTED, "tester", null,
                LocalDateTime.now(), null, null, null, null);
    }

    private TransferDetailResponse transferDetail() {
        return new TransferDetailResponse(ID, "TR-001", ID, "WH-A", OTHER_ID, "WH-B",
                TransferReason.REBALANCE, "reason", TransferStatus.REQUESTED, "tester", null,
                LocalDateTime.now(), null, null, null, null, List.of());
    }

    private WarehouseResponse warehouse() {
        return new WarehouseResponse(ID, "WH-001", "테스트창고", WarehouseType.VEHICLE,
                "서울", 1, "memo", LocalDateTime.now(), "system", LocalDateTime.now(), "system");
    }

    private com.samhanair.logis.inventory.web.dto.StockLotResponse stockLot() {
        return new com.samhanair.logis.inventory.web.dto.StockLotResponse(
                ID, ID, OTHER_ID, "WH-001", "LOT-001", 1, 1,
                LocalDateTime.now(), java.math.BigDecimal.ONE,
                com.samhanair.logis.inventory.domain.StockLotStatus.AVAILABLE,
                null, LocalDateTime.now(), "tester");
    }

    private ReservationResponse reservation() {
        return new ReservationResponse(ID, OTHER_ID, 1, 9, 1, "tester");
    }

    private DeductionResponse deduction() {
        return new DeductionResponse(ID, OTHER_ID, 1, 1, 9, 0, 9, List.of());
    }

    private StockInstance stockInstance() {
        return StockInstance.inbound(ID, "AC-PERM", OTHER_ID, "구매",
                LocalDateTime.of(2026, 6, 3, 9, 0), java.math.BigDecimal.ONE, "S2-IN-PERM");
    }

    private AuditResponse auditRow() {
        return new AuditResponse(ID, "AUD-001", OTHER_ID, "WH-001", "테스트창고",
                LocalDate.of(2026, 5, 26), AuditStatus.PLANNED,
                java.math.BigDecimal.ZERO, null, null, null);
    }

    private AuditDetailResponse auditDetail() {
        return new AuditDetailResponse(ID, "AUD-001", OTHER_ID, "WH-001", "테스트창고",
                LocalDate.of(2026, 5, 26), AuditStatus.PLANNED,
                java.math.BigDecimal.ZERO, null, null, null, List.of());
    }

    private DpsSaveHistoryDetailResponse historyDetail() {
        return new DpsSaveHistoryDetailResponse(
                ID, DpsProgramType.DPS_COMPARE, DpsSaveMode.MANUAL_NAMED,
                "저장", LocalDateTime.of(2026, 5, 26, 9, 0), "tester",
                objectMapper.createObjectNode(), objectMapper.createObjectNode());
    }

    record EndpointCase(
            String name,
            String page,
            PermissionAction action,
            String role,
            Supplier<MockHttpServletRequestBuilder> request,
            int expectedStatus) {

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
                    .addFilterBefore(new com.samhanair.logis.inventory.config.HeaderAuthenticationFilter(),
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
