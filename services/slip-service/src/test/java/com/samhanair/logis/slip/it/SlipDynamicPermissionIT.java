package com.samhanair.logis.slip.it;

import static org.mockito.ArgumentMatchers.anyString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.ArologisDispatchClient;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.NotificationChatRoomClient;
import com.samhanair.logis.slip.client.NotificationClient;
import com.samhanair.logis.slip.client.PartnerBlockClient;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
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
 * SP-D3 슬립 동적 RBAC IT — purchases.slip.list / sales.slip.list PageCode 이중 가드 검증.
 *
 * <p>SP-D2 P04 트랩 회귀 방지:
 * {@code @MockBean DynamicPermissionClient} + {@code @BeforeEach lenient stub} 패턴.
 * DynamicPermissionClient 누락 시 Eureka 비활성 → 500 발생 (feedback_it_mockbean_external_clients.md).
 *
 * <p>케이스 목록:
 * <ol>
 *   <li>C1: SALES, sales.slip.list canView=true → GET /slips (OUTBOUND) 200 OK</li>
 *   <li>C2: SALES, sales.slip.list canView=false → 403 FORBIDDEN</li>
 *   <li>C3: WAREHOUSE, purchases.slip.list canView=true → GET /slips (INBOUND) 200 OK</li>
 *   <li>C4: WAREHOUSE, purchases.slip.list canView=false → 403 FORBIDDEN</li>
 *   <li>C5: DynamicPermissionClient RuntimeException → 500 아님 (fallback 통과)</li>
 *   <li>C6: DISPATCH, sales.slip.list 없음 → GET /slips (OUTBOUND) 403</li>
 * </ol>
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
class SlipDynamicPermissionIT extends AbstractPostgresIT {

    private static final String SALES_ACCOUNT_ID = "10000000-0000-0000-0000-000000000333";
    private static final String WAREHOUSE_ACCOUNT_ID = "10000000-0000-0000-0000-000000000334";
    private static final String DISPATCH_ACCOUNT_ID = "10000000-0000-0000-0000-000000000335";

    @Autowired
    private MockMvc mockMvc;

    // ---- 외부 client @MockBean 격리 (feedback_it_mockbean_external_clients.md) ----

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

