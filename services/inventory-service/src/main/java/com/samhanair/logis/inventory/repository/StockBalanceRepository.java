package com.samhanair.logis.inventory.repository;

import com.samhanair.logis.inventory.domain.StockBalance;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

/** StockBalance — (product, warehouse) 단위 집계 조회. */
public interface StockBalanceRepository extends JpaRepository<StockBalance, UUID> {

    Optional<StockBalance> findByProductIdAndWarehouse_IdAndIsDeletedFalse(
            UUID productId, UUID warehouseId);

    Page<StockBalance> findAllByProductIdAndIsDeletedFalse(UUID productId, Pageable pageable);

    Page<StockBalance> findAllByWarehouse_IdAndIsDeletedFalse(UUID warehouseId, Pageable pageable);

    /**
     * 다중 productId 일괄 잔량 조회 — 영업원 견적 단계 다행 동시 재고 조회용.
     *
     * <p>{@code @SQLRestriction("is_deleted = false")} 가 엔티티 레벨에서 적용되므로
     * 별도 {@code AndIsDeletedFalse} suffix 가 없어도 동일 효과. 메서드 이름에는
     * 가독성/일관성 + IDE/JPA 검증을 위해 명시.
     *
     * @param productIds 조회할 제품 UUID 컬렉션 (호출자가 1~100건 사이로 제한)
     * @return 해당 제품들의 모든 활성 stock_balance row (잔량 0 row 는 제외 — DB row 자체가 없으므로)
     */
    List<StockBalance> findAllByProductIdInAndIsDeletedFalse(Collection<UUID> productIds);

}
