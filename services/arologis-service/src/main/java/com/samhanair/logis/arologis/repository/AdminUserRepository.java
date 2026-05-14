package com.samhanair.logis.arologis.repository;

import com.samhanair.logis.arologis.domain.auth.AdminUser;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/**
 * AdminUser 저장소 — 2026-05-14 분리 (자체 user 도메인).
 *
 * <p>활성 (`is_deleted=false`) 조회는 `@SQLRestriction` 으로 자동 가드되지만, 명시적
 * {@code findByLoginIdAndIsDeletedFalse} 메서드는 가독성 / 의도 명확화를 위해 유지.
 */
@Repository
public interface AdminUserRepository extends JpaRepository<AdminUser, UUID> {

    /** loginId 로 활성 사용자 조회 — `@SQLRestriction` 가드와 같이 1단계 추가 명시. */
    Optional<AdminUser> findByLoginIdAndIsDeletedFalse(String loginId);
}
