package com.samhanair.logis.partner.it;

import static org.mockito.ArgumentMatchers.anyString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.partner.PartnerServiceApplication;
import com.samhanair.logis.partner.client.DynamicPermissionClient;
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
 * SP-D4 거래처 admin 동적 RBAC IT — partners.list PageCode 이중 가드 검증.
 *
 * <p>케이스 목록:
 * <ol>
 *   <li>C1: SALES canView=true → GET /admin/partners 200 OK</li>
 *   <li>C2: SALES canView=false → 403 FORBIDDEN</li>
 *   <li>C3: MASTER canEdit=true → POST /admin/partners checkEdit 통과</li>
 *   <li>C4: SALES canEdit=false + canView=true → POST 403 (view-only override)</li>
 *   <li>C5: SALES partners.block canView=false → GET 403</li>
 * </ol>
 */
@SpringBootTest(classes = PartnerServiceApplication.class)
@AutoConfigureMockMvc
class PartnerAdminPermissionIT extends AbstractPostgresIT {

    @Autowired
    private MockMvc mockMvc;

    // ---- 외부 client @MockBean 격리 ----

    @MockBean
    private DynamicPermissionClient dynamicPermissionClient;

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
    // C1: SALES canView=true → 200 OK
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C1: SALES partners.list canView=true → 거래처 목록 200 OK")
    @WithMockUser(username = "sales-user", authorities = {"ROLE_SALES"})
    void C1_sales_canView_true_returns_200() throws Exception {
        mockMvc.perform(get("/admin/partners")
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk());
    }

    // -------------------------------------------------------------------------
    // C2: SALES canView=false → 403
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C2: SALES partners.list canView=false → 거래처 목록 403 FORBIDDEN")
    @WithMockUser(username = "sales-denied", authorities = {"ROLE_SALES"})
    void C2_sales_canView_false_returns_403() throws Exception {
        Mockito.when(dynamicPermissionClient.canView(anyString(), anyString()))
                .thenReturn(false);

        mockMvc.perform(get("/admin/partners")
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isForbidden());
    }

    // -------------------------------------------------------------------------
    // C3: MASTER canEdit=true → POST /admin/partners checkEdit 통과
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C3: MASTER partners.list canEdit=true → POST checkEdit 통과 (403 아님)")
    @WithMockUser(username = "master-user", authorities = {"ROLE_MASTER"})
    void C3_master_canEdit_true_create_passes() throws Exception {
        mockMvc.perform(post("/admin/partners")
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"partnerCode\":\"P-TEST\","
                                + "\"name\":\"테스트거래처\","
                                + "\"bizNo\":\"123-45-67890\"}"))
                .andExpect(status().is(org.hamcrest.Matchers.not(403)));
    }

    // -------------------------------------------------------------------------
    // C4: SALES canEdit=false + canView=true → POST 403 (view-only override)
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C4: SALES canEdit=false + canView=true → POST 거래처 등록 403 (view-only override)")
    @WithMockUser(username = "sales-viewonly", authorities = {"ROLE_SALES"})
    void C4_sales_canEdit_false_canView_true_returns_403() throws Exception {
        Mockito.when(dynamicPermissionClient.canEdit(anyString(), anyString()))
                .thenReturn(false);

        mockMvc.perform(post("/admin/partners")
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"partnerCode\":\"P-TEST\","
                                + "\"name\":\"테스트거래처\","
                                + "\"bizNo\":\"123-45-67890\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("C5: SALES partners.block canView=false → BLOCK 목록 403")
    @WithMockUser(username = "sales-block-denied", authorities = {"ROLE_SALES"})
    void C5_sales_partners_block_canView_false_returns_403() throws Exception {
        Mockito.when(dynamicPermissionClient.canView(anyString(), anyString()))
                .thenReturn(false);

        mockMvc.perform(get("/api/v1/partners/admin/blocks")
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isForbidden());
    }
}
