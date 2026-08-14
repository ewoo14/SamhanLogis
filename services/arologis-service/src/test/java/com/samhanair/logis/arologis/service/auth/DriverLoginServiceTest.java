package com.samhanair.logis.arologis.service.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.arologis.config.ArologisJwtProperties;
import com.samhanair.logis.arologis.domain.Driver;
import com.samhanair.logis.arologis.domain.DriverSource;
import com.samhanair.logis.arologis.domain.auth.RefreshToken;
import com.samhanair.logis.arologis.dto.AuthTokenResponse;
import com.samhanair.logis.arologis.dto.DriverLoginRequest;
import com.samhanair.logis.arologis.repository.DriverRepository;
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
import org.springframework.test.util.ReflectionTestUtils;

/**
 * DriverLoginService 검증 — 2026-05-14 분리 (passwordless).
 *
 * <p>등록된 phoneNumber → AROLOGIS_DRIVER JWT 발급. 미등록 phoneNumber → 401.
 */
@ExtendWith(MockitoExtension.class)
class DriverLoginServiceTest {

    @Mock private DriverRepository driverRepo;
    @Mock private RefreshTokenRepository refreshRepo;
    @Mock private JwtIssuer issuer;
    private ArologisJwtProperties props;

    @InjectMocks private DriverLoginService svc;

    @BeforeEach
    void setUp() {
        props = new ArologisJwtProperties();
        props.setAccessExpirySeconds(3600);
        props.setRefreshExpirySeconds(2592000);
        ReflectionTestUtils.setField(svc, "props", props);
    }

    @Test
    void registered_phone_issues_driver_jwt() {
        UUID id = UUID.randomUUID();
        Driver d = Driver.of("D001", "01012345678", "1톤", DriverSource.INTERNAL, false, null);
        ReflectionTestUtils.setField(d, "id", id);
        when(driverRepo.findByNormalizedPhoneNumberAndIsDeletedFalse("01012345678")).thenReturn(Optional.of(d));
        when(issuer.issueAccessForDriver(id, "D001", "01012345678")).thenReturn("ACCESS");
        when(issuer.issueRefreshToken()).thenReturn("REFRESH");
        when(issuer.hash("REFRESH")).thenReturn("RHASH");

        AuthTokenResponse res = svc.login(new DriverLoginRequest("01012345678"));

        assertThat(res.accessToken()).isEqualTo("ACCESS");
        assertThat(res.refreshToken()).isEqualTo("REFRESH");
        assertThat(res.role()).isEqualTo("AROLOGIS_DRIVER");
        assertThat(res.driverCode()).isEqualTo("D001");
        assertThat(res.phoneNumber()).isEqualTo("01012345678");
        verify(refreshRepo).save(any(RefreshToken.class));
    }

    @Test
    void registered_hyphenated_phone_accepts_digits_only_login() {
        UUID id = UUID.randomUUID();
        Driver d = Driver.of("D-HYPHEN", "010-2000-0001", "1톤", DriverSource.INTERNAL, false, null);
        ReflectionTestUtils.setField(d, "id", id);
        when(driverRepo.findByNormalizedPhoneNumberAndIsDeletedFalse("01020000001")).thenReturn(Optional.of(d));
        when(issuer.issueAccessForDriver(id, "D-HYPHEN", "010-2000-0001")).thenReturn("ACCESS");
        when(issuer.issueRefreshToken()).thenReturn("REFRESH");
        when(issuer.hash("REFRESH")).thenReturn("RHASH");

        AuthTokenResponse res = svc.login(new DriverLoginRequest("01020000001"));

        assertThat(res.driverCode()).isEqualTo("D-HYPHEN");
        assertThat(res.phoneNumber()).isEqualTo("010-2000-0001");
    }

    @Test
    void registered_hyphenated_phone_accepts_hyphenated_login() {
        UUID id = UUID.randomUUID();
        Driver d = Driver.of("D-HYPHEN", "010-2000-0001", "1톤", DriverSource.INTERNAL, false, null);
        ReflectionTestUtils.setField(d, "id", id);
        when(driverRepo.findByNormalizedPhoneNumberAndIsDeletedFalse("01020000001")).thenReturn(Optional.of(d));
        when(issuer.issueAccessForDriver(id, "D-HYPHEN", "010-2000-0001")).thenReturn("ACCESS");
        when(issuer.issueRefreshToken()).thenReturn("REFRESH");
        when(issuer.hash("REFRESH")).thenReturn("RHASH");

        AuthTokenResponse res = svc.login(new DriverLoginRequest("010-2000-0001"));

        assertThat(res.driverCode()).isEqualTo("D-HYPHEN");
    }

    @Test
    void unregistered_phone_throws_BadCredentials() {
        when(driverRepo.findByNormalizedPhoneNumberAndIsDeletedFalse(any())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> svc.login(new DriverLoginRequest("01099999999")))
                .isInstanceOf(BadCredentialsException.class);
    }
}
