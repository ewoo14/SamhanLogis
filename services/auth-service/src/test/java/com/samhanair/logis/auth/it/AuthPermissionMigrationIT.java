package com.samhanair.logis.auth.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.auth.AuthServiceApplication;
import com.samhanair.logis.auth.web.AuthController;
import com.samhanair.logis.auth.service.AuthService;
import com.samhanair.logis.auth.service.DynamicPermissionService;
import com.samhanair.logis.auth.service.PasswordResetService;
import com.samhanair.logis.auth.service.dto.PermissionDto;
import com.samhanair.logis.auth.service.dto.RegisterResponse;
import com.samhanair.logis.common.security.Role;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionGuardMetrics;
import io.micrometer.core.instrument.MeterRegistry;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.aop.support.AopUtils;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** SP-D6-1 auth-service system.* bootstrap 이중 가드 통합 테스트. */
@SpringBootTest(
        classes = AuthServiceApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.MOCK
)
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "spring.profiles.active=local",
        "eureka.client.enabled=false",
        "eureka.client.register-with-eureka=false",
        "eureka.client.fetch-registry=false",
        "app.security.jwt.secret=test-secret-key-32-chars-min-aaaaaa",
        "app.security.internal.token=test-internal-token"
})
class AuthPermissionMigrationIT {

    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String ROLE_HEADER = "X-User-Role";
    private static final String SERVICE_NAME = "auth-service";

    @Autowired private MockMvc mockMvc;
    @Autowired private MeterRegistry meterRegistry;
    @Autowired private AuthController authController;

    @MockBean private AuthService authService;
    @MockBean private PasswordResetService passwordResetService;
    @MockBean private DynamicPermissionService permissionService;
    @MockBean private DynamicPermissionClient dynamicPermissionClient;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(authService.register(anyString(), anyString(), anyString(), any(Role.class)))
                .thenReturn(new RegisterResponse(UUID.randomUUID().toString(), "new-user", "SALES"));
        lenient().when(permissionService.getPermissionMatrix()).thenReturn(Map.of(
                "MASTER", Map.of("system.permission-admin",
                        new PermissionDto("MASTER", "system.permission-admin", "시스템 권한 관리", true, true, true))));
        lenient().when(permissionService.updatePermission(any(), anyString()))
                .thenReturn(permissionDto());
        lenient().when(permissionService.updatePermissionsBatch(any(), anyString()))
                .thenReturn(List.of(permissionDto()));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("protectedEndpoints")
    @DisplayName("system.* endpoint는 MASTER + 매트릭스 권한이면 통과한다")
    void systemEndpoint_masterWithMatrixGrant_returnsSuccess(
            String name, String page, String action, int expectedStatus, EndpointRequest request) throws Exception {
        mockMvc.perform(withActor(request.builder(), "MASTER"))
                .andExpect(status().is(expectedStatus));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("protectedEndpoints")
    @DisplayName("system.* endpoint는 비MASTER이면 정적 @PreAuthorize가 403으로 차단한다")
    void systemEndpoint_nonMaster_staticGuardReturns403(
            String name, String page, String action, int expectedStatus, EndpointRequest request) throws Exception {
        mockMvc.perform(withActor(request.builder(), "MANAGER"))
                .andExpect(status().isForbidden());
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("protectedEndpoints")
    @DisplayName("system.* endpoint는 MASTER라도 매트릭스 권한이 없으면 403 + Counter 증가")
    void systemEndpoint_masterWithoutMatrixGrant_returns403AndIncrementsCounter(
            String name, String page, String action, int expectedStatus, EndpointRequest request) throws Exception {
        if ("VIEW".equals(action)) {
            when(dynamicPermissionClient.canView("MASTER", page)).thenReturn(false);
        } else {
            when(dynamicPermissionClient.canEdit("MASTER", page)).thenReturn(false);
        }

        double before = deniedCount(page, "MASTER", action);

        mockMvc.perform(withActor(request.builder(), "MASTER"))
                .andExpect(status().isForbidden());

        assertThat(deniedCount(page, "MASTER", action)).isEqualTo(before + 1.0);
    }

    @Test
    @DisplayName("V29 seed는 MASTER system.permission-admin bootstrap row를 포함한다")
    void v29SeedContainsMasterSystemPermissionAdminGrant() throws IOException {
        String sql = new String(new ClassPathResource(
                "db/migration/V29__seed_sp_d6_1_page_codes.sql").getInputStream().readAllBytes(),
                StandardCharsets.UTF_8);

        assertThat(sql)
                .contains("'MASTER', 'system.permission-admin', TRUE, TRUE")
                .contains("'MASTER', 'system.password-admin', TRUE, TRUE")
                .contains("'MASTER', 'system.account-admin', TRUE, TRUE")
                .contains("'MANAGER', 'dashboard.admin', TRUE, TRUE")
                .contains("'SALES', 'sales.partner-dc-config', TRUE, FALSE");
    }

    @Test
    @DisplayName("@RequirePermission AOP proxy가 auth controller에 적용된다")
    void requirePermissionAopProxyApplied() {
        assertThat(AopUtils.isAopProxy(authController)).isTrue();
    }

    private static Stream<Arguments> protectedEndpoints() {
        return Stream.of(
                Arguments.of(
                        "POST /auth/register",
                        "system.account-admin",
                        "VIEW",
                        200,
                        (EndpointRequest) () -> post("/auth/register")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("""
                                        {
                                          "loginId": "new-user",
                                          "password": "NewPass1!",
                                          "displayName": "신규 사용자",
                                          "role": "SALES"
                                        }
                                        """)),
                Arguments.of(
                        "PATCH /auth/admin/accounts/{id}/unlock",
                        "system.password-admin",
                        "EDIT",
                        204,
                        (EndpointRequest) () -> patch("/auth/admin/accounts/{id}/unlock", UUID.randomUUID())),
                Arguments.of(
                        "GET /auth/admin/permissions",
                        "system.permission-admin",
                        "VIEW",
                        200,
                        (EndpointRequest) () -> get("/auth/admin/permissions")),
                Arguments.of(
                        "PUT /auth/admin/permissions",
                        "system.permission-admin",
                        "EDIT",
                        200,
                        (EndpointRequest) () -> put("/auth/admin/permissions")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("""
                                        {
                                          "roleCode": "MANAGER",
                                          "pageCode": "dashboard.admin",
                                          "canView": true,
                                          "canEdit": true
                                        }
                                        """)),
                Arguments.of(
                        "POST /auth/admin/permissions/batch",
                        "system.permission-admin",
                        "EDIT",
                        200,
                        (EndpointRequest) () -> post("/auth/admin/permissions/batch")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("""
                                        {
                                          "permissions": [
                                            {
                                              "roleCode": "MANAGER",
                                              "pageCode": "dashboard.admin",
                                              "canView": true,
                                              "canEdit": true
                                            }
                                          ]
                                        }
                                        """)),
                Arguments.of(
                        "DELETE /auth/admin/permissions",
                        "system.permission-admin",
                        "EDIT",
                        204,
                        (EndpointRequest) () -> delete("/auth/admin/permissions")
                                .param("roleCode", "MANAGER")
                                .param("pageCode", "dashboard.admin"))
        );
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

    private static PermissionDto permissionDto() {
        return new PermissionDto("MANAGER", "dashboard.admin", "대시보드 관리", true, true, true);
    }

    @FunctionalInterface
    private interface EndpointRequest {
        MockHttpServletRequestBuilder builder();
    }
}
