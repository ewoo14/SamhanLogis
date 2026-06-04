package com.samhanair.logis.dcconfig.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.dcconfig.config.HeaderAuthenticationFilter;
import com.samhanair.logis.dcconfig.domain.DcConfig;
import com.samhanair.logis.dcconfig.domain.DcConfigSource;
import com.samhanair.logis.dcconfig.domain.Partner;
import com.samhanair.logis.dcconfig.domain.PartnerGroup;
import com.samhanair.logis.dcconfig.dto.DcConfigImportResult;
import com.samhanair.logis.dcconfig.repository.DcConfigRepository;
import com.samhanair.logis.dcconfig.service.DcConfigImportService;
import com.samhanair.logis.dcconfig.service.DcConfigService;
import com.samhanair.logis.dcconfig.web.DcConfigImportController;
import com.samhanair.logis.dcconfig.web.PartnerDcConfigsController;
import com.samhanair.logis.security.HrAuthorizationHelper;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.PermissionGuardMetrics;
import com.samhanair.logis.security.permission.PermissionSecurityAutoConfiguration;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
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

/** SP-D6-1 dc-config-service @RequirePermission 통합 테스트. */
@WebMvcTest(
        controllers = {
                PartnerDcConfigsController.class,
                DcConfigImportController.class
        },
        properties = "spring.application.name=dc-config-service")
@Import({
        PermissionSecurityAutoConfiguration.class,
        DcConfigPermissionControllerIT.TestSecurityConfig.class,
        DcConfigPermissionControllerIT.TestMeterConfig.class
})
class DcConfigPermissionControllerIT {

    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String ROLE_HEADER = "X-User-Role";
    private static final String SERVICE_NAME = "dc-config-service";
    private static final String PARTNER_DC_PAGE = "sales.partner-dc-config";
    private static final String IMPORT_PAGE = "dc-config.import";
    private static final String PARTNER_CODE = "P-D6-WEBMVC";

    @Autowired private MockMvc mockMvc;
    @Autowired private MeterRegistry meterRegistry;

    @MockBean private DynamicPermissionClient dynamicPermissionClient;
    @MockBean private DcConfigRepository dcConfigRepository;
    @MockBean private DcConfigService dcConfigService;
    @MockBean private DcConfigImportService importService;
    @MockBean private JpaMetamodelMappingContext jpaMetamodelMappingContext;

    private DcConfig dcConfig;

