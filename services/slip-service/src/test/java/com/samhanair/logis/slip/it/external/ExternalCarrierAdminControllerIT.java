package com.samhanair.logis.slip.it.external;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
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
import com.samhanair.logis.slip.web.external.DispatchPageCodes;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * 외부기사/배송사 마스터 admin IT.
 *
 * <p>권한 클라이언트는 {@link com.samhanair.logis.slip.it.AbstractPostgresIT}
 * 의 공통 {@code @MockBean} 을 사용한다. 서브클래스에서 중복 선언하지 않는다.
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "dispatch-user", authorities = {"ROLE_DISPATCH"})
class ExternalCarrierAdminControllerIT extends com.samhanair.logis.slip.it.AbstractPostgresIT {

    private static final String USER_ID = "10000000-0000-0000-0000-000000000462";
    private static final String USER_ROLE = "DISPATCH";

    @Autowired private MockMvc mvc;

    @MockBean private ArologisDispatchClient arologisDispatchClient;
    @MockBean private InventoryClient inventoryClient;
    @MockBean private NotificationClient notificationClient;
    @MockBean private NotificationChatRoomClient notificationChatRoomClient;
    @MockBean private PartnerBlockClient partnerBlockClient;
    @MockBean private PartnerInternalClient partnerInternalClient;
    @MockBean private ProductClient productClient;
    @MockBean private SmsGateway smsGateway;
    @MockBean private UserInternalClient userInternalClient;
    @MockBean private WarehouseInternalClient warehouseInternalClient;

    @Test
    void crud_softDelete_restore_happyPath() throws Exception {
        String createBody = """
                {
                  "name": "한빛퀵",
                  "phone": "010-7000-0001",
                  "email": "dispatch@hanbit.example",
                  "defaultVehicleType": "1톤",
                  "memo": "강남권 우선",
                  "active": true
                }
                """;

        String responseBody = mvc.perform(post("/admin/external-carriers")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody)
                        .header("X-User-Id", USER_ID)
                        .header("X-User-Role", USER_ROLE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.name").value("한빛퀵"))
                .andExpect(jsonPath("$.data.phone").value("010-7000-0001"))
                .andExpect(jsonPath("$.data.active").value(true))
                .andReturn()
                .getResponse()
                .getContentAsString();
        String id = JsonField.extract(responseBody, "id");

        mvc.perform(get("/admin/external-carriers")
                        .header("X-User-Id", USER_ID)
                        .header("X-User-Role", USER_ROLE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[?(@.name=='한빛퀵')].phone").value("010-7000-0001"));

        mvc.perform(patch("/admin/external-carriers/{id}", id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"한빛퀵 강남", "active": false, "memo":"야간 불가"}
                                """)
                        .header("X-User-Id", USER_ID)
                        .header("X-User-Role", USER_ROLE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.name").value("한빛퀵 강남"))
                .andExpect(jsonPath("$.data.active").value(false))
                .andExpect(jsonPath("$.data.memo").value("야간 불가"));

        mvc.perform(delete("/admin/external-carriers/{id}", id)
                        .header("X-User-Id", USER_ID)
                        .header("X-User-Role", USER_ROLE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));

        mvc.perform(get("/admin/external-carriers")
                        .header("X-User-Id", USER_ID)
                        .header("X-User-Role", USER_ROLE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[?(@.name=='한빛퀵 강남')]").isEmpty());

        mvc.perform(post("/admin/external-carriers/{id}/restore", id)
                        .header("X-User-Id", USER_ID)
                        .header("X-User-Role", USER_ROLE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.name").value("한빛퀵 강남"))
                .andExpect(jsonPath("$.data.phone").value("010-7000-0001"));
    }

    @Test
    void create_duplicateActivePhone_returns409() throws Exception {
        mvc.perform(post("/admin/external-carriers")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"중복A","phone":"010-7000-0002"}
                                """)
                        .header("X-User-Id", USER_ID)
                        .header("X-User-Role", USER_ROLE))
                .andExpect(status().isOk());

        mvc.perform(post("/admin/external-carriers")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"중복B","phone":"010-7000-0002"}
                                """)
                        .header("X-User-Id", USER_ID)
                        .header("X-User-Role", USER_ROLE))
                .andExpect(status().isConflict());
    }

    @Test
    void create_whenPermissionDenied_returns403() throws Exception {
        when(dynamicPermissionClient.check(
                any(UUID.class),
                eq(DispatchPageCodes.EXTERNAL_CARRIERS),
                eq(PermissionAction.CREATE)))
                .thenReturn(false);
        when(dynamicPermissionClient.canEdit(anyString(), eq(DispatchPageCodes.EXTERNAL_CARRIERS)))
                .thenReturn(false);

        mvc.perform(post("/admin/external-carriers")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"권한거부","phone":"010-7000-0403"}
                                """)
                        .header("X-User-Id", USER_ID)
                        .header("X-User-Role", USER_ROLE))
                .andExpect(status().isForbidden());

        Mockito.reset(dynamicPermissionClient);
    }

    /** 간단한 응답 id 추출 — 테스트 본문에서 UUID를 사용자 식별자로 노출하지 않는다. */
    private static final class JsonField {
        private JsonField() {
        }

        static String extract(String json, String fieldName) {
            String marker = "\"" + fieldName + "\":\"";
            int start = json.indexOf(marker);
            if (start < 0) {
                throw new IllegalStateException("필드 미발견: " + fieldName);
            }
            int valueStart = start + marker.length();
            int valueEnd = json.indexOf('"', valueStart);
            return json.substring(valueStart, valueEnd);
        }
    }
}
