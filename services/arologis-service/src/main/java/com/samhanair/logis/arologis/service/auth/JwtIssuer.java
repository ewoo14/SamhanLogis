package com.samhanair.logis.arologis.service.auth;

import com.samhanair.logis.arologis.config.ArologisJwtProperties;
import com.samhanair.logis.arologis.domain.auth.AdminUserRole;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import java.util.UUID;
import javax.crypto.SecretKey;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * 아로로지스 JWT 발급/검증 — 2026-05-14 분리.
 *
 * <p>HS256 (HMAC-SHA256) — admin / driver 양쪽 access token + refresh opaque 토큰 발급.
 * Refresh 는 평문 UUID.UUID 형태, 서버에 저장 시 SHA-256 Base64 해시.
 *
 * <p>claims (admin): sub (UUID) / iss / role / loginId / iat / exp
 * <br>claims (driver): sub (UUID) / iss / role=AROLOGIS_DRIVER / driverCode / phoneNumber / iat / exp
 */
@Component
@RequiredArgsConstructor
public class JwtIssuer {

    public static final String ROLE_DRIVER = "AROLOGIS_DRIVER";

    private final ArologisJwtProperties props;

    /**
     * admin access token 발급.
     *
     * @param userId AdminUser.id (UUID, sub claim)
     * @param loginId 사용자 노출 식별자 (loginId claim — UUID 노출 회피)
     * @param role 아로로지스 admin 롤(AdminUserRole 6-롤 중 하나)
     */
    public String issueAccessForAdmin(UUID userId, String loginId, AdminUserRole role) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(userId.toString())
                .issuer(props.getIssuer())
                .claim("role", role.name())
                .claim("loginId", loginId)
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusSeconds(props.getAccessExpirySeconds())))
                .signWith(key())
                .compact();
    }

    /**
     * driver access token 발급 (passwordless).
     *
     * @param driverId Driver.id (UUID, sub claim)
     * @param driverCode 사용자 노출 식별자 (driverCode claim)
     * @param phoneNumber 본인 휴대번호 (phoneNumber claim — PII 노출 감수, spec §6.3 PII note)
     */
    public String issueAccessForDriver(UUID driverId, String driverCode, String phoneNumber) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(driverId.toString())
                .issuer(props.getIssuer())
                .claim("role", ROLE_DRIVER)
                .claim("driverCode", driverCode)
                .claim("phoneNumber", phoneNumber)
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusSeconds(props.getAccessExpirySeconds())))
                .signWith(key())
                .compact();
    }

    /**
     * Refresh opaque 토큰 발급 — UUID.UUID 형태 (122 bit 엔트로피).
     *
     * <p>평문은 client 에 1회 반환, 서버는 SHA-256 Base64 해시만 저장.
     */
    public String issueRefreshToken() {
        return UUID.randomUUID() + "." + UUID.randomUUID();
    }

    /**
     * 토큰 SHA-256 Base64 해시 — RefreshToken 저장 시 평문 회피.
     */
    public String hash(String token) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return Base64.getEncoder().encodeToString(md.digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 미지원", e);
        }
    }

    /**
     * Bearer JWT parse — issuer + sig + exp 검증. 만료/위변조 시 JwtException.
     */
    public Claims parse(String token) {
        return Jwts.parser()
                .verifyWith(key())
                .requireIssuer(props.getIssuer())
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    private SecretKey key() {
        byte[] bytes = props.getSecret().getBytes(StandardCharsets.UTF_8);
        return Keys.hmacShaKeyFor(bytes);
    }
}
