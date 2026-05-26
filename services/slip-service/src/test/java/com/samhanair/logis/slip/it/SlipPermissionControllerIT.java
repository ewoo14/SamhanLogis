package com.samhanair.logis.slip.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.not;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionGuardMetrics;
import com.samhanair.logis.security.permission.PermissionSecurityAutoConfiguration;
import com.samhanair.logis.slip.attachment.service.SlipAttachmentService;
import com.samhanair.logis.slip.attachment.web.SlipPhotoAuditAdminController;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.delivery.service.DeliveryBatchService;
import com.samhanair.logis.slip.delivery.web.DeliveryBatchController;
import com.samhanair.logis.slip.editrequest.service.SlipEditRequestService;
import com.samhanair.logis.slip.editrequest.web.SlipEditRequestController;
import com.samhanair.logis.slip.service.NextDaySlipImageService;
import com.samhanair.logis.slip.service.SlipCleanupService;
import com.samhanair.logis.slip.service.SlipExcelExportService;
import com.samhanair.logis.slip.service.SlipService;
import com.samhanair.logis.slip.service.SlipSignatureService;
import com.samhanair.logis.slip.web.SlipController;
import com.samhanair.logis.slip.web.SlipLookupController;
import com.samhanair.logis.slip.web.SlipSignatureController;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import java.util.function.Supplier;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
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

/** SP-D6-6 slip-service @RequirePermission slice 테스트. */
@WebMvcTest(
        controllers = {
                SlipController.class,
                SlipLookupController.class,
                SlipSignatureController.class,
                SlipPhotoAuditAdminController.class,
                SlipEditRequestController.class,
                DeliveryBatchController.class
        },
        properties = "spring.application.name=slip-service")
@Import({
        PermissionSecurityAutoConfiguration.class,
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
    @MockBean private NextDaySlipImageService nextDaySlipImageService;
    @MockBean private SlipCleanupService slipCleanupService;
    @MockBean private SlipExcelExportService slipExcelExportService;
    @MockBean private ProductClient productClient;
    @MockBean private SlipSignatureService signatureService;
    @MockBean private SlipAttachmentService attachmentService;
    @MockBean private SlipEditRequestService editRequestService;
    @MockBean private DeliveryBatchService batchService;
    @MockBean private JpaMetamodelMappingContext jpaMetamodelMappingContext;

    @BeforeEach
    void setUp() {
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(productClient.lookupByModel(anyString()))
                .thenReturn(new ProductSummary(ID, "테스트 제품", "MOD-001", ID, BigDecimal.ONE, "ACTIVE"));
        lenient().when(batchService.list(any(), any())).thenReturn(List.of());
        lenient().when(batchService.autoGroupByDate(any())).thenReturn(List.of());
        lenient().when(attachmentService.listPhotoAudit(any(), any(), any(), any(), any()))
                .thenReturn(Page.empty());
        lenient().when(editRequestService.listPendingForRole(any())).thenReturn(List.of());
        lenient().when(slipExcelExportService.export(any(), any(), any(), any(), any()))
                .thenReturn("xlsx".getBytes());
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

    static Stream<EndpointCase> endpoints() {
        return Stream.of(
                endpoint("lookup product", "slip.lookup-product", "VIEW", "SALES",
                        () -> get("/slips/lookup-product").param("modelName", "MOD-001")),
                endpoint("delivery batch list", "slip.delivery-batch", "VIEW", "MANAGER",
                        () -> get("/delivery-batches").param("date", "2026-05-27")),
                endpoint("delivery batch auto group", "slip.delivery-batch", "EDIT", "MANAGER",
                        () -> post("/delivery-batches/auto-group").param("date", "2026-05-27")),
                endpoint("photo audit", "slip.photo-audit", "VIEW", "WAREHOUSE",
                        () -> get("/slips/admin/photo-audit")),
                endpoint("signature view", "slip.signature", "VIEW", "MANAGER",
                        () -> get("/slips/{id}/signature", ID)),
                endpoint("signature invalidate", "slip.signature", "EDIT", "MASTER",
                        () -> delete("/slips/{id}/signature", ID)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"reason\":\"재서명\"}")),
                endpoint("edit request pending", "slip.edit-requests.decide", "VIEW", "MANAGER",
                        () -> get("/slips/edit-requests").param("targetRole", "MANAGER")),
                endpoint("next day print data", "slip.print.next-day", "VIEW", "SALES",
                        () -> get("/slips/next-day-image-data")),
                endpoint("cleanup report", "slip.cleanup", "VIEW", "SALES",
                        () -> get("/slips/cleanup").param("from", "2026-05-01").param("to", "2026-05-27")),
                endpoint("export xlsx", "slip.print.export", "EDIT", "MANAGER",
                        () -> get("/slips/export.xlsx"))
        );
    }

    private static EndpointCase endpoint(
            String name, String page, String action, String role,
            Supplier<MockHttpServletRequestBuilder> request) {
        return new EndpointCase(name, page, action, role, request);
    }

    private static MockHttpServletRequestBuilder withActor(MockHttpServletRequestBuilder request, String role) {
        return request
                .header(USER_ID_HEADER, ID.toString())
                .header(USER_NAME_HEADER, "테스터")
                .header(ROLE_HEADER, role);
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
