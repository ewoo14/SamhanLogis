package com.samhanair.logis.inventory.repository;

import com.samhanair.logis.inventory.domain.InboundInspectionLine;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * InboundInspectionLine 라인 조회 — inspectionId 기준 일괄 조회.
 *
 * <p>라인 mutation 은 헤더의 CascadeType.ALL 을 통해 처리되므로
 * 직접 save/delete 는 서비스 레이어에서 헤더를 통해 수행.
 */
public interface InboundInspectionLineRepository extends JpaRepository<InboundInspectionLine, UUID> {

    /**
     * inspectionId 기준 라인 전체 조회.
     *
     * @param inspectionId 검수 헤더 UUID
     * @return 해당 헤더의 활성 라인 리스트
     */
    List<InboundInspectionLine> findAllByInspection_IdAndIsDeletedFalse(UUID inspectionId);
}
