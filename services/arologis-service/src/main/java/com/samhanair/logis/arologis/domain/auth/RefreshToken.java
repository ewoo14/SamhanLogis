package com.samhanair.logis.arologis.domain.auth;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 아로로지스 RefreshToken — 2026-05-14 분리 (rotation 지원).
 *
 * <p>30일 유효 (기본), rotation 의무. tokenHash (SHA-256 Base64) 만 저장 — 평문 토큰은 client 만
 * 보관. AdminUser / Driver 양쪽 활용 (polymorphic userId + userType).
 *
 * <p>BaseEntity 7 audit + Soft Delete (`@SQLRestriction`) 일관.
 */
@Entity
@Getter
@Table(name = "auth_refresh_token")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class RefreshToken extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(name = "user_type", nullable = false, length = 16)
    private RefreshTokenUserType userType;

    @Column(name = "token_hash", nullable = false, length = 200)
    private String tokenHash;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "revoked", nullable = false)
    private boolean revoked;

    private RefreshToken(UUID userId, RefreshTokenUserType userType, String tokenHash, Instant expiresAt) {
        if (userId == null) {
            throw new IllegalArgumentException("userId 필수");
        }
        if (userType == null) {
            throw new IllegalArgumentException("userType 필수");
        }
        if (tokenHash == null || tokenHash.isBlank()) {
            throw new IllegalArgumentException("tokenHash 필수");
        }
        if (expiresAt == null) {
            throw new IllegalArgumentException("expiresAt 필수");
        }
        this.userId = userId;
        this.userType = userType;
        this.tokenHash = tokenHash;
        this.expiresAt = expiresAt;
        this.revoked = false;
    }

    /**
     * RefreshToken 발급.
     *
     * @param userId AdminUser.id 또는 Driver.id (polymorphic)
     * @param userType ADMIN | DRIVER
     * @param tokenHash 평문 토큰의 SHA-256 Base64 해시
     * @param expiresAt 만료 시각 (UTC Instant)
     */
    public static RefreshToken issue(UUID userId, RefreshTokenUserType userType,
                                     String tokenHash, Instant expiresAt) {
        return new RefreshToken(userId, userType, tokenHash, expiresAt);
    }

    /** rotation 또는 logout 시 revoked 마킹 — 이후 검색 제외. */
    public void revoke() {
        this.revoked = true;
    }
}
