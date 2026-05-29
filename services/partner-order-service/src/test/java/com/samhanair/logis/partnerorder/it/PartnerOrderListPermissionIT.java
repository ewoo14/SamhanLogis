package com.samhanair.logis.partnerorder.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.partnerorder.PartnerOrderServiceApplication;
import com.samhanair.logis.partnerorder.client.DcConfigClient;
import com.samhanair.logis.partnerorder.client.EstimateClient;
import com.samhanair.logis.partnerorder.client.InventoryClient;
import com.samhanair.logis.partnerorder.client.PartnerAuthClient;
import com.samhanair.logis.partnerorder.client.ProductClient;
import com.samhanair.logis.partnerorder.client.SlipServiceClient;
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
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

/**
 * SP-D4 거래처주문 목록 동적 RBAC IT — sales.partner-order.list PageCode 이중 가드 검증.
 *
 * <p>SP-D2 P04 트랩 회귀 방지:
 * {@code @MockBean DynamicPermissionClient} + {@code @BeforeEach lenient stub} 패턴.
 *
 * <p>케이스 목록:
 * <ol>
 *   <li>C1: SALES canView=true → GET /api/v1/partner-orders 200 OK</li>
 *   <li>C2: SALES canView=false → 403 FORBIDDEN</li>
 *   <li>C3: MASTER canEdit=true → POST confirm checkEdit 통과</li>
 *   <li>C4: SALES canEdit=false + canView=true → POST confirm 403 (view-only override)</li>
 * </ol>
 */
@SpringBootTest(classes = PartnerOrderServiceApplication.class)
@AutoConfigureMockMvc
class PartnerOrderListPermissionIT extends AbstractPostgresIT {

    private static final String SALES_ACCOUNT_ID = "10000000-0000-0000-0000-000000000306";
    private static final String MASTER_ACCOUNT_ID = "10000000-0000-0000-0000-000000000307";

    @Autowired
    private MockMvc mockMvc;

    // ---- 외부 client @MockBean 격리 ----

    @MockBean(classes = com.samhanair.logis.security.permission.DynamicPermissionClient.class)
    private DynamicPermissionClient dynamicPermissionClient;

    @MockBean
    private InventoryClient inventoryClient;

    @MockBean
    private ProductClient productClient;

    @MockBean
    private PartnerAuthClient partnerAuthClient;

    @MockBean
    private DcConfigClient dcConfigClient;

    @MockBean
    private SlipServiceClient slipServiceClient;

    @MockBean
    private EstimateClient estimateClient;

    @BeforeEach
    void setupLenientStubs() {
        Mockito.lenient()
                .when(dynamicPermissionClient.canView(anyString(), anyString()))
                .thenReturn(true);
        Mockito.lenient()
                .when(dynamicPermissionClient.canEdit(anyString(), anyString()))
                .thenReturn(true);
        Mockito.lenient()
                .when(dynamicPermissionClient.check(any(UUID.class), anyString(), any(PermissionAction.class)))
                .thenReturn(true);
    }

    // -------------------------------------------------------------------------
    // C1: SALES canView=true → 200 OK
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C1: SALES sales.partner-order.list canView=true → 200 OK")
    @WithMockUser(username = "sales-user", authorities = {"ROLE_SALES"})
    void C1_sales_canView_true_returns_200() throws Exception {
        mockMvc.perform(get("/api/v1/partner-orders")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk());
    }

    // -------------------------------------------------------------------------
    // C2: SALES canView=false → 403
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C2: SALES sales.partner-order.list canView=false → 403 FORBIDDEN")
    @WithMockUser(username = "sales-denied", authorities = {"ROLE_SALES"})
    void C2_sales_canView_false_returns_403() throws Exception {
        Mockito.when(dynamicPermissionClient.check(
                        any(UUID.class), eq("sales.partner-order.list"), eq(PermissionAction.VIEW)))
                .thenReturn(false);

        mockMvc.perform(get("/api/v1/partner-orders")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isForbidden());
    }

    // -------------------------------------------------------------------------
    // C3: MASTER canEdit=true → POST confirm 통과 (checkEdit 통과)
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C3: MASTER sales.partner-order.confirm canEdit=true → checkEdit 통과 (403 아님)")
    @WithMockUser(username = "master-user", authorities = {"ROLE_MASTER"})
    void C3_master_canEdit_true_confirm_passes() throws Exception {
        // confirm 은 POST /{draftId}/confirm — MASTER canEdit=true 이면 403 아님
        mockMvc.perform(post("/api/v1/partner-orders/00000000-0000-0000-0000-000000000001/confirm")
                        .header("X-User-Id", MASTER_ACCOUNT_ID)
                        .header("X-User-Role", "MASTER")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"lines\":[{\"productId\":\"00000000-0000-0000-0000-000000000001\","
                                + "\"categoryKey\":\"wall\",\"quantity\":1}]}"))
                .andExpect(status().is(org.hamcrest.Matchers.not(403)));
    }

    // -------------------------------------------------------------------------
    // C4: SALES canEdit=false + canView=true → POST confirm 403 (view-only override)
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C4: SALES canEdit=false + canView=true → POST confirm 403 (view-only override)")
    @WithMockUser(username = "sales-viewonly", authorities = {"ROLE_SALES"})
    void C4_sales_canEdit_false_canView_true_confirm_403() throws Exception {
        Mockito.when(dynamicPermissionClient.check(
                        any(UUID.class), eq("sales.partner-order.confirm"), eq(PermissionAction.CREATE)))
                .thenReturn(false);
        // canView=true 유지 (lenient 기본값)

        mockMvc.perform(post("/api/v1/partner-orders/00000000-0000-0000-0000-000000000001/confirm")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"lines\":[{\"productId\":\"00000000-0000-0000-0000-000000000001\","
                                + "\"categoryKey\":\"wall\",\"quantity\":1}]}"))
                .andExpect(status().isForbidden());
    }
}
