package com.samhanair.logis.inventory.web.dto;

import java.time.Instant;
import java.util.List;

/**
 * 품목별 DPS pivot 분석 응답 DTO — GET /api/v1/warehouse/audit/dps-compare/by-product (P0-B).
 *
 * <p>legacy GAS 16번 (품목별 DPS 입고내역 비교) 의 GAS 보강 슬라이스. FE 는 본 응답을
 * 상품코드 × 입고단계(대기/완료/품질검사/반품) 피벗 테이블로 렌더한다.
 *
 * @param totalProductCount 집계된 품목 수 (rows.size())
 * @param rows              품목별 pivot 행 리스트 (productCode ASC 정렬)
 * @param generatedAt       응답 생성 시각 (ISO-8601 UTC)
 */
public record DpsByProductResponse(
        int totalProductCount,
        List<DpsByProductRow> rows,
        Instant generatedAt) {

    /**
     * 행 리스트로부터 응답을 생성한다.
     *
     * @param rows 품목별 pivot 행 리스트
     * @return DpsByProductResponse (generatedAt = now)
     */
    public static DpsByProductResponse of(List<DpsByProductRow> rows) {
        return new DpsByProductResponse(rows.size(), rows, Instant.now());
    }
}
