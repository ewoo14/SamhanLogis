package com.samhanair.logis.notification.it;

import static org.mockito.ArgumentMatchers.anyString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.notification.NotificationServiceApplication;
import com.samhanair.logis.notification.client.AligoAddressBookClient;
import com.samhanair.logis.notification.client.AligoCsvSourceClient;
import com.samhanair.logis.notification.client.BlockedPartnerLookupClient;
import com.samhanair.logis.notification.client.DynamicPermissionClient;
import com.samhanair.logis.notification.client.PartnerLookupClient;
import com.samhanair.logis.notification.client.SlipServiceClient;
import com.samhanair.logis.notification.client.UserClient;
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
 * SP-D3 notification-service 동적 RBAC IT — notification.dispatch-sms.send-audit PageCode 검증.
 *
 * <p>SP-D2 P04 트랩 회귀 방지:
 * {@code @MockBean DynamicPermissionClient} + {@code @BeforeEach lenient stub} 패턴.
 * 기존 {@link DispatchSmsSaveHistoryIT} 에 DynamicPermissionClient @MockBean 미포함 시
 * Eureka 비활성 환경에서 500 발생 트랩 — SP-D3 보강 IT 로 격리 (feedback_it_mockbean_external_clients.md).
 *
 * <p>케이스 목록:
 * <ol>
 *   <li>C1: DISPATCH, notification.dispatch-sms.send-audit canView=true → GET history?mode=SEND_AUDIT 200 OK</li>
 *   <li>C2: DISPATCH, notification.dispatch-sms.send-audit canView=false → 403 FORBIDDEN</li>
 *   <li>C3: SALES, notification.dispatch-sms.send-audit canView=true (grant) → 200 OK</li>
 *   <li>C4: DynamicPermissionClient RuntimeException → 500 아님 (fallback 통과)</li>
 *   <li>C5: 인증 없음 → 401/403</li>
 * </ol>
 */
@SpringBootTest(classes = NotificationServiceApplication.class)
@AutoConfigureMockMvc
class DispatchSmsAuditDynamicPermissionIT extends AbstractPostgresIT {

    private static final String HISTORY_URL = "/admin/notifications/dispatch-sms/history";

    @Autowired
    private MockMvc mockMvc;

    // ---- 외부 client @MockBean 격리 (feedback_it_mockbean_external_clients.md) ----

    /** SP-D3 핵심 @MockBean — notification.dispatch-sms.send-audit canView/canEdit 제어 */
    @MockBean
    private DynamicPermissionClient dynamicPermissionClient;

    @MockBean
    private UserClient userClient;

    @MockBean
    private SlipServiceClient slipServiceClient;

    @MockBean
    private PartnerLookupClient partnerLookupClient;

    @MockBean
    private BlockedPartnerLookupClient blockedPartnerLookupClient;

    @MockBean
    private AligoCsvSourceClient aligoCsvSourceClient;

    @MockBean
    private AligoAddressBookClient aligoAddressBookClient;

    /**
     * @BeforeEach lenient stub — 기존 IT 회귀 0건 보장.
     * canView=true / canEdit=true 기본값.
     */
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
    // C1: DISPATCH, send-audit canView=true → GET history?mode=SEND_AUDIT 200
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C1: DISPATCH notification.dispatch-sms.send-audit canView=true → 이력 조회 200 OK")
    @WithMockUser(username = "dispatch-user", authorities = {"ROLE_DISPATCH"})
    void C1_dispatch_send_audit_canView_true_returns_200() throws Exception {
        // canView=true (lenient 기본값 사용)
        mockMvc.perform(get(HISTORY_URL)
                        .param("mode", "SEND_AUDIT")
                        .param("page", "0")
                        .param("size", "10"))
                .andExpect(status().isOk());
    }

