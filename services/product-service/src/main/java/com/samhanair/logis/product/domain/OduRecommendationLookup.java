package com.samhanair.logis.product.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 추천 실외기 lookup — 추천실외기 시트 row 3~26 = 24 row.
 *
 * <p>출처: Migration Plan §2.1.6. row 1 그룹 헤더 ('멀티 냉난방' / '홈멀티') 기반 분리.
 */
@Entity
@Getter
@Table(name = "odu_recommendation_lookup")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class OduRecommendationLookup extends BaseEntity {

    public enum RecommendationType {MULTI_HEATING_COOLING, HOME_MULTI}

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Enumerated(EnumType.STRING)
    @Column(name = "recommendation_type", nullable = false, length = 32)
    private RecommendationType recommendationType;

    /** 실내기 용량 (kW or 평형). HOME_MULTI 시트 row 는 실값이 없으므로 null 허용. */
    @Column(name = "indoor_capacity", precision = 8, scale = 2)
    private BigDecimal indoorCapacity;

    /** 홈멀티 D열 (실내기 대수). */
    @Column(name = "indoor_count")
    private Integer indoorCount;

    /** 실외기 마력 ("5HP"). */
    @Column(name = "outdoor_hp", nullable = false, length = 8)
    private String outdoorHp;

    private OduRecommendationLookup(RecommendationType recommendationType,
                                    BigDecimal indoorCapacity, Integer indoorCount, String outdoorHp) {
        this.recommendationType = recommendationType;
        this.indoorCapacity = indoorCapacity;
        this.indoorCount = indoorCount;
        this.outdoorHp = outdoorHp;
    }

    public static OduRecommendationLookup seed(RecommendationType recommendationType,
                                               BigDecimal indoorCapacity, Integer indoorCount,
                                               String outdoorHp) {
        if (recommendationType == null) throw new IllegalArgumentException("recommendationType 필수");
        if (indoorCapacity == null && indoorCount == null)
            throw new IllegalArgumentException("indoorCapacity 또는 indoorCount 필수");
        if (outdoorHp == null || outdoorHp.isBlank()) throw new IllegalArgumentException("outdoorHp 필수");
        return new OduRecommendationLookup(recommendationType, indoorCapacity, indoorCount, outdoorHp);
    }

    /**
     * 시트 sync update — 추천 타입 natural key 행의 실측 컬럼을 그대로 반영한다.
     *
     * @param indoorCapacity A열 용량, HOME_MULTI 는 null
     * @param indoorCount C/D열 실내기 대수, MULTI_HEATING_COOLING 은 null
     * @param outdoorHp B/E열 마력
     */
    public void updateFromSheet(BigDecimal indoorCapacity, Integer indoorCount, String outdoorHp) {
        if (indoorCapacity == null && indoorCount == null)
            throw new IllegalArgumentException("indoorCapacity 또는 indoorCount 필수");
        if (outdoorHp == null || outdoorHp.isBlank()) throw new IllegalArgumentException("outdoorHp 필수");
        this.indoorCapacity = indoorCapacity;
        this.indoorCount = indoorCount;
        this.outdoorHp = outdoorHp;
    }
}
