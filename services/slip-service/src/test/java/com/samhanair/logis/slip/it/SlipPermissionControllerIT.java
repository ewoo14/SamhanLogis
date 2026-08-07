package com.samhanair.logis.slip.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.not;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.PermissionGuardMetrics;
import com.samhanair.logis.security.permission.PermissionSecurityAutoConfiguration;
import com.samhanair.logis.slip.attachment.domain.SlipAttachment;
import com.samhanair.logis.slip.attachment.domain.SlipAttachmentType;
import com.samhanair.logis.slip.attachment.service.SlipAttachmentService;
import com.samhanair.logis.slip.attachment.web.DeliveryAttachmentController;
import com.samhanair.logis.slip.attachment.web.SlipAttachmentController;
import com.samhanair.logis.slip.attachment.web.SlipPhotoAuditAdminController;
import com.samhanair.logis.slip.audit.service.SlipAuditLogService;
import com.samhanair.logis.slip.audit.web.SlipAuditLogController;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.comment.service.SlipCommentService;
import com.samhanair.logis.slip.comment.web.SlipCommentController;
import com.samhanair.logis.slip.delivery.service.DeliveryBatchService;
import com.samhanair.logis.slip.delivery.web.DeliveryBatchController;
import com.samhanair.logis.slip.editrequest.service.SlipEditRequestService;
import com.samhanair.logis.slip.editrequest.web.SlipEditRequestController;
import com.samhanair.logis.slip.estimate.service.EstimateService;
import com.samhanair.logis.slip.estimate.web.EstimateController;
import com.samhanair.logis.slip.estimate.web.EstimatePermissionGuard;
import com.samhanair.logis.slip.price.service.PartnerProductPriceMemoryService;
import com.samhanair.logis.slip.publish.PublishSlipResponse;
import com.samhanair.logis.slip.publish.SlipPublishService;
import com.samhanair.logis.slip.realtime.SlipRealtimeBroker;
import com.samhanair.logis.slip.realtime.SlipListRealtimeController;
import com.samhanair.logis.slip.realtime.SlipRealtimeController;
import com.samhanair.logis.slip.revision.service.SlipRedlineService;
import com.samhanair.logis.slip.revision.web.SlipRedlineController;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.service.NextDaySlipImageService;
import com.samhanair.logis.slip.service.SlipCleanupService;
import com.samhanair.logis.slip.service.SlipCleanupSaveHistoryService;
import com.samhanair.logis.slip.service.SlipDuplicateService;
import com.samhanair.logis.slip.service.SlipExcelExportService;
import com.samhanair.logis.slip.service.SlipService;
import com.samhanair.logis.slip.service.SlipSignatureService;
import com.samhanair.logis.slip.service.SlipRestoreService;
import com.samhanair.logis.slip.web.SlipAllocationSourceController;
import com.samhanair.logis.slip.web.SlipController;
import com.samhanair.logis.slip.web.dto.SlipDetailResponse;
import com.samhanair.logis.slip.web.SlipCleanupSaveHistoryController;
import com.samhanair.logis.slip.web.SlipLookupController;
import com.samhanair.logis.slip.web.SlipPublishController;
import com.samhanair.logis.slip.web.SlipSignatureController;
import com.samhanair.logis.slip.web.SlipRestoreController;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.math.BigDecimal;
import java.time.LocalDate;
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
import org.springframework.data.domain.Page;
import org.springframework.data.jpa.mapping.JpaMetamodelMappingContext;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/** SP-D6-6 slip-service @RequirePermission slice 테스트. */
@WebMvcTest(
        controllers = {
                SlipController.class,
                SlipAllocationSourceController.class,
                SlipLookupController.class,
                SlipSignatureController.class,
                SlipPhotoAuditAdminController.class,
                SlipEditRequestController.class,
                DeliveryBatchController.class,
                SlipCommentController.class,
                SlipAuditLogController.class,
                SlipAttachmentController.class,
                DeliveryAttachmentController.class,
                SlipPublishController.class,
                SlipRealtimeController.class,
                SlipListRealtimeController.class,
                SlipCleanupSaveHistoryController.class,
                SlipRedlineController.class,
                EstimateController.class,
                SlipRestoreController.class
        },
        properties = "spring.application.name=slip-service")
@Import({
        PermissionSecurityAutoConfiguration.class,
        SlipRealtimeBroker.SlipRealtimeBrokerConfig.class,
        SlipPermissionControllerIT.TestSecurityConfig.class,
        SlipPermissionControllerIT.TestMeterConfig.class
})
class SlipPermissionControllerIT {

