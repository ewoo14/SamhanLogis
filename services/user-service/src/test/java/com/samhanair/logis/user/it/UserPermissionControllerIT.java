package com.samhanair.logis.user.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.common.ecount.EcountMig6ImportResult;
import com.samhanair.logis.common.security.Role;
import com.samhanair.logis.security.HrAuthorizationHelper;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.PermissionGuardMetrics;
import com.samhanair.logis.security.permission.PermissionSecurityAutoConfiguration;
import com.samhanair.logis.user.config.HeaderAuthenticationFilter;
import com.samhanair.logis.user.domain.Department;
import com.samhanair.logis.user.domain.Employee;
import com.samhanair.logis.user.repository.EmployeeRepository;
import com.samhanair.logis.user.repository.RoleChangeHistoryRepository;
import com.samhanair.logis.user.service.EcountDepartmentImporter;
import com.samhanair.logis.user.service.EcountEmployeeCardImporter;
import com.samhanair.logis.user.service.EcountEmployeeImporter;
import com.samhanair.logis.user.service.EcountPayrollEmployeeImporter;
import com.samhanair.logis.user.service.EmployeeProvisioningService;
import com.samhanair.logis.user.service.OrgChartService;
import com.samhanair.logis.user.web.AdminUserController;
import com.samhanair.logis.user.web.EcountDepartmentImportController;
import com.samhanair.logis.user.web.EcountEmployeeCardImportController;
import com.samhanair.logis.user.web.EcountEmployeeImportController;
import com.samhanair.logis.user.web.EcountPayrollEmployeeImportController;
import com.samhanair.logis.user.web.EmployeeController;
import com.samhanair.logis.user.web.EmployeePermissionGuard;
import com.samhanair.logis.user.web.dto.AdminUserCreateResponse;
import com.samhanair.logis.user.web.dto.EcountDepartmentImportResult;
import com.samhanair.logis.user.web.dto.EmployeeResponse;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.LocalDate;
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
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** SP-D6-3 user-service @RequirePermission slice 테스트. */
@WebMvcTest(
        controllers = {
                AdminUserController.class,
                EcountDepartmentImportController.class,
                EcountEmployeeImportController.class,
                EcountEmployeeCardImportController.class,
                EcountPayrollEmployeeImportController.class,
                EmployeeController.class
        },
        properties = "spring.application.name=user-service")
@Import({
        PermissionSecurityAutoConfiguration.class,
        UserPermissionControllerIT.TestSecurityConfig.class,
        UserPermissionControllerIT.TestMeterConfig.class
})
class UserPermissionControllerIT {

    private static final String SERVICE_NAME = "user-service";
    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String ROLE_HEADER = "X-User-Role";
    private static final String DEPARTMENT_HEADER = "X-User-Department";
    private static final UUID ID = UUID.fromString("00000000-0000-0000-0000-000000000401");
    private static final UUID DEPARTMENT_ID = UUID.fromString("00000000-0000-0000-0000-000000000402");

    @Autowired private MockMvc mockMvc;
    @Autowired private MeterRegistry meterRegistry;

    @MockBean private DynamicPermissionClient dynamicPermissionClient;
    @MockBean private EmployeeProvisioningService provisioningService;
    @MockBean private EmployeeRepository employeeRepository;
    @MockBean private RoleChangeHistoryRepository roleChangeHistoryRepository;
    @MockBean private EcountDepartmentImporter ecountDepartmentImporter;
    @MockBean private EcountEmployeeImporter ecountEmployeeImporter;
    @MockBean private EcountEmployeeCardImporter ecountEmployeeCardImporter;
    @MockBean private EcountPayrollEmployeeImporter ecountPayrollEmployeeImporter;
    @MockBean private OrgChartService orgChartService;
    @MockBean private EmployeePermissionGuard employeePermissionGuard;
    @MockBean private JpaMetamodelMappingContext jpaMetamodelMappingContext;

