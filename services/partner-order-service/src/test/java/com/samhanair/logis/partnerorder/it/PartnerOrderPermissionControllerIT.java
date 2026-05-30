package com.samhanair.logis.partnerorder.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
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
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.partnerorder.client.PartnerAuthClient;
import com.samhanair.logis.partnerorder.config.HeaderAuthenticationFilter;
import com.samhanair.logis.partnerorder.audit.service.PartnerOrderAuditLogService;
import com.samhanair.logis.partnerorder.audit.web.PartnerOrderAuditLogController;
import com.samhanair.logis.partnerorder.editrequest.domain.PartnerOrderEditRequest;
import com.samhanair.logis.partnerorder.editrequest.service.PartnerOrderEditRequestService;
import com.samhanair.logis.partnerorder.editrequest.web.PartnerOrderEditRequestController;
import com.samhanair.logis.partnerorder.realtime.PartnerOrderRealtimeBroker;
import com.samhanair.logis.partnerorder.realtime.PartnerOrderRealtimeController;
import com.samhanair.logis.partnerorder.repository.TutorialStateRepository;
import com.samhanair.logis.partnerorder.service.PartnerOrderConfirmService;
import com.samhanair.logis.partnerorder.service.PartnerOrderDeleteService;
import com.samhanair.logis.partnerorder.service.PartnerOrderDraftService;
import com.samhanair.logis.partnerorder.service.PartnerOrderFromEstimateService;
import com.samhanair.logis.partnerorder.service.PartnerOrderHistoryService;
import com.samhanair.logis.partnerorder.service.PartnerOrderPrintService;
import com.samhanair.logis.partnerorder.service.PartnerOrderQueryService;
import com.samhanair.logis.partnerorder.service.TutorialStateService;
import com.samhanair.logis.partnerorder.service.PartnerOrderUpdateService;
import com.samhanair.logis.partnerorder.vendor.ocr.OcrEngine;
import com.samhanair.logis.partnerorder.vendor.service.VendorOrderService;
import com.samhanair.logis.partnerorder.vendor.web.VendorOrderController;
import com.samhanair.logis.partnerorder.vendor.web.dto.VendorOrderConfirmResponse;
import com.samhanair.logis.partnerorder.vendor.web.dto.VendorOrderUploadResponse;
import com.samhanair.logis.partnerorder.web.PartnerOrderConfirmController;
import com.samhanair.logis.partnerorder.web.PartnerOrderDeleteController;
import com.samhanair.logis.partnerorder.web.PartnerOrderDraftController;
import com.samhanair.logis.partnerorder.web.PartnerOrderEditController;
import com.samhanair.logis.partnerorder.web.PartnerOrderFromEstimateController;
import com.samhanair.logis.partnerorder.web.PartnerOrderHistoryController;
import com.samhanair.logis.partnerorder.web.PartnerOrderListController;
import com.samhanair.logis.partnerorder.web.PartnerOrderPrintController;
import com.samhanair.logis.partnerorder.web.TutorialStateController;
import com.samhanair.logis.partnerorder.web.dto.ConfirmResponse;
import com.samhanair.logis.partnerorder.web.dto.DraftDetailResponse;
import com.samhanair.logis.partnerorder.web.dto.DraftResponse;
import com.samhanair.logis.partnerorder.web.dto.HistoryResponse;
import com.samhanair.logis.partnerorder.web.dto.PartnerOrderDetailResponse;
import com.samhanair.logis.partnerorder.web.dto.PartnerOrderSummaryResponse;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.PermissionGuardMetrics;
import com.samhanair.logis.security.permission.PermissionSecurityAutoConfiguration;
import com.samhanair.logis.shared.realtime.editrequest.EditRequestType;
import com.samhanair.logis.shared.realtime.editrequest.EditTargetRole;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
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
                PartnerOrderEditRequestController.class,
                VendorOrderController.class,
                PartnerOrderConfirmController.class,
                PartnerOrderDeleteController.class,
                PartnerOrderDraftController.class,
                PartnerOrderEditController.class,
                PartnerOrderFromEstimateController.class,
                PartnerOrderHistoryController.class,
                PartnerOrderListController.class,
                PartnerOrderPrintController.class,
                TutorialStateController.class,
                PartnerOrderAuditLogController.class,
                PartnerOrderRealtimeController.class
        },
        properties = "spring.application.name=partner-order-service")
