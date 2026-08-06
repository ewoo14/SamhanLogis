package com.samhanair.logis.slip.estimate.repository;

import com.samhanair.logis.slip.estimate.domain.EstimateLine;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** 견적 라인 — 헤더 cascade 로 대부분 처리되지만, 직접 조회 용도. */
public interface EstimateLineRepository extends JpaRepository<EstimateLine, UUID> {

    /** 삭제된 견적 복원 시 라인 그래프를 부분 복원하지 않도록 전체 라인을 읽는다. */
    @org.springframework.data.jpa.repository.Query(
            value = "SELECT * FROM estimate_lines WHERE estimate_id = :estimateId ORDER BY line_no",
            nativeQuery = true)
    List<EstimateLine> findAllIncludingDeletedByEstimateId(
            @org.springframework.data.repository.query.Param("estimateId") UUID estimateId);

    List<EstimateLine> findByEstimateIdAndIsDeletedFalseOrderByLineNoAsc(UUID estimateId);
}
