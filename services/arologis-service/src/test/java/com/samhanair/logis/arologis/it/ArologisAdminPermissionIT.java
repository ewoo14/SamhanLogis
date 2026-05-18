package com.samhanair.logis.arologis.it;

import static org.mockito.ArgumentMatchers.anyString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.arologis.ArologisServiceApplication;
import com.samhanair.logis.arologis.client.DynamicPermissionClient;
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
 *   <li>C1: DISPATCH canView=true → GET /admin/arologis/regions 200 OK</li>
 *   <li>C2: DISPATCH canView=false → 403 FORBIDDEN</li>
 *   <li>C3: MASTER canEdit=true → POST /admin/arologis/regions checkEdit 통과</li>
 *   <li>C4: DISPATCH canEdit=false + canView=true → POST 403 (view-only override)</li>
 * </ol>
 */
@SpringBootTest(classes = ArologisServiceApplication.class)
@AutoConfigureMockMvc
class ArologisAdminPermissionIT extends AbstractPostgresIT {

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
                .thenReturn(true);
        Mockito.lenient()
                .when(dynamicPermissionClient.canEdit(anyString(), anyString()))
                .thenReturn(true);
    }

    // -------------------------------------------------------------------------
    // C1: DISPATCH canView=true → 200 OK
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C1: DISPATCH arologis.region canView=true → 지역 목록 200 OK")
    @WithMockUser(username = "dispatch-user", authorities = {"ROLE_DISPATCH"})
    void C1_dispatch_canView_true_returns_200() throws Exception {
        mockMvc.perform(get("/admin/arologis/regions")
                        .header("X-User-Role", "DISPATCH"))
                .andExpect(status().isOk());
    }

    // -------------------------------------------------------------------------
    // C2: DISPATCH canView=false → 403
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C2: DISPATCH arologis.region canView=false → 지역 목록 403 FORBIDDEN")
    @WithMockUser(username = "dispatch-denied", authorities = {"ROLE_DISPATCH"})
    void C2_dispatch_canView_false_returns_403() throws Exception {
        Mockito.when(dynamicPermissionClient.canView(anyString(), anyString()))
                .thenReturn(false);

        mockMvc.perform(get("/admin/arologis/regions")
                        .header("X-User-Role", "DISPATCH"))
                .andExpect(status().isForbidden());
    }

    // -------------------------------------------------------------------------
    // C3: MASTER canEdit=true → POST /admin/arologis/regions checkEdit 통과
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C3: MASTER arologis.region canEdit=true → POST checkEdit 통과 (403 아님)")
    @WithMockUser(username = "master-user", authorities = {"ROLE_MASTER"})
    void C3_master_canEdit_true_create_passes() throws Exception {
        mockMvc.perform(post("/admin/arologis/regions")
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"groupName\":\"테스트지역\","
                                + "\"keywords\":\"테스트,지역\","
                                + "\"sortOrder\":999}"))
                .andExpect(status().is(org.hamcrest.Matchers.not(403)));
    }

    // -------------------------------------------------------------------------
    // C4: DISPATCH canEdit=false + canView=true → POST 403 (view-only override)
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C4: DISPATCH canEdit=false + canView=true → POST 지역 등록 403 (view-only override)")
    @WithMockUser(username = "dispatch-viewonly", authorities = {"ROLE_DISPATCH"})
    void C4_dispatch_canEdit_false_canView_true_returns_403() throws Exception {
        Mockito.when(dynamicPermissionClient.canEdit(anyString(), anyString()))
                .thenReturn(false);

        mockMvc.perform(post("/admin/arologis/regions")
                        .header("X-User-Role", "DISPATCH")
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
        mockMvc.perform(get("/admin/arologis/dispatches")
                        .header("X-User-Role", "AROLOGIS_MANAGER")
                        .param("date", "2026-05-18"))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("C6: AROLOGIS_MANAGER arologis.admin canEdit=false + canView=true → auto-match 403")
    @WithMockUser(username = "arologis-manager-viewonly", authorities = {"ROLE_AROLOGIS_MANAGER"})
    void C6_arologis_admin_canEdit_false_canView_true_returns_403() throws Exception {
        Mockito.when(dynamicPermissionClient.canEdit(anyString(), anyString()))
                .thenReturn(false);

        mockMvc.perform(post("/admin/arologis/dispatches/" + java.util.UUID.randomUUID() + "/auto-match")
                        .header("X-User-Role", "AROLOGIS_MANAGER"))
                .andExpect(status().isForbidden());
    }
}
