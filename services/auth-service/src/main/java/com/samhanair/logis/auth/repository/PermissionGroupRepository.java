package com.samhanair.logis.auth.repository;

import com.samhanair.logis.auth.domain.PermissionGroup;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** 동적 권한그룹 저장소. */
public interface PermissionGroupRepository extends JpaRepository<PermissionGroup, UUID> {

    Optional<PermissionGroup> findByNameAndIsDeletedFalse(String name);

    List<PermissionGroup> findByIsDeletedFalse();

    Optional<PermissionGroup> findByIdAndIsDeletedFalse(UUID id);

    /**
     * 특정 계정이 {@code is_system_master=true} 인 권한그룹에 배속되어 있는지 확인 — Phase C4 신규.
     *
     * <p>login 시 JWT {@code isSystemMaster} claim 산출에 사용된다.
     * account_groups(is_deleted=false) JOIN permission_groups(is_deleted=false, is_system_master=true)
     * 조인 EXISTS 쿼리로 1회 호출로 처리한다.
     *
     * @param accountId 조회할 계정 UUID
     * @return 시스템 마스터 그룹에 배속되어 있으면 true
     */
    @Query("""
            SELECT COUNT(ag) > 0
            FROM AccountGroup ag
            JOIN PermissionGroup pg ON ag.groupId = pg.id
            WHERE ag.accountId = :accountId
              AND ag.isDeleted = false
              AND pg.isDeleted = false
              AND pg.systemMaster = true
            """)
    boolean existsByAccountIdAndSystemMasterTrue(@Param("accountId") UUID accountId);

    /**
     * 특정 계정의 활성 그룹 목록을 그룹 id 오름차순으로 조회한다 — Phase C5-3 신규.
     *
     * <p>로그인 시 {@link com.samhanair.logis.auth.service.dto.LoginResponse.GroupSummary} 생성에 사용된다.
     * {@code account_groups(is_deleted=false)} JOIN {@code permission_groups(is_deleted=false)} 조인.
     * {@code groupId} 오름차순 정렬로 순서 결정성 보장.
     *
     * @param accountId 조회할 계정 UUID
     * @return 해당 계정의 활성 그룹 목록 (빈 리스트 가능)
     */
    @Query("""
            SELECT pg
            FROM AccountGroup ag
            JOIN PermissionGroup pg ON ag.groupId = pg.id
            WHERE ag.accountId = :accountId
              AND ag.isDeleted = false
              AND pg.isDeleted = false
            ORDER BY pg.id ASC
            """)
    List<PermissionGroup> findActiveGroupsByAccountId(@Param("accountId") UUID accountId);
}