    /**
     * @BeforeEach lenient stub — 기존 IT 회귀 0건 보장.
     * canView=true / canEdit=true 기본값 (SP-D2 AccountingDynamicPermissionIT 패턴 일관).
     */
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
        Mockito.lenient()
                .when(dynamicPermissionClient.check(
                        org.mockito.ArgumentMatchers.any(java.util.UUID.class),
                        anyString(),
                        org.mockito.ArgumentMatchers.any(com.samhanair.logis.security.permission.PermissionAction.class)))
                .thenReturn(true);
    }

    // -------------------------------------------------------------------------
    // C1: SALES, sales.slip.list canView=true → GET /slips?slipType=OUTBOUND 200
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C1: SALES sales.slip.list canView=true → 출고전표 목록 200 OK")
    @WithMockUser(username = "sales-user", authorities = {"ROLE_SALES"})
    void C1_sales_slip_list_canView_true_returns_200() throws Exception {
        // canView=true (lenient 기본값 사용).
        // SlipSalesAccessGuard 정적 가드 통과를 위해 X-User-Role 헤더 필수 (cycle 3 fix).
        mockMvc.perform(get("/slips")
                        .param("slipType", "OUTBOUND")
                        .param("page", "0")
                        .param("size", "10")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk());
    }

    // -------------------------------------------------------------------------
    // C2: SALES, sales.slip.list canView=false → 403
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C2: SALES sales.slip.list canView=false → 출고전표 목록 403 FORBIDDEN")
    @WithMockUser(username = "sales-user-blocked", authorities = {"ROLE_SALES"})
    void C2_sales_slip_list_canView_false_returns_403() throws Exception {
        // canView=false override — lenient 기본값 덮어씀
        Mockito.when(dynamicPermissionClient.canView(anyString(), anyString()))
                .thenReturn(false);

        // X-User-Role 헤더로 정적 가드 통과 → 동적 가드에서 403 발생 (cycle 3 fix)
        mockMvc.perform(get("/slips")
                        .param("slipType", "OUTBOUND")
                        .param("page", "0")
                        .param("size", "10")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isForbidden());
    }

    // -------------------------------------------------------------------------
    // C3: WAREHOUSE, purchases.slip.list canView=true → GET /slips?slipType=INBOUND 200
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C3: WAREHOUSE purchases.slip.list canView=true → 입고전표 목록 200 OK")
    @WithMockUser(username = "warehouse-user", authorities = {"ROLE_WAREHOUSE"})
    void C3_purchases_slip_list_canView_true_returns_200() throws Exception {
        // canView=true (lenient 기본값 사용).
        // SlipPurchaseAccessGuard 정적 가드 통과를 위해 X-User-Role 헤더 필수 (cycle 3 fix).
        mockMvc.perform(get("/slips")
                        .param("slipType", "INBOUND")
                        .param("page", "0")
                        .param("size", "10")
                        .header("X-User-Id", WAREHOUSE_ACCOUNT_ID)
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk());
    }

    // -------------------------------------------------------------------------
    // C4: WAREHOUSE, purchases.slip.list canView=false → 403
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C4: WAREHOUSE purchases.slip.list canView=false → 입고전표 목록 403 FORBIDDEN")
    @WithMockUser(username = "warehouse-user-blocked", authorities = {"ROLE_WAREHOUSE"})
    void C4_purchases_slip_list_canView_false_returns_403() throws Exception {
        // canView=false override
        Mockito.when(dynamicPermissionClient.canView(anyString(), anyString()))
                .thenReturn(false);

        // X-User-Role 헤더로 정적 가드 통과 → 동적 가드에서 403 발생 (cycle 3 fix)
        mockMvc.perform(get("/slips")
                        .param("slipType", "INBOUND")
                        .param("page", "0")
                        .param("size", "10")
                        .header("X-User-Id", WAREHOUSE_ACCOUNT_ID)
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isForbidden());
    }

    // -------------------------------------------------------------------------
    // C5: DynamicPermissionClient RuntimeException → fallback (500 아님)
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C5: DynamicPermissionClient fallback (canView=false) → 403 FORBIDDEN")
    @WithMockUser(username = "sales-fallback", authorities = {"ROLE_SALES"})
    void C5_dynamic_permission_client_fallback_returns_403() throws Exception {
        // IT 에서 @MockBean 은 DynamicPermissionClientImpl 을 bypass 하므로
        // Impl 의 RuntimeException catch → false 반환 경로를 직접 재현할 수 없음.
        // 대신 DynamicPermissionClientImpl 의 fallback 결과(canView=false) 를 stub 으로 표현:
        //   auth-service 다운 또는 4xx 응답 → Impl 이 false 반환 → checkViewPermission → 403
        Mockito.when(dynamicPermissionClient.canView(anyString(), anyString()))
                .thenReturn(false);

        // fallback 결과 canView=false → checkViewPermission → BusinessException(FORBIDDEN) → 403
        // X-User-Role 헤더로 정적 가드 통과 → 동적 가드에서 fallback 403 (cycle 3 fix)
        mockMvc.perform(get("/slips")
                        .param("slipType", "OUTBOUND")
                        .param("page", "0")
                        .param("size", "10")
                        .header("X-User-Id", SALES_ACCOUNT_ID)
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isForbidden());
    }

    // -------------------------------------------------------------------------
    // C6: DISPATCH, sales.slip.list 없음 → GET /slips?slipType=OUTBOUND 403
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C6: DISPATCH sales.slip.list 권한 없음 → 출고전표 목록 403")
    @WithMockUser(username = "dispatch-user", authorities = {"ROLE_DISPATCH"})
    void C6_dispatch_no_sales_slip_list_returns_403() throws Exception {
        // DISPATCH 는 @PreAuthorize("hasAnyRole('SALES','MANAGER','MASTER')") 에서 이미 차단
        // 동적 RBAC 진입 전 정적 RoleGuard 에서 403 발생 확인
        mockMvc.perform(get("/slips")
                        .param("slipType", "OUTBOUND")
                        .param("page", "0")
                        .param("size", "10")
                        .header("X-User-Id", DISPATCH_ACCOUNT_ID)
                        .header("X-User-Role", "DISPATCH"))
                .andExpect(status().isForbidden());
    }
}
