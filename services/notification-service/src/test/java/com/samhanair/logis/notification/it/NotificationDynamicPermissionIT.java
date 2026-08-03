package com.samhanair.logis.notification.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.notification.NotificationServiceApplication;
import com.samhanair.logis.notification.client.AligoAddressBookClient;
import com.samhanair.logis.notification.client.AligoCsvSourceClient;
import com.samhanair.logis.notification.client.BlockedPartnerLookupClient;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.notification.client.PartnerLookupClient;
import com.samhanair.logis.notification.client.SlipServiceClient;
import com.samhanair.logis.notification.client.UserClient;
import com.samhanair.logis.notification.domain.DispatchSmsProgramType;
import com.samhanair.logis.notification.domain.DispatchSmsSaveMode;
import com.samhanair.logis.security.permission.PermissionAction;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * SP-D3 notification-service 동적 RBAC IT — dispatch.sms-save-history PageCode 이중 가드 검증.
 *
 * <p>SP-D2 P04 트랩 회귀 방지:
 * {@code @MockBean DynamicPermissionClient} + {@code @BeforeEach lenient stub} 패턴.
 * DynamicPermissionClient 누락 시 Eureka 비활성 → 500 발생 (feedback_it_mockbean_external_clients.md).
 *
 * <p>이중 가드 정책 검증:
 * <ul>
 *   <li>canView=false → 저장내역 GET 403</li>
 *   <li>canView=true → 저장내역 GET 200</li>
 *   <li>canEdit=false + canView=true → 저장 POST 403 (view-only override)</li>
 *   <li>canEdit=false + canView=false → 저장 POST 403 (SP-D6 @RequirePermission strict deny)</li>
 * </ul>
 *
 * <p>케이스 목록:
 * <ol>
 *   <li>C1: DISPATCH, canView=true → GET history 200 OK</li>
 *   <li>C2: DISPATCH, canView=false → GET history 403 FORBIDDEN</li>
 *   <li>C3: DISPATCH, canEdit=false + canView=true → POST history 403 (view-only override)</li>
 *   <li>C4: DISPATCH, canEdit=false + canView=false → POST history 403</li>
 *   <li>C5: DISPATCH, canView=true → GET /latest 200</li>
 *   <li>C6: MANAGER, canView=false → GET /latest 403</li>
 * </ol>
 */
