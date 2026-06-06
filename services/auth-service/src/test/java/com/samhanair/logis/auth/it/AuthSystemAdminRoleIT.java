package com.samhanair.logis.auth.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.samhanair.logis.auth.AuthServiceApplication;
import com.samhanair.logis.auth.service.AuthService;
import com.samhanair.logis.auth.service.PasswordResetService;
import com.samhanair.logis.auth.service.dto.RegisterResponse;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * auth-service system.account-admin / system.password-admin @RequirePermission 단일 경로 IT.
 *
 * <p>대상 엔드포인트:
 * <ul>
 *   <li>{@code POST /auth/register} — @RequirePermission(system.account-admin, CREATE)</li>
 *   <li>{@code PATCH /auth/admin/accounts/{id}/unlock} — @RequirePermission(system.password-admin, UPDATE)</li>
 * </ul>
 *
 * <p>검증 항목:
 * <ol>
 *   <li>MASTER → 200 (@RequirePermission isMasterBypass 통과, dynamicPermissionClient.check() 미호출 실증)</li>
 *   <li>non-MASTER(MANAGER) + check=false → 403 (deny 경로)</li>
 *   <li>non-MASTER(MANAGER) + check=true → 200 (allow 경로)</li>
 * </ol>
 *
 * <p>@PreAuthorize("hasRole('MASTER')") 가 완전 제거되었으므로, non-MASTER + check=true 시
 * 200 이 반환되어야 한다 (widening 0 실증 — seed MASTER-only 이므로 실운영에서 check=true 는 MASTER 만).
 *
 * <p>서비스 계층(AuthService / PasswordResetService)은 @MockBean 으로 격리 — MASTER bypass 이후
 * DB 호출로 인한 500 false-green 방지.
 * DynamicPermissionClient 는 @MockBean 으로 격리 — Eureka/외부 RestClient 비활성.
 */
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
class AuthSystemAdminRoleIT extends AbstractPostgresIT {

    private static final String MASTER_ID  = "b0000000-0000-0000-0000-000000000001";
    private static final String MANAGER_ID = "b0000000-0000-0000-0000-000000000002";

    @Autowired
    private MockMvc mockMvc;

    /** PermissionAspect account 모드 check() stub — DirectDynamicPermissionClient 대체. */
    @MockBean
    private DynamicPermissionClient dynamicPermissionClient;

    /** 서비스 계층 @MockBean 격리 — MASTER bypass 이후 DB 호출 → 500 false-green 방지. */
    @MockBean
    private AuthService authService;

    /** 서비스 계층 @MockBean 격리 — unlock 호출 시 DB 조회 → 500 false-green 방지. */
    @MockBean
    private PasswordResetService passwordResetService;

    @BeforeEach
    void stubServices() {
        // register() → 결정적 200 반환용 RegisterResponse stub
        lenient().when(authService.register(anyString(), anyString(), anyString(), any()))
                .thenReturn(new RegisterResponse("b0000000-0000-0000-0000-000000000099", "new-user", "MANAGER"));

        // unlockAccount() → void, default 동작(no-op) 충분

        // MANAGER → system.account-admin CREATE = false (deny)
        lenient().when(dynamicPermissionClient.check(
                ArgumentMatchers.eq(UUID.fromString(MANAGER_ID)),
                ArgumentMatchers.eq("system.account-admin"),
                ArgumentMatchers.eq(PermissionAction.CREATE)))
                .thenReturn(false);

        // MANAGER → system.password-admin UPDATE = false (deny)
        lenient().when(dynamicPermissionClient.check(
                ArgumentMatchers.eq(UUID.fromString(MANAGER_ID)),
                ArgumentMatchers.eq("system.password-admin"),
                ArgumentMatchers.eq(PermissionAction.UPDATE)))
                .thenReturn(false);
    }

