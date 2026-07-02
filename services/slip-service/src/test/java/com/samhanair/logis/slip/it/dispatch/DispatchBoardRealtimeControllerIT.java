package com.samhanair.logis.slip.it.dispatch;

import static org.mockito.ArgumentMatchers.anyString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.security.permission.PermissionAction;
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
import com.samhanair.logis.slip.it.AbstractPostgresIT;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

/** 배차현황 목록 레벨 SSE 구독 endpoint 권한/응답 계약 IT. */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
class DispatchBoardRealtimeControllerIT extends AbstractPostgresIT {

    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String USER_ROLE_HEADER = "X-User-Role";
    private static final UUID SALES_ACCOUNT_ID = UUID.fromString("10000000-0000-0000-0000-000000000325");

    @Autowired private MockMvc mvc;

    @MockBean private ArologisDispatchClient arologisDispatchClient;
    @MockBean private NotificationClient notificationClient;
    @MockBean private NotificationChatRoomClient notificationChatRoomClient;
    @MockBean private InventoryClient inventoryClient;
    @MockBean private ProductClient productClient;
    @MockBean private PartnerBlockClient partnerBlockClient;
    @MockBean private PartnerInternalClient partnerInternalClient;
    @MockBean private SmsGateway smsGateway;
    @MockBean private UserInternalClient userInternalClient;
    @MockBean private WarehouseInternalClient warehouseInternalClient;

    @BeforeEach
    void setupLenientStubs() {
        Mockito.lenient().when(userInternalClient.resolveFullName(ArgumentMatchers.any()))
                .thenReturn(Optional.of("담당자"));
        Mockito.lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        Mockito.lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        Mockito.lenient().when(dynamicPermissionClient.check(
                        ArgumentMatchers.any(UUID.class),
                        ArgumentMatchers.anyString(),
                        ArgumentMatchers.any(PermissionAction.class)))
                .thenReturn(true);
    }

    @Test
    void 권한없으면_403() throws Exception {
        Mockito.when(dynamicPermissionClient.check(
                        ArgumentMatchers.eq(SALES_ACCOUNT_ID),
                        ArgumentMatchers.eq("dispatch.board"),
                        ArgumentMatchers.eq(PermissionAction.VIEW)))
                .thenReturn(false);

        mvc.perform(get("/admin/dispatch-tasks/board-realtime")
                        .header(USER_ID_HEADER, SALES_ACCOUNT_ID.toString())
                        .header(USER_ROLE_HEADER, "SALES")
                        .accept(MediaType.TEXT_EVENT_STREAM))
                .andExpect(status().isForbidden());
    }

    @Test
    void 권한있으면_text_event_stream_구독을_시작한다() throws Exception {
        mvc.perform(get("/admin/dispatch-tasks/board-realtime")
                        .header(USER_ID_HEADER, SALES_ACCOUNT_ID.toString())
                        .header(USER_ROLE_HEADER, "SALES")
                        .accept(MediaType.TEXT_EVENT_STREAM))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_EVENT_STREAM))
                .andExpect(request().asyncStarted());
    }
}
