package com.samhanair.logis.notification.repository;

import com.samhanair.logis.notification.domain.NotificationCenter;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * NotificationCenter 조회.
 *
 * <p>target_role TEXT[] / target_user_id UUID 조합 필터. role 매칭은 PostgreSQL array containment
 * operator 로 처리해 GIN index 를 활용한다.
 */
public interface NotificationCenterRepository extends JpaRepository<NotificationCenter, UUID> {

    java.util.Optional<NotificationCenter> findFirstByTargetUserIdAndSourceServiceAndSourceRefIdAndChannel(
            UUID targetUserId, String sourceService, String sourceRefId, String channel);

    /**
     * 사용자 미확인 알림 (read_at IS NULL) 조회. 최신순.
     * (target_user_id = userId 이거나, role 이 있을 때 target_role 에 role 이 포함되는) 조합.
     */
    @Query(value = """
            SELECT n.* FROM notification_center n
            WHERE n.is_deleted = FALSE
              AND n.read_at IS NULL
              AND (
                   n.target_user_id = :userId
                OR (n.target_role IS NOT NULL
                    AND :role IS NOT NULL
                    AND n.target_role @> ARRAY[CAST(:role AS text)])
              )
            ORDER BY n.created_at DESC
            """, nativeQuery = true)
    List<NotificationCenter> findMyUnread(@Param("userId") UUID userId, @Param("role") String role);

    /**
     * 사용자 전체 알림 history (read_at 무관). 페이지네이션.
     */
    @Query(value = """
            SELECT n.* FROM notification_center n
            WHERE n.is_deleted = FALSE
              AND (
                   n.target_user_id = :userId
                OR (n.target_role IS NOT NULL
                    AND :role IS NOT NULL
                    AND n.target_role @> ARRAY[CAST(:role AS text)])
              )
            ORDER BY n.created_at DESC
            """,
            countQuery = """
            SELECT count(*) FROM notification_center n
            WHERE n.is_deleted = FALSE
              AND (
                   n.target_user_id = :userId
                OR (n.target_role IS NOT NULL
                    AND :role IS NOT NULL
                    AND n.target_role @> ARRAY[CAST(:role AS text)])
              )
            """,
            nativeQuery = true)
    Page<NotificationCenter> findMyHistory(@Param("userId") UUID userId, @Param("role") String role, Pageable pageable);
}
