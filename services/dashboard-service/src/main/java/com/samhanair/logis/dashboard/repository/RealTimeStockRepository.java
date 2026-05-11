package com.samhanair.logis.dashboard.repository;

import com.samhanair.logis.dashboard.domain.RealTimeStock;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/**
 * 실시간 재고 저장소 — productId / 창고 코드 lookup.
 */
@Repository
public interface RealTimeStockRepository extends JpaRepository<RealTimeStock, UUID> {

    Optional<RealTimeStock> findFirstByProductIdAndWarehouseCode(UUID productId, String warehouseCode);

    List<RealTimeStock> findAllByWarehouseCode(String warehouseCode);

    /** Seeder idempotent — partial unique (product_id, warehouse_code) 충돌 회피. */
    boolean existsByProductIdAndWarehouseCode(UUID productId, String warehouseCode);
}