    private static final String SERVICE_NAME = "slip-service";
    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String USER_NAME_HEADER = "X-User-Name";
    private static final String ROLE_HEADER = "X-User-Role";
    private static final UUID ID = UUID.fromString("00000000-0000-0000-0000-000000000661");

    @Autowired private MockMvc mockMvc;
    @Autowired private MeterRegistry meterRegistry;

    @MockBean private DynamicPermissionClient dynamicPermissionClient;
    @MockBean private SlipService slipService;
    @MockBean private SlipDuplicateService slipDuplicateService;
    @MockBean private NextDaySlipImageService nextDaySlipImageService;
    @MockBean private SlipCleanupService slipCleanupService;
    @MockBean private SlipCleanupSaveHistoryService slipCleanupSaveHistoryService;
    @MockBean private SlipExcelExportService slipExcelExportService;
    @MockBean private PartnerProductPriceMemoryService priceMemoryService;
    @MockBean private ProductClient productClient;
    @MockBean private SlipSignatureService signatureService;
    @MockBean private SlipAttachmentService attachmentService;
    @MockBean private SlipCommentService commentService;
    @MockBean private SlipAuditLogService auditLogService;
    @MockBean private SlipEditRequestService editRequestService;
    @MockBean private DeliveryBatchService batchService;
    @MockBean private SlipRepository slipRepository;
    @MockBean private SlipPublishService slipPublishService;
    @MockBean private SlipRedlineService slipRedlineService;
    @MockBean private EstimateService estimateService;
    @MockBean private EstimatePermissionGuard estimatePermissionGuard;
    @MockBean private SlipRestoreService slipRestoreService;
    @MockBean private JpaMetamodelMappingContext jpaMetamodelMappingContext;

    @Test
    void outboundPostInspection_systemMaster_bypassesDynamicPermission() throws Exception {
        SlipDetailResponse current = org.mockito.Mockito.mock(SlipDetailResponse.class);
        when(current.slipType()).thenReturn(com.samhanair.logis.slip.domain.SlipType.OUTBOUND);
        when(current.status()).thenReturn(com.samhanair.logis.slip.domain.SlipStatus.COMPLETED);
        when(slipService.getOne(ID)).thenReturn(current);
        when(slipService.ship(ID)).thenReturn(current);
        when(dynamicPermissionClient.check(eq(ID), eq("slip.transfer.process"), eq(PermissionAction.UPDATE)))
                .thenReturn(false);

        mockMvc.perform(withActor(post("/slips/{id}/ship", ID), "STAFF")
                        .header("X-Is-System-Master", "true"))
                .andExpect(status().isOk());
    }

