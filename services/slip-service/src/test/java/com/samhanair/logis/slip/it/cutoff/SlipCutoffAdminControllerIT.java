package com.samhanair.logis.slip.it.cutoff;

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
import com.samhanair.logis.slip.web.cutoff.SlipCutoffPageCodes;
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
 * 출고전표 마감시각 설정 admin API 통합 테스트.
 *
 * <p>권한 클라이언트는 {@link com.samhanair.logis.slip.it.AbstractPostgresIT}
 * 의 공통 {@code @MockBean} 을 사용한다. 서브클래스에서 중복 선언하지 않는다.
 *
 * <p>테스트 시나리오:
 * <ul>
 *   <li>CRUD happy path (목록 → 등록 → 수정 → 삭제)</li>
 *   <li>활성 중복 태그 409 CONFLICT</li>
 *   <li>권한 MANAGER 200 / 타 role(VIEWER) 403</li>
 * </ul>
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "master-user", authorities = {"ROLE_MASTER"})
class SlipCutoffAdminControllerIT extends com.samhanair.logis.slip.it.AbstractPostgresIT {

    private static final String USER_ID = "10000000-0000-0000-0000-000000000010";
    private static final String USER_ROLE = "MASTER";

    @Autowired private MockMvc mvc;

    // 외부 RestClient @MockBean — lenient stub (IT 격리)
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
    void crud_happyPath() throws Exception {
        // 1. 목록 조회 (V51 기본 시드 포함)
        mvc.perform(get("/admin/slip-cutoffs")
                        .header("X-User-Id", USER_ID)
                        .header("X-User-Role", USER_ROLE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data").isArray());

        // 2. 신규 등록 (SALE 태그 — 시드 없음)
        String createBody = mvc.perform(post("/admin/slip-cutoffs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "deliveryTag": "SALE",
                                  "cutoffTime": "10:00",
                                  "active": true
                                }
                                """)
                        .header("X-User-Id", USER_ID)
                        .header("X-User-Role", USER_ROLE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.deliveryTag").value("SALE"))
                .andExpect(jsonPath("$.data.deliveryTagLabel").value("판매"))
                .andExpect(jsonPath("$.data.cutoffTime").value("10:00"))
                .andExpect(jsonPath("$.data.active").value(true))
                .andReturn()
                .getResponse()
                .getContentAsString(java.nio.charset.StandardCharsets.UTF_8);

        String id = extractId(createBody);

        // 3. 수정 (시각 변경 + 비활성화)
        mvc.perform(patch("/admin/slip-cutoffs/{id}", id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"cutoffTime": "09:30", "active": false}
                                """)
                        .header("X-User-Id", USER_ID)
                        .header("X-User-Role", USER_ROLE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.cutoffTime").value("09:30"))
                .andExpect(jsonPath("$.data.active").value(false));

        // 4. soft-delete
        mvc.perform(delete("/admin/slip-cutoffs/{id}", id)
                        .header("X-User-Id", USER_ID)
                        .header("X-User-Role", USER_ROLE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));

        // 5. 삭제 후 목록에서 미노출 확인
        mvc.perform(get("/admin/slip-cutoffs")
                        .header("X-User-Id", USER_ID)
                        .header("X-User-Role", USER_ROLE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[?(@.deliveryTag=='SALE')]").isEmpty());
    }

    @Test
    void create_duplicateActiveTag_returns409() throws Exception {
        // REGION 은 V51 기본 시드에서 이미 존재
        mvc.perform(post("/admin/slip-cutoffs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"deliveryTag": "REGION", "cutoffTime": "11:00"}
                                """)
                        .header("X-User-Id", USER_ID)
                        .header("X-User-Role", USER_ROLE))
                .andExpect(status().isConflict());
    }

    @Test
    void create_inboundTag_returns400() throws Exception {
        // RETURN_TRIP 은 INBOUND 방향 태그 — OUTBOUND 전용 게이트에서 거부
        mvc.perform(post("/admin/slip-cutoffs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"deliveryTag": "RETURN_TRIP", "cutoffTime": "11:00"}
                                """)
                        .header("X-User-Id", USER_ID)
                        .header("X-User-Role", USER_ROLE))
                .andExpect(status().isBadRequest());
    }

    @Test
    void availableOutboundTags_returnOnlyOutboundTags() throws Exception {
        mvc.perform(get("/admin/slip-cutoffs/delivery-tags")
                        .header("X-User-Id", USER_ID)
                        .header("X-User-Role", USER_ROLE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").isArray())
                // OUTBOUND 태그만 포함 — RETURN_TRIP(INBOUND) 미포함
                .andExpect(jsonPath("$.data[?(@.tag=='SALE')]").exists())
                .andExpect(jsonPath("$.data[?(@.tag=='RETURN_TRIP')]").isEmpty());
    }

    @Test
    void create_whenPermissionDenied_returns403() throws Exception {
        when(dynamicPermissionClient.check(
                any(UUID.class),
                eq(SlipCutoffPageCodes.HR_SLIP_CUTOFF),
                eq(PermissionAction.CREATE)))
                .thenReturn(false);
        when(dynamicPermissionClient.canEdit(anyString(), eq(SlipCutoffPageCodes.HR_SLIP_CUTOFF)))
                .thenReturn(false);

        mvc.perform(post("/admin/slip-cutoffs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"deliveryTag": "SALE", "cutoffTime": "10:00"}
                                """)
                        .header("X-User-Id", USER_ID)
                        .header("X-User-Role", USER_ROLE))
                .andExpect(status().isForbidden());

        Mockito.reset(dynamicPermissionClient);
    }

    @Test
    @WithMockUser(username = "manager-user", authorities = {"ROLE_MANAGER"})
    void create_asManager_returns200() throws Exception {
        mvc.perform(post("/admin/slip-cutoffs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"deliveryTag": "LOGEN", "cutoffTime": "13:00"}
                                """)
                        .header("X-User-Id", "20000000-0000-0000-0000-000000000001")
                        .header("X-User-Role", "MANAGER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.deliveryTag").value("LOGEN"));
    }

    private static String extractId(String json) {
        String marker = "\"id\":\"";
        int start = json.indexOf(marker);
        if (start < 0) {
            throw new IllegalStateException("id 필드를 찾을 수 없습니다");
        }
        int valueStart = start + marker.length();
        int valueEnd = json.indexOf('"', valueStart);
        return json.substring(valueStart, valueEnd);
    }
}
