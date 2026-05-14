package com.samhanair.logis.arologis.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.arologis.domain.auth.RefreshToken;
import com.samhanair.logis.arologis.domain.auth.RefreshTokenUserType;
import com.samhanair.logis.arologis.it.AbstractPostgresIT;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

/**
 * RefreshTokenRepository 검증 — 2026-05-14 분리.
 *
 * <p>활성 tokenHash 조회 / revoked 제외 / Soft Delete 제외.
 */
@SpringBootTest
@Transactional
class RefreshTokenRepositoryTest extends AbstractPostgresIT {

    @Autowired
    private RefreshTokenRepository repo;

    @Test
    void save_and_find_by_token_hash_active() {
        UUID userId = UUID.randomUUID();
        RefreshToken rt = RefreshToken.issue(
                userId,
                RefreshTokenUserType.ADMIN,
                "hash-abc",
                Instant.now().plus(30, ChronoUnit.DAYS));
        repo.save(rt);

        assertThat(repo.findByTokenHashAndRevokedFalseAndIsDeletedFalse("hash-abc")).isPresent();
    }

    @Test
    void revoked_excluded() {
        RefreshToken rt = RefreshToken.issue(
                UUID.randomUUID(),
                RefreshTokenUserType.DRIVER,
                "hash-revoked",
                Instant.now().plus(60, ChronoUnit.SECONDS));
        rt.revoke();
        repo.save(rt);

        assertThat(repo.findByTokenHashAndRevokedFalseAndIsDeletedFalse("hash-revoked")).isEmpty();
    }

    @Test
    void soft_deleted_excluded() {
        RefreshToken rt = RefreshToken.issue(
                UUID.randomUUID(),
                RefreshTokenUserType.ADMIN,
                "hash-deleted",
                Instant.now().plus(60, ChronoUnit.SECONDS));
        rt.markDeleted("system");
        repo.save(rt);

        assertThat(repo.findByTokenHashAndRevokedFalseAndIsDeletedFalse("hash-deleted")).isEmpty();
    }
}