    @BeforeEach
    void setUp() {
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.check(any(UUID.class), anyString(), any(PermissionAction.class)))
                .thenReturn(true);
        lenient().when(productClient.lookupByModel(anyString()))
                .thenReturn(new ProductSummary(ID, "테스트 제품", "MOD-001", ID, BigDecimal.ONE, "ACTIVE"));
        lenient().when(batchService.list(any(), any())).thenReturn(List.of());
        lenient().when(batchService.autoGroupByDate(any())).thenReturn(List.of());
        lenient().when(attachmentService.listPhotoAudit(any(), any(), any(), any(), any()))
                .thenReturn(Page.empty());
        SlipAttachment attachment = SlipAttachment.register(
                ID, SlipAttachmentType.DELIVERY, "photo.png", 1L, "image/png",
                "slip/photo.png", null, null, null, "tester");
        attachment.refreshStorageUrl("https://example.invalid/slip/photo.png");
        lenient().when(attachmentService.list(any())).thenReturn(List.of(attachment));
        lenient().when(attachmentService.listByType(any(), any())).thenReturn(List.of(attachment));
        lenient().when(attachmentService.download(any()))
                .thenReturn(new SlipAttachmentService.DownloadView(
                        attachment, "https://example.invalid/slip/fresh.png"));
        lenient().when(commentService.listRecent(any(), anyInt())).thenReturn(List.of());
        lenient().when(auditLogService.listBySlip(any())).thenReturn(List.of());
        lenient().when(editRequestService.listPendingForRole(any())).thenReturn(List.of());
        lenient().when(editRequestService.listBySlip(any(), any())).thenReturn(List.of());
        lenient().when(slipPublishService.findBySource(any(), anyString()))
                .thenReturn(List.of(new PublishSlipResponse(
                        ID, "2026/05/27-001",
                        com.samhanair.logis.slip.domain.SlipStatus.DRAFT,
                        com.samhanair.logis.slip.domain.SlipSourceType.ESTIMATE,
                        "EST-001", null, false)));
        lenient().when(estimateService.list(any(), any(), any(), any(), anyBoolean(), any()))
                .thenReturn(new PageImpl<>(List.of()));
        lenient().when(estimateService.getOne(any(UUID.class))).thenReturn(null);
        lenient().when(slipExcelExportService.export(any(), any(), any(), any(), any()))
                .thenReturn("xlsx".getBytes());
    }

    @Test
    void allocationSource_realPath_withAccountingPermission_returnsApiResponse() throws Exception {
        when(slipRepository.findByPeriodWithLines(
                eq(com.samhanair.logis.slip.domain.SlipType.OUTBOUND),
                any(LocalDate.class), any(LocalDate.class), isNull(UUID.class)))
                .thenReturn(List.of());

        mockMvc.perform(withActor(get("/slips/by-period")
                        .param("type", "OUTBOUND")
                        .param("from", "2026-08-03")
                        .param("to", "2026-08-03"), "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers
                        .jsonPath("$.success").value(true))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers
                        .jsonPath("$.data").isArray());
    }

    @Test
    void allocationSource_purchasePath_usesPurchaseListPermission() throws Exception {
        when(slipRepository.findByPeriodWithLines(
                eq(com.samhanair.logis.slip.domain.SlipType.INBOUND),
                any(LocalDate.class), any(LocalDate.class), isNull(UUID.class)))
                .thenReturn(List.of());

        mockMvc.perform(withActor(get("/slips/by-period")
                        .param("type", "INBOUND")
                        .param("from", "2026-08-03")
                        .param("to", "2026-08-03"), "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers
                        .jsonPath("$.success").value(true))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers
                        .jsonPath("$.data").isArray());
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
        when(dynamicPermissionClient.check(eq(ID), eq(endpoint.page()), eq(endpoint.action()))).thenReturn(false);
        if (endpoint.secondaryPermission() != null) {
            when(dynamicPermissionClient.check(
                    eq(ID), eq(endpoint.secondaryPermission().page()), eq(endpoint.secondaryPermission().action())))
                    .thenReturn(false);
        }
        if (endpoint.name().startsWith("price memory")) {
            when(dynamicPermissionClient.check(eq(ID), eq("estimates.list"), eq(PermissionAction.CREATE)))
                    .thenReturn(false);
            when(dynamicPermissionClient.check(eq(ID), eq("estimates.list"), eq(PermissionAction.UPDATE)))
                    .thenReturn(false);
        }
        double before = deniedCount(endpoint.page(), endpoint.role(), endpoint.action());

        mockMvc.perform(withActor(endpoint.request().get(), endpoint.role()))
                .andExpect(status().isForbidden());

        assertThat(deniedCount(endpoint.page(), endpoint.role(), endpoint.action())).isEqualTo(before + 1.0);
    }

    static Stream<EndpointCase> endpoints() {
        return Stream.of(
                endpoint("lookup product", "slip.lookup-product", PermissionAction.VIEW, "SALES",
                        () -> get("/slips/lookup-product").param("modelName", "MOD-001")),
                endpoint("delivery batch list", "slip.delivery-batch", PermissionAction.VIEW, "MANAGER",
                        () -> get("/delivery-batches").param("date", "2026-05-27")),
                endpoint("delivery batch auto group", "slip.delivery-batch", PermissionAction.CREATE, "MANAGER",
                        () -> post("/delivery-batches/auto-group").param("date", "2026-05-27")),
                endpoint("photo audit", "slip.photo-audit", PermissionAction.VIEW, "WAREHOUSE",
                        () -> get("/slips/admin/photo-audit")),
                endpoint("signature view", "slip.signature", PermissionAction.VIEW, "MANAGER",
                        () -> get("/slips/{id}/signature", ID)),
                endpoint("signature invalidate", "slip.signature", PermissionAction.DELETE, "MANAGER",
                        () -> delete("/slips/{id}/signature", ID)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"reason\":\"재서명\"}")),
                endpoint("edit request pending", "slip.edit-requests.decide", PermissionAction.VIEW, "MANAGER",
                        () -> get("/slips/edit-requests").param("targetRole", "MANAGER")),
                endpoint("edit request by slip", "slip.edit-requests", PermissionAction.VIEW, "STAFF",
                        () -> get("/slips/{id}/edit-requests", ID)),
                endpoint("comment list", "slip.comments", PermissionAction.VIEW, "STAFF",
                        () -> get("/slips/{id}/comments", ID)),
                endpoint("audit logs", "slip.audit-overlay", PermissionAction.VIEW, "STAFF",
                        () -> get("/slips/{id}/audit-logs", ID)),
                endpoint("redline", "slip.audit-overlay", PermissionAction.VIEW, "SALES",
                        () -> get("/slips/{id}/redline", ID)),
                endpoint("attachment list", "slip.attachments.upload", PermissionAction.VIEW, "STAFF",
                        () -> get("/slips/{id}/attachments", ID)),
                endpoint("attachment detail", "slip.attachments.upload", PermissionAction.VIEW, "STAFF",
                        () -> get("/slips/{id}/attachments/{attachmentId}", ID, ID)),
                endpoint("delivery attachment list", "slip.delivery-attachments.upload", PermissionAction.VIEW, "STAFF",
                        () -> get("/slips/{id}/delivery-attachments", ID)),
                endpoint("publish by source", "slip.publish.from-estimate", PermissionAction.VIEW, "STAFF",
                        () -> get("/api/v1/slips/by-source")
                                .param("sourceType", "ESTIMATE")
                                .param("sourceId", "EST-001")),
                endpoint("slip realtime", "slip.comments", PermissionAction.VIEW, "STAFF",
                        () -> get("/slips/{id}/realtime", ID)),
                endpoint("slip list realtime", "sales.slip.list", PermissionAction.VIEW, "SALES",
                        () -> get("/slips/list-realtime")),
                endpoint("slip list restore", "sales.slip.list", PermissionAction.RESTORE, "SALES",
                        () -> post("/slips/{id}/restore", ID)),
                programmaticEndpoint("price memory", "sales.slip.create", PermissionAction.CREATE,
                        new PermissionKey("purchases.slip.edit", PermissionAction.UPDATE), "SALES",
                        () -> get("/slips/price-memory")
                                .param("partnerId", ID.toString())
                                .param("productId", ID.toString())),
                programmaticEndpoint("price memory bulk", "sales.slip.create", PermissionAction.CREATE,
                        new PermissionKey("purchases.slip.edit", PermissionAction.UPDATE), "SALES",
                        () -> post("/slips/price-memory/bulk")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"partnerId\":\"" + ID + "\",\"productIds\":[\"" + ID + "\"]}")),
                endpoint("next day print data", "slip.print.next-day", PermissionAction.PRINT, "SALES",
                        () -> get("/slips/next-day-image-data")),
                endpoint("cleanup report", "slip.cleanup", PermissionAction.VIEW, "SALES",
                        () -> get("/slips/cleanup").param("from", "2026-05-01").param("to", "2026-05-27")),
                endpoint("cleanup history save", "slip.cleanup-history", PermissionAction.CREATE, "SALES",
                        () -> post("/slips/cleanup/history")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"programType\":\"SLIP_CLEANUP\",\"saveMode\":\"MANUAL_NAMED\",\"topic\":\"저장\",\"requestParams\":{},\"responsePayload\":{}}")),
                endpoint("cleanup history list", "slip.cleanup-history", PermissionAction.VIEW, "SALES",
                        () -> get("/slips/cleanup/history")),
                endpoint("cleanup history detail", "slip.cleanup-history", PermissionAction.VIEW, "SALES",
                        () -> get("/slips/cleanup/history/{id}", ID)),
                endpoint("export xlsx", "slip.print.export", PermissionAction.DOWNLOAD, "MANAGER",
                        () -> get("/slips/export.xlsx")),
                endpoint("allocation source outbound", "accounting.sales-slip.list", PermissionAction.VIEW,
                        "ACCOUNTANT", () -> get("/slips/by-period")
                                .param("type", "OUTBOUND")
                                .param("from", "2026-08-03")
                                .param("to", "2026-08-03")),
                endpoint("allocation source inbound", "accounting.purchase-slip.list", PermissionAction.VIEW,
                        "ACCOUNTANT", () -> get("/slips/by-period")
                                .param("type", "INBOUND")
                                .param("from", "2026-08-03")
                                .param("to", "2026-08-03"))
        );
    }

    private static EndpointCase endpoint(
            String name, String page, PermissionAction action, String role,
            Supplier<MockHttpServletRequestBuilder> request) {
        return new EndpointCase(name, page, action, null, role, request);
    }

    private static EndpointCase programmaticEndpoint(
            String name, String page, PermissionAction action, PermissionKey secondaryPermission, String role,
            Supplier<MockHttpServletRequestBuilder> request) {
        return new EndpointCase(name, page, action, secondaryPermission, role, request);
    }

    private static MockHttpServletRequestBuilder withActor(MockHttpServletRequestBuilder request, String role) {
        return request
                .header(USER_ID_HEADER, ID.toString())
                .header(USER_NAME_HEADER, "테스터")
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
            PermissionKey secondaryPermission,
            String role,
            Supplier<MockHttpServletRequestBuilder> request) {

        @Override
        public String toString() {
            return name;
        }
    }

    record PermissionKey(String page, PermissionAction action) {
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
                    .addFilterBefore(new com.samhanair.logis.slip.config.HeaderAuthenticationFilter(),
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