@Import({
        PermissionSecurityAutoConfiguration.class,
        PartnerOrderPermissionControllerIT.TestSecurityConfig.class,
        PartnerOrderPermissionControllerIT.TestMeterConfig.class
})
class PartnerOrderPermissionControllerIT {

    private static final String SERVICE_NAME = "partner-order-service";
    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String ROLE_HEADER = "X-User-Role";
    private static final UUID ORDER_ID = UUID.fromString("00000000-0000-0000-0000-000000000201");
    private static final UUID REQUEST_ID = UUID.fromString("00000000-0000-0000-0000-000000000202");

    @Autowired private MockMvc mockMvc;
    @Autowired private MeterRegistry meterRegistry;

    @MockBean private DynamicPermissionClient dynamicPermissionClient;
    @MockBean private PartnerOrderEditRequestService editRequestService;
    @MockBean private VendorOrderService vendorOrderService;
    @MockBean private OcrEngine ocrEngine;
    @MockBean private PartnerOrderConfirmService confirmService;
    @MockBean private PartnerOrderDeleteService deleteService;
    @MockBean private PartnerOrderDraftService draftService;
    @MockBean private PartnerOrderUpdateService updateService;
    @MockBean private PartnerOrderFromEstimateService fromEstimateService;
    @MockBean private PartnerOrderHistoryService historyService;
    @MockBean private PartnerOrderQueryService queryService;
    @MockBean private PartnerOrderPrintService printService;
    @MockBean private TutorialStateService tutorialStateService;
    @MockBean private TutorialStateRepository tutorialStateRepository;
    @MockBean private PartnerAuthClient partnerAuthClient;
    @MockBean private PartnerOrderAuditLogService auditLogService;
    @MockBean private PartnerOrderRealtimeBroker realtimeBroker;
    @MockBean private JpaMetamodelMappingContext jpaMetamodelMappingContext;

    @BeforeEach
    void setUp() throws Exception {
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.check(any(UUID.class), anyString(), any(PermissionAction.class)))
                .thenReturn(true);

        PartnerOrderEditRequest editRequest = PartnerOrderEditRequest.create(
                ORDER_ID, UUID.randomUUID(), "tester", EditRequestType.EDIT,
                "reason", EditTargetRole.MANAGER, LocalDateTime.of(2026, 5, 27, 9, 0));
        DraftResponse draft = new DraftResponse(
                ORDER_ID.toString(), 1L, "draft", LocalDateTime.of(2026, 6, 26, 9, 0),
                LocalDateTime.of(2026, 5, 26, 9, 0));
        DraftDetailResponse draftDetail = new DraftDetailResponse(
                ORDER_ID.toString(), 1L, "draft", "{}", LocalDateTime.of(2026, 6, 26, 9, 0),
                LocalDateTime.of(2026, 5, 26, 9, 0));
        ConfirmResponse confirm = new ConfirmResponse(
                "PO-1", "SLIP-1", "CONFIRMED", "PUBLISHED", BigDecimal.valueOf(1000),
                LocalDateTime.of(2026, 5, 26, 9, 0));
        PartnerOrderSummaryResponse summary = new PartnerOrderSummaryResponse(
                "PO-1", "P001", "Partner", LocalDateTime.of(2026, 5, 26, 9, 0),
                "CONFIRMED", BigDecimal.valueOf(1000), "SLIP-1");
        PartnerOrderDetailResponse detail = new PartnerOrderDetailResponse(
                "PO-1", "P001", "B001", "Partner", LocalDateTime.of(2026, 5, 26, 9, 0),
                "CONFIRMED", BigDecimal.valueOf(1000), "SLIP-1",
                LocalDateTime.of(2026, 5, 26, 9, 0), null, null, null, null, "memo", List.of());
        HistoryResponse history = new HistoryResponse(
                "PO-1", "SLIP-1", "CONFIRMED", "PUBLISHED", BigDecimal.valueOf(1000),
                LocalDateTime.of(2026, 5, 26, 9, 0));
        VendorOrderUploadResponse upload = new VendorOrderUploadResponse(
                "Vendor", "P001", "ocr", List.of(), BigDecimal.valueOf(1000), BigDecimal.valueOf(1000), List.of());
        VendorOrderConfirmResponse vendorConfirm = new VendorOrderConfirmResponse(
                "PO-1", "Vendor", "P001", BigDecimal.valueOf(1000), "REGISTERED");

