package com.samhanair.logis.auth.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
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
import com.samhanair.logis.security.permission.PermissionAction;
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
        "eureka.client.enabled=false",
        "eureka.client.register-with-eureka=false",
        "eureka.client.fetch-registry=false",
        "app.security.jwt.secret=test-secret-key-32-chars-min-aaaaaa",
        "app.security.internal.token=test-internal-token"
})
class AuthPermissionMigrationIT extends AbstractPostgresIT {

    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String ROLE_HEADER = "X-User-Role";
    private static final UUID MANAGER_ACCOUNT_ID =
            UUID.fromString("10000000-0000-0000-0000-000000000001");

    @Autowired private MockMvc mockMvc;
    @Autowired private AuthController authController;

    @MockBean private AuthService authService;
    @MockBean private PasswordResetService passwordResetService;
    @MockBean private DynamicPermissionService permissionService;
    @MockBean private DynamicPermissionClient dynamicPermissionClient;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        // P2: check(any,any,any) 기본값 false 로 반전 — MASTER bypass 케이스는 PermissionAspect.isMasterBypass()
        // 에서 joinPoint.proceed() 직행이므로 check() 자체가 호출되지 않는다.
        // 이전 기본값(true)을 사용하면 stub 우선순위에 따라 deny 케이스가 거짓통과할 위험이 있었다.
        // @MockBean DynamicPermissionClient 는 DirectDynamicPermissionClient(auth-service 내부 client) 를 대체한다.
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(false);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(false);
        lenient().when(dynamicPermissionClient.check(any(UUID.class), anyString(), any(PermissionAction.class)))
                .thenReturn(false);

        // MASTER 테스트에서 bypass 이후 서비스 계층 호출이 정상 응답을 반환하도록 stub
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
            String name, String page, PermissionAction action, int expectedStatus, EndpointRequest request) throws Exception {
        mockMvc.perform(withActor(request.builder(), "MASTER"))
                .andExpect(status().is(expectedStatus));
        // MASTER isMasterBypass 로 동적 check() 미호출 실증 — 호출되면 isMasterBypass 가정이 깨진 것
        verify(dynamicPermissionClient, never()).check(any(UUID.class), anyString(), any(PermissionAction.class));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("protectedEndpoints")
    @DisplayName("system.* endpoint는 비MASTER 이고 DynamicPermissionClient deny 이면 403으로 차단한다")
    void systemEndpoint_nonMaster_requirePermissionDenyReturns403(
            String name, String page, PermissionAction action, int expectedStatus, EndpointRequest request) throws Exception {
        // @PreAuthorize(MASTER) 제거 후 @RequirePermission single source 체계로 전환 (SP-D1 preauth-role)
        // setUp() 에서 check(any,any,any)=false 로 기본 설정되어 있으므로 별도 deny stub 불필요.
        // DynamicPermissionClient.check() = false → AccessDeniedException → 403
        mockMvc.perform(withActor(request.builder(), MANAGER_ACCOUNT_ID, "MANAGER"))
                .andExpect(status().isForbidden());
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("protectedEndpoints")
    @DisplayName("system.* endpoint는 MASTER이면 account×7-action grant 없이도 D-PO-05 bypass 로 통과한다")
    void systemEndpoint_masterWithoutMatrixGrant_bypassesDynamicMatrix(
            String name, String page, PermissionAction action, int expectedStatus, EndpointRequest request) throws Exception {
        // setUp() 기본값이 check(any,any,any)=false 이므로 아래 stub은 redundant 하지만 의도 명시 유지
        lenient().when(dynamicPermissionClient.check(any(UUID.class), eq(page), eq(action))).thenReturn(false);
        mockMvc.perform(withActor(request.builder(), "MASTER"))
                .andExpect(status().is(expectedStatus));
        // MASTER bypass 실증 — 위 stub(false)에도 불구하고 check() 미호출이면 bypass 확인
        verify(dynamicPermissionClient, never()).check(any(UUID.class), anyString(), any(PermissionAction.class));
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

    @Test
    @DisplayName("POST /auth/register 는 MASTER이면 CREATE grant 없이도 D-PO-05 bypass 로 200")
    void register_masterWithoutCreateGrant_bypassesDynamicMatrix() throws Exception {
        lenient().when(dynamicPermissionClient.check(
                        any(UUID.class), eq("system.account-admin"), eq(PermissionAction.CREATE)))
                .thenReturn(false);
        mockMvc.perform(withActor(post("/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "loginId": "view-only-user",
                                  "password": "NewPass1!",
                                  "displayName": "조회 전용 사용자",
                                  "role": "SALES"
                                }
                                """), "MASTER"))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("POST /auth/register 는 MASTER bypass 로 200")
    void register_masterBypass_returns200() throws Exception {
        mockMvc.perform(withActor(post("/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "loginId": "edit-user",
                                  "password": "NewPass1!",
                                  "displayName": "편집 가능 사용자",
                                  "role": "SALES"
                                }
                                """), "MASTER"))
                .andExpect(status().isOk());
    }

    private static Stream<Arguments> protectedEndpoints() {
        return Stream.of(
                Arguments.of(
                        "POST /auth/register",
                        "system.account-admin",
                        PermissionAction.CREATE,
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
                        PermissionAction.UPDATE,
                        204,
                        (EndpointRequest) () -> patch("/auth/admin/accounts/{id}/unlock", UUID.randomUUID())),
                Arguments.of(
                        "GET /auth/admin/permissions",
                        "system.permission-admin",
                        PermissionAction.VIEW,
                        200,
                        (EndpointRequest) () -> get("/auth/admin/permissions")),
                Arguments.of(
                        "PUT /auth/admin/permissions",
                        "system.permission-admin",
                        PermissionAction.UPDATE,
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
                        PermissionAction.UPDATE,
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
                        PermissionAction.DELETE,
                        204,
                        (EndpointRequest) () -> delete("/auth/admin/permissions")
                                .param("roleCode", "MANAGER")
                                .param("pageCode", "dashboard.admin"))
        );
    }

    private static MockHttpServletRequestBuilder withActor(
            MockHttpServletRequestBuilder request,
            String role) {
        return withActor(request, UUID.randomUUID(), role);
    }

    private static MockHttpServletRequestBuilder withActor(
            MockHttpServletRequestBuilder request,
            UUID accountId,
            String role) {
        return request
                .header(USER_ID_HEADER, accountId.toString())
                .header(ROLE_HEADER, role);
    }

    private static PermissionDto permissionDto() {
        return new PermissionDto("MANAGER", "dashboard.admin", "대시보드 관리", true, true, true);
    }

    @FunctionalInterface
    private interface EndpointRequest {
        MockHttpServletRequestBuilder builder();
    }
}
