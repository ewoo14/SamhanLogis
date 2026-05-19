package com.samhanair.logis.slip.it.dispatch;

import static org.mockito.ArgumentMatchers.anyString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
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
import com.samhanair.logis.slip.delivery.sms.SmsGateway;
import com.samhanair.logis.slip.it.AbstractPostgresIT;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

/**
 * 배차 메뉴 좌측 패널 (미배차 출고전표 페이지네이션) IT — BE Task B11.
 *
 * <p>SP-D3 @MockBean DynamicPermissionClient — feedback_it_mockbean_external_clients.md 의무.
 * canView/canEdit=true 기본 stub 으로 기존 테스트 회귀 방지.
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@WithMockUser(username = "ewoo", authorities = {"ROLE_MASTER"})
class DispatchBoardAdminControllerIT extends AbstractPostgresIT {

    @Autowired MockMvc mvc;

    // 외부 client @MockBean — [feedback_it_mockbean_external_clients]
    /** SP-D3 핵심 @MockBean — DynamicPermissionClient 누락 시 Eureka 호출 → 500 트랩 */
    @MockBean DynamicPermissionClient dynamicPermissionClient;
    @MockBean ArologisDispatchClient arologisDispatchClient;
    @MockBean NotificationClient notificationClient;
    @MockBean NotificationChatRoomClient notificationChatRoomClient;
    @MockBean InventoryClient inventoryClient;
    @MockBean ProductClient productClient;
    @MockBean PartnerBlockClient partnerBlockClient;
    @MockBean PartnerInternalClient partnerInternalClient;
    @MockBean SmsGateway smsGateway;
    /** SP-08-FU1 — UserInternalClient @MockBean 격리 (ownerFullName graceful fallback). */
    @MockBean UserInternalClient userInternalClient;

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

    @Test
    void GET_undispatched_slips_returns_empty_page_with_defaults() throws Exception {
        mvc.perform(get("/admin/dispatch-board/undispatched-slips"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isArray())
                .andExpect(jsonPath("$.size").value(50));
    }

    @Test
    @WithMockUser(username = "dispatcher", authorities = {"ROLE_DISPATCH"})
    void GET_undispatched_slips_allows_dispatch_role() throws Exception {
        mvc.perform(get("/admin/dispatch-board/undispatched-slips"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isArray());
    }

    @Test
    @WithMockUser(username = "sales", authorities = {"ROLE_SALES"})
    void GET_undispatched_slips_rejects_sales_role() throws Exception {
        mvc.perform(get("/admin/dispatch-board/undispatched-slips"))
                .andExpect(status().isForbidden());
    }

    @Test
    void GET_undispatched_slips_with_custom_filters() throws Exception {
        mvc.perform(get("/admin/dispatch-board/undispatched-slips")
                        .param("from", "2026-05-10")
                        .param("to", "2026-05-20")
                        .param("statuses", "UNDISPATCHED", "DISPATCHING")
                        .param("page", "0")
                        .param("size", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.size").value(20));
    }
}
