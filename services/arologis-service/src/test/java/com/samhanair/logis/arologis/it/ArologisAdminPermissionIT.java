package com.samhanair.logis.arologis.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.arologis.ArologisServiceApplication;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.arologis.client.NotificationClient;
import com.samhanair.logis.arologis.client.PartnerClient;
import com.samhanair.logis.arologis.client.SlipClient;
import com.samhanair.logis.arologis.client.SlipServiceClient;
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
 * SP-D4 아로로지스 admin 동적 RBAC IT — arologis.region PageCode 이중 가드 검증.
 *
 * <p>케이스 목록:
 * <ol>
 *   <li>C1: AROLOGIS_MANAGER canView=true → GET /admin/arologis/regions 200 OK</li>
 *   <li>C2: AROLOGIS_MANAGER canView=false → 403 FORBIDDEN</li>
 *   <li>C3: AROLOGIS_MASTER → POST /admin/arologis/regions bypass 통과</li>
 *   <li>C4: AROLOGIS_MANAGER canEdit=false → POST 403</li>
 * </ol>
 */
@SpringBootTest(classes = ArologisServiceApplication.class)
@AutoConfigureMockMvc
class ArologisAdminPermissionIT extends AbstractPostgresIT {

    private static final String MASTER_ACCOUNT_ID = "10000000-0000-0000-0000-000000000403";
    private static final String AROLOGIS_MANAGER_ACCOUNT_ID = "10000000-0000-0000-0000-000000000404";

    @Autowired
    private MockMvc mockMvc;

    // ---- 외부 client @MockBean 격리 ----

    @MockBean
    private DynamicPermissionClient dynamicPermissionClient;

    @MockBean
    private PartnerClient partnerClient;

    @MockBean
    private SlipClient slipClient;

    @MockBean
    private NotificationClient notificationClient;

    @MockBean
    private SlipServiceClient slipServiceClient;

    @BeforeEach
    void setupLenientStubs() {
        Mockito.lenient()
                .when(dynamicPermissionClient.canView(anyString(), anyString()))
                .thenReturn(false);
        Mockito.lenient()
                .when(dynamicPermissionClient.canEdit(anyString(), anyString()))
                .thenReturn(false);
    }

    // -------------------------------------------------------------------------
    // C1: AROLOGIS_MANAGER canView=true → 200 OK
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C1: AROLOGIS_MANAGER arologis.region canView=true → 지역 목록 200 OK")
    @WithMockUser(username = "arologis-manager", authorities = {"ROLE_AROLOGIS_MANAGER"})
    void C1_arologisManager_canView_true_returns_200() throws Exception {
        Mockito.when(dynamicPermissionClient.canView(eq("AROLOGIS_MANAGER"), eq("arologis.region")))
                .thenReturn(true);

        mockMvc.perform(get("/admin/arologis/regions")
                        .header("X-User-Id", AROLOGIS_MANAGER_ACCOUNT_ID)
                        .header("X-User-Role", "AROLOGIS_MANAGER"))
                .andExpect(status().isOk());
    }

    // -------------------------------------------------------------------------
    // C2: AROLOGIS_MANAGER canView=false → 403
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C2: AROLOGIS_MANAGER arologis.region canView=false → 지역 목록 403 FORBIDDEN")
    @WithMockUser(username = "arologis-manager-denied", authorities = {"ROLE_AROLOGIS_MANAGER"})
    void C2_arologisManager_canView_false_returns_403() throws Exception {
        mockMvc.perform(get("/admin/arologis/regions")
                        .header("X-User-Id", AROLOGIS_MANAGER_ACCOUNT_ID)
                        .header("X-User-Role", "AROLOGIS_MANAGER"))
                .andExpect(status().isForbidden());
    }

    // -------------------------------------------------------------------------
    // C3: AROLOGIS_MASTER → POST /admin/arologis/regions bypass 통과
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C3: AROLOGIS_MASTER arologis.region.manage → POST bypass 통과 (403 아님)")
    @WithMockUser(username = "arologis-master", authorities = {"ROLE_AROLOGIS_MASTER"})
    void C3_arologisMaster_create_bypasses() throws Exception {
        mockMvc.perform(post("/admin/arologis/regions")
                        .header("X-User-Id", MASTER_ACCOUNT_ID)
                        .header("X-User-Role", "AROLOGIS_MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"groupName\":\"테스트지역\","
                                + "\"keywords\":\"테스트,지역\","
                                + "\"sortOrder\":999}"))
                .andExpect(status().is(org.hamcrest.Matchers.not(403)));
    }

    // -------------------------------------------------------------------------
    // C4: AROLOGIS_MANAGER canEdit=false → POST 403
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C4: AROLOGIS_MANAGER canEdit=false → POST 지역 등록 403")
    @WithMockUser(username = "arologis-manager-viewonly", authorities = {"ROLE_AROLOGIS_MANAGER"})
    void C4_arologisManager_canEdit_false_returns_403() throws Exception {
        mockMvc.perform(post("/admin/arologis/regions")
                        .header("X-User-Id", AROLOGIS_MANAGER_ACCOUNT_ID)
                        .header("X-User-Role", "AROLOGIS_MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"groupName\":\"테스트지역\","
                                + "\"keywords\":\"테스트,지역\","
                                + "\"sortOrder\":999}"))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("C5: AROLOGIS_MANAGER arologis.admin canView=true → 배차 목록 200 OK")
    @WithMockUser(username = "arologis-manager", authorities = {"ROLE_AROLOGIS_MANAGER"})
    void C5_arologis_admin_canView_true_returns_200() throws Exception {
        Mockito.when(dynamicPermissionClient.canView(eq("AROLOGIS_MANAGER"), eq("arologis.dispatch.admin")))
                .thenReturn(true);

        mockMvc.perform(get("/admin/arologis/dispatches")
                        .header("X-User-Id", AROLOGIS_MANAGER_ACCOUNT_ID)
                        .header("X-User-Role", "AROLOGIS_MANAGER")
                        .param("date", "2026-05-18"))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("C6: AROLOGIS_MANAGER arologis.admin canEdit=false → auto-match 403")
    @WithMockUser(username = "arologis-manager-viewonly", authorities = {"ROLE_AROLOGIS_MANAGER"})
    void C6_arologis_admin_canEdit_false_canView_true_returns_403() throws Exception {
        mockMvc.perform(post("/admin/arologis/dispatches/" + java.util.UUID.randomUUID() + "/auto-match")
                        .header("X-User-Id", AROLOGIS_MANAGER_ACCOUNT_ID)
                        .header("X-User-Role", "AROLOGIS_MANAGER"))
                .andExpect(status().isForbidden());
    }
}
