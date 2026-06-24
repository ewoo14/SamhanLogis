package com.samhanair.logis.slip.it.dispatch;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.ArologisDispatchClient;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.NotificationChatRoomClient;
import com.samhanair.logis.slip.client.NotificationClient;
import com.samhanair.logis.slip.client.PartnerBlockClient;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.delivery.sms.SmsGateway;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.it.AbstractPostgresIT;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.security.permission.PermissionAction;
import java.time.LocalDate;
import java.util.UUID;
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

    private static final String USER_ROLE_HEADER = "X-User-Role";
    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String MASTER_ACCOUNT_ID = "10000000-0000-0000-0000-000000000321";
    private static final String DISPATCH_ACCOUNT_ID = "10000000-0000-0000-0000-000000000322";
    private static final String SALES_ACCOUNT_ID = "10000000-0000-0000-0000-000000000323";
    private static final String DISPATCH_BOARD_PAGE_CODE = "dispatch.board";

    @Autowired MockMvc mvc;
    @Autowired SlipRepository slipRepository;

    // 외부 client @MockBean — [feedback_it_mockbean_external_clients]
    // DynamicPermissionClient 는 AbstractPostgresIT 가 @MockBean + check()/canView() lenient allow stub 제공(서브클래스 중복 선언 제거).
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
    /** SP-08-FU2 P2-2 — WarehouseInternalClient @MockBean 격리. */
    @MockBean
    private WarehouseInternalClient warehouseInternalClient;

    @BeforeEach
    void setupLenientStubs() {
        // canView/canEdit/check 는 AbstractPostgresIT base 가 lenient allow stub 제공(중복 stub 제거).
        Mockito.lenient().when(userInternalClient.resolveFullName(org.mockito.ArgumentMatchers.any()))
                .thenReturn(java.util.Optional.of("담당자"));
    }

    @Test
    void GET_undispatched_slips_returns_empty_page_with_defaults() throws Exception {
        mvc.perform(get("/admin/dispatch-board/undispatched-slips")
                        .header(USER_ID_HEADER, MASTER_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "MASTER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.content").isArray())
                .andExpect(jsonPath("$.data.size").value(50));
    }

    @Test
    @WithMockUser(username = "dispatcher", authorities = {"ROLE_DISPATCH"})
    void GET_undispatched_slips_allows_dispatch_role() throws Exception {
        mvc.perform(get("/admin/dispatch-board/undispatched-slips")
                        .header(USER_ID_HEADER, DISPATCH_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "DISPATCH"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.content").isArray());
    }

    @Test
    @WithMockUser(username = "sales", authorities = {"ROLE_SALES"})
    void GET_undispatched_slips_rejects_sales_role() throws Exception {
        org.mockito.Mockito.when(dynamicPermissionClient.check(
                        any(UUID.class), eq(DISPATCH_BOARD_PAGE_CODE), eq(PermissionAction.VIEW)))
                .thenReturn(false);

        mvc.perform(get("/admin/dispatch-board/undispatched-slips")
                        .header(USER_ID_HEADER, SALES_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "SALES"))
                .andExpect(status().isForbidden());
    }

    @Test
    void GET_undispatched_slips_with_custom_filters() throws Exception {
        mvc.perform(get("/admin/dispatch-board/undispatched-slips")
                        .header(USER_ID_HEADER, MASTER_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "MASTER")
                        .param("from", "2026-05-10")
                        .param("to", "2026-05-20")
                        .param("statuses", "UNDISPATCHED", "DISPATCHING")
                        .param("page", "0")
                        .param("size", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.size").value(20));
    }

    @Test
    void GET_undispatched_slips_excludes_uninspected_outbound_slips() throws Exception {
        Slip inspected = saveOutboundSlip("2026/05/17-DQ-S1-1", 701, true);
        Slip uninspected = saveOutboundSlip("2026/05/17-DQ-S1-2", 702, false);

        mvc.perform(get("/admin/dispatch-board/undispatched-slips")
                        .header(USER_ID_HEADER, MASTER_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "MASTER")
                        .param("from", "2026-05-17")
                        .param("to", "2026-05-17")
                        .param("statuses", "UNDISPATCHED")
                        .param("page", "0")
                        .param("size", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].slipNo").value(inspected.getSlipNo()))
                .andExpect(jsonPath("$.data.content[0].slipNo").value(org.hamcrest.Matchers.not(uninspected.getSlipNo())));
    }

    @Test
    void GET_undispatched_slips_exposes_inspector_name_and_signed_at_without_inspector_user_id() throws Exception {
        Slip inspected = saveOutboundSlip("2026/05/17-DQ-S1-3", 703, true);

        mvc.perform(get("/admin/dispatch-board/undispatched-slips")
                        .header(USER_ID_HEADER, MASTER_ACCOUNT_ID)
                        .header(USER_ROLE_HEADER, "MASTER")
                        .param("from", "2026-05-17")
                        .param("to", "2026-05-17")
                        .param("statuses", "UNDISPATCHED")
                        .param("page", "0")
                        .param("size", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].slipNo").value(inspected.getSlipNo()))
                .andExpect(jsonPath("$.data.content[0].inspectorName").value("담당자"))
                .andExpect(jsonPath("$.data.content[0].inspectorSignedAt").isNotEmpty())
                .andExpect(jsonPath("$.data.content[0].inspectorSignedAt")
                        .value(org.hamcrest.Matchers.matchesPattern("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}.*")))
                .andExpect(jsonPath("$.data.content[0].inspectorUserId").doesNotExist());
    }

    private Slip saveOutboundSlip(String slipNo, int seqNo, boolean inspected) {
        Slip slip = Slip.createOutbound(
                slipNo,
                LocalDate.of(2026, 5, 17),
                seqNo,
                UUID.randomUUID(),
                null,
                UUID.randomUUID(),
                "배차대기 거래처 " + seqNo,
                null,
                "dispatch board IT",
                MASTER_ACCOUNT_ID);
        slip.setPartnerCode("DQ-S1-" + seqNo);
        slip.withProjectInfo(null, "서울시 강남구 테스트로 " + seqNo, null, null,
                "010-1000-" + seqNo, null);
        slip.save();
        slip.send();
        slip.accept(DISPATCH_ACCOUNT_ID);
        slip.process();
        if (inspected) {
            slip.complete();
            slip.inspect(MASTER_ACCOUNT_ID);
        }
        return slipRepository.saveAndFlush(slip);
    }
}
