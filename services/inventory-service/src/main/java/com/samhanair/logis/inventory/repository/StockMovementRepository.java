package com.samhanair.logis.inventory.repository;

import com.samhanair.logis.inventory.domain.MovementType;
import com.samhanair.logis.inventory.domain.StockMovement;
import java.util.Optional;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

/** StockMovement — append-only 감사 로그 조회. soft-delete 사용 안 함 (필터 없음). */
public interface StockMovementRepository extends JpaRepository<StockMovement, UUID> {

    Page<StockMovement> findAllByLotIdOrderByOccurredAtDesc(UUID lotId, Pageable pageable);

    Page<StockMovement> findAllByProductIdOrderByOccurredAtDesc(UUID productId, Pageable pageable);

    List<StockMovement> findAllByProductIdOrderByOccurredAtAsc(UUID productId);

    Page<StockMovement> findAllByWarehouseIdOrderByOccurredAtDesc(UUID warehouseId, Pageable pageable);

    /**
     * 멱등 중복 검사 — (referenceType, referenceId, productId, movementType) 조합으로 이미
     * 기록된 movement 를 조회한다.
     *
     * <p>Phase 2.6c reserve 멱등 가드에서 호출. V14 Flyway 의 partial unique index 와
     * 쌍으로 동작하여 동일 referenceId + productId 에 대한 RESERVE movement 중복을 방지.
     *
     * @param referenceType 참조 유형 (예: "PARTNER_ORDER_CONVERT")
     * @param referenceId   참조 ID (예: convertKey UUID)
     * @param productId     제품 UUID
     * @param movementType  이벤트 종류 (RESERVE)
     * @return 이미 존재하는 movement (있으면 no-op)
     */
    Optional<StockMovement> findByReferenceTypeAndReferenceIdAndProductIdAndMovementType(
            String referenceType, UUID referenceId, UUID productId, MovementType movementType);
}
