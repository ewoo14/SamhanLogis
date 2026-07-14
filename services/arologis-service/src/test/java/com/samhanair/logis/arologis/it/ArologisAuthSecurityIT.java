package com.samhanair.logis.arologis.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.arologis.ArologisServiceApplication;
import com.samhanair.logis.arologis.client.NotificationClient;
import com.samhanair.logis.arologis.client.PartnerClient;
import com.samhanair.logis.arologis.client.SlipClient;
import com.samhanair.logis.arologis.client.SlipServiceClient;
import com.samhanair.logis.arologis.config.ArologisJwtProperties;
import com.samhanair.logis.arologis.domain.Driver;
import com.samhanair.logis.arologis.domain.DriverSource;
import com.samhanair.logis.arologis.domain.auth.AdminUser;
import com.samhanair.logis.arologis.domain.auth.AdminUserRole;
import com.samhanair.logis.arologis.dto.DriverLoginRequest;
import com.samhanair.logis.arologis.repository.AdminUserRepository;
import com.samhanair.logis.arologis.repository.DriverRepository;
import com.samhanair.logis.arologis.service.auth.JwtIssuer;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
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
 * Auth 보안 IT — 2026-05-14 분리 (B14 / IT 3 — 4 시나리오).
 *
 * <p>만료 JWT 401 / 위변조 JWT 401 / Soft Deleted Driver 401 / 잘못된 role 권한 deny.
 */
@SpringBootTest(classes = ArologisServiceApplication.class)
@AutoConfigureMockMvc
class ArologisAuthSecurityIT extends AbstractPostgresIT {

    @Autowired private MockMvc mvc;
    @Autowired private JwtIssuer issuer;
    @Autowired private ArologisJwtProperties props;
    @Autowired private AdminUserRepository adminRepo;
    @Autowired private DriverRepository driverRepo;
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
        lenient().when(slipServiceClient.getOutboundSlips(any(), any())).thenReturn(java.util.List.of());
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);

        adminRepo.findByLoginIdAndIsDeletedFalse("secadmin")
                .orElseGet(() -> adminRepo.save(AdminUser.create(
                        "secadmin", encoder.encode("pw"), "보안", AdminUserRole.AROLOGIS_MASTER)));
    }

    @Test
    void expired_jwt_returns_401() throws Exception {
        long original = props.getAccessExpirySeconds();
        props.setAccessExpirySeconds(-1);
        try {
            AdminUser u = adminRepo.findByLoginIdAndIsDeletedFalse("secadmin").orElseThrow();
            String expired = issuer.issueAccessForAdmin(u.getId(), u.getLoginId(), u.getRole());
            mvc.perform(get("/admin/arologis/dispatches")
                            .header("Authorization", "Bearer " + expired))
                    .andExpect(status().isUnauthorized());
        } finally {
            props.setAccessExpirySeconds(original);
        }
    }

    @Test
    void tampered_jwt_returns_401() throws Exception {
        AdminUser u = adminRepo.findByLoginIdAndIsDeletedFalse("secadmin").orElseThrow();
        String token = issuer.issueAccessForAdmin(u.getId(), u.getLoginId(), u.getRole());
        // 마지막 글자 swap → signature 검증 실패
        String tampered = token.substring(0, token.length() - 2)
                + (token.charAt(token.length() - 1) == 'a' ? "Xb" : "ab");
        mvc.perform(get("/admin/arologis/dispatches")
                        .header("Authorization", "Bearer " + tampered))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void soft_deleted_driver_login_returns_401() throws Exception {
        Driver d = Driver.of("DSEC", "01077778888", "1톤", DriverSource.INTERNAL, false, null);
        d.markDeleted("system");
        driverRepo.save(d);

        String body = om.writeValueAsString(new DriverLoginRequest("01077778888"));
        mvc.perform(post("/auth/driver/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void driver_role_cannot_access_admin_endpoint() throws Exception {
        Driver d = Driver.of("DSEC2", "01066667777", "1톤", DriverSource.INTERNAL, false, null);
        driverRepo.save(d);
        Driver saved = driverRepo.findByPhoneNumberAndIsDeletedFalse("01066667777").orElseThrow();
        String driverJwt = issuer.issueAccessForDriver(
                saved.getId(), saved.getDriverCode(), saved.getPhoneNumber());
        when(dynamicPermissionClient.canView(eq("AROLOGIS_DRIVER"), eq("arologis.dispatch.admin")))
                .thenReturn(false);

        // /admin/arologis/dispatches 는 AROLOGIS_MASTER/MANAGER 만 허용 → AROLOGIS_DRIVER 거부
        mvc.perform(get("/admin/arologis/dispatches")
                        .header("Authorization", "Bearer " + driverJwt))
                .andExpect(status().isForbidden());
    }
}