    @BeforeEach
    void setUp() {
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.check(any(UUID.class), anyString(), any(PermissionAction.class)))
                .thenReturn(true);

        Department department = Department.create("EXEC", "대표실", 1);
        ReflectionTestUtils.setField(department, "id", DEPARTMENT_ID);
        Employee employee = Employee.create(
                ID, "user01", "홍길동", "팀장", Role.MANAGER, department,
                false, LocalDate.of(2026, 1, 1), "user01@samhan.com", "010-1111-2222");
        EmployeeResponse employeeResponse = EmployeeResponse.from(employee);

        lenient().when(employeeRepository.searchAdmin(any(), any(), any(), any(), any()))
                .thenReturn(new PageImpl<>(List.of(employee), PageRequest.of(0, 20), 1));
        lenient().when(employeeRepository.findAll()).thenReturn(List.of(employee));
        lenient().when(employeeRepository.findById(any())).thenReturn(java.util.Optional.of(employee));
        lenient().when(roleChangeHistoryRepository.findAllByEmployeeIdOrderByCreatedAtDesc(any()))
                .thenReturn(List.of());
        lenient().when(provisioningService.adminCreate(any(), any()))
                .thenReturn(new AdminUserCreateResponse(
                        ID, "newuser01", "신규직원", Role.SALES, DEPARTMENT_ID,
                        "영업팀", "new@samhan.com", "010-1234-5678", "TmpPass01", true));
        lenient().when(provisioningService.adminUpdate(any(), any(), any())).thenReturn(employeeResponse);
        lenient().when(provisioningService.updateRole(any(), any(), any())).thenReturn(employeeResponse);
        lenient().when(provisioningService.updateRole(any(), any(), anyString(), any())).thenReturn(employeeResponse);
        lenient().when(provisioningService.create(any(), any())).thenReturn(employeeResponse);
        lenient().when(provisioningService.update(any(), any(), any())).thenReturn(employeeResponse);
        lenient().when(ecountDepartmentImporter.importCsv(any(), anyString()))
                .thenReturn(new EcountDepartmentImportResult(1, 1, 0, 0, 0, "HASH", List.of()));
        lenient().when(ecountEmployeeImporter.importCsv(any(), anyString())).thenReturn(mig6Result());
        lenient().when(ecountEmployeeCardImporter.importCsv(any(), anyString())).thenReturn(mig6Result());
        lenient().when(ecountPayrollEmployeeImporter.importCsv(any(), anyString())).thenReturn(mig6Result());
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
        if ("MASTER".equals(endpoint.role())) {
            return;
        }
        when(dynamicPermissionClient.check(any(UUID.class), eq(endpoint.page()), eq(endpoint.action())))
                .thenReturn(false);
        double before = deniedCount(endpoint.page(), endpoint.role(), endpoint.action().name());

        mockMvc.perform(withActor(endpoint.request().get(), endpoint.role()))
                .andExpect(status().isForbidden());

