package com.samhanair.logis.auth.repository;

import com.samhanair.logis.auth.domain.RolePagePermission;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * 동적 RBAC 권한 override 행 저장소.
 *
 * <p>{@code @SQLRestriction("is_deleted = false")} 가드로 인해
 * 모든 기본 쿼리는 활성 행만 반환한다.
 *
 * <p>Soft-delete 이후 복구가 필요한 경우 native query 를 통해 비활성 행을 직접 조회해야 한다.
 */
public interface RolePagePermissionRepository extends JpaRepository<RolePagePermission, UUID> {

    /**
     * 역할 코드로 모든 활성 권한 행 조회.
     *
     * @param roleCode 역할 코드 (예: MASTER, ACCOUNTANT)
     * @return 해당 역할의 모든 활성 권한 행 목록
     */
    List<RolePagePermission> findByRoleCode(String roleCode);

    /**
     * (역할 코드, 페이지 코드) 조합으로 단일 활성 권한 행 조회.
     *
     * <p>DB 레벨 UNIQUE INDEX ({@code uq_role_page_permissions_active}) 가 보장하므로
     * 최대 1개 반환.
     *
     * @param roleCode 역할 코드
     * @param pageCode 페이지 코드 (예: accounting.tax-invoice.emit-nts)
     * @return 활성 권한 행 Optional
     */
    Optional<RolePagePermission> findByRoleCodeAndPageCode(String roleCode, String pageCode);

    List<RolePagePermission> findByActorId(String actorId);

    /**
     * 전체 매트릭스 조회 — 마스터 관리 화면용.
     * 모든 활성 행을 role_code, page_code 순으로 정렬하여 반환.
     *
     * @return 전체 역할 × 페이지 권한 행 목록 (정렬: roleCode ASC, pageCode ASC)
     */
    @Query("SELECT p FROM RolePagePermission p ORDER BY p.roleCode ASC, p.pageCode ASC")
    List<RolePagePermission> findAllOrderByRoleCodeAndPageCode();

    /**
     * 특정 페이지 코드에 대한 모든 역할 권한 조회.
     *
     * @param pageCode 페이지 코드
     * @return 해당 페이지에 대한 모든 역할별 권한 행 목록
     */
    List<RolePagePermission> findByPageCode(String pageCode);

    /**
     * (역할 코드, 페이지 코드) 조합 존재 여부 확인 (활성 행만).
     *
     * @param roleCode 역할 코드
     * @param pageCode 페이지 코드
     * @return 활성 override 행이 존재하면 {@code true}
     */
    boolean existsByRoleCodeAndPageCode(String roleCode, String pageCode);

    /**
     * Soft-delete 전용 — 비활성 포함 단건 조회 (복구용).
     *
     * <p>{@code @SQLRestriction} 우회를 위해 native query 사용.
     * MASTER 가 삭제된 권한을 복구할 때 호출.
     *
     * @param roleCode 역할 코드
     * @param pageCode 페이지 코드
     * @return 비활성 포함 권한 행 Optional
     */
    @Query(value = "SELECT * FROM role_page_permissions "
            + "WHERE role_code = :roleCode AND page_code = :pageCode "
            + "AND is_deleted = TRUE LIMIT 1",
            nativeQuery = true)
    Optional<RolePagePermission> findDeletedByRoleCodeAndPageCode(
            @Param("roleCode") String roleCode,
            @Param("pageCode") String pageCode);
}