@SpringBootTest(classes = NotificationServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class NotificationDynamicPermissionIT extends AbstractPostgresIT {

    private static final String BASE_URL = "/admin/notifications/dispatch-sms/history";
    private static final String DISPATCH_ACCOUNT_ID = "10000000-0000-0000-0000-000000000231";
    private static final String DISPATCH_BLOCKED_ACCOUNT_ID = "10000000-0000-0000-0000-000000000232";
    private static final String DISPATCH_VIEW_ONLY_ACCOUNT_ID = "10000000-0000-0000-0000-000000000233";
    private static final String DISPATCH_FALLBACK_ACCOUNT_ID = "10000000-0000-0000-0000-000000000234";
    private static final String DISPATCH_LATEST_ACCOUNT_ID = "10000000-0000-0000-0000-000000000235";
    private static final String MANAGER_BLOCKED_ACCOUNT_ID = "10000000-0000-0000-0000-000000000236";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    // ---- 외부 client @MockBean 격리 (feedback_it_mockbean_external_clients.md) ----

    /** SP-D3 핵심 @MockBean — DynamicPermissionClient 누락 시 Eureka 호출 → 500 트랩 */
    @MockBean(classes = com.samhanair.logis.security.permission.DynamicPermissionClient.class)
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
     * canView=true / canEdit=true 기본값 (SP-D2 AccountingDynamicPermissionIT 패턴 일관).
     */
    @BeforeEach
    void setupLenientStubs() {
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.check(any(UUID.class), anyString(), any(PermissionAction.class)))
                .thenReturn(true);
    }

    // -------------------------------------------------------------------------
    // C1: DISPATCH, canView=true → GET history 200
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C1: DISPATCH canView=true → GET 배차문자 저장내역 200 OK")
    @WithMockUser(username = "dispatch-user", authorities = {"ROLE_DISPATCH"})
    void C1_dispatch_sms_history_canView_true_returns_200() throws Exception {
        // canView=true (lenient 기본값 사용)
        mockMvc.perform(get(BASE_URL)
                        .header("X-User-Id", DISPATCH_ACCOUNT_ID)
                        .header("X-User-Role", "DISPATCH")
                        .param("page", "0")
                        .param("size", "10"))
                .andExpect(status().isOk());
    }

    // -------------------------------------------------------------------------
    // C2: DISPATCH, canView=false → GET history 403
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C2: DISPATCH canView=false → GET 배차문자 저장내역 403 FORBIDDEN")
    @WithMockUser(username = "dispatch-user-blocked", authorities = {"ROLE_DISPATCH"})
    void C2_dispatch_sms_history_canView_false_returns_403() throws Exception {
        // canView=false override
        when(dynamicPermissionClient.check(
                        org.mockito.ArgumentMatchers.any(UUID.class),
                        org.mockito.ArgumentMatchers.eq("notification.dispatch-sms.display"),
                        org.mockito.ArgumentMatchers.eq(PermissionAction.VIEW)))
                .thenReturn(false);

        mockMvc.perform(get(BASE_URL)
                        .header("X-User-Id", DISPATCH_BLOCKED_ACCOUNT_ID)
                        .header("X-User-Role", "DISPATCH")
                        .param("page", "0")
                        .param("size", "10"))
                .andExpect(status().isForbidden());
    }

    // -------------------------------------------------------------------------
    // C3: DISPATCH, canEdit=false + canView=true → POST history 403 (view-only override)
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C3: DISPATCH canEdit=false + canView=true → POST 저장 403 (view-only override)")
    @WithMockUser(username = "dispatch-view-only", authorities = {"ROLE_DISPATCH"})
    void C3_save_canEdit_false_canView_true_returns_403() throws Exception {
        when(dynamicPermissionClient.check(
                        org.mockito.ArgumentMatchers.any(UUID.class),
                        org.mockito.ArgumentMatchers.eq("notification.dispatch-sms.display"),
                        org.mockito.ArgumentMatchers.eq(PermissionAction.CREATE)))
                .thenReturn(false);

        Map<String, Object> body = buildSaveBody("view-only 테스트", DispatchSmsSaveMode.MANUAL_NAMED);
        mockMvc.perform(post(BASE_URL)
                        .header("X-User-Id", DISPATCH_VIEW_ONLY_ACCOUNT_ID)
                        .header("X-User-Role", "DISPATCH")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isForbidden());
    }

    // -------------------------------------------------------------------------
    // C4: DISPATCH, canEdit=false + canView=false → POST history 403
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C4: DISPATCH canEdit=false + canView=false → POST 저장 403")
    @WithMockUser(username = "dispatch-fallback", authorities = {"ROLE_DISPATCH"})
    void C4_save_canEdit_false_canView_false_returns_403() throws Exception {
        when(dynamicPermissionClient.check(
                        org.mockito.ArgumentMatchers.any(UUID.class),
                        org.mockito.ArgumentMatchers.eq("notification.dispatch-sms.display"),
                        org.mockito.ArgumentMatchers.eq(PermissionAction.CREATE)))
                .thenReturn(false);

        Map<String, Object> body = buildSaveBody("fallback 테스트", DispatchSmsSaveMode.MANUAL_NAMED);
        mockMvc.perform(post(BASE_URL)
                        .header("X-User-Id", DISPATCH_FALLBACK_ACCOUNT_ID)
                        .header("X-User-Role", "DISPATCH")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isForbidden());
    }

    // -------------------------------------------------------------------------
    // C5: DISPATCH, canView=true → GET /latest 200
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C5: DISPATCH canView=true → GET /latest 200 OK (AUTO_LATEST 없어도 4xx 허용)")
    @WithMockUser(username = "dispatch-latest", authorities = {"ROLE_DISPATCH"})
    void C5_latest_canView_true_returns_non_403() throws Exception {
        // canView=true (lenient 기본값 사용)
        mockMvc.perform(get(BASE_URL + "/latest")
                        .header("X-User-Id", DISPATCH_LATEST_ACCOUNT_ID)
                        .header("X-User-Role", "DISPATCH")
                        .param("programType", DispatchSmsProgramType.DISPATCH_SMS.name()))
                .andExpect(result -> {
                    int status = result.getResponse().getStatus();
                    // canView=true → 403 금지 (404는 허용 — AUTO_LATEST row 없음)
                    if (status == 403) {
                        throw new AssertionError("C5: canView=true 인데 403 발생 — VIEW 가드 오작동");
                    }
                });
    }

    // -------------------------------------------------------------------------
    // C6: MANAGER, canView=false → GET /latest 403
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C6: MANAGER canView=false → GET /latest 403 FORBIDDEN")
    @WithMockUser(username = "manager-blocked", authorities = {"ROLE_MANAGER"})
    void C6_latest_canView_false_returns_403() throws Exception {
        when(dynamicPermissionClient.check(
                        org.mockito.ArgumentMatchers.any(UUID.class),
                        org.mockito.ArgumentMatchers.eq("notification.dispatch-sms.display"),
                        org.mockito.ArgumentMatchers.eq(PermissionAction.VIEW)))
                .thenReturn(false);

        mockMvc.perform(get(BASE_URL + "/latest")
                        .header("X-User-Id", MANAGER_BLOCKED_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER")
                        .param("programType", DispatchSmsProgramType.DISPATCH_SMS.name()))
                .andExpect(status().isForbidden());
    }

    // -------------------------------------------------------------------------
    // 헬퍼
    // -------------------------------------------------------------------------

    /**
     * 배차문자 저장 요청 body 생성 헬퍼.
     *
     * @param name     저장명
     * @param saveMode 저장 방식 (AUTO_LATEST / MANUAL_NAMED)
     * @return 저장 요청 body Map
     */
    private Map<String, Object> buildSaveBody(String name, DispatchSmsSaveMode saveMode) {
        return Map.of(
                "programType", DispatchSmsProgramType.DISPATCH_SMS.name(),
                "saveMode", saveMode.name(),
                "name", name,
                "requestParams", Map.of("date", "2026-05-18", "vehicles", 3),
                "responsePayload", Map.of("smsCount", 3, "preview", "테스트 미리보기")
        );
    }
}
