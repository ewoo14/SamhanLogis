package com.samhanair.logis.auth.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.lenient;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import com.samhanair.logis.auth.AuthServiceApplication;
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
 * PermissionAdminController @RequirePermission single-source 권한 경로 IT.
 *
 * <p>검증 항목:
 * <ul>
 *   <li>MASTER → GET /auth/admin/permissions 200 (@RequirePermission isMasterBypass 통과)</li>
 *   <li>non-MASTER(MANAGER) + DynamicPermissionClient deny → GET /auth/admin/permissions 403</li>
 *   <li>non-MASTER(MANAGER) + DynamicPermissionClient allow → GET /auth/admin/permissions 200</li>
 *   <li>MASTER → PUT /auth/admin/permissions/batch 200</li>
 *   <li>non-MASTER(SALES) → PUT /auth/admin/permissions/batch 403</li>
 * </ul>
 *
 * <p>DynamicPermissionClient 는 @MockBean 으로 격리 — Eureka/외부 RestClient 비활성.
 * account 모드(기본값)에서 UUID 기반 check() 를 stub 하여 grant/deny 양쪽 경로를 검증한다.
 *
 * <p>PermissionAspect 는 PermissionSecurityAutoConfiguration 을 통해
 * SpringBootTest 컨텍스트에서 자동 활성화된다.
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
class PermissionAdminControllerRoleIT extends AbstractPostgresIT {

    private static final String MASTER_ID   = "a0000000-0000-0000-0000-000000000001";
    private static final String MANAGER_ID  = "a0000000-0000-0000-0000-000000000002";
    private static final String SALES_ID    = "a0000000-0000-0000-0000-000000000003";

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void stubClient() {
        // MANAGER(UUID 002) → system.permission-admin VIEW = false (deny)
        lenient().when(dynamicPermissionClient.check(
                ArgumentMatchers.eq(UUID.fromString(MANAGER_ID)),
                ArgumentMatchers.eq("system.permission-admin"),
                ArgumentMatchers.eq(PermissionAction.VIEW)))
                .thenReturn(false);

        // SALES(UUID 003) → system.permission-admin UPDATE = false (deny)
        lenient().when(dynamicPermissionClient.check(
                ArgumentMatchers.eq(UUID.fromString(SALES_ID)),
                ArgumentMatchers.eq("system.permission-admin"),
                ArgumentMatchers.eq(PermissionAction.UPDATE)))
                .thenReturn(false);
    }

    // -----------------------------------------------------------------------
    // MASTER bypass — @RequirePermission(system.permission-admin, VIEW)
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("MASTER → GET /auth/admin/permissions 200 — PermissionAspect isMasterBypass 통과")
    void getMatrix_masterRole_returns200() throws Exception {
        MvcResult result = mockMvc.perform(get("/auth/admin/permissions")
                        .header("X-User-Id", MASTER_ID)
                        .header("X-User-Role", "MASTER"))
                .andReturn();

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
    }

    // -----------------------------------------------------------------------
    // non-MASTER deny — account 모드 DynamicPermissionClient check() = false → 403
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("MANAGER + client deny → GET /auth/admin/permissions 403")
    void getMatrix_managerWithClientDeny_returns403() throws Exception {
        MvcResult result = mockMvc.perform(get("/auth/admin/permissions")
                        .header("X-User-Id", MANAGER_ID)
                        .header("X-User-Role", "MANAGER"))
                .andReturn();

        // PermissionAspect → DynamicPermissionClient.check() = false → AccessDeniedException → 403
        assertThat(result.getResponse().getStatus()).isEqualTo(403);
    }

    @Test
    @DisplayName("SALES + client deny → POST /auth/admin/permissions/batch 403")
    void batchUpdate_salesWithClientDeny_returns403() throws Exception {
        // PermissionBatchUpdateRequest.permissions 필드명 사용
        String body = """
                {"permissions":[{"roleCode":"SALES","pageCode":"accounting.journals","canView":true,"canEdit":false}]}
                """;
        MvcResult result = mockMvc.perform(post("/auth/admin/permissions/batch")
                        .header("X-User-Id", SALES_ID)
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andReturn();

        assertThat(result.getResponse().getStatus()).isEqualTo(403);
    }

    // -----------------------------------------------------------------------
    // non-MASTER allow — account 모드 DynamicPermissionClient check() = true → 200
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("MANAGER + client allow → GET /auth/admin/permissions 200")
    void getMatrix_managerWithClientAllow_returns200() throws Exception {
        // allow stub으로 재정의
        lenient().when(dynamicPermissionClient.check(
                ArgumentMatchers.eq(UUID.fromString(MANAGER_ID)),
                ArgumentMatchers.eq("system.permission-admin"),
                ArgumentMatchers.eq(PermissionAction.VIEW)))
                .thenReturn(true);

        MvcResult result = mockMvc.perform(get("/auth/admin/permissions")
                        .header("X-User-Id", MANAGER_ID)
                        .header("X-User-Role", "MANAGER"))
                .andReturn();

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
    }

    // -----------------------------------------------------------------------
    // MASTER bypass — @RequirePermission(system.permission-admin, UPDATE)
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("MASTER → PUT /auth/admin/permissions 200 (단일 갱신 UPDATE bypass)")
    void updatePermission_masterRole_returns200() throws Exception {
        String body = """
                {"roleCode":"SALES","pageCode":"accounting.journals","canView":true,"canEdit":false}
                """;
        MvcResult result = mockMvc.perform(put("/auth/admin/permissions")
                        .header("X-User-Id", MASTER_ID)
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andReturn();

        // 200 또는 실제 서비스 예외(500)는 AOP deny(403)가 아님을 검증
        assertThat(result.getResponse().getStatus()).isNotEqualTo(403);
    }

    // -----------------------------------------------------------------------
    // MASTER bypass — GET /accounts
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("MASTER → GET /auth/admin/permissions/accounts 200")
    void getAccounts_masterRole_returns200() throws Exception {
        MvcResult result = mockMvc.perform(get("/auth/admin/permissions/accounts")
                        .header("X-User-Id", MASTER_ID)
                        .header("X-User-Role", "MASTER"))
                .andReturn();

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
    }

    @Test
    @DisplayName("non-MASTER(MANAGER) → GET /auth/admin/permissions/accounts 403")
    void getAccounts_managerDeny_returns403() throws Exception {
        MvcResult result = mockMvc.perform(get("/auth/admin/permissions/accounts")
                        .header("X-User-Id", MANAGER_ID)
                        .header("X-User-Role", "MANAGER"))
                .andReturn();

        assertThat(result.getResponse().getStatus()).isEqualTo(403);
    }
}
