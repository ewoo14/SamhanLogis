package com.samhanair.logis.arologis.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.arologis.ArologisServiceApplication;
import com.samhanair.logis.arologis.client.AuthPermissionAdminClient;
import com.samhanair.logis.arologis.client.NotificationClient;
import com.samhanair.logis.arologis.client.PartnerClient;
import com.samhanair.logis.arologis.client.SlipClient;
import com.samhanair.logis.arologis.client.SlipServiceClient;
import com.samhanair.logis.arologis.domain.auth.AdminUserRole;
import com.samhanair.logis.arologis.service.auth.JwtIssuer;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

/**
 * 권한 매트릭스 API MASTER 전용 defense-in-depth JWT IT.
 *
 * <p>동적 page-code 가드를 통과하더라도 실제 JWT authority 가 {@code ROLE_AROLOGIS_MASTER} 가 아니면
 * 컨트롤러가 403 으로 차단해야 한다. inbound {@code X-User-Role} 위조값은 신뢰하지 않는다.
 */
@SpringBootTest(classes = ArologisServiceApplication.class)
@AutoConfigureMockMvc
class ArologisPermissionAdminJwtIT extends AbstractPostgresIT {

    private static final UUID MASTER_ID = UUID.fromString("10000000-0000-0000-0000-000000000569");
    private static final UUID MANAGER_ID = UUID.fromString("20000000-0000-0000-0000-000000000569");

    @Autowired private MockMvc mvc;
    @Autowired private JwtIssuer issuer;

    @MockBean private PartnerClient partnerClient;
    @MockBean private SlipClient slipClient;
    @MockBean private NotificationClient notificationClient;
    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private DynamicPermissionClient dynamicPermissionClient;
    @MockBean private AuthPermissionAdminClient authPermissionAdminClient;

    @BeforeEach
    void setUp() {
        lenient().when(partnerClient.findByCodes(any())).thenReturn(java.util.List.of());
        lenient().when(partnerClient.findByCode(any())).thenReturn(Optional.empty());
        lenient().when(slipClient.registerSignature(any(), any())).thenReturn(false);
        lenient().when(slipServiceClient.getOutboundSlips(any(), any())).thenReturn(java.util.List.of());
        lenient().when(dynamicPermissionClient.canView(eq("AROLOGIS_MANAGER"), eq("arologis.admin.permissions")))
                .thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(eq("AROLOGIS_MANAGER"), eq("arologis.admin.permissions")))
                .thenReturn(true);

        AuthPermissionAdminClient.RolePagePermissionView permission =
                new AuthPermissionAdminClient.RolePagePermissionView(
                        "MANAGER", "arologis.admin.permissions", "아로로지스 권한 관리", true, true);
        lenient().when(authPermissionAdminClient.getRoleMatrix("arologis."))
                .thenReturn(Map.of("MANAGER", Map.of("arologis.admin.permissions", permission)));
        lenient().when(authPermissionAdminClient.updateRoleGrant(
                        anyString(), anyString(), anyBoolean(), anyBoolean(), anyString()))
                .thenReturn(permission);
    }

    @Test
    void managerJwt_withPermissionsPageCodeStillCannotReadMatrix() throws Exception {
        String managerJwt = issuer.issueAccessForAdmin(
                MANAGER_ID, "manager", AdminUserRole.AROLOGIS_MANAGER);

        mvc.perform(get("/admin/arologis/permissions")
                        .header("Authorization", "Bearer " + managerJwt)
                        .header("X-User-Role", "AROLOGIS_MASTER"))
                .andExpect(status().isForbidden());
    }

    @Test
    void managerJwt_withPermissionsPageCodeStillCannotUpdateMatrix() throws Exception {
        String managerJwt = issuer.issueAccessForAdmin(
                MANAGER_ID, "manager", AdminUserRole.AROLOGIS_MANAGER);

        mvc.perform(put("/admin/arologis/permissions")
                        .header("Authorization", "Bearer " + managerJwt)
                        .header("X-User-Role", "AROLOGIS_MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"roleCode\":\"MANAGER\",\"pageCode\":\"arologis.region\","
                                + "\"canView\":true,\"canEdit\":true}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void masterJwt_canReadMatrix() throws Exception {
        String masterJwt = issuer.issueAccessForAdmin(
                MASTER_ID, "master", AdminUserRole.AROLOGIS_MASTER);

        mvc.perform(get("/admin/arologis/permissions")
                        .header("Authorization", "Bearer " + masterJwt))
                .andExpect(status().isOk());
    }
}
