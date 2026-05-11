package com.samhanair.logis.inventory.web.dto;

import com.samhanair.logis.inventory.repository.DpsByProductPivotRow;

/**
 * 품목별 DPS pivot 단일 행 응답 DTO — GET /api/v1/warehouse/audit/dps-compare/by-product (P0-B).
 *
 * <p>UUID 비공개 원칙 준수 — productCode / productName 비즈니스 식별자만 노출.
 *
 * @param productCode  모델코드 (품번) — 사용자 노출 식별자
 * @param productName  제품명 — 사용자 노출 식별자
 * @param pendingQty   입고대기 수량 (PENDING 검수 헤더 expected_qty 합계)
 * @param completedQty 완료 수량 (COMPLETED 검수 헤더 inspected_qty - defect_qty 합계)
 * @param qcQty        품질검사 수량 (COMPLETED 검수 헤더 defect_qty 합계)
 * @param returnQty    반품 수량 (CANCELED 검수 헤더 expected_qty 합계, 음수로 표현)
 * @param totalQty     합계 (completedQty - qcQty - returnQty + pendingQty)
 * @param diffFromDps  DPS 데이터와의 차이 (자체 totalQty - DPS 집계, 현재 0 반환, 추후 DPS 연동 확장)
 */
public record DpsByProductRow(
        String productCode,
        String productName,
        int pendingQty,
        int completedQty,
        int qcQty,
        int returnQty,
        int totalQty,
        int diffFromDps) {

    /**
     * {@link DpsByProductPivotRow} projection 으로부터 DTO 를 생성한다.
     *
     * <p>returnQty 는 CANCELED 수량이므로 음수(-returnQty) 로 변환.
     * totalQty = pendingQty + completedQty + qcQty + returnQty(음수)
     * diffFromDps = 현재 슬라이스에서는 0 (DPS 엑셀 연동은 P0-B Step-2 에서 확장).
     *
     * @param row JPA 네이티브 쿼리 projection
     * @return 변환된 DpsByProductRow DTO
     */
    public static DpsByProductRow from(DpsByProductPivotRow row) {
        int pending   = (int) row.getPendingQty();
        int completed = (int) row.getCompletedQty();
        int qc        = (int) row.getQcQty();
        int ret       = -(int) row.getReturnQty();  // 반품 음수 표현
        int total     = pending + completed + qc + ret;
        return new DpsByProductRow(
                row.getProductCode(),
                row.getProductName(),
                pending,
                completed,
                qc,
                ret,
                total,
                0   // diffFromDps: DPS 엑셀 연동 Step-2 에서 확장
        );
    }
}
