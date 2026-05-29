package com.samhanair.logis.arologis.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.arologis.ArologisServiceApplication;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.arologis.client.NotificationClient;
import com.samhanair.logis.arologis.client.PartnerClient;
import com.samhanair.logis.arologis.client.SlipClient;
import com.samhanair.logis.arologis.client.SlipServiceClient;
import com.samhanair.logis.arologis.domain.auth.AdminUser;
import com.samhanair.logis.arologis.domain.auth.AdminUserRole;
import com.samhanair.logis.arologis.dto.AdminLoginRequest;
import com.samhanair.logis.arologis.dto.AuthTokenResponse;
import com.samhanair.logis.arologis.dto.MeResponse;
import com.samhanair.logis.arologis.repository.AdminUserRepository;
import com.samhanair.logis.security.permission.PermissionAction;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Admin 로그인 + admin endpoint 호출 IT — 2026-05-14 분리 (B12).
 *
 * <p>흐름: AdminUser 시드 → POST /auth/admin/login → AROLOGIS_MASTER JWT 수령 →
 * Bearer 헤더로 /admin/arologis/dispatches 호출 → 200. 잘못된 password → 401.
 *
 * <p>외부 client (PartnerClient/SlipClient/NotificationClient/SlipServiceClient) 는 @MockBean
 * 격리 의무 ([[feedback_it_mockbean_external_clients]]). UserClient @MockBean 은 자체 user 도메인
 * 도입으로 제거됨.
 */
@SpringBootTest(classes = ArologisServiceApplication.class)
@AutoConfigureMockMvc
class ArologisAdminAuthIT extends AbstractPostgresIT {

    private static final String ADMIN_ACCOUNT_ID = "10000000-0000-0000-0000-000000000402";

    @Autowired private MockMvc mvc;
    @Autowired private AdminUserRepository userRepo;
    @Autowired private PasswordEncoder encoder;
    @Autowired private ObjectMapper om;

    @MockBean private PartnerClient partnerClient;
    @MockBean private SlipClient slipClient;
    @MockBean private NotificationClient notificationClient;
    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void seed() {
        lenient().when(partnerClient.findByCodes(any())).thenReturn(java.util.List.of());
        lenient().when(partnerClient.findByCode(any())).thenReturn(Optional.empty());
        lenient().when(slipClient.registerSignature(any(), any())).thenReturn(false);
        lenient().when(notificationClient.send(any(), any(), any(), any())).thenReturn(true);
        lenient().when(slipServiceClient.getOutboundSlips(any(), any())).thenReturn(java.util.List.of());
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.check(
                        org.mockito.ArgumentMatchers.any(UUID.class), anyString(),
                        org.mockito.ArgumentMatchers.any(PermissionAction.class)))
                .thenReturn(true);

        userRepo.findByLoginIdAndIsDeletedFalse("itadmin")
                .orElseGet(() -> userRepo.save(AdminUser.create(
                        "itadmin", encoder.encode("pw1234"), "IT Admin", AdminUserRole.AROLOGIS_MASTER)));
    }

    @Test
    void admin_login_then_call_admin_endpoint() throws Exception {
        String loginBody = om.writeValueAsString(new AdminLoginRequest("itadmin", "pw1234"));
        String loginJson = mvc.perform(post("/auth/admin/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        AuthTokenResponse tokens = om.readValue(loginJson, AuthTokenResponse.class);
        assertThat(tokens.role()).isEqualTo("AROLOGIS_MASTER");
        assertThat(tokens.accessToken()).isNotBlank();
        assertThat(tokens.refreshToken()).isNotBlank();
        assertThat(tokens.loginId()).isEqualTo("itadmin");
        assertThat(tokens.fullName()).isEqualTo("IT Admin");

        String meJson = mvc.perform(get("/auth/me")
                        .header("Authorization", "Bearer " + tokens.accessToken()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        MeResponse me = om.readValue(meJson, MeResponse.class);
        assertThat(me.role()).isEqualTo("AROLOGIS_MASTER");
        assertThat(me.loginId()).isEqualTo("itadmin");
        assertThat(me.fullName()).isEqualTo("IT Admin");

        // JWT bearer 로 /admin/arologis/dispatches 호출 가능 (AROLOGIS_MASTER 권한 매핑)
        mvc.perform(get("/admin/arologis/dispatches?date=2026-05-08")
                        .header("Authorization", "Bearer " + tokens.accessToken())
                        .header("X-User-Id", ADMIN_ACCOUNT_ID)
                        .header("X-User-Role", "MANAGER"))
                .andExpect(status().isOk());
    }

    @Test
    void wrong_password_returns_401() throws Exception {
        String body = om.writeValueAsString(new AdminLoginRequest("itadmin", "wrong"));
        mvc.perform(post("/auth/admin/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void unknown_loginId_returns_401() throws Exception {
        String body = om.writeValueAsString(new AdminLoginRequest("nonexistent", "x"));
        mvc.perform(post("/auth/admin/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isUnauthorized());
    }
}
