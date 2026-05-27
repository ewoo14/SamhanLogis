package com.samhanair.logis.partner.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.not;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.partner.config.HeaderAuthenticationFilter;
import com.samhanair.logis.partner.controller.EcountPartnerImportController;
import com.samhanair.logis.partner.controller.PartnerAdminController;
import com.samhanair.logis.partner.controller.PartnerBlockAdminController;
import com.samhanair.logis.partner.controller.PartnerVisitAttachmentController;
import com.samhanair.logis.partner.domain.AttachmentType;
import com.samhanair.logis.partner.domain.BlockedPartner;
import com.samhanair.logis.partner.domain.Partner;
import com.samhanair.logis.partner.domain.PartnerAttachment;
import com.samhanair.logis.partner.editrequest.domain.PartnerEditRequest;
import com.samhanair.logis.partner.editrequest.service.PartnerEditRequestService;
import com.samhanair.logis.partner.editrequest.web.PartnerEditRequestController;
import com.samhanair.logis.partner.realtime.PartnerRealtimeController;
import com.samhanair.logis.partner.repository.PartnerRepository;
import com.samhanair.logis.partner.service.EcountPartnerImporter;
import com.samhanair.logis.partner.service.PartnerAligoExportService;
import com.samhanair.logis.partner.service.PartnerAttachmentService;
import com.samhanair.logis.partner.service.PartnerBlockImportService;
import com.samhanair.logis.partner.service.PartnerBlockService;
import com.samhanair.logis.partner.service.PartnerCreditService;
import com.samhanair.logis.partner.service.PartnerExcelExportService;
import com.samhanair.logis.partner.service.PartnerService;
import com.samhanair.logis.partner.tab.service.Partner4TabService;
import com.samhanair.logis.partner.tab.web.Partner4TabController;
import com.samhanair.logis.partner.web.PartnerAttachmentController;
import com.samhanair.logis.security.HrAuthorizationHelper;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionGuardMetrics;
import com.samhanair.logis.security.permission.PermissionSecurityAutoConfiguration;
import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
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
                PartnerAdminController.class,
                PartnerBlockAdminController.class,
                PartnerAttachmentController.class,
                PartnerVisitAttachmentController.class,
                EcountPartnerImportController.class,
                PartnerEditRequestController.class,
                PartnerRealtimeController.class,
                Partner4TabController.class
        },
        properties = "spring.application.name=partner-service")
@Import({
        PermissionSecurityAutoConfiguration.class,
        PartnerPermissionControllerIT.TestSecurityConfig.class,
        PartnerPermissionControllerIT.TestMeterConfig.class
})
class PartnerPermissionControllerIT {

    private static final String SERVICE_NAME = "partner-service";
    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String ROLE_HEADER = "X-User-Role";
    private static final String DEPARTMENT_HEADER = "X-User-Department";
    private static final UUID ENTITY_ID = UUID.fromString("00000000-0000-0000-0000-000000000401");
    private static final UUID ATTACHMENT_ID = UUID.fromString("00000000-0000-0000-0000-000000000402");
    private static final UUID REQUEST_ID = UUID.fromString("00000000-0000-0000-0000-000000000403");

    @Autowired private MockMvc mockMvc;
    @Autowired private MeterRegistry meterRegistry;

    @MockBean private DynamicPermissionClient dynamicPermissionClient;
    @MockBean private PartnerService partnerService;
    @MockBean private PartnerCreditService creditService;
    @MockBean private PartnerAligoExportService aligoExportService;
    @MockBean private PartnerExcelExportService excelExportService;
    @MockBean private PartnerBlockService blockService;
    @MockBean private PartnerBlockImportService blockImportService;
    @MockBean private PartnerAttachmentService attachmentService;
    @MockBean private PartnerRepository partnerRepository;
    @MockBean private EcountPartnerImporter ecountPartnerImporter;
    @MockBean private PartnerEditRequestService editRequestService;
    @MockBean private RealtimeBroker realtimeBroker;
    @MockBean private Partner4TabService partner4TabService;
    @MockBean private JpaMetamodelMappingContext jpaMetamodelMappingContext;

    @BeforeEach
    void setUp() throws Exception {
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);

