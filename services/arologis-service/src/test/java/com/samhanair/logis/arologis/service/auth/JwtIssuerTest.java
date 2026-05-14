package com.samhanair.logis.arologis.service.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.arologis.config.ArologisJwtProperties;
import com.samhanair.logis.arologis.domain.auth.AdminUserRole;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * JwtIssuer 검증 — 2026-05-14 분리.
 *
 * <p>admin / driver claims 정확성 + 만료 토큰 검증 실패 + UUID 비공개 가드 (loginId/driverCode
 * claim 으로 사용자 노출, sub claim 은 UUID).
 */
class JwtIssuerTest {

    private static final String SECRET_64 =
            "0123456789012345678901234567890123456789012345678901234567890123";

    private ArologisJwtProperties props;
    private JwtIssuer issuer;

    @BeforeEach
    void setUp() {
        props = new ArologisJwtProperties();
        props.setSecret(SECRET_64);
        props.setIssuer("arologis-service");
        props.setAccessExpirySeconds(3600);
        issuer = new JwtIssuer(props);
    }

    @Test
    void admin_token_contains_uuid_sub_and_loginId_role_claims() {
        UUID id = UUID.randomUUID();
        String token = issuer.issueAccessForAdmin(id, "admin", AdminUserRole.AROLOGIS_MASTER);

        Claims claims = issuer.parse(token);
        assertThat(claims.getSubject()).isEqualTo(id.toString());
        assertThat(claims.getIssuer()).isEqualTo("arologis-service");
        assertThat(claims.get("role")).isEqualTo("AROLOGIS_MASTER");
        assertThat(claims.get("loginId")).isEqualTo("admin");
    }

    @Test
    void driver_token_contains_uuid_sub_and_driverCode_phoneNumber_claims() {
        UUID id = UUID.randomUUID();
        String token = issuer.issueAccessForDriver(id, "D001", "01012345678");

        Claims claims = issuer.parse(token);
        assertThat(claims.getSubject()).isEqualTo(id.toString());
        assertThat(claims.get("role")).isEqualTo("AROLOGIS_DRIVER");
        assertThat(claims.get("driverCode")).isEqualTo("D001");
        assertThat(claims.get("phoneNumber")).isEqualTo("01012345678");
    }

    @Test
    void expired_token_throws_ExpiredJwtException() {
        props.setAccessExpirySeconds(-1);
        String token = issuer.issueAccessForAdmin(
                UUID.randomUUID(), "x", AdminUserRole.AROLOGIS_MASTER);

        assertThatThrownBy(() -> issuer.parse(token))
                .isInstanceOf(ExpiredJwtException.class);
    }

    @Test
    void issued_refresh_token_is_122bit_uuid_dot_uuid_form() {
        String refresh = issuer.issueRefreshToken();

        assertThat(refresh).matches(
                "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
              + "\\."
              + "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}");
    }

    @Test
    void hash_is_deterministic_sha256_base64() {
        String h1 = issuer.hash("sample-refresh-token");
        String h2 = issuer.hash("sample-refresh-token");
        assertThat(h1).isEqualTo(h2);
        // SHA-256 → 32 byte → Base64 = 44 char (including '=' padding).
        assertThat(h1).hasSize(44);
    }
}
