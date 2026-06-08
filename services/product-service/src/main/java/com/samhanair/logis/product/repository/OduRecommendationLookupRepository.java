package com.samhanair.logis.product.repository;

import com.samhanair.logis.product.domain.OduRecommendationLookup;
import com.samhanair.logis.product.domain.OduRecommendationLookup.RecommendationType;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** OduRecommendationLookup CRUD + recommendationType + indoorCapacity 매트릭스. */
public interface OduRecommendationLookupRepository extends JpaRepository<OduRecommendationLookup, UUID> {

    /**
     * 추천 타입별 조회 — HOME_MULTI 의 null indoorCapacity 순서 흔들림을 방지한다.
     */
    @Query("""
            SELECT o
              FROM OduRecommendationLookup o
             WHERE o.recommendationType = :type
             ORDER BY o.recommendationType ASC,
                      o.indoorCapacity ASC NULLS LAST,
                      o.indoorCount ASC NULLS LAST,
                      o.outdoorHp ASC
            """)
    List<OduRecommendationLookup> findByRecommendationTypeOrderByIndoorCapacityAsc(@Param("type") RecommendationType type);

    /**
     * 전체 추천실외기 조회 — natural key 전체 튜플로 정렬해 API 응답 순서를 고정한다.
     */
    @Query("""
            SELECT o
              FROM OduRecommendationLookup o
             ORDER BY o.recommendationType ASC,
                      o.indoorCapacity ASC NULLS LAST,
                      o.indoorCount ASC NULLS LAST,
                      o.outdoorHp ASC
            """)
    List<OduRecommendationLookup> findAllByOrderByRecommendationTypeAscIndoorCapacityAsc();

    /**
     * 활성 추천실외기 natural key 조회 — null 실측 컬럼을 합성하지 않고 그대로 비교한다.
     *
     * @param recommendationType 추천 구분
     * @param indoorCapacity 실내기 용량, HOME_MULTI 는 null
     * @param indoorCount 실내기 대수, MULTI_HEATING_COOLING 은 null
     * @param outdoorHp 실외기 마력
     * @return 활성 row
     */
    @Query("""
            SELECT o
              FROM OduRecommendationLookup o
             WHERE o.recommendationType = :recommendationType
               AND ((:indoorCapacity IS NULL AND o.indoorCapacity IS NULL)
                    OR o.indoorCapacity = :indoorCapacity)
               AND ((:indoorCount IS NULL AND o.indoorCount IS NULL)
                    OR o.indoorCount = :indoorCount)
               AND o.outdoorHp = :outdoorHp
            """)
    Optional<OduRecommendationLookup> findActiveByNaturalKey(
            @Param("recommendationType") RecommendationType recommendationType,
            @Param("indoorCapacity") BigDecimal indoorCapacity,
            @Param("indoorCount") Integer indoorCount,
            @Param("outdoorHp") String outdoorHp);

    /**
     * soft-delete 포함 추천실외기 natural key 조회 — 시트 재등장 시 기존 row 를 복구한다.
     *
     * @param recommendationType 추천 구분 문자열
     * @param indoorCapacity 실내기 용량, HOME_MULTI 는 null
     * @param indoorCount 실내기 대수, MULTI_HEATING_COOLING 은 null
     * @param outdoorHp 실외기 마력
     * @return 활성/비활성 포함 기존 row
     */
    @Query(value = """
            SELECT *
             FROM odu_recommendation_lookup
             WHERE recommendation_type = :recommendationType
               AND indoor_capacity IS NOT DISTINCT FROM :indoorCapacity
               AND indoor_count IS NOT DISTINCT FROM :indoorCount
               AND outdoor_hp = :outdoorHp
             LIMIT 1
            """, nativeQuery = true)
    Optional<OduRecommendationLookup> findAnyByNaturalKeyIncludingDeleted(
            @Param("recommendationType") String recommendationType,
            @Param("indoorCapacity") BigDecimal indoorCapacity,
            @Param("indoorCount") Integer indoorCount,
            @Param("outdoorHp") String outdoorHp);
}