        Partner partner = Partner.register("P-001", "123-45-67890", "테스트거래처",
                "서울", "010-0000-0000", BigDecimal.ZERO);
        BlockedPartner blocked = BlockedPartner.create(
                "P-001", "테스트거래처", "reason", LocalDateTime.of(2026, 5, 26, 9, 0), "MANUAL");
        PartnerAttachment attachment = PartnerAttachment.register(
                ENTITY_ID, AttachmentType.VISIT_PHOTO, "visit.png", 1L, "image/png",
                "partner/visit.png", ENTITY_ID, "memo");
        PartnerEditRequest editRequest = PartnerEditRequest.create(
                ENTITY_ID, ENTITY_ID, "tester", EditRequestType.EDIT,
                "reason", EditTargetRole.MANAGER, LocalDateTime.of(2026, 5, 27, 9, 0));

        lenient().when(partnerService.register(any())).thenReturn(partner);
        lenient().when(partnerService.updateProfile(anyString(), any())).thenReturn(partner);
        lenient().when(partnerService.findByCode(anyString())).thenReturn(partner);
        lenient().when(partnerService.findByName(anyString())).thenReturn(partner);
        lenient().when(partnerService.findAll(any())).thenReturn(new PageImpl<>(List.of()));
        lenient().when(partnerService.searchAdmin(any(), any(), any())).thenReturn(new PageImpl<>(List.of()));
        lenient().when(creditService.findHistory(anyString(), any())).thenReturn(new PageImpl<>(List.of()));
        lenient().when(aligoExportService.exportAligoCsv()).thenReturn("csv".getBytes());
        lenient().when(excelExportService.export(any(), any())).thenReturn("xlsx".getBytes());
        lenient().when(blockService.findAll(any())).thenReturn(new PageImpl<>(List.of()));
        lenient().when(blockService.block(anyString(), any())).thenReturn(blocked);
        lenient().when(attachmentService.upload(any(), any(), any(), any(), any())).thenReturn(attachment);
        lenient().when(attachmentService.list(any())).thenReturn(List.of(attachment));
        lenient().when(attachmentService.listByType(any(), any())).thenReturn(List.of(attachment));
        lenient().when(attachmentService.download(any()))
                .thenReturn(new PartnerAttachmentService.DownloadView(
                        attachment, "https://example.invalid/partner/fresh.png"));
        lenient().when(partnerRepository.findByPartnerCode(anyString())).thenReturn(Optional.of(partner));
        lenient().when(editRequestService.request(any(), any(), any(), any(), anyString())).thenReturn(editRequest);
        lenient().when(editRequestService.approve(any(), any(), anyString(), any())).thenReturn(editRequest);
        lenient().when(editRequestService.reject(any(), any(), anyString(), anyString())).thenReturn(editRequest);
        lenient().when(editRequestService.listPendingForRole(any())).thenReturn(List.of(editRequest));
        lenient().when(editRequestService.listByEntity(any())).thenReturn(List.of(editRequest));
        lenient().when(realtimeBroker.subscribe(any())).thenReturn(new SseEmitter(100L));
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
        if ("VIEW".equals(endpoint.action())) {
            when(dynamicPermissionClient.canView(endpoint.role(), endpoint.page())).thenReturn(false);
        } else {
            when(dynamicPermissionClient.canEdit(endpoint.role(), endpoint.page())).thenReturn(false);
        }
        double before = deniedCount(endpoint.page(), endpoint.role(), endpoint.action());

        mockMvc.perform(withActor(endpoint.request().get(), endpoint.role()))
                .andExpect(status().isForbidden());

