package com.samhanair.logis.slip.estimate.it;

import static org.mockito.ArgumentMatchers.anyString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.ArologisDispatchClient;
import com.samhanair.logis.slip.client.DynamicPermissionClient;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.NotificationChatRoomClient;
import com.samhanair.logis.slip.client.NotificationClient;
import com.samhanair.logis.slip.client.PartnerBlockClient;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.it.AbstractPostgresIT;
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
 * SP-D4 견적 동적 RBAC IT — estimates.list PageCode 이중 가드 검증.
 *
 * <p>SP-D2 P04 트랩 회귀 방지:
 * {@code @MockBean DynamicPermissionClient} + {@code @BeforeEach lenient stub} 패턴.
 *
 * <p>케이스 목록:
 * <ol>
 *   <li>C1: SALES, estimates.list canView=true → GET /slips/estimates 200 OK</li>
 *   <li>C2: SALES, estimates.list canView=false → 403 FORBIDDEN</li>
 *   <li>C3: MASTER, estimates.list canEdit=true → POST /slips/estimates 통과 (checkEdit)</li>
 *   <li>C4: SALES, canEdit=false + canView=true → POST 403 (view-only override)</li>
 * </ol>
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
class EstimatePermissionIT extends AbstractPostgresIT {

    @Autowired
    private MockMvc mockMvc;

    // ---- 외부 client @MockBean 격리 ----

    @MockBean
    private DynamicPermissionClient dynamicPermissionClient;

    @MockBean
    private InventoryClient inventoryClient;

    @MockBean
    private ProductClient productClient;

    @MockBean
    private PartnerInternalClient partnerInternalClient;

    @MockBean
    private PartnerBlockClient partnerBlockClient;

    @MockBean
    private NotificationClient notificationClient;

    @MockBean
    private NotificationChatRoomClient notificationChatRoomClient;

    @MockBean
    private ArologisDispatchClient arologisDispatchClient;
    /** SP-08-FU1 — UserInternalClient @MockBean 격리 (ownerFullName graceful fallback). */
    @MockBean
    private UserInternalClient userInternalClient;
    /** SP-08-FU2 P2-2 — WarehouseInternalClient @MockBean 격리. */
    @MockBean
    private WarehouseInternalClient warehouseInternalClient;

    @BeforeEach
    void setupLenientStubs() {
        Mockito.lenient().when(userInternalClient.resolveFullName(org.mockito.ArgumentMatchers.any()))
                .thenReturn(java.util.Optional.of("담당자"));
        Mockito.lenient()
                .when(dynamicPermissionClient.canView(anyString(), anyString()))
                .thenReturn(true);
        Mockito.lenient()
                .when(dynamicPermissionClient.canEdit(anyString(), anyString()))
                .thenReturn(true);
    }

    // -------------------------------------------------------------------------
    // C1: SALES canView=true → GET /slips/estimates 200
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C1: SALES estimates.list canView=true → 견적 목록 200 OK")
    @WithMockUser(username = "sales-user", authorities = {"ROLE_SALES"})
    void C1_sales_canView_true_returns_200() throws Exception {
        mockMvc.perform(get("/slips/estimates")
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk());
    }

    // -------------------------------------------------------------------------
    // C2: SALES canView=false → 403
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C2: SALES estimates.list canView=false → 견적 목록 403 FORBIDDEN")
    @WithMockUser(username = "sales-denied", authorities = {"ROLE_SALES"})
    void C2_sales_canView_false_returns_403() throws Exception {
        Mockito.when(dynamicPermissionClient.canView(anyString(), anyString()))
                .thenReturn(false);

        mockMvc.perform(get("/slips/estimates")
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isForbidden());
    }

    // -------------------------------------------------------------------------
    // C3: MASTER canEdit=true → POST /slips/estimates 201 (checkEdit 통과)
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C3: MASTER estimates.list canEdit=true → 견적 생성 checkEdit 통과")
    @WithMockUser(username = "master-user", authorities = {"ROLE_MASTER"})
    void C3_master_canEdit_true_passes_checkEdit() throws Exception {
        // canEdit=true (lenient 기본값)
        // 실제 서비스 로직 오류로 400 이 발생할 수 있지만, 403 이 아닌 것만 확인
        mockMvc.perform(post("/slips/estimates")
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"partnerId\":\"00000000-0000-0000-0000-000000000001\","
                                + "\"validUntil\":\"2026-12-31\","
                                + "\"lines\":[]}"))
                .andExpect(status().is(org.hamcrest.Matchers.not(403)));
    }

    // -------------------------------------------------------------------------
    // C4: SALES canEdit=false + canView=true → POST 403 (view-only override)
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C4: SALES canEdit=false + canView=true → POST 견적 생성 403 (view-only override)")
    @WithMockUser(username = "sales-viewonly", authorities = {"ROLE_SALES"})
    void C4_sales_canEdit_false_canView_true_returns_403() throws Exception {
        Mockito.when(dynamicPermissionClient.canEdit(anyString(), anyString()))
                .thenReturn(false);
        // canView=true 유지 (lenient 기본값)

        mockMvc.perform(post("/slips/estimates")
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"partnerId\":\"00000000-0000-0000-0000-000000000001\","
                                + "\"validUntil\":\"2026-12-31\","
                                + "\"lines\":[]}"))
                .andExpect(status().isForbidden());
    }
}
