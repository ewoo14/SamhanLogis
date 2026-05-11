package com.samhanair.logis.inventory.repository;

/**
 * 품목별 DPS pivot 집계 조회용 Spring Data Projection.
 *
 * <p>JPA 네이티브 쿼리 결과를 {@link InboundInspectionLineRepository#findPivotByProductAndDateRange}
 * 가 이 인터페이스로 매핑한다. 각 메서드는 SQL 컬럼 alias 에 대응한다.
 *
 * <p>UUID 비공개 원칙 준수 — productCode / productName 만 노출, productId UUID 는 제외.
 *
 * <p>warehouseCode 는 현재 스키마(MSA 경계 — inbound_inspections 에 warehouse_id 없음)에서
 * 직접 JOIN 불가하므로 서비스 레이어에서 warehouseId 필터를 stock_lots 기반으로 처리한다.
 */
public interface DpsByProductPivotRow {

    /**
     * 모델코드 (품번) — inbound_inspection_lines.model_code snapshot.
     *
     * @return 모델코드 (NULL 가능)
     */
    String getProductCode();

    /**
     * 제품명 — inbound_inspection_lines.product_name snapshot.
     *
     * @return 제품명 (NULL 가능)
     */
    String getProductName();

    /**
     * 입고대기 수량 합계 — status = PENDING 인 검수 헤더의 라인 expected_qty 합계.
     *
     * @return 대기 수량 (0 이상)
     */
    long getPendingQty();

    /**
     * 검수 완료 수량 합계 — status = COMPLETED 인 검수 헤더의 라인 inspected_qty - defect_qty 합계.
     *
     * @return 완료 수량 (0 이상)
     */
    long getCompletedQty();

    /**
     * 품질검사(QC) 수량 합계 — 불량 수량(defect_qty) 합계. COMPLETED 라인에서 집계.
     *
     * @return 품질검사 수량 (0 이상)
     */
    long getQcQty();

    /**
     * 반품 수량 합계 — status = CANCELED 인 검수 헤더의 라인 expected_qty 합계.
     *
     * @return 반품 수량 (0 이상, 응답 DTO 에서 음수 변환)
     */
    long getReturnQty();
}