        assertThat(deniedCount(endpoint.page(), endpoint.role(), endpoint.action())).isEqualTo(before + 1.0);
    }

    @Test
    void partnerAdminCreate_nonExecutiveManagerWithDynamicGrant_returns403ByHrStaticGuard() throws Exception {
        double before = deniedCount("partners.edit", "MANAGER", "EDIT");

        mockMvc.perform(withActor(post("/admin/partners")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(partnerBody()), "MANAGER", "영업1팀"))
                .andExpect(status().isForbidden());

        assertThat(deniedCount("partners.edit", "MANAGER", "EDIT")).isEqualTo(before);
    }

    static Stream<EndpointCase> endpoints() {
        return Stream.of(
                endpoint("partner create", "partners.edit", "EDIT", "MANAGER",
                        () -> post("/admin/partners").contentType(MediaType.APPLICATION_JSON).content(partnerBody())),
                endpoint("partner list", "partners.search", "VIEW", "SALES",
                        () -> get("/admin/partners")),
                endpoint("partner search", "partners.search", "VIEW", "SALES",
                        () -> get("/admin/partners/search")),
                endpoint("partner by name", "partners.edit", "VIEW", "MANAGER",
                        () -> get("/admin/partners/by-name").param("name", "테스트거래처")),
                endpoint("partner detail", "partners.detail", "VIEW", "ACCOUNTANT",
                        () -> get("/admin/partners/P-001")),
                endpoint("partner update", "partners.edit", "EDIT", "MANAGER",
                        () -> put("/admin/partners/P-001").contentType(MediaType.APPLICATION_JSON).content(partnerBody())),
                endpoint("partner delete", "partners.delete", "EDIT", "MASTER",
                        () -> delete("/admin/partners/P-001")),
                endpoint("partner aligo export", "partners.edit", "VIEW", "MANAGER",
                        () -> get("/admin/partners/export/aligo-csv")),
                endpoint("partner xlsx export", "partners.edit", "VIEW", "MANAGER",
                        () -> get("/admin/partners/export.xlsx")),
                endpoint("partner credit history", "partners.credit-history", "VIEW", "ACCOUNTANT",
                        () -> get("/admin/partners/P-001/credit-history")),
                endpoint("block list", "partners.block", "VIEW", "MANAGER",
                        () -> get("/api/v1/partners/admin/blocks")),
                endpoint("block create", "partners.block", "EDIT", "MANAGER",
                        () -> post("/api/v1/partners/admin/blocks")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"partnerCode\":\"P-001\",\"blockReason\":\"reason\"}")),
                endpoint("block import", "partners.block.bulk", "EDIT", "MASTER",
                        () -> multipart("/api/v1/partners/admin/blocks/import").file(csv("file"))),
                endpoint("block delete", "partners.block.bulk", "EDIT", "MASTER",
                        () -> delete("/api/v1/partners/admin/blocks/{id}", ENTITY_ID)),
                endpoint("attachment upload", "partners.detail", "EDIT", "SALES",
                        () -> multipart("/api/v1/partners/{partnerId}/attachments", ENTITY_ID)
                                .file(image("file"))
                                .param("type", "BIZ_LICENSE")),
                endpoint("attachment list", "partners.detail.view", "VIEW", "STAFF",
                        () -> get("/api/v1/partners/{partnerId}/attachments", ENTITY_ID)),
                endpoint("attachment detail", "partners.detail.view", "VIEW", "STAFF",
                        () -> get("/api/v1/partners/attachments/{attachmentId}", ATTACHMENT_ID)),
                endpoint("attachment delete", "partners.detail", "EDIT", "SALES",
                        () -> delete("/api/v1/partners/attachments/{attachmentId}", ATTACHMENT_ID)),
                endpoint("visit photo upload", "partners.detail", "EDIT", "SALES",
                        () -> multipart("/admin/partners/P-001/visit-attachments").file(image("file"))),
                endpoint("visit photo list", "partners.detail.view", "VIEW", "STAFF",
                        () -> get("/admin/partners/P-001/visit-attachments")),
                endpoint("visit photo detail", "partners.detail.view", "VIEW", "STAFF",
                        () -> get("/admin/partners/P-001/visit-attachments/{attachmentId}", ATTACHMENT_ID)),
                endpoint("visit photo delete", "partners.edit", "EDIT", "MANAGER",
                        () -> delete("/admin/partners/P-001/visit-attachments/{attachmentId}", ATTACHMENT_ID)),
                endpoint("ecount import", "partners.edit", "EDIT", "MANAGER",
                        () -> multipart("/admin/partners/imports/ecount").file(csv("file"))),
                endpoint("edit request create", "partners.edit-requests", "EDIT", "ACCOUNTANT",
                        () -> post("/admin/partners/entities/{entityId}/edit-request", ENTITY_ID)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"type\":\"EDIT\",\"reason\":\"reason\"}")),
                endpoint("edit request approve", "partners.edit-requests.decide", "EDIT", "MANAGER",
                        () -> post("/admin/partners/edit-requests/{requestId}/approve", REQUEST_ID)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"note\":\"ok\"}")),
                endpoint("edit request reject", "partners.edit-requests.decide", "EDIT", "MANAGER",
                        () -> post("/admin/partners/edit-requests/{requestId}/reject", REQUEST_ID)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"reason\":\"no\"}")),
                endpoint("edit request pending", "partners.edit-requests.decide", "VIEW", "MANAGER",
                        () -> get("/admin/partners/edit-requests")),
                endpoint("edit request by entity", "partners.edit-requests", "VIEW", "ACCOUNTANT",
                        () -> get("/admin/partners/entities/{entityId}/edit-requests", ENTITY_ID)),
                endpoint("partner realtime", "partners.edit-requests", "VIEW", "ACCOUNTANT",
                        () -> get("/admin/partners/{entityId}/realtime", ENTITY_ID)),
                endpoint("4tab full get", "partners.4tab", "VIEW", "SALES",
                        () -> get("/api/v1/partners/P-001/full")),
                endpoint("4tab full create", "partners.4tab", "EDIT", "SALES",
                        () -> post("/api/v1/partners/full").contentType(MediaType.APPLICATION_JSON).content(tabBody())),
                endpoint("4tab full update", "partners.4tab.edit", "EDIT", "MANAGER",
                        () -> patch("/api/v1/partners/P-001/full").contentType(MediaType.APPLICATION_JSON).content(tabBody())),
                endpoint("4tab price get", "partners.4tab", "VIEW", "SALES",
                        () -> get("/api/v1/partners/P-001/price-discount")),
                endpoint("4tab price upsert", "partners.4tab.edit", "EDIT", "MANAGER",
                        () -> put("/api/v1/partners/P-001/price-discount")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"basicDiscountRate\":0,\"paymentTermDays\":30}")),
                endpoint("4tab shipping get", "partners.4tab", "VIEW", "SALES",
                        () -> get("/api/v1/partners/P-001/shipping-addresses")),
                endpoint("4tab shipping add", "partners.4tab.edit", "EDIT", "MANAGER",
                        () -> post("/api/v1/partners/P-001/shipping-addresses")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"alias\":\"본사\",\"address\":\"서울\"}")),
                endpoint("4tab shipping delete", "partners.4tab.edit", "EDIT", "MANAGER",
                        () -> delete("/api/v1/partners/P-001/shipping-addresses/{addrId}", ENTITY_ID)),
                endpoint("4tab contact get", "partners.4tab", "VIEW", "SALES",
                        () -> get("/api/v1/partners/P-001/contacts")),
                endpoint("4tab contact add", "partners.4tab.edit", "EDIT", "MANAGER",
                        () -> post("/api/v1/partners/P-001/contacts")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"contactName\":\"담당자\",\"phone\":\"010\"}")),
                endpoint("4tab contact delete", "partners.4tab.edit", "EDIT", "MANAGER",
                        () -> delete("/api/v1/partners/P-001/contacts/{contactId}", ENTITY_ID))
        );
    }

    private static EndpointCase endpoint(
            String name, String page, String action, String role,
            Supplier<MockHttpServletRequestBuilder> request) {
        return new EndpointCase(name, page, action, role, request);
    }

    private static String partnerBody() {
        return "{\"partnerCode\":\"P-001\",\"bizNo\":\"123-45-67890\",\"name\":\"테스트거래처\",\"creditLimit\":0}";
    }

    private static String tabBody() {
        return "{\"partnerCode\":\"P-001\",\"bizNo\":\"123-45-67890\",\"name\":\"테스트거래처\"}";
    }

    private static MockMultipartFile csv(String name) {
        return new MockMultipartFile(name, "sample.csv", "text/csv", "x".getBytes());
    }

    private static MockMultipartFile image(String name) {
        return new MockMultipartFile(name, "visit.png", "image/png", "x".getBytes());
    }

    private static MockHttpServletRequestBuilder withActor(MockHttpServletRequestBuilder request, String role) {
        return withActor(request, role, HrAuthorizationHelper.EXECUTIVE_OFFICE_NAME);
    }

    private static MockHttpServletRequestBuilder withActor(
            MockHttpServletRequestBuilder request,
            String role,
            String department) {
        return request
                .header(USER_ID_HEADER, ENTITY_ID.toString())
                .header(ROLE_HEADER, role)
                .header(DEPARTMENT_HEADER, department);
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
            String action,
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

        @Bean("hr")
        HrAuthorizationHelper hrAuthorizationHelper() {
            return new HrAuthorizationHelper();
        }

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
