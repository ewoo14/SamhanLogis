package com.samhanair.logis.notification.repository;

import com.samhanair.logis.notification.domain.PushDeviceToken;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/** 푸시 디바이스 토큰 저장소 — active row 는 entity SQLRestriction 으로만 조회된다. */
@Repository
public interface PushDeviceTokenRepository extends JpaRepository<PushDeviceToken, UUID> {

    Optional<PushDeviceToken> findByToken(String token);

    List<PushDeviceToken> findAllByUserIdOrderByLastSeenAtDesc(UUID userId);

    /**
     * active 또는 soft-delete 된 동일 토큰 row 하나를 재사용해 갱신한다.
     *
     * <p>{@code @SQLRestriction} 때문에 삭제 row 는 JPQL 로 조회되지 않으므로 native CTE 로
     * 하나의 후보만 선택한다. 과거 결함으로 삭제 row 가 중복되어 있어도 한 row 만 복구해
     * active partial unique index 충돌을 피한다.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(value = """
            WITH candidate AS (
                SELECT id
                  FROM push_device_tokens
                 WHERE token = :token
                 ORDER BY is_deleted ASC, last_seen_at DESC, created_at DESC
                 LIMIT 1
            )
            UPDATE push_device_tokens p
               SET user_id = :userId,
                   platform = :platform,
                   app_client = :appClient,
                   last_seen_at = CURRENT_TIMESTAMP,
                   modified_at = CURRENT_TIMESTAMP,
                   modified_by = :actor,
                   deleted_at = NULL,
                   deleted_by = NULL,
                   is_deleted = FALSE
             WHERE p.id IN (SELECT id FROM candidate)
            """, nativeQuery = true)
    int refreshExistingToken(@Param("userId") UUID userId,
                             @Param("token") String token,
                             @Param("platform") String platform,
                             @Param("appClient") String appClient,
                             @Param("actor") String actor);

    /**
     * 신규 row 를 생성하되, 동시 등록으로 active token 이 먼저 생긴 경우 해당 row 를 갱신한다.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(value = """
            INSERT INTO push_device_tokens (
                id, user_id, token, platform, app_client, last_seen_at,
                created_at, created_by, modified_at, modified_by, is_deleted
            )
            VALUES (
                :id, :userId, :token, :platform, :appClient, CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP, :actor, CURRENT_TIMESTAMP, :actor, FALSE
            )
            ON CONFLICT (token) WHERE is_deleted = FALSE
            DO UPDATE
               SET user_id = EXCLUDED.user_id,
                   platform = EXCLUDED.platform,
                   app_client = EXCLUDED.app_client,
                   last_seen_at = CURRENT_TIMESTAMP,
                   modified_at = CURRENT_TIMESTAMP,
                   modified_by = EXCLUDED.modified_by,
                   deleted_at = NULL,
                   deleted_by = NULL,
                   is_deleted = FALSE
            """, nativeQuery = true)
    void insertOrRefreshActiveToken(@Param("id") UUID id,
                                    @Param("userId") UUID userId,
                                    @Param("token") String token,
                                    @Param("platform") String platform,
                                    @Param("appClient") String appClient,
                                    @Param("actor") String actor);
}