        lenient().when(editRequestService.request(any(), any(), anyString(), any(), anyString()))
                .thenReturn(editRequest);
        lenient().when(editRequestService.request(any(), any(), anyString(), any(), anyString(), any()))
                .thenReturn(editRequest);
        lenient().when(editRequestService.approve(any(), any(), anyString(), any()))
                .thenReturn(editRequest);
        lenient().when(editRequestService.reject(any(), any(), anyString(), anyString()))
                .thenReturn(editRequest);
        lenient().when(editRequestService.listPendingForRole(any())).thenReturn(List.of(editRequest));
        lenient().when(editRequestService.listByOrder(any(), any())).thenReturn(List.of(editRequest));
        lenient().when(editRequestService.listByOrder(any(), any(), any())).thenReturn(List.of(editRequest));
        lenient().when(vendorOrderService.upload(any(), any(), any(), any())).thenReturn(upload);
        lenient().when(vendorOrderService.confirm(any(), anyString())).thenReturn(vendorConfirm);
        lenient().when(confirmService.confirm(any(), any(), anyString(), any(), any(), any())).thenReturn(confirm);
        lenient().when(draftService.create(any(), anyString(), any())).thenReturn(draft);
        lenient().when(draftService.list(any(), any(), any(), any())).thenReturn(new PageImpl<>(List.of(draft)));
        lenient().when(draftService.getOne(any(), any())).thenReturn(draftDetail);
        lenient().when(updateService.update(anyString(), any(), any(), anyString())).thenReturn(detail);
        lenient().when(fromEstimateService.createFromEstimate(any(), any(), anyString())).thenReturn(detail);
        lenient().when(historyService.findHistory(anyString(), any(), any(), any()))
                .thenReturn(new PageImpl<>(List.of(history), PageRequest.of(0, 20), 1));
        lenient().when(historyService.findHistory(anyString(), any(), any(), any(), any()))
                .thenReturn(new PageImpl<>(List.of(history), PageRequest.of(0, 20), 1));
        lenient().when(queryService.list(any(), any()))
                .thenReturn(new PageImpl<>(List.of(summary), PageRequest.of(0, 20), 1));
        lenient().when(queryService.list(any(), any(), any()))
                .thenReturn(new PageImpl<>(List.of(summary), PageRequest.of(0, 20), 1));
        lenient().when(queryService.findDetailById(anyString())).thenReturn(detail);
        lenient().when(queryService.findDetailById(anyString(), any())).thenReturn(detail);
        lenient().when(printService.renderPrintHtml(anyString(), any())).thenReturn("<html></html>");
        lenient().when(tutorialStateRepository.findByPartnerCode(anyString())).thenReturn(Optional.empty());
        lenient().when(tutorialStateRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        lenient().when(auditLogService.listByOrderIdentifier(anyString())).thenReturn(List.of());
        lenient().when(realtimeBroker.subscribe(any())).thenReturn(new SseEmitter(100L));
    }

