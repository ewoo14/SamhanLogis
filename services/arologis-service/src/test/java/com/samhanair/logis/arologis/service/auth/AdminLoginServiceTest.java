package com.samhanair.logis.arologis.service.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.arologis.config.ArologisJwtProperties;
import com.samhanair.logis.arologis.domain.auth.AdminUser;
import com.samhanair.logis.arologis.domain.auth.AdminUserRole;
import com.samhanair.logis.arologis.domain.auth.RefreshToken;
import com.samhanair.logis.arologis.dto.AdminLoginRequest;
import com.samhanair.logis.arologis.dto.AuthTokenResponse;
import com.samhanair.logis.arologis.repository.AdminUserRepository;
import com.samhanair.logis.arologis.repository.RefreshTokenRepository;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * AdminLoginService 검증 — 2026-05-14 분리.
 *
 * <p>성공 흐름 (access + refresh 발급) + 401 (loginId 미존재 / password 불일치).
 */
@ExtendWith(MockitoExtension.class)
class AdminLoginServiceTest {

    @Mock private AdminUserRepository userRepo;
    @Mock private RefreshTokenRepository refreshRepo;
    @Mock private JwtIssuer issuer;
    @Mock private PasswordEncoder encoder;
    private ArologisJwtProperties props;

    @InjectMocks private AdminLoginService svc;

    @BeforeEach
    void setUp() {
        props = new ArologisJwtProperties();
        props.setAccessExpirySeconds(3600);
        props.setRefreshExpirySeconds(2592000);
        ReflectionTestUtils.setField(svc, "props", props);
    }

    @Test
    void success_emits_access_and_refresh_and_persists_refresh_hash() {
        UUID id = UUID.randomUUID();
        AdminUser u = AdminUser.create("admin", "hash", "관리자", AdminUserRole.AROLOGIS_MASTER);
        ReflectionTestUtils.setField(u, "id", id);
        when(userRepo.findByLoginIdAndIsDeletedFalse("admin")).thenReturn(Optional.of(u));
        when(encoder.matches("pw", "hash")).thenReturn(true);
        when(issuer.issueAccessForAdmin(eq(id), eq("admin"), eq(AdminUserRole.AROLOGIS_MASTER)))
                .thenReturn("ACCESS");
        when(issuer.issueRefreshToken()).thenReturn("REFRESH");
        when(issuer.hash("REFRESH")).thenReturn("RHASH");

        AuthTokenResponse res = svc.login(new AdminLoginRequest("admin", "pw"));

        assertThat(res.accessToken()).isEqualTo("ACCESS");
        assertThat(res.refreshToken()).isEqualTo("REFRESH");
        assertThat(res.role()).isEqualTo("AROLOGIS_MASTER");
        verify(refreshRepo).save(any(RefreshToken.class));
    }

    @Test
    void unknown_loginId_throws_BadCredentials() {
        when(userRepo.findByLoginIdAndIsDeletedFalse(any())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> svc.login(new AdminLoginRequest("x", "x")))
                .isInstanceOf(BadCredentialsException.class);
    }

    @Test
    void wrong_password_throws_BadCredentials() {
        AdminUser u = AdminUser.create("a", "hash", "n", AdminUserRole.AROLOGIS_MANAGER);
        when(userRepo.findByLoginIdAndIsDeletedFalse("a")).thenReturn(Optional.of(u));
        lenient().when(encoder.matches(any(), any())).thenReturn(false);

        assertThatThrownBy(() -> svc.login(new AdminLoginRequest("a", "wrong")))
                .isInstanceOf(BadCredentialsException.class);
    }
}