        assertThat(deniedCount(endpoint.page(), endpoint.role(), endpoint.action().name())).isEqualTo(before + 1.0);
    }

    static Stream<EndpointCase> endpoints() {
        return Stream.of(
                new EndpointCase("admin user list", "admin.users", PermissionAction.VIEW, "MANAGER", 200,
                        () -> get("/api/v1/admin/users")),
                new EndpointCase("admin user roles", "admin.users", PermissionAction.VIEW, "MANAGER", 200,
                        () -> get("/api/v1/admin/users/roles")),
                new EndpointCase("admin user create", "admin.users", PermissionAction.CREATE, "MANAGER", 201,
                        () -> post("/api/v1/admin/users")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(adminCreateBody())),
                new EndpointCase("admin user update", "admin.users", PermissionAction.UPDATE, "MANAGER", 200,
                        () -> patch("/api/v1/admin/users/{id}", ID)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(adminUpdateBody())),
                new EndpointCase("admin user role", "admin.users", PermissionAction.UPDATE, "MANAGER", 200,
                        () -> patch("/api/v1/admin/users/{id}/role", ID)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"newRole\":\"MANAGER\",\"reason\":\"승진\"}")),
                new EndpointCase("admin user disable", "admin.users", PermissionAction.DELETE, "MANAGER", 204,
                        () -> post("/api/v1/admin/users/{id}/disable", ID)),
                new EndpointCase("admin user unlock", "admin.users", PermissionAction.UPDATE, "MANAGER", 204,
                        () -> post("/api/v1/admin/users/{id}/unlock", ID)),
                new EndpointCase("admin role history", "admin.users", PermissionAction.VIEW, "MANAGER", 200,
                        () -> get("/api/v1/admin/users/{id}/role-history", ID)),
                new EndpointCase("department import", "ecount.mig2.department", PermissionAction.CREATE, "MANAGER", 200,
                        () -> multipart("/admin/departments/imports/ecount").file(csv())),
                new EndpointCase("employee import", "ecount.mig6.employee", PermissionAction.CREATE, "MANAGER", 200,
                        () -> multipart("/admin/user/employees/imports/ecount").file(csv())),
                new EndpointCase("employee-card import", "ecount.mig6.employee-card", PermissionAction.CREATE, "MANAGER", 200,
                        () -> multipart("/admin/user/employee-cards/imports/ecount").file(csv())),
                new EndpointCase("payroll employee import", "ecount.mig6.payroll-employee", PermissionAction.CREATE, "MANAGER", 200,
                        () -> multipart("/admin/user/payroll-employees/imports/ecount").file(csv())),
                new EndpointCase("employee create", "admin.employees", PermissionAction.CREATE, "MANAGER", 201,
                        () -> post("/users/employees")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(employeeCreateBody())),
                new EndpointCase("employee update", "admin.employees", PermissionAction.UPDATE, "MANAGER", 200,
                        () -> patch("/users/employees/{id}", ID)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"fullName\":\"수정\"}")),
                new EndpointCase("employee role", "admin.employees", PermissionAction.UPDATE, "MASTER", 200,
                        () -> patch("/users/employees/{id}/role", ID)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"role\":\"MANAGER\",\"reason\":\"승진\"}")),
                new EndpointCase("employee terminate", "admin.employees", PermissionAction.DELETE, "MASTER", 204,
                        () -> post("/users/employees/{id}/terminate", ID)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"terminationDate\":\"2026-05-26\"}"))
        );
    }

    private static String adminCreateBody() {
        return """
                {"loginId":"newuser01","fullName":"신규직원","email":"new@samhan.com","role":"SALES","departmentId":"00000000-0000-0000-0000-000000000402","phoneNumber":"010-1234-5678"}
                """;
    }

    private static String adminUpdateBody() {
        return """
                {"fullName":"수정","email":"update@samhan.com","phoneNumber":"010-9999-0000","departmentId":"00000000-0000-0000-0000-000000000402"}
                """;
    }

    private static String employeeCreateBody() {
        return """
                {"loginId":"emp01","password":"password1","fullName":"직원","position":"사원","role":"SALES","departmentId":"00000000-0000-0000-0000-000000000402","teamLead":false,"hireDate":"2026-01-01","email":"emp@samhan.com","phone":"010-1111-2222"}
                """;
    }

    private static MockMultipartFile csv() {
        return new MockMultipartFile("file", "sample.csv", "text/csv", "x".getBytes());
    }

    private static EcountMig6ImportResult mig6Result() {
        return new EcountMig6ImportResult(1, 1, 0, 0, 0, "HASH", List.of());
    }

    private static MockHttpServletRequestBuilder withActor(MockHttpServletRequestBuilder request, String role) {
        return request
                .header(USER_ID_HEADER, UUID.randomUUID().toString())
                .header(ROLE_HEADER, role)
                .header(DEPARTMENT_HEADER, "대표실");
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
