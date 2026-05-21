package com.samhanair.logis.product.it;

import static org.mockito.ArgumentMatchers.anyString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.product.ProductServiceApplication;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.product.client.GoogleSheetsClient;
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
 * SP-D4 상품 동적 RBAC IT — products.list PageCode 이중 가드 검증.
 *
 * <p>케이스 목록:
 * <ol>
 *   <li>C1: SALES canView=true → GET /products 200 OK</li>
 *   <li>C2: DISPATCH canView=false → 403 FORBIDDEN</li>
 *   <li>C3: MASTER canEdit=true → POST /products checkEdit 통과</li>
 *   <li>C4: SALES canEdit=false + canView=true → POST 403 (view-only override)</li>
 * </ol>
 */
@SpringBootTest(classes = ProductServiceApplication.class)
@AutoConfigureMockMvc
class ProductPermissionIT extends AbstractPostgresIT {

    @Autowired
    private MockMvc mockMvc;

    // ---- 외부 client @MockBean 격리 ----

    @MockBean
    private DynamicPermissionClient dynamicPermissionClient;

    @MockBean
    private GoogleSheetsClient googleSheetsClient;

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
    @DisplayName("C1: SALES products.list canView=true → 상품 목록 200 OK")
    @WithMockUser(username = "sales-user", authorities = {"ROLE_SALES"})
    void C1_sales_canView_true_returns_200() throws Exception {
        mockMvc.perform(get("/products")
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk());
    }

    // -------------------------------------------------------------------------
    // C2: DISPATCH canView=false → 403
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C2: DISPATCH products.list canView=false → 상품 목록 403 FORBIDDEN")
    @WithMockUser(username = "dispatch-denied", authorities = {"ROLE_DISPATCH"})
    void C2_dispatch_canView_false_returns_403() throws Exception {
        Mockito.when(dynamicPermissionClient.canView(anyString(), anyString()))
                .thenReturn(false);

        mockMvc.perform(get("/products")
                        .header("X-User-Role", "DISPATCH"))
                .andExpect(status().isForbidden());
    }

    // -------------------------------------------------------------------------
    // C3: MASTER canEdit=true → POST /products checkEdit 통과
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C3: MASTER products.admin canEdit=true → POST checkEdit 통과 (403 아님)")
    @WithMockUser(username = "master-user", authorities = {"ROLE_MASTER"})
    void C3_master_canEdit_true_create_passes() throws Exception {
        mockMvc.perform(post("/products")
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"modelName\":\"TEST-MODEL\","
                                + "\"description\":\"테스트상품\","
                                + "\"salePrice\":10000}"))
                .andExpect(status().is(org.hamcrest.Matchers.not(403)));
    }

    // -------------------------------------------------------------------------
    // C4: SALES canEdit=false + canView=true → POST 403 (view-only override)
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C4: SALES canEdit=false + canView=true → POST 상품 생성 403 (view-only override)")
    @WithMockUser(username = "sales-viewonly", authorities = {"ROLE_SALES"})
    void C4_sales_canEdit_false_canView_true_returns_403() throws Exception {
        Mockito.when(dynamicPermissionClient.canEdit(anyString(), anyString()))
                .thenReturn(false);
        Mockito.when(dynamicPermissionClient.canView(anyString(), anyString()))
                .thenReturn(true);

        mockMvc.perform(post("/products")
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"modelName\":\"TEST-MODEL\","
                                + "\"name\":\"Test Product\","
                                + "\"categoryId\":\"00000000-0000-0000-0000-000000000001\","
                                + "\"sellingPrice\":10000,"
                                + "\"purchasePrice\":8000,"
                                + "\"description\":\"Test Product\","
                                + "\"currency\":\"KRW\"}"))
                .andExpect(status().isForbidden());
    }
}