    // -----------------------------------------------------------------------
    // POST /auth/register — @RequirePermission(system.account-admin, CREATE)
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("MASTER → POST /auth/register 200 — PermissionAspect isMasterBypass 통과, check() 미호출 실증")
    void register_masterRole_returns200_andNeverChecks() throws Exception {
        String body = """
                {"loginId":"new-user","password":"Passw0rd!","displayName":"신규직원","role":"MANAGER"}
                """;
        MvcResult result = mockMvc.perform(post("/auth/register")
                        .header("X-User-Id", MASTER_ID)
                        .header("X-User-Role", "MASTER")
                        // Phase C5-4: role=MASTER 폴백 제거 — X-Is-System-Master=true 필수
                        .header("X-Is-System-Master", "true")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andReturn();

        // MASTER isMasterBypass → dynamicPermissionClient.check() 절대 미호출
        verify(dynamicPermissionClient, never()).check(any(UUID.class), anyString(), any(PermissionAction.class));
        assertThat(result.getResponse().getStatus()).isEqualTo(200);
    }

    @Test
    @DisplayName("MANAGER + check=false → POST /auth/register 403")
    void register_managerWithClientDeny_returns403() throws Exception {
        String body = """
                {"loginId":"new-user","password":"Passw0rd!","displayName":"신규직원","role":"MANAGER"}
                """;
        MvcResult result = mockMvc.perform(post("/auth/register")
                        .header("X-User-Id", MANAGER_ID)
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andReturn();

        // PermissionAspect → DynamicPermissionClient.check() = false → AccessDeniedException → 403
        assertThat(result.getResponse().getStatus()).isEqualTo(403);
    }

    @Test
    @DisplayName("MANAGER + check=true → POST /auth/register 200 (widening 0 — non-MASTER allow 허용 시 접근 가능)")
    void register_managerWithClientAllow_returns200() throws Exception {
        // allow stub 재정의 (seed MASTER-only 이므로 실운영에서 비발생, widening 0 경로 검증용)
        lenient().when(dynamicPermissionClient.check(
                ArgumentMatchers.eq(UUID.fromString(MANAGER_ID)),
                ArgumentMatchers.eq("system.account-admin"),
                ArgumentMatchers.eq(PermissionAction.CREATE)))
                .thenReturn(true);

        String body = """
                {"loginId":"new-user","password":"Passw0rd!","displayName":"신규직원","role":"MANAGER"}
                """;
        MvcResult result = mockMvc.perform(post("/auth/register")
                        .header("X-User-Id", MANAGER_ID)
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andReturn();

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
    }

    // -----------------------------------------------------------------------
    // PATCH /auth/admin/accounts/{id}/unlock — @RequirePermission(system.password-admin, UPDATE)
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("MASTER → PATCH /auth/admin/accounts/{id}/unlock 204 — isMasterBypass 통과, check() 미호출 실증")
    void unlock_masterRole_returns204_andNeverChecks() throws Exception {
        UUID targetId = UUID.fromString("b0000000-0000-0000-0000-0000000000ff");
        MvcResult result = mockMvc.perform(patch("/auth/admin/accounts/" + targetId + "/unlock")
                        .header("X-User-Id", MASTER_ID)
                        .header("X-User-Role", "MASTER")
                        // Phase C5-4: role=MASTER 폴백 제거 — X-Is-System-Master=true 필수
                        .header("X-Is-System-Master", "true"))
                .andReturn();

        // MASTER isMasterBypass → dynamicPermissionClient.check() 절대 미호출
        verify(dynamicPermissionClient, never()).check(any(UUID.class), anyString(), any(PermissionAction.class));
        assertThat(result.getResponse().getStatus()).isEqualTo(204);
    }

    @Test
    @DisplayName("MANAGER + check=false → PATCH /auth/admin/accounts/{id}/unlock 403")
    void unlock_managerWithClientDeny_returns403() throws Exception {
        UUID targetId = UUID.fromString("b0000000-0000-0000-0000-0000000000ff");
        MvcResult result = mockMvc.perform(patch("/auth/admin/accounts/" + targetId + "/unlock")
                        .header("X-User-Id", MANAGER_ID)
                        .header("X-User-Role", "MANAGER"))
                .andReturn();

        assertThat(result.getResponse().getStatus()).isEqualTo(403);
    }
}
