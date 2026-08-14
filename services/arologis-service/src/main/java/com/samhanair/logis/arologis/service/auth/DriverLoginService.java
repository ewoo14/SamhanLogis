package com.samhanair.logis.arologis.service.auth;

import com.samhanair.logis.arologis.config.ArologisJwtProperties;
import com.samhanair.logis.arologis.domain.Driver;
import com.samhanair.logis.arologis.domain.auth.RefreshToken;
import com.samhanair.logis.arologis.domain.auth.RefreshTokenUserType;
import com.samhanair.logis.arologis.dto.AuthTokenResponse;
import com.samhanair.logis.arologis.dto.DriverLoginRequest;
import com.samhanair.logis.arologis.repository.DriverRepository;
import com.samhanair.logis.arologis.repository.RefreshTokenRepository;
import java.time.Instant;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Driver 로그인 service — 2026-05-14 분리 (passwordless).
 *
 * <p>사전 등록된 phoneNumber 만 허용. 미등록 시 401 (BadCredentialsException). 본 PR scope
 * 내에서 OTP SMS 없음. 사용자 노출 식별자 = phoneNumber + driverCode (UUID 비공개).
 */
@Service
@RequiredArgsConstructor
@Transactional
public class DriverLoginService {

    private final DriverRepository driverRepo;
    private final RefreshTokenRepository refreshRepo;
    private final JwtIssuer issuer;
    private final ArologisJwtProperties props;

    /**
     * Driver 로그인 — phoneNumber 만으로 JWT 발급 (사전 등록 검증).
     *
     * @throws BadCredentialsException phoneNumber 미등록 또는 Soft Deleted Driver
     */
    public AuthTokenResponse login(DriverLoginRequest req) {
        String lookupPhoneNumber = req.phoneNumber().replace("-", "");
        Driver d = driverRepo.findByNormalizedPhoneNumberAndIsDeletedFalse(lookupPhoneNumber)
                .orElseThrow(() -> new BadCredentialsException("unregistered driver"));

        String access = issuer.issueAccessForDriver(d.getId(), d.getDriverCode(), d.getPhoneNumber());
        String refresh = issuer.issueRefreshToken();
        Instant refreshExp = Instant.now().plusSeconds(props.getRefreshExpirySeconds());
        refreshRepo.save(RefreshToken.issue(
                d.getId(), RefreshTokenUserType.DRIVER, issuer.hash(refresh), refreshExp));

        Instant accessExp = Instant.now().plusSeconds(props.getAccessExpirySeconds());
        return AuthTokenResponse.driver(
                access, refresh, JwtIssuer.ROLE_DRIVER, accessExp, d.getDriverCode(), d.getPhoneNumber());
    }
}
