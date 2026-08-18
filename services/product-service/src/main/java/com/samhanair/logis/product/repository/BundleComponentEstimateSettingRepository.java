package com.samhanair.logis.product.repository;

import com.samhanair.logis.product.domain.BundleComponentEstimateSetting;
import com.samhanair.logis.product.domain.EstimateCategory;
import java.util.List;
import java.util.Collection;
import java.util.UUID;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** 카테고리별 구성품 설정 저장소. product_estimate_exposure와 의도적으로 분리한다. */
public interface BundleComponentEstimateSettingRepository
        extends JpaRepository<BundleComponentEstimateSetting, UUID> {

    List<BundleComponentEstimateSetting> findByBundleComponentIdAndEstimateCategory(
            UUID bundleComponentId, EstimateCategory estimateCategory);

    Optional<BundleComponentEstimateSetting> findByBundleComponentIdAndEstimateCategoryAndIsDeletedFalse(
            UUID bundleComponentId, EstimateCategory estimateCategory);

    List<BundleComponentEstimateSetting> findByBundleComponentIdInAndEstimateCategoryAndIsDeletedFalse(
            Collection<UUID> bundleComponentIds, EstimateCategory estimateCategory);
}
