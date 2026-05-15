package com.samhanair.logis.arologis.service.auth;

import com.samhanair.logis.arologis.config.ArologisJwtProperties;
import com.samhanair.logis.arologis.domain.auth.AdminUser;
import com.samhanair.logis.arologis.domain.auth.RefreshToken;
import com.samhanair.logis.arologis.domain.auth.RefreshTokenUserType;
import com.samhanair.logis.arologis.dto.AdminLoginRequest;
import com.samhanair.logis.arologis.dto.AuthTokenResponse;
import com.samhanair.logis.arologis.repository.AdminUserRepository;
import com.samhanair.logis.arologis.repository.RefreshTokenRepository;
import java.time.Instant;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * AdminUser 로그인 service — 2026-05-14 분리.
 *
 * <p>loginId + password (BCrypt) 검증 → 성공 시 access + refresh 발급 + RefreshToken
 * (SHA-256 해시) 영속화. 실패 시 401 (BadCredentialsException).
 *
 * <p>Soft Delete 된 사용자는 `findByLoginIdAndIsDeletedFalse` 단계에서 제외 (@SQLRestriction).
 */
@Service
@RequiredArgsConstructor
@Transactional
public class AdminLoginService {

    private final AdminUserRepository userRepo;
    private final RefreshTokenRepository refreshRepo;
    private final JwtIssuer issuer;
    private final PasswordEncoder encoder;
    private final ArologisJwtProperties props;

    /**
     * admin 로그인 — loginId+password 검증 + JWT 발급.
     *
     * @throws BadCredentialsException loginId 미존재 또는 password 불일치
     */
    public AuthTokenResponse login(AdminLoginRequest req) {
        AdminUser user = userRepo.findByLoginIdAndIsDeletedFalse(req.loginId())
                .orElseThrow(() -> new BadCredentialsException("invalid credentials"));
        if (!encoder.matches(req.password(), user.getPasswordHash())) {
            throw new BadCredentialsException("invalid credentials");
        }
        String access = issuer.issueAccessForAdmin(user.getId(), user.getLoginId(), user.getRole());
        String refresh = issuer.issueRefreshToken();
        Instant refreshExp = Instant.now().plusSeconds(props.getRefreshExpirySeconds());
        refreshRepo.save(RefreshToken.issue(
                user.getId(), RefreshTokenUserType.ADMIN, issuer.hash(refresh), refreshExp));

        Instant accessExp = Instant.now().plusSeconds(props.getAccessExpirySeconds());
        return AuthTokenResponse.admin(
                access, refresh, user.getRole().name(), accessExp, user.getLoginId(), user.getName());
    }
}
