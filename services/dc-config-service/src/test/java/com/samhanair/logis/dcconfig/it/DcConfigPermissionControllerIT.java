package com.samhanair.logis.dcconfig.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.dcconfig.config.HeaderAuthenticationFilter;
import com.samhanair.logis.dcconfig.audit.service.DcConfigAuditLogService;
import com.samhanair.logis.dcconfig.domain.DcConfig;
import com.samhanair.logis.dcconfig.domain.DcConfigSource;
import com.samhanair.logis.dcconfig.domain.EstimateConfig;
import com.samhanair.logis.dcconfig.domain.Partner;
import com.samhanair.logis.dcconfig.domain.PartnerGroup;
import com.samhanair.logis.dcconfig.dto.DcConfigImportResult;
import com.samhanair.logis.dcconfig.repository.DcConfigRepository;
import com.samhanair.logis.dcconfig.service.DcConfigImportService;
import com.samhanair.logis.dcconfig.service.DcConfigService;
import com.samhanair.logis.dcconfig.service.EstimateConfigService;
import com.samhanair.logis.dcconfig.web.DcConfigImportController;
import com.samhanair.logis.dcconfig.web.EstimateConfigController;
import com.samhanair.logis.dcconfig.web.PartnerDcConfigsController;
import com.samhanair.logis.security.HrAuthorizationHelper;
import com.samhanair.logis.security.InternalSecurityAutoConfiguration;
import com.samhanair.logis.security.department.Department;
import com.samhanair.logis.security.department.RequireDepartment;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.PermissionGuardMetrics;
import com.samhanair.logis.security.permission.PermissionSecurityAutoConfiguration;
import com.samhanair.logis.security.permission.RequirePermission;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.lang.reflect.Method;
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
import org.springframework.web.multipart.MultipartFile;
import org.springframework.security.access.prepost.PreAuthorize;
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
                EstimateConfigController.class,
                DcConfigImportController.class
        },
        properties = {
                "spring.application.name=dc-config-service",
                "samhan.security.department.enabled=true"
        })
@Import({
        PermissionSecurityAutoConfiguration.class,
        InternalSecurityAutoConfiguration.class,
        DcConfigPermissionControllerIT.TestSecurityConfig.class,
        DcConfigPermissionControllerIT.TestMeterConfig.class
})
class DcConfigPermissionControllerIT {

    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String ROLE_HEADER = "X-User-Role";
    private static final String DEPARTMENT_HEADER = "X-User-Department";
    /**
     * Phase C5-4: MASTER bypass 는 X-Is-System-Master 헤더로 판정한다.
     * PermissionAspect 가 X-Is-System-Master 헤더 단독 bypass 판정을 사용하므로
     * X-User-Role: MASTER 로는 bypass 되지 않는다.
     */
    private static final String IS_SYSTEM_MASTER_HEADER = "X-Is-System-Master";
    private static final String SERVICE_NAME = "dc-config-service";
    private static final String PARTNER_DC_PAGE = "sales.partner-dc-config";
    private static final String ESTIMATE_CONFIG_PAGE = "sales.estimate-config";
    private static final String IMPORT_PAGE = "dc-config.import";
    private static final String PARTNER_CODE = "P-D6-WEBMVC";

    @Autowired private MockMvc mockMvc;
    @Autowired private MeterRegistry meterRegistry;

    @MockBean private DynamicPermissionClient dynamicPermissionClient;
    @MockBean private DcConfigRepository dcConfigRepository;
    @MockBean private DcConfigService dcConfigService;
    @MockBean private DcConfigAuditLogService dcConfigAuditLogService;
    @MockBean private EstimateConfigService estimateConfigService;
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
        lenient().when(dcConfigService.updatePartnerDcConfig(anyString(), any(), any(), anyString()))
                .thenReturn(dcConfig);
        lenient().when(dcConfigService.getByPartnerCode(anyString()))
                .thenReturn(dcConfig);
        lenient().when(dcConfigAuditLogService.listByEntity(any()))
                .thenReturn(List.of());
        lenient().when(estimateConfigService.getOrSeedDefault())
                .thenReturn(EstimateConfig.defaults());
        lenient().when(estimateConfigService.update(any()))
                .thenReturn(EstimateConfig.defaults());
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
    @DisplayName("전표 가격계산용 거래처 DC 단건 조회는 VIEW 권한이면 200")
    void partnerDcGet_withViewGrant_returnsCalculationFields() throws Exception {
        mockMvc.perform(withActor(get("/api/v1/partner-dc-configs/{partnerCode}", PARTNER_CODE), "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.partnerCode").value(PARTNER_CODE));
    }