    @ParameterizedTest(name = "{0} grant")
    @MethodSource("endpoints")
    void migratedEndpoint_withGrant_returnsSuccess(EndpointCase endpoint) throws Exception {
        mockMvc.perform(withActor(endpoint.request().get(), endpoint.role()))
                .andExpect(status().is(endpoint.successStatus()));
    }

    @ParameterizedTest(name = "{0} deny")
    @MethodSource("endpoints")
    void migratedEndpoint_withoutGrant_returns403AndIncrementsCounter(EndpointCase endpoint) throws Exception {
        when(dynamicPermissionClient.check(any(UUID.class), eq(endpoint.page()), eq(endpoint.action())))
                .thenReturn(false);
        double before = deniedCount(endpoint.page(), endpoint.role(), endpoint.action().name());

        mockMvc.perform(withActor(endpoint.request().get(), endpoint.role()))
                .andExpect(status().isForbidden());

        assertThat(deniedCount(endpoint.page(), endpoint.role(), endpoint.action().name())).isEqualTo(before + 1.0);
    }

    @ParameterizedTest(name = "PARTNER self-service {0}")
    @MethodSource("partnerSelfServiceEndpoints")
    void partnerSelfServiceEndpoint_withPartnerRole_bypassesDynamicPermissionAndReturnsSuccess(
            EndpointCase endpoint) throws Exception {
        when(dynamicPermissionClient.check(any(UUID.class), eq(endpoint.page()), eq(endpoint.action())))
                .thenReturn(false);

        mockMvc.perform(withActor(endpoint.request().get(), "PARTNER"))
                .andExpect(status().is(endpoint.successStatus()));
    }

