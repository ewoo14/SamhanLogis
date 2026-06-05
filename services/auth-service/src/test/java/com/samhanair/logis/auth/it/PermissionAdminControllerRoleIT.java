package com.samhanair.logis.auth.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import com.samhanair.logis.auth.AuthServiceApplication;
import com.samhanair.logis.auth.service.AccountPermissionService;
import com.samhanair.logis.auth.service.DynamicPermissionService;
import com.samhanair.logis.auth.service.dto.PermissionDto;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import java.util.List;
import java.util.Map;
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
 *   <li>MASTER → PUT /auth/admin/permissions 200</li>
 *   <li>non-MASTER(SALES) → PUT /auth/admin/permissions/batch 403</li>
 * </ul>
 *
 * <p>DynamicPermissionClient 는 @MockBean 으로 격리 — Eureka/외부 RestClient 비활성.
 * account 모드(기본값)에서 UUID 기반 check() 를 stub 하여 grant/deny 양쪽 경로를 검증한다.
 *
 * <p>DynamicPermissionService / AccountPermissionService 도 @MockBean 으로 격리.
 * 이들을 mock 하지 않으면 MASTER bypass 이후 서비스 계층 DB 호출이 Testcontainers seed 상태에
 * 따라 500 을 반환할 수 있으므로(false-green 방지), 서비스 계층을 완전히 격리하여 200 결정성을 확보한다.
 * (auth-service 내부 DirectDynamicPermissionClient 는 DynamicPermissionService 와
 * AccountPermissionService 에 직접 위임하므로 양쪽 @MockBean 이 DirectDynamicPermissionClient 도 대체한다.)
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

    // PermissionAspect 의 account 모드 check() 를 stub — DirectDynamicPermissionClient 대체
    @MockBean
    private DynamicPermissionClient dynamicPermissionClient;

    // 서비스 계층 @MockBean 격리 — MASTER bypass 이후 DB 호출 → 500 false-green 방지
    @MockBean
    private DynamicPermissionService dynamicPermissionService;

    @MockBean
    private AccountPermissionService accountPermissionService;

    @BeforeEach
    void stubClient() {
        // GET 케이스: getPermissionMatrix() → 빈 Map 반환 (200 결정적)
        lenient().when(dynamicPermissionService.getPermissionMatrix())
                .thenReturn(Map.of());

        // GET /accounts 케이스: listAccounts() → 빈 List 반환 (200 결정적)
        lenient().when(accountPermissionService.listAccounts())
                .thenReturn(List.of());

        // PUT 케이스: updatePermission() → 유효한 PermissionDto 반환 (200 결정적)
        lenient().when(dynamicPermissionService.updatePermission(any(), anyString()))
                .thenReturn(new PermissionDto("SALES", "accounting.journals", "분개장", true, false, true));

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

        // MASTER bypass 로 동적 check() 미호출 실증 — isMasterBypass 가정 검증
        verify(dynamicPermissionClient, never()).check(any(UUID.class), anyString(), any(PermissionAction.class));
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
    @DisplayName("MASTER → PUT /auth/admin/permissions 200 (단일 갱신 UPDATE bypass — isMasterBypass check 미호출 실증)")
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

        // MASTER bypass → 동적 check() 미호출 실증 (isMasterBypass 이후 joinPoint.proceed() 직행)
        verify(dynamicPermissionClient, never()).check(any(UUID.class), anyString(), any(PermissionAction.class));
        // 500 거짓통과 차단 — isEqualTo(200) 고정
        assertThat(result.getResponse().getStatus()).isEqualTo(200);
    }

    // -----------------------------------------------------------------------
    // MASTER bypass — GET /accounts
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("MASTER → GET /auth/admin/permissions/accounts 200 — isMasterBypass check 미호출 실증")
    void getAccounts_masterRole_returns200() throws Exception {
        MvcResult result = mockMvc.perform(get("/auth/admin/permissions/accounts")
                        .header("X-User-Id", MASTER_ID)
                        .header("X-User-Role", "MASTER"))
                .andReturn();

        // MASTER bypass → 동적 check() 미호출 실증
        verify(dynamicPermissionClient, never()).check(any(UUID.class), anyString(), any(PermissionAction.class));
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