    @BeforeEach
    void setUp() throws Exception {
        dcConfig = createDcConfig(PARTNER_CODE);

        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.check(any(UUID.class), anyString(), any(PermissionAction.class)))
                .thenReturn(true);
        lenient().when(dcConfigRepository.search(any(), any()))
                .thenReturn(new PageImpl<>(List.of(dcConfig), PageRequest.of(0, 50), 1));
        lenient().when(dcConfigService.updatePartnerDcConfig(anyString(), any()))
                .thenReturn(dcConfig);
        lenient().when(importService.importCsv(any()))
                .thenReturn(new DcConfigImportResult(1, 0, 0, List.of()));
    }

    @Test
    @DisplayName("거래처 DC 목록은 sales.partner-dc-config VIEW 권한이면 200")
    void partnerDcList_withViewGrant_returns200() throws Exception {
        mockMvc.perform(withActor(get("/api/v1/partner-dc-configs"), "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.content[0].partnerCode").value(PARTNER_CODE));
    }

    @Test
    @DisplayName("거래처 DC 목록은 VIEW 권한 없으면 403 + Counter 증가")
    void partnerDcList_withoutViewGrant_returns403AndIncrementsCounter() throws Exception {
        when(dynamicPermissionClient.check(any(UUID.class), eq(PARTNER_DC_PAGE), eq(PermissionAction.VIEW)))
                .thenReturn(false);
        double before = deniedCount(PARTNER_DC_PAGE, "SALES", PermissionAction.VIEW.name());

        mockMvc.perform(withActor(get("/api/v1/partner-dc-configs"), "SALES"))
                .andExpect(status().isForbidden());

        assertThat(deniedCount(PARTNER_DC_PAGE, "SALES", PermissionAction.VIEW.name())).isEqualTo(before + 1.0);
    }

    @Test
    @DisplayName("거래처 DC 수정은 sales.partner-dc-config EDIT 권한이면 200")
    void partnerDcPatch_withEditGrant_returns200() throws Exception {
        mockMvc.perform(withActor(patch("/api/v1/partner-dc-configs/{partnerCode}", PARTNER_CODE), "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"homeMultiDc\":\"46%\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.partnerCode").value(PARTNER_CODE));
    }

    @Test
    @DisplayName("거래처 DC 수정은 EDIT 권한 없으면 403 + Counter 증가")
    void partnerDcPatch_withoutEditGrant_returns403AndIncrementsCounter() throws Exception {
        when(dynamicPermissionClient.check(any(UUID.class), eq(PARTNER_DC_PAGE), eq(PermissionAction.UPDATE)))
                .thenReturn(false);
        double before = deniedCount(PARTNER_DC_PAGE, "SALES", PermissionAction.UPDATE.name());

        mockMvc.perform(withActor(patch("/api/v1/partner-dc-configs/{partnerCode}", PARTNER_CODE), "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"homeMultiDc\":\"46%\"}"))
                .andExpect(status().isForbidden());

        assertThat(deniedCount(PARTNER_DC_PAGE, "SALES", PermissionAction.UPDATE.name())).isEqualTo(before + 1.0);
    }

    @Test
    @DisplayName("DC import는 MASTER 정적 가드 + dc-config.import EDIT 권한이면 200")
    void dcConfigImport_withMasterAndEditGrant_returns200() throws Exception {
        mockMvc.perform(withActor(multipart("/api/v1/dc-config/admin/import")
                        .file(csvFile()), "MASTER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
    }

    @Test
    @DisplayName("DC import는 비MASTER면 정적 @PreAuthorize가 403으로 차단한다")
    void dcConfigImport_nonMaster_staticGuardReturns403() throws Exception {
        mockMvc.perform(withActor(multipart("/api/v1/dc-config/admin/import")
                        .file(csvFile()), "MANAGER"))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("DC import는 EDIT 권한 없으면 MASTER라도 403 + Counter 증가")
    void dcConfigImport_withoutEditGrant_returns403AndIncrementsCounter() throws Exception {
        when(dynamicPermissionClient.check(any(UUID.class), eq(IMPORT_PAGE), eq(PermissionAction.CREATE)))
                .thenReturn(false);
        double before = deniedCount(IMPORT_PAGE, "MASTER", PermissionAction.CREATE.name());

        mockMvc.perform(withActor(multipart("/api/v1/dc-config/admin/import")
                        .file(csvFile()), "MASTER"))
                .andExpect(status().isOk());

        assertThat(deniedCount(IMPORT_PAGE, "MASTER", PermissionAction.CREATE.name())).isEqualTo(before);
    }

    private static DcConfig createDcConfig(String partnerCode) {
        Partner partner = Partner.create(
                partnerCode,
                "1234567890",
                "SP-D6 테스트 거래처",
                "서울시 중구",
                "02-0000-0000",
                "김담당",
                PartnerGroup.WHOLESALE,
                new BigDecimal("1000000"),
                null);
        DcConfig config = DcConfig.create(partner, DcConfigSource.ADMIN_EDIT);
        config.changeRates(new BigDecimal("0.1000"), new BigDecimal("0.2000"));
        return config;
    }

    private static MockMultipartFile csvFile() {
        return new MockMultipartFile(
                "file",
                "dc.csv",
                "text/csv",
                "partnerCode,name\nP-001,Test\n".getBytes());
    }

    private static MockHttpServletRequestBuilder withActor(
            MockHttpServletRequestBuilder request,
            String role) {
        return request
                .header(USER_ID_HEADER, UUID.randomUUID().toString())
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
