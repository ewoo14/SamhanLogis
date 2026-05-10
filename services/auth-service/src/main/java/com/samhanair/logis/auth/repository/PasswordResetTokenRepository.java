package com.samhanair.logis.auth.repository;

import com.samhanair.logis.auth.domain.PasswordResetToken;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * {@link PasswordResetToken} JPA 레포지토리 — P0-2 비밀번호 셀프 재설정.
 *
 * <p>Soft-delete 필터는 엔티티 레벨 {@code @SQLRestriction} 적용 — 쿼리에서 별도 필터 불필요.
 */
public interface PasswordResetTokenRepository extends JpaRepository<PasswordResetToken, UUID> {

    /**
     * 해시로 활성 토큰 단건 조회 — confirm 단계에서 사용.
     *
     * @param tokenHash SHA-256(인증번호) hex 문자열
     * @return 미사용 + 미삭제 토큰 (soft-delete 필터 자동 적용)
     */
    Optional<PasswordResetToken> findByTokenHash(String tokenHash);

    /**
     * 특정 사용자의 미사용 활성 토큰 목록 — 재발급 시 기존 토큰 일괄 무효화에 사용.
     *
     * @param userId 사용자 UUID
     * @return 미사용 토큰 목록 (만료 포함 — 호출자가 markUsed 처리)
     */
    List<PasswordResetToken> findByUserIdAndUsedFalse(UUID userId);

    /**
     * 만료된 미사용 토큰 soft-delete 배치 — 필요 시 스케줄러에서 호출.
     *
     * @param now 현재 시각
     */
    @Modifying
    @Query("""
            UPDATE PasswordResetToken t
               SET t.isDeleted = true,
                   t.deletedAt = :now,
                   t.deletedBy = 'SYSTEM-GC'
             WHERE t.used = false
               AND t.expiresAt < :now
               AND t.isDeleted = false
            """)
    int softDeleteExpired(@Param("now") LocalDateTime now);

    /**
     * 특정 사용자의 미사용 토큰 카운트 — rate-limit 검증에 사용.
     * (실제 rate-limit 은 Caffeine in-memory 로 처리 — 본 메서드는 보조 감사용)
     *
     * @param userId    사용자 UUID
     * @param createdAfter 이 시각 이후 생성된 것만 카운트
     * @return 카운트
     */
    @Query("""
            SELECT COUNT(t)
              FROM PasswordResetToken t
             WHERE t.userId = :userId
               AND t.createdAt >= :createdAfter
               AND t.isDeleted = false
            """)
    long countRecentByUserId(@Param("userId") UUID userId,
                             @Param("createdAfter") LocalDateTime createdAfter);
}
