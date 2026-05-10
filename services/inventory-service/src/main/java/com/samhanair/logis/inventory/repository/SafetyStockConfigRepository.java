package com.samhanair.logis.inventory.repository;

import com.samhanair.logis.inventory.domain.SafetyStockConfig;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 안전재고 임계값 설정 조회/저장 레포지토리 (P1-3).
 *
 * <p>{@code @SQLRestriction("is_deleted = false")} 가 엔티티 레벨에서 적용되어 soft-delete row 는
 * 자동 제외된다.
 */
public interface SafetyStockConfigRepository extends JpaRepository<SafetyStockConfig, UUID> {

    /**
     * (productId, warehouseId) 쌍으로 단건 임계값 조회.
     * warehouseId 가 null 인 경우(전체 합산 기준)도 정확히 매칭된다.
     *
     * @param productId   제품 UUID
     * @param warehouseId 창고 UUID (null = 전체 합산 기준)
     * @return 임계값 설정 Optional
     */
    Optional<SafetyStockConfig> findByProductIdAndWarehouseId(UUID productId, UUID warehouseId);

    /**
     * 특정 제품의 모든 활성 임계값 설정 목록 조회.
     *
     * @param productId 제품 UUID
     * @return 해당 제품의 SafetyStockConfig 목록
     */
    List<SafetyStockConfig> findAllByProductId(UUID productId);

}
