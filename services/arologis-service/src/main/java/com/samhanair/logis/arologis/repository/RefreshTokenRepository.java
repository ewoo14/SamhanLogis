package com.samhanair.logis.arologis.repository;

import com.samhanair.logis.arologis.domain.auth.RefreshToken;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/**
 * RefreshToken 저장소 — 2026-05-14 분리.
 *
 * <p>활성 (revoked=false + is_deleted=false) tokenHash 조회. rotation / refresh 흐름 진입점.
 */
@Repository
public interface RefreshTokenRepository extends JpaRepository<RefreshToken, UUID> {

    /** 활성 (미revoked + 미soft-delete) tokenHash 조회 — rotation/refresh 진입점. */
    Optional<RefreshToken> findByTokenHashAndRevokedFalseAndIsDeletedFalse(String tokenHash);
}
