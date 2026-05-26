package com.samhanair.logis.arologis.it;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.arologis.ArologisServiceApplication;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.arologis.client.NotificationClient;
import com.samhanair.logis.arologis.client.PartnerClient;
import com.samhanair.logis.arologis.client.SlipClient;
import com.samhanair.logis.arologis.client.SlipServiceClient;
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

/**
 * SP-D3 arologis-service 동적 RBAC IT — dispatch.board PageCode 이중 가드 검증.
 *
 * <p>SP-D2 P04 트랩 회귀 방지:
 * {@code @MockBean DynamicPermissionClient} + {@code @BeforeEach lenient stub} 패턴.
 * DynamicPermissionClient 누락 시 Eureka 비활성 → 500 발생 (feedback_it_mockbean_external_clients.md).
 *
 * <p>이중 가드 정책 검증:
 * <ul>
 *   <li>canView=false → 배차 list GET 403</li>
 *   <li>canView=true → 배차 list GET 200</li>
 *   <li>canEdit=false + canView=true → 자동매칭 POST 403 (view-only override)</li>
 *   <li>canEdit=false + canView=false → 자동매칭 POST 403 (SP-D6 fail-closed)</li>
 *   <li>canEdit=false + canView=true → 기사변경 PATCH 403 (view-only override)</li>
 *   <li>canView=true + canEdit=true → 배차 list GET 200 (정상 허용)</li>
 * </ul>
 *
 * <p>케이스 목록:
 * <ol>
 *   <li>C1: MASTER, canView=true → GET /api/v1/arologis/admin/dispatches 200</li>
 *   <li>C2: MASTER, canView=false → GET /api/v1/arologis/admin/dispatches 403</li>
 *   <li>C3: MASTER, canEdit=false + canView=true → POST auto-match 403 (view-only override)</li>
 *   <li>C4: MASTER, canEdit=false + canView=false → POST auto-match 403 (SP-D6 fail-closed)</li>
 *   <li>C5: MASTER, canEdit=false + canView=true → PATCH driver 403 (view-only override)</li>
 *   <li>C6: AROLOGIS_MANAGER, canView=true + canEdit=true → GET dispatches 200</li>
 * </ol>
 */
@SpringBootTest(classes = ArologisServiceApplication.class)
@AutoConfigureMockMvc
class ArologisDynamicPermissionIT extends AbstractPostgresIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    // ---- 외부 client @MockBean 격리 (feedback_it_mockbean_external_clients.md) ----

    /** SP-D3 핵심 @MockBean — DynamicPermissionClient 누락 시 Eureka 호출 → 500 트랩 */
    @MockBean
    private DynamicPermissionClient dynamicPermissionClient;

    @MockBean
    private PartnerClient partnerClient;

    @MockBean
    private SlipClient slipClient;

    @MockBean
    private NotificationClient notificationClient;

    @MockBean
    private SlipServiceClient slipServiceClient;

    /**
     * @BeforeEach lenient stub — 기존 IT 회귀 0건 보장.
     * canView=true / canEdit=true 기본값 (SP-D2 AccountingDynamicPermissionIT 패턴 일관).
     */
    @BeforeEach
    void setupLenientStubs() {
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
    }

    // -------------------------------------------------------------------------
    // C1: MASTER, canView=true → 배차 list GET 200
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C1: MASTER dispatch.board canView=true → 배차 list 200 OK")
    @WithMockUser(username = "master-user", authorities = {"ROLE_MASTER"})
    void C1_dispatch_board_canView_true_returns_200() throws Exception {
        // canView=true (lenient 기본값 사용)
        mockMvc.perform(get("/api/v1/arologis/admin/dispatches")
                        .header("X-User-Role", "MASTER")
                        .param("page", "0")
                        .param("size", "10"))
                .andExpect(status().isOk());
    }

    // -------------------------------------------------------------------------
    // C2: MASTER, canView=false → 배차 list 403
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C2: MASTER dispatch.board canView=false → 배차 list 403 FORBIDDEN")
    @WithMockUser(username = "master-user-blocked", authorities = {"ROLE_MASTER"})
    void C2_dispatch_board_canView_false_returns_403() throws Exception {
        // canView=false override
        when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(false);

        mockMvc.perform(get("/api/v1/arologis/admin/dispatches")
                        .header("X-User-Role", "MASTER")
                        .param("page", "0")
                        .param("size", "10"))
                .andExpect(status().isForbidden());
    }

    // -------------------------------------------------------------------------
    // C3: MASTER, canEdit=false + canView=true → 자동매칭 POST 403 (view-only override)
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C3: MASTER canEdit=false + canView=true → 자동매칭 POST 403 (view-only override)")
    @WithMockUser(username = "master-view-only", authorities = {"ROLE_MASTER"})
    void C3_auto_match_canEdit_false_canView_true_returns_403() throws Exception {
        // view-only override: canEdit=false, canView=true → 403
        when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(false);
        when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);

        Map<String, String> body = Map.of("dispatchId", UUID.randomUUID().toString());
        mockMvc.perform(post("/api/v1/arologis/admin/dispatches/auto-match")
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isForbidden());
    }

    // -------------------------------------------------------------------------
    // C4: MASTER, canEdit=false + canView=false → 자동매칭 POST 403 (SP-D6 fail-closed)
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C4: MASTER canEdit=false + canView=false → 자동매칭 POST 403 (SP-D6 fail-closed)")
    @WithMockUser(username = "master-fallback", authorities = {"ROLE_MASTER"})
    void C4_auto_match_canEdit_false_canView_false_returns_403() throws Exception {
        // SP-D6 strict policy: canEdit=false + canView=false grant 없음 → fail-closed 403
        when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(false);
        when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(false);

        Map<String, String> body = Map.of("dispatchId", UUID.randomUUID().toString());
        mockMvc.perform(post("/api/v1/arologis/admin/dispatches/auto-match")
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isForbidden());
    }

    // -------------------------------------------------------------------------
    // C5: MASTER, canEdit=false + canView=true → 기사 변경 PATCH 403 (view-only override)
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C5: MASTER canEdit=false + canView=true → 기사 변경 PATCH 403 (view-only override)")
    @WithMockUser(username = "master-view-only-driver", authorities = {"ROLE_MASTER"})
    void C5_change_driver_canEdit_false_canView_true_returns_403() throws Exception {
        when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(false);
        when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);

        Map<String, Object> body = Map.of("vehicleSeq", 1, "newDriverCode", "DRV-001");
        mockMvc.perform(patch("/api/v1/arologis/admin/dispatches/" + UUID.randomUUID() + "/driver")
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isForbidden());
    }

    // -------------------------------------------------------------------------
    // C6: AROLOGIS_MANAGER, canView=true + canEdit=true → 배차 list 200
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("C6: AROLOGIS_MANAGER canView=true + canEdit=true → 배차 list 200 OK")
    @WithMockUser(username = "arologis-manager", authorities = {"ROLE_AROLOGIS_MANAGER"})
    void C6_arologis_manager_canView_true_returns_200() throws Exception {
        // canView=true, canEdit=true (lenient 기본값 사용)
        mockMvc.perform(get("/api/v1/arologis/admin/dispatches")
                        .header("X-User-Role", "AROLOGIS_MANAGER")
                        .param("page", "0")
                        .param("size", "10"))
                .andExpect(status().isOk());
    }
}