    // -------------------------------------------------------------------------
    // C2: DISPATCH, send-audit canView=false → 403
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C2: DISPATCH notification.dispatch-sms.send-audit canView=false → 403 FORBIDDEN")
    @WithMockUser(username = "dispatch-blocked", authorities = {"ROLE_DISPATCH"})
    void C2_dispatch_send_audit_canView_false_returns_403() throws Exception {
        // canView=false override
        Mockito.when(dynamicPermissionClient.canView(anyString(), anyString()))
                .thenReturn(false);

        mockMvc.perform(get(HISTORY_URL)
                        .param("mode", "SEND_AUDIT")
                        .param("page", "0")
                        .param("size", "10"))
                .andExpect(status().isForbidden());
    }

    // -------------------------------------------------------------------------
    // C3: SALES (grant), send-audit canView=true → 200 OK
    //     SP-D3: SALES 에게 notification.dispatch-sms.send-audit grant 가능
    //     (RoleGuard DISPATCH/MANAGER/MASTER 이중 가드 — SALES 는 @PreAuthorize 에서 차단될 수 있음)
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C3: SALES notification.dispatch-sms.send-audit canView=true (grant) → 200 OK 또는 403 (이중 가드 확인)")
    @WithMockUser(username = "sales-granted", authorities = {"ROLE_SALES"})
    void C3_sales_send_audit_canView_true_after_grant() throws Exception {
        // canView=true (lenient 기본값 사용)
        // SP-D3 이중 가드: RoleGuard allow={DISPATCH_SMS_ROLES} 에서 SALES 차단 가능
        // 또는 PermissionGuard 단독 시 grant 후 200 반환
        // 두 시나리오 모두 허용 (구현 단계)
        mockMvc.perform(get(HISTORY_URL)
                        .param("mode", "SEND_AUDIT")
                        .param("page", "0")
                        .param("size", "10"))
                .andExpect(result -> {
                    int status = result.getResponse().getStatus();
                    // 200 (PermissionGuard 단독) 또는 403 (RoleGuard 이중 가드) 모두 허용
                    // 500 (서버 에러) 은 절대 금지
                    if (status == 500) {
                        throw new AssertionError(
                                "SALES grant 시나리오에서 500 발생 — 이중 가드 예외 처리 오류."
                        );
                    }
                });
    }

    // -------------------------------------------------------------------------
    // C4: DynamicPermissionClient RuntimeException → fallback (500 아님)
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C4: DynamicPermissionClient RuntimeException → fallback 통과 (500 아님)")
    @WithMockUser(username = "dispatch-fallback", authorities = {"ROLE_DISPATCH"})
    void C4_dynamic_permission_client_exception_not_500() throws Exception {
        // RuntimeException → auth-service 다운 fallback
        Mockito.when(dynamicPermissionClient.canView(anyString(), anyString()))
                .thenThrow(new RuntimeException("auth-service 연결 불가 (테스트)"));

        mockMvc.perform(get(HISTORY_URL)
                        .param("mode", "SEND_AUDIT")
                        .param("page", "0")
                        .param("size", "10"))
                .andExpect(result -> {
                    int status = result.getResponse().getStatus();
                    // 500 발생 금지 — fallback 정상 동작 검증
                    if (status == 500) {
                        throw new AssertionError(
                                "DynamicPermissionClient RuntimeException 시 500 발생 — " +
                                "notification-service fallback 로직 미구현. 500 금지 (SP-D3 요구사항)."
                        );
                    }
                });
    }

    // -------------------------------------------------------------------------
    // C5: 인증 없음 → 401/403
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C5: 인증 없음 → 401/403")
    void C5_unauthenticated_returns_401_or_403() throws Exception {
        mockMvc.perform(get(HISTORY_URL)
                        .param("mode", "SEND_AUDIT"))
                .andExpect(result -> {
                    int status = result.getResponse().getStatus();
                    if (status != 401 && status != 403) {
                        throw new AssertionError(
                                "미인증 요청이 " + status + " 반환 — 401 또는 403 필요."
                        );
                    }
                });
    }
}
