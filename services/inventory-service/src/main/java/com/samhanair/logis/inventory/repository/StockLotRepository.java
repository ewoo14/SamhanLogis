package com.samhanair.logis.inventory.repository;

import com.samhanair.logis.inventory.domain.StockLot;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * StockLot 조회 — FIFO 차감용 native query 와 paged search 를 함께 제공.
 * Soft-delete 는 {@link StockLot @SQLRestriction} 으로 엔티티 레벨에서 처리한다.
 */
public interface StockLotRepository extends JpaRepository<StockLot, UUID> {

    long countByLotNoAndIsDeletedFalse(String lotNo);

    /**
     * FIFO 차감 후보 lot 들을 받는다 — AVAILABLE 상태 + soft-delete 제외 + receivedAt ASC 정렬.
     * StockService.deduct 가 순회하며 가장 오래된 lot 부터 소진. SOLD_OUT/IN_TRANSIT 은 제외.
     *
     * <p>Native query 사용 이유: status='AVAILABLE' literal 비교 + ORDER BY 명시로 옵티마이저 안정성 확보.
     *
     * @param productId 제품 UUID
     * @param warehouseId 창고 UUID
     * @return AVAILABLE lot 들의 receivedAt ASC 리스트 (없으면 빈 리스트)
     */
    @Query(value = """
            SELECT * FROM stock_lots
            WHERE product_id = :pid
              AND warehouse_id = :wid
              AND status = 'AVAILABLE'
              AND is_deleted = false
            ORDER BY received_at ASC
            """,
           nativeQuery = true)
    List<StockLot> findAvailableLotsForFifo(@Param("pid") UUID productId,
                                            @Param("wid") UUID warehouseId);

    Page<StockLot> findAllByWarehouse_IdAndIsDeletedFalse(UUID warehouseId, Pageable pageable);

    Page<StockLot> findAllByProductIdAndIsDeletedFalse(UUID productId, Pageable pageable);

    Page<StockLot> findAllByProductIdAndWarehouse_IdAndIsDeletedFalse(
            UUID productId, UUID warehouseId, Pageable pageable);

    /**
     * 같은 품목·창고·입고전표번호의 기존 lot — 검수/전표 두 입고 경로 교차 멱등 가드용.
     *
     * @param productId 품목 UUID
     * @param warehouseId 창고 UUID
     * @param lotNo 입고전표번호
     * @return 기존 활성 lot (없으면 empty)
     */
    Optional<StockLot> findFirstByProductIdAndWarehouse_IdAndLotNoAndIsDeletedFalse(
            UUID productId, UUID warehouseId, String lotNo);

    /** 입고전표 라인까지 포함한 교차 경로 멱등 가드. */
    Optional<StockLot> findFirstByProductIdAndWarehouse_IdAndLotNoAndInboundLineIdAndIsDeletedFalse(
            UUID productId, UUID warehouseId, String lotNo, UUID inboundLineId);
}