    @Test
    @DisplayName("嫄곕옒泥?DC 蹂寃쎌씠?μ? VIEW 沅뚰븳?대㈃ 200")
    void partnerDcAuditGet_withViewGrant_returns200() throws Exception {
        mockMvc.perform(withActor(get("/api/v1/partner-dc-configs/{partnerCode}/audit-logs", PARTNER_CODE), "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
    }

    @Test
    @DisplayName("嫄곕옒泥?DC 蹂寃쎌씠?μ? VIEW 沅뚰븳 ?놁쑝硫?403")
    void partnerDcAuditGet_withoutViewGrant_returns403() throws Exception {
        when(dynamicPermissionClient.check(any(UUID.class), eq(PARTNER_DC_PAGE), eq(PermissionAction.VIEW)))
                .thenReturn(false);

        mockMvc.perform(withActor(get("/api/v1/partner-dc-configs/{partnerCode}/audit-logs", PARTNER_CODE), "SALES"))
                .andExpect(status().isForbidden());
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
    @DisplayName("견적 가격 설정 조회는 VIEW 권한 없으면 403")
    void estimateConfigGet_withoutViewGrant_returns403() throws Exception {
        when(dynamicPermissionClient.check(any(UUID.class), eq(ESTIMATE_CONFIG_PAGE), eq(PermissionAction.VIEW)))
                .thenReturn(false);

        mockMvc.perform(withActor(get("/api/v1/estimate-config"), "SALES"))
                .andExpect(status().isForbidden());

        verify(estimateConfigService, never()).getOrSeedDefault();
    }

    @Test
    @DisplayName("견적 가격 설정 수정은 UPDATE 권한 없으면 403")
    void estimateConfigPut_withoutUpdateGrant_returns403() throws Exception {
        when(dynamicPermissionClient.check(any(UUID.class), eq(ESTIMATE_CONFIG_PAGE), eq(PermissionAction.UPDATE)))
                .thenReturn(false);

        mockMvc.perform(withActor(put("/api/v1/estimate-config"), "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"cardFeeRate\":0.0300}"))
                .andExpect(status().isForbidden());

        verify(estimateConfigService, never()).update(any());
    }

    @Test
    @DisplayName("견적 가격 설정은 X-Is-System-Master=true면 권한 조회 없이 200")
    void estimateConfigGet_systemMasterBypass_returns200() throws Exception {
        mockMvc.perform(withSystemMasterActor(
                        get("/api/v1/estimate-config"),
                        HrAuthorizationHelper.EXECUTIVE_OFFICE_NAME))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.cardFeeRate").value(0.03));

        verify(dynamicPermissionClient, never())
                .check(any(UUID.class), eq(ESTIMATE_CONFIG_PAGE), eq(PermissionAction.VIEW));
    }

    @Test
    @DisplayName("DC import는 대표실 + X-Is-System-Master=true면 200 (MASTER bypass)")
    void dcConfigImport_executiveOfficeSystemMaster_returns200() throws Exception {
        // Phase C5-4: MASTER bypass 는 X-Is-System-Master=true 헤더 단독 판정
        mockMvc.perform(withSystemMasterActor(
                        multipart("/api/v1/dc-config/admin/import").file(csvFile()),
                        HrAuthorizationHelper.EXECUTIVE_OFFICE_NAME))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
    }

    @Test
    @DisplayName("DC import는 비대표실이면 권한 grant가 있어도 부서 게이트가 403으로 차단한다")
    void dcConfigImport_nonExecutiveOffice_returns403BeforePermission() throws Exception {
        when(dynamicPermissionClient.check(any(UUID.class), eq(IMPORT_PAGE), eq(PermissionAction.CREATE)))
                .thenReturn(true);
        double permissionBefore = deniedCount(IMPORT_PAGE, "MASTER", PermissionAction.CREATE.name());
        double departmentBefore = departmentDeniedCount("MASTER");

        mockMvc.perform(withActor(
                        multipart("/api/v1/dc-config/admin/import").file(csvFile()),
                        "MASTER",
                        "영업1팀"))
                .andExpect(status().isForbidden());

        assertThat(deniedCount(IMPORT_PAGE, "MASTER", PermissionAction.CREATE.name()))
                .isEqualTo(permissionBefore);
        assertThat(departmentDeniedCount("MASTER")).isEqualTo(departmentBefore + 1.0);
        verify(dynamicPermissionClient, never())
                .check(any(UUID.class), eq(IMPORT_PAGE), eq(PermissionAction.CREATE));
    }

    @Test
    @DisplayName("DC import는 대표실이어도 dc-config.import CREATE 권한 없으면 403")
    void dcConfigImport_executiveOfficeNonMasterWithoutGrant_returns403() throws Exception {
        when(dynamicPermissionClient.check(any(UUID.class), eq(IMPORT_PAGE), eq(PermissionAction.CREATE)))
                .thenReturn(false);
        double before = deniedCount(IMPORT_PAGE, "MANAGER", PermissionAction.CREATE.name());

        mockMvc.perform(withActor(
                        multipart("/api/v1/dc-config/admin/import").file(csvFile()),
                        "MANAGER",
                        HrAuthorizationHelper.EXECUTIVE_OFFICE_NAME))
                .andExpect(status().isForbidden());

        assertThat(deniedCount(IMPORT_PAGE, "MANAGER", PermissionAction.CREATE.name()))
                .isEqualTo(before + 1.0);
    }

    @Test
    @DisplayName("DC import는 MASTER가 grant한 대표실 비-MASTER면 200")
    void dcConfigImport_executiveOfficeNonMasterWithGrant_returns200() throws Exception {
        when(dynamicPermissionClient.check(any(UUID.class), eq(IMPORT_PAGE), eq(PermissionAction.CREATE)))
                .thenReturn(true);

        mockMvc.perform(withActor(
                        multipart("/api/v1/dc-config/admin/import").file(csvFile()),
                        "MANAGER",
                        HrAuthorizationHelper.EXECUTIVE_OFFICE_NAME))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));

        verify(dynamicPermissionClient)
                .check(any(UUID.class), eq(IMPORT_PAGE), eq(PermissionAction.CREATE));
    }

    @Test
    @DisplayName("DC import는 X-Is-System-Master=true면 dc-config.import 권한 조회 없이 bypass로 200")
    void dcConfigImport_systemMasterHeaderBypassSkipsDynamicPermissionCheck() throws Exception {
        // Phase C5-4: PermissionAspect 는 X-Is-System-Master 헤더 단독 bypass 판정 (X-User-Role:MASTER 제거)
        when(dynamicPermissionClient.check(any(UUID.class), eq(IMPORT_PAGE), eq(PermissionAction.CREATE)))
                .thenReturn(false);
        // 메트릭 레이블은 "UNKNOWN" — MASTER bypass 시 roleCode 가 UNKNOWN 으로 기록됨 (bypass 전 추출)
        double before = deniedCount(IMPORT_PAGE, "UNKNOWN", PermissionAction.CREATE.name());

        mockMvc.perform(withSystemMasterActor(
                        multipart("/api/v1/dc-config/admin/import").file(csvFile()),
                        HrAuthorizationHelper.EXECUTIVE_OFFICE_NAME))
                .andExpect(status().isOk());

        assertThat(deniedCount(IMPORT_PAGE, "UNKNOWN", PermissionAction.CREATE.name())).isEqualTo(before);
        verify(dynamicPermissionClient, never())
                .check(any(UUID.class), eq(IMPORT_PAGE), eq(PermissionAction.CREATE));
    }

    @Test
    @DisplayName("DC import는 @RequireDepartment + @RequirePermission 단일소스이며 @PreAuthorize를 쓰지 않는다")
    void dcConfigImport_usesDepartmentAndPermissionAnnotations() throws Exception {
        Method method = DcConfigImportController.class.getMethod("importCsv", MultipartFile.class);

        RequireDepartment requireDepartment = method.getAnnotation(RequireDepartment.class);
        RequirePermission requirePermission = method.getAnnotation(RequirePermission.class);

        assertThat(requireDepartment).isNotNull();
        assertThat(requireDepartment.value()).isEqualTo(Department.EXECUTIVE_OFFICE);
        assertThat(requirePermission).isNotNull();
        assertThat(requirePermission.page()).isEqualTo(IMPORT_PAGE);
        assertThat(requirePermission.action()).isEqualTo(PermissionAction.CREATE);
        assertThat(method.getAnnotation(PreAuthorize.class)).isNull();
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
        return withActor(request, role, HrAuthorizationHelper.EXECUTIVE_OFFICE_NAME);
    }

    private static MockHttpServletRequestBuilder withActor(
            MockHttpServletRequestBuilder request,
            String role,
            String department) {
        return request
                .header(USER_ID_HEADER, UUID.randomUUID().toString())
                .header(ROLE_HEADER, role)
                .header(DEPARTMENT_HEADER, department);
    }

    /**
     * Phase C5-4: MASTER bypass 전용 헬퍼 — X-Is-System-Master=true 헤더 주입.
     *
     * <p>PermissionAspect 는 C5-4 이후 X-Is-System-Master 헤더 단독 bypass 판정을 사용한다.
     * X-User-Role: MASTER 는 bypass 를 발동시키지 않는다.
     *
     * @param request MockMvc 요청 빌더
     * @param department 부서명 헤더 값
     * @return 시스템 마스터 헤더가 주입된 요청 빌더
     */
    private static MockHttpServletRequestBuilder withSystemMasterActor(
            MockHttpServletRequestBuilder request,
            String department) {
        return request
                .header(USER_ID_HEADER, UUID.randomUUID().toString())
                .header(IS_SYSTEM_MASTER_HEADER, "true")
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

    private double departmentDeniedCount(String role) {
        return meterRegistry.counter(
                PermissionGuardMetrics.COUNTER_NAME,
                "service", SERVICE_NAME,
                "page", "department",
                "role", role,
                "action", Department.EXECUTIVE_OFFICE.name()
        ).count();
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