    @ParameterizedTest(name = "partner-order edit decision {0} role={1} status={2}")
    @CsvSource({
            "approve, MANAGER, 200",
            "approve, MASTER, 200",
            "approve, SALES, 403",
            "approve, PARTNER, 403",
            "reject, MANAGER, 200",
            "reject, MASTER, 200",
            "reject, SALES, 403",
            "reject, PARTNER, 403"
    })
    void editRequestDecision_usesDecidePermission(String decision, String role, int expectedStatus) throws Exception {
        when(dynamicPermissionClient.check(any(UUID.class), eq("sales.partner-order.edit-requests.decide"), eq(PermissionAction.UPDATE)))
                .thenReturn(expectedStatus < 400);
        String body = "approve".equals(decision) ? "{\"note\":\"ok\"}" : "{\"reason\":\"no\"}";

        mockMvc.perform(withActor(post("/api/v1/partner-orders/{id}/edit-request/{requestId}/{decision}",
                        ORDER_ID, REQUEST_ID, decision)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body), role))
                .andExpect(status().is(expectedStatus));
    }

    static Stream<EndpointCase> endpoints() {
        return Stream.of(
                new EndpointCase("edit request create", "sales.partner-order.edit-requests", PermissionAction.CREATE, "SALES", 201,
                        () -> post("/api/v1/partner-orders/{id}/edit-request", ORDER_ID)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"type\":\"EDIT\",\"reason\":\"reason\"}")),
                new EndpointCase("edit request approve", "sales.partner-order.edit-requests.decide", PermissionAction.UPDATE, "MANAGER", 200,
                        () -> post("/api/v1/partner-orders/{id}/edit-request/{requestId}/approve", ORDER_ID, REQUEST_ID)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"note\":\"ok\"}")),
                new EndpointCase("edit request reject", "sales.partner-order.edit-requests.decide", PermissionAction.UPDATE, "MANAGER", 200,
                        () -> post("/api/v1/partner-orders/{id}/edit-request/{requestId}/reject", ORDER_ID, REQUEST_ID)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"reason\":\"no\"}")),
                new EndpointCase("edit request list", "sales.partner-order.edit-requests.decide", PermissionAction.VIEW, "MANAGER", 200,
                        () -> get("/api/v1/partner-orders/edit-requests").param("targetRole", "MANAGER")),
                new EndpointCase("edit requests by order", "sales.partner-order.edit-requests", PermissionAction.VIEW, "STAFF", 200,
                        () -> get("/api/v1/partner-orders/{id}/edit-requests", ORDER_ID)),
                new EndpointCase("order audit logs", "sales.partner-order.history.view", PermissionAction.VIEW, "STAFF", 200,
                        () -> get("/api/v1/partner-orders/{id}/audit-logs", ORDER_ID)),
                new EndpointCase("order realtime", "sales.partner-order.history.view", PermissionAction.VIEW, "STAFF", 200,
                        () -> get("/api/v1/partner-orders/{id}/realtime", ORDER_ID)),
                new EndpointCase("vendor upload", "sales.vendor-order", PermissionAction.CREATE, "MANAGER", 200,
                        () -> multipart("/api/v1/admin/partner-order/vendor/upload")
                                .file(new MockMultipartFile("file", "order.png", "image/png", "x".getBytes()))),
                new EndpointCase("vendor confirm", "sales.vendor-order", PermissionAction.CREATE, "MANAGER", 200,
                        () -> post("/api/v1/admin/partner-order/vendor/confirm")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(vendorConfirmBody())),
                new EndpointCase("order confirm", "sales.partner-order.confirm", PermissionAction.CREATE, "SALES", 200,
                        () -> post("/api/v1/partner-orders/{id}/confirm", ORDER_ID)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(confirmBody())),
                new EndpointCase("order delete", "sales.partner-order.edit", PermissionAction.DELETE, "MANAGER", 204,
                        () -> delete("/api/v1/partner-orders/PO-1")),
                new EndpointCase("draft create", "sales.partner-order.draft", PermissionAction.CREATE, "SALES", 201,
                        () -> post("/api/v1/partner-orders/drafts")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"label\":\"draft\",\"payloadJson\":\"{}\"}")),
                new EndpointCase("draft list", "sales.partner-order.draft", PermissionAction.VIEW, "SALES", 200,
                        () -> get("/api/v1/partner-orders/drafts")),
                new EndpointCase("draft detail", "sales.partner-order.draft", PermissionAction.VIEW, "SALES", 200,
                        () -> get("/api/v1/partner-orders/drafts/{id}", ORDER_ID)),
                new EndpointCase("order update", "sales.partner-order.edit", PermissionAction.UPDATE, "MANAGER", 200,
                        () -> put("/api/v1/partner-orders/PO-1")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(updateBody())),
                new EndpointCase("from estimate", "sales.partner-order.edit", PermissionAction.CREATE, "MANAGER", 201,
                        () -> post("/api/v1/partner-orders/from-estimate/{id}", ORDER_ID)),
                new EndpointCase("history", "sales.partner-order.history", PermissionAction.VIEW, "SALES", 200,
                        () -> get("/api/v1/partner-orders/history")
                                .param("bizCode", "B001")
                                .param("from", "2026-05-26T00:00:00")
                                .param("to", "2026-05-27T00:00:00")),
                new EndpointCase("order list", "sales.partner-order.list", PermissionAction.VIEW, "SALES", 200,
                        () -> get("/api/v1/partner-orders")),
                new EndpointCase("order detail", "sales.partner-order.list", PermissionAction.VIEW, "SALES", 200,
                        () -> get("/api/v1/partner-orders/PO-1")),
                new EndpointCase("print", "sales.partner-order.print", PermissionAction.PRINT, "SALES", 200,
                        () -> get("/api/v1/partner-orders/PO-1/print")),
                new EndpointCase("tutorial", "sales.partner-order.tutorial", PermissionAction.UPDATE, "SALES", 200,
                        () -> patch("/api/v1/auth/partner-tutorial")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"completed\":true}"))
        );
    }

    static Stream<EndpointCase> partnerSelfServiceEndpoints() {
        return Stream.of(
                new EndpointCase("edit request create", "sales.partner-order.edit-requests", PermissionAction.CREATE, "PARTNER", 201,
                        () -> post("/api/v1/partner-orders/{id}/edit-request", ORDER_ID)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"type\":\"EDIT\",\"reason\":\"reason\"}")),
                new EndpointCase("edit requests by order", "sales.partner-order.edit-requests", PermissionAction.VIEW, "PARTNER", 200,
                        () -> get("/api/v1/partner-orders/{id}/edit-requests", ORDER_ID)),
                new EndpointCase("order confirm", "sales.partner-order.confirm", PermissionAction.CREATE, "PARTNER", 200,
                        () -> post("/api/v1/partner-orders/{id}/confirm", ORDER_ID)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(confirmBody())),
                new EndpointCase("draft create", "sales.partner-order.draft", PermissionAction.CREATE, "PARTNER", 201,
                        () -> post("/api/v1/partner-orders/drafts")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"label\":\"draft\",\"payloadJson\":\"{}\"}")),
                new EndpointCase("draft list", "sales.partner-order.draft", PermissionAction.VIEW, "PARTNER", 200,
                        () -> get("/api/v1/partner-orders/drafts")),
                new EndpointCase("draft detail", "sales.partner-order.draft", PermissionAction.VIEW, "PARTNER", 200,
                        () -> get("/api/v1/partner-orders/drafts/{id}", ORDER_ID)),
                new EndpointCase("history", "sales.partner-order.history", PermissionAction.VIEW, "PARTNER", 200,
                        () -> get("/api/v1/partner-orders/history")
                                .param("bizCode", "B001")
                                .param("from", "2026-05-26T00:00:00")
                                .param("to", "2026-05-27T00:00:00")),
                new EndpointCase("order list", "sales.partner-order.list", PermissionAction.VIEW, "PARTNER", 200,
                        () -> get("/api/v1/partner-orders")),
                new EndpointCase("order detail", "sales.partner-order.list", PermissionAction.VIEW, "PARTNER", 200,
                        () -> get("/api/v1/partner-orders/PO-1")),
                new EndpointCase("print", "sales.partner-order.print", PermissionAction.PRINT, "PARTNER", 200,
                        () -> get("/api/v1/partner-orders/PO-1/print")),
                new EndpointCase("tutorial", "sales.partner-order.tutorial", PermissionAction.UPDATE, "PARTNER", 200,
                        () -> patch("/api/v1/auth/partner-tutorial")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"completed\":true}"))
        );
    }

    private static String confirmBody() {
        return """
                {"lines":[{"productId":"00000000-0000-0000-0000-000000000301","categoryKey":"wall","quantity":1}]}
                """;
    }

    private static String vendorConfirmBody() {
        return """
                {"vendorName":"Vendor","partnerCode":"P001","lines":[{"modelCode":"MODEL-1","productName":"Product","quantity":1,"finalPrice":1000}]}
                """;
    }

    private static String updateBody() {
        return """
                {"updatedAt":"2026-05-26T09:00:00","partnerCode":"P001","bizCode":"B001","dueDate":"2026-05-30","memo":"memo","lines":[{"modelCode":"MODEL-1","productName":"Product","categoryKey":"wall","quantity":1,"deliveryPrice":1000,"remark":"r"}]}
                """;
    }

    private static MockHttpServletRequestBuilder withActor(MockHttpServletRequestBuilder request, String role) {
        return request
                .header(USER_ID_HEADER, UUID.randomUUID().toString())
                .header(ROLE_HEADER, role)
                .header("X-Partner-Code", "P001")
                .header("X-Biz-Code", "B001");
    }

    private double deniedCount(String page, String role, String action) {
        return meterRegistry.counter(
                PermissionGuardMetrics.COUNTER_NAME,
                "service", SERVICE_NAME,
                "page", page,
                "role", role,
                "action", action
        ).count();
    }

    record EndpointCase(
            String name,
            String page,
            PermissionAction action,
            String role,
            int successStatus,
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
                    .addFilterBefore(new HeaderAuthenticationFilter(), UsernamePasswordAuthenticationFilter.class);
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
