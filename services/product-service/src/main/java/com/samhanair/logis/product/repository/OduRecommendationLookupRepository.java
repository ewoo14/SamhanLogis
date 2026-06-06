package com.samhanair.logis.product.repository;

import com.samhanair.logis.product.domain.OduRecommendationLookup;
import com.samhanair.logis.product.domain.OduRecommendationLookup.RecommendationType;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** OduRecommendationLookup CRUD + recommendationType + indoorCapacity 매트릭스. */
public interface OduRecommendationLookupRepository extends JpaRepository<OduRecommendationLookup, UUID> {

    List<OduRecommendationLookup> findByRecommendationTypeOrderByIndoorCapacityAsc(RecommendationType type);

    List<OduRecommendationLookup> findAllByOrderByRecommendationTypeAscIndoorCapacityAsc();
}
