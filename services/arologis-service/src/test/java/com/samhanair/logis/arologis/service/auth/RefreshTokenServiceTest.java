package com.samhanair.logis.arologis.service.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.arologis.config.ArologisJwtProperties;
import com.samhanair.logis.arologis.domain.Driver;
import com.samhanair.logis.arologis.domain.DriverSource;
import com.samhanair.logis.arologis.domain.auth.AdminUser;
import com.samhanair.logis.arologis.domain.auth.AdminUserRole;
import com.samhanair.logis.arologis.domain.auth.RefreshToken;
import com.samhanair.logis.arologis.domain.auth.RefreshTokenUserType;
import com.samhanair.logis.arologis.dto.AuthTokenResponse;
import com.samhanair.logis.arologis.repository.AdminUserRepository;
import com.samhanair.logis.arologis.repository.DriverRepository;
import com.samhanair.logis.arologis.repository.RefreshTokenRepository;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * RefreshTokenService 검증 — 2026-05-14 분리.
 *
 * <p>정상 rotation / 만료 / revoked (미존재) / logout idempotent.
 */
@ExtendWith(MockitoExtension.class)
class RefreshTokenServiceTest {

    @Mock private RefreshTokenRepository refreshRepo;
    @Mock private AdminUserRepository adminRepo;
    @Mock private DriverRepository driverRepo;
    @Mock private JwtIssuer issuer;
    private ArologisJwtProperties props;

    @InjectMocks private RefreshTokenService svc;

    @BeforeEach
    void setUp() {
        props = new ArologisJwtProperties();
        props.setAccessExpirySeconds(3600);
        props.setRefreshExpirySeconds(2592000);
        ReflectionTestUtils.setField(svc, "props", props);
    }

    @Test
    void normal_rotation_revokes_old_and_issues_new() {
        UUID userId = UUID.randomUUID();
        AdminUser u = AdminUser.create("admin", "h", "관리자", AdminUserRole.AROLOGIS_MANAGER);
        ReflectionTestUtils.setField(u, "id", userId);
        RefreshToken existing = RefreshToken.issue(
                userId, RefreshTokenUserType.ADMIN, "OLDHASH",
                Instant.now().plus(60, ChronoUnit.MINUTES));

        when(issuer.hash("OLD-REFRESH")).thenReturn("OLDHASH");
        when(refreshRepo.findByTokenHashAndRevokedFalseAndIsDeletedFalse("OLDHASH"))
                .thenReturn(Optional.of(existing));
        when(adminRepo.findById(userId)).thenReturn(Optional.of(u));
        when(issuer.issueAccessForAdmin(userId, "admin", AdminUserRole.AROLOGIS_MANAGER))
                .thenReturn("NEW-ACCESS");
        when(issuer.issueRefreshToken()).thenReturn("NEW-REFRESH");
        when(issuer.hash("NEW-REFRESH")).thenReturn("NEWHASH");

        AuthTokenResponse res = svc.refresh("OLD-REFRESH");

        assertThat(res.accessToken()).isEqualTo("NEW-ACCESS");
        assertThat(res.refreshToken()).isEqualTo("NEW-REFRESH");
        assertThat(res.role()).isEqualTo("AROLOGIS_MANAGER");
        assertThat(res.loginId()).isEqualTo("admin");
        assertThat(res.fullName()).isEqualTo(u.getName());
        assertThat(existing.isRevoked()).isTrue();
        verify(refreshRepo).save(any(RefreshToken.class));
    }

    @Test
    void driver_rotation_keeps_public_driver_identity() {
        UUID userId = UUID.randomUUID();
        Driver d = Driver.of("D001", "01012345678", "cargo", DriverSource.INTERNAL, false, null);
        ReflectionTestUtils.setField(d, "id", userId);
        RefreshToken existing = RefreshToken.issue(
                userId, RefreshTokenUserType.DRIVER, "OLDHASH",
                Instant.now().plus(60, ChronoUnit.MINUTES));

        when(issuer.hash("OLD-DRIVER-REFRESH")).thenReturn("OLDHASH");
        when(refreshRepo.findByTokenHashAndRevokedFalseAndIsDeletedFalse("OLDHASH"))
                .thenReturn(Optional.of(existing));
        when(driverRepo.findById(userId)).thenReturn(Optional.of(d));
        when(issuer.issueAccessForDriver(userId, "D001", "01012345678"))
                .thenReturn("NEW-DRIVER-ACCESS");
        when(issuer.issueRefreshToken()).thenReturn("NEW-DRIVER-REFRESH");
        when(issuer.hash("NEW-DRIVER-REFRESH")).thenReturn("NEWDRIVERHASH");

        AuthTokenResponse res = svc.refresh("OLD-DRIVER-REFRESH");

        assertThat(res.accessToken()).isEqualTo("NEW-DRIVER-ACCESS");
        assertThat(res.refreshToken()).isEqualTo("NEW-DRIVER-REFRESH");
        assertThat(res.role()).isEqualTo("AROLOGIS_DRIVER");
        assertThat(res.driverCode()).isEqualTo("D001");
        assertThat(res.phoneNumber()).isEqualTo("01012345678");
        assertThat(existing.isRevoked()).isTrue();
        verify(refreshRepo).save(any(RefreshToken.class));
    }

    @Test
    void expired_refresh_throws_BadCredentials() {
        UUID userId = UUID.randomUUID();
        RefreshToken expired = RefreshToken.issue(
                userId, RefreshTokenUserType.ADMIN, "EXPIRED",
                Instant.now().minus(1, ChronoUnit.MINUTES));

        when(issuer.hash("EXPIRED-REFRESH")).thenReturn("EXPIRED");
        when(refreshRepo.findByTokenHashAndRevokedFalseAndIsDeletedFalse("EXPIRED"))
                .thenReturn(Optional.of(expired));

        assertThatThrownBy(() -> svc.refresh("EXPIRED-REFRESH"))
                .isInstanceOf(BadCredentialsException.class);
        assertThat(expired.isRevoked()).isFalse();
        verify(refreshRepo, never()).save(any(RefreshToken.class));
    }

    @Test
    void unknown_or_revoked_refresh_throws_BadCredentials() {
        when(issuer.hash("UNKNOWN-REFRESH")).thenReturn("UNKHASH");
        when(refreshRepo.findByTokenHashAndRevokedFalseAndIsDeletedFalse("UNKHASH"))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> svc.refresh("UNKNOWN-REFRESH"))
                .isInstanceOf(BadCredentialsException.class);
    }

    @Test
    void logout_is_idempotent_when_token_unknown() {
        when(issuer.hash("X")).thenReturn("XHASH");
        when(refreshRepo.findByTokenHashAndRevokedFalseAndIsDeletedFalse("XHASH"))
                .thenReturn(Optional.empty());

        svc.logout("X");

        verify(refreshRepo, never()).save(any(RefreshToken.class));
    }

    @Test
    void logout_revokes_existing_token() {
        UUID userId = UUID.randomUUID();
        RefreshToken existing = RefreshToken.issue(
                userId, RefreshTokenUserType.ADMIN, "LIVEHASH",
                Instant.now().plus(60, ChronoUnit.MINUTES));
        when(issuer.hash("LIVE")).thenReturn("LIVEHASH");
        when(refreshRepo.findByTokenHashAndRevokedFalseAndIsDeletedFalse("LIVEHASH"))
                .thenReturn(Optional.of(existing));

        svc.logout("LIVE");

        assertThat(existing.isRevoked()).isTrue();
    }
}
