package com.samhanair.logis.inventory.repository;

import com.samhanair.logis.inventory.domain.StockBalance;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** StockBalance — (product, warehouse) 단위 집계 조회. */
public interface StockBalanceRepository extends JpaRepository<StockBalance, UUID> {

    Optional<StockBalance> findByProductIdAndWarehouse_IdAndIsDeletedFalse(
            UUID productId, UUID warehouseId);

    @EntityGraph(attributePaths = "warehouse")
    @Query(
            value = """
                    SELECT b
                    FROM StockBalance b
                    WHERE b.productId = :productId
                      AND b.isDeleted = false
                    """,
            countQuery = """
                    SELECT COUNT(b)
                    FROM StockBalance b
                    WHERE b.productId = :productId
                      AND b.isDeleted = false
                    """)
    Page<StockBalance> findAllByProductIdAndIsDeletedFalse(@Param("productId") UUID productId, Pageable pageable);

    /**
     * 품목/창고 선택 필터로 재고 현황 페이지를 조회한다. 두 필터가 모두 null이면 전체 현황이다.
     * 창고 연관은 DTO 변환 전에 fetch graph 로 읽어 LAZY 초기화 오류와 N+1을 막는다.
     *
     * @param productId 선택 품목 UUID (선택)
     * @param warehouseId 선택 창고 UUID (선택)
     * @param pageable 페이지 조건
     * @return 활성 재고 잔량 페이지
     */
    @EntityGraph(attributePaths = "warehouse")
    @Query(
            value = """
                    SELECT b
                    FROM StockBalance b
                    WHERE b.isDeleted = false
                      AND (:productId IS NULL OR b.productId = :productId)
                      AND (:warehouseId IS NULL OR b.warehouse.id = :warehouseId)
                    ORDER BY b.productId ASC, b.warehouse.code ASC
                    """,
            countQuery = """
                    SELECT COUNT(b)
                    FROM StockBalance b
                    WHERE b.isDeleted = false
                      AND (:productId IS NULL OR b.productId = :productId)
                      AND (:warehouseId IS NULL OR b.warehouse.id = :warehouseId)
                    """)
    Page<StockBalance> findBalancePage(@Param("productId") UUID productId,
                                       @Param("warehouseId") UUID warehouseId,
                                       Pageable pageable);

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
    @EntityGraph(attributePaths = "warehouse")
    List<StockBalance> findAllByProductIdInAndIsDeletedFalse(Collection<UUID> productIds);

}
