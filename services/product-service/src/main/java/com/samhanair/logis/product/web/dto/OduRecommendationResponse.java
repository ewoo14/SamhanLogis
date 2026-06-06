package com.samhanair.logis.product.web.dto;

import com.samhanair.logis.product.domain.OduRecommendationLookup;
import com.samhanair.logis.product.domain.OduRecommendationLookup.RecommendationType;
import java.math.BigDecimal;

/** 추천 실외기 lookup 응답 — 라인 입력 참조용 비즈니스 필드만 노출한다. */
public record OduRecommendationResponse(
        RecommendationType recommendationType,
        BigDecimal indoorCapacity,
        Integer indoorCount,
        String outdoorHp
) {

    /**
     * 추천 실외기 lookup 엔티티를 응답으로 변환한다.
     *
     * @param lookup 추천 실외기 lookup 엔티티
     * @return UUID/id 를 제외한 응답
     */
    public static OduRecommendationResponse from(OduRecommendationLookup lookup) {
        return new OduRecommendationResponse(
                lookup.getRecommendationType(),
                lookup.getIndoorCapacity(),
                lookup.getIndoorCount(),
                lookup.getOutdoorHp());
    }
}
