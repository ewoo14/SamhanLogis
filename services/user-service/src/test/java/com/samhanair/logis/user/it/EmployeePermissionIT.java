package com.samhanair.logis.user.it;

import static org.mockito.ArgumentMatchers.anyString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.user.UserServiceApplication;
import com.samhanair.logis.user.client.AuthClient;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

/**
 * SP-D4 직원 관리 동적 RBAC IT — admin.employees PageCode 이중 가드 검증.
 *
 * <p>케이스 목록:
 * <ol>
 *   <li>C1: MASTER canView=true → GET /users/employees 200 OK</li>
 *   <li>C2: MANAGER canView=false → 403 FORBIDDEN</li>
 *   <li>C3: MASTER canEdit=true → POST /users/employees checkEdit 통과</li>
 *   <li>C4: MANAGER canEdit=false + canView=true → POST 403 (view-only override)</li>
 * </ol>
 */
@SpringBootTest(classes = UserServiceApplication.class)
@AutoConfigureMockMvc
class EmployeePermissionIT extends AbstractPostgresIT {

    @Autowired
    private MockMvc mockMvc;

    // ---- 외부 client @MockBean 격리 ----

    @MockBean(classes = com.samhanair.logis.security.permission.DynamicPermissionClient.class)
    private DynamicPermissionClient dynamicPermissionClient;

    @MockBean
    private AuthClient authClient;

    @BeforeEach
    void setupLenientStubs() {
        Mockito.lenient()
                .when(dynamicPermissionClient.canView(anyString(), anyString()))
                .thenReturn(true);
        Mockito.lenient()
                .when(dynamicPermissionClient.canEdit(anyString(), anyString()))
                .thenReturn(true);
        Mockito.lenient()
                .when(dynamicPermissionClient.check(
                        Mockito.any(UUID.class), Mockito.anyString(), Mockito.any(PermissionAction.class)))
                .thenReturn(true);
    }

    // -------------------------------------------------------------------------
    // C1: MASTER canView=true → 200 OK
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C1: MASTER admin.employees canView=true → 직원 목록 200 OK")
    @WithMockUser(username = "master-user", authorities = {"ROLE_MASTER"})
    void C1_master_canView_true_returns_200() throws Exception {
        mockMvc.perform(get("/users/employees")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000010")
                        .header("X-User-Role", "MASTER"))
                .andExpect(status().isOk());
    }

    // -------------------------------------------------------------------------
    // C2: MANAGER canView=false → 403
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C2: MANAGER admin.employees canView=false → 직원 목록 403 FORBIDDEN")
    @WithMockUser(username = "manager-denied", authorities = {"ROLE_MANAGER"})
    void C2_manager_canView_false_returns_403() throws Exception {
        Mockito.when(dynamicPermissionClient.canView("MANAGER", "admin.employees"))
                .thenReturn(false);

        mockMvc.perform(get("/users/employees")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000020")
                        .header("X-User-Role", "MANAGER"))
                .andExpect(status().isForbidden());
    }

    // -------------------------------------------------------------------------
    // C3: MASTER canEdit=true → POST /users/employees checkEdit 통과
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C3: MASTER admin.employees canEdit=true → POST checkEdit 통과 (403 아님)")
    @WithMockUser(username = "master-user", authorities = {"ROLE_MASTER"})
    void C3_master_canEdit_true_create_passes() throws Exception {
        mockMvc.perform(post("/users/employees")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000010")
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"loginId\":\"test@test.com\","
                                + "\"fullName\":\"테스트직원\","
                                + "\"role\":\"SALES\"}"))
                .andExpect(status().is(org.hamcrest.Matchers.not(403)));
    }

    // -------------------------------------------------------------------------
    // C4: MANAGER canEdit=false + canView=true → POST 403 (view-only override)
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C4: MANAGER canEdit=false + canView=true → POST 직원 생성 403 (view-only override)")
    @WithMockUser(username = "manager-viewonly", authorities = {"ROLE_MANAGER"})
    void C4_manager_canEdit_false_canView_true_returns_403() throws Exception {
        Mockito.when(dynamicPermissionClient.check(
                        Mockito.any(UUID.class), Mockito.eq("admin.employees"), Mockito.eq(PermissionAction.CREATE)))
                .thenReturn(false);

        mockMvc.perform(post("/users/employees")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000020")
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"loginId\":\"test@test.com\","
                                + "\"password\":\"password1\","
                                + "\"fullName\":\"Test Employee\","
                                + "\"position\":\"staff\","
                                + "\"role\":\"SALES\","
                                + "\"departmentId\":\"00000000-0000-0000-0000-000000000001\","
                                + "\"hireDate\":\"2026-05-18\"}"))
                .andExpect(status().isForbidden());
    }
}
