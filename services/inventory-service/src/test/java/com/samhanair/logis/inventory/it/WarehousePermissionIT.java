package com.samhanair.logis.inventory.it;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.inventory.InventoryServiceApplication;
import com.samhanair.logis.inventory.client.AccountingClient;
import com.samhanair.logis.inventory.client.NotificationClient;
import com.samhanair.logis.inventory.client.ProductClient;
import com.samhanair.logis.inventory.client.SlipServiceClient;
import com.samhanair.logis.security.permission.PermissionAction;
import java.util.UUID;
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
 * SP-D4 창고 동적 RBAC IT — inventory.warehouse 조회 / inventory.warehouse.admin 변경 가드 검증.
 *
 * <p>케이스 목록:
 * <ol>
 *   <li>C1: WAREHOUSE canView=true → GET /inventory/warehouses 200 OK</li>
 *   <li>C2: WAREHOUSE canView=false → 403 FORBIDDEN</li>
 *   <li>C3: MASTER inventory.warehouse.admin canEdit=true → POST /inventory/warehouses checkEdit 통과</li>
 *   <li>C4: WAREHOUSE inventory.warehouse.admin canEdit=false + canView=true → POST 403 (view-only override)</li>
 * </ol>
 */
@SpringBootTest(classes = InventoryServiceApplication.class)
@AutoConfigureMockMvc
class WarehousePermissionIT extends AbstractPostgresIT {

    @Autowired
    private MockMvc mockMvc;

    // ---- 외부 client @MockBean 격리 ----

    @MockBean
    private ProductClient productClient;

    @MockBean
    private SlipServiceClient slipServiceClient;

    @MockBean
    private AccountingClient accountingClient;

    @MockBean
    private NotificationClient notificationClient;

    // -------------------------------------------------------------------------
    // C1: WAREHOUSE canView=true → 200 OK
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C1: WAREHOUSE inventory.warehouse canView=true → 창고 목록 200 OK")
    @WithMockUser(username = "warehouse-user", authorities = {"ROLE_WAREHOUSE"})
    void C1_warehouse_canView_true_returns_200() throws Exception {
        mockMvc.perform(get("/inventory/warehouses")
                        .header("X-User-Id", "10000000-0000-0000-0000-000000000215")
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk());
    }

    // -------------------------------------------------------------------------
    // C2: WAREHOUSE canView=false → 403
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C2: WAREHOUSE inventory.warehouse canView=false → 창고 목록 403 FORBIDDEN")
    @WithMockUser(username = "warehouse-denied", authorities = {"ROLE_WAREHOUSE"})
    void C2_warehouse_canView_false_returns_403() throws Exception {
        Mockito.when(dynamicPermissionClient.check(
                        Mockito.any(UUID.class), Mockito.eq("inventory.warehouse"), Mockito.eq(PermissionAction.VIEW)))
                .thenReturn(false);

        mockMvc.perform(get("/inventory/warehouses")
                        .header("X-User-Id", "10000000-0000-0000-0000-000000000216")
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isForbidden());
    }

    // -------------------------------------------------------------------------
    // C3: MASTER inventory.warehouse.admin canEdit=true → POST 창고 생성 checkEdit 통과
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C3: MASTER inventory.warehouse.admin canEdit=true → POST checkEdit 통과 (403 아님)")
    @WithMockUser(username = "master-user", authorities = {"ROLE_MASTER"})
    void C3_master_canEdit_true_create_passes() throws Exception {
        mockMvc.perform(post("/inventory/warehouses")
                        .header("X-User-Id", "10000000-0000-0000-0000-000000000217")
                        .header("X-User-Role", "MASTER")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"WH-TEST\",\"name\":\"테스트창고\",\"type\":\"VEHICLE\"}"))
                .andExpect(status().is(org.hamcrest.Matchers.not(403)));
    }

    // -------------------------------------------------------------------------
    // C4: WAREHOUSE inventory.warehouse.admin canEdit=false + canView=true → POST 403 (view-only override)
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C4: WAREHOUSE canEdit=false + canView=true → POST 창고 생성 403 (view-only override)")
    @WithMockUser(username = "warehouse-viewonly", authorities = {"ROLE_WAREHOUSE"})
    void C4_warehouse_canEdit_false_canView_true_returns_403() throws Exception {
        Mockito.when(dynamicPermissionClient.check(
                        Mockito.any(UUID.class),
                        Mockito.eq("inventory.warehouse.admin"),
                        Mockito.eq(PermissionAction.CREATE)))
                .thenReturn(false);

        mockMvc.perform(post("/inventory/warehouses")
                        .header("X-User-Id", "10000000-0000-0000-0000-000000000218")
                        .header("X-User-Role", "WAREHOUSE")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"WH-TEST\",\"name\":\"테스트창고\",\"type\":\"VEHICLE\"}"))
                .andExpect(status().isForbidden());
    }
}
