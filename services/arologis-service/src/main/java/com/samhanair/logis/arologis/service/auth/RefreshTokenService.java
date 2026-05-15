package com.samhanair.logis.arologis.service.auth;

import com.samhanair.logis.arologis.config.ArologisJwtProperties;
import com.samhanair.logis.arologis.domain.Driver;
import com.samhanair.logis.arologis.domain.auth.AdminUser;
import com.samhanair.logis.arologis.domain.auth.RefreshToken;
import com.samhanair.logis.arologis.domain.auth.RefreshTokenUserType;
import com.samhanair.logis.arologis.dto.AuthTokenResponse;
import com.samhanair.logis.arologis.repository.AdminUserRepository;
import com.samhanair.logis.arologis.repository.DriverRepository;
import com.samhanair.logis.arologis.repository.RefreshTokenRepository;
import java.time.Instant;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * RefreshToken rotation / logout service — 2026-05-14 분리.
 *
 * <p>refresh 흐름:
 * <ol>
 *   <li>전달된 평문 refresh → SHA-256 해시 → lookup (revoked=false, is_deleted=false)
 *   <li>만료 검사 (Instant.now 가 expiresAt 초과 시 401)
 *   <li>기존 토큰 revoke (rotation 의무)
 *   <li>userType 별 신규 access + refresh 발급 + 신규 RefreshToken 영속화
 * </ol>
 *
 * <p>logout: 같은 lookup 후 revoke (idempotent — 없으면 무시).
 */
@Service
@RequiredArgsConstructor
@Transactional
public class RefreshTokenService {

    private final RefreshTokenRepository refreshRepo;
    private final AdminUserRepository adminRepo;
    private final DriverRepository driverRepo;
    private final JwtIssuer issuer;
    private final ArologisJwtProperties props;

    /**
     * refresh token rotation — 기존 revoke + 신규 access/refresh 발급.
     *
     * @throws BadCredentialsException token 미존재 / revoked / 만료 / 사용자 사라짐
     */
    public AuthTokenResponse refresh(String oldRefresh) {
        String hash = issuer.hash(oldRefresh);
        RefreshToken existing = refreshRepo.findByTokenHashAndRevokedFalseAndIsDeletedFalse(hash)
                .orElseThrow(() -> new BadCredentialsException("invalid refresh"));
        if (existing.getExpiresAt().isBefore(Instant.now())) {
            throw new BadCredentialsException("expired refresh");
        }
        existing.revoke();

        String newAccess;
        String role;
        String loginId = null;
        String fullName = null;
        String driverCode = null;
        String phoneNumber = null;
        if (existing.getUserType() == RefreshTokenUserType.ADMIN) {
            AdminUser u = adminRepo.findById(existing.getUserId())
                    .orElseThrow(() -> new BadCredentialsException("user gone"));
            newAccess = issuer.issueAccessForAdmin(u.getId(), u.getLoginId(), u.getRole());
            role = u.getRole().name();
            loginId = u.getLoginId();
            fullName = u.getName();
        } else {
            Driver d = driverRepo.findById(existing.getUserId())
                    .orElseThrow(() -> new BadCredentialsException("driver gone"));
            newAccess = issuer.issueAccessForDriver(d.getId(), d.getDriverCode(), d.getPhoneNumber());
            role = JwtIssuer.ROLE_DRIVER;
            driverCode = d.getDriverCode();
            phoneNumber = d.getPhoneNumber();
        }
        String newRefresh = issuer.issueRefreshToken();
        Instant refreshExp = Instant.now().plusSeconds(props.getRefreshExpirySeconds());
        refreshRepo.save(RefreshToken.issue(
                existing.getUserId(), existing.getUserType(), issuer.hash(newRefresh), refreshExp));

        Instant accessExp = Instant.now().plusSeconds(props.getAccessExpirySeconds());
        return new AuthTokenResponse(
                newAccess,
                newRefresh,
                role,
                accessExp,
                loginId,
                fullName,
                driverCode,
                phoneNumber);
    }

    /**
     * Logout — refresh 토큰 revoke (idempotent). 없거나 이미 revoked 면 무시.
     */
    public void logout(String refreshToken) {
        refreshRepo.findByTokenHashAndRevokedFalseAndIsDeletedFalse(issuer.hash(refreshToken))
                .ifPresent(RefreshToken::revoke);
    }
}
