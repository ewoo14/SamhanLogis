package com.samhanair.logis.inventory.repository;

import com.samhanair.logis.inventory.domain.InboundInspectionLine;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * InboundInspectionLine 라인 조회 — inspectionId 기준 일괄 조회 + 품목별 DPS pivot 집계.
 *
 * <p>라인 mutation 은 헤더의 CascadeType.ALL 을 통해 처리되므로
 * 직접 save/delete 는 서비스 레이어에서 헤더를 통해 수행.
 *
 * <p>pivot 쿼리 {@link #findPivotByProductAndDateRange} 는 품목별 DPS 입고내역 비교 (P0-B GAS 보강)
 * 에 사용된다. inbound_inspections.status 에 따라 대기/완료/반품 을 구분 집계한다.
 */
public interface InboundInspectionLineRepository extends JpaRepository<InboundInspectionLine, UUID> {

    /**
     * inspectionId 기준 라인 전체 조회.
     *
     * @param inspectionId 검수 헤더 UUID
     * @return 해당 헤더의 활성 라인 리스트
     */
    List<InboundInspectionLine> findAllByInspection_IdAndIsDeletedFalse(UUID inspectionId);

    /**
     * 품목별 DPS pivot 집계 쿼리 — 기간 범위 필터.
     *
     * <p>집계 규칙:
     * <ul>
     *   <li>PENDING 검수 헤더의 라인 → pending_qty (expected_qty 합계)</li>
     *   <li>COMPLETED 검수 헤더의 라인 → completed_qty (inspected_qty - defect_qty 합계)</li>
     *   <li>COMPLETED 검수 헤더의 라인 → qc_qty (defect_qty 합계)</li>
     *   <li>CANCELED 검수 헤더의 라인 → return_qty (expected_qty 합계)</li>
     * </ul>
     *
     * <p>soft-delete 필터는 양 테이블 모두 적용. warehouseId 필터는 서비스 레이어에서
     * stock_lots 기반 model_code 필터링으로 추가 처리한다.
     *
     * @param fromDate 조회 기간 시작 (inbound_inspections.created_at &gt;= fromDate)
     * @param toDate   조회 기간 종료 (inbound_inspections.created_at &lt; toDate)
     * @return 품목별 pivot 집계 결과 리스트 (모델코드 ASC 정렬)
     */
    @Query(value = """
            SELECT
                COALESCE(il.model_code, '')  AS productCode,
                COALESCE(il.product_name, '') AS productName,
                ''                            AS warehouseCode,
                COALESCE(SUM(CASE WHEN ih.status = 'PENDING'
                                  THEN il.expected_qty ELSE 0 END), 0)             AS pendingQty,
                COALESCE(SUM(CASE WHEN ih.status = 'COMPLETED'
                                  THEN COALESCE(il.inspected_qty, 0)
                                       - COALESCE(il.defect_qty, 0)
                                  ELSE 0 END), 0)                                  AS completedQty,
                COALESCE(SUM(CASE WHEN ih.status = 'COMPLETED'
                                  THEN COALESCE(il.defect_qty, 0) ELSE 0 END), 0)  AS qcQty,
                COALESCE(SUM(CASE WHEN ih.status = 'CANCELED'
                                  THEN il.expected_qty ELSE 0 END), 0)             AS returnQty
            FROM inbound_inspection_lines il
            INNER JOIN inbound_inspections ih
                ON il.inspection_id = ih.id
               AND ih.is_deleted = false
            WHERE il.is_deleted = false
              AND ih.created_at >= :fromDate
              AND ih.created_at < :toDate
            GROUP BY il.model_code, il.product_name
            ORDER BY il.model_code ASC NULLS LAST
            """,
            nativeQuery = true)
    List<DpsByProductPivotRow> findPivotByProductAndDateRange(
            @Param("fromDate") LocalDateTime fromDate,
            @Param("toDate") LocalDateTime toDate);
}
