package com.samhanair.logis.arologis.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.arologis.ArologisServiceApplication;
import com.samhanair.logis.arologis.client.NotificationClient;
import com.samhanair.logis.arologis.client.PartnerClient;
import com.samhanair.logis.arologis.client.SlipClient;
import com.samhanair.logis.arologis.client.SlipServiceClient;
import com.samhanair.logis.arologis.config.ArologisJwtProperties;
import com.samhanair.logis.arologis.domain.auth.AdminUser;
import com.samhanair.logis.arologis.domain.auth.AdminUserRole;
import com.samhanair.logis.arologis.dto.AdminLoginRequest;
import com.samhanair.logis.arologis.dto.AuthTokenResponse;
import com.samhanair.logis.arologis.dto.RefreshRequest;
import com.samhanair.logis.arologis.repository.AdminUserRepository;
import java.util.Optional;
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
 * RefreshToken rotation IT — 2026-05-14 분리 (B14 / IT 4 — 4 시나리오).
 *
 * <p>정상 rotation / revoked refresh 재사용 차단 / 미존재 refresh 차단 / 만료 refresh 차단.
 */
@SpringBootTest(classes = ArologisServiceApplication.class)
@AutoConfigureMockMvc
class ArologisRefreshTokenIT extends AbstractPostgresIT {

    @Autowired private MockMvc mvc;
    @Autowired private AdminUserRepository userRepo;
    @Autowired private PasswordEncoder encoder;
    @Autowired private ObjectMapper om;
    @Autowired private ArologisJwtProperties props;

    @MockBean private PartnerClient partnerClient;
    @MockBean private SlipClient slipClient;
    @MockBean private NotificationClient notificationClient;
    @MockBean private SlipServiceClient slipServiceClient;

    @BeforeEach
    void seed() {
        lenient().when(partnerClient.findByCodes(any())).thenReturn(java.util.List.of());
        lenient().when(partnerClient.findByCode(any())).thenReturn(Optional.empty());
        lenient().when(slipClient.registerSignature(any(), any())).thenReturn(false);
        lenient().when(notificationClient.send(any(), any(), any(), any())).thenReturn(true);
        lenient().when(slipServiceClient.getOutboundSlips(any(), any())).thenReturn(java.util.List.of());

        userRepo.save(AdminUser.create(
                "rotuser", encoder.encode("pw"), "Rot", AdminUserRole.AROLOGIS_MANAGER));
    }

    private AuthTokenResponse login() throws Exception {
        String body = om.writeValueAsString(new AdminLoginRequest("rotuser", "pw"));
        String json = mvc.perform(post("/auth/admin/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return om.readValue(json, AuthTokenResponse.class);
    }

    @Test
    void normal_rotation_issues_new_tokens() throws Exception {
        AuthTokenResponse first = login();
        String refreshBody = om.writeValueAsString(new RefreshRequest(first.refreshToken()));
        String json = mvc.perform(post("/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(refreshBody))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        AuthTokenResponse rotated = om.readValue(json, AuthTokenResponse.class);
        assertThat(rotated.accessToken()).isNotBlank();
        assertThat(rotated.refreshToken()).isNotBlank();
        assertThat(rotated.refreshToken()).isNotEqualTo(first.refreshToken());
    }

    @Test
    void revoked_refresh_rejected_on_reuse() throws Exception {
        AuthTokenResponse first = login();
        String refreshBody = om.writeValueAsString(new RefreshRequest(first.refreshToken()));
        // 1st rotation OK
        mvc.perform(post("/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(refreshBody))
                .andExpect(status().isOk());
        // 2nd 시도 — 같은 (revoked) refresh → 401
        mvc.perform(post("/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(refreshBody))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void unknown_refresh_returns_401() throws Exception {
        String body = om.writeValueAsString(new RefreshRequest(
                "00000000-0000-0000-0000-000000000000.11111111-1111-1111-1111-111111111111"));
        mvc.perform(post("/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void expired_refresh_returns_401() throws Exception {
        long original = props.getRefreshExpirySeconds();
        props.setRefreshExpirySeconds(-1);
        try {
            AuthTokenResponse first = login();
            String body = om.writeValueAsString(new RefreshRequest(first.refreshToken()));
            mvc.perform(post("/auth/refresh")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(body))
                    .andExpect(status().isUnauthorized());
        } finally {
            props.setRefreshExpirySeconds(original);
        }
    }
}
